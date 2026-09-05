import { describe, expect, it } from 'vitest';

import { SHOWCASE_STORAGE_GRAPH } from '../../shared/fixtures/showcaseStorageGraph';
import { normalizeGraph } from '../graph-data';

import { deriveSankey } from './deriveSankey';
import { layoutSankey, LEAF_W, CARD_W, MIN_THICKNESS, ROW_MIN_H } from './layoutSankey';

const { elements } = normalizeGraph(SHOWCASE_STORAGE_GRAPH);
const PALETTE = ['#111111', '#222222', '#333333'];

describe('layoutSankey', () => {
  it('assigns each tier a fixed column x, running storage to workload', () => {
    const graph = deriveSankey(elements, 'both');
    const layout = layoutSankey(graph, PALETTE);
    const xByKind = new Map<string, number>();
    for (const n of layout.nodes) {
      xByKind.set(n.kind, n.x);
    }
    // Columns run in the flow's own direction — the picture answers "where does this
    // aggregate's traffic end up", so the storage side is where the eye starts.
    const order = ['netapp-node', 'netapp-aggr', 'netapp-svm', 'pvc', 'pod', 'node'];
    for (let i = 1; i < order.length; i += 1) {
      expect(xByKind.get(order[i - 1] as string)).toBeLessThan(xByKind.get(order[i] as string) as number);
    }
  });

  it('gives every node in a tier the same width, and the leaf tier a smaller width', () => {
    const graph = deriveSankey(elements, 'both');
    const layout = layoutSankey(graph, PALETTE);
    for (const n of layout.nodes) {
      expect(n.width).toBe(n.kind === 'node' ? LEAF_W : CARD_W);
    }
  });

  it('is a pure function: identical input produces an identical layout', () => {
    const graph = deriveSankey(elements, 'both');
    const a = layoutSankey(graph, PALETTE);
    const b = layoutSankey(graph, PALETTE);
    expect(a).toEqual(b);
  });

  it('shares one thickness scale across read and write links', () => {
    const graph = deriveSankey(elements, 'both');
    const layout = layoutSankey(graph, PALETTE);
    const maxWeight = Math.max(...graph.links.map((l) => l.value));
    const biggest = layout.links.find((l) => l.value === maxWeight);
    expect(biggest?.thickness).toBeCloseTo(72, 5);
    // A link at roughly a fifth of the max weight should land at roughly a fifth of the
    // max thickness — same scale, not a per-direction one.
    const linkAt = (frac: number): number | undefined =>
      graph.links.find((l) => Math.abs(l.value - maxWeight * frac) < maxWeight * 0.02)?.value;
    const oneFifth = linkAt(0.2);
    if (oneFifth !== undefined) {
      const t = layout.links.find((l) => l.value === oneFifth)?.thickness ?? 0;
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan((biggest?.thickness ?? 0) * 0.5);
    }
  });

  it('gives a zero-weight link the minimum thickness, never zero', () => {
    const graph = deriveSankey(withZeroValueLink(), 'read');
    const layout = layoutSankey(graph, PALETTE);
    const zero = layout.links.find((l) => l.value === 0);
    expect(zero).toBeDefined();
    expect(zero?.thickness).toBe(MIN_THICKNESS);
  });

  it('never lets adjacent slots in the same stack overlap, even with a minimum-row zero-weight link among larger ones', () => {
    const graph = deriveSankey(elements, 'both');
    const layout = layoutSankey(graph, PALETTE);
    for (const node of layout.nodes) {
      for (const slots of [node.leftSlots, node.rightSlots]) {
        const sorted = [...slots].sort((a, b) => a.cy - b.cy);
        for (let i = 1; i < sorted.length; i += 1) {
          const prev = sorted[i - 1];
          const cur = sorted[i];
          if (prev === undefined || cur === undefined) {
            continue;
          }
          const minGap = Math.max(prev.thickness, ROW_MIN_H) / 2 + Math.max(cur.thickness, ROW_MIN_H) / 2;
          expect(cur.cy - prev.cy).toBeGreaterThanOrEqual(minGap - 0.001);
        }
      }
    }
  });

  it('sorts left slots by weight descending, then by the opposite node label', () => {
    const graph = deriveSankey(elements, 'both');
    const layout = layoutSankey(graph, PALETTE);
    const aggr1 = layout.nodes.find((n) => n.label === 'aggr1');
    expect(aggr1).toBeDefined();
    const weights = aggr1?.leftSlots.map((s) => s.thickness) ?? [];
    for (let i = 1; i < weights.length; i += 1) {
      expect(weights[i - 1]).toBeGreaterThanOrEqual((weights[i] ?? 0) - 0.001);
    }
  });

  it('groups same-namespace pods adjacently and assigns them the same stripe color', () => {
    const two = twoNamespacePods();
    const layout = layoutSankey(deriveSankey(two, 'both'), PALETTE);
    const pods = layout.nodes.filter((n) => n.kind === 'pod').sort((a, b) => a.y - b.y);
    const labels = pods.map((p) => p.label);
    const iA = labels.indexOf('pod-prod-a');
    const iB = labels.indexOf('pod-prod-b');
    expect(Math.abs(iA - iB)).toBe(1);
    expect(pods[iA]?.namespaceColor).toBe(pods[iB]?.namespaceColor);
    const other = pods.find((p) => p.namespace === 'staging');
    expect(other?.namespaceColor).not.toBe(pods[iA]?.namespaceColor);
  });

  it('sorts a node without namespace after every namespaced pod in the tier', () => {
    const withStray = twoNamespacePodsAndOneWithout();
    const layout = layoutSankey(deriveSankey(withStray, 'both'), PALETTE);
    const pods = layout.nodes.filter((n) => n.kind === 'pod').sort((a, b) => a.y - b.y);
    const withoutNs = pods.findIndex((p) => p.namespace === undefined);
    expect(withoutNs).toBe(pods.length - 1);
  });

  it('anchors a ribbon at its source right-slot center and target left-slot center', () => {
    const graph = deriveSankey(elements, 'read');
    const layout = layoutSankey(graph, PALETTE);
    const link = layout.links[0];
    expect(link).toBeDefined();
    if (link === undefined) {
      return;
    }
    const source = layout.nodes.find((n) => n.id === link.source);
    const target = layout.nodes.find((n) => n.id === link.target);
    const sourceSlot = source?.rightSlots.find((s) => s.linkKey === link.key);
    const targetSlot = target?.leftSlots.find((s) => s.linkKey === link.key);
    expect(sourceSlot).toBeDefined();
    expect(targetSlot).toBeDefined();
    expect(link.labelY).toBeCloseTo(((sourceSlot?.cy ?? 0) + (targetSlot?.cy ?? 0)) / 2, 5);
    expect(link.path.startsWith(`M${(source?.x ?? 0) + (source?.width ?? 0)},`)).toBe(true);
  });

  it('omits the value label once the ribbon is thinner than label text', () => {
    const graph = deriveSankey(withZeroValueLink(), 'read');
    const layout = layoutSankey(graph, PALETTE);
    const zero = layout.links.find((l) => l.value === 0);
    expect(zero?.showLabel).toBe(false);
  });

  it('grows the content box to hold a tall stack of no-flow roots, and sorts them last', () => {
    // No-flow roots stack under whatever the flow graph laid out in the same column. The
    // content box is what the viewport fits to, so a node past its bottom edge is a node
    // nobody can reach by any amount of panning.
    const many = [
      ...withZeroValueLink(),
      ...Array.from({ length: 20 }, (_, i) => node(`aggr-idle-${i}`, 'netapp-aggr')),
    ];
    const layout = layoutSankey(deriveSankey(many, 'read'), PALETTE);
    for (const n of layout.nodes) {
      expect(n.y + n.height).toBeLessThanOrEqual(layout.height);
    }
    const idle = layout.nodes.filter((n) => n.label.startsWith('aggr-idle-'));
    expect(idle).toHaveLength(20);
    for (const n of idle) {
      expect(n.subtitle).toContain('no flow');
    }
  });

  it('only lists a column header for a tier that has at least one drawn node', () => {
    const empty = layoutSankey(deriveSankey([], 'both'), PALETTE);
    expect(empty.columns).toEqual([]);
    const drawn = layoutSankey(deriveSankey(elements, 'both'), PALETTE);
    expect(drawn.columns.map((c) => c.label)).toEqual(['NetApp node', 'NetApp aggregate', 'SVM', 'PVC', 'Pod', 'Node']);
  });
});

const node = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({
  group: 'nodes' as const,
  data: { id, label: id, kind, ...extra },
});

/** One `storage-flow` edge. Direction is storage -> workload, matching the wire. */
const flow = (source: string, target: string, tier: string, read: number, write: number) => ({
  group: 'edges' as const,
  data: {
    id: `${source}->${target}`,
    source,
    target,
    edgeType: 'storage-flow',
    labels: { tier },
    metrics: { readBytesPerSec: read, writeBytesPerSec: write },
  },
});

function twoNamespacePods() {
  return [
    node('svm-x', 'netapp-svm'),
    node('pvc-prod-a', 'pvc'),
    node('pod-prod-a', 'pod', { namespace: 'prod' }),
    node('pvc-prod-b', 'pvc'),
    node('pod-prod-b', 'pod', { namespace: 'prod' }),
    node('pvc-staging', 'pvc'),
    node('pod-staging', 'pod', { namespace: 'staging' }),
    flow('svm-x', 'pvc-prod-a', 'svm-pvc', 100, 0),
    flow('svm-x', 'pvc-prod-b', 'svm-pvc', 100, 0),
    // staging has the biggest single flow, so its group sorts first — the fixture
    // exercises "group order by peak flow", not just "namespace order".
    flow('svm-x', 'pvc-staging', 'svm-pvc', 900, 0),
    flow('pvc-prod-a', 'pod-prod-a', 'pvc-pod', 100, 0),
    flow('pvc-prod-b', 'pod-prod-b', 'pvc-pod', 100, 0),
    flow('pvc-staging', 'pod-staging', 'pvc-pod', 900, 0),
  ];
}

function twoNamespacePodsAndOneWithout() {
  return [
    node('svm-y', 'netapp-svm'),
    node('pvc-ns-a', 'pvc'),
    node('pod-ns-a', 'pod', { namespace: 'a' }),
    node('pvc-no-ns', 'pvc'),
    node('pod-no-ns', 'pod'),
    flow('svm-y', 'pvc-ns-a', 'svm-pvc', 100, 0),
    flow('svm-y', 'pvc-no-ns', 'svm-pvc', 500, 0),
    flow('pvc-ns-a', 'pod-ns-a', 'pvc-pod', 100, 0),
    flow('pvc-no-ns', 'pod-no-ns', 'pvc-pod', 500, 0),
  ];
}

/** One `storage-flow` edge whose `read_bytes_per_sec` is a real, present zero. */
function withZeroValueLink() {
  return [
    node('svm-z', 'netapp-svm'),
    node('pvc-z', 'pvc'),
    node('pod-z', 'pod'),
    flow('svm-z', 'pvc-z', 'svm-pvc', 0, 1048576),
    flow('pvc-z', 'pod-z', 'pvc-pod', 0, 1048576),
  ];
}
