import { buildAgentTuiClearInputForText } from '../../../src/shared/agent-tui-input-clear'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import type { PendingNativeChatImage } from './mobile-native-chat-image-attachment'
import {
  MOBILE_NATIVE_CHAT_IMAGE_SETTLE_MS,
  pasteMobileNativeChatImagePaths
} from './mobile-native-chat-image-send'
import {
  openMobileNativeChatSendBudget,
  type MobileNativeChatSendOutcome
} from './mobile-native-chat-send'
import {
  clearMobileNativeChatInputStale,
  healMobileNativeChatStaleInput,
  isMobileNativeChatInputStale,
  markMobileNativeChatInputStale
} from './mobile-native-chat-stale-input'

type CurrentRef<T> = { readonly current: T }

const NO_ATTACHMENTS: PendingNativeChatImage[] = []

export function withScopeAttachments(
  byScope: Record<string, PendingNativeChatImage[]>,
  scope: string,
  next: PendingNativeChatImage[]
): Record<string, PendingNativeChatImage[]> {
  if (next.length > 0) {
    return { ...byScope, [scope]: next }
  }
  const remaining = { ...byScope }
  delete remaining[scope]
  return remaining
}

export async function runMobileNativeChatImageSend(args: {
  readonly client: RpcClient | null
  readonly activeHandleRef: CurrentRef<string | null>
  readonly deviceTokenRef: CurrentRef<string | null>
  readonly connState: ConnectionState
  readonly scopeKey: string | null
  readonly enabled: boolean
  readonly attachmentsByScope: Record<string, PendingNativeChatImage[]>
  readonly text: string
  readonly baseSend: (
    text: string,
    imagePreviewUris?: string[],
    deadline?: number
  ) => Promise<MobileNativeChatSendOutcome>
  readonly readSeededLaunchDraft: () => string | null
  readonly sleep: (ms: number) => Promise<void>
  readonly onError?: () => void
  readonly onSendError: (message: string) => void
  readonly setAttachmentsByScope: (
    update: (
      prev: Record<string, PendingNativeChatImage[]>
    ) => Record<string, PendingNativeChatImage[]>
  ) => void
}): Promise<boolean> {
  // One budget for paste + settle + text so `sending` cannot double the ceiling.
  const deadline = openMobileNativeChatSendBudget()
  const scope = args.scopeKey
  const pendingImages = (scope ? args.attachmentsByScope[scope] : undefined) ?? NO_ATTACHMENTS
  if (pendingImages.length === 0 || !scope) {
    // Heal a previously failed paste: a text-only send would otherwise glue the
    // stale image paste onto this message.
    const staleTerminal = args.activeHandleRef.current
    if (staleTerminal && isMobileNativeChatInputStale(staleTerminal)) {
      // Why: the heal is itself a terminal.send, so without the input lease it
      // can only be rejected — which used to latch the marker (#10681).
      if (!args.client || !args.enabled || args.connState !== 'connected') {
        args.onError?.()
        args.onSendError('Message not sent (disconnected)')
        return false
      }
      const healed = await healMobileNativeChatStaleInput({
        client: args.client,
        terminal: staleTerminal,
        deviceToken: args.deviceTokenRef.current,
        deadline
      })
      if (!healed || args.activeHandleRef.current !== staleTerminal) {
        args.onError?.()
        args.onSendError('Message not sent')
        return false
      }
    }
    return (await args.baseSend(args.text, undefined, deadline)) !== 'rejected'
  }
  const handle = args.activeHandleRef.current
  if (!args.client || !handle || !args.enabled || args.connState !== 'connected') {
    args.onError?.()
    args.onSendError('Message not sent (disconnected)')
    return false
  }
  try {
    const seededLaunchDraft = args.readSeededLaunchDraft()
    const pasted = await pasteMobileNativeChatImagePaths({
      client: args.client,
      terminal: handle,
      deviceToken: args.deviceTokenRef.current,
      imagePaths: pendingImages.map((attachment) => attachment.path),
      followedByText: args.text.length > 0,
      deadline,
      ...(seededLaunchDraft
        ? { clearInput: buildAgentTuiClearInputForText(seededLaunchDraft) }
        : {})
    })
    if (!pasted) {
      markMobileNativeChatInputStale(handle)
      args.onError?.()
      args.onSendError('Message not sent')
      return false
    }
    clearMobileNativeChatInputStale(handle)
    // Let the TUI absorb the image paste before the text + Enter follow.
    await args.sleep(MOBILE_NATIVE_CHAT_IMAGE_SETTLE_MS)
    // Credit the settle back so the shared budget doesn't charge the text body.
    const textDeadline = deadline + MOBILE_NATIVE_CHAT_IMAGE_SETTLE_MS
    if (args.activeHandleRef.current !== handle) {
      markMobileNativeChatInputStale(handle)
      args.onError?.()
      args.onSendError('Message not sent')
      return false
    }
    const outcome = await args.baseSend(
      args.text,
      pendingImages.map((attachment) => attachment.previewUri),
      textDeadline
    )
    if (outcome !== 'accepted') {
      // 'rejected' leaves the pasted image; 'unknown' may have lost text+Enter
      // after the paste (#10228) — both must heal first.
      markMobileNativeChatInputStale(handle)
    }
    if (outcome !== 'rejected') {
      const sentIds = new Set(pendingImages.map((attachment) => attachment.id))
      args.setAttachmentsByScope((prev) =>
        withScopeAttachments(
          prev,
          scope,
          (prev[scope] ?? []).filter((attachment) => !sentIds.has(attachment.id))
        )
      )
    }
    return outcome !== 'rejected'
  } catch {
    // Keep the chips; the next attempt's leading Ctrl+U clears a partial paste.
    markMobileNativeChatInputStale(handle)
    args.onError?.()
    args.onSendError('Message not sent')
    return false
  }
}
