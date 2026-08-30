import { z } from 'zod'
import { defineMethod, defineStreamingMethod, type RpcAnyMethod } from '../core'
import { requiredString } from '../schemas'

const SaveConnection = z.object({
  baseUrl: requiredString('Factory base URL is required'),
  apiKey: z.string().nullable().optional()
})
const SetEnabled = z.object({ enabled: z.boolean() })

let aiSweFactoryEventSubscriptionSeq = 0

export const AI_SWE_FACTORY_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'aiSweFactory.saveConnection',
    params: SaveConnection,
    handler: (params, { runtime }) => runtime.aiSweFactorySaveConnection(params)
  }),
  defineMethod({
    name: 'aiSweFactory.status',
    params: null,
    handler: (_params, { runtime }) => runtime.aiSweFactoryStatus()
  }),
  defineMethod({
    name: 'aiSweFactory.setEnabled',
    params: SetEnabled,
    handler: (params, { runtime }) => runtime.aiSweFactorySetEnabled(params.enabled)
  }),
  defineMethod({
    name: 'aiSweFactory.getBoard',
    params: null,
    handler: (_params, { runtime }) => runtime.aiSweFactoryGetBoard()
  }),
  defineMethod({
    name: 'aiSweFactory.getTaskDetail',
    params: z.object({ id: requiredString('Missing id') }),
    handler: (params, { runtime }) => runtime.aiSweFactoryGetTaskDetail(params.id)
  }),
  // Why a request-scoped id (never one fixed per connection): two concurrent subscribe
  // calls on the same connection must not silently replace one another's cleanup entry.
  defineStreamingMethod({
    name: 'aiSweFactory.events.subscribe',
    params: null,
    handler: async (_params, { runtime, connectionId, signal }, emit) => {
      await new Promise<void>((resolve) => {
        const seq = ++aiSweFactoryEventSubscriptionSeq
        const subscriptionId = `ai-swe-factory-events-${connectionId ?? 'local'}-${seq}`
        const unsubscribe = runtime.aiSweFactorySubscribeEvents((event) =>
          emit({ type: 'event', event })
        )
        runtime.registerSubscriptionCleanup(
          subscriptionId,
          () => {
            unsubscribe()
            emit({ type: 'end' })
            resolve()
          },
          connectionId
        )
        emit({ type: 'ready', subscriptionId })
        // Why (and why after 'ready'): neither transport calls the sibling
        // aiSweFactory.events.unsubscribe method on teardown — the local IPC path aborts
        // this signal directly (runtime:unsubscribe) and a dropped remote connection does
        // the same. Without this listener the cleanup above never runs: the SSE listener
        // leaks and this handler's promise never resolves. Registered after 'ready' so an
        // already-aborted signal (caught by the aborted check) still emits 'end' second,
        // keeping the observed frame order ready→end.
        if (signal?.aborted) {
          runtime.cleanupSubscription(subscriptionId)
        } else {
          signal?.addEventListener('abort', () => runtime.cleanupSubscription(subscriptionId), {
            once: true
          })
        }
      })
    }
  }),
  defineMethod({
    name: 'aiSweFactory.events.unsubscribe',
    params: z.object({ subscriptionId: requiredString('Missing subscriptionId') }),
    handler: (params, { runtime, connectionId }) => {
      const expectedPrefix = `ai-swe-factory-events-${connectionId ?? 'local'}-`
      if (!params.subscriptionId.startsWith(expectedPrefix)) {
        return { unsubscribed: false }
      }
      runtime.cleanupSubscription(params.subscriptionId)
      return { unsubscribed: true }
    }
  })
]
