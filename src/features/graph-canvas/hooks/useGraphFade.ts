import type cytoscape from 'cytoscape';
import { useEffect } from 'react';

import { FADED_CLASS } from '../styles/getStylesheet';

export interface GraphFadeInput {
  // Current selection (canvas tap or locate). Drives FOCUS fade while no query is active.
  // Locate always leaves the query empty (locate-ends-search), so by the time a locate's
  // selection is visible here `searchActive` is already false — locate reads through this
  // same field, with no separate "locate focus" concept.
  selectedId: string | null;
  // True while the search query is non-empty (design D3) — distinct from an empty
  // `searchLitNodeIds`, which under an active zero-hit query fades the WHOLE graph.
  searchActive: boolean;
  // Hit nodes with proxy-hit substitution already applied (resolveSearchHits). Only read
  // while `searchActive`; each hit lights its focus neighborhood (focusSetOf — the same
  // set a canvas click would light). `selectedId` never alters this — a selection carried
  // in from before the query (the detail panel's × leaves it set) must not light an
  // unrelated island next to the hits.
  searchLitNodeIds: ReadonlySet<string>;
}

export interface UseGraphFadeProps extends GraphFadeInput {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  // Gates the first apply until the instance exists, and re-applies after a rebuild
  // (mode flip / data refresh) drops the imperative classes.
  isReady: boolean;
  elements: cytoscape.ElementDefinition[];
  // Dep-only: re-runs the pass when the filter changes, since the visibility of the
  // selected / located node decides whether a fade is applied at all and hiding it changes
  // no other input here. Never read — useElementFilter owns applying these sets.
  visibility?: unknown;
  // Dep-only: bumps when the collapsed set's CONTENT changes. Expanding a container brings
  // children onto the canvas without imperative classes, so the pass has to run again or
  // they surface unfaded — reading as lit. This must be its own input: leaning on
  // `elements` changing identity at the same moment is incidental, and any memoisation or
  // reference-reuse in the element pipeline would silently break the re-apply.
  collapseToken?: number;
}

// The ONE definition of "what lights up around a node" (design D6), over a whole node
// collection: the nodes themselves, their incident edges and neighbour nodes
// (closedNeighborhood), their own descendants (so a container keeps its children lit),
// and the ancestor containers of all of those (so a lit node never sits inside a dimmed
// box). Focus fade feeds it the single selection; miss fade feeds it the hit collection —
// sharing it is what makes "lit = what a click would light" hold everywhere, and makes a
// lit edge ending in a faded node structurally impossible.
function focusSetOf(nodes: cytoscape.NodeCollection): cytoscape.Collection {
  const core = nodes.closedNeighborhood().union(nodes.descendants());
  return core.union(core.ancestors());
}

// Single-selection wrapper around focusSetOf.
//
// Returns null when the node is not on canvas — REMOVED (empty) or merely HIDDEN by the
// kind / edge-type / ingress filter. `.visible()` (not `.style(...)`) is the right
// predicate: cytoscape's effective visibility ANDs a node with its ancestors, so this also
// covers a node whose container was filtered out. Fading around an invisible node would
// dim the whole graph with nothing lit to explain why.
export function focusSetFor(cy: cytoscape.Core, nodeId: string): cytoscape.Collection | null {
  const node = cy.getElementById(nodeId);
  if (node.empty() || !node.visible()) {
    return null;
  }
  return focusSetOf(node);
}

// The elements that stay lit, or null when nothing fades at all (no selection, or a
// selection that is off canvas).
function litSet(cy: cytoscape.Core, input: GraphFadeInput): cytoscape.Collection | null {
  const { selectedId, searchActive, searchLitNodeIds } = input;

  // Focus fade — no query: dim everything outside the selected node's focus set. This is
  // also what a just-completed locate renders through, since locate clears the query.
  if (!searchActive) {
    return selectedId === null ? null : focusSetFor(cy, selectedId);
  }

  // Miss fade — query active: every hit lights its focus neighborhood, exactly like a
  // canvas click on it would (`selectedId` never alters this — see the field doc on
  // `searchLitNodeIds`). An empty hit collection yields an empty (not absent) lit set,
  // so a zero-hit query fades the whole graph.
  const hits = cy.nodes().filter((node) => searchLitNodeIds.has(node.id()));
  return focusSetOf(hits);
}

// One fade, two mutually exclusive reasons (CONTEXT.md "focus fade" / "miss fade"): dim
// every element outside the lit set via FADED_CLASS. Class-toggle only — no removal, no
// layout run, no computeVisibility involvement. Computing both reasons here is what makes
// their mutual exclusivity structural rather than a flag two hooks have to honour.
export function applyGraphFade(cy: cytoscape.Core, input: GraphFadeInput): void {
  // Resolve the lit set BEFORE opening the batch. `focusSetFor` reads `.visible()`, and
  // cy.batch() defers style application: an element whose style has not been computed yet
  // reads back as invisible inside a batch — and cytoscape caches that answer for the
  // current style version. Batch the class mutations only.
  const lit = litSet(cy, input);
  cy.batch(() => {
    cy.elements().removeClass(FADED_CLASS);
    if (lit === null) {
      return;
    }
    cy.elements().difference(lit).addClass(FADED_CLASS);
  });
}

// MUST be declared after useElementFilter in GraphCanvas: `focusSetFor` reads `.visible()`,
// which is only current once that commit's filter styles have been applied.
export function useGraphFade({
  cyRef,
  isReady,
  elements,
  visibility,
  selectedId,
  searchActive,
  searchLitNodeIds,
  collapseToken,
}: UseGraphFadeProps): void {
  useEffect(() => {
    const cy = cyRef.current;
    if (cy === null) {
      return;
    }
    applyGraphFade(cy, { selectedId, searchActive, searchLitNodeIds });
    // isReady/elements re-run this once the instance exists and after rebuilds; `visibility`
    // re-runs it when a filter hides or restores the selected / located node;
    // `collapseToken` re-runs it when folding or unfolding changes which elements exist.
  }, [cyRef, isReady, elements, visibility, selectedId, searchActive, searchLitNodeIds, collapseToken]);
}
