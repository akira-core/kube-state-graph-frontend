import type cytoscape from 'cytoscape';

import { buildChildrenByParent, collectDescendantIds } from './childrenByParent';

const node = (id: string, parent?: string): cytoscape.ElementDefinition => ({
  group: 'nodes',
  data: { id, ...(parent !== undefined ? { parent } : {}) },
});
const edge = (id: string, source: string, target: string): cytoscape.ElementDefinition => ({
  group: 'edges',
  data: { id, source, target },
});

describe('buildChildrenByParent', () => {
  it('indexes children under their parent in payload order, ignoring edges and roots', () => {
    const index = buildChildrenByParent([
      node('cluster'),
      node('a', 'cluster'),
      node('b', 'cluster'),
      node('orphan'),
      edge('e', 'a', 'b'),
    ]);
    expect(index.get('cluster')).toEqual(['a', 'b']);
    expect(index.has('orphan')).toBe(false);
  });

  it('returns an empty index for elements with no nesting', () => {
    expect(buildChildrenByParent([node('a'), node('b')]).size).toBe(0);
  });
});

describe('collectDescendantIds', () => {
  const chain = [node('cluster'), node('ns', 'cluster'), node('ctrl', 'ns'), node('pod', 'ctrl'), node('elsewhere')];

  it('walks the whole subtree transitively, excluding the seed itself', () => {
    const index = buildChildrenByParent(chain);
    expect([...collectDescendantIds(index, ['ns'])].sort()).toEqual(['ctrl', 'pod']);
    expect([...collectDescendantIds(index, ['cluster'])].sort()).toEqual(['ctrl', 'ns', 'pod']);
  });

  it('returns nothing for a leaf seed or an unknown id', () => {
    const index = buildChildrenByParent(chain);
    expect(collectDescendantIds(index, ['pod']).size).toBe(0);
    expect(collectDescendantIds(index, ['nope']).size).toBe(0);
  });

  it('unions multiple seeds without revisiting shared subtrees', () => {
    const index = buildChildrenByParent(chain);
    expect([...collectDescendantIds(index, ['cluster', 'ns', 'ctrl'])].sort()).toEqual(['ctrl', 'ns', 'pod']);
  });

  it('terminates on a parent cycle instead of looping forever', () => {
    // Defensive: cytoscape would reject a real cycle, but the walk must not hang if
    // upstream ever emits one.
    const index = buildChildrenByParent([node('x', 'y'), node('y', 'x')]);
    expect([...collectDescendantIds(index, ['x'])].sort()).toEqual(['x', 'y']);
  });
});
