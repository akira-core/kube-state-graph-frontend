import { describe, expect, it } from 'vitest';

import { normalizeGraph } from '../../graph-data';
import { deriveTrace } from '../model/deriveTrace';
import type { TraceModelOk } from '../model/types';
import { TRACE_SAMPLES } from '../testing/samples';

import { layoutTrace, type TraceNodeOrder } from './layoutTrace';

/**
 * Golden corpus: every sample × the variants (threshold, cluster grouping, barycenter). The
 * snapshots were reviewed once against the drawn fixture and now guard the port against
 * regressions in the model and the geometry — a changed number here is a changed drawing.
 */
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

function modelSnapshot(m: TraceModelOk): unknown {
  return {
    direction: m.direction,
    anchor: m.anchorEdge?.id ?? null,
    root: m.root?.id ?? null,
    filtered: m.filtered,
    filteredNodes: m.filteredNodes,
    clusters: m.clusters.map((c) => ({ id: c.id, members: c.memberIds, status: c.status })),
    nodes: m.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      role: n.role,
      label: n.label,
      col: n.col,
      subOrder: n.subOrder,
      namespace: n.namespace,
      cluster: n.cluster,
      tier: n.tier,
      ...(n.kind === 'node'
        ? {
            tracedIn: r3(n.tracedIn),
            tracedOut: r3(n.tracedOut),
            otherIn: r3(n.otherIn),
            otherOut: r3(n.otherOut),
            noFlow: n.noFlow,
            isRoot: n.isRoot,
          }
        : { bps: r3(n.bps), podCount: n.podCount, ownerLinked: n.ownerLinked }),
    })),
    edges: m.edges.map((e) => ({
      id: e.id,
      from: e.fromId,
      to: e.toId,
      fi: e.fromIface,
      ti: e.toIface,
      bps: r3(e.bps),
      derived: e.derived,
      owns: e.owns,
      anchor: e.isAnchor,
      dropped: e.dropped,
      backward: e.backward,
      lateral: e.lateral,
    })),
    warnings: m.warnings,
  };
}

function geometrySnapshot(m: TraceModelOk, order: TraceNodeOrder): unknown {
  const geo = layoutTrace(m, { order });
  return {
    width: r3(geo.width),
    height: r3(geo.height),
    columns: geo.columns.map((c) => ({ x: r3(c.x), label: c.label })),
    cols: geo.cols.map((c) => c.map((n) => n.id)),
    clusters: geo.clusters.map((c) => ({ id: c.cluster.id, x: r3(c.x), y: r3(c.y), w: r3(c.w), h: r3(c.h) })),
    nodes: [...geo.nodes.entries()].map(([id, g]) => ({
      id,
      x: r3(g.x),
      y: r3(g.y),
      w: r3(g.w),
      h: r3(g.h),
      left: g.leftSlots.map((s) => ({
        e: s.edge?.id ?? `res:${s.res ?? ''}`,
        role: s.role ?? null,
        cy: r3(s.cy),
        t: r3(s.thickness),
      })),
      right: g.rightSlots.map((s) => ({
        e: s.edge?.id ?? `res:${s.res ?? ''}`,
        role: s.role ?? null,
        cy: r3(s.cy),
        t: r3(s.thickness),
      })),
    })),
    edges: [...geo.edges.entries()].map(([id, e]) => ({
      id,
      t: r3(e.t),
      x1: r3(e.x1),
      y1: r3(e.y1),
      x2: r3(e.x2),
      y2: r3(e.y2),
      backNear: e.backNear,
      ...(e.kind === 'lateral' ? { bulge: r3(e.bulge) } : {}),

      ...(e.backY !== undefined ? { backY: r3(e.backY), backXD: r3(e.backXD ?? 0), backXU: r3(e.backXU ?? 0) } : {}),
    })),
  };
}

describe('golden corpus', () => {
  for (const sample of TRACE_SAMPLES) {
    const elements = normalizeGraph(sample.wire).elements;
    const variants: Array<{ tag: string; minBps: number; grouping: 'none' | 'cluster' }> = [
      { tag: '', minBps: 0, grouping: 'none' },
      { tag: '@5e8', minBps: 5e8, grouping: 'none' },
      { tag: '@cluster', minBps: 0, grouping: 'cluster' },
    ];
    for (const v of variants) {
      it(`${sample.key}${v.tag}`, () => {
        const frozen = JSON.parse(JSON.stringify(elements)) as typeof elements;
        Object.freeze(frozen);
        const m = deriveTrace(frozen, { direction: sample.direction, minBps: v.minBps, grouping: v.grouping });
        expect(m.ok).toBe(true);
        if (!m.ok) {
          return;
        }
        if (v.grouping === 'cluster' && m.clusters.length === 0) {
          return; // identical to the ungrouped variant
        }
        expect(modelSnapshot(m)).toMatchSnapshot('model');
        expect(geometrySnapshot(m, 'flow')).toMatchSnapshot('geometry flow');
        if (v.tag === '') {
          expect(geometrySnapshot(m, 'barycenter')).toMatchSnapshot('geometry barycenter');
        }
        expect(JSON.stringify(frozen)).toBe(JSON.stringify(elements));
      });
    }
  }
});
