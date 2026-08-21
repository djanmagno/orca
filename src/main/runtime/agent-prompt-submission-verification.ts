export const AGENT_PROMPT_EFFECT_TIMEOUT_MS = 5_000
const AGENT_PROMPT_EFFECT_POLL_MS = 50
// Why: framed paste and Enter must not share a PTY write; this is the same
// settle native chat uses between an image paste and the following submit.
export const AGENT_PROMPT_SUBMIT_RETRY_SETTLE_MS = 300
export const AGENT_PROMPT_SUBMIT_RETRY_LIMIT = 2

export type AgentPromptActivity = Readonly<{
  generation: number
  permissionSequence: number
  workingSequence: number
  status: 'working' | 'permission' | 'idle' | null
}>

type AgentPromptVerificationOptions = {
  baseline: AgentPromptActivity
  readActivity: () => AgentPromptActivity
  hasUnsubmittedPaste?: () => boolean
  resubmit?: () => boolean
  signal?: AbortSignal
}

export async function verifyAgentPromptSubmission(
  options: AgentPromptVerificationOptions
): Promise<void> {
  throwIfAgentPromptAborted(options.signal)
  assertPromptNotBlocked(options.baseline, options.baseline)

  const deadline = Date.now() + AGENT_PROMPT_EFFECT_TIMEOUT_MS
  let retries = 0
  let lastSubmitAt = Date.now()
  while (Date.now() < deadline) {
    if (promptSubmissionTookEffect(options)) {
      return
    }
    if (shouldRetryUnsubmittedPaste(options, retries, lastSubmitAt)) {
      if (!options.resubmit?.()) {
        throw new Error('terminal_not_writable')
      }
      retries += 1
      lastSubmitAt = Date.now()
    }
    await waitForAgentPromptPoll(options.signal)
  }

  if (promptSubmissionTookEffect(options)) {
    return
  }
  throw new Error('agent_prompt_stalled')
}

function promptSubmissionTookEffect(options: AgentPromptVerificationOptions): boolean {
  const current = options.readActivity()
  assertSamePromptGeneration(options.baseline, current)
  assertPromptNotBlocked(options.baseline, current)
  return (
    agentPromptLifecycleChanged(options.baseline, current) &&
    options.hasUnsubmittedPaste?.() !== true
  )
}

function shouldRetryUnsubmittedPaste(
  options: AgentPromptVerificationOptions,
  retries: number,
  lastSubmitAt: number
): boolean {
  return (
    options.hasUnsubmittedPaste?.() === true &&
    options.resubmit != null &&
    retries < AGENT_PROMPT_SUBMIT_RETRY_LIMIT &&
    Date.now() - lastSubmitAt >= AGENT_PROMPT_SUBMIT_RETRY_SETTLE_MS
  )
}

function agentPromptLifecycleChanged(
  baseline: AgentPromptActivity,
  current: AgentPromptActivity
): boolean {
  return current.workingSequence > baseline.workingSequence
}

function assertSamePromptGeneration(
  baseline: AgentPromptActivity,
  current: AgentPromptActivity
): void {
  if (current.generation !== baseline.generation) {
    throw new Error('terminal_handle_stale')
  }
}

function assertPromptNotBlocked(baseline: AgentPromptActivity, current: AgentPromptActivity): void {
  if (current.status === 'permission' || current.permissionSequence > baseline.permissionSequence) {
    throw new Error('agent_prompt_blocked')
  }
}

function throwIfAgentPromptAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('request_aborted')
  }
}

async function waitForAgentPromptPoll(signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, AGENT_PROMPT_EFFECT_POLL_MS))
    return
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new Error('request_aborted'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, AGENT_PROMPT_EFFECT_POLL_MS)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
    }
  })
}
