// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FactoryTaskDetail } from '../../../../shared/ai-swe-factory-types'
import { AiSweFactoryTaskDetailSheet } from './AiSweFactoryTaskDetailSheet'

// Why: Radix's Dialog portal/focus-trap does not behave reliably under
// happy-dom (see WorkspaceKanbanDrawer.mount-gating.test.tsx) — stub the
// Sheet primitives so this test exercises Orca's read-only rendering logic.
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div>{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>
}))

const detail: FactoryTaskDetail = {
  task: {
    id: 'TASK-1',
    title: 'Add board panel',
    body: 'Implement the read-only board.',
    type: 'feature',
    risk: 'low',
    state: 'IMPLEMENTING',
    repo: 'djanmagno/orca',
    issueNumber: null,
    prNumber: 42,
    branch: 'feature/board',
    worktree: '/tmp/worktree',
    scope: ['board panel'],
    outOfScope: ['drag and drop'],
    acceptanceCriteria: ['renders columns'],
    questions: [],
    artifacts: {},
    attempts: 1,
    currentSlice: 3,
    error: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z'
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
      durationMs: 12_000,
      exitCode: 0,
      error: null
    }
  ]
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('AiSweFactoryTaskDetailSheet', () => {
  it('renders read-only task fields and run summaries when open', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () =>
      root.render(
        <AiSweFactoryTaskDetailSheet
          open
          onOpenChange={vi.fn()}
          detail={detail}
          loading={false}
          error={null}
        />
      )
    )

    expect(container.textContent).toContain('Add board panel')
    expect(container.textContent).toContain('IMPLEMENTING')
    expect(container.textContent).toContain('renders columns')
    expect(container.textContent).toContain('implementer')
    act(() => root.unmount())
  })

  it('never renders a write action for the task', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () =>
      root.render(
        <AiSweFactoryTaskDetailSheet
          open
          onOpenChange={vi.fn()}
          detail={detail}
          loading={false}
          error={null}
        />
      )
    )

    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent ?? '')
    expect(buttons.some((text) => /approve|retry|cancel|edit|save/i.test(text))).toBe(false)
    act(() => root.unmount())
  })

  it('shows an error message when the task failed to load', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () =>
      root.render(
        <AiSweFactoryTaskDetailSheet
          open
          onOpenChange={vi.fn()}
          detail={null}
          loading={false}
          error="Unable to load AI SWE Factory task."
        />
      )
    )

    expect(container.textContent).toContain('Unable to load this task.')
    act(() => root.unmount())
  })

  it('renders nothing when closed', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () =>
      root.render(
        <AiSweFactoryTaskDetailSheet
          open={false}
          onOpenChange={vi.fn()}
          detail={detail}
          loading={false}
          error={null}
        />
      )
    )

    expect(container.textContent).toBe('')
    act(() => root.unmount())
  })
})
