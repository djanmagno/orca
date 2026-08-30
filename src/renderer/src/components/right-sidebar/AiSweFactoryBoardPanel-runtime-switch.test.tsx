// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AiSweFactoryBoardPanel from './AiSweFactoryBoardPanel'

const load = vi.fn()
const openTaskDetail = vi.fn()
const closeTaskDetail = vi.fn()
const syncEventSubscription = vi.fn()
const stopEventSubscription = vi.fn()
const state = {
  aiSweFactoryBoardError: null as string | null,
  loadAiSweFactoryBoard: load,
  aiSweFactoryBoard: ['Backlog', 'Spec', 'Plan', 'In Progress', 'Review', 'Done', 'Failed'].map(
    (name) => ({
      name,
      tasks: [] as never[]
    })
  ),
  aiSweFactorySelectedTaskId: null as string | null,
  aiSweFactoryTaskDetail: null,
  aiSweFactoryTaskDetailError: null,
  openAiSweFactoryTaskDetail: openTaskDetail,
  closeAiSweFactoryTaskDetail: closeTaskDetail,
  aiSweFactoryLiveUpdatesUnavailable: false,
  syncAiSweFactoryEventSubscription: syncEventSubscription,
  stopAiSweFactoryEventSubscription: stopEventSubscription,
  settings: null as { activeRuntimeEnvironmentId?: string } | null
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state)
}))

afterEach(() => {
  document.body.innerHTML = ''
  load.mockReset()
  openTaskDetail.mockReset()
  closeTaskDetail.mockReset()
  syncEventSubscription.mockReset()
  stopEventSubscription.mockReset()
})

describe('AiSweFactoryBoardPanel runtime context change', () => {
  it('re-syncs the live event subscription when the active runtime environment changes', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => root.render(<AiSweFactoryBoardPanel />))
    expect(syncEventSubscription).toHaveBeenCalledTimes(1)

    act(() => {
      state.settings = { activeRuntimeEnvironmentId: 'runtime-b' }
    })
    await act(async () => root.render(<AiSweFactoryBoardPanel />))

    expect(stopEventSubscription).toHaveBeenCalledTimes(1)
    expect(syncEventSubscription).toHaveBeenCalledTimes(2)

    act(() => root.unmount())
  })
})
