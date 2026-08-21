import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_PROMPT_BRACKETED_PASTE_END,
  AGENT_PROMPT_BRACKETED_PASTE_START,
  buildAgentPromptPasteBytes
} from '../../shared/agent-prompt-injection'
import { OrcaRuntimeService } from './orca-runtime'
import { makeStore } from './runtime-rpc-worktree-store-fixtures'

const WORKTREE_PATH = '/tmp/worktree-a'
const LARGE_PROMPT = `Review this change.\n${'payload-line\n'.repeat(350)}`

vi.mock('../git/worktree', () => ({
  listWorktrees: vi.fn().mockResolvedValue([
    {
      path: '/tmp/worktree-a',
      head: 'abc',
      branch: 'feature/large-prompt-submit',
      isBare: false,
      isMainWorktree: false
    }
  ]),
  listWorktreesStrict: vi.fn().mockResolvedValue([
    {
      path: '/tmp/worktree-a',
      head: 'abc',
      branch: 'feature/large-prompt-submit',
      isBare: false,
      isMainWorktree: false
    }
  ])
}))

async function createPromptRuntime(args: {
  onWrite?: (runtime: OrcaRuntimeService, data: string) => void
}): Promise<{ runtime: OrcaRuntimeService; handle: string; writes: string[] }> {
  const runtime = new OrcaRuntimeService(makeStore() as never)
  const writes: string[] = []
  runtime.setPtyController({
    spawn: vi.fn().mockResolvedValue({ id: 'pty-prompt' }),
    write: (_ptyId, data) => {
      writes.push(data)
      args.onWrite?.(runtime, data)
      return true
    },
    kill: () => true,
    getForegroundProcess: async () => null
  })
  const terminal = await runtime.createTerminal(`path:${WORKTREE_PATH}`, {
    launchAgent: 'aider'
  })
  return { runtime, handle: terminal.handle, writes }
}

function assertPasteAndSubmitAreDistinctWrites(writes: string[], prompt: string): void {
  const pasteWrites = writes.filter((data) => data !== '\r')
  const submitWrites = writes.filter((data) => data === '\r')
  expect(pasteWrites.join('')).toBe(buildAgentPromptPasteBytes(prompt))
  expect(pasteWrites.some((data) => data.includes(AGENT_PROMPT_BRACKETED_PASTE_START))).toBe(true)
  expect(pasteWrites.some((data) => data.includes(AGENT_PROMPT_BRACKETED_PASTE_END))).toBe(true)
  expect(
    pasteWrites.some(
      (data) => data.includes(AGENT_PROMPT_BRACKETED_PASTE_END) && data.endsWith('\r')
    )
  ).toBe(false)
  expect(submitWrites.length).toBeGreaterThanOrEqual(1)
  expect(writes.indexOf('\r')).toBeGreaterThan(0)
}

describe('agent prompt paste then submit', () => {
  afterEach(() => vi.useRealTimers())

  it('submits a large Codex payload after the collapsed-paste blob, as a distinct Enter write', async () => {
    expect(Buffer.byteLength(LARGE_PROMPT, 'utf8')).toBeGreaterThan(4_500)
    const { runtime, handle, writes } = await createPromptRuntime({
      onWrite: (runtime, data) => {
        if (data.includes(AGENT_PROMPT_BRACKETED_PASTE_END)) {
          setTimeout(() => {
            runtime.onPtyData('pty-prompt', '[Pasted Content 5120 chars]\n', Date.now())
          }, 100)
        }
        if (data === '\r') {
          runtime.onPtyData(
            'pty-prompt',
            'Working\nanalyzing\nreading\nplanning\napplying\nrunning\n\x1b]0;Codex working\x07',
            Date.now()
          )
        }
      }
    })
    vi.useFakeTimers()

    const submission = runtime.sendTerminalAgentPrompt(handle, LARGE_PROMPT)
    await vi.advanceTimersByTimeAsync(0)
    expect(writes.some((data) => data.includes(AGENT_PROMPT_BRACKETED_PASTE_END))).toBe(true)
    expect(writes).not.toContain('\r')

    await vi.advanceTimersByTimeAsync(400)
    expect(writes).toContain('\r')
    await expect(submission).resolves.toMatchObject({ accepted: true })
    assertPasteAndSubmitAreDistinctWrites(writes, LARGE_PROMPT)
    expect(writes.filter((data) => data === '\r')).toHaveLength(1)
  })

  it('still submits a small payload with paste and Enter as distinct writes', async () => {
    vi.useFakeTimers()
    const prompt = 'review this'
    const { runtime, handle, writes } = await createPromptRuntime({
      onWrite: (runtime, data) => {
        if (data === '\r') {
          runtime.onPtyData('pty-prompt', '\x1b]0;Codex working\x07', Date.now())
        }
      }
    })

    const submission = runtime.sendTerminalAgentPrompt(handle, prompt)
    await vi.runAllTimersAsync()

    await expect(submission).resolves.toMatchObject({ accepted: true })
    assertPasteAndSubmitAreDistinctWrites(writes, prompt)
    expect(writes.filter((data) => data === '\r')).toHaveLength(1)
  })

  it('does not report accepted while Codex still shows an unsubmitted paste blob', async () => {
    vi.useFakeTimers()
    const { runtime, handle, writes } = await createPromptRuntime({
      onWrite: (runtime, data) => {
        if (data === '\r') {
          runtime.onPtyData(
            'pty-prompt',
            '[Pasted Content 5120 chars]\n\x1b]0;Codex working\x07',
            Date.now()
          )
        }
      }
    })

    const submission = runtime.sendTerminalAgentPrompt(handle, LARGE_PROMPT)
    const rejected = expect(submission).rejects.toThrow('agent_prompt_stalled')
    await vi.runAllTimersAsync()

    await rejected
    expect(writes.some((data) => data.includes(AGENT_PROMPT_BRACKETED_PASTE_END))).toBe(true)
    expect(writes.filter((data) => data === '\r').length).toBeGreaterThanOrEqual(1)
  })
})
