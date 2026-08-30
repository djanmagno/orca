import { describe, expect, it } from 'vitest'
import type { FactoryEvent } from '../../shared/ai-swe-factory-types'
import { parseFactorySseChunks } from './sse-parser'

const encoder = new TextEncoder()

async function* chunks(...values: string[]): AsyncIterable<Uint8Array> {
  for (const value of values) {
    yield encoder.encode(value)
  }
}

describe('parseFactorySseChunks', () => {
  it('parses fragmented LF and CRLF event frames', async () => {
    const events: FactoryEvent[] = []
    for await (const event of parseFactorySseChunks(
      chunks(
        'data: {"id":"one","type":"task.created","taskId":"TASK-1","runId":null,',
        '"message":"created","data":{},"at":"2026-01-01T00:00:00.000Z"}\n\n',
        'data: {"id":"two","type":"board.synced","taskId":null,"runId":null,"message":"synced","data":{},"at":"2026-01-01T00:00:01.000Z"}\r\n\r\n'
      )
    )) {
      events.push(event)
    }

    expect(events.map((event) => event.id)).toEqual(['one', 'two'])
  })
})
