import { normalizeWorkspaceCleanupBrowseState } from '../../../shared/workspace-cleanup-browse-state'
import {
  listConstrainingWorkspaceCleanupFacetGroups,
  neutralizeAllWorkspaceCleanupFacetGroups
} from '../../../shared/workspace-cleanup-facet-group-effect'
import type { WorkspaceCleanupUIState } from '../../../shared/workspace-cleanup'

/**
 * One-shot repair for cleanup filters a wheel tick could have set without the user knowing.
 *
 * Returns `undefined` when there is nothing to change, so the caller can skip the write
 * entirely. When it does return state it carries `dismissals` through byte-identical:
 * `browse` and `dismissals` share one object, and `dismissed` gates whether an Ignored row
 * is hidden, so replacing the object instead of spreading it would unhide every one.
 *
 * The query and sort survive too. A wheel cannot type into a text field, so a saved query is
 * something the user demonstrably set on purpose.
 */
export function neutralizeStoredWorkspaceCleanupFilters(
  stored: WorkspaceCleanupUIState | undefined
): WorkspaceCleanupUIState | undefined {
  if (!stored?.browse) {
    return undefined
  }
  const browse = normalizeWorkspaceCleanupBrowseState(stored.browse)
  if (listConstrainingWorkspaceCleanupFacetGroups(browse.filters).length === 0) {
    return undefined
  }
  return {
    ...stored,
    browse: { ...browse, filters: neutralizeAllWorkspaceCleanupFacetGroups(browse.filters) }
  }
}
