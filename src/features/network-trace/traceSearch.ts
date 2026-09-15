import { searchFields, type SearchRecord } from '../graph-search';
import type { Rect } from '../sankey-canvas';

import type { TraceGeometry } from './layout/types';
import type { TraceModelOk } from './model/types';

/**
 * One search record per DRAWN card: every placed node (hop, leaf, anchor) and every cluster
 * frame. A hop's `role` is its wire kind; a leaf reads better by the wire
 * type it stopped at (`host`, `external`, …) than by the role `leaf`. A leaf's clients are
 * searchable one value at a time, so a hit on an address names that address.
 */
export function traceSearchRecords(model: TraceModelOk, geo: TraceGeometry): SearchRecord[] {
  const records: SearchRecord[] = [];
  for (const n of model.nodes) {
    if (!geo.nodes.has(n.id)) {
      continue;
    }
    const kind = n.role === 'leaf' ? (n.type ?? n.role) : n.role;
    const clusterCtx = n.cluster ?? n.ontapCluster;
    const context =
      n.namespace !== null || clusterCtx !== null
        ? {
            ...(n.namespace !== null ? { namespace: n.namespace } : {}),
            ...(clusterCtx !== null ? { cluster: clusterCtx } : {}),
          }
        : undefined;
    records.push({
      id: n.id,
      label: n.label.length > 0 ? n.label : n.id,
      kind,
      ...(context !== undefined ? { context } : {}),
      fields: [
        ...searchFields([
          ['label', n.label],
          ['kind', kind],
          ['namespace', n.namespace],
          ['cluster', n.cluster],
          ['ontapCluster', n.ontapCluster],
          ['tier', n.tier],
          ['owner', n.owner],
        ]),
        ...(n.clients ?? []).flatMap((c) =>
          searchFields([
            ['ip', c.ip],
            ['hostname', c.hostname],
            ['owner', c.owner],
          ])
        ),
      ],
    });
  }
  for (const cg of geo.clusters) {
    const c = cg.cluster;
    records.push({
      id: c.id,
      label: c.label,
      kind: 'cluster',
      fields: searchFields([
        ['label', c.label],
        ['kind', 'cluster'],
      ]),
    });
  }
  return records;
}

/** Content-space frame of every placed card and cluster frame, by id. */
export function traceCardRects(geo: TraceGeometry): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  for (const [id, g] of geo.nodes) {
    rects.set(id, { x: g.x, y: g.y, w: g.w, h: g.h });
  }
  for (const cg of geo.clusters) {
    rects.set(cg.cluster.id, { x: cg.x, y: cg.y, w: cg.w, h: cg.h });
  }
  return rects;
}
