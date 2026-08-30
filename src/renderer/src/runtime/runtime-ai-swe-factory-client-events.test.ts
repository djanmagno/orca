// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribeAiSweFactoryEvents } from './runtime-ai-swe-factory-client'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'

const localSubscribe = vi.fn()
const environmentsSubscribe = vi.fn()

beforeEach(() => {
  localSubscribe.mockReset()
  environmentsSubscribe.mockReset()
  clearRuntimeCompatibilityCacheForTests()
  vi.stubGlobal('window', {
    api: {
      runtime: { subscribe: localSubscribe },
      runtimeEnvironments: { subscribe: environmentsSubscribe }
    }
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('subscribeAiSweFactoryEvents', () => {
  it('subscribes locally via window.api.runtime.subscribe and forwards event messages only', async () => {
    let callback: ((response: unknown) => void) | undefined
    localSubscribe.mockImplementation((_args: unknown, cb: (response: unknown) => void) => {
      callback = cb
      return Promise.resolve({ unsubscribe: vi.fn(), sendBinary: vi.fn() })
    })

    const events: unknown[] = []
    const onError = vi.fn()
    await subscribeAiSweFactoryEvents(undefined, (event) => events.push(event), onError)

    expect(localSubscribe).toHaveBeenCalledWith(
      { method: 'aiSweFactory.events.subscribe' },
      expect.any(Function)
    )

    callback?.({ id: '1', ok: true, result: { type: 'ready', subscriptionId: 'sub-1' } })
    callback?.({
      id: '1',
      ok: true,
      result: { type: 'event', event: { id: 'e1', type: 'board.synced' } }
    })

    expect(events).toEqual([{ id: 'e1', type: 'board.synced' }])
    expect(onError).not.toHaveBeenCalled()
  })

  it('surfaces a failure response through onError instead of onEvent', async () => {
    let callback: ((response: unknown) => void) | undefined
    localSubscribe.mockImplementation((_args: unknown, cb: (response: unknown) => void) => {
      callback = cb
      return Promise.resolve({ unsubscribe: vi.fn(), sendBinary: vi.fn() })
    })

    const events: unknown[] = []
    const errors: unknown[] = []
    await subscribeAiSweFactoryEvents(
      undefined,
      (event) => events.push(event),
      (error) => errors.push(error)
    )

    callback?.({
      id: '1',
      ok: false,
      error: { code: 'method_not_found', message: 'Unknown method' }
    })

    expect(events).toEqual([])
    expect(errors).toEqual([{ code: 'method_not_found', message: 'Unknown method' }])
  })

  it('subscribes remotely via window.api.runtimeEnvironments.subscribe for an active runtime environment', async () => {
    environmentsSubscribe.mockResolvedValue({ unsubscribe: vi.fn(), sendBinary: vi.fn() })
    const onClose = vi.fn()

    await subscribeAiSweFactoryEvents(
      { activeRuntimeEnvironmentId: 'runtime-a' },
      () => {},
      () => {},
      onClose
    )

    expect(environmentsSubscribe).toHaveBeenCalledWith(
      expect.objectContaining({ selector: 'runtime-a', method: 'aiSweFactory.events.subscribe' }),
      expect.objectContaining({ onClose })
    )
    expect(localSubscribe).not.toHaveBeenCalled()
  })
})
