import { describe, expect, it } from 'vitest';

import { normalizeGraph } from '../../features/graph-data';
import { deriveTrace } from '../../features/network-trace/model/deriveTrace';

import { SHOWCASE_TRACE } from './showcaseTrace';

/** The sankey-panel samples merged into the demo body, by id prefix. */
const MERGED_SAMPLES = [
  'dci-uturn',
  'k8s',
  'client',
  'classic',
  'dual-uplink',
  'campus',
  'pruned',
  'dci-tier',
  'k8s-source',
];

describe('SHOWCASE_TRACE', () => {
  const { elements, errors } = normalizeGraph(SHOWCASE_TRACE);

  it('normalizes cleanly and carries exactly one trace start, on the dci-uturn backbone', () => {
    expect(errors).toEqual([]);
    const starts = SHOWCASE_TRACE.elements.nodes.filter((n) => n.data.investigation !== undefined);
    expect(starts.map((n) => n.data.id)).toEqual(['dci-uturn/core-1']);
  });

  it('merges every destination-drawable sankey-panel sample, with unique ids and names', () => {
    const ids = SHOWCASE_TRACE.elements.nodes.map((n) => n.data.id);
    for (const key of MERGED_SAMPLES) {
      expect(
        ids.some((id) => id.startsWith(`${key}/`)),
        key
      ).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
    const names = SHOWCASE_TRACE.elements.nodes.flatMap((n) => (n.data.name === undefined ? [] : [n.data.name]));
    expect(new Set(names).size).toBe(names.length);
  });

  it('stitches the k8s and client samples under the backbone ToRs', () => {
    const into = (target: string): string[] =>
      SHOWCASE_TRACE.elements.edges.filter((e) => e.data.target === target).map((e) => e.data.source);
    expect(into('k8s/sw-tor-k8s')).toEqual(['dci-uturn/tor-1']);
    expect(into('client/sw-tor-1')).toEqual(['dci-uturn/tor-2']);
  });

  it('tiers every switch, and the switch band runs core → bdr / agg → dci-spn → tor → access', () => {
    const untiered = SHOWCASE_TRACE.elements.nodes
      .filter((n) => n.data.type === 'switch' && (n.data.labels?.tier ?? '') === '')
      .map((n) => n.data.id);
    expect(untiered).toEqual([]);

    const m = deriveTrace(elements, { direction: 'destination' });
    expect(m.ok ? [] : m.errors).toEqual([]);
    if (!m.ok) {
      return;
    }
    const colsOf = (tier: string): number[] => [
      ...new Set(m.nodes.filter((n) => n.role === 'switch' && n.tier === tier).map((n) => n.col)),
    ];
    const order = [['core'], ['bdr', 'border', 'agg'], ['dci-spn'], ['tor'], ['access']];
    const cols = order.map((tiers) => [...new Set(tiers.flatMap(colsOf))]);
    for (const c of cols) {
      expect(c).toHaveLength(1);
    }
    const flat = cols.map((c) => c[0] ?? -1);
    expect(flat).toEqual([...flat].sort((a, b) => a - b));
    expect(new Set(flat).size).toBe(flat.length);
  });

  it('draws every case the samples cover, and every hop that receives traffic balances', () => {
    const m = deriveTrace(elements, { direction: 'destination' });
    expect(m.ok ? [] : m.errors).toEqual([]);
    if (!m.ok) {
      return;
    }
    // dci-tier / dci-uturn: tier interconnects and backflow.
    expect(m.edges.some((e) => e.lateral)).toBe(true);
    expect(m.edges.some((e) => e.backward)).toBe(true);
    // client: a metered owner ribbon, ownership lines, client tables.
    expect(m.edges.some((e) => e.owns)).toBe(true);
    expect(m.edges.some((e) => e.derived && !e.owns && e.bps > 0 && m.nodeMap.get(e.toId)?.role === 'owner')).toBe(
      true
    );
    expect(m.nodes.some((n) => n.kind === 'leaf' && n.clients !== null)).toBe(true);
    // k8s: k8s node hops, leaf pods and their namespace cards.
    expect(m.nodes.some((n) => n.kind === 'node' && n.role === 'node')).toBe(true);
    expect(m.nodes.some((n) => n.kind === 'leaf' && n.role === 'pod')).toBe(true);
    expect(m.nodes.some((n) => n.role === 'ns')).toBe(true);
    // k8s-source: pods forwarding onward are hop boxes.
    expect(m.nodes.some((n) => n.kind === 'node' && n.role === 'pod')).toBe(true);
    // dual-uplink / pruned / campus: explicit and derived residuals on both sides.
    expect(m.nodes.some((n) => n.kind === 'node' && n.otherInBps === null && n.otherIn > n.resEps)).toBe(true);
    expect(m.nodes.some((n) => n.kind === 'node' && n.otherOutBps !== null && n.otherOut > n.resEps)).toBe(true);
    // campus: a router hop reached from two hops, with no onward edge — its traffic leaves
    // the trace as "other out".
    const router = m.nodes.find((n) => n.role === 'router');
    expect(router?.kind).toBe('node');
    expect(router?.inEdges.length).toBe(2);
    expect(router?.outEdges.length).toBe(0);
    expect((router?.otherOut ?? 0) > (router?.resEps ?? 0)).toBe(true);

    // k8s: two clusters framed under the cluster grouping, one namespace card per cluster.
    const grouped = deriveTrace(elements, { direction: 'destination', grouping: 'cluster' });
    expect(grouped.ok ? grouped.clusters.map((c) => c.label) : []).toEqual(['east', 'west']);
    expect(grouped.ok ? grouped.nodes.filter((n) => n.role === 'ns' && n.label === 'telemetry').length : 0).toBe(2);

    for (const n of m.nodes) {
      // A hop with no inbound edge is a source and draws no "other in" by design
      // (k8s-source's pods); everything else balances.
      if (n.kind === 'node' && !n.noFlow && n.inEdges.length + (n.otherInBps !== null ? 1 : 0) > 0) {
        expect(Math.abs(n.tracedIn + n.otherIn - (n.tracedOut + n.otherOut)), n.id).toBeLessThanOrEqual(n.resEps);
      }
    }
  });
});
