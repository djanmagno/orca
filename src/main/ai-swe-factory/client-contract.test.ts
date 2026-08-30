import { describe, expect, it, vi } from 'vitest'
import { AI_SWE_FACTORY_ROUTES } from '../../shared/ai-swe-factory-types'
import { sanitizeAiSweFactoryLog } from './credential-store'
import { AiSweFactoryClient, assertReadOnlyMethod } from './client'

const boardResponse = { columns: [] }
const detailResponse = {
  task: {
    id: 'TASK-1',
    title: 'x',
    state: 'RECEIVED',
    type: 'feature',
    risk: 'low',
    prNumber: null,
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  runs: []
}

describe('AiSweFactoryClient closed allowlist contract', () => {
  it('never issues a write verb (POST/PUT/PATCH/DELETE) when reading the board', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(boardResponse), { status: 200 }))
    const client = new AiSweFactoryClient({ baseUrl: 'https://factory.test', fetch })

    await client.getBoard()

    for (const call of fetch.mock.calls) {
      const init = call[1] as RequestInit | undefined
      expect(init?.method).toBe('GET')
    }
  })

  it('never issues a write verb when reading task detail', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(detailResponse), { status: 200 }))
    const client = new AiSweFactoryClient({ baseUrl: 'https://factory.test', fetch })

    await client.getTaskDetail('TASK-1')

    for (const call of fetch.mock.calls) {
      const init = call[1] as RequestInit | undefined
      expect(init?.method).toBe('GET')
    }
  })

  it('only ever requests /api/board or /api/tasks/:id, never any other route', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(boardResponse), { status: 200 }))
    const client = new AiSweFactoryClient({ baseUrl: 'https://factory.test', fetch })

    await client.getBoard()

    const allowlist = [
      /^https:\/\/factory\.test\/api\/board$/,
      /^https:\/\/factory\.test\/api\/tasks\/.+$/
    ]
    for (const call of fetch.mock.calls) {
      const url = call[0] as string
      expect(allowlist.some((pattern) => pattern.test(url))).toBe(true)
    }
  })

  it('exposes no public method capable of issuing a write request against the factory API', () => {
    const client = new AiSweFactoryClient({ baseUrl: 'https://factory.test', fetch: vi.fn() })
    const publicMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(client)).filter(
      (name) => name !== 'constructor'
    )

    expect(publicMethods.sort()).toEqual(['getBoard', 'getTaskDetail'])
  })

  it('allowlist contains only the three read-only factory routes', () => {
    expect(AI_SWE_FACTORY_ROUTES).toEqual([
      'GET /api/board',
      'GET /api/tasks/:id',
      'GET /api/events'
    ])
  })

  it('assertReadOnlyMethod accepts the three allowed GET routes', () => {
    expect(() => assertReadOnlyMethod('GET', '/api/board')).not.toThrow()
    expect(() => assertReadOnlyMethod('get', '/api/tasks/TASK-1')).not.toThrow()
    expect(() => assertReadOnlyMethod('GET', '/api/events')).not.toThrow()
  })

  it('assertReadOnlyMethod rejects write verbs and unknown paths', () => {
    expect(() => assertReadOnlyMethod('POST', '/api/board')).toThrow(
      'AI SWE Factory client rejected a non-read-only request.'
    )
    expect(() => assertReadOnlyMethod('GET', '/api/tasks')).toThrow(
      'AI SWE Factory client rejected a non-read-only request.'
    )
    expect(() => assertReadOnlyMethod('DELETE', '/api/tasks/TASK-1')).toThrow(
      'AI SWE Factory client rejected a non-read-only request.'
    )
    expect(() => assertReadOnlyMethod('GET', '/api/admin/secrets')).toThrow(
      'AI SWE Factory client rejected a non-read-only request.'
    )
  })

  it('sanitizeAiSweFactoryLog removes URLs and api_key/Authorization tokens from log messages', () => {
    const scrubbed = sanitizeAiSweFactoryLog(
      'GET http://factory.test/api/board?api_key=secret Authorization: Bearer token failed'
    )

    expect(scrubbed).not.toContain('http://factory.test')
    expect(scrubbed).not.toContain('api_key=secret')
    expect(scrubbed).not.toContain('Bearer token')
    expect(scrubbed).toContain('[url]')
    expect(scrubbed).toContain('[redacted]')
  })
})
