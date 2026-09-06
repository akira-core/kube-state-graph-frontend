import { renderHook } from '@testing-library/react';
import cytoscape from 'cytoscape';
import type { MutableRefObject } from 'react';

import { FADED_CLASS } from '../styles/getStylesheet';

import { applyGraphFade, useGraphFade, type GraphFadeInput } from './useGraphFade';

// cluster > node > pod, with a pvc neighbour of the pod and a far-away switch.
// styleEnabled so visibility styles (and `.visible()`) are live, as in production —
// cytoscape short-circuits `.visible()` to true when styling is off.
function makeCy(): cytoscape.Core {
  return cytoscape({
    headless: true,
    styleEnabled: true,
    elements: [
      { group: 'nodes', data: { id: 'cluster/prod', isCluster: true } },
      { group: 'nodes', data: { id: 'node/w0', kind: 'node', parent: 'cluster/prod' } },
      { group: 'nodes', data: { id: 'pod/a', kind: 'pod', parent: 'node/w0' } },
      { group: 'nodes', data: { id: 'pvc/a', kind: 'pvc', parent: 'cluster/prod' } },
      { group: 'nodes', data: { id: 'sw/x', kind: 'switch' } },
      { group: 'edges', data: { id: 'e-mount', source: 'pod/a', target: 'pvc/a', edgeType: 'pod-mounts-pvc' } },
      { group: 'edges', data: { id: 'e-far', source: 'node/w0', target: 'sw/x', edgeType: 'node-to-switch' } },
    ],
  });
}

const NO_HITS: ReadonlySet<string> = new Set();

// Idle input: nothing selected, no query. Tests override only what they exercise.
const fade = (cy: cytoscape.Core, over: Partial<GraphFadeInput> = {}): void =>
  applyGraphFade(cy, {
    selectedId: null,
    searchActive: false,
    searchLitNodeIds: NO_HITS,
    ...over,
  });

const faded = (cy: cytoscape.Core): string[] =>
  cy
    .elements(`.${FADED_CLASS}`)
    .map((e) => e.id())
    .sort();

const allIds = (cy: cytoscape.Core): string[] =>
  cy
    .elements()
    .map((e) => e.id())
    .sort();

describe('applyGraphFade — focus fade (no query)', () => {
  it('fades nothing when the selection is null', () => {
    const cy = makeCy();
    fade(cy, { selectedId: 'pod/a' });
    fade(cy, { selectedId: null });
    expect(faded(cy)).toEqual([]);
    cy.destroy();
  });

  it('keeps the selected node, its edge, neighbour and ancestors lit; fades the rest', () => {
    const cy = makeCy();
    fade(cy, { selectedId: 'pod/a' });
    // pod/a (selected), pvc/a (neighbour), e-mount (incident edge), node/w0 +
    // cluster/prod (ancestors) stay lit. The far switch + its edge fade.
    expect(faded(cy)).toEqual(['e-far', 'sw/x']);
    cy.destroy();
  });

  it('keeps a selected container’s children lit', () => {
    const cy = makeCy();
    fade(cy, { selectedId: 'node/w0' });
    // node/w0 selected: its child pod/a stays lit (descendant). pvc/a is a sibling under
    // the cluster (an ancestor of w0), so the cluster is lit but pvc/a is neither
    // neighbour nor descendant → faded.
    expect(faded(cy)).toContain('pvc/a');
    expect(faded(cy)).not.toContain('pod/a');
    cy.destroy();
  });

  it('clears stale fades on re-apply', () => {
    const cy = makeCy();
    fade(cy, { selectedId: 'sw/x' });
    fade(cy, { selectedId: 'pod/a' });
    // sw/x is now outside pod/a's focus, so it must be faded; pod/a must not be.
    expect(faded(cy)).toContain('sw/x');
    expect(faded(cy)).not.toContain('pod/a');
    cy.destroy();
  });

  it('fades nothing when the selected node is hidden by the filter', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: [
        { group: 'nodes', data: { id: 'pod/igw', kind: 'pod' } },
        { group: 'nodes', data: { id: 'pod/a', kind: 'pod' } },
        { group: 'nodes', data: { id: 'pod/b', kind: 'pod' } },
        { group: 'edges', data: { id: 'e-ab', source: 'pod/a', target: 'pod/b', edgeType: 'pod-calls-pod' } },
      ],
    });
    // The ingress toggle (or a kind/edge-type filter) hides the SELECTED node.
    cy.getElementById('pod/igw').style('visibility', 'hidden');
    fade(cy, { selectedId: 'pod/igw' });
    // Nothing may fade: dimming around an invisible node leaves the whole graph at
    // reduced opacity with nothing lit to explain why.
    expect(faded(cy)).toEqual([]);
    cy.destroy();
  });

  it('fades nothing when the selected node is hidden via a filtered-out ancestor', () => {
    // cytoscape's effective visibility is the AND over ancestors, so a node whose
    // container was filtered out is off-canvas despite its own style being 'visible'.
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: [
        { group: 'nodes', data: { id: 'ctrl/igw' } },
        { group: 'nodes', data: { id: 'pod/igw', kind: 'pod', parent: 'ctrl/igw' } },
        { group: 'nodes', data: { id: 'pod/a', kind: 'pod' } },
        { group: 'nodes', data: { id: 'pod/b', kind: 'pod' } },
        { group: 'edges', data: { id: 'e-ab', source: 'pod/a', target: 'pod/b', edgeType: 'pod-calls-pod' } },
      ],
    });
    cy.getElementById('ctrl/igw').style('visibility', 'hidden');
    expect(cy.getElementById('pod/igw').style('visibility')).toBe('visible'); // own style only
    fade(cy, { selectedId: 'pod/igw' });
    expect(faded(cy)).toEqual([]);
    cy.destroy();
  });
});

describe('applyGraphFade — miss fade (query active)', () => {
  it('ignores the hit set entirely while the query is empty', () => {
    const cy = makeCy();
    fade(cy, { searchActive: false, searchLitNodeIds: new Set(['pod/a']) });
    expect(faded(cy)).toEqual([]);
    cy.destroy();
  });

  it('a hit lights its full focus neighborhood — 1-hop neighbour NODES included, same as a click', () => {
    const cy = makeCy();
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['pod/a']) });
    // pod/a (hit) lights exactly what clicking it would: e-mount + pvc/a (closed
    // neighborhood — the neighbour NODE stays lit, not just the edge into it), plus
    // node/w0 + cluster/prod as ancestors. Only the far switch + its edge fade.
    expect(faded(cy)).toEqual(['e-far', 'sw/x']);
    cy.destroy();
  });

  it('no lit edge ends in a faded node', () => {
    const cy = makeCy();
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['pod/a']) });
    const litEdges = cy.edges().filter((e) => !e.hasClass(FADED_CLASS));
    expect(litEdges.length).toBeGreaterThan(0);
    for (const edge of litEdges) {
      expect(edge.source().hasClass(FADED_CLASS)).toBe(false);
      expect(edge.target().hasClass(FADED_CLASS)).toBe(false);
    }
    cy.destroy();
  });

  it('a PROXY container lights its neighbourhood AND its descendants, same as clicking it', () => {
    const cy = makeCy();
    // node/w0 stands in as the proxy for a collapsed pod. Clicking node/w0 lights its own
    // incident edge e-far + neighbour sw/x, its descendant pod/a, and its ancestor
    // cluster/prod. pvc/a is a descendant's neighbour, not the container's → faded, with
    // e-mount faded alongside it (matching the focus-fade container test above).
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['node/w0']) });
    expect(faded(cy)).toEqual(['e-mount', 'pvc/a']);
    cy.destroy();
  });

  it('fades EVERYTHING on a zero-hit query', () => {
    const cy = makeCy();
    fade(cy, { searchActive: true });
    expect(faded(cy)).toEqual(allIds(cy));
    cy.destroy();
  });

  it('fades EVERYTHING on a zero-hit query even when a node is selected', () => {
    const cy = makeCy();
    // "No results" must read as no results — a live selection may not leave a lit island.
    fade(cy, { searchActive: true, selectedId: 'pod/a' });
    expect(faded(cy)).toEqual(allIds(cy));
    cy.destroy();
  });

  it('a selection carried in from before the query does NOT light its neighborhood', () => {
    const cy = makeCy();
    // pod/a was selected before the user typed; the detail panel's × leaves the selection
    // set. Only sw/x matches, so pod/a and its own neighbourhood must read as misses —
    // sw/x's focus set (e-far + neighbour node/w0 + its ancestor) is all that lights.
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['sw/x']), selectedId: 'pod/a' });
    expect(faded(cy)).toEqual(['e-mount', 'pod/a', 'pvc/a']);
    cy.destroy();
  });

  it('a selection that is ALSO a hit reads identically to the hit alone (selectedId adds nothing)', () => {
    const cy = makeCy();
    // There is no locate focus anymore: locate clears the query, so this state (query
    // active AND a selection) only arises from a stale pre-search selection, never from
    // locate itself. selectedId must never alter miss fade — pod/a being both the hit and
    // the selection must produce byte-identical output to the hit alone (see the "full
    // focus neighborhood" test above).
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['pod/a']), selectedId: 'pod/a' });
    expect(faded(cy)).toEqual(['e-far', 'sw/x']);
    cy.destroy();
  });

  it('clears stale fades on re-apply while the query is active', () => {
    const cy = makeCy();
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['sw/x']) });
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['pod/a']) });
    expect(faded(cy)).toContain('sw/x');
    expect(faded(cy)).not.toContain('pod/a');
    cy.destroy();
  });

  it('clearing the query restores the focus fade for the standing selection', () => {
    const cy = makeCy();
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['sw/x']), selectedId: 'pod/a' });
    expect(faded(cy)).toContain('pod/a');
    fade(cy, { selectedId: 'pod/a' });
    // Focus fade is back: pod/a's neighborhood is lit, the far switch fades.
    expect(faded(cy)).toEqual(['e-far', 'sw/x']);
    cy.destroy();
  });
});

// Reproduces the reported bug shape: two nodes whose LABELS overlap (e.g. `gateway` /
// `mesh-gateway`) so a single query would hit both, but they are not graph neighbours.
// After locate, the query is cleared (searchActive: false) — this is pure focus fade,
// exercising that the OTHER former hit gets no special treatment: it fades like any
// unrelated node, exactly as if it had never matched anything.
describe('applyGraphFade — after locate, an unrelated former hit is just another miss', () => {
  function makeOverlappingLabelsCy(): cytoscape.Core {
    return cytoscape({
      headless: true,
      styleEnabled: true,
      elements: [
        { group: 'nodes', data: { id: 'pod/gateway', kind: 'pod' } },
        { group: 'nodes', data: { id: 'node/w0', kind: 'node' } },
        { group: 'nodes', data: { id: 'pod/mesh-gateway', kind: 'pod' } },
        { group: 'nodes', data: { id: 'node/w1', kind: 'node' } },
        { group: 'edges', data: { id: 'e-gw', source: 'pod/gateway', target: 'node/w0', edgeType: 'pod-to-node' } },
        {
          group: 'edges',
          data: { id: 'e-mesh', source: 'pod/mesh-gateway', target: 'node/w1', edgeType: 'pod-to-node' },
        },
      ],
    });
  }

  it('lights only the located node’s own neighborhood; the other former hit and its edge fade', () => {
    const cy = makeOverlappingLabelsCy();
    // Locate ended the search: searchActive is false, selectedId is the located node.
    fade(cy, { selectedId: 'pod/gateway' });
    expect(faded(cy)).toEqual(['e-mesh', 'node/w1', 'pod/mesh-gateway']);
    cy.destroy();
  });

  it('WHILE TYPING, every hit lights its 1-hop neighbours — the reported multi-hit bug shape', () => {
    const cy = makeOverlappingLabelsCy();
    // Query `gateway` hits both pods. The old lit set kept both pod-to-node edges lit but
    // faded node/w0 and node/w1 at their far ends — lit edges dangling into faded nodes.
    // Each hit now lights its full focus neighborhood, so nothing here fades at all.
    fade(cy, { searchActive: true, searchLitNodeIds: new Set(['pod/gateway', 'pod/mesh-gateway']) });
    expect(faded(cy)).toEqual([]);
    cy.destroy();
  });
});

describe('useGraphFade — collapse changes re-apply the pass', () => {
  // Expanding a container brings children back onto the canvas WITHOUT the imperative
  // fade classes. The pass must re-run on the collapse signal alone — depending on
  // `elements` to change identity at the same moment is incidental, and memoising the
  // element pipeline would make those children surface unfaded, reading as lit.
  function setup() {
    const cy = makeCy();
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;
    // Deliberately ONE stable array identity across every rerender.
    const elements: cytoscape.ElementDefinition[] = [];
    const render = (collapseToken: number) =>
      renderHook(
        (props: { collapseToken: number }) =>
          useGraphFade({
            cyRef,
            isReady: true,
            elements,
            selectedId: 'pod/a',
            searchActive: false,
            searchLitNodeIds: NO_HITS,
            collapseToken: props.collapseToken,
          }),
        { initialProps: { collapseToken } }
      );
    return { cy, render };
  }

  it('re-applies fade when only collapseToken changes', () => {
    const { cy, render } = setup();
    const { rerender } = render(0);
    const initial = faded(cy);
    expect(initial.length).toBeGreaterThan(0);

    // Simulate expand-collapse dropping the imperative classes.
    cy.elements().removeClass(FADED_CLASS);
    expect(faded(cy)).toEqual([]);

    rerender({ collapseToken: 1 });
    expect(faded(cy)).toEqual(initial);
  });

  it('does not re-apply when nothing changed (proves the token is doing the work)', () => {
    const { cy, render } = setup();
    const { rerender } = render(0);
    expect(faded(cy).length).toBeGreaterThan(0);

    cy.elements().removeClass(FADED_CLASS);
    rerender({ collapseToken: 0 });
    expect(faded(cy)).toEqual([]);
  });
});
