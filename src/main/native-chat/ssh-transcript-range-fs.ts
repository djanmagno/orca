import { MAX_FILE_RANGE_READ_BYTES } from '../../shared/file-range-read'
import type { IFilesystemProvider } from '../providers/types'
import { TranscriptHostUnverifiableError } from './transcript-host-verdict'
import type { TranscriptRangeFs } from './transcript-range-fs'

export type NativeChatSshFilesystem = Pick<
  IFilesystemProvider,
  'stat' | 'readFileRange' | 'supportsFileRangeRead'
>

export async function createSshTranscriptRangeFs(
  provider: NativeChatSshFilesystem,
  signal?: AbortSignal
): Promise<TranscriptRangeFs> {
  const readFileRange = provider.readFileRange
  if (!readFileRange) {
    throw new TranscriptHostUnverifiableError()
  }
  if (provider.supportsFileRangeRead && !(await provider.supportsFileRangeRead({ signal }))) {
    throw new TranscriptHostUnverifiableError()
  }
  return {
    async stat(filePath, statSignal) {
      statSignal?.throwIfAborted()
      const stamp = await provider.stat(filePath)
      const mtimeMs = stamp.mtimeMs ?? stamp.mtime
      return {
        size: stamp.size,
        identity: `${stamp.dev ?? 0}:${stamp.ino ?? 0}`,
        mtimeMs,
        ctimeMs: mtimeMs
      }
    },
    async read(filePath, position, length, readSignal) {
      readSignal?.throwIfAborted()
      const parts: Buffer[] = []
      let remaining = length
      let cursor = position
      while (remaining > 0) {
        readSignal?.throwIfAborted()
        const window = Math.min(remaining, MAX_FILE_RANGE_READ_BYTES)
        const result = await readFileRange(filePath, cursor, window, { signal: readSignal })
        parts.push(result.bytes.subarray(0, result.bytesRead))
        cursor += result.bytesRead
        remaining -= result.bytesRead
        if (result.bytesRead < window) {
          break
        }
      }
      return parts.length === 1 ? (parts[0] ?? Buffer.alloc(0)) : Buffer.concat(parts)
    }
  }
}
