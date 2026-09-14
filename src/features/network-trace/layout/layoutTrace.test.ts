import { describe, expect, it } from 'vitest';

import { normalizeGraph } from '../../graph-data';
import { deriveTrace } from '../model/deriveTrace';
import type { TraceModelOk, TraceNode } from '../model/types';
import { sum } from '../model/util';
import { TRACE_SAMPLES, traceSample, type TraceSample } from '../testing/samples';

import { layoutTrace, type TraceNodeOrder } from './layoutTrace';
import { flowOf } from './text';

function model(sample: TraceSample, opts: { minBps?: number; layout?: 'flat' | 'node' } = {}): TraceModelOk {
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
  const node = model(s, { layout: 'node' });
  if (node.wrappers.length > 0) {
    out.push({ name: `${s.key}@node`, model: node });
  }
  return out;
});

const colsOf = (m: TraceModelOk, order: TraceNodeOrder): TraceNode[][] =>
  layoutTrace(m, { order }).cols.filter((c) => c.length > 0);

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
      }
      expect(geo.columns.length).toBe(
        geo.cols.filter((c) => c.length > 0).length +
          (geo.podCol >= 0 && (geo.cols[geo.podCol]?.length ?? 0) === 0 ? 1 : 0)
      );
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
  it('flowOf is max(sum in, sum out) without residuals', () => {
    const m = model(traceSample('classic'));
    const b = m.nodeMap.get('sw-edge-a');
    expect(b).toBeDefined();
    if (b === undefined) {
      return;
    }
    expect(flowOf(b)).toBe(Math.max(b.tracedIn, b.tracedOut));
    expect(b.otherIn).toBeGreaterThan(0);
    expect(flowOf(b)).toBeLessThan(b.tracedIn + b.otherIn + b.tracedOut);
    const om = model(traceSample('client'));
    const owner = om.nodes.find((n) => n.role === 'owner');
    if (owner !== undefined) {
      expect(flowOf(owner)).toBe(Math.max(sum(owner.inEdges), sum(owner.outEdges)));
    }
  });

  it('an ungrouped column is monotone non-increasing in flow', () => {
    let checked = 0;
    for (const { name, model: m } of CORPUS) {
      for (const col of colsOf(m, 'flow')) {
        const grouped = col.some(
          (n) =>
            (n.kind === 'leaf' && n.role === 'pod' && n.namespace !== null) ||
            n.inEdges.some((e) => e.lateral) ||
            n.outEdges.some((e) => e.lateral)
        );
        if (grouped || col.length < 2) {
          continue;
        }
        const f = col.map(flowOf);
        for (let i = 1; i < f.length; i += 1) {
          expect(f[i] ?? 0, `${name}: ${col[i - 1]?.label ?? ''} → ${col[i]?.label ?? ''}`).toBeLessThanOrEqual(
            (f[i - 1] ?? 0) + 1e-9
          );
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('leaf pods of one namespace stay adjacent', () => {
    let checked = 0;
    for (const { name, model: m } of CORPUS) {
      for (const col of colsOf(m, 'flow')) {
        const seen = new Map<string, number>();
        col.forEach((n, i) => {
          if (n.kind !== 'leaf' || n.role !== 'pod' || n.namespace === null) {
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
    expect(checked).toBeGreaterThan(0);
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

  it('frames order by member flow under flow, by name under barycenter', () => {
    const N = (data: Record<string, unknown>): { data: Record<string, unknown> } => ({ data });
    const E = (data: Record<string, unknown>): { data: Record<string, unknown> } => ({ data });
    const wire = {
      elements: {
        nodes: [
          N({
            id: 'sw1',
            type: 'switch',
            name: 'SW 1',
            investigation: { iface: 'xe-0/0/1', delta_bps: 3e9, direction: 'in' },
          }),
          N({ id: 'aaa-node', type: 'node', name: 'aaa-node' }),
          N({ id: 'zzz-node', type: 'node', name: 'zzz-node' }),
          N({ id: 'ns1', type: 'namespace', name: 'ns1' }),
          N({ id: 'p-small', type: 'pod', name: 'p-small', parent: 'ns1' }),
          N({ id: 'p-big', type: 'pod', name: 'p-big', parent: 'ns1' }),
        ],
        edges: [
          E({ id: 'e1', type: 'network-flow', source: 'sw1', target: 'p-small', metrics: { delta_bps: 1e9 } }),
          E({ id: 'e2', type: 'network-flow', source: 'sw1', target: 'p-big', metrics: { delta_bps: 2e9 } }),
          E({ id: 'e3', type: 'network-flow', source: 'p-small', target: 'aaa-node', labels: { tier: 'pod-node' } }),
          E({ id: 'e4', type: 'network-flow', source: 'p-big', target: 'zzz-node', labels: { tier: 'pod-node' } }),
        ],
      },
    };
    const m = deriveTrace(normalizeGraph(wire).elements, { direction: 'destination', layout: 'node' });
    expect(m.ok).toBe(true);
    if (!m.ok) {
      return;
    }
    expect(m.wrappers).toHaveLength(2);
    const labels = (order: TraceNodeOrder): string[] => layoutTrace(m, { order }).wrappers.map((g) => g.wrapper.label);
    expect(labels('barycenter')).toEqual(['aaa-node', 'zzz-node']);
    expect(labels('flow')).toEqual(['zzz-node', 'aaa-node']);
    const geo = layoutTrace(m, { order: 'flow' });
    for (const wg of geo.wrappers) {
      for (const pid of wg.wrapper.podIds) {
        const g = geo.nodes.get(pid);
        expect(g).toBeDefined();
        if (g !== undefined) {
          expect(g.x).toBeGreaterThan(wg.x);
          expect(g.y).toBeGreaterThan(wg.y);
          expect(g.y + g.h).toBeLessThanOrEqual(wg.y + wg.h);
        }
      }
    }
    expect(geo.columns.some((c) => c.label.includes('node / pod'))).toBe(true);
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
    expect(labels[labels.length - 1]).toBe('Trace stop');
    const src = layoutTrace(model(traceSample('k8s-source'))).columns.map((c) => c.label);
    expect(src[0]).toBe('Trace stop · namespace');
    expect(src[src.length - 1]).toBe('Trace start (out)');
    const client = layoutTrace(model(traceSample('client'))).columns.map((c) => c.label);
    expect(client[client.length - 1]).toBe('Trace stop · owner');
  });
});
