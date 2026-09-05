import type cytoscape from 'cytoscape';

import { applyPodParentMode } from './applyPodParentMode';

type El = cytoscape.ElementDefinition;

const node = (id: string, kind: string, parent?: string, extra?: Record<string, unknown>): El => ({
  group: 'nodes',
  data: { id, kind, ...(parent !== undefined ? { parent } : {}), ...extra },
});
const cluster = (id: string): El => ({ group: 'nodes', data: { id, isCluster: true } });
const group = (
  id: string,
  flag: 'isNamespace' | 'isApplication' | 'isController' | 'isStorageCluster',
  parent: string | undefined,
  extra?: Record<string, unknown>
): El => ({
  group: 'nodes',
  data: { id, [flag]: true, ...(parent !== undefined ? { parent } : {}), ...extra },
});
const edge = (id: string, source: string, target: string, edgeType: string): El => ({
  group: 'edges',
  data: { id, source, target, edgeType },
});

const nodeData = (els: El[], id: string): cytoscape.NodeDataDefinition | undefined =>
  els.find((e) => e.group === 'nodes' && e.data.id === id)?.data;
const edgeDatas = (els: El[]): cytoscape.EdgeDataDefinition[] =>
  els.filter((e) => e.group === 'edges').map((e) => e.data as cytoscape.EdgeDataDefinition);
const hasEdge = (els: El[], edgeType: string, source: string, target: string): boolean =>
  edgeDatas(els).some((d) => d.edgeType === edgeType && d.source === source && d.target === target);

// A representative backend D6 payload: cluster > namespace > application > controller > pod;
// node leaves under the cluster; pvc / service under the namespace; plus the separate
// physical storage chain storage-cluster > netapp-node > netapp-aggr, which belongs to no
// K8s cluster and is reached only by the pvc's storage edge.
const d6Graph = (): El[] => [
  cluster('cl'),
  group('ns', 'isNamespace', 'cl'),
  group('app', 'isApplication', 'ns'),
  group('c1', 'isController', 'app', { kind: 'statefulset' }),
  node('n1', 'node', 'cl'),
  group('scl', 'isStorageCluster', undefined),
  node('filer', 'netapp-node', 'scl'),
  node('aggr', 'netapp-aggr', 'filer'),
  node('p1', 'pod', 'c1', { labels: { node: 'n1' } }),
  node('pv1', 'pvc', 'ns'),
  node('svc', 'service', 'ns'),
  edge('e-ptn', 'p1', 'n1', 'pod-to-node'),
  edge('e-pmp', 'p1', 'pv1', 'pod-mounts-pvc'),
  edge('e-pts', 'pv1', 'aggr', 'pvc-to-netapp-aggr'),
  edge('e-ssp', 'svc', 'p1', 'service-selects-pod'),
  edge('e-pcs', 'p1', 'svc', 'pod-calls-service'),
];

describe('applyPodParentMode', () => {
  describe('controller mode (identity clone of the backend payload)', () => {
    it('keeps the backend hierarchy verbatim — pods stay under their controller, pod-to-node stays drawn', () => {
      const out = applyPodParentMode(d6Graph(), 'controller');
      expect(nodeData(out, 'p1')?.parent).toBe('c1');
      expect(nodeData(out, 'c1')?.isController).toBe(true);
      expect(hasEdge(out, 'pod-to-node', 'p1', 'n1')).toBe(true);
      // No re-parenting, no group teardown: same element count as the input.
      expect(out).toHaveLength(d6Graph().length);
    });

    it('synthesizes no edges and re-parents nothing', () => {
      const out = applyPodParentMode(d6Graph(), 'controller');
      expect(
        edgeDatas(out)
          .map((d) => d.edgeType)
          .sort()
      ).toEqual(['pod-calls-service', 'pod-mounts-pvc', 'pod-to-node', 'pvc-to-netapp-aggr', 'service-selects-pod']);
    });

    it('returns every element as a fresh object (referentially distinct from the input)', () => {
      const els = d6Graph();
      const out = applyPodParentMode(els, 'controller');
      for (const o of out) {
        const original = els.find((e) => e.data.id === o.data.id);
        expect(o).not.toBe(original);
        expect(o.data).not.toBe(original?.data);
      }
    });
  });

  describe('node mode (infra view: cluster > node > pod)', () => {
    it('re-parents pods to their K8s node and tears down the workload group tiers', () => {
      const out = applyPodParentMode(d6Graph(), 'node');
      // Workload group nodes are dropped.
      expect(nodeData(out, 'ns')).toBeUndefined();
      expect(nodeData(out, 'app')).toBeUndefined();
      expect(nodeData(out, 'c1')).toBeUndefined();
      // Pod re-parents under its labels.node.
      expect(nodeData(out, 'p1')?.parent).toBe('n1');
      // pvc / service members of the dropped namespace re-home under the cluster.
      expect(nodeData(out, 'pv1')?.parent).toBe('cl');
      expect(nodeData(out, 'svc')?.parent).toBe('cl');
      // The node leaf under the cluster keeps its parent.
      expect(nodeData(out, 'n1')?.parent).toBe('cl');
      // The whole storage chain is untouched: storage-cluster is not one of the dropped
      // workload tiers, and the two NetApp nodes are real nodes rather than groups. The
      // resulting storage edge crosses from the K8s cluster box into the ONTAP box, which
      // is correct — the storage genuinely lives outside the cluster.
      expect(nodeData(out, 'scl')).toBeDefined();
      expect(nodeData(out, 'filer')?.parent).toBe('scl');
      expect(nodeData(out, 'aggr')?.parent).toBe('filer');
    });

    it('drops every pod-to-node edge (now expressed as nesting); keeps service / storage edges', () => {
      const out = applyPodParentMode(d6Graph(), 'node');
      expect(edgeDatas(out).some((d) => d.edgeType === 'pod-to-node')).toBe(false);
      expect(hasEdge(out, 'pod-mounts-pvc', 'p1', 'pv1')).toBe(true);
      expect(hasEdge(out, 'pvc-to-netapp-aggr', 'pv1', 'aggr')).toBe(true);
      expect(hasEdge(out, 'service-selects-pod', 'svc', 'p1')).toBe(true);
      expect(hasEdge(out, 'pod-calls-service', 'p1', 'svc')).toBe(true);
    });

    it('leaves a pod under its cluster when labels.node is missing', () => {
      const els: El[] = [
        cluster('cl'),
        group('c1', 'isController', 'cl'),
        node('p1', 'pod', 'c1'), // no labels.node
      ];
      const out = applyPodParentMode(els, 'node');
      expect(nodeData(out, 'p1')?.parent).toBe('cl');
    });

    it('leaves a pod under its cluster when labels.node points at a non-existent node', () => {
      const els: El[] = [
        cluster('cl'),
        group('c1', 'isController', 'cl'),
        node('p1', 'pod', 'c1', { labels: { node: 'ghost' } }),
      ];
      const out = applyPodParentMode(els, 'node');
      expect(nodeData(out, 'p1')?.parent).toBe('cl');
    });

    it('does not invent a parent when the pod has no cluster ancestor (top-level)', () => {
      const els: El[] = [group('c1', 'isController', 'orphan'), node('p1', 'pod', 'c1')];
      const out = applyPodParentMode(els, 'node');
      expect(nodeData(out, 'p1')?.parent).toBeUndefined();
    });
  });

  it('leaves a cross-cluster pod-calls-pod edge untouched in both modes', () => {
    const els: El[] = [
      cluster('prod'),
      cluster('dr'),
      node('gw', 'pod', 'prod'),
      node('cons', 'pod', 'dr'),
      edge('x', 'gw', 'cons', 'pod-calls-pod'),
    ];
    for (const mode of ['controller', 'node'] as const) {
      expect(hasEdge(applyPodParentMode(els, mode), 'pod-calls-pod', 'gw', 'cons')).toBe(true);
    }
  });

  it('does not mutate the input elements in either mode (fresh objects)', () => {
    for (const mode of ['controller', 'node'] as const) {
      const els = d6Graph();
      const snapshot = JSON.stringify(els);
      const out = applyPodParentMode(els, mode);
      expect(out).not.toBe(els);
      expect(JSON.stringify(els)).toBe(snapshot);
    }
  });

  it('returns pass-through edges as fresh data so downstream mutation cannot corrupt the input', () => {
    const els = d6Graph();
    const pvcEdgeInput = els.find((e) => e.data.id === 'e-pmp');
    for (const mode of ['controller', 'node'] as const) {
      const out = applyPodParentMode(els, mode);
      const outPvc = out.find((e) => e.data.id === 'e-pmp');
      expect(outPvc?.data).not.toBe(pvcEdgeInput?.data);
      // Simulate cytoscape / expand-collapse re-routing the edge in place.
      (outPvc?.data as cytoscape.EdgeDataDefinition).source = 'mutated';
      expect((pvcEdgeInput?.data as cytoscape.EdgeDataDefinition).source).toBe('p1');
    }
  });
});
