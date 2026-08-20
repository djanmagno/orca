import { isENOENT } from '../ipc/filesystem-path-containment'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import { nativeChatTurnLifecycleDecoderForAgent } from './transcript-turn-lifecycle'
import {
  nativeChatLineDecoderForAgent,
  readNativeChatTranscriptTailFile,
  type NativeChatTranscriptTailResult
} from './transcript-tail-reader'
import { resolveNativeChatSshOwner, type NativeChatSshOwner } from './ssh-transcript-owner'
import { createSshTranscriptRangeFs } from './ssh-transcript-range-fs'
import { transcriptUnverifiableResult } from './transcript-host-verdict'
import type { ResolveSessionFileOptions } from './session-file-resolver'
import type { AgentType } from '../../shared/native-chat-types'

export type NativeChatSshReadArgs = ResolveSessionFileOptions & {
  agent: AgentType
  sessionId: string
  transcriptPath?: string
  filePath?: string
  limit: number
  beforeOffset?: number
}

export async function tryReadSshNativeChatTranscriptTail(
  args: NativeChatSshReadArgs,
  signal?: AbortSignal
): Promise<NativeChatTranscriptTailResult | null> {
  // Why: tests and worker reads pass an already-resolved local file; never
  // reroute that onto an SSH host.
  if (args.filePath) {
    return null
  }
  const owner = resolveNativeChatSshOwner(args)
  if (!owner) {
    return null
  }
  return readOwnedSshNativeChatTranscriptTail(owner, args, signal)
}

export async function readOwnedSshNativeChatTranscriptTail(
  owner: NativeChatSshOwner,
  args: NativeChatSshReadArgs,
  signal?: AbortSignal
): Promise<NativeChatTranscriptTailResult> {
  const decode = nativeChatLineDecoderForAgent(args.agent)
  const decodeLifecycle = nativeChatTurnLifecycleDecoderForAgent(args.agent)
  if (!decode) {
    return { error: 'Transcript unavailable' }
  }
  const provider = getSshFilesystemProvider(owner.connectionId)
  if (!provider) {
    return transcriptUnverifiableResult()
  }
  const filePath = owner.transcriptPath
  if (!filePath) {
    return { error: 'Transcript unavailable', notFound: true }
  }
  try {
    const rangeFs = await createSshTranscriptRangeFs(provider, signal)
    const result = await readNativeChatTranscriptTailFile(
      filePath,
      args.limit,
      decode,
      true,
      args.beforeOffset,
      decodeLifecycle,
      signal,
      rangeFs
    )
    signal?.throwIfAborted()
    return {
      messages: result.messages,
      ...(args.beforeOffset === undefined && result.lifecycle
        ? { lifecycle: result.lifecycle }
        : {}),
      hasMore: result.hasMore,
      beforeOffset: result.beforeOffset
    }
  } catch (error) {
    signal?.throwIfAborted()
    return classifySshTranscriptReadError(error)
  }
}

export function classifySshTranscriptReadError(error: unknown): NativeChatTranscriptTailResult {
  if (isENOENT(error)) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: message, notFound: true }
  }
  // Why: a transport/capability failure is not evidence the transcript is
  // missing, and it is never evidence the agent exited.
  return transcriptUnverifiableResult()
}
