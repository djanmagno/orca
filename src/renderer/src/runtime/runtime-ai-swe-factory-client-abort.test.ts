// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiSweFactoryGetTaskDetail } from './runtime-ai-swe-factory-client'

const localGetTaskDetail = vi.fn()

beforeEach(() => {
  localGetTaskDetail.mockReset().mockResolvedValue({ task: { id: 'TASK-1' }, runs: [] })
  vi.stubGlobal('window', {
    api: {
      aiSweFactory: { getTaskDetail: localGetTaskDetail },
      runtimeEnvironments: { call: vi.fn() }
    }
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('aiSweFactoryGetTaskDetail abort propagation (local path)', () => {
  it('forwards the AbortSignal to the local IPC bridge so closing the detail sheet actually cancels the in-flight request', async () => {
    const controller = new AbortController()

    await aiSweFactoryGetTaskDetail(undefined, 'TASK-1', controller.signal)

    const [, passedSignal] = localGetTaskDetail.mock.calls[0]
    expect(passedSignal).toBe(controller.signal)
  })
})
