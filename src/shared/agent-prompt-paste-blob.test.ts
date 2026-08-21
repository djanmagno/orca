import { describe, expect, it } from 'vitest'
import {
  isUnsubmittedAgentPasteBlob,
  observeUnsubmittedAgentPasteBlob
} from './agent-prompt-paste-blob'

describe('unsubmitted agent paste blob', () => {
  it('detects Codex collapsed-paste placeholders', () => {
    expect(isUnsubmittedAgentPasteBlob('[Pasted Content 4508 chars]')).toBe(true)
    expect(isUnsubmittedAgentPasteBlob('composer [Pasted Content 1 char] idle')).toBe(true)
    expect(isUnsubmittedAgentPasteBlob('Ask Codex to do something')).toBe(false)
  })

  it('detects a blob marker split across PTY chunks', () => {
    const first = observeUnsubmittedAgentPasteBlob('', '[Pasted Con')
    expect(first.detected).toBe(false)
    const second = observeUnsubmittedAgentPasteBlob(first.carry, 'tent 7348 chars]')
    expect(second.detected).toBe(true)
  })
})
