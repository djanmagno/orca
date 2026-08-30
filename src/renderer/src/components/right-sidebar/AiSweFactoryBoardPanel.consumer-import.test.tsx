// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'

const state = {
  aiSweFactoryBoardError: null as string | null,
  loadAiSweFactoryBoard: vi.fn(),
  aiSweFactoryBoard: null,
  aiSweFactorySelectedTaskId: null as string | null,
  aiSweFactoryTaskDetail: null,
  aiSweFactoryTaskDetailError: null,
  openAiSweFactoryTaskDetail: vi.fn(),
  closeAiSweFactoryTaskDetail: vi.fn(),
  aiSweFactoryLiveUpdatesUnavailable: false,
  syncAiSweFactoryEventSubscription: vi.fn(),
  stopAiSweFactoryEventSubscription: vi.fn(),
  settings: null as { activeRuntimeEnvironmentId?: string } | null
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state)
}))

describe('AiSweFactoryBoardPanel module shape', () => {
  it('exposes a default export, matching how right-sidebar-panel-content.tsx loads it via lazy(() => import(...))', async () => {
    const module = await import('./AiSweFactoryBoardPanel')

    expect(module.default).toBeDefined()
    expect(typeof module.default).toBe('function')
  })
})
