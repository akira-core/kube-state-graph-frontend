## Purpose

Defines the presentation module shared by every Sankey-style view (the storage flow Sankey and the network trace Sankey): the SVG host, box cards and wrappers, ribbon geometry and thickness scale, zoom / pan, keyboard, tooltip, status legend, focus mode and card search, so both views draw and behave as one product.

## Requirements

### Requirement: One presentation module for every Sankey view

The repository SHALL provide a single module, `src/features/sankey-canvas/`, that owns every presentation primitive a Sankey view needs, and both the storage-flow Sankey (`storage-flow-sankey`) and the network trace Sankey (`network-trace`) MUST import these primitives from it rather than hold their own: no feature directory other than `sankey-canvas` may define a zoom / pan hook, a ribbon path generator, a slot-stack placement, a keyboard handler for the chart, a `ResizeObserver` hook or a tooltip clamp. The module exports:

- `useZoomPan` with `openingViewport`, `fitViewport` and the `Viewport` / `Size` / `ZoomPanApi` types — the transform of the single `<g>`, wheel zoom anchored at the pointer with `preventDefault`, drag pan with `grab` / `grabbing` cursors, bounded factor, fit and 1:1;
- `useContainerSize` (`ResizeObserver` plus first measurement) and `useOpeningViewport` (the one-time "fit but not beyond 1:1");
- `SankeyCanvas` — the focusable host `div` with an accessible name, the `svg` without `viewBox`, the transform group, the column header `<text>` elements that reserve no layout space, `defs` outside the transform group, and `children` for the view's own graphics;
- `SankeyControlBar` — zoom out, factor readout (activating it returns to 1:1), zoom in, fit, 1:1, focus, each a keyboard-operable button with an accessible name;
- `useSankeyKeyboard` — `+` / `-` step, `0` fit, `1` 1:1, `F` focus, `Esc` leave, registered on the chart container only and ignoring events whose target is an `input`, `select`, `textarea` or radio;
- `useSankeyTooltip` and `SankeyTooltip` — the tip state, `useLayoutEffect` clamping within the window, the overlay `div` with `pointer-events: none`, rendering a list of lines;
- `SankeyCard` and `SankeyWrapperBox` — the rounded box card (title row, divider, subtitle, optional attribute lines, optional slot labels on either edge, dashed or solid stroke, status border from the shared palette with the thicker stroke, `locatable`, `faded`, namespace colour bar, `pointer-events: none` on all text) and the wrapper frame (title, subtitle, no slots);
- `geometry.ts` — `CARD_W`, `LEAF_W`, `HEADER_H`, `BODY_MIN`, `ROW_MIN_H`, `ROW_GAP`, `MIN_THICKNESS`, `MAX_THICKNESS`, `LABEL_MIN_THICKNESS`, `PAD_TOP`, `stackHeight`, `placeStack`, `ribbonPath`, `thicknessScale(maxValue)` and the namespace palette function;
- `StatusLegend` — the three status dots with their names.

The module MUST contain no knowledge of storage tiers or network hops: it takes positions, sizes, text and callbacks, never elements or a model.

#### Scenario: The single-entry audit

- **WHEN** `src/features` is searched for `useZoomPan`, `ribbonPath`, `stackHeight`, `placeStack`, `handleKeyDown` and `ResizeObserver`
- **THEN** every definition is under `src/features/sankey-canvas/`, and `storage-flow-sankey` and `network-trace` only import them

#### Scenario: The canvas is domain-free

- **WHEN** the type of every `sankey-canvas` export is inspected
- **THEN** none references `ElementDefinition`, a `storage-flow` tier, a `network-flow` edge or either feature's model types

### Requirement: The extraction leaves the storage view unchanged

Moving the primitives out of `storage-flow-sankey` MUST NOT change its observable behaviour or rendered output: every requirement and scenario of `storage-flow-sankey` still holds, its unit tests pass without changing an expectation (only import paths), the `storage-graph` and `sankey-svm-grouping` e2e specs pass, and `SankeyChart`'s SVG markup for the storage fixture is identical to the markup before the move. `SankeyCard` given the values the storage `nodeCard` received MUST render the same elements and attributes; `SankeyWrapperBox` likewise for `wrapperBox`.

#### Scenario: Same SVG before and after

- **WHEN** the storage fixture is rendered through `SankeyChart` on the tree before the extraction and on the tree after it
- **THEN** the two `renderToStaticMarkup` outputs are byte-identical

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

### Requirement: Card search overlay

`sankey-canvas` SHALL provide the card search every Sankey view shows: a `useSankeySearch` hook and a `SankeySearchOverlay` that renders the Graph view's `SearchBar` (result list, keyboard navigation, 300 ms debounced fit, two-stage `Esc`) at the chart's top-right, inside the chart host, while a chart is drawn. The hook MUST take only search records, a content-space rect per record id, a path callback and the zoom API — never elements or a feature model.

- **Hit rule.** A record is a hit by exactly the Graph search hit rule (`graph-search` "Hit matching rules": whitespace tokens, case-insensitive substring, AND across tokens, any field per token), and results are ordered by label.
- **Highlight.** While the query is non-empty, the view MUST keep lit the union of every hit's hover path — the same set hovering each hit alone would light — and fade everything else through the shared `lit` mechanism. A non-empty query with no hits MUST fade every card and ribbon. Clearing the query reverts everything.
- **Hover precedence.** Hovering a card while a query is typed MUST light that card's path alone; leaving it MUST return to the search highlight.
- **Locate.** Choosing a result (click, or `Enter` on the highlighted row) MUST frame that card — centred, never enlarged past 1:1 — and clear the query; it MUST NOT navigate or run the cross-view Locate that clicking the card does. When typing pauses, or on `Enter` with no row highlighted, the viewport MUST fit the union of every hit's card (never past 1:1); a query with no hits never moves the viewport. Viewport moves are not animated.
- **Input isolation.** Typing in the box MUST NOT trigger the chart shortcuts; a wheel over the box or its result list MUST NOT zoom the chart, and pressing or dragging in the box MUST NOT pan it.
- **Lifetime.** The query is page-transient: not written to the URL, not persisted, empty after remount, and kept across a refresh, a layout / mode / order / threshold switch and focus mode; hits the new drawing has no card for drop out.

#### Scenario: Hits light their whole paths

- **WHEN** the user types a query matching two cards on different paths
- **THEN** both cards' paths are lit, every card and ribbon on neither path is faded, and no layout recomputation occurs

#### Scenario: Hover takes over and hands back

- **WHEN** a query is typed and the user hovers a card that is not a hit, then leaves it
- **THEN** while hovered only that card's path is lit; after leaving the hits' paths are lit again

#### Scenario: Locate frames the card without leaving the view

- **WHEN** the user clicks a result row
- **THEN** the viewport centres that card at no more than 100 %, the search box is empty, every card is un-faded, and the address bar is unchanged

#### Scenario: The box keeps its own wheel and keys

- **WHEN** the search box has focus and the user presses `F` and `+`, and scrolls over the result list
- **THEN** focus mode is not entered, the zoom readout is unchanged, and the list scrolls
