import { clonePlain } from '../../shared/clone/clonePlain';
import { SHOWCASE_STORAGE_GRAPH } from '../../shared/fixtures/showcaseStorageGraph';
import { EMPTY_STORAGE_GRAPH_ROOTS, normalizeGraph, type StorageGraphRoots } from '../graph-data';

import { deriveSankey, formatBytesPerSec, hoverPathLinks, SANKEY_KIND_ORDER } from './deriveSankey';

function wire(nodes: unknown[], edges: unknown[]): unknown {
  return { elements: { nodes: nodes.map((data) => ({ data })), edges: edges.map((data) => ({ data })) } };
}

// Two Kubernetes clusters writing to ONE NetApp node: `aggr-shared` takes traffic from
// both, `aggr-b-only` from cluster b alone. The fixture cannot express this — only its
// `prod` cluster has storage flow at all — and it is exactly the shape a cluster filter
// has to get right.

describe('deriveSankey', () => {
  const { elements } = normalizeGraph(SHOWCASE_STORAGE_GRAPH);

  it('does not mutate the shared graph', () => {
    const before = clonePlain(elements);
    deriveSankey(elements, 'both');
    deriveSankey(elements, 'read');
    deriveSankey(elements, 'write');
    expect(elements).toEqual(before);
  });

  it('derives six tiers from the storage fixture in Both mode', () => {
    const graph = deriveSankey(elements, 'both');
    const byKind = Object.fromEntries(
      SANKEY_KIND_ORDER.map((kind) => [kind, graph.nodes.filter((n) => n.kind === kind).map((n) => n.label)])
    );
    expect(byKind['netapp-node']).toEqual(['ontap-prod-01', 'ontap-prod-02']);
    expect(byKind['netapp-aggr']).toEqual(['aggr1', 'aggr2']);
    expect(byKind['netapp-svm']).toEqual(['svm_shop', 'svm_dr']);
    expect(byKind.pvc).toEqual(expect.arrayContaining(['data-mongo-0', 'data-mongo-1', 'data-scratch']));
    expect(byKind.pod).toEqual(expect.arrayContaining(['mongo-0', 'mongo-1']));
    expect(byKind.node).toEqual(['worker-0', 'worker-1']);
    expect(graph.nodes.some((n) => n.id === 'storage-cluster/ontap-prod')).toBe(false);
    expect(graph.nodes.some((n) => n.id === 'prod/app/mongodb')).toBe(false);
    expect(graph.nodes.some((n) => n.id === 'prod/ctrl/StatefulSet/mongodb')).toBe(false);
    const tiers = new Set(graph.links.map((l) => l.tier));
    expect(tiers).toEqual(new Set(['node-aggr', 'aggr-svm', 'svm-pvc', 'pvc-pod', 'pod-node']));
  });

  it('takes link weights from the edge metrics, not from downstream sums', () => {
    const { elements: rounded } = normalizeGraph(
      wire(
        [
          { id: 'n', name: 'n', type: 'netapp-node' },
          { id: 'a', name: 'a', type: 'netapp-aggr' },
          { id: 's', name: 's', type: 'netapp-svm' },
          { id: 's2', name: 's2', type: 'netapp-svm' },
        ],
        [
          {
            id: 'up',
            type: 'storage-flow',
            source: 'n',
            target: 'a',
            labels: { tier: 'node-aggr' },
            metrics: { read_bytes_per_sec: 6000000 },
          },
          {
            id: 'd1',
            type: 'storage-flow',
            source: 'a',
            target: 's',
            labels: { tier: 'aggr-svm' },
            metrics: { read_bytes_per_sec: 3000000 },
          },
          {
            id: 'd2',
            type: 'storage-flow',
            source: 'a',
            target: 's2',
            labels: { tier: 'aggr-svm' },
            metrics: { read_bytes_per_sec: 2999999 },
          },
        ]
      )
    );
    const graph = deriveSankey(rounded, 'read');
    expect(graph.links.find((l) => l.source === 'n' && l.target === 'a')?.value).toBe(6000000);
  });

  it('keeps split attribution on the pvc-pod hop and not on svm-pvc', () => {
    const graph = deriveSankey(elements, 'read');
    const split = graph.links.find((l) => l.attribution === 'split');
    expect(split?.tier).toBe('pvc-pod');
    const svmPvc = graph.links.find((l) => l.tier === 'svm-pvc' && l.target.includes('data-mongo-0'));
    expect(svmPvc?.attribution).toBeUndefined();
  });

  it('starts a FlexGroup path at svm-pvc with no synthesized aggregate', () => {
    const graph = deriveSankey(elements, 'read');
    const scratch = graph.nodes.find((n) => n.label === 'data-scratch');
    expect(scratch).toBeDefined();
    expect(graph.links.some((l) => l.target === scratch!.id && l.tier === 'svm-pvc')).toBe(true);
    expect(graph.links.some((l) => l.target === scratch!.id && l.tier === 'aggr-svm')).toBe(false);
  });

  it('ends an unscheduled pod at pvc-pod with no placeholder node', () => {
    const { elements: unsched } = normalizeGraph(
      wire(
        [
          { id: 'p', name: 'claim', type: 'pvc' },
          { id: 'pod', name: 'pending', type: 'pod' },
        ],
        [
          {
            id: 'e',
            type: 'storage-flow',
            source: 'p',
            target: 'pod',
            labels: { tier: 'pvc-pod' },
            metrics: { read_bytes_per_sec: 10 },
          },
        ]
      )
    );
    const graph = deriveSankey(unsched, 'read');
    expect(graph.nodes.map((n) => n.kind).sort()).toEqual(['pod', 'pvc']);
    expect(graph.links).toHaveLength(1);
    expect(graph.links[0]?.tier).toBe('pvc-pod');
  });

  it('still draws a no-flow root and does not treat it as empty', () => {
    const { elements: emptyRoot } = normalizeGraph(
      wire(
        [
          { id: 'n', name: 'ontap-prod-01', type: 'netapp-node' },
          { id: 'a', name: 'aggr9', type: 'netapp-aggr' },
        ],
        []
      )
    );
    const graph = deriveSankey(emptyRoot, 'both');
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes.every((n) => n.noFlow === true)).toBe(true);
    expect(graph.links).toEqual([]);
    expect(graph.hasStorageFlowEdges).toBe(false);
  });

  it('keeps a requested root on a path whose every edge came back unmeasured', () => {
    const { elements: unmeasured } = normalizeGraph(
      wire(
        [
          { id: 'n', name: 'ontap-prod-01', type: 'netapp-node', labels: { ontap_cluster: 'ontap-prod' } },
          { id: 'a', name: 'aggr1', type: 'netapp-aggr', labels: { ontap_cluster: 'ontap-prod' } },
          { id: 's', name: 'svm_shop', type: 'netapp-svm', labels: { ontap_cluster: 'ontap-prod' } },
        ],
        [
          { id: 'e1', type: 'storage-flow', source: 'n', target: 'a', labels: { tier: 'node-aggr' } },
          { id: 'e2', type: 'storage-flow', source: 'a', target: 's', labels: { tier: 'aggr-svm' } },
        ]
      )
    );
    // Every node here is incident to an edge, so "no edge at all" cannot identify the root.
    const withoutRoots = deriveSankey(unmeasured, 'both');
    expect(withoutRoots.nodes).toEqual([]);

    const graph = deriveSankey(unmeasured, 'both', { ...EMPTY_STORAGE_GRAPH_ROOTS, aggr: ['aggr1'] });
    expect(graph.nodes.map((n) => n.id)).toEqual(['a']);
    expect(graph.nodes[0]?.noFlow).toBe(true);
    expect(graph.links).toEqual([]);
    expect(graph.hasStorageFlowEdges).toBe(true);
  });

  it('matches each root kind the backend matches, and never a pvc', () => {
    const { elements: unmeasured } = normalizeGraph(
      wire(
        [
          { id: 'n', name: 'ontap-prod-01', type: 'netapp-node', labels: { ontap_cluster: 'ontap-prod' } },
          { id: 's', name: 'svm_shop', type: 'netapp-svm', labels: { ontap_cluster: 'ontap-prod' } },
          { id: 'c', name: 'data-mongo-0', type: 'pvc', labels: { namespace: 'shop' } },
          { id: 'p', name: 'mongo-0', type: 'pod', labels: { namespace: 'shop' } },
          { id: 'k', name: 'worker-0', type: 'node' },
        ],
        [
          { id: 'e1', type: 'storage-flow', source: 's', target: 'c', labels: { tier: 'svm-pvc' } },
          { id: 'e2', type: 'storage-flow', source: 'c', target: 'p', labels: { tier: 'pvc-pod' } },
          { id: 'e3', type: 'storage-flow', source: 'p', target: 'k', labels: { tier: 'pod-node' } },
        ]
      )
    );
    const kept = (roots: Partial<StorageGraphRoots>): string[] =>
      deriveSankey(unmeasured, 'both', { ...EMPTY_STORAGE_GRAPH_ROOTS, ...roots }).nodes.map((n) => n.id);

    // `n` has no edge at all, so it is a materialised root under every selection.
    expect(kept({})).toEqual(['n']);
    // `node` deliberately hits both a NetApp controller and a Kubernetes node.
    expect(kept({ node: ['worker-0'] })).toEqual(expect.arrayContaining(['n', 'k']));
    expect(kept({ ontap_cluster: ['ontap-prod'] })).toEqual(expect.arrayContaining(['n', 's']));
    expect(kept({ pod: ['shop/mongo-0'] })).toEqual(expect.arrayContaining(['n', 'p']));
    expect(kept({ pod: ['other/mongo-0'] })).toEqual(['n']);
    // A claim is not a root kind, so no selection can materialise one.
    expect(kept({ svm: ['data-mongo-0'], aggr: ['data-mongo-0'], node: ['data-mongo-0'] })).toEqual(['n']);
  });

  it('draws a zero-weight link and does not treat 0 as absent', () => {
    const { elements: zero } = normalizeGraph(
      wire(
        [
          { id: 'a', name: 'a', type: 'netapp-aggr' },
          { id: 's', name: 's', type: 'netapp-svm' },
        ],
        [
          {
            id: 'e',
            type: 'storage-flow',
            source: 'a',
            target: 's',
            labels: { tier: 'aggr-svm' },
            metrics: { read_bytes_per_sec: 0, write_bytes_per_sec: 1048576 },
          },
        ]
      )
    );
    const read = deriveSankey(zero, 'read');
    expect(read.links).toHaveLength(1);
    expect(read.links[0]?.value).toBe(0);
    const write = deriveSankey(zero, 'write');
    expect(write.links[0]?.value).toBe(1048576);
  });

  it('sorts a no-flow root below a flowing peer of the same tier', () => {
    const { elements: mixed } = normalizeGraph(
      wire(
        [
          { id: 'a1', name: 'aggr1', type: 'netapp-aggr' },
          { id: 'a9', name: 'aggr9', type: 'netapp-aggr' },
          { id: 's', name: 's', type: 'netapp-svm' },
        ],
        [
          {
            id: 'e',
            type: 'storage-flow',
            source: 'a1',
            target: 's',
            labels: { tier: 'aggr-svm' },
            metrics: { read_bytes_per_sec: 100 },
          },
        ]
      )
    );
    const graph = deriveSankey(mixed, 'read');
    const aggr = graph.nodes.filter((n) => n.kind === 'netapp-aggr').map((n) => n.label);
    expect(aggr).toEqual(['aggr1', 'aggr9']);
  });

  it('sorts equal flow by label', () => {
    const { elements: tied } = normalizeGraph(
      wire(
        [
          { id: 'b', name: 'data-b', type: 'pvc' },
          { id: 'a', name: 'data-a', type: 'pvc' },
          { id: 'p1', name: 'p1', type: 'pod' },
          { id: 'p2', name: 'p2', type: 'pod' },
        ],
        [
          {
            id: 'e1',
            type: 'storage-flow',
            source: 'b',
            target: 'p1',
            labels: { tier: 'pvc-pod' },
            metrics: { read_bytes_per_sec: 1048576 },
          },
          {
            id: 'e2',
            type: 'storage-flow',
            source: 'a',
            target: 'p2',
            labels: { tier: 'pvc-pod' },
            metrics: { read_bytes_per_sec: 1048576 },
          },
        ]
      )
    );
    const graph = deriveSankey(tied, 'read');
    expect(graph.nodes.filter((n) => n.kind === 'pvc').map((n) => n.label)).toEqual(['data-a', 'data-b']);
  });

  it('formats rates on the shared SI ladder, with an exponent for tiny values', () => {
    expect(formatBytesPerSec(5242880)).toBe('5.24 MB/s');
    expect(formatBytesPerSec(104857600)).toBe('105 MB/s');
    expect(formatBytesPerSec(262144)).toBe('262 KB/s');
    expect(formatBytesPerSec(49152)).toBe('49.2 KB/s');
    expect(formatBytesPerSec(0)).toBe('0 B/s');
    expect(formatBytesPerSec(3.86e-7)).toBe('3.86e-7 B/s');
  });

  it('computes a hover path through a pvc node', () => {
    const graph = deriveSankey(elements, 'both');
    const pvc = graph.nodes.find((n) => n.kind === 'pvc' && n.label === 'data-mongo-0');
    expect(pvc).toBeDefined();
    const path = hoverPathLinks(graph, pvc!.id);
    expect(path.some((l) => l.tier === 'node-aggr')).toBe(true);
    expect(path.some((l) => l.tier === 'pod-node')).toBe(true);
    expect(path.some((l) => l.source.includes('aggr2') || l.target.includes('aggr2'))).toBe(false);
  });

  it('ignores a storage-flow edge whose endpoints are missing', () => {
    const { elements: dangling } = normalizeGraph(
      wire(
        [{ id: 'a', name: 'a', type: 'netapp-aggr' }],
        [
          {
            id: 'e',
            type: 'storage-flow',
            source: 'a',
            target: 'missing',
            labels: { tier: 'aggr-svm' },
            metrics: { read_bytes_per_sec: 1 },
          },
        ]
      )
    );
    const graph = deriveSankey(dangling, 'read');
    expect(graph.links).toEqual([]);
    expect(graph.nodes.some((n) => n.id === 'a' && n.noFlow === true)).toBe(true);
  });
});
