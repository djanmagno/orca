import { describe, expect, it, vi } from 'vitest'
import { AiSweFactoryClient } from './client'

describe('AiSweFactoryClient error sanitization', () => {
  it('returns a generic error when the board request fails with a URL containing an api_key', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(new Error('GET https://factory.test/api/board?api_key=secret failed'))
    const client = new AiSweFactoryClient({ baseUrl: 'https://factory.test', fetch })

    await expect(client.getBoard()).rejects.toThrow('Unable to connect to AI SWE Factory.')
  })

  it('returns a generic error when the task detail request fails with an Authorization header', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(new Error('request failed: Authorization: Bearer super-token'))
    const client = new AiSweFactoryClient({ baseUrl: 'https://factory.test', fetch })

    await expect(client.getTaskDetail('TASK-1')).rejects.toThrow(
      'Unable to connect to AI SWE Factory.'
    )
  })
})
