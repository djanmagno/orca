// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRightSidebarActivityItems } from './use-right-sidebar-activity-items'

const { state } = vi.hoisted(() => ({
  state: {
    activeWorktreeId: null as string | null,
    aiSweFactoryStatus: { enabled: false },
    aiSweFactoryStatusContextKey: 'local#0' as string | null,
    getAiSweFactoryStatus: () => Promise.resolve(),
    settings: null as { pluginSystemEnabled?: boolean; activeRuntimeEnvironmentId?: string } | null,
    getKnownWorktreeById: () => null
  }
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state)
}))
vi.mock('@/store/selectors', () => ({ useRepoById: () => null }))
vi.mock('@/hooks/useShortcutLabel', () => ({ useShortcutLabel: () => 'Unassigned' }))
vi.mock('@/store/plugin-panels', () => ({
  usePluginPanels: () => [],
  usePluginPanelsStore: (
    selector: (value: {
      plugins: []
      fetchStatus: 'idle'
      panelErrors: Record<string, never>
    }) => unknown
  ) => selector({ plugins: [], fetchStatus: 'idle', panelErrors: {} }),
  collectInstalledPluginTabKeys: () => new Set<string>()
}))

function renderItems(rightSidebarOpen = true): ReturnType<typeof useRightSidebarActivityItems> {
  let result!: ReturnType<typeof useRightSidebarActivityItems>
  function Probe(): null {
    result = useRightSidebarActivityItems({ rightSidebarOpen })
    return null
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(<Probe />))
  act(() => root.unmount())
  return result
}

beforeEach(() => {
  state.activeWorktreeId = null
  state.aiSweFactoryStatus = { enabled: false }
  state.aiSweFactoryStatusContextKey = 'local#0'
  state.getAiSweFactoryStatus = vi.fn(() => Promise.resolve())
  state.settings = null
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useRightSidebarActivityItems ai-swe-factory visibility', () => {
  it('hides the AI SWE Factory tab until the integration is explicitly enabled', () => {
    state.aiSweFactoryStatus = { enabled: false }

    const { visibleItems } = renderItems()

    expect(visibleItems.some((item) => item.id === 'ai-swe-factory')).toBe(false)
  })

  it('shows the AI SWE Factory tab once status.enabled is true', () => {
    state.aiSweFactoryStatus = { enabled: true }

    const { visibleItems } = renderItems()

    expect(visibleItems.some((item) => item.id === 'ai-swe-factory')).toBe(true)
  })

  it('hides the tab and re-checks status when it is stale for the active runtime', () => {
    // enabled=true here belongs to a runtime the user has since switched away from —
    // the current context key ('local#0') no longer matches the status's context key.
    state.aiSweFactoryStatus = { enabled: true }
    state.aiSweFactoryStatusContextKey = 'runtime:runtime-b#0'
    state.settings = { activeRuntimeEnvironmentId: undefined }

    const { visibleItems } = renderItems()

    expect(visibleItems.some((item) => item.id === 'ai-swe-factory')).toBe(false)
    expect(state.getAiSweFactoryStatus).toHaveBeenCalled()
  })

  it('does not re-check status when it already matches the active runtime', () => {
    state.aiSweFactoryStatus = { enabled: true }
    state.aiSweFactoryStatusContextKey = 'local#0'
    state.settings = { activeRuntimeEnvironmentId: undefined }

    renderItems()

    expect(state.getAiSweFactoryStatus).not.toHaveBeenCalled()
  })
})
