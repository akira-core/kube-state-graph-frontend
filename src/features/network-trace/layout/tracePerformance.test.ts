import { describe, expect, it } from 'vitest';

import type { WireGraph } from '../../../shared/types/wire';
import { normalizeGraph } from '../../graph-data';
import { deriveTrace } from '../model/deriveTrace';
import type { TraceModelOk } from '../model/types';

import { layoutTrace } from './layoutTrace';

const AGGS = 20;
const TORS_PER_AGG = 10;
const HOSTS_PER_TOR = 9;
/** One host port's rate delta; every amount above it is a sum of these, so each hop balances. */
const HOST_BPS = 1_000_000;
const TOR_BPS = HOST_BPS * HOSTS_PER_TOR;
const AGG_BPS = TOR_BPS * TORS_PER_AGG;
const CORE_BPS = AGG_BPS * AGGS;
/** 20 core→agg + 200 agg→tor + 1800 tor→host. */
const FLOW_EDGES = AGGS + AGGS * TORS_PER_AGG + AGGS * TORS_PER_AGG * HOSTS_PER_TOR;

/**
 * Synthetic trace body at the spec's performance bound: a three-tier fabric (1 core, 20 agg,
 * 200 ToR) fanning out to 1800 trace-stop hosts — 2020 `network-flow` edges in a destination
 * trace. Every hop forwards exactly what it receives, so the residual pass has nothing to
 * fold and the whole body draws; nothing here is random, so a run costs the same every time.
 */
function syntheticTraceBody(): WireGraph {
  const nodes: WireGraph['elements']['nodes'] = [];
  const edges: WireGraph['elements']['edges'] = [];
  nodes.push({
    data: {
      id: 'sw/core-1',
      type: 'switch',
      name: 'Core 1',
      labels: { tier: 'core' },
      investigation: { iface: 'et-0/0/0', delta_bps: CORE_BPS, direction: 'in', note: 'synthetic bound' },
    },
  });
  const flow = (id: string, source: string, target: string, port: number, bps: number): void => {
    edges.push({
      data: {
        id,
        type: 'network-flow',
        source,
        target,
        labels: { source_iface: `et-0/0/${String(port)}`, target_iface: 'et-1/0/1' },
        metrics: { delta_bps: bps },
      },
    });
  };
  for (let a = 0; a < AGGS; a += 1) {
    const agg = `sw/agg-${String(a)}`;
    nodes.push({ data: { id: agg, type: 'switch', name: `Agg ${String(a)}`, labels: { tier: 'agg' } } });
    flow(`e/core-${String(a)}`, 'sw/core-1', agg, a, AGG_BPS);
    for (let t = 0; t < TORS_PER_AGG; t += 1) {
      const tor = `sw/tor-${String(a)}-${String(t)}`;
      nodes.push({
        data: { id: tor, type: 'switch', name: `ToR ${String(a)}-${String(t)}`, labels: { tier: 'tor' } },
      });
      flow(`e/agg-${String(a)}-${String(t)}`, agg, tor, t, TOR_BPS);
      for (let h = 0; h < HOSTS_PER_TOR; h += 1) {
        const host = `host/${String(a)}-${String(t)}-${String(h)}`;
        nodes.push({ data: { id: host, type: 'host', name: `host-${String(a)}-${String(t)}-${String(h)}` } });
        flow(`e/tor-${String(a)}-${String(t)}-${String(h)}`, tor, host, h, HOST_BPS);
      }
    }
  }
  return { elements: { nodes, edges } };
}

function derived(
  elements: ReturnType<typeof normalizeGraph>['elements'],
  minBps: number,
  grouping: 'none' | 'cluster'
): TraceModelOk {
  const model = deriveTrace(elements, { direction: 'destination', minBps, grouping });
  if (!model.ok) {
    throw new Error(model.errors.join(' / '));
  }
  return model;
}

// The timing cases retry twice: the budgets are about this code, not about what else the machine was
// doing, and a loaded laptop (or a CI runner sharing a box) can stall one run by seconds.
describe('Trace performance bound', () => {
  it(
    'derives and lays out the synthetic body within 1000 ms at roughly 2000 flow edges',
    { retry: 2, timeout: 15_000 },
    () => {
      // The spec's bound is 1000 ms for a first draw. The measured cost on a developer machine
      // is a fraction of that; the budget keeps the safety margin the storage Sankey's bound
      // uses, so a loaded CI box does not turn a drawing regression test into a flake.
      const { elements } = normalizeGraph(syntheticTraceBody());
      const t0 = performance.now();
      const model = derived(elements, 0, 'none');
      const geo = layoutTrace(model, { order: 'flow' });
      expect(performance.now() - t0).toBeLessThanOrEqual(1000);

      const count = (role: string): number => model.nodes.filter((n) => n.role === role).length;
      expect(count('switch')).toBe(1 + AGGS + AGGS * TORS_PER_AGG);
      expect(count('leaf')).toBe(AGGS * TORS_PER_AGG * HOSTS_PER_TOR);
      // Every wire edge is drawn, plus the anchor ribbon the trace start contributes.
      expect(model.edges).toHaveLength(FLOW_EDGES + 1);
      expect(model.filtered.edges).toBe(0);
      expect(geo.width).toBeGreaterThan(0);
      // The trace start's anchor card takes a column of its own, ahead of core / agg / tor / host.
      expect(geo.cols.filter((c) => c.length > 0)).toHaveLength(5);
    }
  );

  it('redraws the same body within 500 ms after a control change', { retry: 2, timeout: 15_000 }, () => {
    // A control change re-derives and re-lays out from the same elements, so the redraw is
    // the full cost again minus normalize. A threshold below every amount keeps the whole
    // body drawn: the cheap cut is not what the bound is about.
    const { elements } = normalizeGraph(syntheticTraceBody());
    derived(elements, 0, 'none');

    const tThreshold = performance.now();
    const lowered = derived(elements, 1, 'none');
    layoutTrace(lowered, { order: 'flow' });
    expect(performance.now() - tThreshold).toBeLessThanOrEqual(500);
    expect(lowered.filtered.edges).toBe(0);

    const tGrouping = performance.now();
    const grouped = derived(elements, 0, 'cluster');
    layoutTrace(grouped, { order: 'flow' });
    expect(performance.now() - tGrouping).toBeLessThanOrEqual(500);
    // No k8s card names a cluster here, so the grouping frames nothing — it is the recompute
    // that is under test, not the frames.
    expect(grouped.clusters).toHaveLength(0);
  });

  it('cuts the body with a threshold above the host ports and still balances every hop', () => {
    // The threshold hop: 1800 ribbons go, their amounts fold into the ToRs' "other out", and
    // the lazily-created host cards are never built. A cut body must be cheaper, not slower.
    const { elements } = normalizeGraph(syntheticTraceBody());
    const t0 = performance.now();
    const cut = derived(elements, HOST_BPS, 'none');
    layoutTrace(cut, { order: 'flow' });
    expect(performance.now() - t0).toBeLessThanOrEqual(500);
    expect(cut.filtered.edges).toBe(AGGS * TORS_PER_AGG * HOSTS_PER_TOR);
    expect(cut.nodes.filter((n) => n.role === 'leaf')).toHaveLength(0);
    for (const tor of cut.nodes.filter((n) => n.tier === 'tor')) {
      expect(tor.totalIn).toBeCloseTo(tor.totalOut, 6);
    }
  }, 15_000);
});
