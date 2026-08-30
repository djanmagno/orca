// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aiSweFactoryGetTaskDetail,
  aiSweFactorySaveConnection,
  aiSweFactoryStatus
} from './runtime-ai-swe-factory-client'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'
import { createCompatibleRuntimeStatusResponse } from './runtime-compatibility-test-fixture'

const localSave = vi.fn()
const localStatus = vi.fn()
const localGetTaskDetail = vi.fn()
const runtimeCall = vi.fn()

beforeEach(() => {
  localSave.mockReset()
  localStatus.mockReset()
  localGetTaskDetail.mockReset()
  runtimeCall.mockReset()
  clearRuntimeCompatibilityCacheForTests()
  vi.stubGlobal('window', {
    api: {
      aiSweFactory: {
        saveConnection: localSave,
        status: localStatus,
        getTaskDetail: localGetTaskDetail
      },
      runtimeEnvironments: { call: runtimeCall }
    }
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('AI SWE Factory runtime client', () => {
  it('uses the active runtime as the configuration owner', async () => {
    runtimeCall.mockImplementation(async ({ method }: { method: string }) =>
      method === 'status.get'
        ? createCompatibleRuntimeStatusResponse()
        : {
            id: '1',
            ok: true,
            result: {
              configured: true,
              enabled: false,
              baseUrl: 'https://factory.test',
              credentialError: null
            }
          }
    )

    await aiSweFactorySaveConnection(
      { activeRuntimeEnvironmentId: 'runtime-a' },
      {
        baseUrl: 'https://factory.test',
        apiKey: 'secret'
      }
    )
    await aiSweFactoryStatus({ activeRuntimeEnvironmentId: 'runtime-a' })

    expect(runtimeCall).toHaveBeenCalledWith(
      expect.objectContaining({
        selector: 'runtime-a',
        method: 'aiSweFactory.saveConnection',
        params: { baseUrl: 'https://factory.test', apiKey: 'secret' }
      })
    )
    expect(runtimeCall).toHaveBeenCalledWith(
      expect.objectContaining({
        selector: 'runtime-a',
        method: 'aiSweFactory.status'
      })
    )
    expect(localSave).not.toHaveBeenCalled()
    expect(localStatus).not.toHaveBeenCalled()
  })

  it('calls the local IPC bridge for getTaskDetail when there is no active remote runtime', async () => {
    localGetTaskDetail.mockResolvedValue({ task: { id: 'TASK-1' }, runs: [] })

    const result = await aiSweFactoryGetTaskDetail(undefined, 'TASK-1')

    expect(localGetTaskDetail).toHaveBeenCalledWith({ id: 'TASK-1' })
    expect(result).toEqual({ task: { id: 'TASK-1' }, runs: [] })
    expect(runtimeCall).not.toHaveBeenCalled()
  })
})
