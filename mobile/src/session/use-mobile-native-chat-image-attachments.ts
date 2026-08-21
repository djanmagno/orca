import { useCallback, useRef, useState } from 'react'
import { CLIPBOARD_IMAGE_TOO_LARGE_ERROR } from '../../../src/shared/clipboard-image'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import {
  ImageLibraryPermissionError,
  pickMobileImages,
  type MobileImageSource
} from './mobile-image-source-picker'
import {
  appendPendingNativeChatImages,
  uploadMobileNativeChatImages,
  type PendingNativeChatImage
} from './mobile-native-chat-image-attachment'
import {
  runMobileNativeChatImageSend,
  withScopeAttachments
} from './mobile-native-chat-image-submit'
import type { MobileNativeChatSendOutcome } from './mobile-native-chat-send'
import {
  acquireMobileNativeChatTerminalWrite,
  releaseMobileNativeChatTerminalWrite
} from './mobile-native-chat-terminal-write-lock'

type CurrentRef<T> = { readonly current: T }
type ShowToast = (message: string, durationMs?: number) => void

type Args = {
  readonly client: RpcClient | null
  readonly activeHandleRef: CurrentRef<string | null>
  readonly deviceTokenRef: CurrentRef<string | null>
  readonly getActiveWorktreeConnectionId: () => Promise<string | null>
  readonly connState: ConnectionState
  /** Identity of the active composer surface (same key shape as the drafts hook):
   *  chips are scoped to the tab that picked them, so a tab switch cannot ride
   *  one tab's image into another tab's terminal. Null disables attaching. */
  readonly scopeKey: string | null
  /** The native-chat input lease is ready — same gate `handleNativeChatSend` uses. */
  readonly enabled: boolean
  readonly showToast: ShowToast
  /** Send failures go to the composer's inline banner, not the toast — the same
   *  channel the controller's own rejections use, so one failure paints once. */
  readonly onSendError: (message: string) => void
  /** The plain text send (controller.handleNativeChatSendWithOutcome); wrapped so
   *  images ride along. The optional URIs drive the optimistic echo's thumbnails.
   *  Must preserve 'unknown': after a successful paste, an ambiguously-delivered
   *  text+Enter may have left the image on the input line, which needs healing.
   *  Accepts this action's budget so the text body draws from what the paste left
   *  rather than opening a second one. */
  readonly baseSend: (
    text: string,
    imagePreviewUris?: string[],
    deadline?: number
  ) => Promise<MobileNativeChatSendOutcome>
  /** Launch-context text parked on the agent's TUI input line, or null. The
   *  paste's leading clear must cover every line of it, or the draft's earlier
   *  lines survive and ride along with the image. */
  readonly readSeededLaunchDraft: () => string | null
  readonly onAttachSuccess?: () => void
  readonly onError?: () => void
  // Injected so the settle between image paste and submit is instant in tests.
  readonly sleep?: (ms: number) => Promise<void>
}

export type MobileNativeChatImageAttachments = {
  /** Pending chips for the active scope (tab) only. */
  readonly attachments: PendingNativeChatImage[]
  readonly isAttaching: boolean
  readonly attachImage: (source: MobileImageSource) => Promise<void>
  readonly removeAttachment: (id: string) => void
  /** Ride any pending images along with `text`, then submit; clears the sent
   *  chips (and only those) once the send is accepted. */
  readonly sendNativeChat: (text: string) => Promise<boolean>
}

const NO_ATTACHMENTS: PendingNativeChatImage[] = []

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export function useMobileNativeChatImageAttachments({
  client,
  activeHandleRef,
  deviceTokenRef,
  getActiveWorktreeConnectionId,
  connState,
  scopeKey,
  enabled,
  showToast,
  onSendError,
  baseSend,
  readSeededLaunchDraft,
  onAttachSuccess,
  onError,
  sleep = defaultSleep
}: Args): MobileNativeChatImageAttachments {
  const [attachmentsByScope, setAttachmentsByScope] = useState<
    Record<string, PendingNativeChatImage[]>
  >({})
  const [isAttaching, setIsAttaching] = useState(false)
  const idCounter = useRef(0)
  // Count in-flight uploads so an overlapping attach can't clear the flag early.
  const attachingCount = useRef(0)
  // Live connState for attachImage's catch: the closure's value was already
  // checked 'connected' at entry, so only a ref can see a mid-upload disconnect.
  const connStateRef = useRef(connState)
  connStateRef.current = connState

  const attachments = (scopeKey ? attachmentsByScope[scopeKey] : undefined) ?? NO_ATTACHMENTS

  const attachImage = useCallback(
    async (source: MobileImageSource): Promise<void> => {
      // The chip lands in the scope that initiated the pick, even if the user
      // switches tabs while the upload is in flight.
      const scope = scopeKey
      if (!client || !scope || !activeHandleRef.current || connState !== 'connected') {
        return
      }
      // Only this call's own increment may be undone in `finally`; a cancelled
      // pick or pre-upload error never ran `onUploadStart`, so decrementing the
      // shared counter would clear a concurrent upload's in-flight flag early.
      let started = false
      const uploadedImages: Omit<PendingNativeChatImage, 'id'>[] = []
      let uploadError: unknown = null
      try {
        await uploadMobileNativeChatImages(source, {
          client,
          getConnectionId: getActiveWorktreeConnectionId,
          pickImages: pickMobileImages,
          onImageUploaded: (image) => uploadedImages.push(image),
          onUploadStart: () => {
            started = true
            attachingCount.current += 1
            setIsAttaching(true)
          }
        })
      } catch (error) {
        uploadError = error
      } finally {
        if (started) {
          attachingCount.current -= 1
          if (attachingCount.current === 0) {
            setIsAttaching(false)
          }
        }
      }
      if (uploadedImages.length > 0) {
        setAttachmentsByScope((prev) => ({
          ...prev,
          [scope]: appendPendingNativeChatImages(prev[scope] ?? [], uploadedImages, idCounter)
        }))
        onAttachSuccess?.()
      }
      if (uploadError !== null) {
        const message = uploadError instanceof Error ? uploadError.message : String(uploadError)
        onError?.()
        if (connStateRef.current !== 'connected') {
          showToast('Attach failed (disconnected)', 1500)
          return
        }
        if (uploadError instanceof ImageLibraryPermissionError) {
          showToast('Photo permission denied', 1500)
          return
        }
        if (message === CLIPBOARD_IMAGE_TOO_LARGE_ERROR) {
          showToast('Image too large to attach', 1500)
          return
        }
        showToast('Attach failed', 1500)
      }
    },
    [
      activeHandleRef,
      client,
      connState,
      getActiveWorktreeConnectionId,
      onAttachSuccess,
      onError,
      scopeKey,
      showToast
    ]
  )

  const removeAttachment = useCallback(
    (id: string): void => {
      const scope = scopeKey
      if (!scope) {
        return
      }
      setAttachmentsByScope((prev) =>
        withScopeAttachments(
          prev,
          scope,
          (prev[scope] ?? []).filter((attachment) => attachment.id !== id)
        )
      )
    },
    [scopeKey]
  )

  const sendNativeChat = useCallback(
    async (text: string): Promise<boolean> => {
      // Serialize clear/paste/submit ownership per terminal while allowing other
      // tabs to send. Shared with the prompt-card writes (answer/permission), so
      // a card tap can't interleave into a mid-flight paste sequence either.
      const operationTerminal = activeHandleRef.current
      if (operationTerminal && !acquireMobileNativeChatTerminalWrite(operationTerminal)) {
        onError?.()
        onSendError('Message not sent')
        return false
      }
      try {
        return await runMobileNativeChatImageSend({
          client,
          activeHandleRef,
          deviceTokenRef,
          connState,
          scopeKey,
          enabled,
          attachmentsByScope,
          text,
          baseSend,
          readSeededLaunchDraft,
          sleep,
          onError,
          onSendError,
          setAttachmentsByScope
        })
      } finally {
        if (operationTerminal) {
          releaseMobileNativeChatTerminalWrite(operationTerminal)
        }
      }
    },
    [
      activeHandleRef,
      attachmentsByScope,
      baseSend,
      client,
      connState,
      deviceTokenRef,
      enabled,
      onError,
      onSendError,
      readSeededLaunchDraft,
      scopeKey,
      sleep
    ]
  )

  return { attachments, isAttaching, attachImage, removeAttachment, sendNativeChat }
}
