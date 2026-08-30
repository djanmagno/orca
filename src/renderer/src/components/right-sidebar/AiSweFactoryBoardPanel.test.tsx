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
      tasks:
        name === 'Backlog'
          ? [
              {
                id: 'TASK-1',
                title: 'Read-only board',
                state: 'RECEIVED',
                type: 'feature',
                risk: 'low',
                prNumber: 42,
                updatedAt: '2026-01-01T00:00:00.000Z'
              }
            ]
          : []
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

describe('AiSweFactoryBoardPanel', () => {
  it('renders the seven API columns and their cards', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => root.render(<AiSweFactoryBoardPanel />))

    expect(container.querySelectorAll('section')).toHaveLength(7)
    expect(container.textContent).toContain('Read-only board')
    expect(container.textContent).toContain('RECEIVED')
    expect(container.textContent).toContain('feature')
    expect(container.textContent).toContain('low')
    expect(container.textContent).toContain('#42')
    expect(load).toHaveBeenCalledOnce()
    act(() => root.unmount())
  })

  it('opens the task detail drawer when a card is clicked', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => root.render(<AiSweFactoryBoardPanel />))
    const card = container.querySelector('article[role="button"]') as HTMLElement
    await act(async () => card.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    expect(openTaskDetail).toHaveBeenCalledWith('TASK-1')
    act(() => root.unmount())
  })

  it.each(['Enter', ' '])('opens the task detail drawer when a card receives %s', async (key) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => root.render(<AiSweFactoryBoardPanel />))
    const card = container.querySelector('article[role="button"]') as HTMLElement
    await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))

    expect(openTaskDetail).toHaveBeenCalledWith('TASK-1')
    act(() => root.unmount())
  })

  it('syncs the live event subscription on mount and tears it down on unmount', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => root.render(<AiSweFactoryBoardPanel />))
    expect(syncEventSubscription).toHaveBeenCalledOnce()
    expect(stopEventSubscription).not.toHaveBeenCalled()

    act(() => root.unmount())
    expect(stopEventSubscription).toHaveBeenCalledOnce()
  })

  it('closes the detail on unmount so a pending detail request is aborted', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => root.render(<AiSweFactoryBoardPanel />))
    act(() => root.unmount())

    expect(closeTaskDetail).toHaveBeenCalledOnce()
  })

  it('shows a non-blocking warning when live updates are unavailable', async () => {
    state.aiSweFactoryLiveUpdatesUnavailable = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => root.render(<AiSweFactoryBoardPanel />))

    expect(container.textContent).toContain('Live updates are unavailable')
    expect(container.querySelectorAll('section')).toHaveLength(7)
    state.aiSweFactoryLiveUpdatesUnavailable = false
    act(() => root.unmount())
  })
})
