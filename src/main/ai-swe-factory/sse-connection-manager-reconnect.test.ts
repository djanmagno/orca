import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  getAiSweFactoryConnectionStatus.mockReturnValue({
    configured: true,
    enabled: true,
    baseUrl: 'https://factory.test',
    credentialError: null
  })
  getAiSweFactoryApiKey.mockReturnValue(null)
})

describe('AiSweFactorySseConnectionManager reconnect backoff', () => {
  it('reconnects with exponential backoff 500ms, 1s, 2s, 4s, 8s, 16s capped at 30s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetch = vi.fn().mockRejectedValue(new Error('network'))
    const manager = new AiSweFactorySseConnectionManager({ fetch, reconnectDelayMs: 500 })

    manager.subscribe('sub-a', () => {})
    // Initial immediate attempt.
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)

    const expectedDelays = [500, 1000, 2000, 4000, 8000, 16000, 30000, 30000]
    for (const delay of expectedDelays) {
      await vi.advanceTimersByTimeAsync(delay)
      // Advance a little to let the setTimeout fire.
      await vi.advanceTimersByTimeAsync(1)
    }

    // Initial + 8 reconnect attempts.
    expect(fetch).toHaveBeenCalledTimes(1 + expectedDelays.length)

    vi.useRealTimers()
  })

  it('resets backoff after a successful connection and resumes reconnecting on the next failure', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let attempt = 0
    const fetch = vi.fn(() => {
      attempt += 1
      if (attempt === 1) {
        return Promise.reject(new Error('first failure'))
      }
      // Second attempt succeeds; third fails again.
      if (attempt === 2) {
        return Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.close()
              }
            }),
            { status: 200 }
          )
        )
      }
      return Promise.reject(new Error('failure after success'))
    })
    const manager = new AiSweFactorySseConnectionManager({ fetch, reconnectDelayMs: 500 })

    manager.subscribe('sub-a', () => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(2)

    // After success, the next failure should restart at the base delay.
    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(3)

    vi.useRealTimers()
  })

  it('stops reconnecting after the last listener unsubscribes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const fetch = vi.fn().mockRejectedValue(new Error('network'))
    const manager = new AiSweFactorySseConnectionManager({ fetch, reconnectDelayMs: 500 })

    const unsubscribe = manager.subscribe('sub-a', () => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)

    unsubscribe()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(fetch).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })
})
