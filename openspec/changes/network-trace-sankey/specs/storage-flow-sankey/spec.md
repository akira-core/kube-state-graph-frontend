## MODIFIED Requirements

### Requirement: Nodes are presented as box cards, with links entering and leaving through slots

Each Sankey node MUST be drawn as a rounded box card rather than a thin rectangle whose height is proportional to its weight. The card's content, top to bottom, is:

- **Title row**: the node's `label`.
- **Divider**: between the title row and the body.
- **Subtitle row**: the node kind; a `pod` additionally shows its `namespace`; a `pvc` and a `netapp-aggr` show `used / capacity` when **both** `usedBytes` and `capacityBytes` of `usage` are present; if either is missing the whole item is omitted, and the app MUST NOT fill in `0`. An `application` additionally shows its `namespace` and its member pod count; a `namespace` shows its member pod count.

Links MUST enter and leave through **slots** on the card's edges: inbound edges attach to the left edge, outbound edges to the right edge; slots on the same side are ordered top to bottom by that link's weight, descending, and on equal weight by the opposite node's `label` lexicographically ascending (`localeCompare`). A slot's height is max(that link's ribbon thickness, a fixed minimum row height), with a fixed gap between slots; the card's height is the height needed by the title and subtitle plus max(total height of the left slot stack, total height of the right slot stack, minimum body height), with each side's slot stack vertically centred within the card body. Because slots have a minimum row height and ribbon thickness does not, the total heights of a node's left and right stacks **need not** be equal — conservation is about ribbon thickness, not slot-stack height.

Node kinds MUST be distinguished by a stroke vocabulary, and the distinction MUST NOT rely on hue alone: `netapp-node`, `netapp-aggr` and `netapp-svm` are not Kubernetes resources and use a **dashed** stroke; `pvc`, `pod`, `application` and `namespace` use a **solid** stroke. The `netapp-node` cards on the leftmost column are the flow's origin and carry only right-edge slots. The `namespace` cards on the rightmost column are the flow's terminus and MUST be presented as smaller **leaf cards** (title, kind, member pod count and that namespace's total inflow in the current mode, with no right-edge slots). Under the `Node` layout a wrapper is a larger solid-stroked box in the pod column whose title row names the Kubernetes node and whose body holds the member pod cards; it carries no slots of its own.

A card whose node carries `data.status` MUST be bordered in that status's color, from the **same** palette the Graph view borders by, and with a thicker stroke than the neutral border so the distinction does not rest on hue alone. `status` MUST be passed through as the backend folded it (worst-wins over alert severity, NetApp `health` and Kubernetes readiness) — the app MUST NOT derive, adjust or re-fold it from `health`, `alerts` or `perf`. A node the backend sends no `status` for (an `netapp-svm`, for instance) MUST keep the neutral border: an absent verdict is not a healthy one, and painting it green would claim a judgement nobody made. The three status colors MUST be named in the toolbar, otherwise a colored border is an unexplained decoration.

The `Node` layout's wrapper, which HIDES the Kubernetes node it stands for, MUST border by the **worst** status among that node's own status and the statuses of the pods it draws, exactly as a collapsed container does in the Graph view; when none of them carries a status, the wrapper MUST keep the neutral border rather than fall back to normal. The derived `application` and `namespace` cards MUST keep the **neutral** border regardless of their members' statuses: they are synthesised columns, nothing in the backend raises an alert, health or readiness on them, and a coloured border there would claim a judgement nobody made while duplicating the member pods' own borders one column away.

No text inside a box card MUST receive pointer events (`pointer-events: none`): text that takes events would cut off the hover highlight and tooltip of the ribbon beneath it.

The box card and the wrapper are the shared `SankeyCard` and `SankeyWrapperBox` primitives of `sankey-canvas`, and the slot-stack placement (`stackHeight`, `placeStack`, the row minimum, the gap, the card widths and header height) comes from `sankey-canvas/geometry`; this view passes them its labels, subtitles, status, stroke style and slot positions and MUST NOT draw a card of its own. The rendered SVG for a given input is the same as before the primitives were shared.

#### Scenario: The three rows of a pvc box card

- **WHEN** the user views `data-mongo-0` (whose `usage` is `usedBytes` `700` GB and `capacityBytes` `1` TB)
- **THEN** the card shows the title `data-mongo-0` and a subtitle containing `pvc` and `700 GB / 1 TB`; its inbound edges attach to the left edge and its outbound edges to the right edge

#### Scenario: A card missing usage does not fill in zero

- **WHEN** some `pvc` node has no `usage`, or has only `usedBytes` without `capacityBytes`
- **THEN** that card's subtitle shows only the kind, with no used / capacity item and no `0` shown

#### Scenario: Slot ordering and minimum row height

- **WHEN** some `netapp-aggr` has three inbound edges with weights `5242880`, `0` and `1000`
- **THEN** the left-edge slots top to bottom are `5242880`, `1000`, `0`; although the ribbon thickness of the latter two is far below the minimum row height, their slots each still occupy the minimum row height, and the three ribbons do not overlap

#### Scenario: namespace is a leaf card

- **WHEN** the user views `prod`
- **THEN** that node is presented as a leaf card (smaller size, solid stroke) with only left-edge slots and no right-edge slots, its subtitle names the member pod count, and no ribbon leaves it

#### Scenario: netapp-node carries only right-edge slots

- **WHEN** the user views `ontap-prod-01`
- **THEN** that card has a dashed stroke, right-edge slots for its `node-aggr` links and no left-edge slots

#### Scenario: Status colors the border, and an unjudged node keeps the neutral one

- **WHEN** the fixture is drawn, in which `aggr1` carries `status: "warning"`, `ontap-prod-02` carries `status: "critical"` and `svm_shop` carries no `status`
- **THEN** the `aggr1` card's border is the warning color and `ontap-prod-02`'s the critical color, both from the same palette the Graph view uses; the `svm_shop` card's border is the neutral one and is none of the three status colors; and the toolbar names `normal` / `warning` / `critical` beside a swatch of each

#### Scenario: A container borders by the worst status it hides

- **WHEN** the namespace `prod` holds pods `mongo-0` / `mongo-1` (`normal`) and `batch-pending` (`warning`), and under the `Node` layout the `worker-1` wrapper's own status is `warning` while every pod it draws is `normal`
- **THEN** the `prod` namespace card and every `application` card keep the neutral border, `batch-pending`'s own card is bordered warning, and the `worker-1` wrapper is bordered warning

#### Scenario: A wrapper holds its pod cards

- **WHEN** the layout is `Node` and the user views `worker-0`
- **THEN** a solid-stroked wrapper titled `worker-0` with the subtitle `1 pod` encloses the `mongo-0` card; the `svm_shop → data-mongo-0 → mongo-0` ribbon ends at the `mongo-0` card's left edge inside the wrapper, and the wrapper itself has no slots

#### Scenario: The shared card draws the same SVG

- **WHEN** the storage fixture is rendered through `SankeyChart` before and after the card primitives moved to `sankey-canvas`
- **THEN** the static markup of every card and wrapper is byte-identical

### Requirement: Links are gradient ribbons on a shared scale

The thickness of every link MUST come from **one and the same** scale: the scale is the maximum thickness divided by the maximum weight among all **drawn** links in the current mode, and a link's thickness is max(minimum thickness, weight × scale). In Both mode the read and write families MUST share this one scale — scaling each separately would make their thicknesses incomparable. After a mode switch or a refetch the scale MUST be recomputed from the new maximum.

A ribbon MUST be a **filled area** bounded by cubic Bézier curves (not a constant-width stroked path), anchored at each end to the centre of the source and target slots, and filled with a linear gradient from the source end to the target end; both gradient stops MUST belong to that direction's (read / write) color family so that the direction remains recognisable.

Hover highlighting MUST be done by a style switch driven by a class or CSS `:hover`, and MUST still revert in cases where `mouseleave` does not fire (the pointer leaving the browser window directly, a touch being interrupted, a pan starting): no link MUST ever be stuck in the highlighted style.

The ribbon path generator and the thickness scale (`ribbonPath`, `thicknessScale`, `MIN_THICKNESS`, `MAX_THICKNESS`, `LABEL_MIN_THICKNESS`) are the shared ones in `sankey-canvas/geometry`, used by the network Sankey too; this view keeps its own gradients and mode colours.

#### Scenario: Shared scale

- **WHEN** in Both mode, the maximum weight among all drawn links is `5242880` (a read link)
- **THEN** that link is drawn at the maximum thickness; a write link of weight `1048576` is about one fifth as thick, both converted with the same scale

#### Scenario: Switching mode recomputes the scale

- **WHEN** the user switches from Both to Write, and the maximum weight changes from `5242880` to `1048576`
- **THEN** the scale is recomputed from `1048576`, and that write link is now drawn at the maximum thickness

#### Scenario: Hover does not get stuck highlighted

- **WHEN** the user hovers a ribbon and then moves the pointer straight out of the browser window (without passing over any other element)
- **THEN** that ribbon returns to the un-highlighted style

### Requirement: Sizing and container resize

The Sankey's SVG MUST fill the view area the app shell provides (both width and height follow the container), and MUST carry **no `viewBox`**: one SVG user unit is one CSS pixel, so the `<g>` viewport transform below is the only thing that scales the diagram. A `viewBox` of the layout's intrinsic size would map the content onto the element a _second_ time, and the two mappings compose — the transform would draw at its own scale times the viewBox factor, squaring "fit to window" (2096x442 of content in a 756px-wide area draws at 13% while the readout says 36%), shortening every pan by that factor, and pulling wheel zoom off the pointer. Fitting belongs to the transform alone; that is what makes the pixel-space contract of the zoom / pan requirements below true.

A container size change MUST NOT trigger a re-layout: the intrinsic coordinates of nodes and links MUST stay unchanged, and the viewport MUST be preserved rather than refitted; during it the app MUST NOT lose the hover highlight state, the mode selector value, the layout, the `az` / `env` / root / `cluster` / `namespace` selections or the current zoom / pan viewport. The content does not produce horizontal scrolling outside the view area because of a size change.

**All** nodes (including the orphaned cards of no-flow roots and, under the `Node` layout, every wrapper) MUST fall within the intrinsic coordinate frame computed by the layout: no-flow nodes hang below the flow chart of the same tier, and the layout MUST count them into the intrinsic height, otherwise "fit to window" cannot fit them — it scales by that intrinsic size, and a node outside the frame is indistinguishable from "the backend did not return that node".

The SVG host (the `svg` without `viewBox`, the transform group and the column headers) is the shared `SankeyCanvas`, and the container measurement and the one-time opening fit are the shared `useContainerSize` and `useOpeningViewport` of `sankey-canvas`.

#### Scenario: Window resize

- **WHEN** the user resizes the window width from 1400px to 900px
- **THEN** the chart keeps the viewport it was drawn at (the same zoom factor is still reported, and no automatic re-fit narrows it), the layout function is not called (the nodes' intrinsic coordinates are exactly the same as before), and the values of the mode selector and all selectors are unchanged. Content the narrower area no longer covers is reached by panning or by "fit to window" — a resize MUST NOT move a viewport the user established

#### Scenario: Hover during resize

- **WHEN** the container size changes while the user is hovering `aggr1`
- **THEN** the path highlight of `aggr1` is preserved, and the tooltip position updates to the new screen coordinates

### Requirement: Zoom and pan of the chart area

The chart area MUST support in-chart zoom and pan independent of browser page zoom, and MUST change only the `transform` of a **single** `<g>` wrapping the entire chart; `<defs>` such as gradients MUST stay outside that `<g>`. Zoom is true geometric scaling: font size and line width MUST scale proportionally with it, and MUST NOT be counter-compensated.

- **Wheel / two-finger trackpad**: zoom **anchored at the pointer position** — the chart coordinate under the anchor MUST be unchanged before and after the zoom; the event MUST be `preventDefault`-ed and MUST NOT scroll the page.
- **Press and drag**: pan. The chart-area cursor MUST be `grab` in the normal state and `grabbing` while dragging.
- The zoom factor MUST have upper and lower bounds; on reaching a bound it MUST stop, and MUST NOT bounce back or flip.

The initial viewport MUST be "fit to window but not enlarged beyond 1:1": when the chart is larger than the view area, shrink until the whole chart is visible; when smaller, keep the original size and centre it. Mode switches, layout switches, estate / root selection changes, theme switches, container resize and storage-graph refresh MUST preserve the current viewport. The viewport MUST NOT be written to the URL (the query carries only estate / roots / narrowing / mode and the time range), and MUST NOT be persisted; after the page remounts it MUST return to the initial viewport.

The zoom / pan implementation (`useZoomPan`, `openingViewport`, `fitViewport`) is the shared one in `sankey-canvas`; the network Sankey uses the same hook, and this view's behaviour is unchanged by the move.

#### Scenario: Zoom anchored at the pointer

- **WHEN** the user rests the pointer on `aggr1` and scrolls the wheel to zoom in
- **THEN** `aggr1` stays under the pointer without moving, and the page itself does not scroll

#### Scenario: Small charts are not enlarged on open

- **WHEN** the chart's intrinsic size is smaller than the view area
- **THEN** the opening viewport is 1:1 and centred, and MUST NOT be enlarged to fill

#### Scenario: Switching mode preserves the viewport

- **WHEN** the user zooms in and pans to near `ontap-prod-02`, then switches from Both to Read
- **THEN** the chart redraws in Read mode, with the zoom factor and pan position unchanged

### Requirement: Zoom control bar and keyboard operation of the chart area

While the chart is drawn, the chart area MUST show a row of zoom controls in its bottom-right corner, containing: zoom out, the current zoom factor readout (1:1 shown as `100%`; activating it returns to 1:1), zoom in, fit to window, 1:1, focus mode. Each MUST be a button with an accessible name that can be operated by keyboard. "Fit to window" (and the `0` key) is a full fit — the whole chart is fitted into the view area, and a small chart **may** be enlarged as a result; this differs from the opening viewport's "fit to window but not enlarged beyond 1:1", which applies only on open. During empty states, loading and error the zoom control bar MUST NOT be shown.

The chart-area container MUST be focusable (`tabindex`) and have an accessible name. The following keys MUST act only while **the chart-area container or one of its descendants** has focus: `+` / `-` zoom one step, `0` fit to window, `1` return to 1:1, `F` enter focus mode, `Esc` leave focus mode. These listeners MUST be registered on the chart-area container, MUST NOT be registered on `document` or `window` (see "Shell registers no global keyboard shortcuts" in `app-shell`), and MUST NOT intercept keys headed for the mode selector, the estate / root selectors or any input component.

The control bar (`SankeyControlBar`), the keyboard handler (`useSankeyKeyboard`), the tooltip positioning (`useSankeyTooltip` / `SankeyTooltip`) and the status legend (`StatusLegend`) are the shared ones in `sankey-canvas`, used by both Sankey views; this view MUST NOT carry a second copy of any of them.

#### Scenario: Empty state shows no control bar

- **WHEN** the Sankey shows an empty state because the graph has no storage measurement
- **THEN** the zoom control bar is not shown; the mode selector and all estate / root selectors remain operable

#### Scenario: Fit to window may enlarge a small chart

- **WHEN** the chart's intrinsic size is smaller than the view area (opened at 1:1, centred), and the user presses `0` or activates "fit to window"
- **THEN** the chart is enlarged to exactly fill the view area

#### Scenario: The factor readout returns to 1:1

- **WHEN** the user zooms to 240% and then activates the factor readout
- **THEN** the chart returns to 1:1 and the readout shows `100%`

#### Scenario: Keys have no effect while focus is outside the chart area

- **WHEN** focus is on the theme toggle in the nav bar and the user presses `0`
- **THEN** the Sankey's viewport is unchanged, and the key was not intercepted by the Sankey

#### Scenario: One keyboard handler serves both views

- **WHEN** the repository is searched for the chart keyboard handler
- **THEN** it is defined once, in `sankey-canvas`, and `SankeyView` and the network `TraceView` both import it
