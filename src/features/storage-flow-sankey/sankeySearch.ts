import type { SearchField, SearchRecord } from '../graph-search';
import type { HoverLit, Rect } from '../sankey-canvas';

import { hoverPathLinksMany, type SankeyGraph } from './deriveSankey';
import { linkKey, type SankeyLayout } from './layoutSankey';

function fieldsOf(entries: ReadonlyArray<[string, string | undefined]>): SearchField[] {
  return entries.flatMap(([field, value]) => (value !== undefined && value.length > 0 ? [{ field, value }] : []));
}

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
      fields: fieldsOf([
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
      fields: fieldsOf([
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
 * the path"). A wrapper lights its member pods' paths, an SVM frame its member PVCs'; every
 * requested card stays lit itself even when it has no path.
 */
export function sankeyPathLit(graph: SankeyGraph, ids: Iterable<string>): HoverLit {
  const podsByWrapper = new Map(graph.k8sNodes.map((k) => [k.id, k.podIds]));
  const pvcsByFrame = new Map(graph.svmFrames.map((f) => [f.id, f.pvcIds]));
  const nodeIds = new Set<string>();
  const starts: string[] = [];
  for (const id of ids) {
    nodeIds.add(id);
    starts.push(...(podsByWrapper.get(id) ?? pvcsByFrame.get(id) ?? [id]));
  }
  const keys = new Set<string>();
  for (const l of hoverPathLinksMany(graph, starts)) {
    keys.add(linkKey(l.source, l.target, l.direction, l.tier));
    nodeIds.add(l.source);
    nodeIds.add(l.target);
  }
  return { keys, nodeIds };
}
