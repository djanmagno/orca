import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { translate } from '@/i18n/i18n'
import type {
  AiSweFactoryConnectionStatus,
  FactoryEvent,
  FactoryTaskDetail
} from '../../../../shared/ai-swe-factory-types'
import type { FactoryBoardColumnView } from '@/components/right-sidebar/ai-swe-factory-board-state'
import { groupFactoryBoard } from '@/components/right-sidebar/ai-swe-factory-board-state'
import {
  aiSweFactoryGetTaskDetail,
  aiSweFactorySaveConnection,
  aiSweFactorySetEnabled,
  aiSweFactoryStatus,
  subscribeAiSweFactoryEvents
} from '@/runtime/runtime-ai-swe-factory-client'
import { aiSweFactoryGetBoard } from '@/runtime/runtime-ai-swe-factory-client'
import { hasRuntimeRpcErrorCode } from '@/runtime/runtime-rpc-client'
import type { StateCreator } from 'zustand'
import type { AppState } from '../types'

const BOARD_REFRESH_DEBOUNCE_MS = 300
// Why these four: task.created/state_changed/cancelled move a card between columns, and
// board.synced is the server's explicit "state may have drifted, refetch" signal. run.*/
// pipeline.* events never change which column a task sits in.
const BOARD_REFRESH_EVENT_TYPES = new Set<FactoryEvent['type']>([
  'task.created',
  'task.state_changed',
  'task.cancelled',
  'board.synced'
])

export type AiSweFactorySlice = {
  aiSweFactoryStatus: AiSweFactoryConnectionStatus
  aiSweFactoryStatusContextKey: string | null
  getAiSweFactoryStatus: () => Promise<AiSweFactoryConnectionStatus>
  saveAiSweFactoryConnection: (args: {
    baseUrl: string
    apiKey?: string | null
  }) => Promise<AiSweFactoryConnectionStatus>
  setAiSweFactoryEnabled: (enabled: boolean) => Promise<AiSweFactoryConnectionStatus>
  aiSweFactoryBoard: FactoryBoardColumnView[] | null
  aiSweFactoryBoardError: string | null
  loadAiSweFactoryBoard: () => Promise<void>
  aiSweFactorySelectedTaskId: string | null
  aiSweFactoryTaskDetail: FactoryTaskDetail | null
  aiSweFactoryTaskDetailError: string | null
  openAiSweFactoryTaskDetail: (id: string) => Promise<void>
  closeAiSweFactoryTaskDetail: () => void
  aiSweFactoryLiveUpdatesUnavailable: boolean
  syncAiSweFactoryEventSubscription: () => void
  stopAiSweFactoryEventSubscription: () => void
}

const emptyStatus: AiSweFactoryConnectionStatus = {
  configured: false,
  enabled: false,
  baseUrl: null,
  credentialError: null
}

function current(
  set: (next: Partial<AiSweFactorySlice>) => void,
  get: () => AppState,
  status: AiSweFactoryConnectionStatus,
  key: string
): AiSweFactoryConnectionStatus {
  if (getProviderRuntimeContextKey(get().settings) === key) {
    set({ aiSweFactoryStatus: status, aiSweFactoryStatusContextKey: key })
  }
  return status
}

export const createAiSweFactorySlice: StateCreator<AppState, [], [], AiSweFactorySlice> = (
  set,
  get
) => {
  let taskDetailAbortController: AbortController | null = null
  let eventSubscription: { contextKey: string; unsubscribe: () => void } | null = null
  let eventSubscriptionContextKey: string | null = null
  let refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null
  // Why: bumped by every teardown/start so a subscribe promise from a superseded attempt
  // (e.g. stop+sync fired again, same runtime key, before the first promise settled — a
  // real sequence on rapid tab remount) unsubscribes itself instead of overwriting the
  // slot and orphaning the newer subscription's cleanup.
  let subscriptionAttempt = 0

  const clearRefreshDebounce = (): void => {
    if (refreshDebounceTimer) {
      clearTimeout(refreshDebounceTimer)
      refreshDebounceTimer = null
    }
  }

  const teardownEventSubscription = (): void => {
    subscriptionAttempt += 1
    clearRefreshDebounce()
    eventSubscription?.unsubscribe()
    eventSubscription = null
    eventSubscriptionContextKey = null
  }

  const startEventSubscription = (key: string): void => {
    set({ aiSweFactoryLiveUpdatesUnavailable: false })
    const attempt = ++subscriptionAttempt
    eventSubscriptionContextKey = key
    void subscribeAiSweFactoryEvents(
      get().settings,
      (event) => {
        if (attempt !== subscriptionAttempt) {
          return
        }
        if (getProviderRuntimeContextKey(get().settings) !== key) {
          return
        }
        if (!BOARD_REFRESH_EVENT_TYPES.has(event.type)) {
          return
        }
        clearRefreshDebounce()
        refreshDebounceTimer = setTimeout(() => {
          refreshDebounceTimer = null
          if (getProviderRuntimeContextKey(get().settings) === key) {
            void get().loadAiSweFactoryBoard()
          }
        }, BOARD_REFRESH_DEBOUNCE_MS)
      },
      (error) => {
        if (attempt !== subscriptionAttempt) {
          return
        }
        if (getProviderRuntimeContextKey(get().settings) !== key) {
          return
        }
        if (hasRuntimeRpcErrorCode(error, 'method_not_found')) {
          set({ aiSweFactoryLiveUpdatesUnavailable: true })
        }
      },
      () => {
        // Why: a dropped remote transport must not update stale state — clear the
        // subscription slot only if it is still the one that closed, then retry once
        // the caller's next sync (mount effect / runtime-context change) fires again.
        if (attempt === subscriptionAttempt && eventSubscriptionContextKey === key) {
          eventSubscription = null
          eventSubscriptionContextKey = null
        }
      }
    )
      .then((subscription) => {
        if (attempt !== subscriptionAttempt) {
          // A newer attempt superseded this one while it was in flight — this
          // subscription was never recorded anywhere else, so drop it here or it leaks.
          subscription.unsubscribe()
          return
        }
        eventSubscription = { contextKey: key, unsubscribe: subscription.unsubscribe }
      })
      .catch(() => {
        if (attempt === subscriptionAttempt && eventSubscriptionContextKey === key) {
          eventSubscriptionContextKey = null
        }
      })
  }

  return {
    aiSweFactoryStatus: emptyStatus,
    aiSweFactoryStatusContextKey: null,
    aiSweFactoryBoard: null,
    aiSweFactoryBoardError: null,
    aiSweFactorySelectedTaskId: null,
    aiSweFactoryTaskDetail: null,
    aiSweFactoryTaskDetailError: null,
    aiSweFactoryLiveUpdatesUnavailable: false,
    getAiSweFactoryStatus: async () => {
      const key = getProviderRuntimeContextKey(get().settings)
      return current(set, get, await aiSweFactoryStatus(get().settings), key)
    },
    saveAiSweFactoryConnection: async (args) => {
      const key = getProviderRuntimeContextKey(get().settings)
      return current(set, get, await aiSweFactorySaveConnection(get().settings, args), key)
    },
    setAiSweFactoryEnabled: async (enabled) => {
      const key = getProviderRuntimeContextKey(get().settings)
      return current(set, get, await aiSweFactorySetEnabled(get().settings, enabled), key)
    },
    loadAiSweFactoryBoard: async () => {
      const key = getProviderRuntimeContextKey(get().settings)
      try {
        const board = await aiSweFactoryGetBoard(get().settings)
        if (getProviderRuntimeContextKey(get().settings) === key) {
          set({ aiSweFactoryBoard: groupFactoryBoard(board.columns), aiSweFactoryBoardError: null })
        }
      } catch {
        if (getProviderRuntimeContextKey(get().settings) === key) {
          set({
            aiSweFactoryBoardError: translate(
              'auto.store.slices.aiSweFactory.boardLoadError',
              'Unable to load the AI SWE Factory board.'
            )
          })
        }
      }
    },
    openAiSweFactoryTaskDetail: async (id) => {
      taskDetailAbortController?.abort()
      const controller = new AbortController()
      taskDetailAbortController = controller
      const key = getProviderRuntimeContextKey(get().settings)
      set({
        aiSweFactorySelectedTaskId: id,
        aiSweFactoryTaskDetail: null,
        aiSweFactoryTaskDetailError: null
      })
      try {
        const detail = await aiSweFactoryGetTaskDetail(get().settings, id, controller.signal)
        if (controller.signal.aborted || getProviderRuntimeContextKey(get().settings) !== key) {
          return
        }
        set({ aiSweFactoryTaskDetail: detail, aiSweFactoryTaskDetailError: null })
      } catch {
        if (controller.signal.aborted || getProviderRuntimeContextKey(get().settings) !== key) {
          return
        }
        set({
          aiSweFactoryTaskDetailError: translate(
            'auto.store.slices.aiSweFactory.taskDetailLoadError',
            'Unable to load AI SWE Factory task.'
          )
        })
      }
    },
    closeAiSweFactoryTaskDetail: () => {
      taskDetailAbortController?.abort()
      taskDetailAbortController = null
      set({
        aiSweFactorySelectedTaskId: null,
        aiSweFactoryTaskDetail: null,
        aiSweFactoryTaskDetailError: null
      })
    },
    syncAiSweFactoryEventSubscription: () => {
      const key = getProviderRuntimeContextKey(get().settings)
      if (eventSubscriptionContextKey === key) {
        return
      }
      teardownEventSubscription()
      startEventSubscription(key)
    },
    stopAiSweFactoryEventSubscription: () => {
      teardownEventSubscription()
    }
  }
}
