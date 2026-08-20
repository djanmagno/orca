import { describe, expect, it, vi } from 'vitest'
import { MAX_FILE_RANGE_READ_BYTES } from '../../shared/file-range-read'
import { FileRangeReadUnsupportedError } from '../providers/filesystem-provider-contract'
import { createSshTranscriptRangeFs } from './ssh-transcript-range-fs'
import { TranscriptHostUnverifiableError } from './transcript-host-verdict'

describe('createSshTranscriptRangeFs', () => {
  it('pages reads that exceed one ranged-read window', async () => {
    const payload = Buffer.alloc(MAX_FILE_RANGE_READ_BYTES + 12, 7)
    const readFileRange = vi.fn(async (_path: string, position: number, length: number) => {
      const bytes = payload.subarray(position, position + length)
      return { bytes, bytesRead: bytes.length }
    })
    const fs = await createSshTranscriptRangeFs({
      readFileRange,
      supportsFileRangeRead: async () => true,
      stat: async () => ({ size: payload.length, type: 'file', mtime: 1, mtimeMs: 1 })
    })
    const result = await fs.read('/remote.jsonl', 0, payload.length)

    expect(result.equals(payload)).toBe(true)
    expect(readFileRange).toHaveBeenCalledTimes(2)
    expect(readFileRange).toHaveBeenNthCalledWith(
      1,
      '/remote.jsonl',
      0,
      MAX_FILE_RANGE_READ_BYTES,
      { signal: undefined }
    )
    expect(readFileRange).toHaveBeenNthCalledWith(
      2,
      '/remote.jsonl',
      MAX_FILE_RANGE_READ_BYTES,
      12,
      {
        signal: undefined
      }
    )
  })

  it('refuses to construct when the host has no ranged-read primitive', async () => {
    await expect(
      createSshTranscriptRangeFs({
        readFileRange: async () => ({ bytes: Buffer.alloc(0), bytesRead: 0 }),
        supportsFileRangeRead: async () => false,
        stat: async () => ({ size: 0, type: 'file', mtime: 0 })
      })
    ).rejects.toBeInstanceOf(TranscriptHostUnverifiableError)
  })

  it('lets a live ranged-read unsupported error surface for the caller to mark unverifiable', async () => {
    const fs = await createSshTranscriptRangeFs({
      readFileRange: async () => {
        throw new FileRangeReadUnsupportedError()
      },
      supportsFileRangeRead: async () => true,
      stat: async () => ({ size: 4, type: 'file', mtime: 1 })
    })
    await expect(fs.read('/remote.jsonl', 0, 4)).rejects.toBeInstanceOf(
      FileRangeReadUnsupportedError
    )
  })
})
