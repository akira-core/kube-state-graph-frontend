import type { SwitchConstraints, SwitchFixedNode } from './types';

// Vertical spacing (px) between adjacent switch levels, and horizontal spacing
// between switches sharing a level. Sensible defaults; tune visually on the demo
// (see design Open Questions).
const TIER_GAP = 120;
const COL_GAP = 120;

// Group switch ids by level, ids sorted within each level and levels ascending.
// Determinism keeps the pinned positions (and thus the layout) stable for
// identical input.
function groupByLevel(levelById: ReadonlyMap<string, number>): { levels: number[]; byLevel: Map<number, string[]> } {
  const byLevel = new Map<number, string[]>();
  for (const [id, level] of levelById) {
    const group = byLevel.get(level);
    if (group === undefined) {
      byLevel.set(level, [id]);
    } else {
      group.push(id);
    }
  }
  for (const group of byLevel.values()) {
    group.sort();
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  return { levels, byLevel };
}

/**
 * Turn a per-switch level mapping into a native fcose `fixedNodeConstraint` that
 * pins each levelled switch to an absolute position:
 * - `y = -level * TIER_GAP` — higher levels sit above (smaller y), so the
 *   highest-level switch (e.g. core) renders on top.
 * - `x = (i - (n - 1) / 2) * COL_GAP` — the i-th of n switches in a level, spread
 *   horizontally and centred on x = 0.
 *
 * Returns null when no switch carries a level (nothing to pin); the force layout
 * then behaves exactly as without this feature.
 */
export function buildSwitchConstraints(levelById: ReadonlyMap<string, number>): SwitchConstraints | null {
  if (levelById.size === 0) {
    return null;
  }

  const { levels, byLevel } = groupByLevel(levelById);
  const fixedNodeConstraint: SwitchFixedNode[] = [];

  for (const level of levels) {
    const group = byLevel.get(level);
    if (group === undefined) {
      continue;
    }
    const count = group.length;
    // `level === 0` guard avoids emitting -0 from the negation.
    const y = level === 0 ? 0 : -level * TIER_GAP;
    for (let i = 0; i < count; i += 1) {
      const nodeId = group[i];
      if (nodeId === undefined) {
        continue;
      }
      const x = (i - (count - 1) / 2) * COL_GAP;
      fixedNodeConstraint.push({ nodeId, position: { x, y } });
    }
  }

  return fixedNodeConstraint.length > 0 ? { fixedNodeConstraint } : null;
}
