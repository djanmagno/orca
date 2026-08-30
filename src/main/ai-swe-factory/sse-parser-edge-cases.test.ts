import { describe, expect, it } from 'vitest'
import type { FactoryEvent } from '../../shared/ai-swe-factory-types'
import { parseFactorySseChunks } from './sse-parser'

const encoder = new TextEncoder()

async function* chunks(...values: string[]): AsyncIterable<Uint8Array> {
  for (const value of values) {
    yield encoder.encode(value)
  }
}

async function collect(source: AsyncIterable<Uint8Array>): Promise<FactoryEvent[]> {
  const events: FactoryEvent[] = []
  for await (const event of parseFactorySseChunks(source)) {
    events.push(event)
  }
  return events
}

describe('parseFactorySseChunks edge cases', () => {
  it('concatenates multiple data: lines within one frame per the SSE multi-line data format', async () => {
    const frame = [
      'data: {"id":"multi","type":"task.created","taskId":"TASK-1",',
      'data: "runId":null,"message":"m","data":{},"at":"2026-01-01T00:00:00.000Z"}',
      '',
      ''
    ].join('\n')
    const events = await collect(chunks(frame))

    expect(events).toEqual([
      {
        id: 'multi',
        type: 'task.created',
        taskId: 'TASK-1',
        runId: null,
        message: 'm',
        data: {},
        at: '2026-01-01T00:00:00.000Z'
      }
    ])
  })

  it('drops a frame with malformed JSON without throwing and still emits the next valid frame', async () => {
    const badFrame = 'data: {not valid json\n\n'
    const goodFrame =
      'data: {"id":"ok","type":"board.synced","taskId":null,"runId":null,"message":"m","data":{},"at":"2026-01-01T00:00:00.000Z"}\n\n'

    const events = await collect(chunks(badFrame, goodFrame))

    expect(events.map((event) => event.id)).toEqual(['ok'])
  })

  it('drops a frame that fails FactoryEvent schema validation without throwing and still emits the next valid frame', async () => {
    const invalidShapeFrame = 'data: {"id":"bad","type":"task.created"}\n\n'
    const goodFrame =
      'data: {"id":"ok2","type":"task.cancelled","taskId":"TASK-2","runId":null,"message":"m","data":{},"at":"2026-01-01T00:00:00.000Z"}\n\n'

    const events = await collect(chunks(invalidShapeFrame, goodFrame))

    expect(events.map((event) => event.id)).toEqual(['ok2'])
  })

  it('discards a frame with an event type unknown to the current schema without throwing, keeping the stream alive', async () => {
    const futureTypeFrame =
      'data: {"id":"future","type":"task.escalated","taskId":"TASK-3","runId":null,"message":"m","data":{},"at":"2026-01-01T00:00:00.000Z"}\n\n'
    const goodFrame =
      'data: {"id":"ok3","type":"pr.opened","taskId":"TASK-3","runId":null,"message":"m","data":{},"at":"2026-01-01T00:00:00.000Z"}\n\n'

    const events = await collect(chunks(futureTypeFrame, goodFrame))

    expect(events.map((event) => event.id)).toEqual(['ok3'])
  })

  it('ignores event:, id:, retry: and comment lines within a frame, using only data: lines', async () => {
    const frame = [
      ': keep-alive comment',
      'event: message',
      'id: server-side-id',
      'retry: 10000',
      'data: {"id":"filtered","type":"run.started","taskId":"TASK-4","runId":"RUN-1","message":"m","data":{},"at":"2026-01-01T00:00:00.000Z"}',
      '',
      ''
    ].join('\n')

    const events = await collect(chunks(frame))

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ id: 'filtered', type: 'run.started' })
  })

  it('emits nothing for an empty source and does not hang or throw', async () => {
    const events = await collect(chunks())

    expect(events).toEqual([])
  })
})
