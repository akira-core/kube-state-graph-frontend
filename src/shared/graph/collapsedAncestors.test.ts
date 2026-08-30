import type cytoscape from 'cytoscape';

import {
  buildParentIndex,
  collapsedAncestorChain,
  hasCollapsedAncestor,
  outermostCollapsedAncestor,
} from './collapsedAncestors';

const node = (id: string, parent?: string): cytoscape.ElementDefinition => ({
  group: 'nodes',
  data: { id, ...(parent !== undefined ? { parent } : {}) },
});
const edge = (id: string, source: string, target: string): cytoscape.ElementDefinition => ({
  group: 'edges',
  data: { id, source, target },
});

// cluster > application > controller > pod
const chain = [
  node('cluster'),
  node('app', 'cluster'),
  node('ctrl', 'app'),
  node('pod', 'ctrl'),
  node('elsewhere'),
  edge('e', 'pod', 'elsewhere'),
];

describe('buildParentIndex', () => {
  it('indexes each child id to its parent id, ignoring edges and roots', () => {
    const index = buildParentIndex(chain);
    expect(index.get('pod')).toBe('ctrl');
    expect(index.get('ctrl')).toBe('app');
    expect(index.get('app')).toBe('cluster');
    expect(index.has('cluster')).toBe(false);
    expect(index.has('elsewhere')).toBe(false);
  });
});

describe('hasCollapsedAncestor', () => {
  it('is false when no ancestor is collapsed', () => {
    const index = buildParentIndex(chain);
    expect(hasCollapsedAncestor(index, 'pod', new Set())).toBe(false);
  });

  it('is true when the immediate parent is collapsed', () => {
    const index = buildParentIndex(chain);
    expect(hasCollapsedAncestor(index, 'pod', new Set(['ctrl']))).toBe(true);
  });

  it('is true when a higher (multi-level) ancestor is collapsed', () => {
    const index = buildParentIndex(chain);
    expect(hasCollapsedAncestor(index, 'pod', new Set(['cluster']))).toBe(true);
  });

  it('is false for a root with no parent', () => {
    const index = buildParentIndex(chain);
    expect(hasCollapsedAncestor(index, 'cluster', new Set(['cluster']))).toBe(false);
  });

  it('terminates on a parent cycle instead of looping forever', () => {
    const index = buildParentIndex([node('x', 'y'), node('y', 'x')]);
    expect(hasCollapsedAncestor(index, 'x', new Set())).toBe(false);
    expect(hasCollapsedAncestor(index, 'x', new Set(['y']))).toBe(true);
  });
});

describe('outermostCollapsedAncestor', () => {
  it('returns null when nothing is collapsed', () => {
    const index = buildParentIndex(chain);
    expect(outermostCollapsedAncestor(index, 'pod', new Set())).toBeNull();
  });

  it('returns the single collapsed ancestor when only one is folded', () => {
    const index = buildParentIndex(chain);
    expect(outermostCollapsedAncestor(index, 'pod', new Set(['ctrl']))).toBe('ctrl');
  });

  it('returns the OUTERMOST collapsed ancestor when multiple levels are folded', () => {
    const index = buildParentIndex(chain);
    expect(outermostCollapsedAncestor(index, 'pod', new Set(['ctrl', 'cluster']))).toBe('cluster');
  });
});

describe('collapsedAncestorChain', () => {
  it('returns an empty chain when nothing is collapsed', () => {
    const index = buildParentIndex(chain);
    expect(collapsedAncestorChain(index, 'pod', new Set())).toEqual([]);
  });

  it('returns only the collapsed ancestors, OUTERMOST first', () => {
    const index = buildParentIndex(chain);
    expect(collapsedAncestorChain(index, 'pod', new Set(['ctrl', 'cluster']))).toEqual(['cluster', 'ctrl']);
  });

  it('skips a non-collapsed ancestor in the middle of the chain', () => {
    const index = buildParentIndex(chain);
    // app stays collapsed/expanded independently — only ctrl + cluster are folded here.
    expect(collapsedAncestorChain(index, 'pod', new Set(['cluster', 'app']))).toEqual(['cluster', 'app']);
  });
});
