import { clonePlain } from '../../shared/clone/clonePlain';
import { SHOWCASE_STORAGE_GRAPH } from '../../shared/fixtures/showcaseStorageGraph';
import { EMPTY_STORAGE_GRAPH_ROOTS, normalizeGraph, type StorageGraphRoots } from '../graph-data';

import {
  deriveSankey,
  formatBytesPerSec,
  hoverPathForFrame,
  hoverPathLinks,
  hoverPathLinksMany,
  resolveClaimAggregates,
  rootValueOptions,
  SANKEY_KIND_ORDER,
} from './deriveSankey';

function wire(nodes: unknown[], edges: unknown[]): unknown {
  return { elements: { nodes: nodes.map((data) => ({ data })), edges: edges.map((data) => ({ data })) } };
}

// Two Kubernetes clusters writing to ONE NetApp node: `aggr-shared` takes traffic from
// both, `aggr-b-only` from cluster b alone. The fixture cannot express this — only its
// `prod` cluster has storage flow at all — and it is exactly the shape a cluster filter
// has to get right.

describe('deriveSankey', () => {
  const { elements } = normalizeGraph(SHOWCASE_STORAGE_GRAPH);

  it('passes the backend status through untouched and leaves an unjudged node without one', () => {
    const graph = deriveSankey(elements, 'both');
    const byLabel = new Map(graph.nodes.map((n) => [n.label, n]));
    expect(byLabel.get('aggr1')?.status).toBe('warning');
    expect(byLabel.get('ontap-prod-02')?.status).toBe('critical');
    expect(byLabel.get('ontap-prod-01')?.status).toBe('normal');
    // The backend judges no SVM, so nothing here may invent one — an absent status draws
    // the neutral border rather than a green one claiming a verdict nobody made.
    expect(byLabel.get('svm_shop')?.status).toBeUndefined();
  });

  it('drops a status the palette cannot draw rather than painting a wrong colour', () => {
    const graph = deriveSankey(
      normalizeGraph(
        wire(
          [
            { id: 'c', name: 'c', type: 'pvc', status: 'catastrophic' },
            { id: 'p', name: 'p', type: 'pod', status: 'critical' },
          ],
          [
            {
              id: 'e',
              type: 'storage-flow',
              source: 'c',
              target: 'p',
              labels: { tier: 'pvc-pod' },
              metrics: { read_bytes_per_sec: 10 },
            },
          ]
        )
      ).elements,
      'both'
    );
    expect(graph.nodes.find((n) => n.id === 'c')?.status).toBeUndefined();
    expect(graph.nodes.find((n) => n.id === 'p')?.status).toBe('critical');
  });

  it('does not assign status to derived application / namespace cards', () => {
    const graph = deriveSankey(elements, 'both');
    const byLabel = new Map(graph.nodes.map((n) => [`${n.kind}/${n.label}`, n]));
    expect(byLabel.get('pod/batch-pending')?.status).toBe('warning');
    expect(byLabel.get('application/mongodb')?.status).toBeUndefined();
    expect(byLabel.get('namespace/prod')?.status).toBeUndefined();
  });

  it('folds a node wrapper to the worst of the node and the pods it draws', () => {
    const graph = deriveSankey(elements, 'both');
    const byLabel = new Map(graph.k8sNodes.map((n) => [n.label, n]));
    expect(byLabel.get('worker-0')?.status).toBe('normal');
    // worker-1 is warning itself while every pod on it is normal — the wrapper is the only
    // thing drawn for the node, so its own verdict has to survive the fold.
    expect(byLabel.get('worker-1')?.status).toBe('warning');
  });

  it('offers a root value per kind from the drawn body, with node collecting both sides', () => {
    const opts = rootValueOptions(elements);
    expect(opts.ontap_cluster).toEqual(['ontap-prod']);
    expect(opts.aggr).toEqual(['aggr1', 'aggr2']);
    expect(opts.svm).toEqual(['svm_jobs', 'svm_shop']);
    // `node` matches BOTH a NetApp controller and a Kubernetes node, exactly as the backend
    // matches that kind — offering only one side would hide half of what the root accepts.
    expect(opts.node).toEqual(['ontap-prod-01', 'ontap-prod-02', 'worker-0', 'worker-1']);
    // A pod root is `<namespace>/<pod>`; a bare name is a 400, so it is never offered.
    expect(opts.pod).toContain('prod/mongo-0');
    expect(opts.pod.every((value) => value.includes('/'))).toBe(true);
  });

  it('offers nothing for a kind the body holds none of, rather than a partial value', () => {
    const opts = rootValueOptions(normalizeGraph(wire([{ id: 'p', name: 'p', type: 'pod' }], [])).elements);
    // The pod carries no namespace, so it cannot be named as a root at all.
    expect(opts.pod).toEqual([]);
    expect(opts.aggr).toEqual([]);
    expect(opts.ontap_cluster).toEqual([]);
  });

  it('does not mutate the shared graph', () => {
    const before = clonePlain(elements);
    deriveSankey(elements, 'both');
    deriveSankey(elements, 'read');
    deriveSankey(elements, 'write');
    expect(elements).toEqual(before);
  });

  it('derives seven columns from the storage fixture in Both mode', () => {
    const graph = deriveSankey(elements, 'both');
    const byKind = Object.fromEntries(
      SANKEY_KIND_ORDER.map((kind) => [kind, graph.nodes.filter((n) => n.kind === kind).map((n) => n.label)])
    );
    expect(byKind['netapp-node']).toEqual(['ontap-prod-01', 'ontap-prod-02']);
    expect(byKind['netapp-aggr']).toEqual(['aggr1', 'aggr2']);
    expect(byKind['netapp-svm']).toEqual(expect.arrayContaining(['svm_shop', 'svm_jobs']));
    expect(byKind.pvc).toEqual(
      expect.arrayContaining(['data-mongo-0', 'data-mongo-1', 'data-scratch', 'data-orphan', 'data-pending'])
    );
    expect(byKind.pod).toEqual(expect.arrayContaining(['mongo-0', 'mongo-1', 'orphan-0', 'batch-pending']));
    expect(byKind.application).toEqual(['mongodb']);
    expect(byKind.namespace).toEqual(['prod']);
    expect(graph.nodes.some((n) => n.id === 'storage-cluster/ontap-prod')).toBe(false);
    expect(graph.nodes.some((n) => n.id === 'prod/ctrl/StatefulSet/mongodb')).toBe(false);
    expect(graph.nodes.some((n) => n.id === 'node/worker-0')).toBe(false);
    expect(graph.nodes.some((n) => n.id === 'node/worker-1')).toBe(false);
    expect(graph.links.some((l) => l.target === 'node/worker-0' || l.target === 'node/worker-1')).toBe(false);
    const backendTiers = new Set(graph.links.filter((l) => l.derived !== true).map((l) => l.tier));
    expect(backendTiers).toEqual(new Set(['node-aggr', 'aggr-svm', 'svm-pvc', 'pvc-pod']));
    const derived = graph.links.filter((l) => l.derived === true);
    expect(derived.map((l) => `${l.source}:${l.target}:${l.tier}`).sort()).toEqual(
      expect.arrayContaining([
        'pod/mongo-0:prod/app/mongodb:pod-application',
        'pod/mongo-1:prod/app/mongodb:pod-application',
        'prod/app/mongodb:prod/ns/prod:application-namespace',
      ])
    );
  });

  it('sums derived application → namespace weights from member pods', () => {
    const graph = deriveSankey(elements, 'both');
    const inbound = (pod: string, dir: 'read' | 'write'): number =>
      graph.links
        .filter((l) => l.target === pod && l.tier === 'pvc-pod' && l.direction === dir)
        .reduce((sum, l) => sum + l.value, 0);
    const mongo0Read = inbound('pod/mongo-0', 'read');
    const mongo0Write = inbound('pod/mongo-0', 'write');
    const mongo1Read = inbound('pod/mongo-1', 'read');
    const mongo1Write = inbound('pod/mongo-1', 'write');
    expect(
      graph.links.find((l) => l.source === 'pod/mongo-0' && l.tier === 'pod-application' && l.direction === 'read')
        ?.value
    ).toBe(mongo0Read);
    expect(
      graph.links.find((l) => l.source === 'pod/mongo-0' && l.tier === 'pod-application' && l.direction === 'write')
        ?.value
    ).toBe(mongo0Write);
    const toNs = graph.links.filter((l) => l.source === 'prod/app/mongodb' && l.target === 'prod/ns/prod');
    expect(toNs.find((l) => l.direction === 'read')?.value).toBe(mongo0Read + mongo1Read);
    expect(toNs.find((l) => l.direction === 'write')?.value).toBe(mongo0Write + mongo1Write);
    expect(toNs.every((l) => l.derived === true)).toBe(true);
  });

  it('spans a pod without an application straight to its namespace', () => {
    const { elements: orphan } = normalizeGraph(
      wire(
        [
          { id: 'cluster/x', name: 'x', type: 'cluster' },
          { id: 'ns/jobs', name: 'jobs', type: 'namespace', parent: 'cluster/x' },
          { id: 'ctrl/batch', name: 'batch', type: 'controller', parent: 'ns/jobs' },
          { id: 'p', name: 'claim', type: 'pvc' },
          { id: 'pod', name: 'orphan', type: 'pod', parent: 'ctrl/batch', labels: { namespace: 'jobs' } },
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
    const graph = deriveSankey(orphan, 'read');
    expect(graph.nodes.filter((n) => n.kind === 'application')).toEqual([]);
    expect(graph.nodes.find((n) => n.kind === 'namespace')?.label).toBe('jobs');
    expect(graph.links.some((l) => l.tier === 'pod-namespace' && l.source === 'pod' && l.target === 'ns/jobs')).toBe(
      true
    );
    expect(graph.links.some((l) => l.tier === 'pod-application')).toBe(false);
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
    // `node` hits a NetApp controller as a card and a Kubernetes node as a wrapper, never a column.
    expect(kept({ node: ['worker-0'] })).toEqual(expect.arrayContaining(['n']));
    expect(kept({ node: ['worker-0'] })).not.toContain('k');
    expect(
      deriveSankey(unmeasured, 'both', { ...EMPTY_STORAGE_GRAPH_ROOTS, node: ['worker-0'] }).k8sNodes.map((n) => n.id)
    ).toEqual(['k']);
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

  it('computes a hover path through a pvc node, walking derived links not pod-node', () => {
    const graph = deriveSankey(elements, 'both');
    const pvc = graph.nodes.find((n) => n.kind === 'pvc' && n.label === 'data-mongo-0');
    expect(pvc).toBeDefined();
    const path = hoverPathLinks(graph, pvc!.id);
    expect(path.some((l) => l.tier === 'node-aggr')).toBe(true);
    expect(path.some((l) => l.tier === 'pod-application')).toBe(true);
    expect(path.some((l) => l.tier === 'application-namespace')).toBe(true);
    expect(path.some((l) => l.target.startsWith('node/'))).toBe(false);
  });

  it("a many-start walk lights exactly the union of each start's own path", () => {
    const { elements: noAggr } = normalizeGraph(
      (() => {
        const body = clonePlain(SHOWCASE_STORAGE_GRAPH);
        for (const n of body.elements.nodes) {
          delete (n.data as { labels?: Record<string, unknown> }).labels?.aggr;
        }
        return body;
      })()
    );
    expect(deriveSankey(noAggr, 'both').reportsClaimAggregates).toBe(false);
    for (const [name, graph] of [
      ['claim-aware', deriveSankey(elements, 'both')],
      ['no claim aggregates', deriveSankey(noAggr, 'both')],
      ['group', deriveSankey(elements, 'both', EMPTY_STORAGE_GRAPH_ROOTS, 'group')],
    ] as const) {
      const ids = graph.nodes.map((n) => n.id);
      const union = new Set(ids.flatMap((id) => hoverPathLinks(graph, id)));
      expect(new Set(hoverPathLinksMany(graph, ids)), name).toEqual(union);
      expect(union.size, name).toBeGreaterThan(0);
      // A subset mixing an SVM start (unconstrained) with constrained starts.
      const some = graph.nodes.filter((n) => n.kind === 'netapp-svm' || n.kind === 'pvc').map((n) => n.id);
      expect(new Set(hoverPathLinksMany(graph, some)), name).toEqual(
        new Set(some.flatMap((id) => hoverPathLinks(graph, id)))
      );
    }
  });

  describe('hover: claim-aware crossing', () => {
    const idOf = (graph: ReturnType<typeof deriveSankey>, kind: string, label: string): string => {
      const found = graph.nodes.find((n) => n.kind === kind && n.label === label);
      if (found === undefined) {
        throw new Error(`missing node ${kind}/${label}`);
      }
      return found.id;
    };
    const hasEdge = (path: ReturnType<typeof hoverPathLinks>, source: string, target: string): boolean =>
      path.some((l) => l.source === source && l.target === target);

    it('hovering a pvc highlights upstream and downstream', () => {
      const graph = deriveSankey(elements, 'both');
      const mongo0 = idOf(graph, 'pvc', 'data-mongo-0');
      const mongo1 = idOf(graph, 'pvc', 'data-mongo-1');
      const aggr1 = idOf(graph, 'netapp-aggr', 'aggr1');
      const aggr2 = idOf(graph, 'netapp-aggr', 'aggr2');
      const svmShop = idOf(graph, 'netapp-svm', 'svm_shop');
      const ontap01 = idOf(graph, 'netapp-node', 'ontap-prod-01');
      const podMongo0 = idOf(graph, 'pod', 'mongo-0');
      const podMongo1 = idOf(graph, 'pod', 'mongo-1');
      const mongodb = idOf(graph, 'application', 'mongodb');
      const prod = idOf(graph, 'namespace', 'prod');

      const path = hoverPathLinks(graph, mongo0);
      expect(hasEdge(path, ontap01, aggr1)).toBe(true);
      expect(hasEdge(path, aggr1, svmShop)).toBe(true);
      expect(hasEdge(path, svmShop, mongo0)).toBe(true);
      expect(hasEdge(path, mongo0, podMongo0)).toBe(true);
      expect(hasEdge(path, podMongo0, mongodb)).toBe(true);
      expect(hasEdge(path, mongodb, prod)).toBe(true);
      expect(hasEdge(path, aggr2, svmShop)).toBe(false);
      expect(hasEdge(path, svmShop, mongo1)).toBe(false);
      expect(hasEdge(path, podMongo1, mongodb)).toBe(false);
    });

    it('hovering an aggregate lights only its own claims', () => {
      const graph = deriveSankey(elements, 'both');
      const aggr2 = idOf(graph, 'netapp-aggr', 'aggr2');
      const svmShop = idOf(graph, 'netapp-svm', 'svm_shop');
      const ontap02 = idOf(graph, 'netapp-node', 'ontap-prod-02');
      const mongo0 = idOf(graph, 'pvc', 'data-mongo-0');
      const mongo1 = idOf(graph, 'pvc', 'data-mongo-1');
      const scratch = idOf(graph, 'pvc', 'data-scratch');
      const podMongo1 = idOf(graph, 'pod', 'mongo-1');
      const mongodb = idOf(graph, 'application', 'mongodb');
      const prod = idOf(graph, 'namespace', 'prod');

      const path = hoverPathLinks(graph, aggr2);
      expect(hasEdge(path, ontap02, aggr2)).toBe(true);
      expect(hasEdge(path, aggr2, svmShop)).toBe(true);
      expect(hasEdge(path, svmShop, mongo1)).toBe(true);
      expect(hasEdge(path, mongo1, podMongo1)).toBe(true);
      expect(hasEdge(path, podMongo1, mongodb)).toBe(true);
      expect(hasEdge(path, mongodb, prod)).toBe(true);
      expect(hasEdge(path, svmShop, mongo0)).toBe(false);
      expect(hasEdge(path, svmShop, scratch)).toBe(false);
    });

    it("a FlexGroup claim's path starts at its SVM", () => {
      const graph = deriveSankey(elements, 'both');
      const scratch = idOf(graph, 'pvc', 'data-scratch');
      const svmShop = idOf(graph, 'netapp-svm', 'svm_shop');
      const path = hoverPathLinks(graph, scratch);
      expect(hasEdge(path, svmShop, scratch)).toBe(true);
      expect(path.some((l) => l.tier === 'aggr-svm')).toBe(false);
      expect(path.some((l) => l.tier === 'node-aggr')).toBe(false);
      expect(path.some((l) => l.tier === 'pvc-pod' && l.source === scratch)).toBe(true);
    });

    it('walks every link when the body reports no claim aggregates', () => {
      const { elements: noAggr } = normalizeGraph(
        wire(
          [
            { id: 'nn1', name: 'ontap-prod-01', type: 'netapp-node' },
            { id: 'nn2', name: 'ontap-prod-02', type: 'netapp-node' },
            { id: 'a1', name: 'aggr1', type: 'netapp-aggr' },
            { id: 'a2', name: 'aggr2', type: 'netapp-aggr' },
            { id: 's', name: 'svm_shop', type: 'netapp-svm' },
            { id: 'p0', name: 'data-mongo-0', type: 'pvc' },
          ],
          [
            {
              id: 'na1',
              type: 'storage-flow',
              source: 'nn1',
              target: 'a1',
              labels: { tier: 'node-aggr' },
              metrics: { read_bytes_per_sec: 1 },
            },
            {
              id: 'na2',
              type: 'storage-flow',
              source: 'nn2',
              target: 'a2',
              labels: { tier: 'node-aggr' },
              metrics: { read_bytes_per_sec: 1 },
            },
            {
              id: 'as1',
              type: 'storage-flow',
              source: 'a1',
              target: 's',
              labels: { tier: 'aggr-svm' },
              metrics: { read_bytes_per_sec: 1 },
            },
            {
              id: 'as2',
              type: 'storage-flow',
              source: 'a2',
              target: 's',
              labels: { tier: 'aggr-svm' },
              metrics: { read_bytes_per_sec: 1 },
            },
            {
              id: 'sp0',
              type: 'storage-flow',
              source: 's',
              target: 'p0',
              labels: { tier: 'svm-pvc' },
              metrics: { read_bytes_per_sec: 1 },
            },
          ]
        )
      );
      const graph = deriveSankey(noAggr, 'read');
      expect(graph.reportsClaimAggregates).toBe(false);
      const mongo0 = idOf(graph, 'pvc', 'data-mongo-0');
      const svmShop = idOf(graph, 'netapp-svm', 'svm_shop');
      const aggr1 = idOf(graph, 'netapp-aggr', 'aggr1');
      const aggr2 = idOf(graph, 'netapp-aggr', 'aggr2');
      const path = hoverPathLinks(graph, mongo0);
      expect(hasEdge(path, aggr1, svmShop)).toBe(true);
      expect(hasEdge(path, aggr2, svmShop)).toBe(true);
      expect(path.some((l) => l.tier === 'node-aggr')).toBe(true);
    });

    it('hovering a frame highlights its claims’ paths under Group', () => {
      const graph = deriveSankey(elements, 'both', undefined, 'group');
      const frame = graph.svmFrames.find((f) => f.label === 'svm_shop');
      expect(frame).toBeDefined();
      const path = hoverPathForFrame(graph, frame!);
      const aggr1 = idOf(graph, 'netapp-aggr', 'aggr1');
      const aggr2 = idOf(graph, 'netapp-aggr', 'aggr2');
      const mongo0 = idOf(graph, 'pvc', 'data-mongo-0');
      const mongo1 = idOf(graph, 'pvc', 'data-mongo-1');
      const ontap01 = idOf(graph, 'netapp-node', 'ontap-prod-01');
      const ontap02 = idOf(graph, 'netapp-node', 'ontap-prod-02');
      const podMongo0 = idOf(graph, 'pod', 'mongo-0');
      expect(hasEdge(path, aggr1, mongo0)).toBe(true);
      expect(hasEdge(path, aggr2, mongo1)).toBe(true);
      expect(hasEdge(path, ontap01, aggr1)).toBe(true);
      expect(hasEdge(path, ontap02, aggr2)).toBe(true);
      expect(hasEdge(path, mongo0, podMongo0)).toBe(true);
    });
  });

  it('spans the fixture pod without an application to its namespace and leaves the unscheduled pod unwrapped', () => {
    const graph = deriveSankey(elements, 'both');
    expect(graph.links.some((l) => l.source === 'pod/orphan-0' && l.tier === 'pod-namespace')).toBe(true);
    expect(graph.nodes.find((n) => n.id === 'pod/batch-pending')?.k8sNodeId).toBeUndefined();
    expect(graph.k8sNodes.some((n) => n.podIds.includes('pod/batch-pending'))).toBe(false);
  });

  it('records each pod Kubernetes node from the pod-node edge without drawing it', () => {
    const graph = deriveSankey(elements, 'both');
    expect(graph.nodes.find((n) => n.id === 'pod/mongo-0')?.k8sNodeId).toBe('node/worker-0');
    expect(graph.nodes.find((n) => n.id === 'pod/mongo-1')?.k8sNodeId).toBe('node/worker-1');
    expect(graph.k8sNodes.map((n) => n.label).sort()).toEqual(['worker-0', 'worker-1']);
    expect(graph.k8sNodes.find((n) => n.label === 'worker-0')?.podIds).toEqual(
      expect.arrayContaining(['pod/mongo-0', 'pod/orphan-0'])
    );
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

  it('reads a claim aggregate from the PVC, never inferred from the SVM inbound hops', () => {
    const graph = deriveSankey(elements, 'both');
    const mongo0 = graph.nodes.find((n) => n.kind === 'pvc' && n.label === 'data-mongo-0');
    const mongo1 = graph.nodes.find((n) => n.kind === 'pvc' && n.label === 'data-mongo-1');
    const scratch = graph.nodes.find((n) => n.kind === 'pvc' && n.label === 'data-scratch');
    const aggr1 = graph.nodes.find((n) => n.kind === 'netapp-aggr' && n.label === 'aggr1');
    const aggr2 = graph.nodes.find((n) => n.kind === 'netapp-aggr' && n.label === 'aggr2');
    expect(graph.claimAggregates.get(mongo0!.id)).toBe(aggr1!.id);
    expect(graph.claimAggregates.get(mongo1!.id)).toBe(aggr2!.id);
    expect(graph.claimAggregates.has(scratch!.id)).toBe(false);
    expect(graph.reportsClaimAggregates).toBe(true);
  });

  it('resolves to no claim aggregate when the label names a node absent from the body', () => {
    const { elements: absent } = normalizeGraph(
      wire(
        [
          { id: 's', name: 's', type: 'netapp-svm' },
          { id: 'c', name: 'c', type: 'pvc', labels: { aggr: 'netapp/does-not-exist' } },
        ],
        [
          {
            id: 'e',
            type: 'storage-flow',
            source: 's',
            target: 'c',
            labels: { tier: 'svm-pvc' },
            metrics: { read_bytes_per_sec: 1 },
          },
        ]
      )
    );
    expect(resolveClaimAggregates(absent).size).toBe(0);
    const graph = deriveSankey(absent, 'read');
    expect(graph.claimAggregates.size).toBe(0);
    expect(graph.reportsClaimAggregates).toBe(false);
  });

  it('reports no claim aggregates when no PVC in the body carries the label', () => {
    const { elements: noLabel } = normalizeGraph(
      wire(
        [
          { id: 's', name: 's', type: 'netapp-svm' },
          { id: 'c', name: 'c', type: 'pvc' },
        ],
        [
          {
            id: 'e',
            type: 'storage-flow',
            source: 's',
            target: 'c',
            labels: { tier: 'svm-pvc' },
            metrics: { read_bytes_per_sec: 1 },
          },
        ]
      )
    );
    const graph = deriveSankey(noLabel, 'read');
    expect(graph.reportsClaimAggregates).toBe(false);
  });

  describe('SVM display: group', () => {
    it('column output on the fixture equals today’s apart from the two new fields', () => {
      const column = deriveSankey(elements, 'both', undefined, 'column');
      expect(column.svmFrames).toEqual([]);
      const { claimAggregates, reportsClaimAggregates, svmFrames, ...rest } = column;
      expect(claimAggregates.size).toBeGreaterThan(0);
      expect(reportsClaimAggregates).toBe(true);
      expect(svmFrames).toEqual([]);
      expect(rest.nodes.some((n) => n.kind === 'netapp-svm')).toBe(true);
    });

    it('draws each aggregate straight to its claims', () => {
      const graph = deriveSankey(elements, 'both', undefined, 'group');
      expect(graph.nodes.some((n) => n.kind === 'netapp-svm')).toBe(false);
      const frame = graph.svmFrames.find((f) => f.label === 'svm_shop');
      expect(frame).toBeDefined();
      const mongo0 = graph.nodes.find((n) => n.kind === 'pvc' && n.label === 'data-mongo-0')!;
      const mongo1 = graph.nodes.find((n) => n.kind === 'pvc' && n.label === 'data-mongo-1')!;
      const scratch = graph.nodes.find((n) => n.kind === 'pvc' && n.label === 'data-scratch')!;
      expect(frame!.pvcIds.sort()).toEqual([mongo0.id, mongo1.id, scratch.id].sort());
      const aggr1 = graph.nodes.find((n) => n.kind === 'netapp-aggr' && n.label === 'aggr1')!;
      const aggr2 = graph.nodes.find((n) => n.kind === 'netapp-aggr' && n.label === 'aggr2')!;
      const ribbon1 = graph.links.find(
        (l) => l.source === aggr1.id && l.target === mongo0.id && l.direction === 'read'
      );
      const ribbon2 = graph.links.find(
        (l) => l.source === aggr2.id && l.target === mongo1.id && l.direction === 'read'
      );
      expect(ribbon1?.tier).toBe('svm-pvc');
      expect(ribbon2?.tier).toBe('svm-pvc');
      const column = deriveSankey(elements, 'read', undefined, 'column');
      expect(ribbon1?.value).toBe(column.links.find((l) => l.target === mongo0.id && l.tier === 'svm-pvc')?.value);
      expect(ribbon2?.value).toBe(column.links.find((l) => l.target === mongo1.id && l.tier === 'svm-pvc')?.value);
      expect(graph.links.some((l) => l.tier === 'aggr-svm')).toBe(false);
    });

    it('draws a FlexGroup claim in its frame with no aggregate ribbon', () => {
      const graph = deriveSankey(elements, 'both', undefined, 'group');
      const scratch = graph.nodes.find((n) => n.kind === 'pvc' && n.label === 'data-scratch')!;
      const frame = graph.svmFrames.find((f) => f.label === 'svm_shop');
      expect(frame?.pvcIds).toContain(scratch.id);
      expect(graph.links.some((l) => l.tier === 'svm-pvc' && l.target === scratch.id)).toBe(false);
      // Its downstream (split pvc-pod) links are drawn as usual.
      expect(graph.links.some((l) => l.tier === 'pvc-pod' && l.source === scratch.id)).toBe(true);
    });

    it('re-sources a claim’s weight without re-summing', () => {
      const { elements: svmA } = normalizeGraph(
        wire(
          [
            { id: 'aggr1', name: 'aggr1', type: 'netapp-aggr' },
            { id: 'svm_a', name: 'svm_a', type: 'netapp-svm' },
            { id: 'pvc-1', name: 'pvc-1', type: 'pvc', labels: { aggr: 'aggr1' } },
            { id: 'pvc-2', name: 'pvc-2', type: 'pvc', labels: { aggr: 'aggr1' } },
          ],
          [
            {
              id: 'as',
              type: 'storage-flow',
              source: 'aggr1',
              target: 'svm_a',
              labels: { tier: 'aggr-svm' },
              metrics: { read_bytes_per_sec: 1000 },
            },
            {
              id: 'sp1',
              type: 'storage-flow',
              source: 'svm_a',
              target: 'pvc-1',
              labels: { tier: 'svm-pvc' },
              metrics: { read_bytes_per_sec: 700 },
            },
            {
              id: 'sp2',
              type: 'storage-flow',
              source: 'svm_a',
              target: 'pvc-2',
              labels: { tier: 'svm-pvc' },
              metrics: { read_bytes_per_sec: 300 },
            },
          ]
        )
      );
      const graph = deriveSankey(svmA, 'read', undefined, 'group');
      const pvc1 = graph.nodes.find((n) => n.label === 'pvc-1')!;
      const pvc2 = graph.nodes.find((n) => n.label === 'pvc-2')!;
      const aggr1 = graph.nodes.find((n) => n.label === 'aggr1')!;
      expect(graph.links.find((l) => l.target === pvc1.id)?.value).toBe(700);
      expect(graph.links.find((l) => l.target === pvc2.id)?.value).toBe(300);
      expect(graph.links.some((l) => l.value === 1000)).toBe(false);
      const frame = graph.svmFrames.find((f) => f.label === 'svm_a');
      expect(frame?.pvcIds.sort()).toEqual([pvc1.id, pvc2.id].sort());
      expect(graph.links.every((l) => l.source === aggr1.id)).toBe(true);
    });
  });
});
