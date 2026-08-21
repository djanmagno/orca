type AgentPromptSendReceipt = {
  accepted: boolean
}

/** Bytes on the PTY are not a submit. Callers must not mark injection accepted without this. */
export function requireAgentPromptSendAccepted(send: AgentPromptSendReceipt): void {
  if (!send.accepted) {
    throw new Error('agent_prompt_stalled')
  }
}
