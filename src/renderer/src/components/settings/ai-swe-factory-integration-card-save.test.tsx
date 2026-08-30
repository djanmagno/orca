// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AiSweFactoryConnectionStatus } from '../../../../shared/ai-swe-factory-types'
import { AiSweFactoryIntegrationCard } from './ai-swe-factory-integration-card'

const saveConnection = vi.fn()
const setEnabled = vi.fn()
const state = {
  settings: null as { activeRuntimeEnvironmentId?: string } | null,
  aiSweFactoryStatus: {
    configured: false,
    enabled: false,
    baseUrl: null,
    credentialError: null
  } as AiSweFactoryConnectionStatus,
  aiSweFactoryStatusContextKey: 'local#0' as string | null,
  getAiSweFactoryStatus: vi.fn(),
  saveAiSweFactoryConnection: saveConnection,
  setAiSweFactoryEnabled: setEnabled
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state)
}))

beforeEach(() => {
  saveConnection.mockReset().mockResolvedValue(undefined)
  setEnabled.mockReset().mockResolvedValue(undefined)
  state.settings = null
  state.aiSweFactoryStatus = {
    configured: false,
    enabled: false,
    baseUrl: null,
    credentialError: null
  }
  state.aiSweFactoryStatusContextKey = 'local#0'
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AiSweFactoryIntegrationCard save configuration', () => {
  it('saves a configurable base URL and optional API key when the form is submitted', async () => {
    render(<AiSweFactoryIntegrationCard />)

    fireEvent.input(screen.getByLabelText(/Factory API URL/i), {
      target: { value: 'http://factory.test' }
    })
    fireEvent.input(screen.getByLabelText(/API key/i), {
      target: { value: 'secret-key' }
    })
    fireEvent.click(screen.getByRole('button', { name: /Save connection/i }))

    expect(saveConnection).toHaveBeenCalledWith({
      baseUrl: 'http://factory.test',
      apiKey: 'secret-key'
    })
  })

  it('saves a null API key when the key field is left empty', async () => {
    render(<AiSweFactoryIntegrationCard />)

    fireEvent.input(screen.getByLabelText(/Factory API URL/i), {
      target: { value: 'http://factory.test' }
    })
    fireEvent.click(screen.getByRole('button', { name: /Save connection/i }))

    expect(saveConnection).toHaveBeenCalledWith({ baseUrl: 'http://factory.test', apiKey: null })
  })
})
