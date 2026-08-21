/** Codex collapses a large composer paste into this placeholder until Enter submits it. */
const UNSUBMITTED_PASTE_BLOB = /\[Pasted Content \d+ chars?\]/
const PASTE_BLOB_CARRY_MAX = 32

export function isUnsubmittedAgentPasteBlob(output: string): boolean {
  return UNSUBMITTED_PASTE_BLOB.test(output)
}

/** Scan PTY output that may split the blob marker across chunks. */
export function observeUnsubmittedAgentPasteBlob(
  carry: string,
  chunk: string
): { detected: boolean; carry: string } {
  const combined = `${carry}${chunk}`
  return {
    detected: isUnsubmittedAgentPasteBlob(combined),
    carry: combined.slice(-PASTE_BLOB_CARRY_MAX)
  }
}
