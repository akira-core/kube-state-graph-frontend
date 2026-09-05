import cytoscape from 'cytoscape';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

import '../registerExtensions';

import type { PodParentMode } from '../../../shared/constants/types';
import { cloneElementDefs } from '../sync/cloneElementDefs';
import { diffElements } from '../sync/diffElements';
import { isExtensionDataKey } from '../sync/extensionDataKeys';
import { reconcileCollapse } from '../sync/reconcileCollapse';
import { seedAddedNodePositions } from '../sync/seedAddedNodePositions';

export type CyStylesheet = cytoscape.StylesheetStyle | cytoscape.StylesheetCSS;

export interface UseCytoscapeProps {
  elements: cytoscape.ElementDefinition[];
  stylesheet: CyStylesheet[];
  // Optional collapse integration (injected by GraphCanvas); all undefined = backward-compatible no-op.
  apiRef?: MutableRefObject<cytoscape.ExpandCollapseApi | null>;
  collapsedIdsRef?: MutableRefObject<ReadonlySet<string>>;
  suppressRef?: MutableRefObject<boolean>;
  onCollapsedChange?: (next: Set<string>) => void;
  // Bumped when collapsed-set CONTENT changes, so collapse re-applies without a data refresh (single update cycle).
  collapseKey?: number;
  // Toggling re-parents pods between node/controller containers; cytoscape only nests
  // reliably at add() time (dynamic move() is unreliable under batch + expand-collapse),
  // so a mode change triggers a full rebuild rather than diff-patch.
  podParentMode?: PodParentMode | undefined;
  // Fired when a refresh adds an unanchorable compound family (would stack at origin) → one relayout.
  // Anchored adds do NOT fire this (D7 preserved).
  onStructuralRelayout?: () => void;
}

export interface UseCytoscapeReturn {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  cyRef: MutableRefObject<cytoscape.Core | null>;
  // cyRef is a ref (no re-render on set) and child effects fire before the parent init effect,
  // so consumers depend on isReady to (re)bind cy listeners once the instance exists.
  isReady: boolean;
}

// 'preset' so cytoscape does not auto-run a layout — useGraphLayout is the single layout source.
const INIT_LAYOUT: cytoscape.LayoutOptions = { name: 'preset' };

// Keys the update patch must never drop: structural keys (re-nesting goes through move(),
// edge rewires through diffElements remove+add) plus extension bookkeeping — normalize never
// emits these, so "absent from incoming" must not delete them.
const IMMUTABLE_DATA_KEYS = new Set(['id', 'parent', 'source', 'target']);
function isPreservedDataKey(key: string): boolean {
  return IMMUTABLE_DATA_KEYS.has(key) || isExtensionDataKey(key);
}

export function useCytoscape({
  elements,
  stylesheet,
  apiRef,
  collapsedIdsRef,
  suppressRef,
  onCollapsedChange,
  collapseKey,
  podParentMode,
  onStructuralRelayout,
}: UseCytoscapeProps): UseCytoscapeReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const prevModeRef = useRef(podParentMode);
  const [isReady, setIsReady] = useState(false);

  // Init / destroy
  useEffect(() => {
    if (containerRef.current === null) {
      return;
    }
    cyRef.current = cytoscape({
      container: containerRef.current,
      // Cloned: cytoscape aliases given data objects and expand-collapse mutates them in place;
      // the React-side `elements` model must stay pristine (see cloneElementDefs).
      elements: cloneElementDefs(elements),
      style: stylesheet,
      layout: INIT_LAYOUT,
    });
    setIsReady(true);
    return (): void => {
      setIsReady(false);
      if (cyRef.current !== null) {
        cyRef.current.removeAllListeners();
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
    // oxlint-disable-next-line react-doctor/exhaustive-deps -- single-shot init; updates handled by other effects
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- single-shot init; updates handled by other effects

  // Elements diff-and-patch (collapse-aware when refs are injected).
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    const api = apiRef?.current ?? null;

    const patchAndRecollapse = (cy: cytoscape.Core): boolean => {
      // 2) Apply the incoming elements.
      const modeChanged = prevModeRef.current !== podParentMode;
      prevModeRef.current = podParentMode;

      // Set when this patch adds an unanchorable compound family (seedAddedNodePositions can't place it).
      let unanchoredAdded = false;

      const existing = cy.elements();
      if (modeChanged && existing.length > 0) {
        // Mode flip restructures the compound hierarchy; cytoscape only nests reliably at add() time
        // (dynamic data('parent')/move() unreliable under batch + expand-collapse), so rebuild wholesale.
        // The co-incident run-token bump re-runs the layout, so reset positions are fine.
        cy.batch(() => {
          existing.remove();
          cy.add(cloneElementDefs(elements));
        });
      } else {
        // Diff real-vs-incoming and patch (evacuate → remove → add → update).
        const current = cy.elements().jsons() as cytoscape.ElementDefinition[];
        const diff = diffElements(current, elements);
        if (diff.toAdd.length > 0 || diff.toRemove.length > 0 || diff.toUpdate.length > 0) {
          const removeSet = new Set(diff.toRemove);
          cy.batch(() => {
            if (removeSet.size > 0) {
              // Children re-homed by this same refresh must detach from a doomed parent BEFORE it is
              // removed, else cytoscape's compound cascade deletes them with it (e.g. node drained while
              // its pods reschedule). The update pass below re-nests them once their new parent exists.
              for (const el of diff.toUpdate) {
                const target = cy.getElementById(el.data.id ?? '');
                if (target.length === 0 || !target.isNode()) {
                  continue;
                }
                const parent = target.parent();
                if (parent.length > 0 && removeSet.has(parent.first().id())) {
                  target.move({ parent: null });
                }
              }
              // Remove via a collection, never an `#id` selector: real ids carry selector
              // metacharacters ('/', ':') that invalidate the selector and silently no-op.
              cy.remove(cy.elements().filter((ele) => removeSet.has(ele.id())));
            }
            if (diff.toAdd.length > 0) {
              // Seed new nodes inside their parent's cluster (not the origin) so adding a pod under a
              // COLLAPSED controller doesn't drag its collapsed-box toward (0,0). expandAll() above made
              // parent positions valid. An unanchorable family is flagged for one relayout.
              const seeded = seedAddedNodePositions(cy, diff.toAdd);
              cy.add(cloneElementDefs(seeded.elements));
              if (seeded.unanchored > 0) {
                unanchoredAdded = true;
              }
            }
            for (const el of diff.toUpdate) {
              const target = cy.getElementById(el.data.id ?? '');
              if (target.length === 0) {
                continue;
              }
              // Incremental parent change (backend reassigns a pod's node): capture the model parent
              // BEFORE data() (which carries data.parent and would mask the change), then re-nest via
              // move() — cytoscape won't relocate a compound node from data('parent') alone.
              const isNode = target.isNode();
              const parent = target.parent();
              const nextParent = isNode && typeof el.data.parent === 'string' ? el.data.parent : null;
              const currentParent = isNode && parent.length > 0 ? parent.first().id() : null;
              // data(obj) is extend-only: a key the incoming def OMITS would survive forever and keep
              // re-flagging this element as changed every diff cycle. Drop the diffed-away keys first.
              const staleKeys = Object.keys(target.data() as Record<string, unknown>).filter(
                (k) => !(k in el.data) && !isPreservedDataKey(k)
              );
              if (staleKeys.length > 0) {
                target.removeData(staleKeys.join(' '));
              }
              target.data(el.data);
              if (isNode && nextParent !== currentParent) {
                target.move({ parent: nextParent });
              }
            }
          });
        }
      }

      // 3) Re-apply collapse to the parents that still exist after the patch.
      if (api) {
        // Keyed on "still exists", NOT on `:parent` ("has children right now"). A container
        // that momentarily has zero children — a k8s node whose last pod was deleted, a
        // controller box between a rollout's old and new pods — is not `:parent`, and
        // pruning it would permanently drop the user's collapse: when a pod lands there
        // again the box reappears expanded.
        const present = new Set(cy.nodes().map((n) => n.id()));
        const desired = collapsedIdsRef?.current ?? new Set<string>();
        const recollapse = reconcileCollapse(desired, present);
        if (recollapse.length > 0) {
          const recollapseSet = new Set(recollapse);
          // Only nodes that actually have children can be collapsed; the rest stay in the
          // desired set (above) but are not handed to the extension.
          api.collapse(cy.nodes(':parent').filter((n) => recollapseSet.has(n.id())));
        }
        // 4) Prune: parents removed by this update drop out of the reported set.
        if (recollapse.length !== desired.size) {
          onCollapsedChange?.(new Set(recollapse));
        }
      }

      return unanchoredAdded;
    };

    // Set when this patch adds an unanchorable compound family (seedAddedNodePositions can't place it).
    let addedUnanchored = false;

    // try/finally, not a straight-line reset: anything in the patch below can throw
    // (cy.add rejecting an edge whose endpoint was cascade-deleted, move() on a stale
    // collection). Without the finally, suppressRef would stay true for the life of the
    // instance and useExpandCollapse's cue handler would silently drop EVERY subsequent
    // user collapse/expand, so collapsedIds would stop tracking the canvas.
    try {
      // 1) Restore the fully-expanded graph so the diff compares against true topology, not the collapsed view.
      if (api) {
        if (suppressRef) {
          suppressRef.current = true;
        }
        api.expandAll();
      }

      addedUnanchored = patchAndRecollapse(cy);
    } finally {
      if (suppressRef) {
        suppressRef.current = false;
      }
    }

    // 5) Unanchorable family added — request one relayout so it doesn't stay stacked at origin (D7).
    if (addedUnanchored) {
      onStructuralRelayout?.();
    }
  }, [elements, collapseKey, podParentMode]); // eslint-disable-line react-hooks/exhaustive-deps -- refs/callbacks stable. collapseKey re-runs the expandAll→diff→reconcile→collapse cycle without a data refresh; podParentMode drives the rebuild branch on a mode flip

  // Stylesheet swap (no instance rebuild)
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    cy.style(stylesheet).update();
  }, [stylesheet]);

  return useMemo(() => ({ containerRef, cyRef, isReady }), [containerRef, cyRef, isReady]);
}
