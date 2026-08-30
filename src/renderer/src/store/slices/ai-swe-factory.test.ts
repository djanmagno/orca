import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import type { AiSweFactoryConnectionStatus } from '../../../../shared/ai-swe-factory-types'
import { createAiSweFactorySlice } from './ai-swe-factory'

const {
  aiSweFactoryStatus,
  aiSweFactorySaveConnection,
  aiSweFactorySetEnabled,
  aiSweFactoryGetBoard,
  aiSweFactoryGetTaskDetail,
  subscribeAiSweFactoryEvents
} = vi.hoisted(() => ({
  aiSweFactoryStatus: vi.fn(),
  aiSweFactorySaveConnection: vi.fn(),
  aiSweFactorySetEnabled: vi.fn(),
  aiSweFactoryGetBoard: vi.fn(),
  aiSweFactoryGetTaskDetail: vi.fn(),
  subscribeAiSweFactoryEvents: vi.fn()
}))

vi.mock('@/runtime/runtime-ai-swe-factory-client', () => ({
  aiSweFactoryStatus: (...args: unknown[]) => aiSweFactoryStatus(...args),
  aiSweFactorySaveConnection: (...args: unknown[]) => aiSweFactorySaveConnection(...args),
  aiSweFactorySetEnabled: (...args: unknown[]) => aiSweFactorySetEnabled(...args),
  aiSweFactoryGetBoard: (...args: unknown[]) => aiSweFactoryGetBoard(...args),
  aiSweFactoryGetTaskDetail: (...args: unknown[]) => aiSweFactoryGetTaskDetail(...args),
  subscribeAiSweFactoryEvents: (...args: unknown[]) => subscribeAiSweFactoryEvents(...args)
}))

function testStore() {
  return create<AppState>()(
    (...args) => ({ settings: null, ...createAiSweFactorySlice(...args) }) as AppState
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

const local: AiSweFactoryConnectionStatus = {
  configured: true,
  enabled: false,
  baseUrl: 'http://local.test',
  credentialError: null
}
const remote: AiSweFactoryConnectionStatus = {
  configured: true,
  enabled: true,
  baseUrl: 'https://remote.test',
  credentialError: null
}

describe('AI SWE Factory connection slice', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not reuse status from the prior runtime after a runtime switch', async () => {
    const store = testStore()
    const localRead = deferred<AiSweFactoryConnectionStatus>()
    const remoteRead = deferred<AiSweFactoryConnectionStatus>()
    aiSweFactoryStatus
      .mockReturnValueOnce(localRead.promise)
      .mockReturnValueOnce(remoteRead.promise)

    const firstRead = store.getState().getAiSweFactoryStatus()
    store.setState({ settings: { activeRuntimeEnvironmentId: 'runtime-b' } as never })
    const secondRead = store.getState().getAiSweFactoryStatus()
    remoteRead.resolve(remote)
    await secondRead
    localRead.resolve(local)
    await firstRead

    expect(store.getState().aiSweFactoryStatus).toEqual(remote)
    expect(store.getState().aiSweFactoryStatusContextKey).toBe('runtime:runtime-b#0')
  })

  it('discards a board response from the runtime that was active when loading began', async () => {
    const store = testStore()
    const pending = deferred<{ columns: never[] }>()
    aiSweFactoryGetBoard.mockReturnValue(pending.promise)

    const loading = store.getState().loadAiSweFactoryBoard()
    store.setState({ settings: { activeRuntimeEnvironmentId: 'runtime-b' } as never })
    pending.resolve({ columns: [] })
    await loading

    expect(store.getState().aiSweFactoryBoard).toBeNull()
  })

  it('loads a task detail and exposes it as the selected task', async () => {
    const store = testStore()
    aiSweFactoryGetTaskDetail.mockResolvedValue({
      task: { id: 'TASK-1', title: 'First' },
      runs: []
    })

    await store.getState().openAiSweFactoryTaskDetail('TASK-1')

    expect(store.getState().aiSweFactorySelectedTaskId).toBe('TASK-1')
    expect(store.getState().aiSweFactoryTaskDetail).toEqual({
      task: { id: 'TASK-1', title: 'First' },
      runs: []
    })
    expect(store.getState().aiSweFactoryTaskDetailError).toBeNull()
  })

  it('discards a task detail response from the runtime that was active when loading began', async () => {
    const store = testStore()
    const pending = deferred<{ task: { id: string }; runs: never[] }>()
    aiSweFactoryGetTaskDetail.mockReturnValue(pending.promise)

    const loading = store.getState().openAiSweFactoryTaskDetail('TASK-1')
    store.setState({ settings: { activeRuntimeEnvironmentId: 'runtime-b' } as never })
    pending.resolve({ task: { id: 'TASK-1' }, runs: [] })
    await loading

    expect(store.getState().aiSweFactoryTaskDetail).toBeNull()
  })

  it('aborts the pending fetch for the previous task when a new task is opened', async () => {
    const store = testStore()
    let firstSignal: AbortSignal | undefined
    aiSweFactoryGetTaskDetail.mockImplementationOnce(
      (_settings: unknown, _id: string, signal?: AbortSignal) => {
        firstSignal = signal
        return new Promise(() => {})
      }
    )
    aiSweFactoryGetTaskDetail.mockResolvedValueOnce({ task: { id: 'TASK-2' }, runs: [] })

    void store.getState().openAiSweFactoryTaskDetail('TASK-1')
    await store.getState().openAiSweFactoryTaskDetail('TASK-2')

    expect(firstSignal?.aborted).toBe(true)
    expect(store.getState().aiSweFactorySelectedTaskId).toBe('TASK-2')
    expect(store.getState().aiSweFactoryTaskDetail).toEqual({ task: { id: 'TASK-2' }, runs: [] })
  })

  it('aborts the pending fetch and clears state when the detail is closed', async () => {
    const store = testStore()
    let signal: AbortSignal | undefined
    aiSweFactoryGetTaskDetail.mockImplementation(
      (_settings: unknown, _id: string, s?: AbortSignal) => {
        signal = s
        return new Promise(() => {})
      }
    )

    void store.getState().openAiSweFactoryTaskDetail('TASK-1')
    store.getState().closeAiSweFactoryTaskDetail()

    expect(signal?.aborted).toBe(true)
    expect(store.getState().aiSweFactorySelectedTaskId).toBeNull()
    expect(store.getState().aiSweFactoryTaskDetail).toBeNull()
  })

  it('surfaces a generic error when loading task detail fails', async () => {
    const store = testStore()
    aiSweFactoryGetTaskDetail.mockRejectedValue(new Error('https://factory.test?api_key=secret'))

    await store.getState().openAiSweFactoryTaskDetail('TASK-1')

    expect(store.getState().aiSweFactoryTaskDetailError).toBe('Unable to load AI SWE Factory task.')
  })
})

describe('AI SWE Factory live event subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  function pendingSubscription() {
    let onEvent!: (event: { type: string }) => void
    let onError!: (error: unknown) => void
    let onClose!: () => void
    const unsubscribe = vi.fn()
    const ready = new Promise<{ unsubscribe: () => void }>((resolve) => {
      subscribeAiSweFactoryEvents.mockImplementation(
        (
          _settings: unknown,
          event: typeof onEvent,
          error: typeof onError,
          close: typeof onClose
        ) => {
          onEvent = event
          onError = error
          onClose = close
          return Promise.resolve({ unsubscribe }).then((value) => {
            resolve(value)
            return value
          })
        }
      )
    })
    return {
      ready,
      unsubscribe,
      emitEvent: (event: { type: string }) => onEvent(event),
      emitError: (error: unknown) => onError(error),
      emitClose: () => onClose()
    }
  }

  it('does not re-subscribe when called again with an unchanged runtime context', async () => {
    const store = testStore()
    pendingSubscription()

    store.getState().syncAiSweFactoryEventSubscription()
    await Promise.resolve()
    store.getState().syncAiSweFactoryEventSubscription()

    expect(subscribeAiSweFactoryEvents).toHaveBeenCalledOnce()
  })

  it('tears down the previous subscription and opens a new one after a runtime switch', async () => {
    const store = testStore()
    const first = pendingSubscription()
    store.getState().syncAiSweFactoryEventSubscription()
    await first.ready

    const second = pendingSubscription()
    store.setState({ settings: { activeRuntimeEnvironmentId: 'runtime-b' } as never })
    store.getState().syncAiSweFactoryEventSubscription()
    await second.ready

    expect(first.unsubscribe).toHaveBeenCalledOnce()
    expect(subscribeAiSweFactoryEvents).toHaveBeenCalledTimes(2)
  })

  it('debounces a board reload after a column-relevant event', async () => {
    const store = testStore()
    const subscription = pendingSubscription()
    aiSweFactoryGetBoard.mockResolvedValue({ columns: [] })
    store.getState().syncAiSweFactoryEventSubscription()
    await subscription.ready

    subscription.emitEvent({ type: 'task.state_changed' })
    expect(aiSweFactoryGetBoard).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)

    expect(aiSweFactoryGetBoard).toHaveBeenCalledOnce()
  })

  it('ignores run/pipeline events that never move a card between columns', async () => {
    const store = testStore()
    const subscription = pendingSubscription()
    aiSweFactoryGetBoard.mockResolvedValue({ columns: [] })
    store.getState().syncAiSweFactoryEventSubscription()
    await subscription.ready

    subscription.emitEvent({ type: 'run.output' })
    await vi.advanceTimersByTimeAsync(300)

    expect(aiSweFactoryGetBoard).not.toHaveBeenCalled()
  })

  it('flags live updates as unavailable when the remote host predates this RPC method', async () => {
    const store = testStore()
    const subscription = pendingSubscription()
    store.getState().syncAiSweFactoryEventSubscription()
    await subscription.ready

    subscription.emitError({
      code: 'method_not_found',
      message: 'Unknown method: aiSweFactory.events.subscribe'
    })

    expect(store.getState().aiSweFactoryLiveUpdatesUnavailable).toBe(true)
  })

  it('resubscribes on the next sync after the transport reports it closed', async () => {
    const store = testStore()
    const first = pendingSubscription()
    store.getState().syncAiSweFactoryEventSubscription()
    await first.ready

    first.emitClose()
    const second = pendingSubscription()
    store.getState().syncAiSweFactoryEventSubscription()
    await second.ready

    expect(subscribeAiSweFactoryEvents).toHaveBeenCalledTimes(2)
  })

  it('unsubscribes a stale in-flight subscribe instead of letting it orphan a same-key restart', async () => {
    const store = testStore()
    const first = pendingSubscription()
    store.getState().syncAiSweFactoryEventSubscription()

    // Simulate a rapid unmount/remount of the panel (e.g. switching sidebar tabs and
    // back) with no runtime change: stop tears the slot down before `first` settles,
    // then sync starts a second attempt under the same runtime context key.
    store.getState().stopAiSweFactoryEventSubscription()
    const second = pendingSubscription()
    store.getState().syncAiSweFactoryEventSubscription()

    await first.ready
    await second.ready

    expect(first.unsubscribe).toHaveBeenCalledOnce()
    expect(second.unsubscribe).not.toHaveBeenCalled()

    store.getState().stopAiSweFactoryEventSubscription()
    expect(second.unsubscribe).toHaveBeenCalledOnce()
  })

  it('unsubscribes on stop', async () => {
    const store = testStore()
    const subscription = pendingSubscription()
    store.getState().syncAiSweFactoryEventSubscription()
    await subscription.ready
    await Promise.resolve()

    store.getState().stopAiSweFactoryEventSubscription()

    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
  })
})
