import { describe, expect, it } from 'vitest'
import { groupFactoryBoard } from './ai-swe-factory-board-state'

const task = (
  overrides: Partial<Parameters<typeof groupFactoryBoard>[0][number]['tasks'][number]> & {
    id: string
    updatedAt: string
  }
): never =>
  ({
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    state: overrides.state ?? 'RECEIVED',
    type: overrides.type ?? 'feature',
    risk: overrides.risk ?? 'low',
    prNumber: overrides.prNumber ?? null,
    updatedAt: overrides.updatedAt
  }) as never

describe('groupFactoryBoard edge cases', () => {
  it('renders all 7 factory.yaml columns, even when empty, in the order returned by GET /api/board', () => {
    const names = ['Backlog', 'Spec', 'Plan', 'In Progress', 'Review', 'Done', 'Failed']
    const columns = groupFactoryBoard(names.map((name) => ({ name, tasks: [] })) as never)

    expect(columns).toHaveLength(7)
    expect(columns.map((c) => c.name)).toEqual(names)
    expect(columns.every((c) => c.tasks.length === 0)).toBe(true)
  })

  it('does not drop or duplicate a card when the same id appears in only one column', () => {
    const columns = groupFactoryBoard([
      { name: 'Backlog', tasks: [task({ id: 'TASK-1', updatedAt: '2026-01-01T00:00:00.000Z' })] },
      { name: 'Done', tasks: [] }
    ] as never)

    const allIds = columns.flatMap((c) => c.tasks.map((t) => t.id))
    expect(allIds).toEqual(['TASK-1'])
  })

  it('keeps stable relative order for cards with identical updatedAt timestamps', () => {
    const same = '2026-01-01T00:00:00.000Z'
    const columns = groupFactoryBoard([
      {
        name: 'Backlog',
        tasks: [
          task({ id: 'TASK-1', updatedAt: same }),
          task({ id: 'TASK-2', updatedAt: same }),
          task({ id: 'TASK-3', updatedAt: same })
        ]
      }
    ] as never)

    expect(columns[0].tasks.map((t) => t.id)).toEqual(['TASK-1', 'TASK-2', 'TASK-3'])
  })

  it('surfaces prNumber on the card view so a PR link can be rendered', () => {
    const columns = groupFactoryBoard([
      {
        name: 'Review',
        tasks: [task({ id: 'TASK-1', updatedAt: '2026-01-01T00:00:00.000Z', prNumber: 42 })]
      }
    ] as never)

    expect(columns[0].tasks[0].prNumber).toBe(42)
  })

  it('does not mutate the input columns array when sorting', () => {
    const original = [
      task({ id: 'TASK-1', updatedAt: '2026-01-01T00:00:00.000Z' }),
      task({ id: 'TASK-2', updatedAt: '2026-01-02T00:00:00.000Z' })
    ]
    const input = [{ name: 'Backlog', tasks: original }] as never as Parameters<
      typeof groupFactoryBoard
    >[0]
    groupFactoryBoard(input)

    expect((input[0].tasks as unknown as { id: string }[]).map((t) => t.id)).toEqual([
      'TASK-1',
      'TASK-2'
    ])
  })
})
