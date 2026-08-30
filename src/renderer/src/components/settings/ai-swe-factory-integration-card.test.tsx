// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiSweFactoryConnectionStatus } from '../../../../shared/ai-swe-factory-types'
import { AiSweFactoryIntegrationCard } from './ai-swe-factory-integration-card'

const { getStatus, setEnabled, state } = vi.hoisted(() => ({
  getStatus: vi.fn(),
  setEnabled: vi.fn(),
  state: {
    settings: null as { activeRuntimeEnvironmentId?: string } | null,
    aiSweFactoryStatus: {
      configured: false,
      enabled: false,
      baseUrl: null,
      credentialError: null
    } as AiSweFactoryConnectionStatus,
    aiSweFactoryStatusContextKey: 'local#0' as string | null,
    getAiSweFactoryStatus: vi.fn(),
    saveAiSweFactoryConnection: vi.fn(),
    setAiSweFactoryEnabled: vi.fn()
  }
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state)
}))

beforeEach(() => {
  getStatus.mockReset().mockResolvedValue(undefined)
  setEnabled.mockReset().mockResolvedValue(undefined)
  state.settings = null
  state.aiSweFactoryStatus = {
    configured: false,
    enabled: false,
    baseUrl: null,
    credentialError: null
  }
  state.aiSweFactoryStatusContextKey = 'local#0'
  state.getAiSweFactoryStatus = getStatus
  state.setAiSweFactoryEnabled = setEnabled
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('AiSweFactoryIntegrationCard', () => {
  it('keeps board visibility opt-in until a connection is configured', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => root.render(<AiSweFactoryIntegrationCard />))

    expect(document.querySelector<HTMLButtonElement>('#ai-swe-factory-enabled')?.disabled).toBe(
      true
    )
    expect(getStatus).toHaveBeenCalledOnce()
    act(() => root.unmount())
  })

  it('never renders the raw main-process credentialError string, even for an unrecognized sentinel', async () => {
    state.aiSweFactoryStatus = {
      configured: true,
      enabled: false,
      baseUrl: 'https://factory.test',
      credentialError: 'ECONNREFUSED 127.0.0.1:4173'
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => root.render(<AiSweFactoryIntegrationCard />))

    expect(container.textContent).not.toContain('ECONNREFUSED')
    expect(container.textContent).toContain(
      'Could not connect to AI SWE Factory. Check the connection settings.'
    )
    act(() => root.unmount())
  })

  it('localizes the invalid-URL credentialError sentinel', async () => {
    state.aiSweFactoryStatus = {
      configured: false,
      enabled: false,
      baseUrl: null,
      credentialError: 'Enter a valid HTTP or HTTPS URL.'
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => root.render(<AiSweFactoryIntegrationCard />))

    expect(container.textContent).toContain('Enter a valid HTTP or HTTPS URL.')
    act(() => root.unmount())
  })

  it('localizes the credential-decryption-failure sentinel', async () => {
    state.aiSweFactoryStatus = {
      configured: true,
      enabled: false,
      baseUrl: 'https://factory.test',
      credentialError:
        'Could not decrypt saved AI SWE Factory credential. Approve Keychain access or reconnect AI SWE Factory.'
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => root.render(<AiSweFactoryIntegrationCard />))

    expect(container.textContent).toContain(
      'Could not decrypt the saved AI SWE Factory credential. Approve Keychain access or reconnect AI SWE Factory.'
    )
    act(() => root.unmount())
  })
})
