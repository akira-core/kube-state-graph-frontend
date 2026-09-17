import { describe, expect, it } from 'vitest';

import { SHOWCASE_STORAGE_GRAPH } from '../../shared/fixtures/showcaseStorageGraph';
import { EMPTY_STORAGE_GRAPH_ROOTS, normalizeGraph } from '../graph-data';
import {
  CARD_LINE_H,
  CARD_W,
  endChevronPath,
  LEAF_W,
  MIN_THICKNESS,
  ROW_MIN_H,
  WRAPPER_HEADER_H,
} from '../sankey-canvas';

import { deriveSankey, formatBytesPerSec } from './deriveSankey';
import { cardText, layoutSankey } from './layoutSankey';

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
    const order = ['netapp-node', 'netapp-aggr', 'netapp-svm', 'pvc', 'pod', 'application', 'namespace'];
    for (let i = 1; i < order.length; i += 1) {
      expect(xByKind.get(order[i - 1] as string)).toBeLessThan(xByKind.get(order[i] as string) as number);
    }
  });

  it('gives every node in a tier the same width, and the leaf tier a smaller width', () => {
    const graph = deriveSankey(elements, 'both');
    const layout = layoutSankey(graph, PALETTE);
    for (const n of layout.nodes) {
      expect(n.width).toBe(n.kind === 'namespace' ? LEAF_W : CARD_W);
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
    expect(drawn.columns.map((c) => c.label)).toEqual([
      'NetApp node',
      'NetApp aggregate',
      'SVM',
      'PVC',
      'Pod',
      'Application',
      'Namespace',
    ]);
    expect(layoutSankey(deriveSankey(elements, 'both'), PALETTE, 'node').columns.map((c) => c.label)).toContain(
      'Node / Pod'
    );
  });

  it('gives netapp-node only right-edge slots and namespace only left-edge slots', () => {
    const layout = layoutSankey(deriveSankey(elements, 'both'), PALETTE);
    const controller = layout.nodes.find((n) => n.kind === 'netapp-node');
    const ns = layout.nodes.find((n) => n.kind === 'namespace');
    expect(controller?.leftSlots).toEqual([]);
    expect((controller?.rightSlots.length ?? 0) > 0).toBe(true);
    expect(ns?.rightSlots).toEqual([]);
    expect((ns?.leftSlots.length ?? 0) > 0).toBe(true);
    expect(ns?.width).toBe(LEAF_W);
  });

  it('orders Node-layout wrappers by name, not by flow, and parks unscheduled pods below them', () => {
    const body = [
      node('n-b', 'node', { label: 'worker-b' }),
      node('n-a', 'node', { label: 'worker-a' }),
      node('pvc-hi', 'pvc'),
      node('pod-hi', 'pod', { namespace: 'prod' }),
      node('pvc-lo', 'pvc'),
      node('pod-lo', 'pod', { namespace: 'prod' }),
      node('pvc-u', 'pvc'),
      node('pod-u', 'pod', { namespace: 'prod' }),
      flow('pvc-hi', 'pod-hi', 'pvc-pod', 9_000_000, 0),
      flow('pvc-lo', 'pod-lo', 'pvc-pod', 1_000, 0),
      flow('pvc-u', 'pod-u', 'pvc-pod', 500_000, 0),
      k8sEdge('pod-hi', 'n-b'),
      k8sEdge('pod-lo', 'n-a'),
    ];
    // Helper nodes above don't carry k8sNodeId — deriveSankey records it from the edge.
    const graph = deriveSankey(body, 'read');
    const layout = layoutSankey(graph, PALETTE, 'node');
    expect(layout.wrappers.map((w) => w.label)).toEqual(['worker-a', 'worker-b']);
    const unscheduled = layout.nodes.find((n) => n.label === 'pod-u');
    const lastWrapper = layout.wrappers[layout.wrappers.length - 1];
    expect(unscheduled).toBeDefined();
    expect(lastWrapper).toBeDefined();
    expect(unscheduled!.y).toBeGreaterThan(lastWrapper!.y + lastWrapper!.height);
    expect(layout.columns.some((c) => c.label === 'Node / Pod')).toBe(true);
    for (const w of layout.wrappers) {
      expect(w.y + w.height).toBeLessThanOrEqual(layout.height);
    }
  });

  it('closes up an empty column instead of reserving its width', () => {
    const layout = layoutSankey(deriveSankey(podsUnderNamespaceOnly(), 'both'), PALETTE);
    const x = (kind: string): number => layout.nodes.find((n) => n.kind === kind)?.x as number;
    expect(layout.nodes.some((n) => n.kind === 'application')).toBe(false);

    // The step between two adjacent OCCUPIED columns. Reserving the empty application
    // column would make the pod -> namespace step twice this.
    const step = x('pvc') - x('netapp-svm');
    expect(x('namespace') - x('pod')).toBe(step);
    expect(layout.columns.map((c) => c.label)).not.toContain('Application');
    // The intrinsic width ends one padding past the last occupied column, so "fit to
    // window" scales to the content rather than to a reserved gap. The left padding is
    // the first occupied column's own x.
    expect(layout.width - (x('namespace') + LEAF_W)).toBe(x('netapp-svm'));
  });

  it('keeps non-pod-column coordinates identical under Flat and Node layouts', () => {
    const graph = deriveSankey(elements, 'both');
    const flat = layoutSankey(graph, PALETTE, 'flat');
    const grouped = layoutSankey(graph, PALETTE, 'node');
    const coord = (layout: typeof flat, kind: string): Array<[string, number, number]> =>
      layout.nodes
        .filter((n) => n.kind === kind)
        .map((n) => [n.id, n.x, n.y] as [string, number, number])
        .sort((a, b) => a[0].localeCompare(b[0]));
    for (const kind of ['netapp-node', 'netapp-aggr', 'netapp-svm', 'pvc', 'application', 'namespace']) {
      expect(coord(grouped, kind), kind).toEqual(coord(flat, kind));
    }
    expect(flat.wrappers).toEqual([]);
    expect(grouped.wrappers.length).toBeGreaterThan(0);
  });

  describe('SVM display: group', () => {
    it('reads SVM / PVC as the pvc column header, with no SVM column', () => {
      const graph = deriveSankey(elements, 'both', undefined, 'group');
      const layout = layoutSankey(graph, PALETTE, 'flat', 'group');
      expect(layout.columns.map((c) => c.label)).toEqual([
        'NetApp node',
        'NetApp aggregate',
        'SVM / PVC',
        'Pod',
        'Application',
        'Namespace',
      ]);
      const withNodeLayout = layoutSankey(graph, PALETTE, 'node', 'group');
      expect(withNodeLayout.columns.map((c) => c.label)).toEqual([
        'NetApp node',
        'NetApp aggregate',
        'SVM / PVC',
        'Node / Pod',
        'Application',
        'Namespace',
      ]);
    });

    it('orders frames by name, not by flow', () => {
      const body = [
        node('aggr1', 'netapp-aggr'),
        node('svm_b', 'netapp-svm'),
        node('svm_a', 'netapp-svm'),
        node('pvc-b', 'pvc', { labels: { aggr: 'aggr1' } }),
        node('pvc-a', 'pvc', { labels: { aggr: 'aggr1' } }),
        flow('aggr1', 'svm_b', 'aggr-svm', 9_000_000, 0),
        flow('aggr1', 'svm_a', 'aggr-svm', 1_000_000, 0),
        flow('svm_b', 'pvc-b', 'svm-pvc', 9_000_000, 0),
        flow('svm_a', 'pvc-a', 'svm-pvc', 1_000_000, 0),
      ];
      const graph = deriveSankey(body, 'read', undefined, 'group');
      const layout = layoutSankey(graph, PALETTE, 'flat', 'group');
      expect(layout.wrappers.map((w) => w.label)).toEqual(['svm_a', 'svm_b']);
      const svmA = layout.wrappers.find((w) => w.label === 'svm_a');
      const svmB = layout.wrappers.find((w) => w.label === 'svm_b');
      expect(svmA!.y).toBeLessThan(svmB!.y);
    });

    it('members sit inside a frame in the PVC column’s own order', () => {
      const graph = deriveSankey(elements, 'read', undefined, 'group');
      const layout = layoutSankey(graph, PALETTE, 'flat', 'group');
      const frame = layout.wrappers.find((w) => w.label === 'svm_shop');
      expect(frame).toBeDefined();
      const members = layout.nodes.filter((n) => frame!.memberIds.includes(n.id)).sort((a, b) => a.y - b.y);
      // data-mongo-0 carries the largest single flow of the three, so it sorts first —
      // the same rule the ungrouped PVC column uses.
      expect(members[0]?.label).toBe('data-mongo-0');
    });

    it('draws an empty no-flow frame for an SVM selected as a root with no drawn PVCs', () => {
      const body = [node('svm-empty', 'netapp-svm')];
      const graph = deriveSankey(body, 'read', { ...EMPTY_STORAGE_GRAPH_ROOTS, svm: ['svm-empty'] }, 'group');
      expect(graph.svmFrames).toEqual([{ id: 'svm-empty', label: 'svm-empty', pvcIds: [], noFlow: true }]);
      const layout = layoutSankey(graph, PALETTE, 'flat', 'group');
      const frame = layout.wrappers.find((w) => w.kind === 'netapp-svm');
      expect(frame?.noFlow).toBe(true);
      expect(frame?.status).toBeUndefined();
      expect(frame?.locatable).toBe(false);
    });

    it('draws both wrapper kinds at once — SVM frames and Kubernetes-node wrappers', () => {
      const graph = deriveSankey(elements, 'both', undefined, 'group');
      const layout = layoutSankey(graph, PALETTE, 'node', 'group');
      const svmFrame = layout.wrappers.find((w) => w.kind === 'netapp-svm');
      const nodeWrapper = layout.wrappers.find((w) => w.kind === 'node');
      expect(svmFrame).toBeDefined();
      expect(nodeWrapper).toBeDefined();
      expect(svmFrame!.locatable).toBe(false);
      expect(nodeWrapper!.locatable).toBe(true);
    });
  });
});

describe('layoutSankey card text', () => {
  /** Two claims with identical slots, one carrying usage and one not. */
  function claimsWithAndWithoutUsage() {
    return [
      node('svm-u', 'netapp-svm'),
      node('data-mongo-0', 'pvc', {
        namespace: 'prod',
        usage: { usedBytes: 700_000_000_000, capacityBytes: 1_000_000_000_000 },
      }),
      node('pvc-half', 'pvc', { namespace: 'prod', usage: { usedBytes: 500_000_000 } }),
      node('pvc-none', 'pvc', { namespace: 'prod' }),
      node('pod-full', 'pod', { namespace: 'prod' }),
      node('pod-half', 'pod', { namespace: 'prod' }),
      node('pod-none', 'pod', { namespace: 'prod' }),
      flow('svm-u', 'data-mongo-0', 'svm-pvc', 100, 0),
      flow('svm-u', 'pvc-half', 'svm-pvc', 100, 0),
      flow('svm-u', 'pvc-none', 'svm-pvc', 100, 0),
      flow('data-mongo-0', 'pod-full', 'pvc-pod', 100, 0),
      flow('pvc-half', 'pod-half', 'pvc-pod', 100, 0),
      flow('pvc-none', 'pod-none', 'pvc-pod', 100, 0),
    ];
  }

  it('The three rows of a pvc box card', () => {
    const layout = layoutSankey(deriveSankey(claimsWithAndWithoutUsage(), 'read'), PALETTE);
    const card = layout.nodes.find((n) => n.label === 'data-mongo-0');
    expect(card?.subtitle).toBe('pvc');
    expect(card?.extraLines).toEqual(['ns/prod', 'usage 700 GB / 1 TB (70%)']);
    // Both slot stacks start below the attribute lines.
    for (const slot of [...(card?.leftSlots ?? []), ...(card?.rightSlots ?? [])]) {
      expect(slot.cy - ROW_MIN_H / 2).toBeGreaterThanOrEqual((card?.y ?? 0) + 40 + 2 * CARD_LINE_H);
    }
  });

  it('A card missing usage does not fill in zero', () => {
    const layout = layoutSankey(deriveSankey(claimsWithAndWithoutUsage(), 'read'), PALETTE);
    const full = layout.nodes.find((n) => n.label === 'data-mongo-0');
    for (const label of ['pvc-half', 'pvc-none']) {
      const card = layout.nodes.find((n) => n.label === label);
      expect(card?.extraLines).toEqual(['ns/prod']);
      expect(card?.extraLines.join(' ')).not.toMatch(/\b0 B\b/);
      expect((full?.height ?? 0) - (card?.height ?? 0)).toBe(CARD_LINE_H);
    }
  });

  it('namespace is a leaf card', () => {
    const graph = deriveSankey(elements, 'both');
    const layout = layoutSankey(graph, PALETTE);
    const prod = layout.nodes.find((n) => n.kind === 'namespace' && n.label === 'prod');
    const inflow = graph.links.filter((l) => l.target === prod?.id).reduce((sum, l) => sum + l.value, 0);
    expect(prod?.subtitle).toBe('namespace');
    expect(prod?.extraLines[0]).toMatch(/^\d+ pods?$/);
    expect(prod?.extraLines[1]).toBe(`total ${formatBytesPerSec(inflow)}`);
    expect(prod?.width).toBe(LEAF_W);
    expect(prod?.rightSlots).toEqual([]);
  });

  it('names the ONTAP cluster on a NetApp subtitle and nothing else there', () => {
    const layout = layoutSankey(deriveSankey(elements, 'both'), PALETTE);
    const controller = layout.nodes.find((n) => n.label === 'ontap-prod-01');
    expect(controller?.subtitle).toBe('netapp-node · ontap-prod');
    expect(controller?.extraLines).toEqual([]);
    const aggr1 = layout.nodes.find((n) => n.label === 'aggr1');
    expect(aggr1?.subtitle).toBe('netapp-aggr · ontap-prod');
    expect(aggr1?.extraLines).toEqual(['usage 700 GB / 1 TB (70%)']);
    const pod = layout.nodes.find((n) => n.label === 'mongo-0');
    expect(pod?.subtitle).toBe('pod');
    expect(pod?.extraLines).toEqual(['ns/prod']);
    const app = layout.nodes.find((n) => n.kind === 'application');
    expect(app?.subtitle).toBe('application');
    expect(app?.extraLines).toEqual(['ns/prod', '2 pods']);
  });

  it('ends a no-flow root subtitle in no flow', () => {
    const body = [node('aggr9', 'netapp-aggr')];
    const graph = deriveSankey(body, 'read', { ...EMPTY_STORAGE_GRAPH_ROOTS, aggr: ['aggr9'] });
    const card = layoutSankey(graph, PALETTE).nodes.find((n) => n.label === 'aggr9');
    expect(card?.subtitle).toBe('netapp-aggr · no flow');
    // The cluster, when the node names one, sits between the kind and the no-flow mark.
    expect(cardText({ ...graph.nodes[0]!, ontapCluster: 'ontap-lab' }, new Map()).subtitle).toBe(
      'netapp-aggr · ontap-lab · no flow'
    );
  });
});

describe('layoutSankey wrappers and scale', () => {
  it('A wrapper holds its pod cards', () => {
    const layout = layoutSankey(deriveSankey(elements, 'both'), PALETTE, 'node');
    const wrapper = layout.wrappers.find((w) => w.label === 'worker-0');
    expect(wrapper?.subtitle).toBe('node · 2 pods');
    const members = layout.nodes.filter((n) => wrapper!.memberIds.includes(n.id));
    expect(members.map((n) => n.label).sort()).toEqual(['mongo-0', 'orphan-0']);
    for (const card of members) {
      expect(card.x).toBeGreaterThan(wrapper!.x);
      expect(card.x + card.width).toBeLessThan(wrapper!.x + wrapper!.width);
      expect(card.y).toBeGreaterThanOrEqual(wrapper!.y + WRAPPER_HEADER_H);
      expect(card.y + card.height).toBeLessThanOrEqual(wrapper!.y + wrapper!.height);
    }
    // Ribbons end on the pod card inside the frame, never on the wrapper.
    const mongo0 = members.find((n) => n.label === 'mongo-0')!;
    const inbound = layout.links.filter((l) => l.target === mongo0.id);
    expect(inbound.length).toBeGreaterThan(0);
    expect(inbound.every((l) => mongo0.leftSlots.some((s) => s.linkKey === l.key))).toBe(true);
    expect(layout.links.some((l) => l.source === wrapper!.id || l.target === wrapper!.id)).toBe(false);
  });

  it('Switching mode recomputes the scale', () => {
    const both = layoutSankey(deriveSankey(elements, 'both'), PALETTE);
    const write = layoutSankey(deriveSankey(elements, 'write'), PALETTE);
    const bothMax = Math.max(...both.links.map((l) => l.value));
    const writeMax = Math.max(...write.links.map((l) => l.value));
    expect(writeMax).toBeLessThan(bothMax);
    const heaviestWrite = write.links.find((l) => l.value === writeMax)!;
    expect(heaviestWrite.thickness).toBeCloseTo(72, 5);
    // The same write ribbon was thinner on the Both scale.
    expect(both.links.find((l) => l.key === heaviestWrite.key)!.thickness).toBeLessThan(heaviestWrite.thickness);
    expect(write.links.every((l) => l.direction === 'write')).toBe(true);
  });
});

describe('layoutSankey chevrons', () => {
  it('ends every ribbon, zero-weight ones included, in a rightward chevron at its target slot', () => {
    for (const body of [elements, withZeroValueLink()]) {
      const layout = layoutSankey(deriveSankey(body, 'both'), PALETTE);
      expect(layout.links.length).toBeGreaterThan(0);
      for (const link of layout.links) {
        const target = layout.nodes.find((n) => n.id === link.target);
        const slot = target?.leftSlots.find((s) => s.linkKey === link.key);
        expect(slot).toBeDefined();
        expect(link.chevron).toBe(endChevronPath(target!.x, slot!.cy, link.thickness, 1));
      }
    }
  });
});

const k8sEdge = (pod: string, nodeId: string) => ({
  group: 'edges' as const,
  data: {
    id: `${pod}->${nodeId}`,
    source: pod,
    target: nodeId,
    edgeType: 'storage-flow',
    labels: { tier: 'pod-node' },
    metrics: { readBytesPerSec: 1, writeBytesPerSec: 0 },
  },
});

const node = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({
  group: 'nodes' as const,
  data: { id, label: typeof extra.label === 'string' ? extra.label : id, kind, ...extra },
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

/**
 * A pod under a `namespace` compound but no `application` one — the shape that leaves
 * exactly one INTERIOR column empty, which is the only case where a reserved column
 * would put a gutter through the middle of the diagram.
 */
function podsUnderNamespaceOnly() {
  return [
    node('ns-only', 'namespace'),
    node('svm-n', 'netapp-svm'),
    node('pvc-n', 'pvc'),
    node('pod-n', 'pod', { namespace: 'ns-only', parent: 'ns-only' }),
    flow('svm-n', 'pvc-n', 'svm-pvc', 100, 0),
    flow('pvc-n', 'pod-n', 'pvc-pod', 100, 0),
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
