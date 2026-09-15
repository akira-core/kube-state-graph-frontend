import type cytoscape from 'cytoscape';
import { describe, expect, it } from 'vitest';

import { SHOWCASE_STORAGE_GRAPH } from '../../../shared/fixtures/showcaseStorageGraph';
import { normalizeGraph } from '../../graph-data';
import { TRACE_SAMPLES, traceSample, type TraceSample } from '../testing/samples';

import { hopBalanceRows, namespaceAggs } from './aggregates';
import { bandOf, isClientPartition, k8sSubcol } from './bands';
import { deriveTrace, directionFor, indexTrace, resolveTraceDirection } from './deriveTrace';
import type { TraceModelOk, TraceNode } from './types';

function elementsOf(wire: unknown): cytoscape.ElementDefinition[] {
  const { elements, errors } = normalizeGraph(wire);
  expect(errors).toEqual([]);
  return elements;
}

function derive(sample: TraceSample, opts: { minBps?: number } = {}): TraceModelOk {
  const model = deriveTrace(elementsOf(sample.wire), { direction: sample.direction, ...opts });
  if (!model.ok) {
    throw new Error(`${sample.key}: ${model.errors.join(' / ')}`);
  }
  return model;
}

function node(model: TraceModelOk, id: string): TraceNode {
  const n = model.nodeMap.get(id);
  if (n === undefined) {
    throw new Error(`no node ${id}`);
  }
  return n;
}

const N = (data: Record<string, unknown>): { data: Record<string, unknown> } => ({ data });
const E = (data: Record<string, unknown>): { data: Record<string, unknown> } => ({ data });

describe('deriveTrace on the sample corpus', () => {
  it.each(TRACE_SAMPLES.map((s) => [s.key, s] as const))('%s derives and every hop balances', (_key, sample) => {
    const model = derive(sample);
    expect(model.nodes.length).toBeGreaterThan(0);
    for (const n of model.nodes) {
      if (n.kind !== 'node' || n.noFlow) {
        continue;
      }
      // traced in + other in = traced out + other out, within the counter-noise epsilon —
      // unless the wire gave both explicit residuals and they do not balance (a warning).
      const explicitBoth = n.otherInBps !== null && n.otherOutBps !== null;
      if (!explicitBoth) {
        expect(Math.abs(n.tracedIn + n.otherIn - (n.tracedOut + n.otherOut))).toBeLessThanOrEqual(n.resEps);
      }
      expect(n.otherIn).toBeGreaterThanOrEqual(0);
      expect(n.otherOut).toBeGreaterThanOrEqual(0);
    }
    // Every edge is attached at both ends, in the node map, and numbered uniquely.
    const ids = new Set<string>();
    for (const e of model.edges) {
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
      expect(node(model, e.fromId).outEdges).toContain(e);
      expect(node(model, e.toId).inEdges).toContain(e);
    }
    // Columns start at 0 and every node is in [0, maxCol].
    expect(Math.min(...model.nodes.map((n) => n.col))).toBe(0);
    for (const n of model.nodes) {
      expect(n.col).toBeLessThanOrEqual(model.maxCol);
    }
  });

  it('never mutates the input elements', () => {
    const elements = elementsOf(traceSample('client').wire);
    const before = JSON.stringify(elements);
    deriveTrace(elements, { direction: 'destination', minBps: 5e8 });
    expect(JSON.stringify(elements)).toBe(before);
  });

  it('classic: the extra 10 Gbps out of Edge A is its "other in", and the anchor is kept', () => {
    const model = derive(traceSample('classic'));
    const edgeA = node(model, 'sw-edge-a');
    expect(edgeA.isRoot).toBe(true);
    expect(model.root).toBe(edgeA);
    expect(model.anchorEdge?.isAnchor).toBe(true);
    expect(model.anchorEdge?.bps).toBe(10e9);
    expect(edgeA.tracedIn).toBe(10e9);
    expect(edgeA.tracedOut).toBe(20e9);
    expect(edgeA.otherIn).toBe(10e9);
    expect(edgeA.otherOut).toBe(0);
    // Core 1 receives 20 G and passes 20 G on: nothing unaccounted.
    const core = node(model, 'sw-core-1');
    expect(core.otherIn).toBe(0);
    expect(core.otherOut).toBe(0);
    // The host is a trace-stop leaf carrying the iface it was reached on.
    const host = node(model, 'srv-db-07');
    expect(host.kind).toBe('leaf');
    expect(host.role).toBe('leaf');
    expect(host.type).toBe('host');
    expect(host.bps).toBe(20e9);
    expect(host.iface).toBe('eno1');
    // Anchor column on the left for a destination trace.
    expect(model.nodes.find((n) => n.kind === 'anchor')?.col).toBe(0);
    expect(edgeA.col).toBe(1);
  });

  it('a hop with no inbound edge is a source and gets no "other in"', () => {
    const wire = {
      elements: {
        nodes: [N({ id: 'a', type: 'switch' }), N({ id: 'b', type: 'switch' }), N({ id: 'h', type: 'host' })],
        edges: [
          E({ id: 'e1', type: 'network-flow', source: 'a', target: 'b', metrics: { delta_bps: 3e9 } }),
          E({ id: 'e2', type: 'network-flow', source: 'b', target: 'h', metrics: { delta_bps: 1e9 } }),
        ],
      },
    };
    const model = deriveTrace(elementsOf(wire), { direction: 'destination' });
    expect(model.ok).toBe(true);
    if (!model.ok) {
      return;
    }
    expect(model.investigation).toBeNull();
    expect(node(model, 'a').otherIn).toBe(0);
    expect(node(model, 'a').otherOut).toBe(0);
    expect(node(model, 'b').otherOut).toBe(2e9);
  });

  it('explicit other_out_bps derives the other side; both given and unbalanced only warns', () => {
    const model = derive(traceSample('k8s'));
    const w11 = node(model, 'node-w-11');
    expect(w11.otherOutBps).toBe(2.5e9);
    expect(w11.otherOut).toBe(2.5e9);
    expect(w11.tracedIn + w11.otherIn).toBeCloseTo(w11.tracedOut + w11.otherOut, 3);

    const wire = {
      elements: {
        nodes: [
          N({ id: 'a', type: 'switch' }),
          N({ id: 'b', type: 'switch', other_in_bps: 1e9, other_out_bps: 5e9 }),
          N({ id: 'h', type: 'host' }),
        ],
        edges: [
          E({ id: 'e1', type: 'network-flow', source: 'a', target: 'b', metrics: { delta_bps: 3e9 } }),
          E({ id: 'e2', type: 'network-flow', source: 'b', target: 'h', metrics: { delta_bps: 3e9 } }),
        ],
      },
    };
    const m = deriveTrace(elementsOf(wire), { direction: 'destination' });
    expect(m.ok).toBe(true);
    if (!m.ok) {
      return;
    }
    expect(node(m, 'b').otherIn).toBe(1e9);
    expect(node(m, 'b').otherOut).toBe(5e9);
    expect(m.warnings.some((w) => w.includes('do not balance'))).toBe(true);
  });
});

describe('display threshold (minBps)', () => {
  it('hides ribbons at or below the threshold, folds them into residuals, keeps the anchor', () => {
    const sample = traceSample('client');
    const full = derive(sample);
    const cut = derive(sample, { minBps: 5e9 });
    expect(cut.minBps).toBe(5e9);
    expect(cut.filtered.edges).toBeGreaterThan(0);
    expect(cut.edges.length).toBeLessThan(full.edges.length);
    expect(cut.edges.every((e) => e.derived || e.isAnchor || e.bps > 5e9)).toBe(true);
    expect(cut.anchorEdge).not.toBeNull();
    expect(cut.warnings.some((w) => w.startsWith('Display threshold'))).toBe(true);
    // The start hop still balances: the hidden downstream amount is now "other out".
    const root = cut.root;
    expect(root).not.toBeNull();
    if (root !== null) {
      expect(root.tracedIn + root.otherIn).toBeCloseTo(root.tracedOut + root.otherOut, 3);
      expect(root.otherOut).toBeGreaterThan(0);
    }
  });

  it('a hop left with no ribbon is removed whole and listed', () => {
    const wire = {
      elements: {
        nodes: [
          N({ id: 'a', type: 'switch', investigation: { iface: 'x', delta_bps: 10e9, direction: 'in' } }),
          N({ id: 'b', type: 'switch', name: 'Small B' }),
          N({ id: 'c', type: 'switch', name: 'Big C' }),
          N({ id: 'h1', type: 'host' }),
          N({ id: 'h2', type: 'host' }),
        ],
        edges: [
          E({ id: 'e1', type: 'network-flow', source: 'a', target: 'b', metrics: { delta_bps: 1e9 } }),
          E({ id: 'e2', type: 'network-flow', source: 'a', target: 'c', metrics: { delta_bps: 9e9 } }),
          E({ id: 'e3', type: 'network-flow', source: 'b', target: 'h1', metrics: { delta_bps: 1e9 } }),
          E({ id: 'e4', type: 'network-flow', source: 'c', target: 'h2', metrics: { delta_bps: 9e9 } }),
        ],
      },
    };
    const m = deriveTrace(elementsOf(wire), { direction: 'destination', minBps: 2e9 });
    expect(m.ok).toBe(true);
    if (!m.ok) {
      return;
    }
    expect(m.nodeMap.has('b')).toBe(false);
    expect(m.nodeMap.has('h1')).toBe(false);
    expect(m.filteredNodes).toEqual(['Small B']);
    expect(m.filtered).toEqual({ edges: 2, bps: 2e9 });
    expect(node(m, 'a').otherOut).toBe(1e9);
  });

  it('a threshold that hides everything but the anchor still derives ok', () => {
    const m = derive(traceSample('classic'), { minBps: 1e12 });
    expect(m.edges.every((e) => e.isAnchor)).toBe(true);
    expect(m.nodes.map((n) => n.kind).sort()).toEqual(['anchor', 'node']);
  });
});

describe('clients and owners', () => {
  it('a port with one owner meters its amount; a shared port draws ownership lines only', () => {
    const model = derive(traceSample('client'));
    const owners = model.nodes.filter((n) => n.role === 'owner');
    expect(owners.length).toBeGreaterThan(0);
    const single = node(model, 'sw-tor-1:xe-0/0/12');
    expect(single.clients).toHaveLength(1);
    expect(single.label).toBe('lab-gpu-01');
    expect(single.named).toBe(false);
    expect(single.ownerLinked).toBe(true);
    const metered = single.outEdges.filter((e) => e.derived && !e.owns);
    expect(metered).toHaveLength(1);
    expect(metered[0]?.bps).toBe(single.bps);
    const owner = node(model, metered[0]?.toId ?? '');
    expect(owner.role).toBe('owner');
    expect(owner.meteredPorts).toBeGreaterThanOrEqual(1);

    const shared = node(model, 'sw-tor-1:xe-0/0/14');
    expect(shared.named).toBe(true);
    expect(shared.label).toBe('未管理小 switch');
    const lines = shared.outEdges.filter((e) => e.derived);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((e) => e.owns && e.bps === 0)).toBe(true);
    // The IP-only client keeps the ip as its name.
    expect(node(model, 'sw-tor-1:xe-0/0/13').label).toBe('10.42.7.32');
  });

  it('a port whose clients have no owner stays a plain trace stop', () => {
    const model = derive(traceSample('client'));
    const noOwner = node(model, 'sw-tor-1:xe-0/0/13');
    expect(noOwner.ownerLinked).toBe(false);
    expect(noOwner.outEdges).toHaveLength(0);
  });
});

describe('pods, applications and namespaces', () => {
  it('leaf pods link to their namespace card; counts and totals are the pods regrouped', () => {
    const model = derive(traceSample('k8s'));
    const ns = model.nodes.filter((n) => n.role === 'ns');
    expect(ns.length).toBeGreaterThan(0);
    for (const card of ns) {
      const members = card.inEdges.map((e) => node(model, e.fromId));
      expect(members.every((m) => m.role === 'pod' || m.role === 'app')).toBe(true);
      expect(card.bps).toBeCloseTo(
        members.reduce((s, m) => s + m.bps, 0),
        3
      );
      expect(card.podCount).toBe(members.reduce((s, m) => s + (m.role === 'app' ? m.podCount : 1), 0));
    }
    const aggs = namespaceAggs(model);
    for (const a of aggs) {
      const card = ns.find((n) => n.label === a.namespace);
      expect(a.podsTotal).toBeGreaterThanOrEqual(a.pods);
      if (card !== undefined) {
        expect(a.pods).toBe(card.podCount);
        expect(a.total).toBe(card.bps);
      }
    }
  });

  it('an application ancestor inserts an application card between pod and namespace', () => {
    const wire = {
      elements: {
        nodes: [
          N({ id: 'sw', type: 'switch', investigation: { iface: 'x', delta_bps: 2e9, direction: 'in' } }),
          N({ id: 'ns1', type: 'namespace', name: 'shop' }),
          N({ id: 'app1', type: 'application', name: 'cart', parent: 'ns1' }),
          N({ id: 'p1', type: 'pod', name: 'cart-1', parent: 'app1', status: 'warning' }),
          N({ id: 'p2', type: 'pod', name: 'cart-2', parent: 'app1' }),
        ],
        edges: [
          E({ id: 'e1', type: 'network-flow', source: 'sw', target: 'p1', metrics: { delta_bps: 1e9 } }),
          E({ id: 'e2', type: 'network-flow', source: 'sw', target: 'p2', metrics: { delta_bps: 1e9 } }),
        ],
      },
    };
    const m = deriveTrace(elementsOf(wire), { direction: 'destination' });
    expect(m.ok).toBe(true);
    if (!m.ok) {
      return;
    }
    const app = m.nodes.find((n) => n.role === 'app');
    const ns = m.nodes.find((n) => n.role === 'ns');
    expect(app?.label).toBe('cart');
    expect(app?.namespace).toBe('shop');
    expect(app?.podCount).toBe(2);
    expect(app?.bps).toBe(2e9);
    expect(app?.status).toBe('warning');
    expect(ns?.label).toBe('shop');
    expect(ns?.podCount).toBe(2);
    expect(ns?.bps).toBe(2e9);
    expect(m.edges.filter((e) => e.tier === 'pod-application')).toHaveLength(2);
    expect(m.edges.filter((e) => e.tier === 'application-namespace')).toHaveLength(1);
    expect(node(m, 'p1').namespace).toBe('shop');
  });

  it('source traces put the namespace card on the left', () => {
    const model = derive(traceSample('k8s-source'));
    expect(model.direction).toBe('source');
    const ns = model.nodes.filter((n) => n.role === 'ns');
    expect(ns.length).toBeGreaterThan(0);
    for (const card of ns) {
      expect(card.col).toBe(0);
      expect(card.outEdges.length).toBeGreaterThan(0);
      expect(card.inEdges).toHaveLength(0);
    }
    expect(model.nodes.find((n) => n.kind === 'anchor')?.col).toBe(model.maxCol);
  });
});

describe('bands: switch | k8s node → pod → application → namespace / client | owner', () => {
  // `|| 0` folds a -0 from the source-trace sign flip back to +0 for `toBe`.
  const colOf = (m: TraceModelOk, pick: (n: TraceNode) => boolean): number[] =>
    [...new Set(m.nodes.filter(pick).map((n) => n.col || 0))].sort((a, b) => a - b);

  it.each(TRACE_SAMPLES.map((s) => [s.key, s] as const))('%s: every band takes its own columns', (_k, sample) => {
    const m = derive(sample);
    const sign = m.direction === 'destination' ? 1 : -1;
    const sw = colOf(m, (n) => bandOf(n) === 'switch').map((c) => c * sign || 0);
    const chain = ['node', 'pod', 'app', 'ns'].map((s) =>
      colOf(m, (n) => k8sSubcol(n) === s).map((c) => c * sign || 0)
    );
    const client = colOf(m, isClientPartition).map((c) => c * sign || 0);
    const owner = colOf(m, (n) => bandOf(n) === 'owner').map((c) => c * sign || 0);
    // Each k8s sub-column is one column, strictly after every switch column and in chain order.
    let prev = Math.max(...sw, Number.NEGATIVE_INFINITY);
    for (const cols of chain) {
      expect(cols.length).toBeLessThanOrEqual(1);
      const c = cols[0];
      if (c !== undefined) {
        expect(c).toBeGreaterThan(prev);
        prev = c;
      }
    }
    // Clients share the last k8s column (or stand alone right after the switches).
    expect(client.length).toBeLessThanOrEqual(1);
    const lastK8s = chain.flat().pop();
    const c0 = client[0];
    if (c0 !== undefined) {
      expect(c0).toBe(lastK8s ?? Math.max(...sw) + 1);
      prev = Math.max(prev, c0);
    }
    expect(owner.length).toBeLessThanOrEqual(1);
    const o0 = owner[0];
    if (o0 !== undefined) {
      expect(o0).toBe(prev + 1);
    }
    // Columns are dense from 0.
    const all = colOf(m, () => true);
    expect(all[0]).toBe(0);
    expect(all[all.length - 1]).toBe(all.length - 1);
  });

  it('k8s: the host port sits in the namespace column, the k8s nodes keep their own', () => {
    const m = derive(traceSample('k8s'));
    const ns = m.nodes.filter((n) => n.role === 'ns');
    expect(ns.length).toBeGreaterThan(0);
    expect(node(m, 'srv-log-01').col).toBe(ns[0]?.col);
    expect(node(m, 'node-w-11').col).toBe(node(m, 'sw-tor-k8s').col + 1);
    expect(node(m, 'ingest-7d9c').col).toBe(node(m, 'node-w-11').col + 1);
    expect(m.warnings.some((w) => w.includes('band boundary'))).toBe(false);
  });

  it('a k8s node feeding a switch back runs against the bands: backflow with a warning', () => {
    const wire = {
      elements: {
        nodes: [
          N({
            id: 'sw1',
            type: 'switch',
            name: 'SW 1',
            investigation: { iface: 'xe-0/0/1', delta_bps: 3e9, direction: 'in' },
          }),
          N({ id: 'sw2', type: 'switch', name: 'SW 2' }),
          N({ id: 'k1', type: 'node', name: 'k1' }),
        ],
        edges: [
          E({ id: 'e1', type: 'network-flow', source: 'sw1', target: 'k1', metrics: { delta_bps: 3e9 } }),
          E({ id: 'e2', type: 'network-flow', source: 'k1', target: 'sw2', metrics: { delta_bps: 1e9 } }),
        ],
      },
    };
    const m = deriveTrace(elementsOf(wire), { direction: 'destination' });
    expect(m.ok).toBe(true);
    if (!m.ok) {
      return;
    }
    const back = m.edges.find((e) => e.fromId === 'k1' && e.toId === 'sw2');
    expect(back?.backward).toBe(true);
    expect(node(m, 'sw2').col).toBeLessThan(node(m, 'k1').col);
    expect(m.warnings.some((w) => w.includes('band boundary') && w.includes('k1 → SW 2'))).toBe(true);
  });
});

describe('columns, backflow and lateral edges', () => {
  it('dci-uturn draws the minority direction as backflow', () => {
    const model = derive(traceSample('dci-uturn'));
    expect(model.edges.some((e) => e.backward)).toBe(true);
    expect(model.warnings.some((w) => w.includes('backflow'))).toBe(true);
    for (const e of model.edges) {
      const from = node(model, e.fromId);
      const to = node(model, e.toId);
      expect(e.backward).toBe(from.col > to.col);
      expect(e.lateral).toBe(from.col === to.col);
    }
  });

  it('dci-tier locks a tier to one column and orders producers before consumers', () => {
    const model = derive(traceSample('dci-tier'));
    const byTier = new Map<string, Set<number>>();
    for (const n of model.nodes) {
      if (n.tier !== null) {
        const cols = byTier.get(n.tier) ?? new Set<number>();
        cols.add(n.col);
        byTier.set(n.tier, cols);
      }
    }
    expect(byTier.size).toBeGreaterThan(0);
    for (const cols of byTier.values()) {
      expect(cols.size).toBe(1);
    }
    const lateral = model.edges.filter((e) => e.lateral);
    expect(lateral.length).toBeGreaterThan(0);
    for (const e of lateral) {
      if (!e.dropped) {
        expect(node(model, e.fromId).subOrder).toBeLessThan(node(model, e.toId).subOrder);
      }
    }
  });
});

describe('hop kinds', () => {
  it('a router is a hop like a switch: a box with slots and residuals in the switch band', () => {
    const wire = {
      elements: {
        nodes: [
          N({
            id: 'sw-a',
            type: 'switch',
            name: 'A',
            investigation: { iface: 'xe-0/0/1', delta_bps: 2e9, direction: 'in' },
          }),
          N({ id: 'rt-1', type: 'router', name: 'R1', labels: { tier: 'core' } }),
          N({ id: 'sw-b', type: 'switch', name: 'B' }),
          N({ id: 'srv', type: 'host' }),
        ],
        edges: [
          E({
            id: 'e1',
            type: 'network-flow',
            source: 'sw-a',
            target: 'rt-1',
            labels: { source_iface: 'et-1', target_iface: 'ge-0/0/0' },
            metrics: { delta_bps: 2e9 },
          }),
          E({
            id: 'e2',
            type: 'network-flow',
            source: 'rt-1',
            target: 'sw-b',
            labels: { source_iface: 'ge-0/0/1', target_iface: 'et-1' },
            metrics: { delta_bps: 1.5e9 },
          }),
          E({ id: 'e3', type: 'network-flow', source: 'sw-b', target: 'srv', metrics: { delta_bps: 1.5e9 } }),
        ],
      },
    };
    const model = deriveTrace(elementsOf(wire), { direction: 'destination' });
    expect(model.ok).toBe(true);
    if (!model.ok) {
      return;
    }
    const r = node(model, 'rt-1');
    expect(r.kind).toBe('node');
    expect(r.role).toBe('router');
    expect(r.tier).toBe('core');
    expect(bandOf(r)).toBe('switch');
    expect(r.tracedIn).toBe(2e9);
    expect(r.tracedOut).toBe(1.5e9);
    expect(r.otherOut).toBe(0.5e9);
    expect(r.col).toBe(node(model, 'sw-a').col + 1);
    expect(model.edges.filter((e) => e.fromId === 'rt-1' || e.toId === 'rt-1')).toHaveLength(2);
  });
});

describe('errors and warnings', () => {
  it('two trace starts is an error', () => {
    const wire = {
      elements: {
        nodes: [
          N({ id: 'a', type: 'switch', investigation: { iface: 'x', delta_bps: 1e9 } }),
          N({ id: 'b', type: 'switch', investigation: { iface: 'y', delta_bps: 1e9 } }),
        ],
        edges: [E({ id: 'e1', type: 'network-flow', source: 'a', target: 'b', metrics: { delta_bps: 1e9 } })],
      },
    };
    const m = deriveTrace(elementsOf(wire), { direction: 'destination' });
    expect(m.ok).toBe(false);
    if (!m.ok) {
      expect(m.errors[0]).toMatch(/2 nodes carry investigation/);
    }
  });

  it('a flow edge ending on a group, or continuing past a leaf, is an error', () => {
    const wire = {
      elements: {
        nodes: [
          N({ id: 'a', type: 'switch' }),
          N({ id: 'ns', type: 'namespace', name: 'shop' }),
          N({ id: 'h', type: 'host' }),
          N({ id: 'b', type: 'switch' }),
        ],
        edges: [
          E({ id: 'e1', type: 'network-flow', source: 'a', target: 'ns', metrics: { delta_bps: 1e9 } }),
          E({ id: 'e2', type: 'network-flow', source: 'h', target: 'b', metrics: { delta_bps: 1e9 } }),
        ],
      },
    };
    const m = deriveTrace(elementsOf(wire), { direction: 'destination' });
    expect(m.ok).toBe(false);
    if (!m.ok) {
      expect(m.errors).toHaveLength(2);
      expect(m.errors[0]).toMatch(/group/);
      expect(m.errors[1]).toMatch(/trace stop/);
    }
  });

  it('a reserved synthetic id on the wire is an error', () => {
    for (const id of ['trace:ns:1', 'trace:owner:7', 'trace:anchor']) {
      const wire = {
        elements: {
          nodes: [N({ id, type: 'switch' }), N({ id: 'h', type: 'host' })],
          edges: [E({ id: 'e1', type: 'network-flow', source: id, target: 'h', metrics: { delta_bps: 1e9 } })],
        },
      };
      const m = deriveTrace(elementsOf(wire), { direction: 'destination' });
      expect(m.ok, id).toBe(false);
      if (!m.ok) {
        expect(m.errors[0]).toMatch(/reserved/);
      }
    }
    // The guard is about the exact spelling: a look-alike id is an ordinary node.
    const ok = deriveTrace(
      elementsOf({
        elements: {
          nodes: [N({ id: 'trace:ns:x', type: 'switch' }), N({ id: 'h', type: 'host' })],
          edges: [
            E({ id: 'e1', type: 'network-flow', source: 'trace:ns:x', target: 'h', metrics: { delta_bps: 1e9 } }),
          ],
        },
      }),
      { direction: 'destination' }
    );
    expect(ok.ok).toBe(true);
  });

  it('a trace start that is a leaf pod (no onward edge) names the reason', () => {
    const wire = {
      elements: {
        nodes: [
          N({ id: 'a', type: 'switch' }),
          N({ id: 'p', type: 'pod', investigation: { iface: 'eth0', delta_bps: 1e9 } }),
        ],
        edges: [E({ id: 'e1', type: 'network-flow', source: 'a', target: 'p', metrics: { delta_bps: 1e9 } })],
      },
    };
    const m = deriveTrace(elementsOf(wire), { direction: 'destination' });
    expect(m.ok).toBe(false);
    if (!m.ok) {
      expect(m.errors[0]).toMatch(/no onward flow edge/);
      expect(m.errors[0]).not.toMatch(/placement/);
    }
  });

  it('a broken invariant in a step is a model error, not a throw', () => {
    // Normalize rejects an edge to an unknown node, so this can only be built by hand: the
    // edge step must look the endpoint up and fail.
    const elements: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'a', kind: 'switch', label: 'a' } },
      {
        group: 'edges',
        data: { id: 'e1', source: 'a', target: 'ghost', edgeType: 'network-flow', metrics: { deltaBps: 1e9 } },
      },
    ];
    const m = deriveTrace(elements, { direction: 'destination' });
    expect(m.ok).toBe(false);
    if (!m.ok) {
      expect(m.errors).toEqual(['network-trace: edge endpoint "ghost" is not a node']);
    }
  });

  it('a body with no drawable node is an error; a storage body derives to no-flow hops', () => {
    const m = deriveTrace(elementsOf({ elements: { nodes: [N({ id: 'ns', type: 'namespace' })], edges: [] } }), {
      direction: 'destination',
    });
    expect(m.ok).toBe(false);
    const storage = deriveTrace(elementsOf(SHOWCASE_STORAGE_GRAPH), { direction: 'destination' });
    expect(storage.ok).toBe(true);
    if (storage.ok) {
      expect(storage.edges).toEqual([]);
      expect(storage.nodes.length).toBeGreaterThan(0);
      expect(storage.nodes.every((n) => n.kind === 'node' && n.noFlow)).toBe(true);
    }
  });

  it('unmeasured flow edges are counted in a warning, not drawn', () => {
    const wire = {
      elements: {
        nodes: [N({ id: 'a', type: 'switch' }), N({ id: 'b', type: 'switch' }), N({ id: 'h', type: 'host' })],
        edges: [
          E({ id: 'e1', type: 'network-flow', source: 'a', target: 'b', metrics: { delta_bps: 1e9 } }),
          E({ id: 'e2', type: 'network-flow', source: 'b', target: 'h' }),
        ],
      },
    };
    const m = deriveTrace(elementsOf(wire), { direction: 'destination' });
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(m.warnings.some((w) => w.includes('no usable measurement'))).toBe(true);
      expect(m.nodeMap.has('h')).toBe(false);
    }
  });

  it('resolveTraceDirection follows track_dir and warns on disagreement', () => {
    const inv = { nodeId: 'a', iface: 'x', deltaBps: 1, direction: 'in' as const, note: '' };
    expect(resolveTraceDirection('destination', inv)).toEqual({ direction: 'destination' });
    const r = resolveTraceDirection('source', inv);
    expect(r.direction).toBe('source');
    expect(r.warning).toMatch(/asked for source/);
    expect(resolveTraceDirection(undefined, inv).direction).toBe('destination');
    expect(resolveTraceDirection(undefined, { ...inv, direction: 'out' }).direction).toBe('source');
    expect(resolveTraceDirection(undefined, null).direction).toBe('destination');
  });

  it('hopBalanceRows hides residuals below the noise epsilon', () => {
    const model = derive(traceSample('classic'));
    const rows = hopBalanceRows(model);
    expect(rows.map((r) => r.id)).toEqual(['sw-edge-a', 'sw-core-1']);
    expect(rows[0]?.otherIn).toBe(10e9);
    expect(rows[1]?.otherIn).toBe(0);
  });
});

describe('indexTrace reuse', () => {
  it('derives the same model from the index directionFor built, and ignores one for another body', () => {
    const sample = traceSample('classic');
    const elements = elementsOf(sample.wire);
    const fresh = deriveTrace(elements, { direction: sample.direction });
    const dir = directionFor(elements, sample.direction);
    expect(dir.indexed.elements).toBe(elements);
    expect(deriveTrace(elements, { direction: sample.direction }, dir.indexed)).toEqual(fresh);
    // A stale index (built for a different array) must not leak its start into this body.
    const other = indexTrace(elementsOf({ elements: { nodes: [], edges: [] } }));
    expect(deriveTrace(elements, { direction: sample.direction }, other)).toEqual(fresh);
  });
});
