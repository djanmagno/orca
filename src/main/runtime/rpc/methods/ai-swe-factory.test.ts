import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import {
  isStreamingMethod,
  type RpcContext,
  type RpcMethod,
  type RpcRequest,
  type RpcStreamingMethod
} from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { AI_SWE_FACTORY_METHODS } from './ai-swe-factory'

function request(method: string, params?: unknown): RpcRequest {
  return { id: 'request-1', authToken: 'token', method, params }
}

const subscribeEventsMethod = AI_SWE_FACTORY_METHODS.find(
  (method) => method.name === 'aiSweFactory.events.subscribe' && isStreamingMethod(method)
) as RpcStreamingMethod
const unsubscribeEventsMethod = AI_SWE_FACTORY_METHODS.find(
  (method) => method.name === 'aiSweFactory.events.unsubscribe' && !isStreamingMethod(method)
) as RpcMethod

describe('AI SWE Factory RPC methods', () => {
  it('keeps connection settings on the runtime that serves the request', async () => {
    const runtime = {
      getRuntimeId: () => 'runtime-a',
      aiSweFactorySaveConnection: vi
        .fn()
        .mockReturnValue({
          configured: true,
          enabled: false,
          baseUrl: 'https://factory.test',
          credentialError: null
        }),
      aiSweFactoryStatus: vi
        .fn()
        .mockReturnValue({
          configured: true,
          enabled: false,
          baseUrl: 'https://factory.test',
          credentialError: null
        }),
      aiSweFactorySetEnabled: vi
        .fn()
        .mockReturnValue({
          configured: true,
          enabled: true,
          baseUrl: 'https://factory.test',
          credentialError: null
        })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: AI_SWE_FACTORY_METHODS })

    await dispatcher.dispatch(
      request('aiSweFactory.saveConnection', { baseUrl: 'https://factory.test', apiKey: 'secret' })
    )
    await dispatcher.dispatch(request('aiSweFactory.status'))
    await dispatcher.dispatch(request('aiSweFactory.setEnabled', { enabled: true }))

    expect(runtime.aiSweFactorySaveConnection).toHaveBeenCalledWith({
      baseUrl: 'https://factory.test',
      apiKey: 'secret'
    })
    expect(runtime.aiSweFactoryStatus).toHaveBeenCalledOnce()
    expect(runtime.aiSweFactorySetEnabled).toHaveBeenCalledWith(true)
  })

  it('forwards getTaskDetail to the runtime that serves the request', async () => {
    const runtime = {
      getRuntimeId: () => 'runtime-a',
      aiSweFactoryGetTaskDetail: vi.fn().mockReturnValue({ task: { id: 'TASK-1' }, runs: [] })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: AI_SWE_FACTORY_METHODS })

    const response = await dispatcher.dispatch(
      request('aiSweFactory.getTaskDetail', { id: 'TASK-1' })
    )

    expect(runtime.aiSweFactoryGetTaskDetail).toHaveBeenCalledWith('TASK-1')
    expect(response).toMatchObject({ result: { task: { id: 'TASK-1' }, runs: [] } })
  })

  it('rejects getTaskDetail without an id', async () => {
    const runtime = {
      getRuntimeId: () => 'runtime-a',
      aiSweFactoryGetTaskDetail: vi.fn()
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: AI_SWE_FACTORY_METHODS })

    const response = await dispatcher.dispatch(request('aiSweFactory.getTaskDetail', {}))

    expect(runtime.aiSweFactoryGetTaskDetail).not.toHaveBeenCalled()
    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
  })
})

describe('aiSweFactory.events.subscribe', () => {
  function makeRuntime(): {
    runtime: OrcaRuntimeService
    unsubscribeCalls: string[]
  } {
    const unsubscribeCalls: string[] = []
    let nextListenerId = 0
    // Why a real cleanup map (not a bare vi.fn()): cleanupSubscription must actually invoke
    // the callback registerSubscriptionCleanup recorded, mirroring OrcaRuntimeService, so a
    // signal-abort-triggered call exercises the same path a manual registerCalls[i][1]() does.
    const cleanups = new Map<string, () => void>()
    const runtime = {
      aiSweFactorySubscribeEvents: vi.fn(() => {
        const listenerId = `listener-${nextListenerId++}`
        return () => unsubscribeCalls.push(listenerId)
      }),
      registerSubscriptionCleanup: vi.fn((subscriptionId: string, cleanup: () => void) => {
        cleanups.set(subscriptionId, cleanup)
      }),
      cleanupSubscription: vi.fn((subscriptionId: string) => {
        cleanups.get(subscriptionId)?.()
        cleanups.delete(subscriptionId)
      })
    } as unknown as OrcaRuntimeService
    return { runtime, unsubscribeCalls }
  }

  it('gives two concurrent subscriptions on the same connection distinct ids instead of one replacing the other', async () => {
    const { runtime } = makeRuntime()
    const emitA: unknown[] = []
    const emitB: unknown[] = []

    const doneA = subscribeEventsMethod.handler(
      undefined,
      { runtime, connectionId: 'conn-1' } as RpcContext,
      (message) => emitA.push(message)
    )
    const doneB = subscribeEventsMethod.handler(
      undefined,
      { runtime, connectionId: 'conn-1' } as RpcContext,
      (message) => emitB.push(message)
    )

    const readyA = emitA[0] as { type: string; subscriptionId: string }
    const readyB = emitB[0] as { type: string; subscriptionId: string }
    expect(readyA.type).toBe('ready')
    expect(readyB.type).toBe('ready')
    expect(readyA.subscriptionId).not.toBe(readyB.subscriptionId)

    const registerCalls = (runtime.registerSubscriptionCleanup as ReturnType<typeof vi.fn>).mock
      .calls
    registerCalls[0][1]()
    registerCalls[1][1]()
    await doneA
    await doneB
  })

  it('tearing down one subscription does not unsubscribe the other subscription on the same connection', async () => {
    const { runtime, unsubscribeCalls } = makeRuntime()
    const emitA: unknown[] = []
    const emitB: unknown[] = []

    const doneA = subscribeEventsMethod.handler(
      undefined,
      { runtime, connectionId: 'conn-1' } as RpcContext,
      (message) => emitA.push(message)
    )
    void subscribeEventsMethod.handler(
      undefined,
      { runtime, connectionId: 'conn-1' } as RpcContext,
      (message) => emitB.push(message)
    )

    const registerCalls = (runtime.registerSubscriptionCleanup as ReturnType<typeof vi.fn>).mock
      .calls
    // Why: tear down only the first subscription's cleanup, as a client closing one
    // of two concurrent tabs/panels would.
    registerCalls[0][1]()
    await doneA

    expect(unsubscribeCalls).toEqual(['listener-0'])
  })

  it('rejects unsubscribe for a subscriptionId not owned by the calling connection', () => {
    const { runtime } = makeRuntime()

    const result = unsubscribeEventsMethod.handler(
      { subscriptionId: 'ai-swe-factory-events-conn-2-1' },
      { runtime, connectionId: 'conn-1' } as RpcContext
    )

    expect(result).toEqual({ unsubscribed: false })
    expect(runtime.cleanupSubscription).not.toHaveBeenCalled()
  })

  // Why: neither the local IPC unsubscribe path nor a dropped remote connection ever
  // calls aiSweFactory.events.unsubscribe — they only abort the streaming call's signal.
  // Without wiring that signal to cleanup, the listener leaks and this handler's promise
  // (and the upstream SSE connection it holds open) never resolves.
  it('tears down the subscription when the transport aborts the streaming call signal, without an explicit unsubscribe call', async () => {
    const { runtime, unsubscribeCalls } = makeRuntime()
    const emitted: unknown[] = []
    const controller = new AbortController()

    const done = subscribeEventsMethod.handler(
      undefined,
      { runtime, connectionId: 'conn-1', signal: controller.signal } as RpcContext,
      (message) => emitted.push(message)
    )

    const ready = emitted[0] as { type: string; subscriptionId: string }
    expect(ready.type).toBe('ready')

    controller.abort()
    await done

    expect(unsubscribeCalls).toEqual(['listener-0'])
    expect(emitted).toEqual([ready, { type: 'end' }])
  })

  it('tears down immediately when the signal is already aborted before the subscribe call starts, and still emits ready before end', async () => {
    const { runtime, unsubscribeCalls } = makeRuntime()
    const emitted: unknown[] = []
    const controller = new AbortController()
    controller.abort()

    await subscribeEventsMethod.handler(
      undefined,
      { runtime, connectionId: 'conn-1', signal: controller.signal } as RpcContext,
      (message) => emitted.push(message)
    )

    expect(unsubscribeCalls).toEqual(['listener-0'])
    expect(emitted.map((message) => (message as { type: string }).type)).toEqual(['ready', 'end'])
  })
})
