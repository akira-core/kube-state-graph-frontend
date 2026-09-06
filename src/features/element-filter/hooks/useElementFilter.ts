import type cytoscape from 'cytoscape';
import { useEffect } from 'react';

import type { VisibilitySets } from '../computeVisibility';

export interface UseElementFilterProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  // Precomputed by the panel (single computeVisibility call shared with the
  // detail-panel gating) — this hook only applies the sets to the live graph.
  sets: VisibilitySets;
}

export function useElementFilter({ cyRef, sets }: UseElementFilterProps): void {
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    const { visibleNodeIds, visibleEdgeIds } = sets;
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        node.style('visibility', visibleNodeIds.has(node.id()) ? 'visible' : 'hidden');
      });
      // NODE collapse — the only expand-collapse path this panel uses — re-points a boundary
      // edge onto the collapsed container via `edge.move()`
      // (barrowEdgesOfcollapsedChildren), which preserves the edge's ORIGINAL id and data.
      // So `edge.id()` here is still exactly the id visibleEdgeIds was computed from, and no
      // `.cy-expand-collapse-meta-edge` exemption is needed — or correct: overriding by
      // endpoint visibility would revive an edge filtered out on its own merits
      // (kind/edge-type/ingress) whenever collapse folds one of its real endpoints into a
      // container that still has other visible children. (The extension's separate EDGE
      // collapse api — `api.collapseEdges` — does mint new ids, but we never call it.)
      cy.edges().forEach((edge) => {
        edge.style('visibility', visibleEdgeIds.has(edge.id()) ? 'visible' : 'hidden');
      });
    });
  }, [cyRef, sets]);
}
