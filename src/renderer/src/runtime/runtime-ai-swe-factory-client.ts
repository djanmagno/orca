import type { GlobalSettings } from '../../../shared/global-settings-types'
import type {
  AiSweFactoryConnectionStatus,
  AiSweFactoryEventStreamMessage,
  FactoryBoard,
  FactoryEvent,
  FactoryTaskDetail
} from '../../../shared/ai-swe-factory-types'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { callRuntimeRpc, getActiveRuntimeTarget } from './runtime-rpc-client'
import { getRuntimeEnvironmentRevision } from './runtime-environment-revision'

export type RuntimeAiSweFactorySettings =
  | Pick<GlobalSettings, 'activeRuntimeEnvironmentId'>
  | null
  | undefined

export async function aiSweFactoryStatus(
  settings: RuntimeAiSweFactorySettings
): Promise<AiSweFactoryConnectionStatus> {
  const target = getActiveRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<AiSweFactoryConnectionStatus>(target, 'aiSweFactory.status', undefined, {
        timeoutMs: 15_000
      })
    : window.api.aiSweFactory.status()
}

export async function aiSweFactorySaveConnection(
  settings: RuntimeAiSweFactorySettings,
  args: { baseUrl: string; apiKey?: string | null }
): Promise<AiSweFactoryConnectionStatus> {
  const target = getActiveRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<AiSweFactoryConnectionStatus>(target, 'aiSweFactory.saveConnection', args, {
        timeoutMs: 15_000
      })
    : window.api.aiSweFactory.saveConnection(args)
}

export async function aiSweFactorySetEnabled(
  settings: RuntimeAiSweFactorySettings,
  enabled: boolean
): Promise<AiSweFactoryConnectionStatus> {
  const target = getActiveRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<AiSweFactoryConnectionStatus>(
        target,
        'aiSweFactory.setEnabled',
        { enabled },
        {
          timeoutMs: 15_000
        }
      )
    : window.api.aiSweFactory.setEnabled({ enabled })
}

export async function aiSweFactoryGetBoard(
  settings: RuntimeAiSweFactorySettings
): Promise<FactoryBoard> {
  const target = getActiveRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<FactoryBoard>(target, 'aiSweFactory.getBoard', undefined, {
        timeoutMs: 15_000
      })
    : window.api.aiSweFactory.getBoard()
}

export async function aiSweFactoryGetTaskDetail(
  settings: RuntimeAiSweFactorySettings,
  id: string,
  signal?: AbortSignal
): Promise<FactoryTaskDetail> {
  const target = getActiveRuntimeTarget(settings)
  if (target.kind === 'environment') {
    return callRuntimeRpc<FactoryTaskDetail>(
      target,
      'aiSweFactory.getTaskDetail',
      { id },
      { timeoutMs: 15_000, signal }
    )
  }
  if (!signal) {
    return window.api.aiSweFactory.getTaskDetail({ id })
  }
  if (signal.aborted) {
    throw createTaskDetailAbortError()
  }
  const requestId = createBrowserUuid()
  const handleAbort = (): void => {
    void window.api.aiSweFactory.cancelTaskDetail({ requestId }).catch(() => {})
  }
  signal.addEventListener('abort', handleAbort, { once: true })
  try {
    return await window.api.aiSweFactory.getTaskDetail({ id, requestId }, signal)
  } finally {
    signal.removeEventListener('abort', handleAbort)
  }
}

function createTaskDetailAbortError(): Error {
  const error = new Error('AI SWE Factory task detail lookup aborted')
  error.name = 'AbortError'
  return error
}

export type AiSweFactoryEventSubscription = { unsubscribe: () => void }

export async function subscribeAiSweFactoryEvents(
  settings: RuntimeAiSweFactorySettings,
  onEvent: (event: FactoryEvent) => void,
  onError: (error: unknown) => void,
  onClose?: () => void
): Promise<AiSweFactoryEventSubscription> {
  const target = getActiveRuntimeTarget(settings)
  const onResponse = (response: RuntimeRpcResponse<unknown>): void => {
    if (!response.ok) {
      onError(response.error)
      return
    }
    const message = response.result as AiSweFactoryEventStreamMessage
    if (message.type === 'event') {
      onEvent(message.event)
    }
  }
  if (target.kind === 'local') {
    const handle = await window.api.runtime.subscribe(
      { method: 'aiSweFactory.events.subscribe' },
      onResponse
    )
    return { unsubscribe: handle.unsubscribe }
  }
  const handle = await window.api.runtimeEnvironments.subscribe(
    {
      selector: target.environmentId,
      method: 'aiSweFactory.events.subscribe',
      timeoutMs: 15_000,
      expectedEnvironmentPairingRevision: getRuntimeEnvironmentRevision(target.environmentId)
    },
    { onResponse, onError, onClose }
  )
  return { unsubscribe: handle.unsubscribe }
}
