import { describe, expect, it } from 'vitest';

import { normalizeGraph } from '../../graph-data';
import { deriveTrace } from '../model/deriveTrace';
import type { TraceModelOk } from '../model/types';
import { traceSample } from '../testing/samples';

import { cardText, clientTableLines, clip } from './text';
import { bandTooltipLines, nodeTooltipLines, residualTooltipLines } from './tooltips';

function model(key: string, layout: 'flat' | 'node' = 'flat'): TraceModelOk {
  const s = traceSample(key);
  const m = deriveTrace(normalizeGraph(s.wire).elements, { direction: s.direction, layout });
  if (!m.ok) {
    throw new Error(m.errors.join(' / '));
  }
  return m;
}

describe('tooltip and card text', () => {
  it('a hop names its residuals only when they are drawn, and its id only when it differs', () => {
    const m = model('classic');
    const a = m.nodeMap.get('sw-edge-a');
    const core = m.nodeMap.get('sw-core-1');
    expect(a).toBeDefined();
    expect(core).toBeDefined();
    if (a === undefined || core === undefined) {
      return;
    }
    const lines = nodeTooltipLines(a, m);
    expect(lines[0]).toBe('switch / Edge A');
    expect(lines).toContain('in 10 Gbps');
    expect(lines).toContain('out 20 Gbps');
    expect(lines).toContain('other in 10 Gbps');
    expect(lines.some((l) => l.startsWith('other out'))).toBe(false);
    expect(lines[lines.length - 1]).toBe('id sw-edge-a');
    expect(nodeTooltipLines(core, m).some((l) => l.startsWith('other'))).toBe(false);
    expect(residualTooltipLines(a, 'in')).toEqual(['Edge A · other in +10 Gbps', 'traced in 10 Gbps / out 20 Gbps']);
  });

  it('the anchor tooltip and card carry the iface, direction and delta', () => {
    const m = model('classic');
    const anchor = m.nodes.find((n) => n.kind === 'anchor');
    expect(anchor).toBeDefined();
    if (anchor === undefined) {
      return;
    }
    expect(nodeTooltipLines(anchor, m)).toEqual([
      'trace start',
      'iface xe-0/0/1',
      'in +10 Gbps',
      'note Edge A 的 access port 進來 +10 Gbps',
    ]);
    expect(cardText(anchor, m)).toEqual({ label: 'xe-0/0/1', subtitle: 'trace start', extraLines: ['in · +10 Gbps'] });
  });

  it('ribbons state the ifaces, the delta with a sign, and what kind of ribbon they are', () => {
    const m = model('classic');
    const e0 = m.edges.find((e) => !e.isAnchor);
    expect(e0).toBeDefined();
    if (e0 === undefined) {
      return;
    }
    expect(bandTooltipLines(e0, m)).toEqual(['Edge A et-0/0/48 → Core 1 et-1/0/1', '+20 Gbps']);
    expect(bandTooltipLines(m.anchorEdge ?? e0, m)[1]).toBe('trace start +10 Gbps');
    const back = model('dci-uturn').edges.find((e) => e.backward);
    expect(back).toBeDefined();
    if (back !== undefined) {
      expect(bandTooltipLines(back, model('dci-uturn'))).toContain('backflow — against the majority direction');
    }
    const client = model('client');
    const own = client.edges.find((e) => e.owns);
    expect(own).toBeDefined();
    if (own !== undefined) {
      expect(bandTooltipLines(own, client)[1]).toMatch(/ownership only/);
    }
  });

  it('a client leaf prints its clients as an aligned table and lists them all in the tooltip', () => {
    const m = model('client');
    const shared = m.nodeMap.get('sw-tor-1:xe-0/0/14');
    expect(shared).toBeDefined();
    if (shared === undefined) {
      return;
    }
    const table = clientTableLines(shared);
    expect(table[0]).toMatch(/^hostname\s+ip\s+owner$/);
    expect(table).toHaveLength(1 + (shared.clients?.length ?? 0));
    const text = cardText(shared, m);
    expect(text.label).toBe('未管理小 switch');
    expect(text.cornerLabel).toBe('port');
    expect(text.extraLines[text.extraLines.length - 1]).toMatch(/^\+/);
    const tip = nodeTooltipLines(shared, m);
    expect(tip.filter((l) => l.startsWith('client '))).toHaveLength(shared.clients?.length ?? 0);
    expect(tip[tip.length - 1]).toBe('id sw-tor-1:xe-0/0/14');
    const single = m.nodeMap.get('sw-tor-1:xe-0/0/12');
    expect(single).toBeDefined();
    if (single !== undefined) {
      expect(cardText(single, m).label).toBe('');
      expect(cardText(single, m).cornerLabel).toBe('port');
      expect(nodeTooltipLines(single, m)).toContain('client 10.42.7.31 · lab-gpu-01 · 網管部 王小明');
    }
  });

  it('owner and namespace cards say their amounts are derived; a mixed owner never prints 0', () => {
    const m = model('client');
    const owners = m.nodes.filter((n) => n.role === 'owner');
    expect(owners.length).toBeGreaterThan(0);
    for (const o of owners) {
      const text = cardText(o, m);
      expect(text.subtitle).toBe('owner');
      if (o.bps > 0) {
        expect(text.extraLines[0]).toMatch(/^\+/);
        expect(nodeTooltipLines(o, m).some((l) => l.startsWith('derived from port cards'))).toBe(true);
      } else {
        expect(text.extraLines[0]).toBe('metered at port');
        expect(nodeTooltipLines(o, m).some((l) => l.startsWith('in — (metered at the port'))).toBe(true);
      }
      expect(nodeTooltipLines(o, m).some((l) => l.startsWith('id '))).toBe(false);
    }
    const k8s = model('k8s');
    const ns = k8s.nodes.find((n) => n.role === 'ns');
    expect(ns).toBeDefined();
    if (ns !== undefined) {
      expect(nodeTooltipLines(ns, k8s)).toContain('derived from member pods');
      expect(cardText(ns, k8s).extraLines[0]).toMatch(/pods?$/);
    }
  });

  it('a wrapper folds status and counts its pods', () => {
    const N = (data: Record<string, unknown>): { data: Record<string, unknown> } => ({ data });
    const E = (data: Record<string, unknown>): { data: Record<string, unknown> } => ({ data });
    const wire = {
      elements: {
        nodes: [
          N({ id: 'sw', type: 'switch' }),
          N({ id: 'k', type: 'node', name: 'worker-1', status: 'warning' }),
          N({ id: 'p', type: 'pod', name: 'p', labels: { namespace: 'shop' } }),
        ],
        edges: [
          E({ id: 'e1', type: 'network-flow', source: 'sw', target: 'p', metrics: { delta_bps: 1e9 } }),
          E({ id: 'e2', type: 'pod-to-node', source: 'p', target: 'k' }),
        ],
      },
    };
    const m = deriveTrace(normalizeGraph(wire).elements, { direction: 'destination', layout: 'node' });
    expect(m.ok).toBe(true);
    if (!m.ok) {
      return;
    }
    const w = m.wrappers[0];
    expect(w).toBeDefined();
    if (w !== undefined) {
      expect(nodeTooltipLines(w, m)).toEqual([
        'node / worker-1',
        'in 1 Gbps',
        'out 1 Gbps', // the pod's derived edge to its namespace card
        'derived from member pods',
        '1 pod',
        'status warning (worst of node and member pods)',
        'id k',
      ]);
    }
  });

  it('clip counts CJK as two cells', () => {
    expect(clip('abcdef', 4)).toBe('abcd…');
    expect(clip('網管部 王小明', 6)).toBe('網管部…');
    expect(clip('ok', 10)).toBe('ok');
  });
});
