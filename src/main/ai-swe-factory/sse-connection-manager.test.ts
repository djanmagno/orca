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

const encoder = new TextEncoder()
const boardSyncedFrame =
  'data: {"id":"1","type":"board.synced","taskId":null,"runId":null,"message":"m","data":{},"at":"2026-01-01T00:00:00.000Z"}\n\n'

beforeEach(() => {
  getAiSweFactoryConnectionStatus.mockReturnValue({
    configured: true,
    enabled: true,
    baseUrl: 'https://factory.test',
    credentialError: null
  })
  getAiSweFactoryApiKey.mockReturnValue(null)
})

describe('AiSweFactorySseConnectionManager', () => {
  it('opens exactly one upstream connection and fans it out to two concurrent subscriptions', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(boardSyncedFrame))
        controller.close()
      }
    })
    const fetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }))
    const manager = new AiSweFactorySseConnectionManager({ fetch })

    const eventsA: unknown[] = []
    const eventsB: unknown[] = []
    const unsubscribeA = manager.subscribe('sub-a', (event) => eventsA.push(event))
    const unsubscribeB = manager.subscribe('sub-b', (event) => eventsB.push(event))

    await vi.waitFor(() => {
      expect(eventsA).toHaveLength(1)
      expect(eventsB).toHaveLength(1)
    })
    expect(fetch).toHaveBeenCalledTimes(1)

    unsubscribeA()
    unsubscribeB()
  })

  it('unsubscribing one listener does not stop delivery to the other listener on the same connection', async () => {
    let controllerRef!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controllerRef = controller
      }
    })
    const fetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }))
    const manager = new AiSweFactorySseConnectionManager({ fetch })

    const eventsA: unknown[] = []
    const eventsB: unknown[] = []
    const unsubscribeA = manager.subscribe('sub-a', (event) => eventsA.push(event))
    const unsubscribeB = manager.subscribe('sub-b', (event) => eventsB.push(event))

    controllerRef.enqueue(encoder.encode(boardSyncedFrame))
    await vi.waitFor(() => {
      expect(eventsA).toHaveLength(1)
      expect(eventsB).toHaveLength(1)
    })

    unsubscribeA()
    controllerRef.enqueue(
      encoder.encode(
        'data: {"id":"2","type":"board.synced","taskId":null,"runId":null,"message":"m","data":{},"at":"2026-01-01T00:00:01.000Z"}\n\n'
      )
    )
    await vi.waitFor(() => expect(eventsB).toHaveLength(2))
    expect(eventsA).toHaveLength(1)

    controllerRef.close()
    unsubscribeB()
  })

  it('never issues a write verb or any route other than /api/events', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      }
    })
    const fetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }))
    const manager = new AiSweFactorySseConnectionManager({ fetch })

    const unsubscribe = manager.subscribe('sub-a', () => {})
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit | undefined]
    expect(url).toBe('https://factory.test/api/events')
    expect(init?.method).toBe('GET')

    unsubscribe()
  })

  it('tears down the live connection and reconnects using the new config on notifyConfigChanged', async () => {
    let firstController!: ReadableStreamDefaultController<Uint8Array>
    const firstStream = new ReadableStream<Uint8Array>({
      start(controller) {
        firstController = controller
      }
    })
    const secondStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(boardSyncedFrame))
        controller.close()
      }
    })
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      const isSecond = url === 'https://factory-2.test/api/events'
      init?.signal?.addEventListener('abort', () => {
        if (!isSecond) {
          try {
            firstController.error(new DOMException('aborted', 'AbortError'))
          } catch {
            // Why: the stream may already be closed by the time abort fires.
          }
        }
      })
      return Promise.resolve(new Response(isSecond ? secondStream : firstStream, { status: 200 }))
    })
    const manager = new AiSweFactorySseConnectionManager({ fetch })

    const events: unknown[] = []
    const unsubscribe = manager.subscribe('sub-a', (event) => events.push(event))
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    getAiSweFactoryConnectionStatus.mockReturnValue({
      configured: true,
      enabled: true,
      baseUrl: 'https://factory-2.test',
      credentialError: null
    })
    manager.notifyConfigChanged()

    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1][0]).toBe('https://factory-2.test/api/events')

    unsubscribe()
  })

  it('does not reopen the upstream connection when the integration is disabled, even with a live listener', async () => {
    let controllerRef!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controllerRef = controller
      }
    })
    const fetch = vi.fn((_url: string, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', () => {
        try {
          controllerRef.error(new DOMException('aborted', 'AbortError'))
        } catch {
          // Why: the stream may already be closed by the time abort fires.
        }
      })
      return Promise.resolve(new Response(stream, { status: 200 }))
    })
    const manager = new AiSweFactorySseConnectionManager({ fetch })

    const unsubscribe = manager.subscribe('sub-a', () => {})
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    getAiSweFactoryConnectionStatus.mockReturnValue({
      configured: true,
      enabled: false,
      baseUrl: 'https://factory.test',
      credentialError: null
    })
    manager.notifyConfigChanged()

    // Why a delay-free assertion: notifyConfigChanged synchronously tears down and
    // attempts to reconnect, so a leak would show up on this same microtask turn.
    await Promise.resolve()
    await Promise.resolve()
    expect(fetch).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('never logs the raw upstream error, which may contain the api key or full URL', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetch = vi
      .fn()
      .mockRejectedValue(new Error('GET https://factory.test/api/events?api_key=secret failed'))
    const manager = new AiSweFactorySseConnectionManager({ fetch, reconnectDelayMs: 999_999 })

    const unsubscribe = manager.subscribe('sub-a', () => {})
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled())

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('[ai-swe-factory]'),
      'Unable to connect to AI SWE Factory.',
      expect.any(String)
    )
    const loggedText = consoleError.mock.calls.flat().join(' ')
    expect(loggedText).not.toContain('https://factory.test')
    expect(loggedText).not.toContain('secret')
    expect(loggedText).not.toContain('api_key')

    consoleError.mockRestore()
    unsubscribe()
  })
})
