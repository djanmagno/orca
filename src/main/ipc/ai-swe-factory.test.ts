import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handlers, save } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, args?: unknown) => unknown>(),
  save: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, args?: unknown) => unknown) =>
      handlers.set(channel, handler)
  }
}))
vi.mock('../ai-swe-factory/credential-store', () => ({
  getAiSweFactoryConnectionStatus: vi.fn(() => ({
    configured: false,
    enabled: false,
    baseUrl: null,
    credentialError: null
  })),
  saveAiSweFactoryConnection: (...args: unknown[]) => save(...args),
  setAiSweFactoryEnabled: vi.fn()
}))
vi.mock('../ai-swe-factory/client', () => ({
  getAiSweFactoryBoard: vi.fn(),
  getAiSweFactoryTaskDetail: vi.fn((id: string) => Promise.resolve({ task: { id }, runs: [] }))
}))

import { registerAiSweFactoryHandlers } from './ai-swe-factory'

describe('AI SWE Factory local IPC', () => {
  beforeEach(() => {
    handlers.clear()
    save.mockReset()
    registerAiSweFactoryHandlers()
  })

  it('does not return an invalid URL containing an API key to the renderer', () => {
    const handler = handlers.get('ai-swe-factory:saveConnection')
    if (!handler) {
      throw new Error('missing save connection handler')
    }

    const result = handler({}, { baseUrl: 42, apiKey: 'secret' })

    expect(result).toEqual({
      configured: false,
      enabled: false,
      baseUrl: null,
      credentialError: 'Enter a valid HTTP or HTTPS URL.'
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(save).not.toHaveBeenCalled()
  })

  it('rejects a getTaskDetail call without a valid id', () => {
    const handler = handlers.get('ai-swe-factory:getTaskDetail')
    if (!handler) {
      throw new Error('missing getTaskDetail handler')
    }

    expect(() => handler({}, { id: 42 })).toThrow('Missing id')
  })

  it('forwards a valid id to getAiSweFactoryTaskDetail', async () => {
    const handler = handlers.get('ai-swe-factory:getTaskDetail')
    if (!handler) {
      throw new Error('missing getTaskDetail handler')
    }

    await expect(handler({}, { id: 'TASK-1' })).resolves.toEqual({
      task: { id: 'TASK-1' },
      runs: []
    })
  })
})
