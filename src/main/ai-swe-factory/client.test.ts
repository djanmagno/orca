import { describe, expect, it, vi } from 'vitest'
import { AiSweFactoryClient } from './client'

const board = {
  columns: [
    {
      name: 'Backlog',
      tasks: [
        {
          id: 'TASK-1',
          title: 'First',
          state: 'RECEIVED',
          type: 'feature',
          risk: 'low',
          prNumber: null,
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    }
  ]
}

describe('AiSweFactoryClient', () => {
  it('uses an authenticated GET request for the board endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(board), { status: 200 }))
    const client = new AiSweFactoryClient({
      baseUrl: 'https://factory.test/api-key-in-query?api_key=secret',
      apiKey: 'token',
      fetch
    })

    await expect(client.getBoard()).resolves.toMatchObject(board)

    expect(fetch).toHaveBeenCalledWith('https://factory.test/api/board', {
      headers: { Authorization: 'Bearer token' },
      method: 'GET',
      signal: expect.any(AbortSignal)
    })
  })

  it('turns transport failures that contain credentials into a safe error', async () => {
    const client = new AiSweFactoryClient({
      baseUrl: 'https://factory.test',
      fetch: vi
        .fn()
        .mockRejectedValue(
          new Error('https://factory.test/api/board?api_key=secret Authorization: Bearer token')
        )
    })

    await expect(client.getBoard()).rejects.toThrow('Unable to connect to AI SWE Factory.')
  })

  it('uses an authenticated GET request for the task detail endpoint', async () => {
    const detail = {
      task: {
        id: 'TASK-1',
        title: 'First',
        state: 'RECEIVED',
        type: 'feature',
        risk: 'low',
        prNumber: null,
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      runs: [
        {
          id: 'run-1',
          taskId: 'TASK-1',
          role: 'implementer',
          adapter: 'claude',
          model: null,
          state: 'succeeded',
          prompt: '',
          output: '',
          logFile: '',
          startedAt: null,
          finishedAt: null,
          durationMs: null,
          exitCode: 0,
          error: null
        }
      ]
    }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(detail), { status: 200 }))
    const client = new AiSweFactoryClient({
      baseUrl: 'https://factory.test',
      apiKey: 'token',
      fetch
    })

    await expect(client.getTaskDetail('TASK-1')).resolves.toMatchObject(detail)

    expect(fetch).toHaveBeenCalledWith('https://factory.test/api/tasks/TASK-1', {
      headers: { Authorization: 'Bearer token' },
      method: 'GET',
      signal: expect.any(AbortSignal)
    })
  })

  it('percent-encodes the task id in the task detail URL path', async () => {
    const detail = {
      task: {
        id: 'a/b',
        title: 'x',
        state: 'RECEIVED',
        type: 'feature',
        risk: 'low',
        prNumber: null,
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      runs: []
    }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(detail), { status: 200 }))
    const client = new AiSweFactoryClient({ baseUrl: 'https://factory.test', fetch })

    await client.getTaskDetail('a/b')

    expect(fetch).toHaveBeenCalledWith('https://factory.test/api/tasks/a%2Fb', expect.anything())
  })

  it('turns task detail transport failures that contain credentials into a safe error', async () => {
    const client = new AiSweFactoryClient({
      baseUrl: 'https://factory.test',
      fetch: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'https://factory.test/api/tasks/TASK-1?api_key=secret Authorization: Bearer token'
          )
        )
    })

    await expect(client.getTaskDetail('TASK-1')).rejects.toThrow(
      'Unable to connect to AI SWE Factory.'
    )
  })
})
