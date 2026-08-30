import { clonePlain } from '../../shared/clone/clonePlain';
import { SHOWCASE_GRAPH } from '../../shared/fixtures/showcaseGraph';
import { normalizeGraph } from '../graph-data';

import { deriveSankey, formatBytesPerSec, hoverPathLinks } from './deriveSankey';

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

  it('computes a hover path through a pvc node', () => {
    const graph = deriveSankey(elements, 'both');
    const pvc = graph.nodes.find((n) => n.kind === 'pvc' && n.label === 'data-mongo-0');
    expect(pvc).toBeDefined();
    const path = hoverPathLinks(graph, pvc!.id);
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((l) => l.source === pvc!.id || l.target === pvc!.id)).toBe(true);
  });
});
