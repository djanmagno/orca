import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type { FileRangeReadResult, FileStat, IFilesystemProvider } from '../providers/types'

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn<() => AgentStatusIpcPayload[]>(() => []),
  getProvider: vi.fn<(connectionId: string) => IFilesystemProvider | undefined>(() => undefined)
}))

vi.mock('../agent-hooks/server', () => ({
  agentHookServer: {
    getStatusSnapshot: mocks.getSnapshot
  }
}))

vi.mock('../providers/ssh-filesystem-dispatch', () => ({
  getSshFilesystemProvider: mocks.getProvider,
  onSshFilesystemProviderRegistered: () => () => {},
  SSH_FILESYSTEM_PROVIDER_UNAVAILABLE_MESSAGE: 'Remote connection dropped.'
}))

import { readNativeChatTranscriptTail } from './transcript-tail-reader'
import { subscribeNativeChatTranscript } from './transcript-watch'

const REMOTE_PATH = '/home/dev/.claude/projects/-repo/sess-ssh.jsonl'
const SESSION_ID = 'sess-ssh'
const CONNECTION_ID = 'dev-box'
const UNVERIFIABLE_MESSAGE = 'Transcript unverifiable on the remote host'

const claudeLine = JSON.stringify({
  type: 'assistant',
  uuid: 'a-ssh',
  message: { role: 'assistant', content: [{ type: 'text', text: 'hello from ssh' }] }
})

let tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots = []
})

beforeEach(() => {
  mocks.getSnapshot.mockReset()
  mocks.getSnapshot.mockReturnValue([])
  mocks.getProvider.mockReset()
  mocks.getProvider.mockReturnValue(undefined)
})

function sshHookRow(overrides: Partial<AgentStatusIpcPayload> = {}): AgentStatusIpcPayload {
  return {
    paneKey: 'tab-1:11111111-1111-4111-8111-111111111111',
    connectionId: CONNECTION_ID,
    receivedAt: 1_700_000_000_000,
    stateStartedAt: 1_700_000_000_000,
    state: 'working',
    prompt: '',
    agentType: 'claude',
    providerSession: {
      key: 'session_id',
      id: SESSION_ID,
      transcriptPath: REMOTE_PATH
    },
    ...overrides
  }
}

function memoryFilesystem(files: Map<string, Buffer>): IFilesystemProvider {
  return {
    async stat(filePath: string): Promise<FileStat> {
      const data = files.get(filePath)
      if (!data) {
        const error = new Error(
          `ENOENT: no such file or directory, lstat '${filePath}'`
        ) as Error & {
          code: string
        }
        error.code = 'ENOENT'
        throw error
      }
      return {
        size: data.length,
        type: 'file',
        mtime: 1,
        mtimeMs: 1,
        dev: 8,
        ino: 99
      }
    },
    async readFileRange(
      filePath: string,
      position: number,
      length: number
    ): Promise<FileRangeReadResult> {
      const data = files.get(filePath)
      if (!data) {
        const error = new Error(
          `ENOENT: no such file or directory, open '${filePath}'`
        ) as Error & {
          code: string
        }
        error.code = 'ENOENT'
        throw error
      }
      const bytes = data.subarray(position, position + length)
      return { bytes, bytesRead: bytes.length }
    },
    async supportsFileRangeRead(): Promise<boolean> {
      return true
    },
    readDir: notExpected('readDir'),
    readFile: notExpected('readFile'),
    writeFile: notExpected('writeFile'),
    writeFileBase64: notExpected('writeFileBase64'),
    writeFileBase64Chunk: notExpected('writeFileBase64Chunk'),
    deletePath: notExpected('deletePath'),
    createFile: notExpected('createFile'),
    createDir: notExpected('createDir'),
    createDirNoClobber: notExpected('createDirNoClobber'),
    rename: notExpected('rename'),
    renameNoClobber: notExpected('renameNoClobber'),
    copy: notExpected('copy'),
    realpath: notExpected('realpath'),
    search: notExpected('search'),
    listFiles: notExpected('listFiles'),
    watch: notExpected('watch')
  }
}

function notExpected(name: string): () => Promise<never> {
  return async () => {
    throw new Error(`unexpected filesystem method ${name}`)
  }
}

describe('native chat SSH transcript routing', () => {
  it('reads an SSH worktree transcript from the execution host so frames can arrive', async () => {
    const files = new Map([[REMOTE_PATH, Buffer.from(`${claudeLine}\n`)]])
    mocks.getSnapshot.mockReturnValue([sshHookRow()])
    mocks.getProvider.mockReturnValue(memoryFilesystem(files))

    const result = await readNativeChatTranscriptTail({
      agent: 'claude',
      sessionId: SESSION_ID,
      transcriptPath: REMOTE_PATH,
      limit: 40
    })

    expect(result).toMatchObject({
      messages: [{ id: 'a-ssh' }],
      hasMore: false
    })
    expect(mocks.getProvider).toHaveBeenCalledWith(CONNECTION_ID)
  })

  it('keeps a local transcript path working when no SSH owner exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-native-chat-local-'))
    tempRoots.push(root)
    const filePath = join(root, 'local.jsonl')
    await mkdir(root, { recursive: true })
    await writeFile(filePath, `${claudeLine}\n`)

    const result = await readNativeChatTranscriptTail({
      agent: 'claude',
      sessionId: 'sess-local',
      filePath,
      limit: 40
    })

    expect(result).toMatchObject({
      messages: [{ id: 'a-ssh' }]
    })
    expect(mocks.getProvider).not.toHaveBeenCalled()
  })

  it('reports unverifiable when the SSH host cannot be reached, not a missing transcript', async () => {
    mocks.getSnapshot.mockReturnValue([sshHookRow()])
    mocks.getProvider.mockReturnValue(undefined)

    const result = await readNativeChatTranscriptTail({
      agent: 'claude',
      sessionId: SESSION_ID,
      transcriptPath: REMOTE_PATH,
      limit: 40
    })

    expect(result).toEqual({
      error: UNVERIFIABLE_MESSAGE,
      unverifiable: true
    })
    expect(result).not.toMatchObject({ notFound: true })
  })

  it('subscribes to an SSH transcript and delivers the initial snapshot', async () => {
    const files = new Map([[REMOTE_PATH, Buffer.from(`${claudeLine}\n`)]])
    mocks.getSnapshot.mockReturnValue([sshHookRow()])
    mocks.getProvider.mockReturnValue(memoryFilesystem(files))
    const onInitialSnapshot = vi.fn()

    const subscription = await subscribeNativeChatTranscript({
      agent: 'claude',
      sessionId: SESSION_ID,
      transcriptPath: REMOTE_PATH,
      initialLimit: 40,
      onAppend: () => {},
      onInitialSnapshot,
      debounceMs: 0,
      reconciliationIntervalMs: 10_000
    })

    await vi.waitFor(() => {
      expect(onInitialSnapshot).toHaveBeenCalled()
    })
    expect(onInitialSnapshot.mock.calls[0]?.[0]).toMatchObject([{ id: 'a-ssh' }])
    expect(subscription.watching).toBe(true)
    subscription.unsubscribe()
  })

  it('keeps watching an unreachable SSH host as unverifiable instead of a false empty transcript', async () => {
    mocks.getSnapshot.mockReturnValue([sshHookRow()])
    mocks.getProvider.mockReturnValue(undefined)
    const onInitialSnapshot = vi.fn()

    const subscription = await subscribeNativeChatTranscript({
      agent: 'claude',
      sessionId: SESSION_ID,
      transcriptPath: REMOTE_PATH,
      initialLimit: 40,
      onAppend: () => {},
      onInitialSnapshot,
      resolvePollIntervalMs: 20
    })

    await vi.waitFor(() => {
      expect(onInitialSnapshot).toHaveBeenCalled()
    })
    expect(subscription.watching).toBe(true)
    expect(onInitialSnapshot.mock.calls[0]?.[3]).toBe(UNVERIFIABLE_MESSAGE)
    expect(onInitialSnapshot.mock.calls[0]?.[0]).toEqual([])
    subscription.unsubscribe()
  })

  it('treats a host that cannot serve ranged reads as unverifiable, not missing', async () => {
    mocks.getSnapshot.mockReturnValue([sshHookRow()])
    const files = new Map([[REMOTE_PATH, Buffer.from(`${claudeLine}\n`)]])
    const filesystem = memoryFilesystem(files)
    filesystem.readFileRange = undefined
    filesystem.supportsFileRangeRead = async () => false
    mocks.getProvider.mockReturnValue(filesystem)

    const result = await readNativeChatTranscriptTail({
      agent: 'claude',
      sessionId: SESSION_ID,
      transcriptPath: REMOTE_PATH,
      limit: 40
    })

    expect(result).toEqual({
      error: UNVERIFIABLE_MESSAGE,
      unverifiable: true
    })
  })

  it('does not reroute an explicit local filePath onto the SSH host', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-native-chat-explicit-'))
    tempRoots.push(root)
    const filePath = join(root, 'explicit.jsonl')
    await writeFile(filePath, `${claudeLine}\n`)
    mocks.getSnapshot.mockReturnValue([sshHookRow()])
    mocks.getProvider.mockReturnValue(memoryFilesystem(new Map()))

    const result = await readNativeChatTranscriptTail({
      agent: 'claude',
      sessionId: SESSION_ID,
      filePath,
      limit: 40
    })

    expect(result).toMatchObject({ messages: [{ id: 'a-ssh' }] })
    expect(mocks.getProvider).not.toHaveBeenCalled()
  })

  it('does not treat a WSL hook connection as an SSH execution host', async () => {
    mocks.getSnapshot.mockReturnValue([
      sshHookRow({
        connectionId: 'wsl:Ubuntu',
        providerSession: {
          key: 'session_id',
          id: SESSION_ID,
          transcriptPath: REMOTE_PATH
        }
      })
    ])

    const result = await readNativeChatTranscriptTail({
      agent: 'claude',
      sessionId: SESSION_ID,
      transcriptPath: REMOTE_PATH,
      limit: 40
    })

    expect(result).toMatchObject({ notFound: true })
    expect(mocks.getProvider).not.toHaveBeenCalled()
  })
})
