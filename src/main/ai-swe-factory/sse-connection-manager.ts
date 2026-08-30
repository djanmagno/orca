import type { FactoryEvent } from '../../shared/ai-swe-factory-types'
import {
  assertAiSweFactoryHttpUrl,
  getAiSweFactoryApiKey,
  getAiSweFactoryConnectionStatus,
  sanitizeAiSweFactoryError,
  sanitizeAiSweFactoryLog
} from './credential-store'
import { assertReadOnlyMethod } from './client'
import { parseFactorySseChunks } from './sse-parser'
import { cancelUnreadResponseBody } from '../lib/unread-response-body'

type FactoryEventListener = (event: FactoryEvent) => void
type Fetch = (url: string, init?: RequestInit) => Promise<Response>

const BASE_RECONNECT_DELAY_MS = 500
const MAX_RECONNECT_DELAY_MS = 30_000

async function* readableStreamToAsyncIterable(
  stream: ReadableStream<Uint8Array>
): AsyncIterable<Uint8Array> {
  const reader = stream.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        return
      }
      if (value) {
        yield value
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Owns exactly one upstream `/api/events` SSE connection to the configured AI SWE Factory
 * instance and fans it out to every local subscriber. Mirrors the "one shared upstream,
 * many local listeners" shape of client-events.ts, but for an external HTTP source instead
 * of in-process runtime events.
 */
export class AiSweFactorySseConnectionManager {
  private readonly listeners = new Map<string, FactoryEventListener>()
  private readonly fetchImpl: Fetch
  private readonly baseReconnectDelayMs: number
  private abortController: AbortController | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  // Why: bumped on every config change/disconnect so a stale in-flight connect/reconnect
  // from a superseded generation can never resurrect itself after a newer one takes over.
  private generation = 0
  // Why: counts consecutive failed connection attempts to grow the reconnect delay
  // (base, base*2, base*4, ... capped) instead of hammering a downed factory instance.
  // Reset to 0 as soon as a connection is established again, per the "stable connection
  // resets backoff" design — a single flaky attempt should not permanently slow reconnects.
  private consecutiveFailures = 0

  constructor(options: { fetch?: Fetch; reconnectDelayMs?: number } = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.baseReconnectDelayMs = options.reconnectDelayMs ?? BASE_RECONNECT_DELAY_MS
  }

  subscribe(subscriptionId: string, listener: FactoryEventListener): () => void {
    this.listeners.set(subscriptionId, listener)
    this.ensureConnected()
    return () => {
      this.listeners.delete(subscriptionId)
      if (this.listeners.size === 0) {
        this.teardownConnection()
      }
    }
  }

  notifyConfigChanged(): void {
    this.generation += 1
    this.teardownConnection()
    this.consecutiveFailures = 0
    if (this.listeners.size > 0) {
      this.ensureConnected()
    }
  }

  private ensureConnected(): void {
    if (this.abortController) {
      return
    }
    this.connect()
  }

  private teardownConnection(): void {
    this.clearReconnectTimer()
    this.abortController?.abort()
    this.abortController = null
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private connect(): void {
    const connection = getAiSweFactoryConnectionStatus()
    if (!connection.configured || !connection.enabled || !connection.baseUrl) {
      return
    }
    let baseUrl: string
    try {
      baseUrl = assertAiSweFactoryHttpUrl(connection.baseUrl).toString().replace(/\/$/, '')
    } catch {
      return
    }
    const apiKey = getAiSweFactoryApiKey()
    const controller = new AbortController()
    this.abortController = controller
    void this.run(baseUrl, apiKey, controller, this.generation)
  }

  private async run(
    baseUrl: string,
    apiKey: string | null,
    controller: AbortController,
    generation: number
  ): Promise<void> {
    try {
      // Why no timeout: /api/events is a long-lived SSE stream, not a request/response
      // call — a fixed deadline would tear it down mid-stream. Liveness is instead
      // guaranteed by the backoff reconnect below, gated by `generation`.
      const path = '/api/events'
      assertReadOnlyMethod('GET', path)
      const response = await this.fetchImpl(new URL(path, baseUrl).toString(), {
        method: 'GET',
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: controller.signal
      })
      if (!response.ok || !response.body) {
        await cancelUnreadResponseBody(response)
        throw new Error('request failed')
      }
      this.consecutiveFailures = 0
      for await (const event of parseFactorySseChunks(
        readableStreamToAsyncIterable(response.body)
      )) {
        if (controller.signal.aborted || generation !== this.generation) {
          return
        }
        for (const listener of this.listeners.values()) {
          listener(event)
        }
      }
      if (controller.signal.aborted) {
        return
      }
      this.scheduleReconnect(generation)
    } catch (error) {
      if (controller.signal.aborted) {
        return
      }
      console.error(
        '[ai-swe-factory] SSE connection error:',
        sanitizeAiSweFactoryError(error),
        sanitizeAiSweFactoryLog(String(error))
      )
      this.scheduleReconnect(generation)
    }
  }

  private scheduleReconnect(generation: number): void {
    if (generation !== this.generation) {
      return
    }
    this.abortController = null
    if (this.listeners.size === 0) {
      return
    }
    const delay = Math.min(
      this.baseReconnectDelayMs * 2 ** this.consecutiveFailures,
      MAX_RECONNECT_DELAY_MS
    )
    this.consecutiveFailures += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (generation === this.generation && this.listeners.size > 0) {
        this.connect()
      }
    }, delay)
  }
}

let sharedManager: AiSweFactorySseConnectionManager | null = null

export function getAiSweFactorySseConnectionManager(): AiSweFactorySseConnectionManager {
  if (!sharedManager) {
    sharedManager = new AiSweFactorySseConnectionManager()
  }
  return sharedManager
}
