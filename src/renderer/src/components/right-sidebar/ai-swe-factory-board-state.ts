import type { FactoryBoard, FactoryTask } from '../../../../shared/ai-swe-factory-types'

export type FactoryBoardColumnView = {
  name: string
  tasks: Pick<FactoryTask, 'id' | 'title' | 'state' | 'type' | 'risk' | 'prNumber' | 'updatedAt'>[]
}

export function groupFactoryBoard(columns: FactoryBoard['columns']): FactoryBoardColumnView[] {
  return columns.map((column) => ({
    name: column.name,
    tasks: [...column.tasks]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(({ id, title, state, type, risk, prNumber, updatedAt }) => ({
        id,
        title,
        state,
        type,
        risk,
        prNumber,
        updatedAt
      }))
  }))
}
