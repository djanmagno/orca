/** Host could not be asked. Never collapse this into a missing file or an exit. */
export const TRANSCRIPT_UNVERIFIABLE_MESSAGE = 'Transcript unverifiable on the remote host'

export class TranscriptHostUnverifiableError extends Error {
  readonly verdict = 'unverifiable' as const

  constructor(message = TRANSCRIPT_UNVERIFIABLE_MESSAGE) {
    super(message)
    this.name = 'TranscriptHostUnverifiableError'
  }
}

export function transcriptUnverifiableResult(): {
  error: string
  unverifiable: true
} {
  return { error: TRANSCRIPT_UNVERIFIABLE_MESSAGE, unverifiable: true }
}
