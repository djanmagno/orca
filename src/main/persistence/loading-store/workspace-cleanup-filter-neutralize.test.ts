import { describe, expect, it } from 'vitest'
import { createDefaultWorkspaceCleanupBrowseState } from '../../../shared/workspace-cleanup-browse-state'
import type { WorkspaceCleanupUIState } from '../../../shared/workspace-cleanup'
import { neutralizeStoredWorkspaceCleanupFilters } from './workspace-cleanup-filter-neutralize'

const DISMISSALS: WorkspaceCleanupUIState['dismissals'] = {
  'repo-1::/repo/one': {
    worktreeId: 'repo-1::/repo/one',
    dismissedAt: 1_700_000_000_000,
    fingerprint: 'fp-1',
    classifierVersion: 2
  },
  'repo-1::/repo/two': {
    worktreeId: 'repo-1::/repo/two',
    dismissedAt: 1_700_000_001_000,
    fingerprint: 'fp-2',
    classifierVersion: 2
  }
}

function storedWith(
  mutate: (browse: ReturnType<typeof createDefaultWorkspaceCleanupBrowseState>) => void
): WorkspaceCleanupUIState {
  const browse = createDefaultWorkspaceCleanupBrowseState()
  mutate(browse)
  return { dismissals: structuredClone(DISMISSALS), browse }
}

describe('neutralizeStoredWorkspaceCleanupFilters', () => {
  it('clears the reported wheel-set idle threshold', () => {
    const stored = storedWith((browse) => {
      browse.filters.activity.idleMinDays = 20
    })

    const next = neutralizeStoredWorkspaceCleanupFilters(stored)

    expect(next?.browse?.filters.activity.idleMinDays).toBeNull()
  })

  it('carries dismissals through byte-identical', () => {
    // Why this is the load-bearing case: `browse` and `dismissals` share one object and
    // `dismissed` gates whether an Ignored row is hidden, so a whole-object write here
    // would silently unhide every row the user ignored.
    const stored = storedWith((browse) => {
      browse.filters.size.maxBytes = 0
    })

    const next = neutralizeStoredWorkspaceCleanupFilters(stored)

    expect(next?.dismissals).toEqual(DISMISSALS)
    expect(JSON.stringify(next?.dismissals)).toBe(JSON.stringify(DISMISSALS))
  })

  it('keeps the query and the sort, which a wheel tick cannot have set', () => {
    const stored = storedWith((browse) => {
      browse.filters.query = 'release'
      browse.filters.activity.idleMinDays = 20
      browse.sort = { field: 'size', direction: 'desc' }
    })

    const next = neutralizeStoredWorkspaceCleanupFilters(stored)

    expect(next?.browse?.filters.query).toBe('release')
    expect(next?.browse?.sort).toEqual({ field: 'size', direction: 'desc' })
  })

  it('clears an inert-but-non-default profile too', () => {
    // `idleMinDays: 0` matches everything, so a diff-against-defaults migration would leave
    // it set and the group would come back reading "Idle >= 0d".
    const stored = storedWith((browse) => {
      browse.filters.activity.idleMinDays = 0
      browse.filters.size.maxBytes = 0
    })

    const next = neutralizeStoredWorkspaceCleanupFilters(stored)

    expect(next?.browse?.filters.activity.idleMinDays).toBeNull()
    expect(next?.browse?.filters.size.maxBytes).toBeNull()
  })

  it('returns undefined when nothing is applied, so the load skips the write', () => {
    expect(neutralizeStoredWorkspaceCleanupFilters(storedWith(() => {}))).toBeUndefined()
  })

  it('returns undefined when only a query is set', () => {
    const stored = storedWith((browse) => {
      browse.filters.query = 'release'
    })

    expect(neutralizeStoredWorkspaceCleanupFilters(stored)).toBeUndefined()
  })

  it('returns undefined for a profile that never stored browse state', () => {
    expect(
      neutralizeStoredWorkspaceCleanupFilters({ dismissals: structuredClone(DISMISSALS) })
    ).toBeUndefined()
    expect(neutralizeStoredWorkspaceCleanupFilters(undefined)).toBeUndefined()
  })
})
