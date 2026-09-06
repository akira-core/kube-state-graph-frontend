import type cytoscape from 'cytoscape';
import { useEffect } from 'react';

const CUE_EVENTS = 'expandcollapse.aftercollapse expandcollapse.afterexpand';
const COLLAPSED_NODE_CLASS = 'cy-expand-collapse-collapsed-node';
// Re-init guard (cy.scratch): a 2nd cy.expandCollapse(options) on the SAME instance
// fully re-inits — extra cue canvas + duplicate, unremovable internal listeners.
// Init once per instance, 'get' afterwards.
const SCRATCH_INIT_KEY = '_ksgExpandCollapseInit';

export interface UseExpandCollapseProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  // Gate: never touch the (possibly unregistered) extension on the no-collapse path.
  enabled: boolean;
  isReady: boolean;
  // This hook WRITES the api; useCytoscape READS it.
  apiRef: React.MutableRefObject<cytoscape.ExpandCollapseApi | null>;
  // Mirror of KsgPanel.collapsedIds; read by useCytoscape, not by this hook.
  collapsedIdsRef: React.MutableRefObject<ReadonlySet<string>>;
  // Set true by useCytoscape during programmatic expand/collapse so the echoed cue
  // events do not loop back as user actions.
  suppressRef: React.MutableRefObject<boolean>;
  onCollapsedChange: (next: Set<string>) => void;
  // Lets GraphCanvas rerun useGraphLayout ON the collapsed graph (rule 2: single
  // source of cy.layout). Needed because the mount-time default-collapse runs
  // layoutBy:null AFTER useGraphLayout's pass (this hook is declared last), so the
  // only layout ran while expanded, leaving collapsed parents stacked at origin.
  onMountCollapseApplied?: () => void;
}

export function useExpandCollapse({
  cyRef,
  enabled,
  isReady,
  apiRef,
  collapsedIdsRef,
  suppressRef,
  onCollapsedChange,
  onMountCollapseApplied,
}: UseExpandCollapseProps): void {
  useEffect(() => {
    const cy = cyRef.current;
    if (!enabled || !isReady || cy === null) {
      return;
    }
    const api =
      cy.scratch(SCRATCH_INIT_KEY) === true
        ? cy.expandCollapse('get')
        : cy.expandCollapse({
            layoutBy: null,
            fisheye: false,
            animate: false,
            undoable: false,
            cueEnabled: true,
          });
    cy.scratch(SCRATCH_INIT_KEY, true);
    apiRef.current = api;
    // Apply collapse desired before the api existed: useCytoscape's reconcile is
    // declared ahead of this hook, so it ran with a null api and skipped. Without
    // this, mount-time default-collapse (controller mode) would never apply.
    const toCollapse = cy.nodes(':parent').filter((n) => collapsedIdsRef.current.has(n.id()));
    if (toCollapse.length > 0) {
      suppressRef.current = true;
      api.collapse(toCollapse);
      suppressRef.current = false;
      onMountCollapseApplied?.();
    }
    const handleCue = (evt: cytoscape.EventObject): void => {
      if (suppressRef.current) {
        return; // programmatic apply in progress (useCytoscape) — ignore echo
      }
      // Incremental merge with the DESIRED set, never a rebuild from the canvas:
      // collapsing an ancestor removes already-collapsed descendants from the graph,
      // so a `cy.nodes('.collapsed')` rebuild would drop their ids and the next
      // reconcile would permanently expand them.
      const target = evt.target as cytoscape.NodeSingular;
      const next = new Set(collapsedIdsRef.current);
      if (target.hasClass(COLLAPSED_NODE_CLASS)) {
        next.add(target.id());
      } else {
        next.delete(target.id());
      }
      onCollapsedChange(next);
    };
    cy.on(CUE_EVENTS, handleCue);
    return (): void => {
      cy.off(CUE_EVENTS, handleCue);
      apiRef.current = null;
    };
    // Refs/callback deps are stable; effect re-binds only on instance swap or when
    // the enabled gate flips.
  }, [cyRef, enabled, isReady, apiRef, collapsedIdsRef, suppressRef, onCollapsedChange, onMountCollapseApplied]);
}
