## Context

Graph search (`graph-search`) matches cytoscape node elements and fades the canvas through cytoscape classes. The Sankey views draw derived cards that are not 1:1 with elements (application / namespace cards, node wrappers, SVM frames, the Top pods cut, trace owner cards), fade through a `lit: HoverLit` set, and pan / zoom through `useZoomPan`. Hover already computes "the whole path through a card" per view.

## Goals / Non-Goals

**Goals:** the Graph search box and hit rule on both Sankey views; hits lit exactly as hover lights them; hover precedence; locate within the chart.

**Non-Goals:** searching undrawn nodes (cut pods, other layouts' wrappers); cross-view search state; animated viewport moves; changing Graph search behaviour.

## Decisions

### D1. One hit rule, two record sources

`matchRecords(records, query)` holds the tokenizer / AND / OR / `matchedField` / label ordering. A `SearchRecord` is `{ id, label, kind?, context?, fields }`; `computeHits` maps node elements to records and delegates, so its tests pin that Graph is unchanged. Each Sankey view builds records from what it draws (its layout / geometry), not from elements.

### D2. The shared hook takes records, rects and a path callback

`useSankeySearch({ records, rects, pathLit, fitToRect })` lives in `sankey-canvas` and stays domain-free: the view supplies the records, the content-space rect per id, and a stable `pathLit(ids)` over its derived graph. The view's `lit` is `hoverLit ?? search.lit`, which is the hover precedence.

### D3. Many-start path walks

A search for `pod` on the performance body hits ~1000 cards. `hoverPathLinks` scanned all links per visited node; `hoverPathLinksMany` indexes links once per graph (`WeakMap`) and shares visited sets across starts with the same claim constraint (SVM starts walk unconstrained, apart). Each step depends only on the node and the constraint, so the union is exact; the single-card functions delegate to it. The trace's `hoverPathMany` shares one visited set per direction likewise.

### D4. Locate frames, never navigates

`fitRectViewport(rect, container, { padding: 40, maxScale: 1 })` centres a rect and never enlarges past 1:1 (the opening viewport's rule). `SearchBar` already clears the query after `onLocate`, which ends the search. Clicking a card still Locates into Graph; choosing a result does not, because the user is still in the Sankey.

### D5. Input isolation

The overlay renders inside the chart host (the `overlay` slot), so key events reach the host's handler — `SearchBar` stops them and `useSankeyKeyboard` ignores inputs. The host's native wheel listener and React `onPointerDown` would still zoom / pan, so `useZoomPan` skips events inside `[data-zoom-pan-ignore]`.

## Risks / Trade-offs

- The search box covers the top-right of the chart at the opening viewport (the rightmost column header can sit under it). Accepted: the chart pans.
- No animation on locate, unlike Graph's 250 ms fit — the Sankey viewport has no animation anywhere.
- Records are rebuilt when the layout changes, so a hit on a card the new layout does not draw silently drops out while the query stays.
