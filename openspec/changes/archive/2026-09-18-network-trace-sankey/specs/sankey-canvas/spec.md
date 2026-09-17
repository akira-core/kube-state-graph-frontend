## ADDED Requirements

### Requirement: One presentation module for every Sankey view

The repository SHALL provide a single module, `src/features/sankey-canvas/`, that owns every presentation primitive a Sankey view needs, and both the storage-flow Sankey (`storage-flow-sankey`) and the network trace Sankey (`network-trace`) MUST import these primitives from it rather than hold their own: no feature directory other than `sankey-canvas` may define a zoom / pan hook, a ribbon path generator, a slot-stack placement, a keyboard handler for the chart, a `ResizeObserver` hook or a tooltip clamp. The module exports:

- `useSankeyStage` — the ONE wrapper a Sankey view mounts, and the only way the pieces below it are reached. It owns the measured chart box (`boxRef`, re-measured when the view's load gate opens), pan / zoom of the single `<g>` over content-vs-container (wheel zoom anchored at the pointer with `preventDefault`, drag pan with `grab` / `grabbing` cursors, bounded factor, fit and 1:1), the one-time opening viewport ("fit but not beyond 1:1", opened afresh when `openingKey` changes), the tooltip (state plus `useLayoutEffect` clamping within the window), the chart keyboard handler, the hovered card id — cleared when a redraw no longer holds that card, whose `mouseleave` never fires — and the card search; and it returns the single `lit` decision: the hovered card's path while a card is hovered, else the search's, else `null` (nothing faded). `useZoomPan`, `useContainerSize`, `useOpeningViewport`, `useSankeyKeyboard`, `useSankeyTooltip` and `useSankeySearch` are NOT published one by one — exporting the parts is what let two views wire the same behaviour two ways and fix a bug in one of them; only the `Viewport`, `ZoomPanApi` and `TooltipLine` types cross the barrel;
- `SankeyCanvas` (with the `ColumnHeader` and `HoverLit` types) — the focusable host `div` with an accessible name, the `svg` without `viewBox`, the transform group, the column header `<text>` elements that reserve no layout space, `defs` outside the transform group, and `children` for the view's own graphics;
- `SankeyControlBar` — zoom out, factor readout (activating it returns to 1:1), zoom in, fit, 1:1, focus, each a keyboard-operable button with an accessible name;
- `SankeyTooltip` — the overlay `div` with `pointer-events: none` rendering a list of lines (its state is the stage's); and `SankeySearchOverlay`, the search box and result list of the card-search requirement below;
- `SankeyCard` and `SankeyWrapperBox` (with `SlotLabel`) — the rounded box card (title row, divider, subtitle, optional attribute lines, optional slot labels on either edge, dashed or solid stroke, status border from the shared palette with the thicker stroke, `locatable`, `faded`, namespace colour bar, `pointer-events: none` on all text) and the wrapper frame (title, subtitle, no slots); and `RibbonChevron`, the direction mark every amount ribbon ends in;
- `geometry.ts` — `CARD_W`, `LEAF_W`, `HEADER_H`, `BODY_MIN`, `BODY_PAD_BOTTOM`, `CARD_LINE_H`, `ROW_MIN_H`, `COL_GAP`, `V_GAP`, `PAD_X`, `PAD_TOP`, `PAD_BOTTOM`, `WRAPPER_PAD`, `WRAPPER_HEADER_H`, `MIN_THICKNESS`, `LABEL_MIN_THICKNESS`, `cardHeaderH`, `clamp`, `stackHeight`, `placeStack`, `ribbonPath`, `endChevronPath`, `thicknessScale(maxValue)` and the `Rect` type. The thickness CEILING is not published: it lives inside `thicknessScale`, so neither view can scale ribbons its own way. The namespace palette is not here either — which colour a namespace draws in is a storage-view decision and lives in `storage-flow-sankey/layoutSankey.ts`; the canvas only paints the `namespaceColor` it is handed;
- `StatusLegend` and `Swatch` — the three status dots with their names, and the colour chip both legends are built from;
- `loadGateScreen` / `shellEmptyKind` (with `LoadStatus` / `ShellEmptyKind`) and `haloStyle` — the load gate, the empty-state kind and the text halo both views render identically;
- `STORAGE_KIND_CAPTION` and `nodeTooltipRows` / `rawReading` — the shared presentation vocabulary described below.

The module holds the presentation VOCABULARY both Sankeys fill, and nothing about either domain. Shared, because a card must read the same on both charts: `STORAGE_KIND_CAPTION`, the caption words for the storage kinds both charts draw as columns (read by `storage-flow-sankey/layoutSankey.ts` and `network-trace/model/classify.ts`), and `tooltipLines.ts`'s row ORDER, which fixes where namespace, identity, flow, usage, status, health, perf, alerts, clients and id sit in a card tooltip. Not shared, and MUST stay out: storage tiers, trace hops, residuals, and how either model is derived — the module takes positions, sizes, text and callbacks, never elements or a model, and it imports from neither feature (only `shared/` and `graph-search`). `locatableKind` MOVED OUT for exactly this line: only the storage Sankey offers Locate, the trace offers none, so the rule now lives in `storage-flow-sankey/locatable.ts` with the view that asks it.

#### Scenario: The single-entry audit

- **WHEN** `src/features` is searched for `useZoomPan`, `ribbonPath`, `stackHeight`, `placeStack`, `handleKeyDown` and `ResizeObserver`
- **THEN** every definition is under `src/features/sankey-canvas/`; the zoom, size, opening-viewport, keyboard, tooltip and search hooks are absent from its barrel, and `storage-flow-sankey` and `network-trace` reach them only by calling `useSankeyStage`

#### Scenario: The canvas is domain-free

- **WHEN** every import of `sankey-canvas` and the type of every export it publishes are inspected
- **THEN** no import resolves into `storage-flow-sankey` or `network-trace`, and no exported type references `ElementDefinition`, a storage tier, a trace hop or residual, or either feature's model types; the two shared vocabulary exports are the whole of what it knows about a domain — `STORAGE_KIND_CAPTION` is plain caption words and `nodeTooltipRows` a row order — and `locatableKind` is not among them

### Requirement: The extraction leaves the storage view unchanged

Moving the primitives out of `storage-flow-sankey` MUST NOT change its observable behaviour or rendered output: every requirement and scenario of `storage-flow-sankey` still holds, its unit tests pass without changing an expectation (only import paths), and the `storage-graph` and `sankey-svm-grouping` e2e specs pass. `SankeyCard` given the values the storage `nodeCard` received MUST render the same elements and attributes; `SankeyWrapperBox` likewise for `wrapperBox`. No pre-move markup was ever recorded, so the standing guarantee is not a before/after snapshot but an equality that can be re-run at any time: the card the storage chart draws must equal the shared card rendered directly from the same values.

#### Scenario: Same SVG before and after

- **WHEN** `SankeyView.test.tsx`'s "The shared card draws the same SVG" renders the storage layout through `SankeyChart` and a `SankeyCard` on its own from that layout node's id, label, subtitle, `extraLines`, kind, box, status and `locatable`
- **THEN** the two cards' `outerHTML` are identical once the namespace stripe — which only the storage chart paints — is removed, so a change to the shared card that would alter the storage drawing fails here rather than in a snapshot nobody took

#### Scenario: Storage tests need no new expectation

- **WHEN** `npm run test:ci` runs after the extraction
- **THEN** every test under `src/features/storage-flow-sankey/` passes, and the diff of those test files contains only import path changes

### Requirement: Both views share the card and ribbon vocabulary

A network card MUST be a `SankeyCard` (or `SankeyWrapperBox`) with different content, never a differently drawn card: the same corner radius, title divider, font sizes, status border, dashed device stroke and namespace bar as the storage view, extended only by the optional `slotLabels` (interface names beside slots) and `extraLines` (the clients table and attribute rows). Ordinary ribbons in both views MUST use `ribbonPath` and the same `thicknessScale`, `MIN_THICKNESS` / `MAX_THICKNESS`, so a `10 Gbps` network ribbon and a `10 MB/s` storage ribbon at the top of their own scale are equally thick. The network view may add its own path generators only for shapes the storage view has no equivalent of (lateral arc, backward ribbon, ownership line, residual block).

#### Scenario: A hop box is a storage card with slot labels

- **WHEN** a network hop box and a storage `pvc` card of the same status are rendered
- **THEN** both share the same `rect` attributes, stroke width, title and divider positions; the hop box differs only by the additional `<text>` elements for its slot labels and attribute lines

#### Scenario: Keyboard behaviour is identical on both views

- **WHEN** the user focuses the chart container on `/sankey` and on `/network/sankey` and presses `0`, `1`, `+`, `-`, `F`, `Esc` in turn
- **THEN** each key produces the same viewport and focus-mode transitions on both views, and a key pressed inside the `Min Δ` or `Top pods` input is not intercepted on either
