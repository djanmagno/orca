import {
  createDefaultWorkspaceCleanupFilterState,
  type WorkspaceCleanupFilterState
} from './workspace-cleanup-filter-model'

export type WorkspaceCleanupFacetGroupKey = keyof Omit<WorkspaceCleanupFilterState, 'query'>

export const WORKSPACE_CLEANUP_FACET_GROUP_KEYS: readonly WorkspaceCleanupFacetGroupKey[] = [
  'activity',
  'size',
  'status',
  'agent',
  'git',
  'review',
  'ticket',
  'context',
  'location',
  'safety'
]

/**
 * Whether a group's values actually narrow the fleet.
 *
 * Deliberately not a diff against defaults. Two classes break that:
 *
 * - Parameter fields (`activity.idleSignal`, `safety.blockerMode`) differ from the default
 *   while constraining nothing on their own, so a diff reports a group as on-and-inert.
 * - `0` is reachable from every numeric control. A `0` *minimum* matches every row, but
 *   `size.maxBytes: 0` hides every measured non-empty workspace while reading "At most 0 MB".
 *
 * So minimums count only above zero, and `maxBytes` counts at zero. See the group table in
 * docs/workspace-cleanup-filter-apply-plan.md, which this function is the executable copy of.
 */
export function isWorkspaceCleanupFacetGroupConstraining(
  filters: WorkspaceCleanupFilterState,
  group: WorkspaceCleanupFacetGroupKey
): boolean {
  switch (group) {
    case 'activity': {
      const { idleMinDays, neverVisited } = filters.activity
      return isPositive(idleMinDays) || neverVisited
    }
    case 'size': {
      const { minBytes, maxBytes, includeUnsized } = filters.size
      return isPositive(minBytes) || maxBytes !== null || !includeUnsized
    }
    case 'status': {
      const { workspaceStatuses, matchStatusless, archived, pinned, unread, comment } =
        filters.status
      return (
        workspaceStatuses.length > 0 ||
        !matchStatusless ||
        [archived, pinned, unread, comment].some(isTriStateSet)
      )
    }
    case 'agent': {
      const { states, retainedDoneAgents } = filters.agent
      return states.length > 0 || retainedDoneAgents !== 'any'
    }
    case 'git': {
      const { states, minAhead, minBehind, branchQuery, prunable, locked } = filters.git
      return (
        states.length > 0 ||
        isPositive(minAhead) ||
        isPositive(minBehind) ||
        branchQuery.trim().length > 0 ||
        [prunable, locked].some(isTriStateSet)
      )
    }
    case 'review': {
      const { presence, states, providers } = filters.review
      return presence !== 'any' || states.length > 0 || providers.length > 0
    }
    case 'ticket': {
      const { presence, sources } = filters.ticket
      return presence !== 'any' || sources.length > 0
    }
    case 'context': {
      const { presence, completelyEmpty } = filters.context
      return presence !== 'any' || completelyEmpty
    }
    case 'location': {
      const { hostIds, repoIds, pathPrefix } = filters.location
      return hostIds.length > 0 || repoIds.length > 0 || pathPrefix.trim().length > 0
    }
    case 'safety': {
      const { blockers, tiers, dismissed, selectableOnly } = filters.safety
      return blockers.length > 0 || tiers.length > 0 || dismissed !== 'any' || selectableOnly
    }
  }
}

/** Every group whose values currently narrow the fleet. Drives the applied-filter chips. */
export function listConstrainingWorkspaceCleanupFacetGroups(
  filters: WorkspaceCleanupFilterState
): WorkspaceCleanupFacetGroupKey[] {
  return WORKSPACE_CLEANUP_FACET_GROUP_KEYS.filter((group) =>
    isWorkspaceCleanupFacetGroupConstraining(filters, group)
  )
}

/**
 * Returns `filters` with one group reset to values that match everything. Parameter fields
 * keep their value: they constrain nothing, and resetting them would discard a user's
 * choice of *how* a filter reads once it is switched back on.
 */
export function neutralizeWorkspaceCleanupFacetGroup(
  filters: WorkspaceCleanupFilterState,
  group: WorkspaceCleanupFacetGroupKey
): WorkspaceCleanupFilterState {
  const defaults = createDefaultWorkspaceCleanupFilterState()
  switch (group) {
    case 'activity':
      return {
        ...filters,
        activity: { ...defaults.activity, idleSignal: filters.activity.idleSignal }
      }
    case 'safety':
      return {
        ...filters,
        safety: { ...defaults.safety, blockerMode: filters.safety.blockerMode }
      }
    default:
      return { ...filters, [group]: defaults[group] } as WorkspaceCleanupFilterState
  }
}

/** Neutralizes every group at once, preserving the query and leaving sort untouched. */
export function neutralizeAllWorkspaceCleanupFacetGroups(
  filters: WorkspaceCleanupFilterState
): WorkspaceCleanupFilterState {
  return WORKSPACE_CLEANUP_FACET_GROUP_KEYS.reduce(
    (next, group) => neutralizeWorkspaceCleanupFacetGroup(next, group),
    filters
  )
}

function isPositive(value: number | null): boolean {
  return value !== null && value > 0
}

function isTriStateSet(value: 'any' | 'only' | 'exclude'): boolean {
  return value !== 'any'
}
