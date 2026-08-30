import type cytoscape from 'cytoscape';
import { useEffect } from 'react';

const FIT_ANIMATION_DURATION_MS = 250;
const FIT_ZOOM_CLAMP = 1.5;
const FIT_PADDING = 40;

// Imperative viewport commands search drives (design D5): fit to the visible hit set, or
// to a single node's closed neighborhood (locate).
export interface GraphViewportApi {
  fitToIds(ids: readonly string[]): void;
  fitToNeighborhood(id: string): void;
}

// Computes the natural cy.fit() target for `eles` (clamped to FIT_ZOOM_CLAMP, re-centered
// on the fitted elements when the natural zoom would exceed it), WITHOUT leaving the
// viewport mutated: cy.fit()/cy.zoom() are used only as a synchronous calculator, restored
// immediately after, so the caller can animate TO the computed target instead of jumping.
function computeFitTarget(
  cy: cytoscape.Core,
  eles: cytoscape.CollectionReturnValue
): { zoom: number; pan: cytoscape.Position } {
  const originalZoom = cy.zoom();
  const originalPan = { ...cy.pan() };
  cy.fit(eles, FIT_PADDING);
  let zoom = cy.zoom();
  let pan = { ...cy.pan() };
  if (zoom > FIT_ZOOM_CLAMP) {
    const bb = eles.boundingBox();
    cy.zoom({ level: FIT_ZOOM_CLAMP, position: { x: (bb.x1 + bb.x2) / 2, y: (bb.y1 + bb.y2) / 2 } });
    zoom = cy.zoom();
    pan = { ...cy.pan() };
  }
  cy.zoom(originalZoom);
  cy.pan(originalPan);
  return { zoom, pan };
}

// Filters to `.visible()` elements (cytoscape's effective visibility — ANDs over
// ancestors, so a filter-hidden container also excludes its children) and animates to the
// computed fit target. Empty/all-hidden `eles` is a no-op — no animate call.
function animatedFitTo(cy: cytoscape.Core, eles: cytoscape.CollectionReturnValue): void {
  const visible = eles.filter(':visible');
  if (visible.empty()) {
    return;
  }
  const target = computeFitTarget(cy, visible);
  cy.animate({ zoom: target.zoom, pan: target.pan }, { duration: FIT_ANIMATION_DURATION_MS });
}

export function createViewportApi(cy: cytoscape.Core): GraphViewportApi {
  return {
    fitToIds(ids: readonly string[]): void {
      let eles = cy.collection();
      for (const id of ids) {
        const ele = cy.getElementById(id);
        if (!ele.empty()) {
          eles = eles.union(ele);
        }
      }
      animatedFitTo(cy, eles);
    },
    fitToNeighborhood(id: string): void {
      const node = cy.getElementById(id);
      if (node.empty()) {
        return;
      }
      animatedFitTo(cy, node.closedNeighborhood());
    },
  };
}

export interface UseViewportApiProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  isReady: boolean;
  // Callback-ref style prop (matches this codebase's no-forwardRef convention): fired with
  // the live api once the cy instance exists, and with null on unmount/instance loss.
  onViewportApi?: (api: GraphViewportApi | null) => void;
}

export function useViewportApi({ cyRef, isReady, onViewportApi }: UseViewportApiProps): void {
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null || onViewportApi === undefined) {
      return;
    }
    onViewportApi(createViewportApi(cy));
    return (): void => {
      onViewportApi(null);
    };
  }, [cyRef, isReady, onViewportApi]);
}
