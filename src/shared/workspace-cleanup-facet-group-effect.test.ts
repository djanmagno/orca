import { describe, expect, it } from 'vitest'
import { createDefaultWorkspaceCleanupFilterState } from './workspace-cleanup-filter-model'
import {
  isWorkspaceCleanupFacetGroupConstraining,
  listConstrainingWorkspaceCleanupFacetGroups,
  neutralizeAllWorkspaceCleanupFacetGroups,
  neutralizeWorkspaceCleanupFacetGroup,
  WORKSPACE_CLEANUP_FACET_GROUP_KEYS
} from './workspace-cleanup-facet-group-effect'

describe('workspace cleanup facet group effect', () => {
  it('reports no group as constraining for a default profile', () => {
    expect(
      listConstrainingWorkspaceCleanupFacetGroups(createDefaultWorkspaceCleanupFilterState())
    ).toEqual([])
  })

  it('covers exactly the ten facet groups', () => {
    // Archived is a choice inside Workspace status, not an eleventh group.
    expect(WORKSPACE_CLEANUP_FACET_GROUP_KEYS).toHaveLength(10)
    expect(WORKSPACE_CLEANUP_FACET_GROUP_KEYS).not.toContain('archived')
  })

  describe('numeric zero', () => {
    it('treats a zero minimum as inert because it matches every row', () => {
      const filters = createDefaultWorkspaceCleanupFilterState()
      filters.activity.idleMinDays = 0
      filters.size.minBytes = 0
      filters.git.minAhead = 0
      filters.git.minBehind = 0

      expect(isWorkspaceCleanupFacetGroupConstraining(filters, 'activity')).toBe(false)
      expect(isWorkspaceCleanupFacetGroupConstraining(filters, 'size')).toBe(false)
      expect(isWorkspaceCleanupFacetGroupConstraining(filters, 'git')).toBe(false)
    })

    it('treats a zero maximum as constraining because it hides every measured row', () => {
      const filters = createDefaultWorkspaceCleanupFilterState()
      filters.size.maxBytes = 0

      expect(isWorkspaceCleanupFacetGroupConstraining(filters, 'size')).toBe(true)
    })
  })

  describe('parameter fields', () => {
    it('ignores an idle signal with no threshold behind it', () => {
      const filters = createDefaultWorkspaceCleanupFilterState()
      filters.activity.idleSignal = 'created'

      expect(isWorkspaceCleanupFacetGroupConstraining(filters, 'activity')).toBe(false)
    })

    it('ignores a blocker mode with an empty blocker list', () => {
      const filters = createDefaultWorkspaceCleanupFilterState()
      filters.safety.blockerMode = 'any-of'

      expect(isWorkspaceCleanupFacetGroupConstraining(filters, 'safety')).toBe(false)
    })
  })

  describe('whitespace-only text', () => {
    it('ignores a branch query and path prefix that are only spaces', () => {
      const filters = createDefaultWorkspaceCleanupFilterState()
      filters.git.branchQuery = '   '
      filters.location.pathPrefix = '  '

      expect(isWorkspaceCleanupFacetGroupConstraining(filters, 'git')).toBe(false)
      expect(isWorkspaceCleanupFacetGroupConstraining(filters, 'location')).toBe(false)
    })
  })

  describe('default-true booleans constrain when switched off', () => {
    it('counts an excluded unsized set', () => {
      const filters = createDefaultWorkspaceCleanupFilterState()
      filters.size.includeUnsized = false

      expect(isWorkspaceCleanupFacetGroupConstraining(filters, 'size')).toBe(true)
    })

    it('counts an excluded statusless set', () => {
      const filters = createDefaultWorkspaceCleanupFilterState()
      filters.status.matchStatusless = false

      expect(isWorkspaceCleanupFacetGroupConstraining(filters, 'status')).toBe(true)
    })
  })

  it('counts each remaining group when its own constraining field is set', () => {
    const cases: [string, (f: ReturnType<typeof createDefaultWorkspaceCleanupFilterState>) => void][] =
      [
        ['activity', (f) => (f.activity.neverVisited = true)],
        ['status', (f) => (f.status.archived = 'only')],
        ['agent', (f) => (f.agent.retainedDoneAgents = 'only')],
        ['git', (f) => (f.git.states = ['dirty'])],
        ['review', (f) => (f.review.presence = 'some')],
        ['ticket', (f) => (f.ticket.sources = ['linear'])],
        ['context', (f) => (f.context.completelyEmpty = true)],
        ['location', (f) => (f.location.hostIds = ['local'])],
        ['safety', (f) => (f.safety.dismissed = 'only')]
      ]

    for (const [group, mutate] of cases) {
      const filters = createDefaultWorkspaceCleanupFilterState()
      mutate(filters)
      expect(
        isWorkspaceCleanupFacetGroupConstraining(
          filters,
          group as (typeof WORKSPACE_CLEANUP_FACET_GROUP_KEYS)[number]
        ),
        `${group} should be constraining`
      ).toBe(true)
    }
  })

  describe('neutralize', () => {
    it('clears a group and leaves the others alone', () => {
      const filters = createDefaultWorkspaceCleanupFilterState()
      filters.activity.idleMinDays = 20
      filters.git.states = ['dirty']

      const next = neutralizeWorkspaceCleanupFacetGroup(filters, 'activity')

      expect(next.activity.idleMinDays).toBeNull()
      expect(next.git.states).toEqual(['dirty'])
    })

    it('keeps parameter fields so a re-enabled filter reads the way the user set it', () => {
      const filters = createDefaultWorkspaceCleanupFilterState()
      filters.activity.idleSignal = 'created'
      filters.activity.idleMinDays = 20
      filters.safety.blockerMode = 'any-of'
      filters.safety.blockers = ['dirty-files']

      const next = neutralizeAllWorkspaceCleanupFacetGroups(filters)

      expect(next.activity.idleSignal).toBe('created')
      expect(next.activity.idleMinDays).toBeNull()
      expect(next.safety.blockerMode).toBe('any-of')
      expect(next.safety.blockers).toEqual([])
    })

    it('preserves the query, which a wheel tick cannot have typed', () => {
      const filters = createDefaultWorkspaceCleanupFilterState()
      filters.query = 'release'
      filters.activity.idleMinDays = 20

      expect(neutralizeAllWorkspaceCleanupFacetGroups(filters).query).toBe('release')
    })

    it('leaves nothing constraining, including inert-but-non-default values', () => {
      const filters = createDefaultWorkspaceCleanupFilterState()
      filters.activity.idleMinDays = 20
      filters.size.maxBytes = 0
      filters.status.matchStatusless = false
      filters.location.pathPrefix = '/repos'
      filters.safety.selectableOnly = true

      const next = neutralizeAllWorkspaceCleanupFacetGroups(filters)

      expect(listConstrainingWorkspaceCleanupFacetGroups(next)).toEqual([])
    })
  })
})
