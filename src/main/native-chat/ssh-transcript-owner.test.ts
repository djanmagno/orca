import { describe, expect, it, vi } from 'vitest'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn<() => AgentStatusIpcPayload[]>(() => [])
}))

vi.mock('../agent-hooks/server', () => ({
  agentHookServer: {
    getStatusSnapshot: mocks.getSnapshot
  }
}))

import { resolveNativeChatSshOwner } from './ssh-transcript-owner'

function row(
  overrides: Partial<AgentStatusIpcPayload> & {
    connectionId: string | null
    sessionId: string
    transcriptPath?: string
    receivedAt: number
  }
): AgentStatusIpcPayload {
  return {
    paneKey: 'tab-1:11111111-1111-4111-8111-111111111111',
    stateStartedAt: overrides.receivedAt,
    state: 'working',
    prompt: '',
    agentType: 'claude',
    providerSession: {
      key: 'session_id',
      id: overrides.sessionId,
      ...(overrides.transcriptPath ? { transcriptPath: overrides.transcriptPath } : {})
    },
    ...overrides
  }
}

describe('resolveNativeChatSshOwner', () => {
  it('selects the newest same-session SSH row', () => {
    mocks.getSnapshot.mockReturnValue([
      row({
        connectionId: 'old-box',
        sessionId: 'sess-1',
        transcriptPath: '/old.jsonl',
        receivedAt: 10
      }),
      row({
        connectionId: 'new-box',
        sessionId: 'sess-1',
        transcriptPath: '/new.jsonl',
        receivedAt: 20
      })
    ])
    expect(resolveNativeChatSshOwner({ sessionId: 'sess-1' })).toEqual({
      connectionId: 'new-box',
      transcriptPath: '/new.jsonl'
    })
  })

  it('uses transcript path only to disambiguate among the same session', () => {
    mocks.getSnapshot.mockReturnValue([
      row({
        connectionId: 'other-session',
        sessionId: 'sess-b',
        transcriptPath: '/shared.jsonl',
        receivedAt: 50
      }),
      row({
        connectionId: 'same-session',
        sessionId: 'sess-a',
        transcriptPath: '/shared.jsonl',
        receivedAt: 1
      })
    ])
    expect(
      resolveNativeChatSshOwner({ sessionId: 'sess-a', transcriptPath: '/shared.jsonl' })
    ).toEqual({
      connectionId: 'same-session',
      transcriptPath: '/shared.jsonl'
    })
  })

  it('ignores WSL hook connections and local rows', () => {
    mocks.getSnapshot.mockReturnValue([
      row({
        connectionId: 'wsl:Ubuntu',
        sessionId: 'sess-1',
        transcriptPath: '/guest.jsonl',
        receivedAt: 10
      }),
      row({
        connectionId: null,
        sessionId: 'sess-1',
        transcriptPath: '/local.jsonl',
        receivedAt: 20
      })
    ])
    expect(resolveNativeChatSshOwner({ sessionId: 'sess-1' })).toBeNull()
  })
})
