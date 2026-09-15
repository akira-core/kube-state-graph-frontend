import { describe, expect, it } from 'vitest';

import { normalizeGraph } from '../../graph-data';
import { CARD_W, WRAPPER_HEADER_H, WRAPPER_PAD } from '../../sankey-canvas';
import { bandOf, isClientPartition } from '../model/bands';
import { deriveTrace } from '../model/deriveTrace';
import type { TraceModelOk, TraceNode } from '../model/types';
import { sum } from '../model/util';
import { TRACE_SAMPLES, traceSample, type TraceSample } from '../testing/samples';

import { BAND_GAP } from './constants';
import { layoutTrace, type TraceNodeOrder } from './layoutTrace';
import { traceFlowOf } from './text';

function model(sample: TraceSample, opts: { minBps?: number; grouping?: 'none' | 'cluster' } = {}): TraceModelOk {
  const m = deriveTrace(normalizeGraph(sample.wire).elements, { direction: sample.direction, ...opts });
  if (!m.ok) {
    throw new Error(m.errors.join(' / '));
  }
  return m;
}

/** Every sample × the variants the golden corpus uses. */
const CORPUS: Array<{ name: string; model: TraceModelOk }> = TRACE_SAMPLES.flatMap((s) => {
  const out = [{ name: s.key, model: model(s) }];
  const cut = deriveTrace(normalizeGraph(s.wire).elements, { direction: s.direction, minBps: 5e8 });
  if (cut.ok) {
    out.push({ name: `${s.key}@5e8`, model: cut });
  }
  const grouped = model(s, { grouping: 'cluster' });
  if (grouped.clusters.length > 0) {
    out.push({ name: `${s.key}@cluster`, model: grouped });
  }
  return out;
});

const colsOf = (m: TraceModelOk, order: TraceNodeOrder): TraceNode[][] =>
  layoutTrace(m, { order }).cols.filter((c) => c.length > 0);

/** A column's cards split by cluster frame (drawing order), the loose ones last; one part without grouping. */
function blocksOf(m: TraceModelOk, col: readonly TraceNode[]): TraceNode[][] {
  if (m.clusters.length === 0) {
    return [[...col]];
  }
  const blockOf = new Map<string, string>();
  for (const c of m.clusters) {
    for (const id of c.memberIds) {
      blockOf.set(id, c.id);
    }
  }
  const parts = new Map<string, TraceNode[]>();
  for (const n of col) {
    const key = blockOf.get(n.id) ?? '';
    const list = parts.get(key) ?? [];
    list.push(n);
    parts.set(key, list);
  }
  return [...parts.values()];
}

describe('layoutTrace geometry', () => {
  it.each(CORPUS.map((c) => [c.name, c.model] as const))(
    '%s: every card holds its slots and sits in its column',
    (_n, m) => {
      const geo = layoutTrace(m);
      expect(geo.width).toBeGreaterThan(0);
      expect(geo.height).toBeGreaterThanOrEqual(220);
      for (const n of m.nodes) {
        const g = geo.nodes.get(n.id);
        expect(g).toBeDefined();
        if (g === undefined) {
          continue;
        }
        expect(g.w).toBeGreaterThan(0);
        expect(g.h).toBeGreaterThan(0);
        expect(g.x).toBeGreaterThanOrEqual(geo.colX[n.col] ?? -1);
        for (const s of [...g.leftSlots, ...g.rightSlots]) {
          expect(s.cy - s.thickness / 2).toBeGreaterThanOrEqual(g.y - 0.5);
          expect(s.cy + s.thickness / 2).toBeLessThanOrEqual(g.y + g.h + 0.5);
        }
      }
      for (const e of m.edges) {
        const eg = geo.edges.get(e.id);
        expect(eg).toBeDefined();
        if (eg === undefined) {
          continue;
        }
        expect(eg.t).toBeGreaterThan(0);
        if (e.backward && !eg.backNear) {
          expect(eg.backY).toBeDefined();
          expect((eg.backY ?? 0) + (eg.backT ?? 0)).toBeLessThanOrEqual(geo.height);
        }
        if (e.lateral) {
          expect(eg.bulge).toBeDefined();
        }
        // Every amount ribbon ends in a chevron whose tip sits just inside its target end;
        // an ownership line carries no amount and no direction mark.
        if (e.owns) {
          expect(eg.chevron).toBeUndefined();
        } else {
          const dir = eg.kind === 'back-loop' || eg.x2 >= eg.x1 ? 1 : -1;
          expect(eg.chevron).toBeDefined();
          expect(eg.chevron).toContain(` L${String(eg.x2 - dir * 2)},${String(eg.y2)} `);
        }
      }
      expect(geo.columns.length).toBe(geo.cols.filter((c) => c.length > 0).length);
    }
  );

  it('is deterministic: the same model lays out identically twice', () => {
    const m = model(traceSample('client'));
    const a = layoutTrace(m);
    const b = layoutTrace(m);
    expect([...a.nodes.entries()]).toEqual([...b.nodes.entries()]);
    expect([...a.edges.entries()]).toEqual([...b.edges.entries()]);
  });

  it('does not touch the model', () => {
    const m = model(traceSample('dci-uturn'));
    const before = JSON.stringify(m.nodes.map((n) => [n.id, n.col, n.subOrder]));
    layoutTrace(m, { order: 'barycenter' });
    layoutTrace(m, { order: 'flow' });
    expect(JSON.stringify(m.nodes.map((n) => [n.id, n.col, n.subOrder]))).toBe(before);
  });

  it('residual slots are drawn only above the noise epsilon and share the ribbon scale', () => {
    const m = model(traceSample('classic'));
    const geo = layoutTrace(m);
    const edgeA = geo.nodes.get('sw-edge-a');
    const core = geo.nodes.get('sw-core-1');
    expect(edgeA?.leftSlots.some((s) => s.res === 'in' && s.bps === 10e9)).toBe(true);
    expect(core?.leftSlots.some((s) => s.res !== undefined)).toBe(false);
    expect(core?.rightSlots.some((s) => s.res !== undefined)).toBe(false);
    const resThickness = edgeA?.leftSlots.find((s) => s.res === 'in')?.thickness ?? 0;
    const anchorThickness = geo.edges.get(m.anchorEdge?.id ?? '')?.t ?? -1;
    expect(resThickness).toBe(anchorThickness);
  });
});

describe('in-column order (flow)', () => {
  it('traceFlowOf is the traced side only: in for destination, out for source, no residuals', () => {
    const m = model(traceSample('classic'));
    const b = m.nodeMap.get('sw-edge-a');
    expect(b).toBeDefined();
    if (b === undefined) {
      return;
    }
    expect(traceFlowOf(b, 'destination')).toBe(b.tracedIn);
    expect(traceFlowOf(b, 'source')).toBe(b.tracedOut);
    expect(b.otherIn).toBeGreaterThan(0);
    expect(traceFlowOf(b, 'destination')).toBeLessThan(b.tracedIn + b.otherIn);
    const om = model(traceSample('client'));
    const owner = om.nodes.find((n) => n.role === 'owner');
    if (owner !== undefined) {
      expect(traceFlowOf(owner, 'destination')).toBe(sum(owner.inEdges));
    }
    const sm = model(traceSample('k8s-source'));
    const ns = sm.nodes.find((n) => n.role === 'ns');
    if (ns !== undefined) {
      expect(traceFlowOf(ns, 'source')).toBe(sum(ns.outEdges));
      expect(traceFlowOf(ns, 'source')).toBeGreaterThan(0);
    }
    expect(traceFlowOf(m.nodes.find((n) => n.kind === 'anchor') ?? b, 'destination')).toBe(0);
  });

  it('each ungrouped partition is monotone non-increasing in traced flow', () => {
    let checked = 0;
    for (const { name, model: m } of CORPUS) {
      for (const col of colsOf(m, 'flow')) {
        // Under the cluster grouping a column stacks one block per frame, then the loose
        // cards: the order rule holds inside each block, not across them.
        const parts = blocksOf(
          m,
          col.filter((n) => !isClientPartition(n))
        ).concat([col.filter(isClientPartition)]);
        for (const part of parts) {
          const grouped = part.some(
            (n) =>
              (n.kind === 'leaf' && (n.role === 'pod' || n.role === 'app') && n.namespace !== null) ||
              n.inEdges.some((e) => e.lateral) ||
              n.outEdges.some((e) => e.lateral)
          );
          if (grouped || part.length < 2) {
            continue;
          }
          const f = part.map((n) => traceFlowOf(n, m.direction));
          for (let i = 1; i < f.length; i += 1) {
            expect(f[i] ?? 0, `${name}: ${part[i - 1]?.label ?? ''} → ${part[i]?.label ?? ''}`).toBeLessThanOrEqual(
              (f[i - 1] ?? 0) + 1e-9
            );
          }
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('leaf pods and applications of one namespace stay adjacent', () => {
    let checked = 0;
    for (const { name, model: m } of CORPUS) {
      for (const col of colsOf(m, 'flow')) {
        // One namespace name in two clusters is two cards in two blocks: adjacency holds per block.
        for (const part of blocksOf(m, col)) {
          const seen = new Map<string, number>();
          part.forEach((n, i) => {
            if (n.kind !== 'leaf' || (n.role !== 'pod' && n.role !== 'app') || n.namespace === null) {
              return;
            }
            const at = seen.get(n.namespace);
            if (at !== undefined) {
              expect(i, `${name}: namespace ${n.namespace} split`).toBe(at + 1);
            }
            seen.set(n.namespace, i);
          });
          if (seen.size > 0) {
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('k8s cards sit above the client partition, each partition on one shared top line', () => {
    let checkedCols = 0;
    let checkedBoth = 0;
    for (const { name, model: m } of CORPUS) {
      const geo = layoutTrace(m);
      const upperTops: number[] = [];
      const lowerTops: number[] = [];
      geo.cols.forEach((col) => {
        const upper = col.filter((n) => bandOf(n) === 'k8s');
        const lower = col.filter(isClientPartition);
        if (upper.length === 0 && lower.length === 0) {
          return;
        }
        checkedCols += 1;
        const ys = (list: TraceNode[]): number[] => list.map((n) => geo.nodes.get(n.id)?.y ?? Number.NaN);
        const bottoms = (list: TraceNode[]): number[] =>
          list.map((n) => (geo.nodes.get(n.id)?.y ?? Number.NaN) + (geo.nodes.get(n.id)?.h ?? 0));
        if (upper.length > 0) {
          upperTops.push(Math.min(...ys(upper)));
        }
        if (lower.length > 0) {
          lowerTops.push(Math.min(...ys(lower)));
        }
        if (upper.length > 0 && lower.length > 0) {
          checkedBoth += 1;
          expect(Math.max(...bottoms(upper)), `${name}: client partition overlaps k8s`).toBeLessThan(
            Math.min(...ys(lower))
          );
        }
      });
      for (const t of upperTops) {
        expect(t, `${name}: k8s tops differ`).toBeCloseTo(upperTops[0] ?? t, 6);
      }
      for (const t of lowerTops) {
        expect(t, `${name}: client tops differ`).toBeCloseTo(lowerTops[0] ?? t, 6);
      }
    }
    expect(checkedCols).toBeGreaterThan(10);
    expect(checkedBoth).toBeGreaterThan(0);
  });

  it('dci-tier keeps the DCI between its producers and its consumers', () => {
    const m = model(traceSample('dci-tier'));
    const col = colsOf(m, 'flow').find((c) => c.some((n) => n.label.startsWith('DCI')));
    expect(col).toBeDefined();
    if (col === undefined) {
      return;
    }
    const idx = col.map((n) => n.label);
    const dci = idx.findIndex((l) => l.startsWith('DCI'));
    const up = Math.max(...[1, 2, 3].map((i) => idx.indexOf(`BDR ${String(i)}`)));
    const down = Math.min(...[4, 5, 6].map((i) => idx.indexOf(`BDR ${String(i)}`)));
    expect(up).toBeGreaterThanOrEqual(0);
    expect(down).toBeGreaterThanOrEqual(0);
    expect(up).toBeLessThan(dci);
    expect(dci).toBeLessThan(down);
  });

  it('cluster frames span every k8s column, share their tops, and hold every member', () => {
    const s = traceSample('k8s-clusters');
    const m = model(s, { grouping: 'cluster' });
    const labels = (order: TraceNodeOrder): string[] => layoutTrace(m, { order }).clusters.map((g) => g.cluster.label);
    // east carries 8 Gbps of pods, west 7 Gbps.
    expect(labels('flow')).toEqual(['east', 'west']);
    expect(labels('barycenter')).toEqual(['east', 'west']);
    const geo = layoutTrace(m, { order: 'flow' });
    const k8sCols = [...new Set(m.nodes.filter((n) => bandOf(n) === 'k8s').map((n) => n.col))].sort((a, b) => a - b);
    const first = k8sCols[0] ?? 0;
    const last = k8sCols[k8sCols.length - 1] ?? 0;
    expect(k8sCols.length).toBeGreaterThan(2);
    const lastW = Math.max(CARD_W, ...m.nodes.filter((n) => n.col === last).map((n) => geo.nodes.get(n.id)?.w ?? 0));
    for (const cg of geo.clusters) {
      expect(cg.x).toBe((geo.colX[first] ?? 0) - WRAPPER_PAD);
      expect(cg.x + cg.w).toBe((geo.colX[last] ?? 0) + lastW + WRAPPER_PAD);
      for (const id of cg.cluster.memberIds) {
        const g = geo.nodes.get(id);
        expect(g).toBeDefined();
        if (g !== undefined) {
          expect(g.x).toBeGreaterThanOrEqual(cg.x + WRAPPER_PAD);
          expect(g.x + g.w).toBeLessThanOrEqual(cg.x + cg.w - WRAPPER_PAD);
          expect(g.y).toBeGreaterThanOrEqual(cg.y + WRAPPER_HEADER_H);
          expect(g.y + g.h).toBeLessThanOrEqual(cg.y + cg.h - WRAPPER_PAD);
        }
      }
    }
    const [east, west] = geo.clusters;
    expect(east).toBeDefined();
    expect(west).toBeDefined();
    if (east === undefined || west === undefined) {
      return;
    }
    expect(west.y).toBeGreaterThanOrEqual(east.y + east.h);
    // Loose k8s cards sit below the last frame; the client leaf below every k8s card.
    const loose = m.nodes.filter((n) => bandOf(n) === 'k8s' && n.cluster === null);
    expect(loose.length).toBeGreaterThan(0);
    for (const n of loose) {
      expect(geo.nodes.get(n.id)?.y ?? 0).toBeGreaterThanOrEqual(west.y + west.h);
    }
    const k8sBottom = Math.max(
      ...m.nodes
        .filter((n) => bandOf(n) === 'k8s')
        .map((n) => (geo.nodes.get(n.id)?.y ?? 0) + (geo.nodes.get(n.id)?.h ?? 0))
    );
    const client = geo.nodes.get('srv-log-01');
    expect(client?.y ?? 0).toBeGreaterThanOrEqual(k8sBottom + BAND_GAP);
    expect(geo.height).toBeGreaterThanOrEqual(west.y + west.h);
  });

  it('grouping none lays out exactly as before the grouping existed', () => {
    const s = traceSample('k8s-clusters');
    const a = layoutTrace(model(s), { order: 'flow' });
    const b = layoutTrace(model(s, { grouping: 'none' }), { order: 'flow' });
    expect(a.clusters).toEqual([]);
    expect(JSON.stringify([...a.nodes.entries()])).toBe(JSON.stringify([...b.nodes.entries()]));
  });

  it('the order option really changes at least one layout', () => {
    let differ = 0;
    for (const { model: m } of CORPUS) {
      const seq = (order: TraceNodeOrder): string =>
        colsOf(m, order)
          .map((c) => c.map((n) => n.id).join(','))
          .join('|');
      if (seq('flow') !== seq('barycenter')) {
        differ += 1;
      }
    }
    expect(differ).toBeGreaterThan(0);
  });
});

describe('column captions', () => {
  it('names the trace start, hops and stops', () => {
    const labels = layoutTrace(model(traceSample('classic'))).columns.map((c) => c.label);
    expect(labels[0]).toBe('Trace start (in)');
    expect(labels[1]).toBe('Hop 1');
    expect(labels[labels.length - 1]).toBe('client');
    const src = layoutTrace(model(traceSample('k8s-source'))).columns.map((c) => c.label);
    expect(src).toEqual(['namespace', 'pod', 'k8s node', 'Hop 1', 'Trace start (out)']);
    // Hops count away from the start under both directions: a source trace numbers right to left.
    const out = layoutTrace(model(traceSample('source'))).columns.map((c) => c.label);
    expect(out).toEqual(['client', 'Hop 2', 'Hop 1', 'Trace start (out)']);

    const client = layoutTrace(model(traceSample('client'))).columns.map((c) => c.label);
    expect(client).toEqual(['Trace start (in)', 'Hop 1', 'client', 'owner']);
    const k8s = layoutTrace(model(traceSample('k8s'))).columns.map((c) => c.label);
    expect(k8s).toEqual(['Trace start (in)', 'Hop 1', 'k8s node', 'pod', 'namespace / client']);
  });
});
