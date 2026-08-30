import type cytoscape from 'cytoscape';
import { useEffect, useState } from 'react';

import { clonePlain } from '../../../shared/clone/clonePlain';

export interface HoveredElement {
  id: string;
  group: 'nodes' | 'edges';
  data: Record<string, unknown>;
  sourceLabel?: string;
  targetLabel?: string;
  // Rendered (pixel) anchor within the cytoscape container — node centre for a
  // node, cursor point for an edge. Optional: absent under headless cytoscape or
  // synthetic events, where the tooltip falls back to a safe corner.
  position?: { x: number; y: number };
  // Container size at hover time, used to clamp/flip the tooltip on-screen.
  viewport?: { width: number; height: number };
}

export interface UseHoverElementProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  // Re-runs the bind effect once the instance is ready (cyRef alone is a stable
  // ref and would not trigger a re-bind). See useCytoscape.isReady.
  ready?: boolean;
}

function resolveLabel(cy: cytoscape.Core, id: string): string {
  const target = cy.getElementById(id);
  if (target.length === 0) {
    return id;
  }
  const lbl = target.data('label') as unknown;
  return typeof lbl === 'string' ? lbl : id;
}

export function useHoverElement({ cyRef, ready }: UseHoverElementProps): HoveredElement | null {
  const [hovered, setHovered] = useState<HoveredElement | null>(null);

  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }

    const handleOver = (evt: cytoscape.EventObject): void => {
      const target = evt.target as cytoscape.NodeSingular | cytoscape.EdgeSingular;
      if (typeof target.id !== 'function') {
        return;
      }
      const isNode = target.isNode();
      // target.data() returns cytoscape's LIVE internal object — the diff-patch
      // (removeData/data writes) and expand-collapse's edge.move() rewires mutate
      // it in place WITHOUT firing remove events, so React state must hold an
      // immutable snapshot, never the live reference.
      const data = clonePlain(target.data() as Record<string, unknown>);
      const next: HoveredElement = {
        id: target.id(),
        group: isNode ? 'nodes' : 'edges',
        data,
      };
      // Anchor: a node's rendered centre keeps the tooltip pinned beside the
      // node; an edge has no single point, so use the cursor's rendered position.
      const anchor = isNode ? target.renderedPosition() : evt.renderedPosition;
      if (anchor !== undefined && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)) {
        next.position = { x: anchor.x, y: anchor.y };
        next.viewport = { width: cy.width(), height: cy.height() };
      }
      if (!isNode) {
        const source = typeof data.source === 'string' ? data.source : '';
        const target2 = typeof data.target === 'string' ? data.target : '';
        next.sourceLabel = resolveLabel(cy, source);
        next.targetLabel = resolveLabel(cy, target2);
      }
      setHovered(next);
    };
    const handleOut = (): void => {
      setHovered(null);
    };
    const handleRemove = (evt: cytoscape.EventObject): void => {
      const target = evt.target as cytoscape.NodeSingular | cytoscape.EdgeSingular;
      if (typeof target.id === 'function') {
        setHovered((current) => (current !== null && current.id === target.id() ? null : current));
      }
    };

    cy.on('mouseover', 'node, edge', handleOver);
    cy.on('mouseout', 'node, edge', handleOut);
    cy.on('remove', 'node, edge', handleRemove);

    return (): void => {
      cy.off('mouseover', 'node, edge', handleOver);
      cy.off('mouseout', 'node, edge', handleOut);
      cy.off('remove', 'node, edge', handleRemove);
    };
    // `ready` re-runs this once the instance is created (cyRef is a stable ref).
  }, [cyRef, ready]);

  return hovered;
}
