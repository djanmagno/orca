import { z } from 'zod'
import type { FactoryEvent } from '../../shared/ai-swe-factory-types'

// Why CRLF and LF: a factory instance behind certain proxies emits CRLF frame
// delimiters instead of the bare LF the SSE spec examples use.
const FRAME_BOUNDARY = /\r\n\r\n|\n\n/

const factoryEventSchema = z.object({
  id: z.string(),
  type: z.enum([
    'task.created',
    'task.state_changed',
    'task.approved',
    'task.cancelled',
    'run.started',
    'run.output',
    'run.finished',
    'pipeline.step',
    'pipeline.failed',
    'pr.opened',
    'board.synced'
  ]),
  taskId: z.string().nullable(),
  runId: z.string().nullable(),
  message: z.string(),
  data: z.record(z.string(), z.unknown()),
  at: z.string()
})

function parseFrame(frame: string): FactoryEvent | null {
  const dataLines = frame
    .split(/\r\n|\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart())
  if (dataLines.length === 0) {
    return null
  }
  try {
    const parsed = factoryEventSchema.safeParse(JSON.parse(dataLines.join('\n')))
    return parsed.success ? parsed.data : null
  } catch {
    // Why: a single malformed frame (partial write, proxy glitch) must not kill the stream.
    return null
  }
}

export async function* parseFactorySseChunks(
  source: AsyncIterable<Uint8Array>
): AsyncIterable<FactoryEvent> {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of source) {
    buffer += decoder.decode(chunk, { stream: true })
    let match: RegExpMatchArray | null
    while ((match = buffer.match(FRAME_BOUNDARY))) {
      const boundaryIndex = match.index ?? 0
      const frame = buffer.slice(0, boundaryIndex)
      buffer = buffer.slice(boundaryIndex + match[0].length)
      const event = parseFrame(frame)
      if (event) {
        yield event
      }
    }
  }
}
