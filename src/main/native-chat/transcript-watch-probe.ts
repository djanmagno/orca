import { TranscriptHostUnverifiableError } from './transcript-host-verdict'
import type { TranscriptRangeFs } from './transcript-range-fs'
import { wslGatedStat } from './wsl-transcript-fs-access'
import { WslTranscriptFsError } from './wsl-transcript-fs-gate'

let activeWatcherCount = 0

export function getActiveNativeChatWatcherCount(): number {
  return activeWatcherCount
}

export function retainActiveTranscriptWatcher(): void {
  activeWatcherCount++
}

export function releaseActiveTranscriptWatcher(): void {
  activeWatcherCount--
}

/** True when the transcript file exists and can be stated on the owning host. */
export async function probeTranscriptWatchTarget(
  filePath: string,
  signal: AbortSignal | undefined,
  rangeFs: TranscriptRangeFs | undefined
): Promise<boolean> {
  try {
    await (rangeFs ? rangeFs.stat(filePath, signal) : wslGatedStat(filePath, 'exact', signal))
    return true
  } catch (error) {
    // Why: "not flushed yet" degrades to resolve-polling, but a stalled distro
    // or unreachable SSH host must reach the caller so it can surface a
    // retryable message instead of stranding the client at `loading`.
    if (error instanceof WslTranscriptFsError || error instanceof TranscriptHostUnverifiableError) {
      throw error
    }
    return false
  }
}

export function transcriptWatchDrainErrorMessage(error: unknown): string {
  return error instanceof WslTranscriptFsError || error instanceof TranscriptHostUnverifiableError
    ? error.message
    : 'Transcript unavailable'
}
