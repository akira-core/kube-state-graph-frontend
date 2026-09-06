import type cytoscape from 'cytoscape';

export interface SeedResult {
  elements: cytoscape.ElementDefinition[];
  // Count of added nodes with no already-present ancestor — caller should relayout once.
  unanchored: number;
}

function dataParent(el: cytoscape.ElementDefinition): string | null {
  // data.parent is `any` via the index signature; widen to unknown so typeof narrows safely (no-unsafe-assignment).
  const parent: unknown = el.data.parent;
  return typeof parent === 'string' && parent.length > 0 ? parent : null;
}

/**
 * Seed each about-to-be-added node near its nearest ALREADY-PRESENT ancestor instead
 * of cytoscape's default (0,0). Without a seed, on a pure data refresh (layout gated
 * off, design D7) new nodes land at the origin and drag collapsed controller boxes
 * there too — the "controllers stack on refresh" bug. See graph-canvas spec / D7.
 *
 * A parent may itself be new this batch (normalize emits pods before their synthesized
 * controller), so we walk the chain through `toAdd` until a present node anchors it.
 * Nodes that can't anchor (chain has no present node, or a parentless top-level
 * external/others leaf) are reported via `unanchored` for a one-shot relayout.
 *
 * Input elements are never mutated — a shallow clone carries the seeded position.
 */
export function seedAddedNodePositions(cy: cytoscape.Core, toAdd: cytoscape.ElementDefinition[]): SeedResult {
  const addedById = new Map<string, cytoscape.ElementDefinition>();
  for (const el of toAdd) {
    const id = el.data.id;
    if (el.group === 'nodes' && typeof id === 'string') {
      addedById.set(id, el);
    }
  }

  // Nearest already-present ancestor's position, walking up through batch-new parents;
  // null when the chain ends (top or dangling ref) without hitting a present node.
  const anchorPosition = (startParentId: string): cytoscape.Position | null => {
    const seen = new Set<string>();
    let pid: string | null = startParentId;
    while (pid !== null && !seen.has(pid)) {
      seen.add(pid);
      const present = cy.getElementById(pid);
      if (present.length > 0) {
        const { x, y } = present.position();
        return { x, y };
      }
      const pendingParent = addedById.get(pid);
      pid = pendingParent !== undefined ? dataParent(pendingParent) : null;
    }
    return null;
  };

  let unanchored = 0;
  const elements = toAdd.map((el) => {
    if (el.group !== 'nodes' || el.position !== undefined) {
      return el;
    }
    const parentId = dataParent(el);
    // Parentless newcomers also lack an anchor — counted so they don't stack at (0,0).
    const anchor = parentId === null ? null : anchorPosition(parentId);
    if (anchor === null) {
      unanchored += 1;
      return el;
    }
    return { ...el, position: anchor };
  });

  return { elements, unanchored };
}
