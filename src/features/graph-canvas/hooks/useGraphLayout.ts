import type cytoscape from 'cytoscape';
import { useEffect, useMemo, useRef } from 'react';

import type { SwitchConstraints } from '../../switch-topology';

export type LayoutName = 'fcose' | 'dagre';

// fcose NaN-poisons EVERY node position when a fixedNodeConstraint references a node
// missing from the live graph (cose-base indexes the absent id into undefined coords).
// Expand-collapse can remove pinned switches, so keep only constraints present at run time.
function presentConstraints(cy: cytoscape.Core, constraints: SwitchConstraints): SwitchConstraints {
  const fixed = constraints.fixedNodeConstraint?.filter((c) => cy.getElementById(c.nodeId).length > 0);
  return fixed !== undefined && fixed.length > 0 ? { fixedNodeConstraint: fixed } : {};
}

export interface UseGraphLayoutProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  name: LayoutName;
  // Bumped by GraphCanvas when collapse changes content → layout reruns (default 0 = mount-only).
  // useGraphLayout stays the SINGLE source of cy.layout() execution (Cytoscape rule 2).
  runToken?: number;
  // fcose constraints (features/switch-topology) pinning `switch` nodes into tiers. Applied at
  // run time only — a change here does NOT trigger relayout (preserves no-relayout-on-data-refresh,
  // design D7). Ignored under dagre.
  switchConstraints?: SwitchConstraints | null;
}

export function useGraphLayout({ cyRef, name, runToken = 0, switchConstraints = null }: UseGraphLayoutProps): void {
  const baseOptions = useMemo<cytoscape.LayoutOptions>(() => {
    if (name === 'dagre') {
      return { name: 'dagre', rankDir: 'TB', nodeSep: 50, rankSep: 80 } as unknown as cytoscape.LayoutOptions;
    }
    return {
      name: 'fcose',
      // animate:false runs fcose SYNCHRONOUSLY. A pod-parent mode switch rebuilds the element set
      // and bumps runToken in the same cycle; with animate:true the pass was interrupted mid-
      // convergence by the next render, leaving nodes overlapping. Sync convergence can't be cut off.
      animate: false,
      // Element rebuild starts every node at the origin; without randomize they collapse into a pile.
      randomize: true,
      // 'proof' = most iterations → convergence isn't luck-dependent on a re-run. Graph is small.
      quality: 'proof',
      numIter: 4000,
      // Include labels (rendered below each 40px node) in node dims so they don't overlap either.
      nodeDimensionsIncludeLabels: true,
      // Short ideal edge + nodeSeparation min-gap avoids overlap WITHOUT big global repulsion (which
      // lengthens edges and lets free cluster compounds drift from the pinned switch fabric). Gravity
      // pulls clusters up toward the fabric to keep node→switch uplinks short.
      idealEdgeLength: 55,
      nodeRepulsion: 8000,
      nodeSeparation: 80,
      gravity: 0.7,
      gravityRange: 4.0,
      // Strong compound gravity keeps each compound's children from bleeding into another's box;
      // packComponents arranges disconnected components without overlap.
      gravityCompound: 2.0,
      packComponents: true,
    } as unknown as cytoscape.LayoutOptions;
  }, [name]);

  // Ref so the constraints' per-refresh object-identity churn never re-triggers the layout effect;
  // read only at a real layout run (no-relayout-on-data-refresh, design D7). Declared before the
  // layout effect so it runs first, syncing later changes without writing the ref during render.
  const constraintsRef = useRef<SwitchConstraints | null>(switchConstraints);
  useEffect(() => {
    constraintsRef.current = switchConstraints;
  }, [switchConstraints]);

  // cy.stop() only halts core (viewport) animations, NOT a running layout pass — without this
  // handle's layout.stop(), back-to-back runs (mount + default-collapse bump) fight over positions.
  const layoutRef = useRef<cytoscape.Layouts | null>(null);

  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    layoutRef.current?.stop();
    cy.stop();
    const constraints = constraintsRef.current;
    const options =
      name === 'fcose' && constraints !== null
        ? ({ ...(baseOptions as object), ...presentConstraints(cy, constraints) } as unknown as cytoscape.LayoutOptions)
        : baseOptions;
    const layout = cy.layout(options);
    layoutRef.current = layout;
    layout.run();
  }, [cyRef, baseOptions, name, runToken]);
}
