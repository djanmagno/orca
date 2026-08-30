import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getAiSweFactoryConnectionStatus, getAiSweFactoryApiKey } = vi.hoisted(() => ({
  getAiSweFactoryConnectionStatus: vi.fn(),
  getAiSweFactoryApiKey: vi.fn()
}))

vi.mock('./credential-store', () => ({
  getAiSweFactoryConnectionStatus: (...args: unknown[]) => getAiSweFactoryConnectionStatus(...args),
  getAiSweFactoryApiKey: (...args: unknown[]) => getAiSweFactoryApiKey(...args),
  assertAiSweFactoryHttpUrl: (value: string) => new URL(value),
  sanitizeAiSweFactoryError: () => 'Unable to connect to AI SWE Factory.',
  sanitizeAiSweFactoryLog: (message: string) => message.replace(/https?:\/\/\S+/g, '[url]')
}))

import { AiSweFactorySseConnectionManager } from './sse-connection-manager'

beforeEach(() => {
  vi.useFakeTimers()
  getAiSweFactoryConnectionStatus.mockReturnValue({
    configured: true,
    enabled: true,
    baseUrl: 'https://factory.test',
    credentialError: null
  })
  getAiSweFactoryApiKey.mockReturnValue(null)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AiSweFactorySseConnectionManager reconnect backoff', () => {
  it('reconnects using an increasing backoff schedule (500ms, 1s, 2s) across three consecutive failures, per the connection-manager design', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.reject(new Error('network down')))
    const manager = new AiSweFactorySseConnectionManager({ fetch })

    const unsubscribe = manager.subscribe('sub-a', () => {})
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))

    await vi.advanceTimersByTimeAsync(1_000)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))

    await vi.advanceTimersByTimeAsync(2_000)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4))

    unsubscribe()
  })

  it('resets the backoff delay back to the base 500ms once a connection is established again', async () => {
    let succeedNext = false
    const stream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close()
        }
      })
    const fetch = vi.fn().mockImplementation(() => {
      if (succeedNext) {
        succeedNext = false
        return Promise.resolve(new Response(stream(), { status: 200 }))
      }
      return Promise.reject(new Error('network down'))
    })
    const manager = new AiSweFactorySseConnectionManager({ fetch })

    const unsubscribe = manager.subscribe('sub-a', () => {})
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    // First failure: next attempt waits the base 500ms delay.
    succeedNext = true
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))

    // That attempt succeeded (stream opened and closed cleanly), so the very next
    // reconnect after it must use the base delay again, not the doubled 1s delay.
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))

    unsubscribe()
  })
})
