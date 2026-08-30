import type cytoscape from 'cytoscape';

import { normalizeGraph } from '../../features/graph-data/normalize';
import { EDGE_STYLE_BY_TYPE } from '../constants/colorByEdgeType';
import { ICON_SVG_BY_KIND } from '../constants/iconSvgByKind';

import { SHOWCASE_GRAPH } from './showcaseGraph';

// The fixture IS the panel's data source — there is no backend in this repository — so
// "does the panel render the current wire contract?" is answered here and nowhere else.
// These tests are the coverage gate: a field the backend emits but the fixture omits is
// a field nobody would notice the panel had stopped drawing.
describe('SHOWCASE_GRAPH', () => {
  const { elements, errors } = normalizeGraph(SHOWCASE_GRAPH);

  const nodes = elements.filter((el) => el.group === 'nodes').map((el) => el.data as cytoscape.NodeDataDefinition);
  const edges = elements.filter((el) => el.group === 'edges').map((el) => el.data as cytoscape.EdgeDataDefinition);
  const nodeById = new Map(nodes.map((data) => [data.id as string, data]));
  const edgeBetween = (source: string, target: string): cytoscape.EdgeDataDefinition | undefined =>
    edges.find((data) => data.source === source && data.target === target);

  it('parses with no errors at all', () => {
    // The partial-parse channel exists for a real backend having a bad day. The fixture is
    // authored in this repository, so anything landing here is our own mistake.
    expect(errors).toEqual([]);
  });

  it('references only nodes it defines, on every edge', () => {
    const dangling = edges.filter((data) => !nodeById.has(data.source) || !nodeById.has(data.target));
    expect(dangling).toEqual([]);
  });

  it('nests every parent reference in a node it defines', () => {
    const orphans = nodes.filter((data) => data.parent !== undefined && !nodeById.has(data.parent));
    expect(orphans).toEqual([]);
  });

  it('covers every node kind the panel can draw', () => {
    // Checked against the canonical icon map rather than the panel's filterable subset, so
    // the virtual `network` wrapper counts too. Add a kind to that map without fixture
    // coverage and this fails — which is the point: an uncovered kind is one nobody would
    // notice the panel had stopped drawing.
    const drawn = new Set(nodes.map((data) => data.kind));
    expect(Object.keys(ICON_SVG_BY_KIND).filter((kind) => !drawn.has(kind))).toEqual([]);
  });

  it('covers every edge type the panel can draw', () => {
    const drawn = new Set(edges.map((data) => data.edgeType));
    expect(Object.keys(EDGE_STYLE_BY_TYPE).filter((type) => !drawn.has(type))).toEqual([]);
  });

  describe('typed node attributes', () => {
    it('carries all three K8s node Ready states', () => {
      const ready = nodes.filter((data) => data.kind === 'node').map((data) => data.readyStatus);
      expect(new Set(ready)).toEqual(new Set(['Ready', 'NotReady', 'Unknown']));
    });

    it('shows a joined claim and a claim that never joined an aggregate', () => {
      // The relabel-rule blind spot: data-mongo-2 resolved a PV but no Harvest label series
      // matched it, so it has an svm-less label set AND no storage edge.
      expect(nodeById.get('pvc/data-mongo-0')?.labels).toMatchObject({
        volumename: 'pvc-9f3a1b2c',
        svm: 'svm-prod-nas',
      });
      const unjoined = nodeById.get('pvc/data-mongo-2');
      expect(unjoined?.labels?.volumename).toBe('pvc-1a2b3c4d');
      expect(unjoined?.labels?.svm).toBeUndefined();
      expect(edges.some((data) => data.source === 'pvc/data-mongo-2')).toBe(false);
    });

    it('carries ONTAP health and a usage reading on the storage chain', () => {
      const aggr = nodeById.get('netapp/ontap-prod/aggr/aggr1');
      expect(aggr?.health).toBe('online');
      expect(aggr?.usageRatio).toBeCloseTo(0.7);
      expect(nodeById.get('netapp/ontap-prod/ontap-prod-01')?.health).toBe('online');
    });

    it('keeps ONTAP cluster names out of the Kubernetes cluster list', () => {
      expect(SHOWCASE_GRAPH.clusters).toEqual(['prod', 'dr']);
    });

    it('covers Sankey: a pvc-to-netapp-aggr edge with both throughputs and one with neither', () => {
      const storage = edges.filter((data) => data.edgeType === 'pvc-to-netapp-aggr');
      const both = storage.filter((data) => {
        const m = data.metrics;
        return m !== undefined && !('rate' in m) && m.readBytesPerSec !== undefined && m.writeBytesPerSec !== undefined;
      });
      const neither = storage.filter((data) => {
        const m = data.metrics;
        return (
          m === undefined || (!('rate' in m) && m.readBytesPerSec === undefined && m.writeBytesPerSec === undefined)
        );
      });
      expect(both.length).toBeGreaterThan(0);
      expect(neither.length).toBeGreaterThan(0);
    });
  });

  describe('both ingress shapes', () => {
    it('marks the routed chain entry hop and the LB fallback with distinct roles', () => {
      expect(nodeById.get('service/ingress-svc')?.labels?.role).toBe('ingress-gateway');
      expect(nodeById.get('service/nginx-lb')?.labels?.role).toBe('ingress-lb');
    });

    it('dashes the routed chain but leaves the fallback solid', () => {
      // The chain is a detour around a direct edge that also exists, so dashing it asserts
      // something true. The fallback has no routed backend, so its caller edge is the real
      // dependency and dashing it would assert a detour that does not exist.
      expect(edgeBetween('pod/gateway', 'service/ingress-svc')?.ingressPath).toBe(true);
      expect(edgeBetween('service/ingress-svc', 'pod/ingress-0')?.ingressPath).toBe(true);
      expect(edgeBetween('pod/ingress-0', 'service/mongo-svc')?.ingressPath).toBe(true);
      expect(edgeBetween('pod/reporting', 'service/nginx-lb')?.ingressPath).toBeUndefined();
      expect(edgeBetween('service/nginx-lb', 'pod/nginx-lb-0')?.ingressPath).toBeUndefined();
    });

    it("keeps the chain's caller reachable without it, and the fallback caller not", () => {
      // Hiding the chain must never orphan a caller: pod/gateway keeps its direct edge to
      // the backend service. pod/reporting has only the fallback edge, which is exactly why
      // the fallback must stay visible.
      expect(edgeBetween('pod/gateway', 'service/mongo-svc')).toBeDefined();
      const reportingDeps = edges.filter((data) => data.source === 'pod/reporting' && data.edgeType !== 'pod-to-node');
      expect(reportingDeps).toHaveLength(1);
      expect(reportingDeps[0]?.target).toBe('service/nginx-lb');
    });
  });

  describe('edge measurements', () => {
    it('shows a measured error rate, a measured-clean zero, and an unmeasured edge', () => {
      // The three states the panel must keep distinct. The edge into `external` carries no
      // metrics at all because the backend never measures one.
      expect(edgeBetween('pod/gateway', 'service/mongo-svc')?.metrics).toMatchObject({ errorRate: 0.15 });
      expect(edgeBetween('pod/consumer', 'service/nats-svc')?.metrics).toMatchObject({ errorRate: 0 });
      expect(edgeBetween('pod/consumer', 'ext/payments')?.metrics).toBeUndefined();
    });

    it('keeps a legitimately tiny rate out of exponent-rounded oblivion', () => {
      // A wide query window rounds to 6 significant digits; the formatter must not render
      // this as "no traffic", and the fixture is what proves it on screen.
      expect(edgeBetween('pod/gateway', 'service/nats-svc')?.metrics).toMatchObject({ rate: 3.86e-7 });
    });

    it('shows a QoS-capped storage edge beside an uncapped one', () => {
      const capped = edgeBetween('pvc/data-mongo-0', 'netapp/ontap-prod/aggr/aggr1')?.metrics;
      expect(capped).toMatchObject({
        readOps: 150,
        readBytesPerSec: 5242880,
        maxIops: 5000,
        maxBytesPerSec: 104857600,
      });
      const uncapped = edgeBetween('pvc/data-mongo-1', 'netapp/ontap-prod/aggr/aggr2')?.metrics;
      expect(uncapped).toMatchObject({ readOps: 12, readBytesPerSec: 262144 });
      // In no policy group: no ceiling exists, and absence is how that reads.
      expect(uncapped).not.toHaveProperty('maxIops');
      expect(uncapped).not.toHaveProperty('maxBytesPerSec');
    });

    it('marks the broker transport hop and the logical link it stands in for', () => {
      expect(edgeBetween('pod/consumer', 'service/nats-svc')?.relation).toBe('transport');
      expect(edgeBetween('pod/gateway', 'pod/consumer')?.relation).toBe('link');
    });
  });
});
