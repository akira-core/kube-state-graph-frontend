import type cytoscape from 'cytoscape';

import { deriveLegendEntries } from './deriveLegendEntries';

function node(data: Record<string, unknown>): cytoscape.ElementDefinition {
  return { group: 'nodes', data };
}
const NONE = new Set<string>();

describe('deriveLegendEntries', () => {
  it('marks visible glyph kinds as shown and togglable', () => {
    const els = [node({ id: 'p1', kind: 'pod' }), node({ id: 's1', kind: 'service' })];
    expect(deriveLegendEntries(els, NONE, ['pod', 'service'])).toEqual([
      { kind: 'pod', hidden: false, togglable: true },
      { kind: 'service', hidden: false, togglable: true },
    ]);
  });

  it('keeps a filtered-out leaf kind in the list, flagged hidden', () => {
    const els = [node({ id: 'p1', kind: 'pod' }), node({ id: 's1', kind: 'service' })];
    expect(deriveLegendEntries(els, NONE, ['pod'])).toEqual([
      { kind: 'pod', hidden: false, togglable: true },
      { kind: 'service', hidden: true, togglable: true },
    ]);
  });

  it('re-adds a filtered-out kind that the glyph derivation dropped (collapse-hidden child)', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true }),
      node({ id: 'node/w0', kind: 'node', parent: 'cluster/prod' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/w0' }),
    ];
    const collapsed = new Set(['node/w0']);
    // pod visible → existing swap semantics: only the collapsed node glyph lists.
    expect(deriveLegendEntries(els, collapsed, ['pod', 'node'])).toEqual([
      { kind: 'node', hidden: false, togglable: true },
    ]);
    // pod filtered out → its row re-enters (hidden) so it can be restored.
    expect(deriveLegendEntries(els, collapsed, ['node'])).toEqual([
      { kind: 'node', hidden: false, togglable: true },
      { kind: 'pod', hidden: true, togglable: true },
    ]);
  });

  it('re-adds a filtered-out expanded-container kind (no glyph, but restorable)', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true }),
      node({ id: 'node/w0', kind: 'node', parent: 'cluster/prod' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/w0' }),
    ];
    // Expanded node container never lists while visible (swatch section owns it)…
    expect(deriveLegendEntries(els, NONE, ['pod', 'node'])).toEqual([{ kind: 'pod', hidden: false, togglable: true }]);
    // …but once filtered out it re-enters as a hidden row.
    expect(deriveLegendEntries(els, NONE, ['pod'])).toEqual([
      { kind: 'pod', hidden: false, togglable: true },
      { kind: 'node', hidden: true, togglable: true },
    ]);
  });

  it('marks the network wrapper and unknown kinds as non-togglable and never hidden', () => {
    const els = [
      node({ id: 'net', kind: 'network' }),
      node({ id: 'sw1', kind: 'switch', parent: 'net' }),
      node({ id: 'x1', kind: 'crd-from-the-future' }),
    ];
    // Neither 'network' nor the unknown kind is in visibleKinds — both stay
    // visible (computeVisibility never kind-filters them) and untogglable.
    expect(deriveLegendEntries(els, NONE, ['switch'])).toEqual([
      { kind: 'switch', hidden: false, togglable: true },
      { kind: 'crd-from-the-future', hidden: false, togglable: false },
    ]);
  });

  it('dedupes: a kind both glyph-derived and filtered-out elsewhere lists once', () => {
    const els = [node({ id: 'p1', kind: 'pod' }), node({ id: 'p2', kind: 'pod' })];
    expect(deriveLegendEntries(els, NONE, [])).toEqual([{ kind: 'pod', hidden: true, togglable: true }]);
  });
});
