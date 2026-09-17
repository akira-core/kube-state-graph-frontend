## 1. Shared hit rule (design D1)

- [x] 1.1 Extract `matchRecords` / `tokenizeQuery` / `SearchRecord` from `computeHits` into `graph-search/matchRecords.ts` and make `computeHits` delegate; verify `computeHits.test.ts` passes unchanged and `matchRecords.test.ts` covers tokens, AND / OR, multi-valued fields, `matchedField`, ordering and the empty query
- [x] 1.2 Give `SearchBar` optional `testIdPrefix`, `placeholder`, `ariaLabel` and make `labelById` optional; verify `SearchBar.test.tsx` and `GraphView.test.tsx` pass and a case covers the new props

## 2. Viewport (design D4, D5)

- [x] 2.1 Add `Rect` / `unionRect` to `sankey-canvas/geometry.ts`, `fitRectViewport` and `ZoomPanApi.fitToRect` to `useZoomPan.ts`; verify `useZoomPan.test.ts` covers centring, the 1:1 cap, padding, `MIN_SCALE` and a zero container
- [x] 2.2 Skip wheel zoom and drag pan for events inside `[data-zoom-pan-ignore]`; verify a view test wheels and drags on the search box without moving the viewport (and fails with the guard removed)

## 3. Path unions (design D3)

- [x] 3.1 Add the indexed `hoverPathLinksMany` and delegate `hoverPathLinks` / `hoverPathForWrapper` / `hoverPathForFrame` to it; verify it equals the union of single-card walks on the fixture with and without claim aggregates and under `Group`, and every existing hover test passes
- [x] 3.2 Add `hoverPathMany` and delegate `hoverPath`; verify equality with the union of `hoverPath` over every card of every trace sample in both layouts

## 4. Records and wiring (design D2)

- [x] 4.1 Add `sankeySearchRecords` / `sankeyCardRects` / `sankeyPathLit` (storage) and `traceSearchRecords` / `traceCardRects` (trace); verify unit tests for drawn-only records, wrappers / frames, the NetApp cluster and client fields
- [x] 4.2 Add `useSankeySearch` and `SankeySearchOverlay` to `sankey-canvas`; wire both views with `lit = hoverLit ?? search.lit` and the overlay beside the control bar; verify `SankeyView.test.tsx` and `TraceView.test.tsx` cover hit paths, zero hits, wrappers, hover precedence, locate without Graph navigation, debounced fit, shortcut isolation and query survival across a refresh
- [x] 4.3 Add the search bound to `sankeyPerformance.test.ts`; verify matching and lighting every pod of the synthetic body takes ≤ 100 ms

## 5. Verify

- [x] 5.1 Run `npm run typecheck && npm run lint && npm run test:ci` and `openspec validate sankey-card-search --strict`; verify all are green
