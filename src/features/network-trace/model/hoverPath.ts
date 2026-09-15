import type { TraceEdge, TraceModelOk } from './types';

export interface HoverPath {
  edgeIds: Set<string>;
  nodeIds: Set<string>;
}

/**
 * The whole path through a card: upstream along `inEdges`, downstream along `outEdges`,
 * through derived edges and ownership lines to the ends. A cluster frame lights the union
 * of its members' paths (plus itself).
 */
export function hoverPath(model: TraceModelOk, id: string): HoverPath {
  return hoverPathMany(model, [id]);
}

/**
 * The union of `hoverPath` over every id — what a search lights for all its hits at once.
 * A walk step depends only on the node it is at, so every start shares one visited set per
 * direction: the union is exact and costs one pass however many ids there are.
 */
export function hoverPathMany(model: TraceModelOk, ids: Iterable<string>): HoverPath {
  const clustersById = new Map(model.clusters.map((c) => [c.id, c]));
  const edgeIds = new Set<string>();
  const nodeIds = new Set<string>();
  const walk = (
    start: string,
    key: 'inEdges' | 'outEdges',
    next: (e: TraceEdge) => string,
    seen: Set<string>
  ): void => {
    if (seen.has(start)) {
      return;
    }
    seen.add(start);
    const stack = [start];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === undefined) {
        break;
      }
      const n = model.nodeMap.get(cur);
      if (n === undefined) {
        continue;
      }
      nodeIds.add(n.id);
      for (const e of n[key]) {
        edgeIds.add(e.id);
        const to = next(e);
        if (!seen.has(to)) {
          seen.add(to);
          stack.push(to);
        }
      }
    }
  };
  const seenUp = new Set<string>();
  const seenDown = new Set<string>();
  for (const id of ids) {
    const cluster = clustersById.get(id);
    if (cluster !== undefined) {
      nodeIds.add(id);
    }
    for (const s of cluster !== undefined ? cluster.memberIds : [id]) {
      walk(s, 'inEdges', (e) => e.fromId, seenUp);
      walk(s, 'outEdges', (e) => e.toId, seenDown);
    }
  }
  return { edgeIds, nodeIds };
}
