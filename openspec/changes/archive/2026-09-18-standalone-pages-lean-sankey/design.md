## Context

See proposal.md — Why. The current state that shapes the approach:

- `routes.ts` is a four-row table keyed by `category` × `view` (`keepSearch`, `categoryHome`, `viewsOf`, `CATEGORY_ALIAS`); `AppShell` mounts `GraphPage`, `SankeyPage` and `NetworkPage` (`/network/:view`, a `routeFor` guard, `GraphView` or `TraceView` by `view`); `NavBar` renders the `Category` and `View` segmented links from that table; `AppLayout` derives `isAnySankey` from `route.view` to end focus mode on leaving a Sankey.
- `SankeyPage` already owns the Storage Sankey's view state — `mode` and `topPods` through `useCommitField`, `podLayout` and `svmDisplay` in component state — and hands it to `SankeyView`, which keeps local-state fallbacks for tests, computes the Top pods cut (`cutTopPods`) and `svmAvailable` from the elements, and renders the title-bar row (`Storage flow` eyebrow, `Segmented` controls, `StatusLegend`, read / write swatches), the chart box and `SankeySummary`. `NetworkPage` owns `grouping` and `minBps`; `TraceView` owns `order`, derives the model (`directionFor`, `deriveTrace`), and renders the title-bar row (`Group`, `Order`, `Min Δ`, `Clear`, the hidden pill, `TraceLegend`), the chart and `TraceSummary` with the warnings drawer. Both summaries sit on `shared/ui/SummaryPanel`, which has no other consumer.
- `SankeyScopeBar` and `TraceScopeBar` are one flex-wrap row of label-over-control columns closed by `QueryButton`, with a second line for root pills / problems; neither has a slot after Query.
- `SankeyCard` (in `sankey-canvas`) already draws `extraLines` under the subtitle at `CARD_LINE_H` per line — the trace uses it, the storage layout does not: `layoutSankey`'s `subtitleFor` packs kind, namespace, usage and pod count into one subtitle string, and `placeCard` sizes every card as `HEADER_H + content + BODY_PAD_BOTTOM` with the slot stack placed at `HEADER_H`. The trace's `hopHeaderH` / `leafCardH` add `CARD_LINE_H * lines`.
- The trace's chevron is two pieces in `network-trace`: `endChevron` / `chevronDir` in `layout/paths.ts` (geometry, stored as `EdgeGeom.chevron`) and the `Chevron` component inside `chart/TraceBand.tsx`. `LayoutLink` on the storage side carries `path`, `thickness` and label coordinates but not the target slot centre.
- The storage tooltip builders (`nodeTooltip`, `derivedCardTooltip`, `wrapperTooltip`, `frameTooltip`, the link lines in `onLinkEnter`) emit plain strings; `nodeTooltipRows` and `SankeyTooltip` already accept `{ text, color }` lines, which the trace's `nodeTooltipLines` uses.
- Three changes are implemented on `main` but not archived (`network-trace-sankey`, `sankey-svm-grouping`, `sankey-card-search`); their deltas describe the code this change edits.

## Goals / Non-Goals

**Goals:**

- One route table with three rows and nothing derived from a category; the shell links nowhere.
- Each Sankey page owns its view state and its derived projection; the view components draw and nothing more, so the scope bar can host the controls without a second owner of the same state.
- The storage chart's cards, ribbons and tooltips reuse the trace's primitives and conventions rather than re-implementing them.
- Test ids survive wherever the control merely moved, so the e2e and unit suites change only where behaviour did.

**Non-Goals:**

- Any change to requests, URL parameters, the loaders or the normalize boundary.
- Re-styling the trace chart, the Storage Graph page or the nav bar beyond removing the two link groups.
- A generic "view controls" abstraction in `sankey-canvas`; the slot on the scope bar is the shared contract.
- Restoring the summary's per-namespace / per-application subtotals anywhere else.

## Decisions

### D1. Three rows, two aliases, no category

`routes.ts` becomes `ROUTES: { path, title, kind: 'graph' | 'sankey' }[]` with three rows and `ALIASES: Record<'/' | '/network', string>` (`/` → `/graph`, `/network` → `/network/sankey`); `routeFor`, `isKnownPath`, `documentTitle` and `HOME_PATH` stay, `Category`, `View`, `keepSearch`, `categoryOf`, `categoryHome`, `viewsOf`, `CATEGORY_LABEL`, `VIEW_LABEL` go. `AppShell` renders one `<Route>` per row plus one alias redirect (`<Navigate replace>` keeping `location.search`) per alias; `AppLayout` derives `isAnySankey` from `kind`. `NavBar` loses the two link groups and its `Link` / `NavLink` / `useLocation` imports. `NetworkPage` becomes the body it already had for the Sankey view: no `useParams`, no guard, no `GraphView`, no locate.

_Alternative — keep `/network/:view` with one accepted value._ Rejected: a route family with one member is a table with one row pretending to be a pattern, and the `:view` guard exists only to 404 the second member.

### D2. The Network-Graph-only code is removed, not kept dark

`GraphView.unconfiguredMessage`, `describeGraphOutcome`'s `unconfigured` outcome and `NOTICE_TEST_ID.unconfigured` are removed (the Storage Graph's endpoint is required, so no page can set them); `TRACE_UNCONFIGURED_MESSAGE` stays a local constant of `TraceView` (wording: `Trace endpoint is not configured. The Storage pages are unaffected.`) and leaves the barrel. The `host` kind and `network-flow` edge registrations in `graph-view` stay: they are enum-keyed tables the compiler checks, and `/v1/graph` may carry either.

### D3. The page owns the projection; the view draws

- **Storage.** A new hook `useSankeyProjection({ elements, mode, topPods, roots })` in `storage-flow-sankey` returns `{ elements, podCut: { shown, total } | undefined, svmAvailable }` — the cut and the availability check that `SankeyView` computes today, memoised once. `SankeyPage` calls it and passes the cut elements, `podCut`, `svmAvailable` and the effective `svmDisplay` into `SankeyView`, which drops `topPods`, its cut, its `svmAvailable` memo and its local-state fallbacks: `mode`, `podLayout`, `svmDisplay` become required props. The tests that exercised the cut through `SankeyView`'s `topPods` move to the hook.
- **Network.** A new hook `useTraceModel({ elements, trackDir, minBps, grouping })` returns `{ direction, model }` (today's `directionFor` + `deriveTrace` memos). `NetworkPage` calls it, holds `order` beside `grouping`, and passes `model`, `direction` and `order` to `TraceView`, which keeps the layout, stage, hover and tooltips.

_Alternative — the view renders the controls into the scope bar through a render prop or a portal._ Rejected: the scope bar would move inside `<main>` (the view area landmark), or two components would own one piece of state.

### D4. A `trailing` slot on both scope bars

`SankeyScopeBar` and `TraceScopeBar` gain `trailing?: ReactNode`, rendered after `QueryButton` inside the existing flex-wrap row (separated by a hairline, `ml-auto` so it right-aligns when the row has room and wraps beneath otherwise). Two components fill it: `SankeyViewControls` (mode, `Layout`, `SVM` with its reason, the cut statement, `StatusLegend`, read / write swatches gated by mode) and `TraceViewControls` (`Group`, `Order`, `Min Δ` with its hint and `Clear`, the hidden pill, the warnings pill, `TraceLegend`). They render the same elements the title bars rendered, with the same `data-testid`s (`sankey-layout`, `sankey-svm-display`, `sankey-svm-display-reason`, `sankey-status-legend`, `trace-grouping`, `trace-order`, `trace-min-bps`, `trace-min-bps-hint`, `trace-min-bps-clear`, `trace-filtered-pill`, `trace-legend*`); `sankey-top-pods-label` keeps its id and now reads `<shown> of <total> pods`. The `Min Δ` debounce and its ref-held callback move with the input. The warnings pill is `trace-warnings-pill`: `N warnings`, `title` and `aria-label` carrying the messages joined by newlines, absent when there are none. The legend components are rendered only while a chart is drawn, as the title bar did.

_Alternative — a `ViewControlsGroup` component in `sankey-canvas`._ Rejected: the two groups share no content, only a place; the slot is the contract.

### D5. Summaries deleted outright

`SankeySummary.tsx`, `TraceSummary.tsx`, `shared/ui/SummaryPanel.tsx` and their tests are deleted; `SankeyView`'s `summary` memo and `TraceView`'s `warnings` memo go with them (the warnings computation moves to `TraceViewControls`' input, built by `NetworkPage` from `direction.warning`, `model.warnings` and the loader's `errors`). The chart box keeps its `min-h` floor: it costs nothing and guards the zero-height host case the comment describes.

### D6. Storage cards print attribute lines through the shared card

`layoutSankey` gains `cardText(node, flow): { subtitle, extraLines }` mirroring the trace's `cardText`: subtitle = kind (+ ` · <ontap_cluster>` for the three NetApp kinds, + ` · no flow` for a no-flow root); lines = `ns/<namespace>` (pod, pvc, application), `usage <formatUsage(used, capacity)>` (pvc, aggr, both fields present), `<n> pods` (application, namespace), `total <formatBytesPerSec(inflow)>` (namespace leaf). `LayoutNode` carries `extraLines`; `placeCard` sizes the header as `cardHeaderH(lines)` — a new `sankey-canvas/geometry` export `HEADER_H + CARD_LINE_H * lines`, which `hopHeaderH` and `leafCardH` also adopt — and places both slot stacks below it. `SankeyChart` passes `extraLines` to `SankeyCard`. Wrappers, frames, the namespace stripe and the leaf width are unchanged.

_Alternative — keep the packed subtitle and only add usage as a line._ Rejected: the point is that a storage card and a trace card read alike; one of each handed the same text must render the same markup.

### D7. One chevron primitive

`endChevron` becomes `endChevronPath(x2, y2, thickness, dir)` in `sankey-canvas/geometry.ts`, and `TraceBand`'s `Chevron` becomes `RibbonChevron` in `sankey-canvas` (props `d`, `tokens`, `active`, `testId`); `paths.ts` and `TraceBand` import them, so the trace's markup and `trace-band-chevron` id are unchanged. `layoutSankey` records the target slot centre while building each link's path and stores `LayoutLink.chevron = endChevronPath(x2, y2, thickness, 1)`; `SankeyChart` draws `<RibbonChevron>` after every ribbon, `active` following the same `lit` rule as the ribbon's fill, `testId` `sankey-link-chevron`.

### D8. Tooltip rows carry the ribbon colour

The storage tooltip builders take `tokens` and emit the flow rows as `{ text, color }`: read rows in `tokens.sankey.read`, write rows in `tokens.sankey.write`, the single-direction `in` / `out` rows in that direction's colour; derived and wrapper / frame flow rows the same way; the link tooltip's `<direction>: <value>` row likewise. Everything else stays a string. `nodeTooltipRows.flow` already accepts `TooltipLine[]`; `SankeyTooltip` already paints them.

### D9. The Network Sankey's cards stop being clickable

`TraceView` drops `onLocateNode`; `TraceCard` passes `locatable={false}` and `SankeyCard` therefore renders no `onClick`; `network-trace/model/locatable.ts` and its test are deleted (`sankey-canvas/locatable.ts` stays for the storage chart). `NetworkPage` drops `useNavigate`, `useLocation` and `useLocateFromNavigation`; `GraphPage` keeps the latter for the Storage Sankey's Locate.

### D10. Tests and documentation move with the code

- Unit: `routes.test.ts`, `NavBar.test.tsx`, `AppShell.test.tsx` (the Network describe block shrinks to the Sankey page: redirect to `/network/sankey`, 404 for `/network/graph`, no locate, no view switch), `GraphView.test.tsx` and `describeGraphOutcome.test.ts` (the `unconfigured` cases go), `SankeyView.test.tsx` (title bar / summary / cut cases move to `SankeyViewControls`, `useSankeyProjection` and `SankeyPage`), `TraceView.test.tsx` (control and legend cases move to `TraceViewControls` and `useTraceModel`), new tests for `cardText`, the chevron and the painted tooltips.
- Playwright: `network-trace.spec.ts` loses the `nav-view` clicks and the Graph-view expectations, gains `/network/graph` → not-found and `/network` → `/network/sankey`; `storage-graph.spec.ts` and `demo.spec.ts` read the cut from `sankey-top-pods-label` and drop the summary toggle; `url-scope.spec.ts` (Locate then Back) is unchanged.
- `README.md`: the nav-bar paragraph, the `/network/*` section heading and text, the summary paragraph, and the card / tooltip descriptions.

## Risks / Trade-offs

- [Taller cards make the storage chart taller] → fit-to-window scales it; the layout's cost is unchanged (text, no extra measurement), and the "Performance bounds" tests still run.
- [Moving the cut out of `SankeyView` breaks tests that fed it raw elements] → those tests move to `useSankeyProjection`; `SankeyView` tests feed already-cut elements and `podCut`.
- [Warnings in a `title` tooltip are less discoverable than the drawer] → the count is always visible, the `aria-label` carries the text, and the hidden-ribbon pill still states the one warning operators act on.
- [Archive order with three unarchived changes] → the validator cannot see their deltas; every MODIFIED block here keeps the scenario names of both the main spec and those deltas, and the proposal asks for them to be archived first.
- [The demo repository's `verify.sh` §10 fetches `/network/graph` and expects the document] → a downstream change in `kube-state-graph-demo`, tracked in its own repository; until it lands, `make verify` there reports one red section against this frontend.
- [A `trailing` group that wraps under the scope controls pushes the chart down on narrow windows] → the same trade as the old title bar's height, now only on narrow windows; the chart box keeps its floor.

## Migration Plan

- One pull request; no persisted state changes; `/network/graph` bookmarks land on the not-found page with the link to `/graph`.
- After merge, update `kube-state-graph-demo`: `CLAUDE.md`'s route description and `scripts/verify.sh` §10 (drop `/network/graph`, assert the not-found document for it), then move the submodule pointer.
- Rollback is a revert.
