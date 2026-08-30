import type cytoscape from 'cytoscape';

import { clonePlain } from '../../shared/clone/clonePlain';
import { SHOWCASE_GRAPH } from '../../shared/fixtures/showcaseGraph';
import { normalizeGraph } from '../graph-data';

import { deriveSankey, formatBytesPerSec, hoverPathLinks } from './deriveSankey';

// Two Kubernetes clusters writing to ONE NetApp node: `aggr-shared` takes traffic from
// both, `aggr-b-only` from cluster b alone. The fixture cannot express this — only its
// `prod` cluster has storage flow at all — and it is exactly the shape a cluster filter
// has to get right.
function twoClusterStorage(): cytoscape.ElementDefinition[] {
  const node = (
    id: string,
    kind: string,
    extra: Partial<cytoscape.NodeDataDefinition> = {}
  ): cytoscape.ElementDefinition => ({ group: 'nodes', data: { id, label: id, kind, ...extra } });
  const mount = (pod: string, pvc: string): cytoscape.ElementDefinition => ({
    group: 'edges',
    data: { id: `${pod}->${pvc}`, source: pod, target: pvc, edgeType: 'pod-mounts-pvc' },
  });
  const io = (pvc: string, aggr: string, read: number, write: number): cytoscape.ElementDefinition => ({
    group: 'edges',
    data: {
      id: `${pvc}->${aggr}`,
      source: pvc,
      target: aggr,
      edgeType: 'pvc-to-netapp-aggr',
      metrics: { readBytesPerSec: read, writeBytesPerSec: write },
    },
  });
  return [
    node('pod-a', 'pod', { labels: { cluster: 'a' } }),
    node('pvc-a', 'pvc', { labels: { cluster: 'a' } }),
    node('pod-b', 'pod', { labels: { cluster: 'b' } }),
    node('pvc-b', 'pvc', { labels: { cluster: 'b' } }),
    node('ontap-01', 'netapp-node'),
    node('aggr-shared', 'netapp-aggr', { parent: 'ontap-01' }),
    node('aggr-b-only', 'netapp-aggr', { parent: 'ontap-01' }),
    mount('pod-a', 'pvc-a'),
    mount('pod-b', 'pvc-b'),
    io('pvc-a', 'aggr-shared', 100, 10),
    io('pvc-b', 'aggr-shared', 900, 90),
    io('pvc-b', 'aggr-b-only', 500, 50),
  ];
}

describe('deriveSankey', () => {
  const { elements } = normalizeGraph(SHOWCASE_GRAPH);

  it('does not mutate the shared graph', () => {
    const before = clonePlain(elements);
    deriveSankey(elements, 'both');
    deriveSankey(elements, 'read');
    deriveSankey(elements, 'write');
    expect(elements).toEqual(before);
  });

  it('derives the fixture four-tier chain in Both mode', () => {
    const graph = deriveSankey(elements, 'both');
    const labels = Object.fromEntries(graph.nodes.map((n) => [n.id, n.label]));
    expect(Object.values(labels)).toEqual(
      expect.arrayContaining(['mongo-0', 'mongo-1', 'data-mongo-0', 'data-mongo-1', 'aggr1', 'aggr2'])
    );
    expect(graph.nodes.some((n) => n.label === 'mongo-2')).toBe(false);
    expect(graph.nodes.some((n) => n.label === 'data-mongo-2')).toBe(false);
    const pairs = graph.links.map((l) => `${l.source}->${l.target}:${l.direction}`);
    expect(pairs).toEqual(expect.arrayContaining([expect.stringContaining('read'), expect.stringContaining('write')]));
  });

  it('uses pvc→aggr measured weights in Read mode', () => {
    const graph = deriveSankey(elements, 'read');
    const link = graph.links.find((l) => l.source.includes('data-mongo-0') && l.target.includes('aggr1'));
    expect(link?.value).toBe(5242880);
    expect(graph.links.every((l) => l.direction === 'read')).toBe(true);
  });

  it('splits pod→pvc evenly', () => {
    const graph = deriveSankey(elements, 'write');
    const podLinks = graph.links.filter((l) => l.splitAmong !== undefined && l.source.includes('mongo-0'));
    expect(podLinks[0]?.splitAmong).toBe(1);
  });

  it('excludes edges with neither read nor write measurement', () => {
    const graph = deriveSankey(elements, 'both');
    expect(graph.nodes.some((n) => n.label === 'data-mongo-2')).toBe(false);
  });

  it('formats tiny non-zero rates with exponent notation', () => {
    expect(formatBytesPerSec(3.86e-7)).toBe('3.86e-7 B/s');
  });

  it('selecting the dr cluster yields an empty graph of storage links', () => {
    const graph = deriveSankey(elements, 'both', 'dr');
    expect(graph.links).toEqual([]);
  });

  describe('cluster filter', () => {
    const two = twoClusterStorage();
    const linkValue = (
      graph: ReturnType<typeof deriveSankey>,
      source: string,
      target: string,
      direction: 'read' | 'write'
    ): number | undefined =>
      graph.links.find((l) => l.source === source && l.target === target && l.direction === direction)?.value;

    it('sums every cluster into the aggr→node link when no cluster is selected', () => {
      const graph = deriveSankey(two, 'read');
      expect(linkValue(graph, 'aggr-shared', 'ontap-01', 'read')).toBe(1000);
      expect(linkValue(graph, 'aggr-b-only', 'ontap-01', 'read')).toBe(500);
    });

    it('drops the other cluster’s pods and pvcs', () => {
      const graph = deriveSankey(two, 'read', 'a');
      const ids = graph.nodes.map((n) => n.id);
      expect(ids).toEqual(expect.arrayContaining(['pod-a', 'pvc-a']));
      expect(ids).not.toContain('pod-b');
      expect(ids).not.toContain('pvc-b');
      expect(graph.links.some((l) => l.source === 'pvc-b' || l.target === 'pvc-b')).toBe(false);
    });

    it('re-aggregates the aggr→node weight from the in-scope pvc links only', () => {
      const read = deriveSankey(two, 'read', 'a');
      expect(linkValue(read, 'aggr-shared', 'ontap-01', 'read')).toBe(100);
      const both = deriveSankey(two, 'both', 'a');
      expect(linkValue(both, 'aggr-shared', 'ontap-01', 'write')).toBe(10);
    });

    it('does not draw an aggr whose links are all out of scope', () => {
      const graph = deriveSankey(two, 'both', 'a');
      const ids = graph.nodes.map((n) => n.id);
      expect(ids).toContain('aggr-shared');
      expect(ids).toContain('ontap-01');
      // Storage tiers are not filtered BY cluster — `aggr-b-only` goes because nothing in
      // scope flows to it, not because it belongs to cluster b.
      expect(ids).not.toContain('aggr-b-only');
    });

    it('keeps a netapp-node reachable from an in-scope aggr', () => {
      const graph = deriveSankey(two, 'read', 'b');
      const ids = graph.nodes.map((n) => n.id);
      expect(ids).toEqual(expect.arrayContaining(['aggr-shared', 'aggr-b-only', 'ontap-01']));
      expect(linkValue(graph, 'aggr-shared', 'ontap-01', 'read')).toBe(900);
    });
  });

  it('computes a hover path through a pvc node', () => {
    const graph = deriveSankey(elements, 'both');
    const pvc = graph.nodes.find((n) => n.kind === 'pvc' && n.label === 'data-mongo-0');
    expect(pvc).toBeDefined();
    const path = hoverPathLinks(graph, pvc!.id);
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((l) => l.source === pvc!.id || l.target === pvc!.id)).toBe(true);
  });
});
