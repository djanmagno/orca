import { describe, expect, it } from 'vitest'
import { groupFactoryBoard } from './ai-swe-factory-board-state'

describe('groupFactoryBoard', () => {
  it('keeps API column order and sorts cards by most recently updated', () => {
    const columns = groupFactoryBoard([
      {
        name: 'Backlog',
        tasks: [
          {
            id: 'TASK-1',
            title: 'Older',
            state: 'RECEIVED',
            type: 'feature',
            risk: 'low',
            prNumber: null,
            updatedAt: '2026-01-01T00:00:00.000Z'
          },
          {
            id: 'TASK-2',
            title: 'Newer',
            state: 'RECEIVED',
            type: 'bug',
            risk: 'high',
            prNumber: 42,
            updatedAt: '2026-01-02T00:00:00.000Z'
          }
        ]
      },
      { name: 'Done', tasks: [] }
    ] as never)

    expect(columns.map((column) => column.name)).toEqual(['Backlog', 'Done'])
    expect(columns[0].tasks.map((task) => task.id)).toEqual(['TASK-2', 'TASK-1'])
  })
})
