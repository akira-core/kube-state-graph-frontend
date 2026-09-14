import type { TraceEdge, TraceModelOk } from './types';

export interface HoverPath {
  edgeIds: Set<string>;
  nodeIds: Set<string>;
}

/**
 * The whole path through a card: upstream along `inEdges`, downstream along `outEdges`,
 * through derived edges and ownership lines to the ends. A wrapper lights the union of its
 * member pods' paths (plus itself). An empty wrapper has no path.
 */
export function hoverPath(model: TraceModelOk, id: string): HoverPath {
  const wrapper = model.wrappers.find((w) => w.id === id);
  const starts = wrapper !== undefined ? wrapper.podIds : [id];
  const edgeIds = new Set<string>();
  const nodeIds = new Set<string>();
  if (wrapper !== undefined) {
    nodeIds.add(id);
  }
  const walk = (start: string, key: 'inEdges' | 'outEdges', next: (e: TraceEdge) => string): void => {
    const stack = [start];
    const seen = new Set<string>([start]);
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
  for (const s of starts) {
    walk(s, 'inEdges', (e) => e.fromId);
    walk(s, 'outEdges', (e) => e.toId);
  }
  return { edgeIds, nodeIds };
}
