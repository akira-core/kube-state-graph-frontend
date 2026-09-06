import { type Dispatch, type SetStateAction, useCallback } from 'react';

export interface CollapseGroup {
  // True when every id in the group is currently collapsed (and the group is
  // non-empty) — drives the toggle's expand-vs-collapse icon/label.
  allCollapsed: boolean;
  // Collapse the whole group, or expand it if it is already fully collapsed.
  toggle: () => void;
}

// Collapse/expand a set of container ids as one unit. Shared by the cluster and
// K8s-node legend toggles, which differ only in which id list they act on.
export function useCollapseGroup(
  ids: readonly string[],
  collapsedIds: ReadonlySet<string>,
  setCollapsedIds: Dispatch<SetStateAction<Set<string>>>
): CollapseGroup {
  const allCollapsed = ids.length > 0 && ids.every((id) => collapsedIds.has(id));
  const toggle = useCallback(() => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      const collapseThem = !ids.every((id) => prev.has(id));
      for (const id of ids) {
        if (collapseThem) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  }, [ids, setCollapsedIds]);
  return { allCollapsed, toggle };
}
