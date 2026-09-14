import { describe, expect, it } from 'vitest';

import { normalizeGraph } from '../../features/graph-data';
import { deriveTrace } from '../../features/network-trace/model/deriveTrace';

import { SHOWCASE_GRAPH } from './showcaseGraph';
import { SHOWCASE_TRACE } from './showcaseTrace';

describe('SHOWCASE_TRACE', () => {
  it('normalizes cleanly and carries exactly one trace start', () => {
    const { elements, errors } = normalizeGraph(SHOWCASE_TRACE);
    expect(errors).toEqual([]);
    const starts = elements.filter((el) => el.group === 'nodes' && 'investigation' in el.data);
    expect(starts).toHaveLength(1);
  });

  it('draws every mark the network Sankey has, and every hop balances', () => {
    const { elements } = normalizeGraph(SHOWCASE_TRACE);
    const flat = deriveTrace(elements, { direction: 'destination' });
    expect(flat.ok).toBe(true);
    if (!flat.ok) {
      return;
    }
    expect(flat.edges.some((e) => e.lateral)).toBe(true);
    expect(flat.edges.some((e) => e.backward)).toBe(true);
    expect(flat.edges.some((e) => e.owns)).toBe(true);
    expect(flat.edges.some((e) => e.derived && !e.owns && e.bps > 0)).toBe(true);
    expect(flat.nodes.some((n) => n.role === 'owner')).toBe(true);
    expect(flat.nodes.some((n) => n.role === 'app')).toBe(true);
    expect(flat.nodes.some((n) => n.role === 'ns')).toBe(true);
    expect(flat.nodes.some((n) => n.kind === 'node' && n.otherOut > n.resEps)).toBe(true);
    for (const n of flat.nodes) {
      if (n.kind === 'node' && !n.noFlow) {
        expect(Math.abs(n.tracedIn + n.otherIn - (n.tracedOut + n.otherOut))).toBeLessThanOrEqual(n.resEps);
      }
    }
    const node = deriveTrace(elements, { direction: 'destination', layout: 'node' });
    expect(node.ok).toBe(true);
    if (node.ok) {
      expect(node.wrappers.map((w) => w.id).sort()).toEqual(['node/worker-0', 'node/worker-1']);
      expect(node.wrappers.find((w) => w.id === 'node/worker-1')?.status).toBe('warning');
    }
  });

  it('shares its switch, node and pod ids with SHOWCASE_GRAPH so Locate works in demo mode', () => {
    const graphIds = new Set(SHOWCASE_GRAPH.elements.nodes.map((n) => n.data.id));
    for (const n of SHOWCASE_TRACE.elements.nodes) {
      if (n.data.type === 'switch' || n.data.type === 'node' || n.data.type === 'pod') {
        expect(graphIds.has(n.data.id), n.data.id).toBe(true);
      }
    }
  });
});
