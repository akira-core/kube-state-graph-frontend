## Why

The Graph view has a search box; the two Sankey views (Storage flow and Network trace) do not. On a large storage body or a wide trace, finding "where does `mongo-0` flow" means panning around and hovering cards one by one. Hover already answers the question for a single card — it lights that card's whole path — so search should answer it the same way for every card that matches a query.

## What Changes

- **A card search box on both Sankey views**, top-right over the chart, the same `SearchBar` as Graph (same result list, keyboard, 300 ms debounce, two-stage Esc).
- **Same hit rule as Graph.** Whitespace tokens, case-insensitive substring, AND across tokens, any field per token. The tokenizer/matcher is extracted from `computeHits` into `matchRecords` and shared; Graph behaviour is unchanged.
- **Only drawn cards are searchable.** Storage: every card plus every wrapper the current layout draws (Kubernetes node frames under `Node`, SVM frames under `Group`), by label, kind, namespace and NetApp cluster. Trace: every placed card plus every node frame, by label, role (a leaf by its wire type), namespace, NetApp cluster, tier, k8s node, owner and each client's ip / hostname / owner.
- **Hits light their whole paths.** While a query is typed, every hit's hover path (union) stays lit and everything else fades through the same `lit` mechanism hover uses; a query with no hits fades everything.
- **Hover takes over temporarily.** Hovering a card while searching shows that card's path alone; leaving hands the chart back to the search highlight.
- **Locate stays in the chart.** Choosing a result frames that card (never enlarged past 1:1) and clears the query; it does not navigate to Graph the way clicking a card does. Typing pauses / Enter with no row highlighted fit the chart to every hit.
- **The box owns its input.** Wheel over the result list scrolls it, pressing in the box never starts a pan, and typing never triggers the chart shortcuts.
- **The query is page-transient**: not in the URL, not persisted, kept across refresh / layout / mode / order / focus changes.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `sankey-canvas`: a new requirement "Card search overlay" for the shared hook, overlay, hit highlight, hover precedence, locate / fit and input isolation.
- `storage-flow-sankey`: a new requirement "Card search" for what is searchable and how wrappers / frames light.
- `network-trace`: a new requirement "Card search" for the trace's searchable fields.

## Impact

- `src/features/graph-search`: `matchRecords` / `tokenizeQuery` extracted; `SearchBar` gains optional `testIdPrefix`, `placeholder`, `ariaLabel`, and `labelById` becomes optional.
- `src/features/sankey-canvas`: `useSankeySearch`, `SankeySearchOverlay`, `Rect` / `unionRect`, `fitRectViewport`, `ZoomPanApi.fitToRect`, the `data-zoom-pan-ignore` guard.
- `src/features/storage-flow-sankey`: `hoverPathLinksMany` (indexed, many-start walk; the single-card functions delegate to it), `sankeySearch.ts`, `SankeyView` wiring.
- `src/features/network-trace`: `hoverPathMany`, `traceSearch.ts`, `TraceView` wiring.
- No request, URL, fixture or backend change.
