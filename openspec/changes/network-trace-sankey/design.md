## Context

See `proposal.md` — Why, and `plan.md` for the full integration plan this design condenses. The pieces this design touches, as they stand today:

- **One normalize boundary, two endpoints.** `normalizeGraph` already maps `type → kind` (unknown kinds survive), keeps `labels` verbatim (`tier`, `source_iface`, `target_iface` included), passes `parent` / `status` / `usage` / `health` / `hardware` / `perf` / `alerts` through, and falls back to `id` when `name` is missing. What it does not read is exactly the network extension: `metrics.delta_bps`, node `investigation`, `clients`, `other_in_bps` / `other_out_bps`.
- **`EdgeMetrics` is a two-member union**, and the storage code narrows it with `'rate' in metrics` (`deriveSankey.ts`, `topPods.ts`, `showcaseGraph.test.ts`), treating the remainder as `EdgeIoMetrics`.
- **Pages own their loader.** `GraphPage` / `SankeyPage` each hold one `useGraphLoader`, `useAppliedScope` + `useDraft` + `useSeedTimeOnMount`, and commit the draft through one canonical URL writer (`explicit-query`).
- **The presentation primitives live inside `storage-flow-sankey`**: `useZoomPan` (with `openingViewport` / `fitViewport`), `SankeyControlBar`, the geometry constants and `ribbonPath` / `stackHeight` / `placeStack` inside `layoutSankey.ts`, the SVG host and `nodeCard` / `wrapperBox` inside `SankeyChart.tsx`, and the tooltip positioning, keyboard handler, `ResizeObserver` hook and status legend inside `SankeyView.tsx`.
- **`sankey-panel`** is a React + TS project with its own `validate.ts` (whole-document failure), `build()` pipeline (classify → index → investigation → scan → edges → prune → columns → residuals → wrappers → assemble), `layout()` (geometry, `order: 'flow' | 'barycenter'`), SVG components with CSS class styling, `createZoom`, a delegated `data-tip` tooltip, `body.chart-focus` focus mode and a palette in `layout/colors.ts`.

Constraints: strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); no new runtime dependency; `storage-flow-sankey` behaviour and rendered SVG unchanged; theme tokens instead of hex; URL parameter names mirror the backend request names; demo mode keeps scope in component state.

## Goals / Non-Goals

**Goals:**

- The Network category renders the `sankey-panel` trace with every feature it has, from one payload shared by its Graph and Sankey views, through the existing loader, scope and time-range machinery.
- Every presentation capability exists once in the repository; the network view contributes only domain logic.
- Existing payloads, tests and e2e specs for the storage view pass unchanged except for import paths and the regenerated stylesheet snapshot.

**Non-Goals:**

- Porting `sankey-panel`'s app shell, fetch layer, URL handling, zoom, tooltip, focus, CSS, palette, `channels` (read / write) option, storage `roots` option, SSR `static.ts`, or Electron shell.
- Any backend change; the trace endpoint contract is taken as documented.
- A Network-specific Graph layout (the `switch-topology` tier layout reads `labels.level`; mapping `labels.tier` onto it is a possible follow-up).

## Decisions

### D1. Normalize is extended additively; the metrics type becomes an intersection

`normalizeGraph` learns the four network fields and nothing else changes: `parseIoMetrics` reads `delta_bps` (finite, ≥ 0) into `deltaBps`; `parseNodes` gains `parseInvestigation`, `parseClients` and `parseNonNegativeBps` for `other_in_bps` / `other_out_bps`. The Sankey model is derived from the normalized elements (`deriveTrace(elements, opts)`), the same pattern as `deriveSankey`; no raw payload is retained and no second parser exists.

The type is widened without a third union member:

```ts
interface EdgeFlowMetrics {
  deltaBps?: number; // bits/s, >= 0
}
type EdgeMetrics = EdgeRedMetrics | (EdgeIoMetrics & EdgeFlowMetrics);
```

`EdgeIoMetrics & EdgeFlowMetrics` is assignable to `EdgeIoMetrics`, so every existing `'rate' in metrics` narrowing still types the remainder as the I/O family; the trace side discriminates with `typeof m.deltaBps === 'number'`. `parseEdgeMetrics` keeps its order (a present `rate` still selects the RED family), and `delta_bps` is read inside the I/O branch.

_Alternative — a third union member `EdgeFlowMetrics`._ Rejected: every storage narrowing site fails to typecheck, and the repair would touch storage code this change promises not to change.

_Alternative — keep the raw wire document for the trace view and port `validate.ts` whole._ Rejected: two parsers for one wire shape, and the Graph view would draw elements the Sankey never saw.

### D2. One category page, `/network/:view`, one loader

`NetworkPage` is mounted for both `/network/graph` and `/network/sankey` (`<Route path="network/:view">`); `useParams().view` selects the child. It holds one `useGraphLoader({ demoPayload: SHOWCASE_TRACE, refreshIntervalSeconds })`, one `useAppliedScope(parseTraceScope, serializeTraceScope)`, one `useDraft`, one `useSeedTimeOnMount`. Switching the view changes the route parameter only: the page and its loader stay mounted, `state.elements` / `hasPayload` are retained and no request is issued. Switching **category** (`/graph` ↔ `/network/*`) is still switch = reset. The nav bar's Network view links carry `location.search` so the applied scope survives the switch; category links are bare paths.

`/network` redirects to `/network/graph` with `replace`, keeping the search string; a `view` other than `graph` / `sankey` renders the exported `NotFoundPage` inside `NetworkPage`, so the nav bar keeps its Network state. `AppLayout` learns `isNetwork` / `isNetworkGraph` / `isNetworkSankey` for the tab title, the focus-mode reset (`!isSankey && !isNetworkSankey`), `notFound` (`!isNetwork`) and the refresh-interval condition.

_Alternative — two pages each with their own loader, like Storage._ Rejected: the whole point of the category is one payload seen two ways; two loaders mean two requests for one question and a Locate that lands on a page that has to fetch first.

### D3. The draft holds raw strings; a URL value is never silently altered

`TraceDraft` is `{ hostname, maxHops, topN, threshold, trackDir }` with the numeric fields as **strings**, following `sankey-panel`'s `TraceQueryBar` convention: empty = default, wrong = refuse to send and say why, never rewrite. `parseTraceScope(params)` maps a missing key to `''` (= default) and keeps an invalid raw value in the draft while pushing a `problems` entry; `buildTraceQuery(draft)` returns `{ ok: true, query }` or `{ ok: false, problems }` and is the only place the strings become numbers. `serializeTraceScope` writes `hostname` only when non-empty, a number only when it differs from its default, `track_dir` only when `destination`, and `min_bps` only when > 0. `min_bps` is a scope-level view value (`cleanMinBps`: floor, > 0 else 0), committed through the same writer as `top_pods` is on the storage page. `useDraft`'s deep equality over strings is sufficient.

On mount with invalid URL values, `applied.problems` are shown in the scope bar (`data-testid="trace-scope-problem"`), Query is disabled until the draft is valid, and no request is ever assembled from an invalid value.

_Alternative — parse to numbers on read and clamp._ Rejected: a clamped value is a request the operator did not ask for, and the URL would then claim a scope nobody typed.

### D4. Direction comes from the request's `track_dir`; the payload only warns

`resolveTraceDirection(trackDir, elements)` returns `{ direction, warning? }`: `source` means the investigated counter is an **out** interface, the trace walks upstream against edge direction and the start hop is pinned to the rightmost column; `destination` means an **in** interface, the walk follows edges and the start is leftmost. Packets always flow left to right and edges are always written `source` = upstream. When the start node's `investigation.direction` disagrees (`in` with `source`, `out` with `destination`) the model carries a warning and the request's value wins. The wire's top-level `kind`, the deprecated top-level `investigation`, `apiVersion` and `clusters` are not read.

### D5. Channels and roots are dropped; only `network-flow` edges draw

`FLOW_EDGE_TYPES = ['network-flow']`. `storage-flow` edges (and every other type) are ignored without error — a storage payload fed to the network view yields the "nothing drawable" model error, not a crash. The `channels` (read / write) option, `hiddenChannel`, `unit`, `roots` and `rootLeafPods` do not exist in the port; `nsEdges: Record<channel, …>` collapses to a single `nsEdge`. Weight is `deltaBps` only; an edge without it is not drawn but still counts as "an edge exists" for the leaf-pod / proxy-pod and no-flow decisions. Placement edges (`labels.tier === 'pod-node'` or `edgeType === 'pod-to-node'`) never draw; they only mark the k8s nodes that carry no traffic.

The `validate.ts` semantic checks land as follows:

| `sankey-panel` check                                                                                                                                                                                          | Where it lands here                          | Outcome                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| Root not an object; `elements` / `nodes` / `edges` missing or not arrays; entry not `{ data }`; `id` / `type` missing or empty; duplicate `id`; edge endpoint not in `nodes`                                  | `normalizeGraph`'s existing checks           | Partial parse: the entry is skipped and an `errors` entry is recorded |
| `clients` not an array; `other_in_bps` / `other_out_bps` negative or not a number; `investigation` not an object, `iface` missing, `delta_bps` not > 0, `direction` not `in` / `out`, `note` not a string     | New normalize parsers                        | The field is dropped **and** an `errors` entry is recorded            |
| More than one node carrying `investigation`; the start node not a hop kind; a flow edge touching a group node; a leaf continuing onward; a synthesized card id colliding with a node id; no drawable hop node | `deriveTrace` → `{ ok: false, errors }`      | The `trace-empty-model-error` state lists the errors                  |
| `labels` with a non-string value                                                                                                                                                                              | `parseStringRecord` silently drops the entry | Accepted difference (no error entry)                                  |
| Top-level `kind`, deprecated top-level `investigation`, `apiVersion`, `clusters`                                                                                                                              | Not read                                     | —                                                                     |
| `investigation.direction` disagreeing with the request                                                                                                                                                        | `resolveTraceDirection`                      | Warning; `track_dir` wins (D4)                                        |
| Negative weight field; both residuals explicit but unbalanced; no measurable edge; residual given on a no-flow hop; threshold hid ribbons; suspected cycle; backward / lateral demotion                       | `deriveTrace` warnings                       | Listed in the warnings drawer, drawing proceeds                       |

The difference from `sankey-panel` — partial parse instead of whole-document failure — is recorded in the `graph-data-source` delta.

### D6. Tokens, not hex; the network cards reuse the storage look

The feature directory contains no hex colour, no CSS file and none of `sankey-panel`'s class names (`leaf-stop`, `n-title`, `zoom-layer`, `chart-focus`). Only tokens with no existing semantic equivalent are added, in both palettes: `kind.host`, `edge['network-flow']`, `sankey.traceFlow` / `traceFlowEnd` (Δ ribbon gradient), `sankey.traceBackward` / `traceBackwardEnd`, `sankey.traceResidualIn` / `traceResidualOut`. Everything else reuses what exists: card fill / stroke `sankey.nodeFill` / `nodeStroke`, status borders `STATUS_COLOR`, the anchor and start-hop accent `accent.primary`, leaf / group / owner cards and ownership lines `border.medium` / `fg.muted`, text `fg.*`, label halos `bg.canvas`, namespace bars `sankey.namespace1-5`. Every network card is a `SankeyCard` (or `SankeyWrapperBox`) given different content — label, subtitle, `slotLabels` for interface names, `extraLines` for the clients table and attribute rows, `dashed` for device kinds, `status`, `namespaceColor` — so the storage and network cards are the same drawing with different text.

### D7. Golden snapshots guard the port

`golden.test.ts` runs every ported sample × `minBps` in `{ 0, 5e8 }` × `grouping: 'cluster'` × `order: 'barycenter'` over deep-frozen input and snapshots the model plus the geometry rounded to three decimals. The numbers differ from `sankey-panel`'s `golden.mjs` (this repository formats to three significant digits and uses the shared geometry constants), so the snapshot is taken from the ported implementation once it has been visually checked against the fixture, then frozen. Per-hop conservation (`tracedIn + otherIn ≈ tracedOut + otherOut` within the eps rule) is asserted independently in `deriveTrace.test.ts` on every sample so the snapshot cannot silently freeze a broken balance.

### D8. `sankey-canvas` is the single presentation module

`src/features/sankey-canvas/` receives, by mechanical move plus re-export, everything the storage view uses to present a Sankey: `useZoomPan` (with `openingViewport`, `fitViewport`, `Viewport`, `Size`, `ZoomPanApi`), `SankeyControlBar`, `geometry.ts` (`CARD_W`, `LEAF_W`, `HEADER_H`, `BODY_MIN`, `ROW_MIN_H`, `ROW_GAP`, `MIN_THICKNESS`, `MAX_THICKNESS`, `LABEL_MIN_THICKNESS`, `PAD_TOP`, `stackHeight`, `placeStack`, `ribbonPath`, `thicknessScale`), `SankeyCanvas` (host div + svg + transform group + column headers), `SankeyCard` / `SankeyWrapperBox`, `useSankeyTooltip` + `SankeyTooltip`, `useSankeyKeyboard`, `useContainerSize`, `useOpeningViewport`, `StatusLegend` and the namespace palette function. `storage-flow-sankey` imports them; its own `index.ts` stops re-exporting them. The move is its own phase and is accepted only when the storage unit tests and the `sankey-svm-grouping` / `storage-graph` e2e specs are green and `SankeyChart`'s SVG output is unchanged. An audit grep for `useZoomPan|ribbonPath|stackHeight|placeStack|handleKeyDown|ResizeObserver` under `src/features` must hit only `sankey-canvas/`.

_Alternative — additive re-exports from `storage-flow-sankey` and importing them from `network-trace`._ Rejected: a feature importing another feature's internals is the dependency direction this repository avoids, and it leaves the primitives named after storage.

### D9. Verification layout

- Unit (Vitest): normalize new fields plus a byte-identical regression over the two existing fixtures; `traceRequestUrl` (13-digit milliseconds, seven parameters, empty hostname → `undefined`); `traceUrlScope` round-trips and refusals; `deriveTrace` conservation, source exemption, the error and warning table above, owner metering rules, a storage-only payload; `layoutTrace` (ported `flow-order` and `entry` tests), tooltips, `golden`; `TraceCards` (every `<text y>` inside its card frame, via `renderToStaticMarkup`); `TraceView` (six empty states, debounce, pill, layout and order switches, keyboard, tooltip cleared when the hovered node disappears); `TraceScopeBar`; `NavBar` / `AppShell` (redirect keeps the query, 0 requests on mount, exactly one request with seven parameters on Query, 0 requests and retained `hasPayload` on a view switch, `/network/foo` not found); `validate` (`endpoints.trace`); `showcaseTrace.test.ts`; `invariants.test.ts` (no hex, no `className` string styles, `+` only from `formatDeltaBps`).
- e2e (Playwright, `tests/network-trace.spec.ts`): stubbed `config.json` with `endpoints.trace: '/demo/trace.json'`; deep link awaits Query with 0 requests and Reload disabled; Query issues one request with the seven parameters and millisecond timestamps; `trace-svg` visible; view switch keeps the request count and `hostname`; `Min Δ` shows the pill without a request; Cancel keeps the previous drawing; the demo spec renders the fixture with the legend rows.

## Risks / Trade-offs

- [Strict TypeScript over a `Record`-heavy port] → `Record` → `Map`, `mustGet(map, key, what)` instead of `!`, conditional spreads for optional properties; the mutable `BuildCtx` design is kept as is; conservation tests run after every ported step.
- [A third `EdgeMetrics` member breaking the storage narrowing] → the intersection type of D1.
- [Exhaustive registries forcing edits across the kind / edge-type tables] → the compiler drives it; only the `getStylesheet` snapshot and the `categoryByKind` parity test change.
- [Milliseconds vs seconds] → multiplied by 1000 in `traceRequestUrl.ts` only; URL `from` / `to` stay in seconds as `app-shell` specifies.
- [Backend omitting `investigation`] → model ok, no anchor card, direction purely from `track_dir`, a warning in the drawer.
- [Bundle growth] → pure TypeScript, no dependency; `React.lazy` for `TraceView` if the budget is exceeded.
- [Golden numbers differing from `sankey-panel`] → the snapshot is of the port; the fixture is checked visually once before it is frozen (D7).

## Migration Plan

1. Ship as one frontend image. `config.json` gains an optional `endpoints.trace`; a deployment that does not set it keeps every existing behaviour and shows the not-configured state on the Network views.
2. Operators set `endpoints.trace` (for example `/api/v1/trace` through the existing `/api` proxy) to enable the Network category.
3. Rollback is the previous image tag; no data or URL migration.

## Open Questions

- Should `labels.tier` map onto the Graph view's `switch-topology` level so the Network Graph lays out by hop? Deferrable; the Graph view draws the payload correctly without it.
- Does the backend intend to emit `investigation` on every response? The view copes either way (D4); the warning text can be dropped once that is settled.
