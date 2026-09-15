import { searchFields, type SearchRecord } from '../graph-search';
import type { HoverLit, Rect } from '../sankey-canvas';

import { hoverPathLinksMany, type SankeyGraph } from './deriveSankey';
import { linkKey, type SankeyLayout } from './layoutSankey';

/**
 * One search record per DRAWN card: every card in the layout plus every wrapper it frames
 * (a Kubernetes node under the `Node` pod layout, an SVM under the `Group` SVM display).
 * What the Top pods cut or the current layout does not draw cannot be found — a hit the
 * chart has no card for would light nothing and frame nothing.
 */
export function sankeySearchRecords(graph: SankeyGraph, layout: SankeyLayout): SearchRecord[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const frameById = new Map(graph.svmFrames.map((f) => [f.id, f]));
  const records: SearchRecord[] = layout.nodes.map((ln) => {
    const ontapCluster = byId.get(ln.id)?.ontapCluster;
    return {
      id: ln.id,
      label: ln.label.length > 0 ? ln.label : ln.id,
      kind: ln.kind,
      ...(ln.namespace !== undefined || ontapCluster !== undefined
        ? {
            context: {
              ...(ln.namespace !== undefined ? { namespace: ln.namespace } : {}),
              ...(ontapCluster !== undefined ? { cluster: ontapCluster } : {}),
            },
          }
        : {}),
      fields: searchFields([
        ['label', ln.label],
        ['kind', ln.kind],
        ['namespace', ln.namespace],
        ['ontapCluster', ontapCluster],
      ]),
    };
  });
  for (const w of layout.wrappers) {
    const ontapCluster = w.kind === 'netapp-svm' ? frameById.get(w.id)?.ontapCluster : undefined;
    records.push({
      id: w.id,
      label: w.label.length > 0 ? w.label : w.id,
      kind: w.kind,
      ...(ontapCluster !== undefined ? { context: { cluster: ontapCluster } } : {}),
      fields: searchFields([
        ['label', w.label],
        ['kind', w.kind],
        ['ontapCluster', ontapCluster],
      ]),
    });
  }
  return records;
}

/** Content-space frame of every drawn card and wrapper, by id. */
export function sankeyCardRects(layout: SankeyLayout): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  for (const n of [...layout.nodes, ...layout.wrappers]) {
    rects.set(n.id, { x: n.x, y: n.y, w: n.width, h: n.height });
  }
  return rects;
}

/**
 * What stays lit for these cards — the union of each one's hover path (see "Hover highlights
 * the path"; `hoverPathLinksMany` already stands a wrapper or an SVM frame in for its
 * members), keyed the way the drawn ribbons are. Every requested card stays lit itself even
 * when it has no path.
 */
export function sankeyPathLit(graph: SankeyGraph, ids: Iterable<string>): HoverLit {
  const nodeIds = new Set(ids);
  const keys = new Set<string>();
  for (const l of hoverPathLinksMany(graph, nodeIds)) {
    keys.add(linkKey(l.source, l.target, l.direction, l.tier));
    nodeIds.add(l.source);
    nodeIds.add(l.target);
  }
  return { keys, nodeIds };
}
