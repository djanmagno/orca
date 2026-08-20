import {
  getSshFilesystemProvider,
  onSshFilesystemProviderRegistered
} from '../providers/ssh-filesystem-dispatch'
import { nativeChatLineDecoderForAgent } from './transcript-tail-reader'
import { installTranscriptWatcher } from './transcript-watch-engine'
import type {
  NativeChatTranscriptSubscription,
  SubscribeNativeChatTranscriptArgs
} from './transcript-watch-contract'
import { resolveNativeChatSshOwner, type NativeChatSshOwner } from './ssh-transcript-owner'
import { createSshTranscriptRangeFs } from './ssh-transcript-range-fs'
import {
  TranscriptHostUnverifiableError,
  TRANSCRIPT_UNVERIFIABLE_MESSAGE
} from './transcript-host-verdict'
import { classifySshTranscriptReadError } from './ssh-transcript-read'

const INITIAL_RESOLVE_POLL_MS = 500
const MAX_RESOLVE_POLL_MS = 5_000

export function subscribeSshNativeChatTranscript(
  initialOwner: NativeChatSshOwner,
  args: SubscribeNativeChatTranscriptArgs,
  setupSignal?: AbortSignal
): NativeChatTranscriptSubscription {
  const resolvedDecoder = nativeChatLineDecoderForAgent(args.agent)
  if (!resolvedDecoder || setupSignal?.aborted) {
    return { unsubscribe: () => {}, watching: false }
  }
  const lineDecoder = resolvedDecoder

  let closed = false
  let installed: NativeChatTranscriptSubscription | null = null
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let delay = args.resolvePollIntervalMs ?? INITIAL_RESOLVE_POLL_MS
  let unverifiableEmitted = false
  const resolveController = new AbortController()
  const stopProviderListen = onSshFilesystemProviderRegistered((connectionId) => {
    if (closed || installed) {
      return
    }
    if (connectionId === initialOwner.connectionId) {
      void runAttempt()
    }
  })

  function emitUnverifiable(): void {
    if (unverifiableEmitted || !args.onInitialSnapshot) {
      return
    }
    unverifiableEmitted = true
    args.onInitialSnapshot([], false, 0, TRANSCRIPT_UNVERIFIABLE_MESSAGE)
  }

  function scheduleAttempt(): void {
    if (closed || installed) {
      return
    }
    pollTimer = setTimeout(() => {
      pollTimer = null
      void runAttempt()
    }, delay)
    pollTimer.unref?.()
    if (args.resolvePollIntervalMs === undefined) {
      delay = Math.min(delay * 2, MAX_RESOLVE_POLL_MS)
    }
  }

  async function runAttempt(): Promise<void> {
    if (closed || installed) {
      return
    }
    const owner =
      resolveNativeChatSshOwner({
        sessionId: args.sessionId,
        transcriptPath: args.transcriptPath
      }) ?? initialOwner
    const provider = getSshFilesystemProvider(owner.connectionId)
    if (!provider) {
      emitUnverifiable()
      scheduleAttempt()
      return
    }
    const filePath = owner.transcriptPath
    if (!filePath) {
      scheduleAttempt()
      return
    }
    try {
      const rangeFs = await createSshTranscriptRangeFs(provider, resolveController.signal)
      const result = await installTranscriptWatcher(
        filePath,
        lineDecoder,
        { ...args, filePath, rangeFs, transcriptPath: filePath },
        resolveController.signal
      )
      if (closed) {
        result?.unsubscribe()
        return
      }
      if (result) {
        installed = result
        return
      }
    } catch (error) {
      if (closed || resolveController.signal.aborted) {
        return
      }
      const classified = classifySshTranscriptReadError(error)
      if (
        ('unverifiable' in classified && classified.unverifiable === true) ||
        error instanceof TranscriptHostUnverifiableError
      ) {
        emitUnverifiable()
      }
    }
    scheduleAttempt()
  }

  void runAttempt()

  return {
    watching: true,
    unsubscribe: () => {
      if (closed) {
        return
      }
      closed = true
      resolveController.abort()
      stopProviderListen()
      if (pollTimer) {
        clearTimeout(pollTimer)
        pollTimer = null
      }
      installed?.unsubscribe()
      installed = null
    }
  }
}
