import type cytoscape from 'cytoscape';

import { APPLICATION_COLOR } from '../../shared/constants/applicationPalette';
import { CLUSTER_COLOR } from '../../shared/constants/clusterPalette';
import { NAMESPACE_COLOR } from '../../shared/constants/namespacePalette';

import { normalizeGraph } from './normalize';

// Fixtures mirror the upstream kube-state-graph D6 cytoscape payload contract
// (cluster > namespace > application > controller > pod; node + storageclass leaves
// under the cluster; pvc / service under the namespace).
const singleClusterGolden = {
  apiVersion: 'v1',
  clusters: ['cluster-alpha'],
  elements: {
    nodes: [
      { data: { id: 'cluster-alpha/worker-0', name: 'worker-0', type: 'node', labels: { cluster: 'cluster-alpha' } } },
      {
        data: {
          id: 'cluster-alpha/p1',
          name: 'checkout',
          type: 'pod',
          labels: { cluster: 'cluster-alpha', namespace: 'shop', node: 'cluster-alpha/worker-0' },
        },
      },
    ],
    edges: [
      {
        data: {
          id: '781eb391-3e20-5ebf-9b56-36d42bf6d687',
          type: 'pod-to-node',
          source: 'cluster-alpha/p1',
          target: 'cluster-alpha/worker-0',
          labels: {},
        },
      },
    ],
  },
};

describe('normalizeGraph', () => {
  it('returns empty + errors for non-object payload', () => {
    expect(normalizeGraph(null)).toEqual({ elements: [], errors: ['payload is not an object'] });
    expect(normalizeGraph(42).elements).toEqual([]);
  });

  it('normalizes the wrapped cytoscape golden payload', () => {
    const result = normalizeGraph(singleClusterGolden);
    expect(result.errors).toEqual([]);
    expect(result.elements).toHaveLength(3);

    const worker = result.elements[0];
    expect(worker?.group).toBe('nodes');
    expect(worker?.data.kind).toBe('node');
    expect(worker?.data.label).toBe('worker-0');

    const pod = result.elements[1];
    expect(pod?.data.kind).toBe('pod');
    expect(pod?.data.namespace).toBe('shop'); // extracted from labels.namespace

    // Node labels pass through verbatim (guards the node-labels spread).
    expect(pod?.data.labels).toEqual({
      cluster: 'cluster-alpha',
      namespace: 'shop',
      node: 'cluster-alpha/worker-0',
    });
    expect(worker?.data.labels).toEqual({ cluster: 'cluster-alpha' });

    const edge = result.elements[2];
    expect(edge?.group).toBe('edges');
    expect(edge?.data.edgeType).toBe('pod-to-node'); // mapped from data.type
  });

  it('maps ipaddress array to data.ipAddress', () => {
    const raw = {
      elements: {
        nodes: [
          {
            data: {
              id: 'cluster-alpha/shop/payments',
              name: 'payments',
              type: 'service',
              ipaddress: ['10.0.0.5'],
              labels: { namespace: 'shop' },
            },
          },
        ],
        edges: [],
      },
    };
    const result = normalizeGraph(raw);
    expect(result.elements[0]?.data.ipAddress).toEqual(['10.0.0.5']);
  });

  it('omits ipAddress when absent or empty', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'a', name: 'a', type: 'pod', labels: {} } },
          { data: { id: 'b', name: 'b', type: 'pod', ipaddress: [], labels: {} } },
        ],
        edges: [],
      },
    };
    const result = normalizeGraph(raw);
    expect(result.elements[0]?.data.ipAddress).toBeUndefined();
    expect(result.elements[1]?.data.ipAddress).toBeUndefined();
  });

  it('emits status only when the backend provides one (data-driven: a service without status gets none, a pod keeps its warning)', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'svc', name: 'svc', type: 'service', labels: { namespace: 'shop' } } },
          { data: { id: 'p', name: 'p', type: 'pod', status: 'warning', labels: {} } },
        ],
        edges: [],
      },
    };
    const byId = new Map(normalizeGraph(raw).elements.map((e) => [e.data.id, e.data]));
    // No backend status → omitted → the stylesheet's node[status] selector won't border it.
    expect(byId.get('svc')?.status).toBeUndefined();
    // A valid backend status survives verbatim.
    expect(byId.get('p')?.status).toBe('warning');
  });

  it('accepts the unwrapped { nodes, edges } shape identically', () => {
    const wrapped = normalizeGraph(singleClusterGolden);
    const unwrapped = normalizeGraph(singleClusterGolden.elements);
    expect(unwrapped.elements).toEqual(wrapped.elements);
    expect(unwrapped.errors).toEqual([]);
  });

  it('tolerates flat (non-data-wrapped) entries', () => {
    const raw = {
      nodes: [{ id: 'a', name: 'A', type: 'pod', labels: {} }],
      edges: [],
    };
    const result = normalizeGraph(raw);
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]?.data.kind).toBe('pod');
    expect(result.elements[0]?.data.label).toBe('A');
  });

  it('falls back label to id when name is missing', () => {
    const raw = { elements: { nodes: [{ data: { id: 'x', type: 'pod', labels: {} } }], edges: [] } };
    const result = normalizeGraph(raw);
    expect(result.elements[0]?.data.label).toBe('x');
  });

  it('skips nodes missing id or type', () => {
    const raw = {
      elements: {
        nodes: [{ data: { type: 'pod' } }, { data: { id: 'x' } }, { data: { id: 'ok', type: 'pod' } }],
        edges: [],
      },
    };
    const result = normalizeGraph(raw);
    expect(result.elements).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
  });

  it('drops edges with unknown endpoints', () => {
    const raw = {
      elements: {
        nodes: [{ data: { id: 'a', type: 'pod' } }],
        edges: [{ data: { id: 'e1', source: 'a', target: 'ghost', type: 'pod-to-node' } }],
      },
    };
    const result = normalizeGraph(raw);
    expect(result.elements).toHaveLength(1);
    expect(result.errors).toContain('edges[0] references unknown node id');
  });

  it('rejects a duplicate node id into errors and keeps the first copy', () => {
    // cytoscape would silently first-wins-dedupe the second copy; the boundary must
    // surface the inconsistency instead of letting the differ flip-flop on it.
    const raw = {
      elements: {
        nodes: [{ data: { id: 'x', type: 'pod', name: 'first' } }, { data: { id: 'x', type: 'pod', name: 'second' } }],
        edges: [],
      },
    };
    const result = normalizeGraph(raw);
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]?.data.label).toBe('first');
    expect(result.errors).toContain('nodes[1] duplicate id "x"');
  });

  it('rejects a duplicate edge id into errors and keeps the first copy', () => {
    const raw = {
      elements: {
        nodes: [{ data: { id: 'a', type: 'pod' } }, { data: { id: 'b', type: 'pod' } }],
        edges: [
          { data: { id: 'e', source: 'a', target: 'b', type: 'pod-calls-pod' } },
          { data: { id: 'e', source: 'b', target: 'a', type: 'pod-calls-pod' } },
        ],
      },
    };
    const result = normalizeGraph(raw);
    const edges = result.elements.filter((el) => el.group === 'edges');
    expect(edges).toHaveLength(1);
    expect(edges[0]?.data.source).toBe('a');
    expect(result.errors).toContain('edges[1] duplicate id "e"');
  });

  it('preserves unknown kind / edgeType strings (forward-compat)', () => {
    const raw = {
      elements: {
        nodes: [{ data: { id: 'cr1', type: 'customresource' } }, { data: { id: 'cr2', type: 'pod' } }],
        edges: [{ data: { id: 'e', source: 'cr1', target: 'cr2', type: 'future-relation' } }],
      },
    };
    const result = normalizeGraph(raw);
    expect(result.errors).toEqual([]);
    expect(result.elements[0]?.data.kind).toBe('customresource');
    expect(result.elements[2]?.data.edgeType).toBe('future-relation');
  });

  it('reports missing nodes/edges arrays', () => {
    const result = normalizeGraph({ elements: {} });
    expect(result.errors).toContain('payload.nodes is missing or not an array');
    expect(result.errors).toContain('payload.edges is missing or not an array');
  });

  it('normalizes an external node with an embedded :// id (preserved verbatim, no ipAddress)', () => {
    const rawExternalUrl = {
      apiVersion: 'v1',
      clusters: ['cluster-alpha'],
      elements: {
        nodes: [
          {
            data: {
              id: 'cluster-alpha/p1',
              name: 'checkout',
              type: 'pod',
              labels: { cluster: 'cluster-alpha', namespace: 'shop' },
            },
          },
          {
            data: {
              id: 'external/http://api.example.com',
              name: 'http://api.example.com',
              type: 'external',
              labels: {},
            },
          },
        ],
        edges: [
          {
            data: {
              id: '5bca0ff4-9abc-5d57-8ef2-2c7b949add06',
              type: 'pod-calls-pod',
              source: 'cluster-alpha/p1',
              target: 'external/http://api.example.com',
              labels: { cluster: 'cluster-alpha' },
            },
          },
        ],
      },
    };
    const result = normalizeGraph(rawExternalUrl);
    expect(result.errors).toEqual([]);
    expect(result.elements).toHaveLength(3);

    const ext = result.elements.find((e) => e.data.id === 'external/http://api.example.com');
    expect(ext?.group).toBe('nodes');
    expect(ext?.data.kind).toBe('external');
    expect(ext?.data.id).toBe('external/http://api.example.com'); // embedded :// preserved verbatim
    expect(ext?.data.label).toBe('http://api.example.com');
    expect(ext?.data.ipAddress).toBeUndefined();

    const edge = result.elements.find((e) => e.data.id === '5bca0ff4-9abc-5d57-8ef2-2c7b949add06');
    expect(edge?.group).toBe('edges');
    expect(edge?.data.edgeType).toBe('pod-calls-pod');
  });

  it("normalizes the 'external' missing-UID-fallback node as an edge source", () => {
    const rawFallback = {
      apiVersion: 'v1',
      clusters: ['cluster-alpha'],
      elements: {
        nodes: [
          {
            data: {
              id: 'cluster-alpha/p1',
              name: 'checkout',
              type: 'pod',
              labels: { cluster: 'cluster-alpha', namespace: 'shop' },
            },
          },
          { data: { id: 'external/admin', name: 'admin', type: 'external', labels: {} } },
        ],
        edges: [
          {
            data: {
              id: '93a2f25a-b472-54da-b8d2-55398dde8f8f',
              type: 'pod-calls-pod',
              source: 'external/admin',
              target: 'cluster-alpha/p1',
              labels: {},
            },
          },
        ],
      },
    };
    const result = normalizeGraph(rawFallback);
    expect(result.errors).toEqual([]);

    const external = result.elements.find((e) => e.data.id === 'external/admin');
    expect(external?.data.kind).toBe('external');
    expect(external?.data.label).toBe('admin');
    expect(external?.data.id).toBe('external/admin');
    expect(external?.data.ipAddress).toBeUndefined();

    // external-as-source must not be dropped or have its endpoints reordered.
    const edge = result.elements.find((e) => e.data.id === '93a2f25a-b472-54da-b8d2-55398dde8f8f');
    expect(edge?.data.source).toBe('external/admin');
    expect(edge?.data.target).toBe('cluster-alpha/p1');
  });

  it('normalizes the service golden payload (service node + service-selects-pod edge)', () => {
    const rawService = {
      apiVersion: 'v1',
      clusters: ['cluster-alpha'],
      elements: {
        nodes: [
          {
            data: {
              id: 'cluster-alpha/p1',
              name: 'checkout',
              type: 'pod',
              labels: { cluster: 'cluster-alpha', namespace: 'shop' },
            },
          },
          {
            data: {
              id: 'cluster-alpha/shop/payments',
              name: 'payments',
              type: 'service',
              ipaddress: ['10.0.0.5'],
              labels: { cluster: 'cluster-alpha', namespace: 'shop' },
            },
          },
          {
            data: {
              id: 'cluster-alpha/pay0',
              name: 'payments-0',
              type: 'pod',
              labels: { cluster: 'cluster-alpha', namespace: 'shop' },
            },
          },
        ],
        edges: [
          {
            data: {
              id: '8c67d50f-d94a-5518-9a04-6a9ccd8f5711',
              type: 'pod-calls-pod',
              source: 'cluster-alpha/p1',
              target: 'cluster-alpha/shop/payments',
              labels: { cluster: 'cluster-alpha' },
            },
          },
          {
            data: {
              id: 'c979a62f-33f8-5f78-a89a-03770c01c3cd',
              type: 'service-selects-pod',
              source: 'cluster-alpha/shop/payments',
              target: 'cluster-alpha/pay0',
              labels: { namespace: 'shop' },
            },
          },
        ],
      },
    };
    const result = normalizeGraph(rawService);
    expect(result.errors).toEqual([]);
    expect(result.elements).toHaveLength(5);

    const service = result.elements.find((e) => e.data.id === 'cluster-alpha/shop/payments');
    expect(service?.data.kind).toBe('service');
    expect(service?.data.ipAddress).toEqual(['10.0.0.5']);

    const callsEdge = result.elements.find((e) => e.data.id === '8c67d50f-d94a-5518-9a04-6a9ccd8f5711');
    expect(callsEdge?.data.edgeType).toBe('pod-calls-pod');
    expect(callsEdge?.data.target).toBe('cluster-alpha/shop/payments');

    const selectsEdge = result.elements.find((e) => e.data.id === 'c979a62f-33f8-5f78-a89a-03770c01c3cd');
    expect(selectsEdge?.data.edgeType).toBe('service-selects-pod');
    expect(selectsEdge?.data.labels).toEqual({ namespace: 'shop' });
  });

  // ── Service / PVC ArgoCD `application` passthrough (backend D6 enrichment) ──
  // The backend now resolves an ArgoCD application for service / pvc leaves too (from
  // the annotation tracking-id) and nests them under their application group. normalize
  // passes that `application` through on those leaves exactly as it does for pods —
  // `containers` / `owner` remain pod-only.
  describe('service / pvc application passthrough (backend D6)', () => {
    const leaf = (type: string, extra: Record<string, unknown>): unknown => ({
      elements: {
        nodes: [{ data: { id: `prod/${type}1`, name: `${type}1`, type, labels: { namespace: 'shop' }, ...extra } }],
        edges: [],
      },
    });
    const dataOf = (raw: unknown): cytoscape.NodeDataDefinition | undefined =>
      normalizeGraph(raw).elements.find((e) => e.data.id !== undefined)?.data;

    it('passes a service node application through verbatim', () => {
      expect(dataOf(leaf('service', { application: 'mongodb' }))?.application).toBe('mongodb');
    });

    it('passes a pvc node application through verbatim', () => {
      expect(dataOf(leaf('pvc', { application: 'mongodb' }))?.application).toBe('mongodb');
    });

    it('omits application on a service node with no application', () => {
      const d = dataOf(leaf('service', {}));
      expect(d !== undefined && 'application' in d).toBe(false);
    });

    it('omits application on a service node whose application is not a string', () => {
      const d = dataOf(leaf('service', { application: 42 }));
      expect(d !== undefined && 'application' in d).toBe(false);
    });

    it('never carries containers / owner onto a service leaf (those stay pod-only)', () => {
      const d = dataOf(
        leaf('service', {
          application: 'mongodb',
          containers: [{ name: 'c', image: 'r/c:1' }],
          owner: { kind: 'X', name: 'y' },
        })
      );
      expect(d?.application).toBe('mongodb');
      expect(d !== undefined && 'containers' in d).toBe(false);
      expect(d !== undefined && 'owner' in d).toBe(false);
    });
  });

  it('passes backend compound parents through and colours cluster containers (no synthesis)', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster:demo', type: 'cluster', name: 'demo' } },
          { data: { id: 'demo/node-a', type: 'node', name: 'node-a', parent: 'cluster:demo' } },
          {
            data: {
              id: 'demo/p1',
              type: 'pod',
              name: 'web',
              parent: 'demo/node-a',
              labels: { cluster: 'demo', namespace: 'shop' },
            },
          },
          { data: { id: 'external/ext', type: 'external', name: 'ext' } },
        ],
        edges: [],
      },
    };
    const { elements, errors } = normalizeGraph(raw);
    expect(errors).toEqual([]);

    const byId = new Map(elements.map((e) => [e.data.id as string, e.data as Record<string, unknown>]));
    // Cluster container is recognised and assigned the FIXED per-kind cluster colour.
    expect(byId.get('cluster:demo')?.isCluster).toBe(true);
    expect(byId.get('cluster:demo')?.clusterColor).toBe(CLUSTER_COLOR);
    // Cluster label is the bare name; the canvas kind prefix is render-only (stylesheet).
    expect(byId.get('cluster:demo')?.label).toBe('demo');
    expect(byId.get('cluster:demo')?.cluster).toBe('demo');
    // A non-decorative leaf keeps its unprefixed name as label.
    expect(byId.get('demo/p1')?.label).toBe('web');
    // The backend's `parent` is passed through verbatim — no panel-side synthesis.
    expect(byId.get('demo/node-a')?.parent).toBe('cluster:demo');
    expect(byId.get('demo/p1')?.parent).toBe('demo/node-a');
    // Top-level nodes (no parent) stay top-level.
    expect(byId.get('external/ext')?.parent).toBeUndefined();
    expect(byId.get('external/ext')?.isCluster).toBeUndefined();
    // Exactly the four input nodes — nothing invented.
    expect(elements.filter((e) => e.group === 'nodes')).toHaveLength(4);

    // The decorative cluster is NON-selectable: tapping it deselects like a background
    // tap and its `+/-` cue never surfaces (collapse is dbltap-driven instead). Other
    // compound parents (k8s node, controller) stay selectable (cytoscape default).
    const elById = new Map(elements.map((e) => [e.data.id as string, e]));
    expect(elById.get('cluster:demo')?.selectable).toBe(false);
    expect(elById.get('demo/node-a')?.selectable).toBeUndefined();
    expect(elById.get('demo/p1')?.selectable).toBeUndefined();
  });

  it('renders a flat payload flat — no parents, no cluster containers', () => {
    const { elements } = normalizeGraph(singleClusterGolden);
    expect(elements.every((e) => e.data.parent === undefined)).toBe(true);
    expect(elements.some((e) => (e.data as Record<string, unknown>).isCluster === true)).toBe(false);
  });

  // ── Backend D6 decorative group nodes (namespace / application / controller) ──
  describe('backend group-node recognition (D4)', () => {
    const byId = (raw: unknown): Map<string, cytoscape.NodeDataDefinition> =>
      new Map(normalizeGraph(raw).elements.map((e) => [e.data.id as string, e.data as cytoscape.NodeDataDefinition]));
    const elById = (raw: unknown): Map<string, cytoscape.ElementDefinition> =>
      new Map(normalizeGraph(raw).elements.map((e) => [e.data.id as string, e]));

    it('normalizes a namespace group node: isNamespace + accent, no kind, selectable (cue surface)', () => {
      const raw = {
        elements: {
          nodes: [
            { data: { id: 'cluster/prod', type: 'cluster', name: 'prod' } },
            {
              data: { id: 'prod/namespace/shop', type: 'namespace', name: 'shop', parent: 'cluster/prod', labels: {} },
            },
          ],
          edges: [],
        },
      };
      const d = byId(raw).get('prod/namespace/shop');
      expect(d?.isNamespace).toBe(true);
      expect(d?.namespace).toBe('shop');
      expect(d?.namespaceColor).toBe(NAMESPACE_COLOR); // fixed per-kind colour
      expect(d?.label).toBe('shop'); // bare name; canvas `Namespace: ` prefix is render-only
      expect(d?.kind).toBeUndefined();
      expect(d?.parent).toBe('cluster/prod'); // passthrough verbatim
      expect(elById(raw).get('prod/namespace/shop')?.selectable).toBeUndefined(); // selectable (no selectable:false)
    });

    it('normalizes an application group node: isApplication + accent, no kind, selectable (cue surface)', () => {
      const raw = {
        elements: {
          nodes: [
            {
              data: {
                id: 'prod/namespace/shop/application/checkout',
                type: 'application',
                name: 'checkout',
                parent: 'prod/namespace/shop',
                labels: {},
              },
            },
          ],
          edges: [],
        },
      };
      const d = byId(raw).get('prod/namespace/shop/application/checkout');
      expect(d?.isApplication).toBe(true);
      expect(d?.application).toBe('checkout');
      expect(d?.applicationColor).toBe(APPLICATION_COLOR); // fixed per-kind colour
      expect(d?.label).toBe('checkout'); // bare name; canvas `Release Unit: ` prefix is render-only
      expect(d?.kind).toBeUndefined();
      expect(d?.parent).toBe('prod/namespace/shop');
      expect(elById(raw).get('prod/namespace/shop/application/checkout')?.selectable).toBeUndefined(); // selectable (no selectable:false)
    });

    it('normalizes a controller group node: isController, kind from child pod owner.kind, selectable:false', () => {
      const ctrlId = 'prod/namespace/shop/application/mongo/controller/StatefulSet/mongo';
      const raw = {
        elements: {
          nodes: [
            { data: { id: 'cluster/prod', type: 'cluster', name: 'prod' } },
            { data: { id: ctrlId, type: 'controller', name: 'mongo', parent: 'cluster/prod', labels: {} } },
            {
              data: {
                id: 'prod/p1',
                type: 'pod',
                name: 'mongo-0',
                parent: ctrlId,
                owner: { kind: 'StatefulSet', name: 'mongo' },
                labels: { cluster: 'prod', namespace: 'shop' },
              },
            },
          ],
          edges: [],
        },
      };
      const d = byId(raw).get(ctrlId);
      expect(d?.isController).toBe(true);
      expect(d?.kind).toBe('statefulset'); // lowercased child owner.kind
      expect(d?.parent).toBe('cluster/prod');
      // A controller is detail-eligible (resolveSelectedNode opens it) so it MUST stay
      // selectable — unlike the purely-decorative cluster/namespace/application groups.
      // selectable:false would make the canvas tap/cxttap gate drop every controller click.
      expect(elById(raw).get(ctrlId)?.selectable).toBeUndefined();
    });
  });

  // ── New backend edges pass through (D6) ──
  it('maps the new backend edges pod-to-node and pvc-to-netapp-aggr (not the unknown fallback)', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster/prod', type: 'cluster', name: 'prod' } },
          { data: { id: 'prod/node-a', type: 'node', name: 'node-a', parent: 'cluster/prod' } },
          { data: { id: 'prod/p1', type: 'pod', name: 'p1', parent: 'cluster/prod', labels: { node: 'prod/node-a' } } },
          { data: { id: 'prod/pvc1', type: 'pvc', name: 'pvc1', parent: 'cluster/prod' } },
          {
            data: {
              id: 'netapp/ontap-prod/aggr/aggr1',
              type: 'netapp-aggr',
              name: 'aggr1',
              labels: { ontap_cluster: 'ontap-prod', node: 'ontap-prod-01' },
            },
          },
        ],
        edges: [
          { data: { id: 'e1', type: 'pod-to-node', source: 'prod/p1', target: 'prod/node-a' } },
          {
            data: { id: 'e2', type: 'pvc-to-netapp-aggr', source: 'prod/pvc1', target: 'netapp/ontap-prod/aggr/aggr1' },
          },
        ],
      },
    };
    const { elements, errors } = normalizeGraph(raw);
    expect(errors).toEqual([]);
    const edges = elements.filter((e) => e.group === 'edges');
    expect(edges.map((e) => (e.data as cytoscape.EdgeDataDefinition).edgeType).sort()).toEqual([
      'pod-to-node',
      'pvc-to-netapp-aggr',
    ]);
  });

  it('does not invent a pvc-to-netapp-aggr edge for a PVC that joined no aggregate', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster/prod', type: 'cluster', name: 'prod' } },
          { data: { id: 'prod/pvc1', type: 'pvc', name: 'pvc1', parent: 'prod/namespace/db' } },
        ],
        edges: [],
      },
    };
    const { elements } = normalizeGraph(raw);
    expect(elements.some((e) => e.group === 'edges')).toBe(false);
  });

  // ── The physical NetApp storage chain ──
  describe('netapp storage nodes', () => {
    const byId = (raw: unknown): Map<string, cytoscape.NodeDataDefinition> =>
      new Map(normalizeGraph(raw).elements.map((e) => [e.data.id as string, e.data as cytoscape.NodeDataDefinition]));

    const netappGraph = (aggrData: Record<string, unknown>, nodeData: Record<string, unknown> = {}): unknown => ({
      elements: {
        nodes: [
          { data: { id: 'storage-cluster/ontap-prod', type: 'storage-cluster', name: 'ontap-prod' } },
          {
            data: {
              id: 'netapp/ontap-prod/ontap-prod-01',
              type: 'netapp-node',
              name: 'ontap-prod-01',
              parent: 'storage-cluster/ontap-prod',
              labels: { ontap_cluster: 'ontap-prod' },
              ...nodeData,
            },
          },
          {
            data: {
              id: 'netapp/ontap-prod/aggr/aggr1',
              type: 'netapp-aggr',
              name: 'aggr1',
              parent: 'netapp/ontap-prod/ontap-prod-01',
              labels: { ontap_cluster: 'ontap-prod', node: 'ontap-prod-01' },
              ...aggrData,
            },
          },
        ],
        edges: [],
      },
    });

    it('normalizes a netapp-aggr leaf with health, usage and a derived usageRatio', () => {
      const aggr = byId(netappGraph({ health: 'online', usage: { used_bytes: 7e11, capacity_bytes: 1e12 } })).get(
        'netapp/ontap-prod/aggr/aggr1'
      ) as Record<string, unknown> | undefined;
      expect(aggr?.kind).toBe('netapp-aggr');
      expect(aggr?.health).toBe('online');
      expect(aggr?.usage).toEqual({ usedBytes: 7e11, capacityBytes: 1e12 });
      expect(aggr?.usageRatio).toBeCloseTo(0.7);
      expect(aggr?.status).toBeUndefined();
      // Its parent is a REAL node, not a decorative group — nesting comes straight from
      // the backend's data.parent and the panel assigns no identity of its own.
      expect(aggr?.parent).toBe('netapp/ontap-prod/ontap-prod-01');
      expect(aggr?.label).toBe('aggr1');
    });

    it('keeps netapp-node a kind-ful selectable node even though it is a compound parent', () => {
      const els = normalizeGraph(netappGraph({}, { health: 'degraded' })).elements;
      const node = els.find((e) => e.data.id === 'netapp/ontap-prod/ontap-prod-01');
      expect((node?.data as Record<string, unknown>).kind).toBe('netapp-node');
      expect((node?.data as Record<string, unknown>).health).toBe('degraded');
      // selectable is only ever set (to false) on the decorative groups.
      expect(node?.selectable).toBeUndefined();
    });

    it('normalizes storage-cluster as a non-selectable decorative group (never a K8s cluster)', () => {
      const els = normalizeGraph(netappGraph({})).elements;
      const group = els.find((e) => e.data.id === 'storage-cluster/ontap-prod');
      const data = group?.data as Record<string, unknown>;
      expect(data.isStorageCluster).toBe(true);
      expect(data.storageCluster).toBe('ontap-prod');
      expect(typeof data.storageClusterColor).toBe('string');
      expect(data.kind).toBeUndefined();
      // NOT flagged as a K8s cluster: that flag drives the Clusters legend/palette.
      expect(data.isCluster).toBeUndefined();
      expect(group?.selectable).toBe(false);
    });

    it('passes an unknown health value through rather than dropping or normalizing it', () => {
      const aggr = byId(netappGraph({ health: 'rebuilding' })).get('netapp/ontap-prod/aggr/aggr1') as
        Record<string, unknown> | undefined;
      expect(aggr?.health).toBe('rebuilding');
    });

    it('omits health entirely when absent — never defaults it to degraded', () => {
      const aggr = byId(netappGraph({})).get('netapp/ontap-prod/aggr/aggr1') as Record<string, unknown> | undefined;
      expect(aggr !== undefined && 'health' in aggr).toBe(false);
    });

    it.each([
      ['capacity only', { capacity_bytes: 1000 }, { capacityBytes: 1000 }],
      ['used only', { used_bytes: 400 }, { usedBytes: 400 }],
      ['one half invalid', { used_bytes: 'lots', capacity_bytes: 1000 }, { capacityBytes: 1000 }],
      ['negative used', { used_bytes: -1, capacity_bytes: 1000 }, { capacityBytes: 1000 }],
    ])('keeps a partial usage reading (%s) and derives no ratio from it', (_label, usage, expected) => {
      const aggr = byId(netappGraph({ usage })).get('netapp/ontap-prod/aggr/aggr1') as
        Record<string, unknown> | undefined;
      expect(aggr?.usage).toEqual(expected);
      expect(aggr !== undefined && 'usageRatio' in aggr).toBe(false);
    });

    it('derives no ratio when capacity is zero (never divides by it)', () => {
      const aggr = byId(netappGraph({ usage: { used_bytes: 0, capacity_bytes: 0 } })).get(
        'netapp/ontap-prod/aggr/aggr1'
      ) as Record<string, unknown> | undefined;
      expect(aggr?.usage).toEqual({ usedBytes: 0, capacityBytes: 0 });
      expect(aggr !== undefined && 'usageRatio' in aggr).toBe(false);
    });

    it('clamps a ratio above 1 (used can legitimately exceed capacity)', () => {
      const aggr = byId(netappGraph({ usage: { used_bytes: 1200, capacity_bytes: 1000 } })).get(
        'netapp/ontap-prod/aggr/aggr1'
      ) as Record<string, unknown> | undefined;
      expect(aggr?.usageRatio).toBe(1);
    });

    it.each([
      ['a string', 'lots'],
      ['an array', [1, 2]],
      ['null', null],
    ])('drops a usage that is %s outright, keeping the rest of the node', (_label, usage) => {
      const aggr = byId(netappGraph({ usage })).get('netapp/ontap-prod/aggr/aggr1') as
        Record<string, unknown> | undefined;
      expect(aggr?.kind).toBe('netapp-aggr');
      expect(aggr !== undefined && 'usage' in aggr).toBe(false);
      expect(aggr !== undefined && 'usageRatio' in aggr).toBe(false);
    });

    it('gives a PVC the same usage treatment as an aggregate, plus its storageclass name', () => {
      const raw = {
        elements: {
          nodes: [
            {
              data: {
                id: 'prod/db/data-0',
                type: 'pvc',
                name: 'data-0',
                storageclass: 'netapp-nas',
                usage: { used_bytes: 5368709120, capacity_bytes: 10737418240 },
                labels: { cluster: 'prod', namespace: 'db' },
              },
            },
          ],
          edges: [],
        },
      };
      const pvc = byId(raw).get('prod/db/data-0') as Record<string, unknown> | undefined;
      expect(pvc?.storageclass).toBe('netapp-nas');
      expect(pvc?.usage).toEqual({ usedBytes: 5368709120, capacityBytes: 10737418240 });
      expect(pvc?.usageRatio).toBeCloseTo(0.5);
      // The name is a plain attribute — no storageclass node or edge is invented for it.
      expect(normalizeGraph(raw).elements.some((e) => e.group === 'edges')).toBe(false);
    });

    it('omits storageclass when the backend sent none', () => {
      const raw = { elements: { nodes: [{ data: { id: 'prod/db/x', type: 'pvc', name: 'x' } }], edges: [] } };
      const pvc = byId(raw).get('prod/db/x') as Record<string, unknown> | undefined;
      expect(pvc !== undefined && 'storageclass' in pvc).toBe(false);
    });

    it('maps hardware and perf field-by-field and does not pad absence', () => {
      const partial = byId(
        netappGraph(
          {},
          {
            hardware: { model: 'AFF-A400' },
            perf: { cpu_busy_pct: 41.2 },
            health: 'degraded',
          }
        )
      ).get('netapp/ontap-prod/ontap-prod-01') as Record<string, unknown> | undefined;
      expect(partial?.hardware).toEqual({ model: 'AFF-A400' });
      expect(partial?.perf).toEqual({ cpuBusyPct: 41.2 });
      expect(partial?.health).toBe('degraded');
      expect(partial !== undefined && 'serial' in (partial.hardware as object)).toBe(false);

      const absent = byId(netappGraph({})).get('netapp/ontap-prod/ontap-prod-01') as
        Record<string, unknown> | undefined;
      expect(absent !== undefined && 'hardware' in absent).toBe(false);
      expect(absent !== undefined && 'perf' in absent).toBe(false);
      expect(absent !== undefined && 'health' in absent).toBe(false);
    });

    it('does not let perf readings change health or status', () => {
      const withPerf = byId(netappGraph({}, { health: 'online', perf: { cpu_busy_pct: 99.9, total_ops: 1e6 } })).get(
        'netapp/ontap-prod/ontap-prod-01'
      ) as Record<string, unknown> | undefined;
      const without = byId(netappGraph({}, { health: 'online' })).get('netapp/ontap-prod/ontap-prod-01') as
        Record<string, unknown> | undefined;
      expect(withPerf?.health).toBe(without?.health);
      expect(withPerf?.status).toBe(without?.status);
      expect(withPerf?.worstStatus).toBe(without?.worstStatus);
    });

    it('drops invalid hardware / perf fields without inventing placeholders', () => {
      const node = byId(
        netappGraph(
          {},
          {
            hardware: { model: 'AFF-A400', serial: 12 },
            perf: { cpu_busy_pct: 'hot', total_ops: 10 },
          }
        )
      ).get('netapp/ontap-prod/ontap-prod-01') as Record<string, unknown> | undefined;
      expect(node?.hardware).toEqual({ model: 'AFF-A400' });
      expect(node?.perf).toEqual({ totalOps: 10 });
    });
  });

  describe('storage-flow edges and netapp-svm', () => {
    const payload = {
      elements: {
        nodes: [
          { data: { id: 'storage-cluster/ontap-prod', type: 'storage-cluster', name: 'ontap-prod' } },
          {
            data: {
              id: 'netapp/ontap-prod/svm/svm_shop',
              name: 'svm_shop',
              type: 'netapp-svm',
              parent: 'storage-cluster/ontap-prod',
              labels: { ontap_cluster: 'ontap-prod' },
            },
          },
          { data: { id: 'netapp/ontap-prod/ontap-prod-01', name: 'ontap-prod-01', type: 'netapp-node' } },
          { data: { id: 'netapp/ontap-prod/aggr/aggr1', name: 'aggr1', type: 'netapp-aggr' } },
          { data: { id: 'pvc/data-mongo-0', name: 'data-mongo-0', type: 'pvc' } },
          { data: { id: 'pod/mongo-0', name: 'mongo-0', type: 'pod' } },
          { data: { id: 'node/worker-0', name: 'worker-0', type: 'node' } },
        ],
        edges: [
          {
            data: {
              id: 'sf-na',
              type: 'storage-flow',
              source: 'netapp/ontap-prod/ontap-prod-01',
              target: 'netapp/ontap-prod/aggr/aggr1',
              labels: { tier: 'node-aggr' },
              metrics: { read_bytes_per_sec: 6000000, write_bytes_per_sec: 1048576 },
            },
          },
          {
            data: {
              id: 'sf-as',
              type: 'storage-flow',
              source: 'netapp/ontap-prod/aggr/aggr1',
              target: 'netapp/ontap-prod/svm/svm_shop',
              labels: { tier: 'aggr-svm' },
              metrics: { read_bytes_per_sec: 5999999, write_bytes_per_sec: 1048576 },
            },
          },
          {
            data: {
              id: 'sf-sp',
              type: 'storage-flow',
              source: 'netapp/ontap-prod/svm/svm_shop',
              target: 'pvc/data-mongo-0',
              labels: { tier: 'svm-pvc' },
              metrics: {
                read_bytes_per_sec: 5242880,
                write_bytes_per_sec: 1048576,
                read_latency_us: 830,
                max_iops: 5000,
              },
            },
          },
          {
            data: {
              id: 'sf-pp',
              type: 'storage-flow',
              source: 'pvc/data-mongo-0',
              target: 'pod/mongo-0',
              labels: { tier: 'pvc-pod', attribution: 'split' },
              metrics: { read_ops: 100, read_bytes_per_sec: 5242880 },
            },
          },
          {
            data: {
              id: 'sf-pn',
              type: 'storage-flow',
              source: 'pod/mongo-0',
              target: 'node/worker-0',
              labels: { tier: 'pod-node' },
              metrics: { read_bytes_per_sec: 5242880, write_bytes_per_sec: 1048576 },
            },
          },
        ],
      },
    };

    it('maps netapp-svm and all five storage-flow tiers without falling into unknown-type', () => {
      const { elements, errors } = normalizeGraph(payload);
      expect(errors).toEqual([]);
      const svm = elements.find((e) => e.data.id === 'netapp/ontap-prod/svm/svm_shop')?.data as
        cytoscape.NodeDataDefinition | undefined;
      expect(svm?.kind).toBe('netapp-svm');
      expect(svm?.parent).toBe('storage-cluster/ontap-prod');
      const edges = elements.filter((e) => e.group === 'edges').map((e) => e.data as cytoscape.EdgeDataDefinition);
      expect(edges.map((e) => e.labels?.tier).sort()).toEqual(
        ['aggr-svm', 'node-aggr', 'pod-node', 'pvc-pod', 'svm-pvc'].sort()
      );
      expect(edges.every((e) => e.edgeType === 'storage-flow')).toBe(true);
    });

    it('keeps attribution=split and the measured value as-is', () => {
      const { elements } = normalizeGraph(payload);
      const split = elements.find((e) => e.data.id === 'sf-pp')?.data as cytoscape.EdgeDataDefinition | undefined;
      expect(split?.labels?.attribution).toBe('split');
      expect(split?.metrics && !('rate' in split.metrics) ? split.metrics.readOps : undefined).toBe(100);
      expect(split?.metrics && !('rate' in split.metrics) ? split.metrics.readBytesPerSec : undefined).toBe(5242880);
    });

    it('does not invent latency or ceiling on non-svm-pvc tiers', () => {
      const { elements } = normalizeGraph(payload);
      const hop = (id: string): cytoscape.EdgeIoMetrics | undefined => {
        const metrics = (elements.find((e) => e.data.id === id)?.data as cytoscape.EdgeDataDefinition).metrics;
        return metrics !== undefined && !('rate' in metrics) ? metrics : undefined;
      };
      expect(hop('sf-sp')?.readLatencyUs).toBe(830);
      expect(hop('sf-sp')?.maxIops).toBe(5000);
      expect(hop('sf-na')?.readLatencyUs).toBeUndefined();
      expect(hop('sf-na')?.maxIops).toBeUndefined();
      expect(hop('sf-pn')?.maxIops).toBeUndefined();
    });
  });

  // The K8s node's Ready condition — a THIRD status axis, independent of the panel's own
  // `status` (alert severity) and `worstStatus` (what a collapsed box hides).
  describe('K8s node ready_status', () => {
    const withReadyStatus = (readyStatus: unknown): Record<string, unknown> | undefined => {
      const data: Record<string, unknown> = { id: 'prod/worker-0', type: 'node', name: 'worker-0' };
      if (readyStatus !== undefined) {
        data.ready_status = readyStatus;
      }
      const { elements } = normalizeGraph({ elements: { nodes: [{ data }], edges: [] } });
      return elements.find((e) => e.data.id === 'prod/worker-0')?.data;
    };

    it.each(['Ready', 'NotReady', 'Unknown'])('carries %s through under the panel field name', (value) => {
      expect(withReadyStatus(value)?.readyStatus).toBe(value);
    });

    it('omits the field entirely when the backend sent none — absence is NOT Unknown', () => {
      // The backend reserves the literal "Unknown" for the genuine Kubernetes state where
      // the kubelet stopped reporting. A node whose Ready condition was never scraped must
      // stay blank, or a monitoring gap would render as a cluster-wide kubelet outage.
      const node = withReadyStatus(undefined);
      expect(node !== undefined && 'readyStatus' in node).toBe(false);
    });

    it('omits an empty string rather than rendering a blank row', () => {
      const node = withReadyStatus('');
      expect(node !== undefined && 'readyStatus' in node).toBe(false);
    });

    it('drops a non-string value without sinking the node', () => {
      const node = withReadyStatus(false);
      expect(node?.kind).toBe('node');
      expect(node !== undefined && 'readyStatus' in node).toBe(false);
    });

    it('passes an unrecognised value through rather than normalizing it away', () => {
      // Same tolerance as `health`: an upstream that grows a fourth condition value must
      // surface it, not vanish.
      expect(withReadyStatus('SchedulingDisabled')?.readyStatus).toBe('SchedulingDisabled');
    });

    it('leaves the panel status axes untouched', () => {
      // Ready is Kubernetes' word about the kubelet; `status` / `worstStatus` are the
      // panel's words about alert severity. A NotReady node with no alerts must colour
      // exactly as it did before — comparing against the same node WITHOUT ready_status
      // pins that rather than restating whatever the status default happens to be.
      const { readyStatus, ...withReady } = withReadyStatus('NotReady') ?? {};
      expect(readyStatus).toBe('NotReady');
      expect(withReady).toEqual(withReadyStatus(undefined));
    });
  });

  describe('node alerts', () => {
    const withAlerts = (alerts: unknown): ReturnType<typeof normalizeGraph> =>
      normalizeGraph({
        elements: {
          nodes: [{ data: { id: 'p1', type: 'pod', name: 'mongo-0', alerts } }],
          edges: [],
        },
      });

    it('parses time_records onto NodeAlert.timeRecords (ascending), keeping pod/service/id', () => {
      const { elements, errors } = withAlerts([
        {
          pod: 'mongo-0',
          service: 'mongo',
          name: 'HighMem',
          severity: 'critical',
          time_records: [1717500300, 1717500000],
          id: 'a1',
        },
        { name: 'Restart', severity: 'warning', time_records: [1717500300] },
      ]);
      expect(errors).toEqual([]);
      expect(elements[0]?.data.alerts).toEqual([
        {
          pod: 'mongo-0',
          service: 'mongo',
          name: 'HighMem',
          severity: 'critical',
          timeRecords: [1717500000, 1717500300], // sorted ascending
          id: 'a1',
        },
        { name: 'Restart', severity: 'warning', timeRecords: [1717500300] },
      ]);
    });

    it('falls back to a legacy scalar time → single-element timeRecords (epoch 0 valid)', () => {
      const { elements } = withAlerts([
        { name: 'Legacy', severity: 'warning', time: 1717500000 },
        { name: 'Epoch0', severity: 'warning', time: 0 },
      ]);
      expect(elements[0]?.data.alerts).toEqual([
        { name: 'Legacy', severity: 'warning', timeRecords: [1717500000] },
        { name: 'Epoch0', severity: 'warning', timeRecords: [0] },
      ]);
    });

    it('prefers time_records over a legacy scalar time when both are present', () => {
      const { elements } = withAlerts([
        { name: 'both', severity: 'warning', time: 999, time_records: [1717500000, 1717500300] },
      ]);
      expect(elements[0]?.data.alerts).toEqual([
        { name: 'both', severity: 'warning', timeRecords: [1717500000, 1717500300] },
      ]);
    });

    it('falls back to scalar time when time_records is present but all-invalid', () => {
      const { elements } = withAlerts([{ name: 'fb', severity: 'warning', time: 1717500000, time_records: [NaN, -1] }]);
      expect(elements[0]?.data.alerts).toEqual([{ name: 'fb', severity: 'warning', timeRecords: [1717500000] }]);
    });

    it('filters non-finite/negative entries inside time_records and sorts the rest', () => {
      const { elements } = withAlerts([
        { name: 'noisy', severity: 'warning', time_records: [1717500300, -5, NaN, Infinity, 1717500000, 0] },
      ]);
      expect(elements[0]?.data.alerts).toEqual([
        { name: 'noisy', severity: 'warning', timeRecords: [0, 1717500000, 1717500300] },
      ]);
    });

    it('drops alert entries with a bad/missing name or non-string/empty severity, keeping valid ones', () => {
      const { elements } = withAlerts([
        { name: 'ok', severity: 'warning', time_records: [1717500000] },
        { severity: 'critical', time_records: [1717500000] }, // missing name
        { name: 'noSev', time_records: [1717500000] }, // missing severity
        { name: 'emptySev', severity: '', time_records: [1717500000] }, // empty severity string
        { name: 'numSev', severity: 2, time_records: [1717500000] }, // severity not a string
        'nope', // not an object
      ]);
      expect(elements[0]?.data.alerts).toEqual([{ name: 'ok', severity: 'warning', timeRecords: [1717500000] }]);
    });

    it('keeps any non-empty severity string, including custom labels the backend defines', () => {
      const { elements } = withAlerts([
        { name: 'i', severity: 'info', time_records: [1717500000] },
        { name: 'n', severity: 'normal', time_records: [1717500003] }, // not a known tier, kept verbatim
        { name: 'x', severity: 'fatal', time_records: [1717500004] }, // custom label, kept verbatim
        { name: 'p', severity: 'P1', time_records: [1717500005] }, // custom label, kept verbatim
      ]);
      expect(elements[0]?.data.alerts).toEqual([
        { name: 'i', severity: 'info', timeRecords: [1717500000] },
        { name: 'n', severity: 'normal', timeRecords: [1717500003] },
        { name: 'x', severity: 'fatal', timeRecords: [1717500004] },
        { name: 'p', severity: 'P1', timeRecords: [1717500005] },
      ]);
    });

    it('omits the alerts field when absent, empty, or no entry has a valid occurrence time', () => {
      expect(withAlerts(undefined).elements[0]?.data.alerts).toBeUndefined();
      expect(withAlerts([]).elements[0]?.data.alerts).toBeUndefined();
      expect(withAlerts([{ name: 'x', severity: 'warning' }]).elements[0]?.data.alerts).toBeUndefined();
      expect(
        withAlerts([{ name: 'x', severity: 'warning', time_records: [] }]).elements[0]?.data.alerts
      ).toBeUndefined();
      expect(
        withAlerts([{ name: 'x', severity: 'warning', time: -1, time_records: [NaN, -5] }]).elements[0]?.data.alerts
      ).toBeUndefined();
    });

    it('never carries alerts on a cluster container node', () => {
      const { elements } = normalizeGraph({
        elements: {
          nodes: [
            {
              data: {
                id: 'c1',
                type: 'cluster',
                name: 'demo',
                alerts: [{ name: 'x', severity: 'warning', time_records: [1] }],
              },
            },
          ],
          edges: [],
        },
      });
      expect(elements[0]?.data.alerts).toBeUndefined();
    });
  });
});

// ── D8: node worstStatus aggregated via pod-to-node edges ──
describe('normalizeGraph — node worstStatus via pod-to-node edges', () => {
  const dataOf = (raw: unknown, id: string): cytoscape.NodeDataDefinition | undefined =>
    normalizeGraph(raw).elements.find((e) => e.group === 'nodes' && (e.data as cytoscape.NodeDataDefinition).id === id)
      ?.data;
  const k8sNode = (id: string, status?: string) => ({
    data: { id, name: id, type: 'node', parent: 'cluster/prod', ...(status !== undefined ? { status } : {}) },
  });
  const podNode = (id: string, status?: string) => ({
    data: { id, name: id, type: 'pod', parent: 'cluster/prod', ...(status !== undefined ? { status } : {}) },
  });
  const podToNode = (podId: string, nodeId: string) => ({
    data: { id: `e:${podId}:${nodeId}`, type: 'pod-to-node', source: podId, target: nodeId },
  });
  const graph = (
    nodes: Array<{ data: Record<string, unknown> }>,
    edges: Array<{ data: Record<string, unknown> }> = []
  ): unknown => ({
    elements: { nodes: [{ data: { id: 'cluster/prod', name: 'prod', type: 'cluster' } }, ...nodes], edges },
  });

  it('takes the worst of pods reachable via pod-to-node (warning + critical → critical)', () => {
    const raw = graph(
      [k8sNode('node/w0', 'normal'), podNode('pod/a', 'warning'), podNode('pod/b', 'critical')],
      [podToNode('pod/a', 'node/w0'), podToNode('pod/b', 'node/w0')]
    );
    expect(dataOf(raw, 'node/w0')?.worstStatus).toBe('critical');
  });

  it("never downgrades below the node's own status (critical node + normal reachable pod → critical)", () => {
    const raw = graph([k8sNode('node/w0', 'critical'), podNode('pod/a', 'normal')], [podToNode('pod/a', 'node/w0')]);
    expect(dataOf(raw, 'node/w0')?.worstStatus).toBe('critical');
  });

  it('propagates a reachable warning onto a normal node (worst-wins → warning)', () => {
    const raw = graph([k8sNode('node/w0', 'normal'), podNode('pod/a', 'warning')], [podToNode('pod/a', 'node/w0')]);
    expect(dataOf(raw, 'node/w0')?.worstStatus).toBe('warning');
  });

  it('writes worstStatus normal when the node and its reachable pods are all normal (green box, D10)', () => {
    const raw = graph([k8sNode('node/w0', 'normal'), podNode('pod/a', 'normal')], [podToNode('pod/a', 'node/w0')]);
    expect(dataOf(raw, 'node/w0')?.worstStatus).toBe('normal');
  });

  it('writes worstStatus normal for a status-less node with a status-less reachable pod (has info)', () => {
    const raw = graph([k8sNode('node/w0'), podNode('pod/a')], [podToNode('pod/a', 'node/w0')]);
    expect(dataOf(raw, 'node/w0')?.worstStatus).toBe('normal');
  });

  it('omits worstStatus for a node with no status and no reachable pod (no data is not normal)', () => {
    const raw = graph([k8sNode('node/w0')]);
    expect(dataOf(raw, 'node/w0')?.worstStatus).toBeUndefined();
  });
});

// ── D5: controller enrichment (backend emits the group; normalize decorates it) ──
describe('normalizeGraph — controller enrichment', () => {
  const CTRL_ID = 'prod/namespace/shop/application/mongo/controller/StatefulSet/mongo';
  const mongoOwner = { kind: 'StatefulSet', name: 'mongo' };
  const controllerNode = (id = CTRL_ID, name = 'mongo', parent = 'cluster/prod') => ({
    data: { id, name, type: 'controller', parent, labels: {} },
  });
  const childPod = (
    id: string,
    name: string,
    extra: Record<string, unknown> = {},
    owner: { kind: string; name: string } | undefined = mongoOwner,
    controllerId = CTRL_ID
  ) => ({
    data: {
      id,
      name,
      type: 'pod',
      parent: controllerId,
      ...(owner !== undefined ? { owner } : {}),
      labels: { cluster: 'prod', namespace: 'shop' },
      ...extra,
    },
  });
  const enrichGraph = (...pods: Array<{ data: Record<string, unknown> }>): unknown => ({
    elements: {
      nodes: [{ data: { id: 'cluster/prod', name: 'prod', type: 'cluster', labels: {} } }, controllerNode(), ...pods],
      edges: [],
    },
  });
  const controllerOf = (raw: unknown): cytoscape.NodeDataDefinition | undefined =>
    normalizeGraph(raw).elements.find((e) => (e.data as cytoscape.NodeDataDefinition).isController === true)?.data;

  it('derives the controller kind from a child pod owner.kind (lowercased) and flags isController', () => {
    const ctrl = controllerOf(enrichGraph(childPod('prod/p1', 'mongo-0')));
    expect(ctrl?.isController).toBe(true);
    expect(ctrl?.kind).toBe('statefulset');
    expect(ctrl?.label).toBe('mongo');
    expect(ctrl?.parent).toBe('cluster/prod');
  });

  it('does NOT synthesize controllers (an owned pod with no controller group yields none)', () => {
    const raw = {
      elements: {
        nodes: [
          { data: { id: 'cluster/prod', name: 'prod', type: 'cluster', labels: {} } },
          {
            data: {
              id: 'prod/p1',
              name: 'p1',
              type: 'pod',
              parent: 'cluster/prod',
              owner: { kind: 'Deployment', name: 'api' },
              labels: { cluster: 'prod', namespace: 'shop' },
            },
          },
        ],
        edges: [],
      },
    };
    expect(
      normalizeGraph(raw).elements.some((e) => (e.data as cytoscape.NodeDataDefinition).isController === true)
    ).toBe(false);
  });

  it('does NOT synthesize controller-owns-pod edges', () => {
    const owns = normalizeGraph(enrichGraph(childPod('prod/p1', 'mongo-0'))).elements.filter(
      (e) => e.group === 'edges' && (e.data as cytoscape.EdgeDataDefinition).edgeType === 'controller-owns-pod'
    );
    expect(owns).toHaveLength(0);
  });

  describe('worstStatus (worst child-pod status, always written)', () => {
    it('takes the worst child-pod status (warning + critical → critical)', () => {
      const raw = enrichGraph(
        childPod('prod/p1', 'mongo-0', { status: 'warning' }),
        childPod('prod/p2', 'mongo-1', { status: 'critical' })
      );
      expect(controllerOf(raw)?.worstStatus).toBe('critical');
    });

    it('propagates a child warning without any alert (status, not alerts)', () => {
      expect(controllerOf(enrichGraph(childPod('prod/p1', 'mongo-0', { status: 'warning' })))?.worstStatus).toBe(
        'warning'
      );
    });

    it('treats unknown / absent status as normal (drawn green, D10)', () => {
      expect(controllerOf(enrichGraph(childPod('prod/p1', 'mongo-0', { status: 'bogus' })))?.worstStatus).toBe(
        'normal'
      );
      expect(controllerOf(enrichGraph(childPod('prod/p1', 'mongo-0')))?.worstStatus).toBe('normal');
    });
  });

  describe('application / containers aggregation', () => {
    it('aggregates application from the first valued child pod in stable podId order', () => {
      // Raw order p2 (beta) before p1 (alpha) — the podId sort must still pick p1's value.
      const raw = enrichGraph(
        childPod('prod/p2', 'mongo-1', { application: 'beta' }),
        childPod('prod/p1', 'mongo-0', { application: 'alpha' })
      );
      expect(controllerOf(raw)?.application).toBe('alpha');
    });

    it('skips application-less child pods when picking the controller application', () => {
      const raw = enrichGraph(childPod('prod/p1', 'mongo-0'), childPod('prod/p2', 'mongo-1', { application: 'beta' }));
      expect(controllerOf(raw)?.application).toBe('beta');
    });

    it('aggregates the containers union, deduped by (name, image) and sorted', () => {
      const app = { name: 'app', image: 'repo/app:1.2' };
      const raw = enrichGraph(
        childPod('prod/p1', 'mongo-0', { containers: [app] }),
        childPod('prod/p2', 'mongo-1', { containers: [app, { name: 'sidecar', image: 'repo/sc:0.9' }] }),
        childPod('prod/p3', 'mongo-2', { containers: [app] })
      );
      expect(controllerOf(raw)?.containers).toEqual([
        { name: 'app', image: 'repo/app:1.2' },
        { name: 'sidecar', image: 'repo/sc:0.9' },
      ]);
    });

    it('keeps same-named containers with different images apart (deduped by the PAIR)', () => {
      const raw = enrichGraph(
        childPod('prod/p1', 'mongo-0', { containers: [{ name: 'app', image: 'repo/app:1.2' }] }),
        childPod('prod/p2', 'mongo-1', { containers: [{ name: 'app', image: 'repo/app:1.3' }] })
      );
      expect(controllerOf(raw)?.containers).toEqual([
        { name: 'app', image: 'repo/app:1.2' },
        { name: 'app', image: 'repo/app:1.3' },
      ]);
    });

    it('omits both fields when no child pod carries a value', () => {
      const ctrl = controllerOf(enrichGraph(childPod('prod/p1', 'mongo-0')));
      expect(ctrl).toBeDefined();
      expect(ctrl !== undefined && 'application' in ctrl).toBe(false);
      expect(ctrl !== undefined && 'containers' in ctrl).toBe(false);
    });
  });

  describe('alert aggregation', () => {
    it('concatenates child-pod alerts in stable podId order, attributing each to its pod', () => {
      const raw = enrichGraph(
        childPod('prod/p2', 'mongo-1', {
          alerts: [{ name: 'CrashLoop', severity: 'warning', time_records: [1717500300] }],
        }),
        childPod('prod/p1', 'mongo-0', {
          alerts: [{ name: 'HighMem', severity: 'critical', time_records: [1717500000] }],
        })
      );
      expect(controllerOf(raw)?.alerts).toEqual([
        { name: 'HighMem', severity: 'critical', timeRecords: [1717500000], pod: 'mongo-0' },
        { name: 'CrashLoop', severity: 'warning', timeRecords: [1717500300], pod: 'mongo-1' },
      ]);
    });

    it('keeps an explicit backend pod attribution instead of backfilling', () => {
      const raw = enrichGraph(
        childPod('prod/p1', 'mongo-0', {
          alerts: [{ name: 'SvcDown', severity: 'critical', pod: 'other-pod', time_records: [1717500000] }],
        })
      );
      expect(controllerOf(raw)?.alerts).toEqual([
        { name: 'SvcDown', severity: 'critical', pod: 'other-pod', timeRecords: [1717500000] },
      ]);
    });

    it('dedupes alerts sharing an id across pods (first in stable order wins); keeps id-less ones', () => {
      const shared = { name: 'SvcDegraded', severity: 'warning', time_records: [1717500000], id: 'a1' };
      const local = { name: 'Local', severity: 'info', time_records: [1717500100] };
      const raw = enrichGraph(
        childPod('prod/p1', 'mongo-0', { alerts: [shared, local] }),
        childPod('prod/p2', 'mongo-1', { alerts: [shared, local] })
      );
      const alerts = controllerOf(raw)?.alerts;
      expect(alerts?.filter((a) => a.id === 'a1')).toHaveLength(1);
      expect(alerts?.find((a) => a.id === 'a1')?.pod).toBe('mongo-0'); // first in stable podId order wins
      expect(alerts?.filter((a) => a.name === 'Local')).toHaveLength(2); // no id → never deduped
    });

    it('omits controller alerts when no child pod carries any', () => {
      expect(controllerOf(enrichGraph(childPod('prod/p1', 'mongo-0')))?.alerts).toBeUndefined();
    });

    it('keeps colour status-driven: a critical alert on a normal pod never escalates worstStatus', () => {
      const raw = enrichGraph(
        childPod('prod/p1', 'mongo-0', {
          status: 'normal',
          alerts: [{ name: 'HighMem', severity: 'critical', time_records: [1717500000] }],
        })
      );
      const ctrl = controllerOf(raw);
      expect(ctrl?.alerts).toHaveLength(1);
      expect(ctrl?.worstStatus).toBe('normal');
    });

    it('leaves the source pod element untouched by the backfill (no pod field added there)', () => {
      const raw = enrichGraph(
        childPod('prod/p1', 'mongo-0', {
          alerts: [{ name: 'HighMem', severity: 'critical', time_records: [1717500000] }],
        })
      );
      const pod = normalizeGraph(raw).elements.find((e) => (e.data as cytoscape.NodeDataDefinition).id === 'prod/p1')
        ?.data as cytoscape.NodeDataDefinition;
      expect(pod.alerts).toEqual([{ name: 'HighMem', severity: 'critical', timeRecords: [1717500000] }]);
    });
  });

  it('is deterministic and does not mutate the input across repeated calls', () => {
    const raw = enrichGraph(
      childPod('prod/p2', 'mongo-1', { application: 'beta', containers: [{ name: 'b', image: 'r/b:1' }] }),
      childPod('prod/p1', 'mongo-0', { application: 'alpha', containers: [{ name: 'a', image: 'r/a:1' }] })
    );
    const snapshot = JSON.stringify(raw);
    const a = JSON.stringify(normalizeGraph(raw).elements);
    const b = JSON.stringify(normalizeGraph(raw).elements);
    expect(a).toBe(b);
    expect(JSON.stringify(raw)).toBe(snapshot);
  });

  describe('ingress path dashing (markIngressEdges)', () => {
    // Double-path fixture: p reaches bsvc both THROUGH the ingress gateway
    // (p → igwSvc → igwPod → bsvc) and DIRECTLY (p → bsvc). Mirrors the demo.
    // It also carries the counter-examples for the traffic-only rule: the ingress
    // pod's scheduling (e6) / storage (e7) edges and an unknown-type edge (e8) all
    // touch an ingress node yet MUST stay solid.
    const doublePathRaw = {
      elements: {
        nodes: [
          { data: { id: 'p', type: 'pod' } },
          { data: { id: 'igwSvc', type: 'service', labels: { role: 'ingress-gateway' } } },
          { data: { id: 'igwPod', type: 'pod' } },
          { data: { id: 'bsvc', type: 'service' } },
          { data: { id: 'bpod', type: 'pod' } },
          { data: { id: 'k8sNode', type: 'node' } },
          { data: { id: 'igwPvc', type: 'pvc' } },
        ],
        edges: [
          { data: { id: 'e1', source: 'p', target: 'igwSvc', type: 'pod-calls-service' } },
          { data: { id: 'e2', source: 'igwSvc', target: 'igwPod', type: 'service-selects-pod' } },
          { data: { id: 'e3', source: 'igwPod', target: 'bsvc', type: 'pod-calls-service' } },
          { data: { id: 'e4', source: 'bsvc', target: 'bpod', type: 'service-selects-pod' } },
          { data: { id: 'e5', source: 'p', target: 'bsvc', type: 'pod-calls-service' } },
          { data: { id: 'e6', source: 'igwPod', target: 'k8sNode', type: 'pod-to-node' } },
          { data: { id: 'e7', source: 'igwPod', target: 'igwPvc', type: 'pod-mounts-pvc' } },
          { data: { id: 'e8', source: 'igwPod', target: 'bpod', type: 'pod-calls-configmap' } },
        ],
      },
    };

    const ingressFlagById = (raw: unknown): Map<string, boolean> =>
      new Map(
        normalizeGraph(raw)
          .elements.filter((e) => e.group === 'edges')
          .map((e) => [String(e.data.id), (e.data as cytoscape.EdgeDataDefinition).ingressPath === true])
      );

    it('dashes only the three traffic edges on the ingress path', () => {
      const flags = ingressFlagById(doublePathRaw);
      // pod → ingress-svc, ingress-svc → ingress-pod, ingress-pod → backend-svc.
      expect(flags.get('e1')).toBe(true);
      expect(flags.get('e2')).toBe(true);
      expect(flags.get('e3')).toBe(true);
      // The direct path + the backend fan-out stay solid (no ingress endpoint).
      expect(flags.get('e4')).toBe(false);
      expect(flags.get('e5')).toBe(false);
    });

    it('leaves the ingress pod NON-traffic edges solid (scheduling / storage)', () => {
      const flags = ingressFlagById(doublePathRaw);
      // Both touch an ingress node, but pod-to-node / pod-mounts-pvc express
      // placement and mounts — not traffic routed through the gateway.
      expect(flags.get('e6')).toBe(false);
      expect(flags.get('e7')).toBe(false);
    });

    it('leaves an unknown edge type solid even when it touches an ingress node', () => {
      // A dash ASSERTS "this traffic detours via the gateway"; an unmapped backend
      // type cannot be asserted, so it defaults to non-traffic (no dash). Unlike
      // the filter's unknown-visible rule, this hides nothing.
      expect(ingressFlagById(doublePathRaw).get('e8')).toBe(false);
    });

    it('sets ingressPath ONLY on qualifying edges (absent, not false, elsewhere)', () => {
      const edges = normalizeGraph(doublePathRaw).elements.filter((e) => e.group === 'edges');
      const byId = new Map(edges.map((e) => [String(e.data.id), e.data as cytoscape.EdgeDataDefinition]));
      expect(byId.get('e1')?.ingressPath).toBe(true);
      // Non-ingress edges carry no ingressPath key at all.
      expect('ingressPath' in (byId.get('e5') ?? {})).toBe(false);
    });

    it('marks nothing when no node carries the ingress label', () => {
      const raw = {
        elements: {
          nodes: [{ data: { id: 'svc', type: 'service' } }, { data: { id: 'pod', type: 'pod' } }],
          edges: [{ data: { id: 'e', source: 'svc', target: 'pod', type: 'service-selects-pod' } }],
        },
      };
      const edges = normalizeGraph(raw).elements.filter((e) => e.group === 'edges');
      expect(edges.every((e) => (e.data as cytoscape.EdgeDataDefinition).ingressPath === undefined)).toBe(true);
    });

    it('dashes the traffic edges of a pod nested inside a LABELLED COMPOUND', () => {
      // The label may sit on a controller/application group. The set that HIDES such a
      // group's subtree (computeVisibility) and the set that DASHES its traffic
      // (markIngressEdges) must be the same one — a path the toggle can hide but whose
      // edges never dash is a contradiction visible on canvas.
      const raw = {
        elements: {
          nodes: [
            { data: { id: 'ctrl', type: 'controller', labels: { role: 'ingress-gateway' } } },
            { data: { id: 'igwPod', type: 'pod', parent: 'ctrl' } },
            { data: { id: 'bsvc', type: 'service' } },
            { data: { id: 'k8sNode', type: 'node' } },
          ],
          edges: [
            { data: { id: 'e1', source: 'igwPod', target: 'bsvc', type: 'pod-calls-service' } },
            { data: { id: 'e2', source: 'igwPod', target: 'k8sNode', type: 'pod-to-node' } },
          ],
        },
      };
      const flags = ingressFlagById(raw);
      // Nested pod's traffic hop dashes …
      expect(flags.get('e1')).toBe(true);
      // … while its scheduling edge stays solid (traffic-only rule still applies).
      expect(flags.get('e2')).toBe(false);
    });

    it('leaves an Object.prototype-named edge type solid (no prototype-chain lookup)', () => {
      // `data.type` is untrusted and copied verbatim; a bare map index would resolve
      // 'constructor' to the inherited Function (truthy) and dash the edge.
      const raw = {
        elements: {
          nodes: [
            { data: { id: 'igwSvc', type: 'service', labels: { role: 'ingress-gateway' } } },
            { data: { id: 'other', type: 'pod' } },
          ],
          edges: [{ data: { id: 'e', source: 'igwSvc', target: 'other', type: 'constructor' } }],
        },
      };
      expect(ingressFlagById(raw).get('e')).toBe(false);
    });

    it('still detects the ingress label when a sibling label value is non-string', () => {
      // A single stray non-string label (e.g. a numeric `replicas`) must not make the
      // WHOLE labels map disappear and silently break ingress detection.
      const raw = {
        elements: {
          nodes: [
            { data: { id: 'igwSvc', type: 'service', labels: { role: 'ingress-gateway', replicas: 3 } } },
            { data: { id: 'igwPod', type: 'pod' } },
          ],
          edges: [{ data: { id: 'e', source: 'igwSvc', target: 'igwPod', type: 'service-selects-pod' } }],
        },
      };
      const { elements } = normalizeGraph(raw);
      const igwSvc = elements.find((e) => e.data.id === 'igwSvc')?.data as cytoscape.NodeDataDefinition;
      expect(igwSvc.labels).toEqual({ role: 'ingress-gateway' });
      const edge = elements.find((e) => e.data.id === 'e')?.data as cytoscape.EdgeDataDefinition;
      expect(edge.ingressPath).toBe(true);
    });
  });

  describe('edge relation label', () => {
    // The backend marks service-graph edges with `labels.relation`: 'transport' = the pod's
    // real network hop to a broker, 'link' = the logical dependency that hop stands in for,
    // absent = ordinary RPC. Cytoscape selectors cannot read nested data, so normalize
    // hoists the value to a flat `data.relation` — verbatim, no allow-list.
    const withRelation = (relation: unknown): Record<string, unknown> => ({
      elements: {
        nodes: [{ data: { id: 'a', type: 'pod' } }, { data: { id: 'b', type: 'service' } }],
        edges: [
          {
            data: {
              id: 'e',
              source: 'a',
              target: 'b',
              type: 'pod-calls-service',
              ...(relation === undefined ? {} : { labels: { relation } }),
            },
          },
        ],
      },
    });

    const edgeData = (raw: unknown): cytoscape.EdgeDataDefinition => {
      const { elements, errors } = normalizeGraph(raw);
      expect(errors).toEqual([]);
      return elements.find((e) => e.data.id === 'e')?.data as cytoscape.EdgeDataDefinition;
    };

    it.each(['transport', 'link'])('hoists relation "%s" to a flat field', (relation) => {
      const data = edgeData(withRelation(relation));
      expect(data.relation).toBe(relation);
      // The label itself stays put — the hover tooltip renders it from data.labels.
      expect(data.labels).toEqual({ relation });
    });

    it('passes an unknown relation value through rather than dropping it', () => {
      // A future value must reach the stylesheet, which simply has no rule for it (solid),
      // instead of being silently rewritten to something that has one.
      expect(edgeData(withRelation('sidecar')).relation).toBe('sidecar');
    });

    it('omits the key entirely when the label is absent', () => {
      const data = edgeData(withRelation(undefined));
      // Absent, not `undefined`: same discipline as ingressPath, and `edge[relation]`
      // selectors treat a present-but-undefined field differently from a missing one.
      expect('relation' in data).toBe(false);
    });

    it('drops a non-string relation without losing its sibling labels', () => {
      const raw = {
        elements: {
          nodes: [{ data: { id: 'a', type: 'pod' } }, { data: { id: 'b', type: 'service' } }],
          edges: [
            {
              data: {
                id: 'e',
                source: 'a',
                target: 'b',
                type: 'pod-calls-service',
                labels: { relation: ['transport'], namespace: 'shop' },
              },
            },
          ],
        },
      };
      const data = edgeData(raw);
      expect('relation' in data).toBe(false);
      expect(data.labels).toEqual({ namespace: 'shop' });
    });
  });
});

describe('normalizeGraph — edge RED metrics', () => {
  // The backend attaches RED (rate / error / duration) to trace-derived edges as
  // `data.metrics`. normalize renames to the panel's camelCase and validates, but does NOT
  // convert units, round, or fill defaults — the tooltip formats, this layer only carries.
  const withMetrics = (metrics: unknown): Record<string, unknown> => ({
    elements: {
      nodes: [{ data: { id: 'a', type: 'pod' } }, { data: { id: 'b', type: 'service' } }],
      edges: [
        {
          data: {
            id: 'e',
            source: 'a',
            target: 'b',
            type: 'pod-calls-service',
            labels: { namespace: 'shop' },
            ...(metrics === undefined ? {} : { metrics }),
          },
        },
      ],
    },
  });

  const edgeData = (raw: unknown): cytoscape.EdgeDataDefinition => {
    const { elements } = normalizeGraph(raw);
    return elements.find((e) => e.data.id === 'e')?.data as cytoscape.EdgeDataDefinition;
  };

  it('carries a full metrics object through under panel field names', () => {
    const data = edgeData(withMetrics({ rate: 5, error_rate: 0.2, p90_server_ms: 45 }));
    expect(data.metrics).toEqual({ rate: 5, errorRate: 0.2, p90ServerMs: 45 });
  });

  it('leaves values unconverted and unrounded', () => {
    // 0.2 must NOT become 20 here: the ratio→percent conversion belongs to the display
    // leaf, and 12.345 must survive intact so the formatter (not normalize) decides digits.
    const data = edgeData(withMetrics({ rate: 12.345, error_rate: 0.2, p90_server_ms: 1234.5 }));
    expect(data.metrics).toEqual({ rate: 12.345, errorRate: 0.2, p90ServerMs: 1234.5 });
  });

  it('omits the metrics key entirely for an edge the backend did not measure', () => {
    const data = edgeData(withMetrics(undefined));
    // Absent, not `undefined` and not `{}` — "no measurement" must stay distinguishable.
    expect('metrics' in data).toBe(false);
  });

  it('omits absent optional fields rather than defaulting them', () => {
    const data = edgeData(withMetrics({ rate: 3 }));
    expect(data.metrics).toEqual({ rate: 3 });
    expect('errorRate' in (data.metrics ?? {})).toBe(false);
    expect('p90ServerMs' in (data.metrics ?? {})).toBe(false);
  });

  it('preserves a measured zero error rate', () => {
    // The load-bearing distinction: 0 means "read, no failures"; absent means "unreadable".
    const data = edgeData(withMetrics({ rate: 1, error_rate: 0 }));
    expect(data.metrics).toEqual({ rate: 1, errorRate: 0 });
  });

  it.each([
    ['non-numeric', 'high'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['null', null],
  ])('drops only an unusable error_rate (%s)', (_label, errorRate) => {
    const data = edgeData(withMetrics({ rate: 5, error_rate: errorRate, p90_server_ms: 45 }));
    expect(data.metrics).toEqual({ rate: 5, p90ServerMs: 45 });
  });

  it.each([
    ['non-numeric', '45ms'],
    ['NaN', Number.NaN],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('drops only an unusable p90_server_ms (%s)', (_label, p90) => {
    const data = edgeData(withMetrics({ rate: 5, error_rate: 0.2, p90_server_ms: p90 }));
    expect(data.metrics).toEqual({ rate: 5, errorRate: 0.2 });
  });

  it.each([
    ['missing rate', { error_rate: 0.1, p90_server_ms: 45 }],
    ['null rate', { rate: null, error_rate: 0.1 }],
    ['non-numeric rate', { rate: '5', error_rate: 0.1 }],
    ['NaN rate', { rate: Number.NaN, error_rate: 0.1 }],
    ['Infinite rate', { rate: Number.POSITIVE_INFINITY }],
    ['non-object metrics', 'rate=5'],
    ['array metrics', [5]],
    ['null metrics', null],
  ])('drops the whole metrics object when rate is unusable (%s)', (_label, metrics) => {
    const data = edgeData(withMetrics(metrics));
    // rate is the keystone: without it the remaining fields have no denominator to be
    // read against, so the object is not a metrics object we understand.
    expect('metrics' in data).toBe(false);
  });

  it.each([
    ['missing rate', { error_rate: 0.1 }],
    ['bad error_rate', { rate: 5, error_rate: 'high' }],
    ['non-object metrics', 'rate=5'],
  ])('keeps the edge itself intact when metrics are unusable (%s)', (_label, metrics) => {
    const data = edgeData(withMetrics(metrics));
    // RED is an attribute layer, never a gate — a bad metric must not cost a topology edge.
    expect(data.id).toBe('e');
    expect(data.edgeType).toBe('pod-calls-service');
    expect(data.labels).toEqual({ namespace: 'shop' });
  });

  it('preserves exponent-notation magnitudes exactly', () => {
    // The backend rounds to 6 significant digits, so a wide query window legitimately
    // yields values like these. Collapsing them to 0 would read as "no traffic".
    const data = edgeData(withMetrics({ rate: 3.86e-7, error_rate: 6.7e-8 }));
    const metrics = data.metrics as cytoscape.EdgeRedMetrics | undefined;
    expect(metrics?.rate).toBe(3.86e-7);
    expect(metrics?.errorRate).toBe(6.7e-8);
  });

  it.each([
    ['bad error_rate', { rate: 5, error_rate: 'high' }],
    ['missing rate', { error_rate: 0.1 }],
    ['non-object metrics', 'rate=5'],
    ['array metrics', [5]],
  ])('never reports a RED problem through the errors channel (%s)', (_label, metrics) => {
    // `errors` drives a user-visible "topology may be incomplete" banner. A malformed
    // decorative metric does not make the topology incomplete, and an upstream regression
    // would fire it on every edge at once, drowning the warnings it exists for.
    const { errors } = normalizeGraph(withMetrics(metrics));
    expect(errors).toEqual([]);
  });

  // ── The I/O half of the metrics union (pvc-to-netapp-aggr storage edges) ──
  describe('storage I/O family', () => {
    it('carries a full I/O object through under panel field names, with no rate', () => {
      const data = edgeData(
        withMetrics({
          read_ops: 150,
          write_ops: 40,
          read_latency_us: 830,
          write_latency_us: 1200,
          read_bytes_per_sec: 5242880,
          write_bytes_per_sec: 1048576,
        })
      );
      expect(data.metrics).toEqual({
        readOps: 150,
        writeOps: 40,
        readLatencyUs: 830,
        writeLatencyUs: 1200,
        readBytesPerSec: 5242880,
        writeBytesPerSec: 1048576,
      });
      expect(data.metrics !== undefined && 'rate' in data.metrics).toBe(false);
    });

    it('keeps each field independently — one bad field does not sink the family', () => {
      const data = edgeData(withMetrics({ read_ops: 150, write_ops: 'many' }));
      expect(data.metrics).toEqual({ readOps: 150 });
    });

    it('leaves values unconverted (Harvest already resolved the counters)', () => {
      // 830 µs stays 830: the µs→ms threshold belongs to the display layer.
      // Throughput stays bytes/s — MB/s is a display-layer suffix, not a normalize conversion.
      const data = edgeData(withMetrics({ read_latency_us: 830, read_bytes_per_sec: 5242880 }));
      expect(data.metrics).toEqual({ readLatencyUs: 830, readBytesPerSec: 5242880 });
    });

    it('keeps the I/O family alive from a throughput field alone', () => {
      expect(edgeData(withMetrics({ read_bytes_per_sec: 5242880 })).metrics).toEqual({
        readBytesPerSec: 5242880,
      });
      expect(edgeData(withMetrics({ write_bytes_per_sec: 12 })).metrics).toEqual({ writeBytesPerSec: 12 });
    });

    it.each([
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['non-numeric', 'fast'],
    ])('drops only an unusable throughput field (%s) without sinking siblings', (_label, bad) => {
      const data = edgeData(withMetrics({ read_ops: 150, read_bytes_per_sec: bad, write_bytes_per_sec: 12 }));
      expect(data.metrics).toEqual({ readOps: 150, writeBytesPerSec: 12 });
    });

    it('drops the object when no I/O field survives', () => {
      const data = edgeData(withMetrics({ read_ops: 'lots', write_ops: Number.NaN }));
      expect('metrics' in data).toBe(false);
    });

    it('lets a present-but-invalid rate still discard everything (RED ordering is unchanged)', () => {
      // The union only reroutes a WHOLLY ABSENT rate. A malformed rate is a malformed RED
      // object, and its I/O-looking neighbours must not resurrect it as a storage reading.
      const data = edgeData(withMetrics({ rate: 'fast', read_ops: 150 }));
      expect('metrics' in data).toBe(false);
    });

    it('prefers RED when both families somehow arrive, never emitting a mixed object', () => {
      const data = edgeData(withMetrics({ rate: 5, read_ops: 150 }));
      expect(data.metrics).toEqual({ rate: 5 });
    });

    it('never reports an I/O problem through the errors channel', () => {
      const { errors } = normalizeGraph(withMetrics({ read_ops: 'lots' }));
      expect(errors).toEqual([]);
    });

    // ── The QoS ceilings, which ride the policy-group families rather than the workload ones ──
    describe('QoS ceilings', () => {
      it('carries both ceilings through alongside the measurements', () => {
        const data = edgeData(
          withMetrics({
            read_ops: 150,
            write_ops: 40,
            read_latency_us: 830,
            write_latency_us: 1200,
            read_bytes_per_sec: 5242880,
            write_bytes_per_sec: 1048576,
            max_iops: 5000,
            max_bytes_per_sec: 104857600,
          })
        );
        expect(data.metrics).toEqual({
          readOps: 150,
          writeOps: 40,
          readLatencyUs: 830,
          writeLatencyUs: 1200,
          readBytesPerSec: 5242880,
          writeBytesPerSec: 1048576,
          maxIops: 5000,
          maxBytesPerSec: 104857600,
        });
      });

      it('leaves a volume in no policy group uncapped rather than defaulting a ceiling', () => {
        // Absence means "no declared ceiling" — never 0, never an unlimited sentinel.
        const data = edgeData(withMetrics({ read_ops: 150, read_bytes_per_sec: 5242880 }));
        expect(data.metrics).toEqual({ readOps: 150, readBytesPerSec: 5242880 });
      });

      it.each([
        ['NaN', Number.NaN],
        ['Infinity', Number.POSITIVE_INFINITY],
        ['non-numeric', 'unlimited'],
      ])('drops only the unusable ceiling (%s), keeping its sibling and the measurements', (_label, bad) => {
        const data = edgeData(withMetrics({ read_ops: 150, max_iops: bad, max_bytes_per_sec: 104857600 }));
        expect(data.metrics).toEqual({ readOps: 150, maxBytesPerSec: 104857600 });
      });

      it('keeps the I/O family alive from a ceiling alone', () => {
        // The backend owns the "a ceiling never appears alone" invariant; normalize must not
        // re-enforce it, or a contract it does not control could silently sink the object.
        expect(edgeData(withMetrics({ max_iops: 5000 })).metrics).toEqual({ maxIops: 5000 });
        expect(edgeData(withMetrics({ max_bytes_per_sec: 104857600 })).metrics).toEqual({
          maxBytesPerSec: 104857600,
        });
      });

      it('passes the throughput ceiling through unconverted (the backend already left Harvest MB/s)', () => {
        const data = edgeData(withMetrics({ max_bytes_per_sec: 104857600 }));
        expect(data.metrics).toEqual({ maxBytesPerSec: 104857600 });
      });
    });
  });
});
