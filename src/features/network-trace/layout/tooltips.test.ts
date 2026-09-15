import { describe, expect, it } from 'vitest';

import { DARK_TOKENS } from '../../../shared/theme/tokens';
import { normalizeGraph } from '../../graph-data';
import { type TooltipLine } from '../../sankey-canvas';
import { deriveTrace } from '../model/deriveTrace';
import type { TraceModelOk } from '../model/types';
import { traceSample } from '../testing/samples';

import { cardText, clientTableLines, clip } from './text';
import { bandTooltipLines, clusterTooltipLines, colCaption, nodeTooltipLines, residualTooltipLines } from './tooltips';

function model(key: string, grouping: 'none' | 'cluster' = 'none'): TraceModelOk {
  const s = traceSample(key);
  const m = deriveTrace(normalizeGraph(s.wire).elements, { direction: s.direction, grouping });
  if (!m.ok) {
    throw new Error(m.errors.join(' / '));
  }
  return m;
}

const T = DARK_TOKENS;
const text = (l: TooltipLine): string => (typeof l === 'string' ? l : l.text);
const plain = (lines: readonly TooltipLine[]): string[] => lines.map(text);
const colorOf = (lines: readonly TooltipLine[], prefix: string): string | undefined => {
  const l = lines.find((x) => text(x).startsWith(prefix));
  return l === undefined || typeof l === 'string' ? undefined : l.color;
};
const nodeTip = (n: Parameters<typeof nodeTooltipLines>[0], m: TraceModelOk): string[] =>
  plain(nodeTooltipLines(n, m, T));

describe('tooltip and card text', () => {
  it('a hop splits traced from other, paints each like its mark, and names its id only when it differs', () => {
    const m = model('classic');
    const a = m.nodeMap.get('sw-edge-a');
    const core = m.nodeMap.get('sw-core-1');
    expect(a).toBeDefined();
    expect(core).toBeDefined();
    if (a === undefined || core === undefined) {
      return;
    }
    const lines = nodeTooltipLines(a, m, T);
    const words = plain(lines);
    expect(words[0]).toBe('switch / Edge A');
    expect(words).toContain('traced in 10 Gbps');
    expect(words).toContain('traced out 20 Gbps');
    expect(words).toContain('other in 10 Gbps');
    expect(words).toContain('other out 0 bps');
    expect(colorOf(lines, 'traced in')).toBe(T.sankey.traceFlow);
    expect(colorOf(lines, 'traced out')).toBe(T.sankey.traceFlow);
    expect(colorOf(lines, 'other in')).toBe(T.sankey.traceResidualIn);
    expect(colorOf(lines, 'other out')).toBe(T.sankey.traceResidualOut);
    expect(words[words.length - 1]).toBe('id sw-edge-a');
    // A balanced hop still lists both residual rows: the split is the point of the tooltip.
    expect(nodeTip(core, m).filter((l) => l.startsWith('other'))).toEqual(['other in 0 bps', 'other out 0 bps']);
    const res = residualTooltipLines(a, 'in', T);
    expect(plain(res)).toEqual(['Edge A · other in +10 Gbps', 'traced in 10 Gbps / out 20 Gbps']);
    expect(colorOf(res, 'Edge A')).toBe(T.sankey.traceResidualIn);
    expect(colorOf(res, 'traced')).toBe(T.sankey.traceFlow);
  });

  it('the anchor tooltip and card carry the iface, direction and delta', () => {
    const m = model('classic');
    const anchor = m.nodes.find((n) => n.kind === 'anchor');
    expect(anchor).toBeDefined();
    if (anchor === undefined) {
      return;
    }
    expect(nodeTip(anchor, m)).toEqual([
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
    expect(text.cornerLabel).toBe('3 clients');
    expect(text.extraLines[text.extraLines.length - 1]).toMatch(/^\+/);
    const tip = nodeTip(shared, m);
    expect(tip.filter((l) => l.startsWith('client '))).toHaveLength(shared.clients?.length ?? 0);
    expect(tip[tip.length - 1]).toBe('id sw-tor-1:xe-0/0/14');
    const single = m.nodeMap.get('sw-tor-1:xe-0/0/12');
    expect(single).toBeDefined();
    if (single !== undefined) {
      expect(cardText(single, m).label).toBe('');
      expect(cardText(single, m).cornerLabel).toBe('1 client');
      expect(nodeTip(single, m)).toContain('client 10.42.7.31 · lab-gpu-01 · 網管部 王小明');
    }
    // An end device with no clients has no corner: "0 clients" would read as missing data.
    const host = m.nodeMap.get('srv-legacy-09');
    expect(host?.clients ?? null).toBeNull();
    if (host !== undefined) {
      expect(cardText(host, m).cornerLabel).toBeUndefined();
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
        expect(nodeTip(o, m).some((l) => l.startsWith('derived from ports'))).toBe(true);
      } else {
        expect(text.extraLines[0]).toBe('metered at port');
        expect(nodeTip(o, m).some((l) => l.startsWith('in — (metered at the port'))).toBe(true);
      }
      expect(nodeTip(o, m).some((l) => l.startsWith('id '))).toBe(false);
    }
    const k8s = model('k8s');
    const ns = k8s.nodes.find((n) => n.role === 'ns');
    expect(ns).toBeDefined();
    if (ns !== undefined) {
      expect(nodeTip(ns, k8s)).toContain('derived from member pods');
      expect(cardText(ns, k8s).extraLines[0]).toMatch(/pods?$/);
    }
  });

  it('pods, clients and namespaces split traced from other; namespaces sum their member pods', () => {
    const rows = (lines: string[]): string[] => lines.filter((l) => /^(traced|other) (in|out) /.test(l));
    const k8s = model('k8s');
    const pods = k8s.nodes.filter((n) => n.kind === 'leaf' && n.role === 'pod');
    const ns = k8s.nodes.find((n) => n.role === 'ns');
    expect(pods.length).toBeGreaterThan(0);
    expect(ns).toBeDefined();
    for (const p of pods) {
      const lines = nodeTooltipLines(p, k8s, T);
      expect(rows(plain(lines))).toHaveLength(4);
      expect(plain(lines)).toContain('other in 0 bps');
      expect(colorOf(lines, 'traced in')).toBe(T.sankey.traceFlow);
      expect(colorOf(lines, 'other out')).toBe(T.sankey.traceResidualOut);
    }
    if (ns !== undefined) {
      expect(rows(nodeTip(ns, k8s))).toHaveLength(4);
      expect(nodeTip(ns, k8s).some((l) => /^in |^out /.test(l))).toBe(false);
      const direct = k8s.edges
        .filter((e) => e.toId === ns.id || e.fromId === ns.id)
        .map((e) => (e.fromId === ns.id ? e.toId : e.fromId));
      const members = direct.map((id) => k8s.nodeMap.get(id)).filter((m) => m !== undefined);
      expect(ns.tracedIn + ns.tracedOut).toBe(members.reduce((s, m) => s + m.tracedIn + m.tracedOut, 0));
      expect(ns.tracedIn + ns.tracedOut).toBeGreaterThan(0);
    }

    const client = model('client');
    const leaf = client.nodes.find((n) => n.kind === 'leaf' && n.role === 'leaf');
    expect(leaf).toBeDefined();
    if (leaf !== undefined) {
      expect(rows(nodeTip(leaf, client))).toHaveLength(4);
    }
    const owner = client.nodes.find((n) => n.role === 'owner');
    if (owner !== undefined) {
      expect(rows(nodeTip(owner, client))).toHaveLength(0);
    }
  });

  it('a trace-end pod shows the other in / out its wire node states', () => {
    const s = traceSample('k8s');
    const wire = structuredClone(s.wire) as { elements: { nodes: Array<{ data: Record<string, unknown> }> } };
    const pod = wire.elements.nodes.find((x) => x.data.type === 'pod');
    expect(pod).toBeDefined();
    if (pod === undefined) {
      return;
    }
    pod.data.other_in_bps = 3e9;
    const m = deriveTrace(normalizeGraph(wire).elements, { direction: s.direction, grouping: 'none' });
    expect(m.ok).toBe(true);
    const n = m.ok ? m.nodeMap.get(String(pod.data.id)) : undefined;
    expect(n?.kind).toBe('leaf');
    if (m.ok && n !== undefined) {
      expect(nodeTip(n, m)).toContain('other in 3 Gbps');
      expect(nodeTip(n, m)).toContain('other out 0 bps');
    }
  });

  it('a cluster frame counts its cards and folds their status', () => {
    const m = model('k8s-clusters', 'cluster');
    const [east, west] = m.clusters;
    expect(east).toBeDefined();
    expect(west).toBeDefined();
    if (east === undefined || west === undefined) {
      return;
    }
    expect(clusterTooltipLines(east)).toEqual(['cluster / east', '6 cards', 'status warning (worst of member cards)']);
    expect(clusterTooltipLines(west)).toEqual(['cluster / west', '3 cards']);
  });

  it('a column of routers is captioned as such, and a router card prints its kind', () => {
    const N = (data: Record<string, unknown>): { data: Record<string, unknown> } => ({ data });
    const E = (data: Record<string, unknown>): { data: Record<string, unknown> } => ({ data });
    const wire = {
      elements: {
        nodes: [
          N({
            id: 'sw',
            type: 'switch',
            name: 'A',
            investigation: { iface: 'xe-0/0/1', delta_bps: 1e9, direction: 'in' },
          }),
          N({ id: 'rt', type: 'router', name: 'R1' }),
          N({ id: 'srv', type: 'host' }),
        ],
        edges: [
          E({ id: 'e1', type: 'network-flow', source: 'sw', target: 'rt', metrics: { delta_bps: 1e9 } }),
          E({ id: 'e2', type: 'network-flow', source: 'rt', target: 'srv', metrics: { delta_bps: 1e9 } }),
        ],
      },
    };
    const m = deriveTrace(normalizeGraph(wire).elements, { direction: 'destination' });
    expect(m.ok).toBe(true);
    if (!m.ok) {
      return;
    }
    const rt = m.nodeMap.get('rt');
    expect(rt).toBeDefined();
    if (rt === undefined) {
      return;
    }
    expect(cardText(rt, m).subtitle).toBe('router');
    expect(nodeTip(rt, m)[0]).toBe('router / R1');
    expect(colCaption([rt], 'destination', 0)).toBe(`Hop ${String(rt.col)} · router`);
  });

  it('clip counts CJK as two cells', () => {
    expect(clip('abcdef', 4)).toBe('abcd…');
    expect(clip('網管部 王小明', 6)).toBe('網管部…');
    expect(clip('ok', 10)).toBe('ok');
    // An astral code point (emoji, CJK Extension B) is one wide cell, never a split surrogate pair.
    expect(clip('ab🙂cd', 4)).toBe('ab🙂…');
    expect(clip('ab🙂cd', 3)).toBe('ab…');
    expect(clip('𠀋𠀋x', 4)).toBe('𠀋𠀋…');
  });
});
