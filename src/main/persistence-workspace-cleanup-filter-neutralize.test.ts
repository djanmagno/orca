import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { testState, createStore, writeDataFile } from './persistence-test-harness'

const { loadUserSshConfigMock, sshConfigHostsToTargetsMock } = vi.hoisted(() => ({
  loadUserSshConfigMock: vi.fn(),
  sshConfigHostsToTargetsMock: vi.fn()
}))

vi.mock('./ssh/ssh-config-parser', () => ({
  loadUserSshConfig: loadUserSshConfigMock,
  sshConfigHostsToTargets: sshConfigHostsToTargetsMock
}))

const { trackMock, getCohortAtEmitMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
  getCohortAtEmitMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => testState.dir },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (plaintext: string) => Buffer.from(plaintext, 'utf-8'),
    decryptString: (ciphertext: Buffer) => ciphertext.toString('utf-8')
  }
}))

vi.mock('./telemetry/client', () => ({ track: trackMock }))
vi.mock('./telemetry/cohort-classifier', () => ({ getCohortAtEmit: getCohortAtEmitMock }))

const DISMISSAL = {
  worktreeId: 'repo-1::/repo/one',
  dismissedAt: 1_700_000_000_000,
  fingerprint: 'fp-1',
  classifierVersion: 2
}

function writeProfile(ui: Record<string, unknown>): void {
  writeDataFile({
    schemaVersion: 1,
    repos: [],
    worktreeMeta: {},
    settings: {},
    ui,
    githubCache: { pr: {}, issue: {} },
    workspaceSession: {}
  })
}

function browseWith(filters: Record<string, unknown>): Record<string, unknown> {
  return {
    version: 1,
    filters: { query: '', ...filters },
    sort: { field: 'last-activity', direction: 'asc' }
  }
}

describe('workspace cleanup filter neutralize on load', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-test-'))
    trackMock.mockReset()
    getCohortAtEmitMock.mockReset()
    getCohortAtEmitMock.mockReturnValue({ nth_repo_added: 2 })
  })

  afterEach(() => {
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('clears a wheel-set idle threshold once and stamps the marker', async () => {
    writeProfile({
      workspaceCleanup: {
        dismissals: { [DISMISSAL.worktreeId]: DISMISSAL },
        browse: browseWith({ activity: { idleSignal: 'last-visited', idleMinDays: 20, neverVisited: false } })
      }
    })

    const store = await createStore()

    expect(store.getUI().workspaceCleanup?.browse?.filters.activity.idleMinDays).toBeNull()
    expect(store.getUI()._workspaceCleanupFiltersNeutralized).toBe(true)
  })

  it('keeps every dismissal, so Ignored rows stay ignored', async () => {
    writeProfile({
      workspaceCleanup: {
        dismissals: { [DISMISSAL.worktreeId]: DISMISSAL },
        browse: browseWith({ activity: { idleSignal: 'last-visited', idleMinDays: 20, neverVisited: false } })
      }
    })

    const store = await createStore()

    expect(store.getUI().workspaceCleanup?.dismissals).toEqual({ [DISMISSAL.worktreeId]: DISMISSAL })
  })

  it('does not re-clear a filter the user deliberately set after the migration ran', async () => {
    writeProfile({
      _workspaceCleanupFiltersNeutralized: true,
      workspaceCleanup: {
        dismissals: {},
        browse: browseWith({ activity: { idleSignal: 'last-visited', idleMinDays: 45, neverVisited: false } })
      }
    })

    const store = await createStore()

    expect(store.getUI().workspaceCleanup?.browse?.filters.activity.idleMinDays).toBe(45)
  })

  it('stamps the marker even for a profile with nothing to clear', async () => {
    writeProfile({})

    const store = await createStore()

    expect(store.getUI()._workspaceCleanupFiltersNeutralized).toBe(true)
  })
})
