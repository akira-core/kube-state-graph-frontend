## Purpose

The Graph view renders the Kubernetes resource topology returned by the kube-state-graph backend on a cytoscape.js canvas: nodes encoded by kind → icon, edges colored by edge type, status outlines, compound containers and collapse, fcose / dagre layouts, legend and filtering, hover tooltip, pinned card, selection and focus fade, dark / light theme adaptation, plus empty / loading / error states. This capability is ported from the Grafana panel's `panel-rendering` and `node-icon-encoding`, dropping the Grafana theme and panel option dependencies, driven instead by runtime config (`defaultLayout`, `theme`) and the app's own view state.

## ADDED Requirements

### Requirement: Cytoscape canvas rendering and layout algorithm

The Graph view SHALL render nodes and edges through cytoscape.js in a designated DOM container. The initial layout algorithm MUST come from the runtime config's `defaultLayout` (`fcose` | `dagre`, `fcose` when the value is missing). The Graph view MUST provide an in-app control (a two-option segmented control: `fcose` / `dagre`) for the user to switch the layout algorithm at runtime; that switch is ephemeral view state, not written back to the runtime config and not preserved across reload. When the user switches layout, the system MUST re-layout on the same cytoscape instance without rebuilding the instance.

#### Scenario: Default layout shows nodes and edges

- **WHEN** the Graph view fetches data with ≥1 node and ≥1 edge from `endpoints.graph` (or the bundled fixture under `demoMode`), and the runtime config does not set `defaultLayout`
- **THEN** the cytoscape canvas shows the corresponding number of nodes and edges, laid out with fcose, with no console error or warning

#### Scenario: runtime config names dagre as the default layout

- **WHEN** the runtime config's `defaultLayout` is `dagre`
- **THEN** the Graph view lays out with dagre on first render, and the in-app layout control shows `dagre` as the current option

#### Scenario: Layout switch does not rebuild the instance

- **WHEN** the user switches layout from `fcose` to `dagre` on the in-app layout control
- **THEN** the same cytoscape instance first stops the animation in flight, then runs the new layout with `dagre`; nodes transition to their new positions by animation; the instance reference is unchanged

### Requirement: Edges colored by relationship type

The system SHALL map each edge type (`EdgeType`) to a distinct color and line style through a single edge style table (`EDGE_STYLE_BY_TYPE`), and that table MUST be shared by the stylesheet and the legend. `EdgeType` covers the 8 edge types the backend emits — `pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr` / `switch-to-switch` / `node-to-switch` — **all of which are backend-emitted**. Having adopted the backend's D6 hierarchy, the front end no longer synthesizes `pod-runs-on-node` (replaced by the backend's `pod-to-node` edge) or `controller-owns-pod` (the backend emits controller groups directly, and the front end no longer synthesizes this edge from a pod's `data.owner`, see `graph-data-source`). `pod-to-node` (`pod → node`) MUST be drawn as a blue `#3b82f6` solid line; `pvc-to-netapp-aggr` (`pvc → netapp-aggr`) MUST be drawn as a storage purple `#8b5cf6` solid line, and that color MUST be **deliberately distinct** from `pod-mounts-pvc`'s `#a855f7`, so the two storage edges are distinguishable. `pod-calls-service` and `service-selects-pod` MUST share **the same orange `#f97316`** with `pod-calls-pod` (the pod → service → pod hop is still essentially a pod-to-pod relationship, only routed through a Service), and these two service types MUST be **omitted from the edge legend** (no row of their own, and no extra merged row), represented instead by the single `pod-calls-pod` row, which renders as `pod ↔ pod/service` (bidirectional arrow glyph) to mark that it covers both the direct and the via-Service pod-to-pod relationship (see the "Legend" requirement). All edges are solid lines; direction is expressed by the **arrowhead**. `switch-to-switch` and `node-to-switch` (the backend v0.0.18 physical-network fabric) MUST **share the same infra color and the same solid line style**, and take the same orthogonal (`taxi`) routing (see `switch-tier-layout`), so the two are visually identical — `node-to-switch` no longer uses a separate indigo or bézier, and is distinguished only by its endpoints (`<node> → <switch>` vs `<switch> → <switch>`), letting the K8s node's uplink read as part of the switch fabric. The system MUST also provide a source / target `NodeKind` endpoint table for every edge type (`EDGE_ENDPOINTS_BY_TYPE`), so the legend can present an edge type as `<from> → <to>`; `pod-to-node`'s endpoints MUST be `<pod> → <node>`, `pvc-to-netapp-aggr`'s `<pvc> → <netapp-aggr>`, `switch-to-switch`'s `<switch> → <switch>`, and `node-to-switch`'s `<node> → <switch>`.

#### Scenario: A known edge type maps to the correct color

- **WHEN** an edge's data carries `edgeType: 'pod-to-node'` (or any other defined type)
- **THEN** that edge renders with the corresponding color and line style (`pod-to-node` as a blue `#3b82f6` solid line), consistent with the edge style table's definition

#### Scenario: The two storage edges are distinguished by different purples

- **WHEN** both `pod-mounts-pvc` and `pvc-to-netapp-aggr` edges are present in the graph
- **THEN** `pod-mounts-pvc` renders as `#a855f7` and `pvc-to-netapp-aggr` as `#8b5cf6` — deliberately different, so the two storage edges are distinguishable

#### Scenario: Edge colors do not collide with status colors

- **WHEN** inspecting the color of any edge type in `EDGE_STYLE_BY_TYPE`
- **THEN** that color MUST NOT equal any value of `STATUS_COLOR` (green `#73BF69` / yellow `#F2CC0C` / red `#E02F44`) — `pod-to-node`'s `#3b82f6`, `pvc-to-netapp-aggr`'s `#8b5cf6` and the service edges' orange `#f97316` all satisfy this condition

#### Scenario: node-to-switch and switch-to-switch look identical

- **WHEN** both `node-to-switch` and `switch-to-switch` edges are present in the graph
- **THEN** both render with the same infra color, the same solid line style, and the same `taxi` orthogonal routing (only the endpoints differ); `node-to-switch` no longer appears in a separate indigo or bézier

#### Scenario: An unknown edge type takes the fallback

- **WHEN** an edge's `edgeType` is not in the lookup table
- **THEN** that edge renders with the gray solid line fallback, throwing no exception

### Requirement: App theme adaptation

The Graph view SHALL generate the cytoscape stylesheet dynamically from the app's current theme (dark / light). The initial theme is decided jointly by the runtime config's `theme` (`dark` | `light` | `system`, default `system`; `system` follows the OS `prefers-color-scheme`) and the app-shell's theme toggle (see `app-shell`). When the theme changes, the Graph view MUST update the styles immediately without rebuilding the cytoscape instance.

#### Scenario: Theme switch does not rebuild the instance

- **WHEN** the user switches dark ↔ light theme in the app-shell (or the OS preference changes while `theme` is `system`)
- **THEN** the Graph view recomputes the stylesheet with the new theme's tokens and applies it to the existing instance; the instance reference is unchanged; node, edge, label and background colors change with the theme

### Requirement: Container size responsiveness

The Graph view SHALL observe size changes of the cytoscape container and trigger a canvas resize on a debounce (default 100ms), so the canvas drawing area matches the new container size.

**resize and fit are two different things and MUST be decided separately:**

- `cy.resize()` MUST run after **every** container size change — this only lets the canvas learn the new size, and does not change the viewport's pan / zoom.
- `cy.fit()` (with padding) MUST run **only for a container size change caused by a browser window size change**. A container size change caused by an in-app layout change (legend collapse / restore, other panels opening and closing) MUST NOT trigger fit.

Rationale: fit overwrites the user's current pan / zoom. After the user has zoomed in to look closely at something, collapsing the legend is only a request for more screen space, not a request to re-frame; treating both as reasons to fit washes away the viewport the user deliberately built. A window resize, on the other hand, is an external change of environment, and re-framing is a reasonable expectation.

#### Scenario: Resize and fit after a window resize

- **WHEN** the user resizes the browser window, changing the size of the canvas area
- **THEN** the system runs a canvas resize and fit after the debounce, and all nodes remain within the visible range

#### Scenario: Collapsing the legend only resizes, does not fit, preserving the user's viewport

- **WHEN** the user first zooms / pans to some area, then collapses the legend, widening the canvas area
- **THEN** the system runs a canvas resize after the debounce, but MUST NOT fit — the current zoom and pan stay unchanged, and the area the user was viewing remains where it was (only the visible range widens)

### Requirement: Interaction and selection state

The Graph view SHALL support click-to-select on nodes, presenting the selection state through cytoscape's built-in `:selected` style, and expose the selected node's id as the Graph view's selection state, for other components (node detail panel, pinned card, search, cross-view interop) to consume.

**Selection and whether the detail panel is open (detail open) MUST be two mutually independent states.** Selection drives cytoscape's single-selection highlight, the selection-focus fade, and the pinned tooltip in the top right (below the search bar, see `graph-search`); whether the detail panel is open is pure UI state, and closing the detail panel MUST NOT clear the selection (for detail panel content see `node-detail`). Deselection has **exactly three paths**: clicking the background, clicking an edge, or clicking the unselectable `cluster` backplate (all three set the selection to empty). Clicking an **already selected** node MUST reopen its detail panel rather than deselect it. Besides canvas tap, `graph-search`'s **locate** also establishes a selection, and for a detail-eligible node it MUST open the detail panel (equivalent to left-clicking that node on the canvas, see `graph-search`). Selection and deselection **on the canvas** MUST clear a non-empty search string (see `graph-search`, "Canvas interaction clears search"); the locate path MUST NOT go through that clearing.

**`controller` / K8s `node` / `netapp-node` / `netapp-aggr`, and the decorative `namespace` / `application` groups MUST be selectable. The decorative `cluster` and `storage-cluster` groups MUST NOT be selectable (`selectable: false`).** The sole purpose of being selectable is to let the **`+/-` collapse cue** of the enabled cytoscape expand-collapse extension appear: that cue is driven by selection and is drawn only on a **single selected** node that is a `:parent` (or already collapsed). So the user clicks any selectable compound parent → that parent shows its `+/-` cue → clicking the cue toggles its collapse / expand (reusing the existing expand-collapse mechanism, adding no component and no collapse mechanism).

Because the `cluster` and `storage-cluster` groups are not selectable, clicking them always behaves the same as clicking the background (selection set to empty, no selection ring, no collapse cue surfacing). Collapse / expand for **both** is triggered instead by **double click (`dbltap`)**: on detecting a `dbltap` on an `isCluster` **or `isStorageCluster`** node, the Graph view MUST call the expand-collapse api directly (choosing expand or collapse per `isExpandable` / `isCollapsible`) to toggle that node's collapsed state. The double-click gesture MUST cover every unselectable decorative group — a container with neither a collapse cue (being unselectable) nor a double-click gesture could never be collapsed by the user at all, and the "a collapsed decorative group shows a folder glyph" requirement (below) has already defined the appearance of `storage-cluster`'s collapsed state, and that state MUST be reachable through user operation. This path fires the same `expandcollapse.aftercollapse` / `afterexpand` events as the cue, `collapsedIds` is updated through the existing collapse-change path, and no new collapse state mechanism is introduced.

The `namespace` decorative group is selectable (showing the single selection ring and the existing selection-focus visuals), but MUST NOT open the node detail panel: selection resolution always returns empty for `isNamespace`. **The `application` group is the exception**: it is detail-eligible — selecting it surfaces the collapse cue **and** opens the node detail panel showing that ArgoCD application's content (selection resolution resolves it with a synthetic `kind: application` plus `queryTarget { kind: 'application', name: <app> }`, see `node-detail`). The scope of selection resolution is therefore deliberately wider than the Dashboard button's applicability test: the latter still excludes the `application` group (an application group has no per-node dashboard, see `node-detail`).

#### Scenario: Clicking a node selects it and exposes the selection state

- **WHEN** the user clicks any selectable node
- **THEN** cytoscape marks it `:selected` and applies the corresponding style, and the Graph view's selection state updates to that node's id

#### Scenario: Clicking an already selected node reopens the panel rather than deselecting

- **WHEN** a node is already selected, its detail panel has been closed with the close button, and the user clicks that node again
- **THEN** the detail panel reopens and the selection is unchanged (it does not go through "deselect then reselect", so the highlight and the pinned tooltip persist throughout)

#### Scenario: The cluster group is unselectable, and clicking it behaves as a background click

- **WHEN** the user clicks a decorative `cluster` group node
- **THEN** that node's `selectable()` is `false`, the selection is set to empty, no selection ring appears, and the expand-collapse collapse cue does not surface either

#### Scenario: Double-clicking a cluster group toggles collapse / expand

- **WHEN** the user double-clicks (`dbltap`) a decorative `cluster` group node
- **THEN** that node's collapse / expand state is toggled directly through the expand-collapse api, `collapsedIds` updates accordingly through the existing collapse-change path, regardless of whether that node is currently selected

#### Scenario: Double-clicking a storage-cluster group toggles collapse / expand

- **WHEN** the user double-clicks (`dbltap`) a decorative `storage-cluster` group node
- **THEN** that node's collapse / expand state is toggled through exactly the same path as `cluster`; once collapsed, the center of its frame shows the folder glyph in `storageClusterColor`

#### Scenario: Double-clicking a selectable container does not take this path

- **WHEN** the user double-clicks a selectable container (`namespace` / `application` / controller / K8s `node`)
- **THEN** this double-click path MUST NOT toggle its collapsed state — the collapse gesture for these containers is the `+/-` collapse cue that surfaces on selection

#### Scenario: namespace / application groups are selectable so the collapse cue surfaces

- **WHEN** the user clicks a decorative `namespace` / `application` group node
- **THEN** its `selectable()` is `true`, it is marked `:selected` (showing the single selection ring), and expand-collapse draws the `+/-` collapse cue on it

#### Scenario: Selecting a namespace group does not open the detail panel

- **WHEN** the user selects a decorative `namespace` group node
- **THEN** selection resolution returns empty and the node detail panel MUST NOT open (only the selection ring and collapse cue appear)

#### Scenario: Selecting an application group opens its app detail

- **WHEN** the user selects an `application` group node
- **THEN** selection resolution resolves it with a synthetic `kind: application`, the node detail panel opens and presents that application's content (see `node-detail`), and the tooltip is pinned in the top right — while the collapse cue still surfaces

#### Scenario: Clicking the collapse cue toggles that parent's collapse

- **WHEN** a selectable compound parent (`controller` / K8s `node` / `netapp-node` / `namespace` / `application`) is selected and showing its `+/-` cue, and the user clicks within that cue
- **THEN** that parent's collapse / expand state toggles (through the expand-collapse api), and `collapsedIds` updates accordingly (reusing the existing cue event → collapse-change path)

### Requirement: Selection ring and fade classes reapplied after a collapse state change

Expanding / collapsing a container changes the element set on the canvas (children entering and leaving visibility, expand-collapse synthesizing or removing meta-edges), but does **not necessarily change** the input `elements` reference. The system MUST treat the **collapse state** as one of the explicit inputs to selection mirroring and fade application: after the collapsed set changes, the selection ring (the mirror of the single selection) and the focus / miss fade style classes MUST be reapplied to the current element set.

This reapplication MUST NOT depend on the `elements` reference happening to change alongside. Using a change of `elements` identity as a proxy signal for a collapse change holds only **by accident**: any optimization that keeps `elements` stable across a collapse toggle (memoization, reference reuse in diff-and-patch) makes the selection ring and fade silently fail — after expanding a container, the children that reappear carry no fade class (looking as if they were lit up), and a previously selected node that rejoins the element set on expansion carries no selection ring.

#### Scenario: After expanding a container its children take the current fade state

- **WHEN** some node is selected (focus fade in effect) and the user expands a container that was previously collapsed and is not within that selection's focus neighborhood
- **THEN** the newly appearing children MUST immediately carry the fade class (consistent with the other unlit elements), and MUST NOT appear unfaded

#### Scenario: The selection ring is still on the selected node after a collapse state change

- **WHEN** some node is selected and the user collapses then expands its ancestor container, making that node leave and re-enter the element set
- **THEN** that node MUST carry the single selection ring again, and the open / closed state of the node detail panel is unchanged

#### Scenario: Still reapplied when the elements reference is unchanged

- **WHEN** the collapse state changes but the input `elements` reference is unchanged
- **THEN** the selection ring and fade classes MUST still be reapplied — the decision MUST take the collapsed set as input, not the identity of `elements` as a proxy

### Requirement: A collapsed decorative group shows a folder icon

A decorative `cluster` / `storage-cluster` / `namespace` / `application` group, when **collapsed** (`.cy-expand-collapse-collapsed-node`), MUST show a **folder glyph** at the center of its frame, colored with that group's accent color (`clusterColor` / `storageClusterColor` / `namespaceColor` / `applicationColor`), `background-fit: contain`. When **expanded** it stays as it is — a labeled container with no centered icon (`background-image: 'none'`). This folder icon fills a gap: a compound carrying a `kind` (`controller` / k8s `node` / `netapp-node`) already falls back to its kind icon when collapsed (the base `node` rule) and MUST NOT be affected (the folder selector matches only `isCluster` / `isStorageCluster` / `isNamespace` / `isApplication`). The folder glyph is a standalone SVG outside `NodeKind` (a decorative kind is not a `NodeKind` and does not enter `ICON_SVG_BY_KIND`).

#### Scenario: A collapsed decorative group shows the folder icon

- **WHEN** a `cluster` / `namespace` / `application` decorative group is collapsed
- **THEN** its `background-image` is the folder glyph (colored with that group's accent color) rather than `'none'`

#### Scenario: An expanded decorative group has no centered icon

- **WHEN** that decorative group is expanded (`:parent`, with visible children beneath it)
- **THEN** its `background-image` is `'none'` (a labeled container with no centered folder icon)

#### Scenario: A collapsed kind-carrying compound keeps its kind icon

- **WHEN** a `controller` / k8s `node` / `netapp-node` compound is collapsed
- **THEN** its centered icon is still that kind's icon, and the folder selector MUST NOT apply to it

### Requirement: The legend panel can be collapsed to the side

The Graph view SHALL provide a `<` collapse button (icon button), placed in the action slot at the right end of the legend's top "Layout" row (the Node|Controller toggle row of pod-parent mode) — rather than a separate header row, to save the extra rail height and divider. Clicking it removes the **entire** legend `<aside>` from the layout, letting the canvas area (`flex: 1`) reclaim the freed width. While collapsed, the Graph view MUST render only a floating `>` restore button (icon button), absolutely positioned at the top left of the canvas area, overlaid on the canvas, restoring the legend `<aside>` when clicked. That restore button's `z-index` MUST be higher than cytoscape expand-collapse's overlay canvas (`.expand-collapse-canvas`, `z-index: 999`) — otherwise that canvas swallows the click and disables the restore button; at the same time it MUST stay below the app-shell's top nav and the global overlay (modal, tooltip) layer. This collapsed state is ephemeral view state of the Graph view (**not** written to the runtime config and not preserved across reload).

#### Scenario: Collapse the legend panel

- **WHEN** the legend panel is showing and the user clicks the `<` collapse button at the right end of the "Layout" row
- **THEN** the legend `<aside>` is removed from the DOM (the canvas reclaims its width), and only the floating `>` restore button is rendered instead

#### Scenario: Restore the legend panel

- **WHEN** the legend panel is collapsed and the user clicks the floating `>` restore button
- **THEN** the legend `<aside>` re-renders together with all of its sections, the floating restore button disappears, and the "Layout" row's `<` collapse button returns

### Requirement: Legend

The Graph view SHALL provide a legend showing the node icons and edge types **actually present in the graph**. The legend's icon and color data MUST come from the same lookup tables as the cytoscape stylesheet (`ICON_SVG_BY_KIND` / `EDGE_STYLE_BY_TYPE`). The node legend's kind set MUST be derived by a collapse-aware rule (see the "Collapse-aware Node Kinds legend" requirement) — listing only the kinds **currently drawn as a glyph on the canvas** (drawn leaf nodes and collapsed containers; expanded containers and children hidden by a collapsed ancestor are not listed). The edge legend MUST list only the edge types **present in the current data**, except that `pod-calls-service` / `service-selects-pod` are always **omitted** (they are pod-to-pod in essence, represented by `pod-calls-pod`'s bidirectional `pod ↔ pod/service` row, see below). Both MUST render nothing when their set is empty.

**A folded row's anchor MUST NOT depend on the anchor type itself being present in the data.** When any member type of a folded group is present in the current data, that group's representative row MUST be rendered — even if the anchor type serving as the row key is not in the data itself. The folded groups are: `pod-calls-pod` (representing `pod-calls-pod` / `pod-calls-service` / `service-selects-pod`) and `switch-to-switch` (representing `switch-to-switch` / `node-to-switch`). The row's label and glyph MUST NOT change because the anchor is absent (still `pod ↔ pod/service` and `switch/node → switch`). Otherwise a graph with only pod→service calls and no direct pod→pod calls would draw orange connections on the canvas with no legend entry explaining them and no toggle to restore them — once the user hides them they could never be brought back.

**A folded row's show / hide toggle MUST act on all member types of that group at once.** A folded row has no user path for "toggle only one of the types": toggling the `pod ↔ pod/service` row MUST remove or restore all three types from `visibleEdgeTypes` together, and toggling the `switch/node → switch` row MUST act on both types together. The row's shown state MUST reflect the consistent state of that group's members. The node legend MUST present every kind as a theme-colored icon glyph (replacing the earlier shape glyph), **grouped** by the front end's own kind → category lookup table (Workloads / Networking / Storage / Cluster / Other), rendering only the categories that contain at least one present kind; color MUST NOT be used to encode category (color is reserved for status). A kind row's text label defaults to the kind string itself, but display-name overrides MUST be supported: `network` MUST display as `physical network`. Every edge legend row MUST render as `<from> [arrow glyph] <to>`: the arrow glyph (carrying that edge's color and line style) sits between the two `NodeKind` labels in place of a verb, the endpoint labels come from `EDGE_ENDPOINTS_BY_TYPE` (`service` abbreviated to `svc`), and no extra nesting explanatory text may appear. The exception: the `pod-calls-pod` row MUST render as `pod ↔ pod/service` (a bidirectional glyph with arrowheads at both ends), representing the omitted pair of service edges.

The legend's vertical section order MUST be: `Layout` (the pod-parent mode Node|Controller toggle, pinned at the top) → `Node Kinds` → **`Ingress Gateway`** → `Edge Types` → `Status` → the swatch sections (`Clusters` → `Namespaces` → `Applications` → **`Nodes`|`Controllers`**). That is, the swatch sections come **after** `Status`, and **`Nodes`|`Controllers` (the container legend) MUST be the bottommost section** (after `Applications`; in `node` mode `Namespaces` / `Applications` do not render, and it still follows `Clusters` directly as the bottommost).

`Ingress Gateway` (the ingress visibility toggle, see `ingress-visibility-toggle`) is **presence-gated**: it renders only when a non-empty set of ingress-gateway nodes actually exists in the graph, otherwise it MUST NOT render — consistent with this requirement's "render nothing when the set is empty" convention. It comes immediately **after** `Node Kinds` and **before** `Edge Types`, because like the node legend it is a **node visibility control** (eye / eye-slash vocabulary) rather than an explanatory row about edges or status; it MUST NOT be merged into the node legend's kind-keyed rows. Besides the heading and the eye toggle, that section MUST carry a dashed edge glyph sample explaining the semantics of the dashed ingress on the canvas — the edge legend omits the service type rows and its samples are always solid, so without this sample the dashed lines on the canvas would have no explanation anywhere in the legend.

`Namespaces` and `Applications` (heading `Applications`) are **mode-gated**: they render only in `controller` mode (`node` mode strips the namespace / application groups, so both sections MUST NOT render). `Namespaces` is fed by the backend's `isNamespace` group nodes (colored with `namespaceColor`), and `Applications` by the backend's `isApplication` group nodes (colored with `applicationColor`, taken from the application palette). The `storageclass` kind has been removed from the backend contract, so the node legend's `Storage` category consists of the three glyphs `pvc` / `netapp-aggr` / `netapp-node` (through the existing kind → category lookup); the removed `Storage Classes` swatch section MUST stay removed, and no swatch section may be added for ONTAP either — `storage-cluster` is only an accent group frame and needs no legend row. Every section heading MUST be Title Case (`Node Kinds` / `Ingress Gateway` / `Edge Types` / `Status` / `Clusters` / `Namespaces` / `Applications` / `Nodes`|`Controllers`).

#### Scenario: The node legend lists only the kinds drawn as glyphs, grouped by category

- **WHEN** in the data the Graph view receives, pod / service / pvc / node are all drawn leaf nodes (no nesting container, no collapse), and there is no workload or switch
- **THEN** the node legend presents only pod / service / pvc / node as icon glyphs, grouped by category (pod→Workloads, service→Networking, pvc→Storage, node→Cluster); kinds that are not present (deployment / switch etc.) are not listed, and color does not distinguish category
- **AND** (see the collapse-aware requirement) if `node` becomes instead an expanded container holding pods, `node` disappears from the node legend (appearing in the `Nodes` swatch section instead), returning to the node legend as a glyph only once collapsed

#### Scenario: The edge legend lists only the edge types present and not omitted

- **WHEN** the graph has `pod-mounts-pvc` and `pod-calls-pod` edges but no `switch-to-switch`
- **THEN** the edge legend presents only `pod-mounts-pvc` / `pod-calls-pod` as `<from> → <to>` (arrow glyph centered), `switch-to-switch` / `node-to-switch` are not listed, and the colors and line styles match the canvas rendering

#### Scenario: The folded row still renders when the anchor type is not in the data

- **WHEN** the graph has `pod-calls-service` / `service-selects-pod` edges but no `pod-calls-pod` edge at all
- **THEN** the edge legend MUST still render the `pod ↔ pod/service` row (color, line style and bidirectional glyph exactly as when the anchor is present), and that row MUST provide a show / hide toggle button
- **AND** likewise, when the graph has only `node-to-switch` and no `switch-to-switch`, the `switch/node → switch` row MUST still render and be toggleable

#### Scenario: A folded row's toggle acts on the whole group at once

- **WHEN** the user clicks the hide toggle button on the `pod ↔ pod/service` row
- **THEN** all three types `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` MUST be removed from `visibleEdgeTypes` together, and all three sets of edges on the canvas hide together; clicking again restores all three together

#### Scenario: Service edges are omitted from the edge legend (they are pod-to-pod in essence)

- **WHEN** the graph has `pod-calls-service` / `service-selects-pod` edges
- **THEN** neither type MUST appear in the edge legend (no row of their own, and no extra merged row); they are drawn on the canvas in the same orange as `pod-calls-pod` and are represented by the `pod-calls-pod` row, which renders as `pod ↔ pod/service` (bidirectional arrow glyph)

#### Scenario: The Ingress Gateway section sits between Node Kinds and Edge Types

- **WHEN** a non-empty set of ingress-gateway nodes exists in the graph and the legend renders
- **THEN** the section order MUST be `Node Kinds` → `Ingress Gateway` → `Edge Types`, with the Title Case heading `Ingress Gateway`

#### Scenario: The section does not render when the graph has no ingress node

- **WHEN** no node in the graph belongs to the ingress-gateway set
- **THEN** the legend MUST NOT render the `Ingress Gateway` section, and the order of the remaining sections is unaffected (`Node Kinds` runs straight into `Edge Types`)

#### Scenario: The Applications swatch section lists the backend's application groups (mode-gated)

- **WHEN** the graph has backend `isApplication` group nodes in `controller` mode
- **THEN** the `Applications` section lists one swatch per application name, colored from `applicationColor` (the accent of the application palette); after switching to `node` mode the application groups are stripped and that section does not render (mode-gated just like the `Namespaces` section)

#### Scenario: The Controllers / Nodes swatch is the bottommost legend section

- **WHEN** the legend renders `Clusters`, `Namespaces`, `Applications`, `Controllers` in `controller` mode
- **THEN** the vertical order MUST be `Clusters` → `Namespaces` → `Applications` → `Controllers` (`Controllers` last)
- **WHEN** the legend renders `Clusters` and `Nodes` in `node` mode (no Namespaces / Applications)
- **THEN** the vertical order MUST be `Clusters` → `Nodes` (`Nodes` last)

#### Scenario: NetApp kinds appear as node legend glyphs, with no swatch section of their own

- **WHEN** the graph has `netapp-aggr` / `netapp-node` nodes (the storageclass leaf node this scenario originally described has been removed from the contract)
- **THEN** each appears as its own glyph in the node legend's `Storage` category (alongside `pvc`); the legend MUST NOT render a `Storage Classes` swatch section, and MUST NOT add a swatch section for `storage-cluster` either

#### Scenario: Nothing renders when the set is empty

- **WHEN** the graph has no node at all (or no drawn edge at all)
- **THEN** the node legend (or the edge legend) renders nothing, with no empty heading

### Requirement: Hover tooltip showing element metadata

The Graph view SHALL provide a hover tooltip with **two modes**:

- **(1) Floating hover mode (the default, when no detail node is selected).** When the user hovers any node or edge, the tooltip MUST be positioned near the hovered element (`position: absolute`, taking the node's rendered center or the cursor's rendered position on the edge, plus a fixed offset), and clamped and flipped within the cytoscape canvas wrapper's bounds (when the offset would push it past the right or bottom edge, it flips to the element's left side and clamps within the wrapper, never overflowing the viewport). About 280px wide, with `pointer-events: none` applied, never blocking interaction with the graph beneath it.
- **(2) Pinned mode (when a detail-eligible node is left-click selected).** The tooltip is **pinned to the top right of the canvas** (`top: 8` / `right: 8` / `left: auto`, `maxHeight: calc(50% - 16px)`, `overflowY: auto`, `pointer-events: auto` so the content can scroll, `zIndex: 1000` to sit above cytoscape expand-collapse's transparent input layer at `z-index: 999`), showing the full tooltip content of the **selected node** (title + promoted attrs + raw labels). That content MUST be **identical to hover mode and come from the same source** (the same node attribute construction logic and label row transformation, including the promoted `kind` row). While pinned, **the floating hover tooltip is fully suppressed for both nodes and edges**.

The selected node's data comes from the gated selection resolution (visible + not hidden by a collapsed ancestor + detail-eligible), so the decorative **`cluster` / `namespace`** groups (for which selection resolution returns empty) do **not** pin, and their hover behavior is unchanged; **the `application` group is detail-eligible** and **does** pin when selected (showing its synthetic `kind: application` and name). The pinned card has **no close button**: deselecting (clicking the background or an edge, switching node, filtering it out by kind / edge, collapsing its ancestor, or a data refresh removing it) automatically clears the pin and returns to hover mode. The styling MUST use the app theme tokens (a semi-transparent secondary background color, opacity ≥ 0.85).

**physical-storage nodes (`netapp-aggr` / `netapp-node`) MUST take the ordinary node tooltip path** — they carry their own `kind`, `labels.ontap_cluster` (an aggregate also has `labels.node`) and `health`, and `netapp-aggr` additionally carries `usage`; the tooltip (floating or pinned) shows these own fields directly, with no synthesis path. The removed `storageclass` kind disappears together with its `provisioner` / `parameters` tooltip rows. **`health` and `usage` MUST be promoted attribute rows** (from the same source as `kind` / `namespace` / `ipAddress`): `health` shows its string value verbatim, and `usage` MUST be presented in the human-readable format `<used> / <capacity> (<pct>%)` (bytes abbreviated with decimal units, percentage rounded to an integer). When `usage` is missing the whole row is omitted, and **MUST NOT** be shown as `0` or a placeholder. A PVC node carrying `storageclass` (the claim's StorageClass name) and `usage` MUST show one row for each through the same mechanism. Kind-less backend groups (`isNamespace` / `isApplication`) MUST derive a **synthetic `kind` row** from their flag (`isApplication` → `application`, `isNamespace` → `namespace`) — for presentation only, and MUST NOT write `kind` into `data` (the groups stay kind-less, invisible to kind filtering and the icon legend). The `cluster` group is skipped upstream in hover detection and shows no tooltip, so it does not apply.

**The tooltip's name title MUST use the bare `data.label` (falling back to `data.id` when missing), and MUST NOT carry the canvas compound's kind prefix** (`Cluster:` / `Namespace:` / `Release Unit:` / `Node:`). Those prefixes are rendered only by the stylesheet on the canvas label (see "Decorative compound groups use per-kind fixed colors and kind-prefixed labels" and "physical-network and k8s node compound header label alignment"); the `data.label` normalization writes for a decorative group is the bare name, so the hover and pinned paths take the bare name straight from `data.label` with no stripping needed.

#### Scenario: Hovering a node shows its metadata (no selection)

- **WHEN** no detail node is selected and the user hovers any node
- **THEN** the tooltip floats and shows the node's `name` (`data.label ?? data.id`), `kind`, `namespace`, `ipAddress` (`data.ipAddress` joined by commas, only when present and non-empty), `application` (the ArgoCD application; shown for any leaf node carrying `data.application` — pod / service / pvc and the aggregated controller — except that the decorative `application` group node MUST NOT show this row, to avoid duplicating its synthetic `kind` / `name`), and the allow-listed labels that have values (`app`, `version`, `app.kubernetes.io/name`, `app.kubernetes.io/instance`); a field with a missing value MUST NOT render its row (no blank placeholder)

#### Scenario: Hovering a NetApp leaf node shows its own metadata (no selection)

- **WHEN** there is no selection and the pointer moves to a `netapp-aggr` leaf node (nested under some `netapp-node`, carrying its own `kind: netapp-aggr`, `labels.ontap_cluster`, `labels.node`, `health: "online"`, `usage: { usedBytes: 700000000000, capacityBytes: 1000000000000 }`; the storageclass leaf node this scenario originally described has been removed from the contract)
- **THEN** the tooltip floats and shows its name (as the title), `kind: netapp-aggr`, `health: online`, the formatted `usage` (for example `700 GB / 1 TB (70%)`), and the two label rows `ontap_cluster` / `node`
- **AND** MUST NOT show any `provisioner` / `parameters` row (those fields left the contract with storageclass)

#### Scenario: Hovering a kind-less group (namespace / application) shows a synthetic kind

- **WHEN** the user hovers a backend `namespace` or `application` group node (kind-less: no `data.kind`, only an `isNamespace` / `isApplication` flag)
- **THEN** the tooltip MUST derive and show a synthetic `kind` row from that flag (`isApplication` → `application`, `isNamespace` → `namespace`), so the hover is not reduced to a bare name; that row is presentation only and MUST NOT write `kind` into `data` (the group stays kind-less, invisible to kind filtering and the icon legend). The `cluster` group is skipped upstream in hover detection and shows no tooltip, so it does not apply

#### Scenario: A decorative group's hover title is the bare name (no kind prefix)

- **WHEN** the user hovers a `namespace` group whose `data.label` is `shop`, or an `application` group whose `data.label` is `mongo` (rendered on the canvas as `Namespace: shop` / `Release Unit: mongo` respectively)
- **THEN** the tooltip title MUST be `shop` / `mongo` respectively, and MUST NOT carry the `Namespace:` / `Release Unit:` prefix
- **AND** the synthetic `kind` row still shows `namespace` / `application` respectively

#### Scenario: A pinned application group's title is the bare name

- **WHEN** the user left-click selects an `application` group whose `data.label` is `mongo` (detail-eligible, so the tooltip pins)
- **THEN** the pinned card's title MUST be `mongo`, and MUST NOT be `Release Unit: mongo`

#### Scenario: Hovering an edge shows its metadata (no selection)

- **WHEN** no detail node is selected and the user hovers any edge
- **THEN** the tooltip floats and shows `edgeType` and `source → target` (resolved through both endpoint nodes' `label`, not the bare ids)

#### Scenario: The tooltip is positioned near the hovered element (hover mode)

- **WHEN** no detail node is selected and the user hovers a node
- **THEN** the tooltip is positioned from that node's rendered position plus a fixed offset (dynamic `left` / `top`), not fixed in a corner
- **AND** when the offset would push it past the canvas's right or bottom edge, it flips to the node's left side and clamps within the wrapper's bounds

#### Scenario: The tooltip does not block graph interaction (hover mode)

- **WHEN** the floating hover tooltip is showing and the user clicks a node lying beneath the tooltip's DOM area
- **THEN** that node is selected (firing the existing `:selected` style and selection state update), and the hover tooltip does not intercept that click (`pointer-events: none` in effect)

#### Scenario: The floating tooltip fades out and leaves the DOM after hover ends

- **WHEN** there is no selection and the pointer leaves the hovered element without entering another element
- **THEN** the tooltip fades out with an opacity transition (≥ 100ms, ≤ 200ms), and renders no DOM at all once the animation ends (leaving no empty placeholder frame)

#### Scenario: A removed hovered element clears the floating tooltip

- **WHEN** some element is hovered (with no selection) and a data refresh removes it from the cytoscape instance
- **THEN** the hover state is cleared on the `remove` event, the tooltip disappears immediately, and content pointing at a no-longer-existing element is never rendered

#### Scenario: Hover does not re-render the canvas component

- **WHEN** the user hovers several elements in succession
- **THEN** the tooltip component subscribed to the hover state re-renders, while the canvas component and the cytoscape instance reference are unchanged (verified with the React DevTools profiler: the canvas component's render count does not increase)

#### Scenario: Left-click selecting a detail node pins the tooltip to the top right

- **WHEN** the user left-click selects a detail-eligible node (including a `netapp-aggr` leaf node, a k8s node, a `netapp-node` or a controller)
- **THEN** the tooltip enters pinned mode: at the top right of the canvas (`top:8` / `right:8`, `pointer-events:auto`, `zIndex:1000`, scrollable, `maxHeight: calc(50% - 16px)`) it pins **that node's** title + promoted attrs (including the `kind` row) + raw labels (the label row transformation filters out the already-promoted `namespace`)
- **AND** the pinned content is the same as what hovering that node shows (the same source)

#### Scenario: Pinned suppresses the floating hover

- **WHEN** a detail node is selected (the tooltip is pinned) and the user hovers another node or edge
- **THEN** the floating hover tooltip MUST NOT appear (pinned mode suppresses hover), and the top right keeps showing only the selected node's pinned card

#### Scenario: The pinned tooltip still shows when the cursor is not on any element

- **WHEN** a detail node is selected and the cursor hovers no element (the hover state is empty)
- **THEN** the pinned card MUST still show (pinned mode does not depend on a hovered element; it renders before the early return for an empty hover)

#### Scenario: Deselecting clears the pin and returns to hover

- **WHEN** the tooltip is pinned and the user deselects (clicking the background or an edge, switching to another node, filtering that node out by kind or edge, collapsing its ancestor, or a data refresh removing it)
- **THEN** selection resolution returns empty, the pinned card disappears, and the tooltip returns to floating hover mode

#### Scenario: Selecting a NetApp node pins its health and usage

- **WHEN** the user left-click selects a `netapp-aggr` leaf node or a `netapp-node` compound (the storageclass leaf node this scenario originally described has been removed from the contract)
- **THEN** the tooltip pins and shows its `kind` + `health` + (on `netapp-aggr`) the formatted `usage`, plus its `ontap_cluster` / `node` labels; the bottom detail panel renders only the header, having no change-report or alerts section (see `node-detail`)
- **AND** when a PVC carrying `storageclass` and `usage` is selected, one row each of `storageclass: <name>` and the formatted `usage` is pinned

### Requirement: Node Kind / Edge Type filtering

The Graph view SHALL maintain two sets of in-app view state — `visibleKinds` (the set of visible `NodeKind`s) and `visibleEdgeTypes` (the set of visible `EdgeType`s) — replacing the panel options editor's two multi-selects; both are operated by the legend's per-row show / hide toggles (for node kind see the "Show / hide toggle on every node kind row of the Legend" requirement; edge types are operated by the same eye / eye-slash toggle on each row of the `Edge Types` legend), are ephemeral view state, are not written to the runtime config and are not preserved across reload. The default value is all keys of the corresponding table (`ICON_SVG_BY_KIND` / the set of edge types drawn in the current mode), except that `network` MUST be excluded from `visibleKinds`'s options and default (`ALL_KINDS`): the virtual fabric wrapper is not a filterable resource kind, and the visibility decision MUST always treat the `network` kind as visible — cytoscape's effective visibility is the AND of an element and all its ancestors, so hiding the wrapper would also hide every switch beneath it; the wrapper is still swept up by the orphan cascade once all its switches are filtered out. Filtered elements MUST be hidden with `visibility: hidden` (preserving positions, not triggering a cytoscape re-layout), and the filtering logic MUST be concentrated in a single pure function taking `(elements, visibleKinds, visibleEdgeTypes)` as input, to make it independently verifiable.

After the kind-pass and edge-pass, the visibility decision MUST additionally run an **orphan cascade hide**, and that cascade MUST **act only on compound containers, never on leaf nodes**:

- Whether a **leaf node** (one for which no node in `elements` has it as `data.parent`) is removed by the orphan cascade MUST be decided by the **origin** of its edges, not by whether it currently has a visible edge:
  - **A leaf with at least one incident edge in the baseline graph** MUST NOT be removed by the orphan cascade — even when not one of its incident edges is currently drawn. What the user hid is edges, not nodes; that resource does have connections in the topology, they are just temporarily invisible.
  - **A leaf with no incident edge at all in the baseline graph** (isolated in the data to begin with) MUST be removed by the orphan cascade, regardless of the filter state.

  The **baseline graph** is defined as the graph output by the normalize boundary — that is, the element set the backend delivered, before any view transform or filter is applied. It MUST come before the pod-parent mode topology transform, kind / edge-type filtering and the ingress pass. This definition is necessary: `node` mode expresses `pod-to-node` as nesting instead and removes that edge from `elements`, and if the transformed element set were the baseline, these pods would be misjudged as "isolated to begin with" and disappear. The decision MUST look only at whether an edge with that node as source or target exists in the baseline, not at whether that edge's type is drawable in the current mode.

- A **compound container** (one for which at least one node in `elements` has it as `data.parent`), if it has neither a visible child (a node whose `data.parent` points at it and that is still in the visible node set) nor a visible incident drawn-edge, MUST be removed from the visible node set, together with the edges having it as an endpoint — an empty box does not stay on the canvas.

This decision MUST iterate to a fixed point until stable: after a container is removed, if its parent container thereby has no visible child and no visible edge, it MUST be hidden recursively in a later iteration (such as a controller → K8s `node` → `cluster` chain). The orphan cascade is **always on, with no switch**, and acts on the final visible set; for a container, it does not distinguish whether its children were "never in the data" or "disappeared because of a filter". A `cluster` container is not hidden by kind filtering, but MUST be swept up when all of its children are invisible. Meta-edges (synthesized by expand-collapse) are not in `elements` and do not participate in the orphan decision; children visually hidden by collapse still count as "visible children" (they were not removed from the visible node set), so a collapsed parent container MUST NOT be misjudged an orphan.

The container / leaf decision MUST be based on the parent-child relationships in `elements`, not on whether that child is currently visible — a container whose children are all filtered out is still a container (and so is swept up by the cascade), rather than becoming a leaf (which would keep it forever).

#### Scenario: After filtering a node kind the corresponding nodes are invisible and positions are preserved

- **WHEN** the user removes `pod` from `visibleKinds` through the legend's `pod` row toggle
- **THEN** all nodes with `data.kind === 'pod'` are hidden with `visibility: hidden`; the positions of the remaining nodes are unchanged (no layout re-layout is triggered); the cytoscape instance reference is unchanged

#### Scenario: After filtering an edge type the corresponding edges are invisible

- **WHEN** the user removes that folded group (`pod-calls-pod` / `pod-calls-service` / `service-selects-pod`) from `visibleEdgeTypes` through the legend's `pod ↔ pod/service` row toggle
- **THEN** the edges of all three types in that group are hidden with `visibility: hidden`; edges **not belonging to that group** are unaffected; nodes that did not thereby become orphaned (still having another visible edge or visible child) stay visible

#### Scenario: An edge hides automatically when either endpoint is hidden

- **WHEN** an edge's source or target node is hidden by `visibleKinds` filtering
- **THEN** that edge MUST also be hidden (no dangling line), even when that edge's `edgeType` is still in `visibleEdgeTypes`

#### Scenario: A leaf that lost all visible connections to UI filtering stays visible

- **WHEN** some leaf node has an incident edge in the baseline graph, and the user filters edge types so that no edge with it as an endpoint remains in the visible edge set
- **THEN** that node MUST stay visible (not removed by the orphan cascade); only the lost edges are hidden; no layout re-layout is triggered

#### Scenario: In node mode a pod whose only edge is pod-to-node stays visible

- **WHEN** `node` mode expresses `pod-to-node` as nesting instead and no longer draws that edge, leaving some pod (such as a DaemonSet / Job / CronJob pod) with no visible incident drawn-edge at all
- **THEN** that pod MUST stay visible and show inside its K8s `node` container — it has a `pod-to-node` edge in the baseline graph, so it is a case of "the edge was hidden by the UI" rather than "isolated to begin with"

#### Scenario: A container that becomes empty is hidden recursively

- **WHEN** all the pod children beneath some K8s `node` container are removed from the visible node set by kind filtering (or the ingress pass), and that `node` has no other visible edge
- **THEN** that `node` container MUST be hidden along with them in a later iteration; if that action leaves the `cluster` container it belongs to with no visible child at all, the `cluster` container MUST be hidden too

#### Scenario: A container with a visible child is kept

- **WHEN** some container (a K8s `node`, controller or `cluster`) has no visible incident edge of its own, but still has at least one visible child beneath it
- **THEN** that container MUST stay visible (not hidden as an orphan)

#### Scenario: A controller is hidden along with its child pods when they are all filtered

- **WHEN** in `controller` mode all the pod children beneath some controller container are removed from the visible node set by kind / edge **filtering** (`visibility: hidden`, not collapse), and that controller has no other visible incident edge
- **THEN** that controller container MUST be hidden by the orphan cascade — **filter-hidden children do not count as "visible children" (unlike collapse-hidden ones)**; if its `cluster` thereby has no visible child, the `cluster` is hidden recursively too

#### Scenario: A node isolated in the data to begin with stays hidden

- **WHEN** upstream returns a node with neither any edge nor any child (even though the user applied no filter at all)
- **THEN** that node MUST be hidden by the orphan cascade — it has no incident edge in the baseline graph to begin with, and does not fall under "the edge was hidden by the UI"

#### Scenario: The two kinds of edgeless leaf get different results on the same screen

- **WHEN** the graph contains both leaf A (with an incident edge in the baseline) and leaf B (with no incident edge at all in the baseline), and the user has hidden all of A's edge types
- **THEN** A MUST be visible (with no connection) and B MUST be hidden — neither currently has a visible edge, yet the results differ, because the decision is based on the baseline rather than the current state

#### Scenario: An empty container whose children are all filtered is still swept up

- **WHEN** some container has children in `elements`, but all of its children are removed from the visible node set by filtering, and that container has no visible incident edge
- **THEN** that container MUST be hidden by the orphan cascade (it is still a container, and is not kept as a leaf just because all its children are invisible)

#### Scenario: Filtering does not re-run layout

- **WHEN** the user toggles `visibleKinds` or `visibleEdgeTypes` (including the orphan cascade it triggers)
- **THEN** the system applies `style('visibility', ...)` in a cytoscape batch; layout is **not** re-run; node positions stay as they were (coordinates unchanged)

#### Scenario: Filtering out every node kind shows the empty state

- **WHEN** the user clears `visibleKinds` to the empty set
- **THEN** all nodes hide, the Graph view overlays the empty state and shows the text "All node types filtered", and the canvas itself is kept (the instance is not rebuilt)

#### Scenario: An unknown kind is visible by default

- **WHEN** upstream returns a node whose `data.kind` is not among the `ICON_SVG_BY_KIND` keys (example: `ingress`), and the user has made no special setting for that kind
- **THEN** that node MUST be visible by default (the visibility decision returns visible for an unknown kind), avoiding data silently disappearing when upstream adds a resource type

#### Scenario: The Legend reflects the data and is unaffected by the filter

- **WHEN** the user filters any kind / edgeType
- **THEN** the sets listed by the node legend / edge legend MUST be unaffected by the filter — the edge legend comes from the edge types **appearing in the data**, and the node legend from the collapse-aware derivation (taking `elements` + `collapsedIds`, **not** `visibleKinds`); filtered elements are still in `elements` (only `visibility: hidden`) and the collapse state is unchanged either, so the legend still lists them and the user can tell which types are currently hidden. (Note: the legend changing with **collapse** is a separate matter, see the "Collapse-aware Node Kinds legend" requirement)

#### Scenario: The Tooltip never shows a filtered element

- **WHEN** an element has been hidden by filtering (`visibility: hidden`)
- **THEN** cytoscape does not fire `mouseover` for that element; the hover tooltip does not show that element's metadata

#### Scenario: On first load with no filter state the defaults are taken

- **WHEN** the Graph view loads for the first time, with no user operation on `visibleKinds` / `visibleEdgeTypes` yet
- **THEN** both sets take their default value (all visible), behaving as unfiltered, throwing no exception

#### Scenario: The visibility decision is a pure function and independently verifiable

- **WHEN** the visibility decision is called with `(elements, visibleKinds, visibleEdgeTypes)`
- **THEN** the correct visible set results in all of the following cases: all visible, filtering a single kind, filtering a single edgeType, filtering nodes that also invalidates edge endpoints, empty elements, an unknown kind visible by default, **a leaf with baseline edges that are all currently filtered staying visible**, **a leaf with no baseline edge staying hidden**, **the two of them coexisting each getting a different result**, **a container whose children are all filtered being swept up**, a recursive container cascade (the controller→node→cluster chain becoming empty), a container with a visible child being kept, **a container whose children are all invisible not being misjudged a leaf**; the decision depends on neither the DOM nor a cytoscape instance

### Requirement: Empty state and error state rendering

When the data is empty, loading, or fetching from `endpoints.graph` fails, the Graph view MUST show the corresponding state UI (empty / loading / error), and may not show a blank canvas or throw an exception outside the React tree.

#### Scenario: Empty data shows the empty state

- **WHEN** the Graph view receives `elements: []`
- **THEN** the Graph view shows the empty state, with text noting there is no data, and the canvas area left blank

#### Scenario: An API error shows an error notice

- **WHEN** fetching from `endpoints.graph` fails (network error, non-2xx, or a response not matching the `WireGraph` contract)
- **THEN** the Graph view shows an error banner in the app theme's style, containing the error message and a retry hint, and does not show a broken cytoscape canvas

### Requirement: Status outline

The Graph view SHALL render a status outline from a node's `data.status`, with colors from the single source `STATUS_COLOR` (`normal`→green `#73BF69`, `warning`→yellow `#F2CC0C`, `critical`→red `#E02F44`). The status outline MUST apply to **any kind for which the backend reports `data.status`** (data-driven, not a hardcoded `pod` / `node` / `pvc` list); when status is missing or invalid the normalization layer MUST NOT write the `status` field — that node keeps a theme-neutral outline, and the detail panel shows no status badge either (though in a parent container's worstStatus aggregation, a child with no status still counts as `normal`). The Legend MUST show the three-color status explanation (the `Status` section).

#### Scenario: The outline follows status

- **WHEN** any node (including a workload kind such as `deployment`) carries a `data.status` reported by the backend
- **THEN** that node renders its outline in the corresponding `STATUS_COLOR`
- **WHEN** `status` is missing or not in the enumeration
- **THEN** the normalization layer does not write the `status` field, the node keeps a theme-neutral outline (no status outline), and the detail panel shows no status badge

#### Scenario: The outline does not affect selection or containers

- **WHEN** a node is selected
- **THEN** the selection highlight (`node:selected`) overrides the status outline
- **AND** a K8s `node` or controller that is a compound parent still shows the status outline (the selector ordering overrides `node:parent`)

### Requirement: The container legend switches its container source with the pod-parent mode

The source of the containers listed by the container legend (the list of compound containers colored in cluster colors, with a "collapse / expand all" toggle) MUST switch with `podParentMode`: `node` mode lists K8s `node` containers (the middle tier of `cluster > node > pod`); `controller` mode lists controller containers instead (the middle tier of `cluster > controller > pod`). The controller container source MUST be **the backend's `controller` group nodes** (marked `isController: true` by enrichment, kind derived from the child pods' `owner.kind`), not front-end synthesis; controller mode identifies containers by `d.isController === true`. Both modes color containers with the accent color of the cluster they belong to (from the same source as the canvas container's background color), and the "collapse all" toggle MUST act on the container set of the **current mode** (through a single container derivation logic, so the toggle button and the canvas containers always point at the same set). The container legend MUST NOT render when the current mode has no compound container at all.

#### Scenario: node mode lists K8s node containers

- **WHEN** `podParentMode === 'node'` and the graph has K8s nodes holding pods
- **THEN** the container legend lists those K8s nodes (each in its cluster color), and "collapse all" acts on that node container set

#### Scenario: controller mode lists controller containers

- **WHEN** `podParentMode === 'controller'` and the graph has backend `controller` groups holding pods (`isController: true`)
- **THEN** the container legend lists those controllers instead (each in its cluster color); "collapse all" acts on the controller container set instead

#### Scenario: Nothing renders when the current mode has no container

- **WHEN** the graph has no compound container at all in the current mode (example: bare pods with no owner in controller mode)
- **THEN** the container legend does not render, with no empty heading

### Requirement: A collapsed container (controller / k8s node) takes its outline color from the worst child status

When a **container is collapsed** (a controller or a k8s `node`), its rectangular outline MUST take the `STATUS_COLOR` of **the worst status its collapse hides** (`normal` green `#73BF69` / `warning` yellow / `critical` red) — **including `normal`**: a container whose content is entirely healthy MUST draw a `normal` green outline when collapsed (explicit good news, rather than a neutral outline-less box). The data comes from `data.worstStatus`, aggregated onto that node by the normalization layer (see `graph-data-source`: a controller's worstStatus is the worst status among its child pods (`pod.parent === controllerId`), and is **always written**; a k8s node's worstStatus is the worst of its own status and the statuses of **its pods** — in the `controller` view pods are no longer nested under the node, so a node's pods are identified as **the pods reachable through `pod-to-node` edges** (D8); in the `node` view pods are nested under the node again, and children are used instead. **It is written whenever there is any status information** — a node with no status of its own and no pod at all (reachable or nested) has no such field, and keeps a neutral outline when collapsed, because "no information" must not masquerade as normal). The stylesheet MUST implement it with the `node[worstStatus="<status>"].cy-expand-collapse-collapsed-node` selector, declared **after** the data-driven `node[status="<s>"]` selector (**any node carrying `status`** draws its own status outline, rather than a pod/node/pvc allow-list; the normalization layer writes that field only when the backend actually provides a status, so service / external / cluster / netapp-aggr / netapp-node and others without a status keep a neutral outline. NetApp's `health` is a separate field and MUST NOT map to the status outline color — the colors are reserved for the K8s status scale), so that **a collapsed k8s node**'s worst child status can override its own status outline. A controller has no status outline of its own, so this is its only coloring. `node:selected` is expressed with an outline / underlay and does not affect this outline color. An **expanded** container does not match this selector (a controller keeps the neutral `:parent` container frame, and a k8s node keeps its own status outline). What is used here is **status**, not alert severity: `info` exists only in alerts and is not on the status scale, so a collapse outline is never `info` (`SEVERITY_COLOR` serves only the detail panel's alert table).

#### Scenario: A collapsed controller shows its worst child pod status

- **WHEN** a controller has a pod with `status: critical` beneath it and the user **collapses** that controller
- **THEN** the collapsed controller's rectangular outline is `STATUS_COLOR.critical` (red)
- **WHEN** the same controller is **expanded**
- **THEN** the outline returns to the neutral `:parent` container color

#### Scenario: A k8s node's worstStatus is computed through pod-to-node edges

- **WHEN** in the `controller` view some k8s `node` has `status: normal` of its own, and a pod with `status: critical` points at it through a `pod-to-node` edge (that pod is nested under its controller, not under the node)
- **THEN** the normalization layer writes `data.worstStatus` as `critical` (the worst among the pods reachable through `pod-to-node` edges); in the `node` view, where pods are nested under the node again, identifying by children gives the same result

#### Scenario: A collapsed k8s node's worst child status overrides its own status outline

- **WHEN** a k8s `node` has `status: normal` of its own, has a pod with `status: critical` beneath it (identified through a `pod-to-node` edge or by nesting), and the user **collapses** that node
- **THEN** the collapsed node's rectangular outline is `STATUS_COLOR.critical` (red), overriding its own normal green
- **WHEN** the same node is **expanded**
- **THEN** the outline returns to its own status (`normal` green), and every child pod shows its own status outline

#### Scenario: An all-normal container draws a normal green outline when collapsed

- **WHEN** the worst status a container (a controller or a k8s node) hides on collapse is `normal` (every child is normal, and those missing a status count as normal)
- **THEN** the collapsed container's rectangular outline is `STATUS_COLOR.normal` (green) — always so for a controller, and so for a k8s node when it or at least one pod carries status information

#### Scenario: A k8s node with no status information keeps a neutral outline when collapsed

- **WHEN** a k8s `node` has no `status` of its own and no pod at all (reachable or nested)
- **THEN** that node has no `data.worstStatus`, and keeps a neutral container outline when collapsed ("no information" is not "normal")

### Requirement: Collapse-aware Node Kinds legend (listing only what is actually drawn as a glyph)

The kind set of the "Node Kinds" icon legend MUST be derived by a pure function taking `(elements, collapsedIds)` as input, listing only the kinds **currently drawn as a glyph on the canvas**, rather than simply the kinds appearing in the data. The rule, for every non-cluster node carrying a `kind`: a node hidden by a collapsed ancestor does **not** count; an **expanded** container (whose id is some node's `parent` and which is not itself collapsed) does **not** count (it is presented in the Clusters / Nodes|Controllers swatch sections instead); everything else (a drawn leaf node, or a **collapsed** container) counts toward its kind. `cluster` (which has no kind) never counts. This rule replaces the earlier presentKinds + showNodeKindIcon combination, making node and controller containers consistent. `netapp-aggr` is a leaf node under `netapp-node` and always counts through its glyph (a drawn leaf node); `netapp-node` **is** a genuine compound container and takes the same rule as `node` / `controller` — not counting when expanded (a frame on the canvas), counting through its glyph when collapsed. The removed `storageclass` kind no longer has a corresponding rule.

#### Scenario: A NetApp aggregate always counts toward Node Kinds as a leaf glyph

- **WHEN** the graph has `netapp-aggr` leaf nodes (with their parent `netapp-node` expanded) and pvc leaf nodes (the storageclass leaf node this scenario originally described has been removed from the contract)
- **THEN** the Node Kinds legend's `Storage` category lists the two glyphs `pvc` and `netapp-aggr`; the expanded `netapp-node` does **not** count (it is a frame on the canvas), returning to the Node Kinds legend as a `netapp-node` glyph only once collapsed

#### Scenario: Collapsing a container removes its child kinds and adds the container kind (for node and controller alike)

- **WHEN** a K8s `node` (or controller) container is collapsed and every pod beneath it is aggregated away
- **THEN** `pod` leaves the Node Kinds legend and `node` (or the corresponding controller kind) enters through its glyph; an expanded container does not appear in Node Kinds at all (only in its swatch section)

#### Scenario: Collapsing the virtual network compound makes Node Kinds show network in place of switch

- **WHEN** the virtual `network` compound wrapping the switch fabric (see `switch-tier-layout`) is collapsed
- **THEN** the `switch` beneath it leaves the Node Kinds legend, being hidden by a collapsed ancestor, and the collapsed `network` enters through its wifi glyph (the NETWORKING category changes from `switch` to `network`, with the label `physical network`); expanding restores `switch`

### Requirement: Show / hide toggle on every node kind row of the Legend

The Graph view SHALL provide a **show / hide toggle button** (`eye` / `eye-slash`) on **every row** (icon + name) of the Node Kinds legend, toggling the visibility of that kind's nodes on the canvas. That toggle MUST write to the Graph view's `visibleKinds` view state — the legend toggle button is that state's only user interface, and the canvas visibility and the legend row's state MUST reflect it in sync. When a kind is hidden, **any edge with that kind as an endpoint** MUST hide along with it (the existing visibility endpoint rule); a **container** that thereby has no visible child and no visible edge MUST be hidden by the orphan cascade, but a **leaf node** that thereby loses all visible edges **MUST stay visible** (it has an incident edge in the baseline graph).

**The legend list.** The legend's kind list MUST be the **union** of "the kinds actually drawn as a glyph" (the existing collapse-aware derivation) and "the kinds present in the current (mode-transformed) elements but filtered out by `visibleKinds`" — a hidden kind MUST keep its legend row (faded styling, `eye-slash`), otherwise it could not be restored from the legend. Toggle buttons MUST render only on **filterable known kinds**: the `network` virtual wrapper (never filtered by kind) and unknown kinds (visible by default) MUST NOT carry a toggle button.

**Interaction with the existing toggles:**

- **The Collapse toggles** (collapse-all for clusters / nodes-or-controllers, and single-container collapse): the collapse state (`collapsedIds`) and visibility (`visibleKinds`) are two independent layers — hiding a kind MUST NOT change any container's collapse state, and showing it again MUST restore the collapse state as it was.
- **Collapse's interchange semantics are unchanged**: a collapsed container is represented in the legend by its container kind's row (collapsing `netapp-node` gives a `netapp-node` row, not a `netapp-aggr` row), and the toggle button toggles that row's kind; hiding a container kind MUST make its descendants invisible at the same time (effective visibility = itself AND all ancestors).
- **The pod-parent mode toggle**: `visibleKinds` is a global set across modes, acting on the mode-transformed elements; a mode switch MUST NOT clear the hide settings — a setting with no corresponding node in the other mode has no visual effect but is preserved, taking effect again on switching back.

Writing back to `visibleKinds` MUST preserve the canonical kind order (rebuilding the array in the fixed order of the full kind universe) — a round of hiding / restoring must not reorder that set (making the state deterministic and comparable).

When every toggleable kind is hidden, the canvas MUST show the existing `All node types filtered` empty state, and the legend MUST still list every (hidden) kind so it can be restored. **Edge-type filtering by itself MUST NOT empty the canvas** — a leaf with an incident edge in the baseline graph does not disappear because edges are filtered, so after hiding every edge type those nodes are still there, only without connections (an isolated node with no edge in the baseline was hidden from the start). When the visible node set is genuinely empty but some toggleable kind is still shown (for example filtering and ingress hiding acting together), it MUST NOT be blamed on node kinds — show the generic `All elements filtered out` instead.

#### Scenario: The toggle hides a kind and its related edges

- **WHEN** the graph has `service` nodes and `service-selects-pod` edges, and the user clicks the toggle button on the legend's `service` row
- **THEN** every `service` node and every edge with a `service` node as an endpoint (`pod-calls-service` / `service-selects-pod`) is hidden from the canvas
- **AND** the `service` row stays in the legend (faded, `eye-slash`), and one more click restores the nodes and edges

#### Scenario: The legend toggle button stays in sync with the visibleKinds state

- **WHEN** the user clicks the toggle button on the legend's `pvc` row to hide `pvc`
- **THEN** the `visibleKinds` view state no longer contains `pvc`, the canvas hides the pvc nodes, and that row shows the hidden state; the reverse operation puts `pvc` back into `visibleKinds`, and the canvas and that row restore in sync

#### Scenario: Hiding does not clear the collapse state

- **WHEN** a K8s `node` container is collapsed and the user hides then shows the `node` kind again
- **THEN** that node container reappears and **stays collapsed** (the toggle action did not clear its collapse state)

#### Scenario: Hiding pod in controller mode triggers the orphan cascade

- **WHEN** in controller mode the user hides the `pod` kind, and some controller frame has no incident drawn edge of its own (its pods nest inside it, and `pod-to-node` runs from pod to K8s node rather than through the controller), so all of its child pods hide
- **THEN** that controller frame is hidden by the orphan cascade too, having no visible child and no visible edge

#### Scenario: A mode switch preserves the hide settings

- **WHEN** `deployment` is hidden in controller mode and the user switches to node mode and back to controller mode
- **THEN** that setting has no visual effect while in node mode (the graph has no controller node), and `deployment` is still hidden on returning to controller mode

#### Scenario: An unfilterable row has no toggle button

- **WHEN** the legend lists `network` (the virtual fabric wrapper) or an unknown kind (newly added by the backend, not in the known kind set)
- **THEN** that row shows its glyph and name as usual, but renders no show / hide toggle button

#### Scenario: Hiding everything shows the empty state and can be restored

- **WHEN** the user toggles every kind the legend lists to hidden
- **THEN** the canvas shows the `All node types filtered` empty state, the legend still lists every kind (faded, `eye-slash`), and clicking any row restores that kind

#### Scenario: Hiding every edge type does not empty the canvas

- **WHEN** every kind is shown, but the user has hidden every edge type through the legend's `Edge Types` toggles
- **THEN** the canvas MUST NOT show any empty state — the nodes with an incident edge in the baseline graph (and their containers) stay visible, and only all the connections disappear

#### Scenario: An empty visible set with not all kinds hidden is not blamed on node kinds

- **WHEN** some toggleable kind is still shown, but filtering and ingress hiding acting together leave the visible node set empty
- **THEN** the canvas shows `All elements filtered out` (rather than `All node types filtered`), and the legend's kind rows stay in the shown state (the `Hide` affordance)

#### Scenario: A round of hiding / restoring does not reorder visibleKinds

- **WHEN** the user hides then restores the same kind
- **THEN** the written-back `visibleKinds` is element-by-element equal to the original array (canonical order, not appended at the end)

### Requirement: Decorative compound groups use per-kind fixed colors and kind-prefixed labels

The accent colors of the decorative `cluster` / `namespace` / `application` groups (`clusterColor` / `namespaceColor` / `applicationColor`) MUST be **one fixed color per group kind** — every group node of the same kind shares one color regardless of name, rather than hashing the name into a per-instance color. The three kinds' colors MUST differ from one another, and MUST have sufficient contrast with the existing edge color table (`EDGE_STYLE_BY_TYPE`) and the status colors (normal green, warning yellow, critical red), so an edge line stays clearly legible while crossing any compound backplate.

The **canvas label** of the decorative `cluster` / `namespace` / `application` groups MUST be prefixed with **the capitalized kind word plus `: `** (a colon plus one space), in the form `${PREFIX}: ${name}` — a `cluster` group named `prod` has the canvas label `Cluster: prod`, a `namespace` named `checkout` has `Namespace: checkout`, and an `application` named `mongo` has `Release Unit: mongo`. **The display prefix for the `application` group is "Release Unit"** — display text only; the internal `type` / `kind` strings, the `isApplication` flag, `applicationColor` and the CSS selectors (`node[?isApplication]`) all stay `application`.

This prefix MUST be implemented as a **render-only function `label` mapper in the stylesheet** (selectors `node[?isCluster]` / `node[?isStorageCluster]` / `node[?isNamespace]` / `node[?isApplication]`), and **MUST NOT** be written into `data.label` by the normalization layer — `data.label` MUST stay the bare upstream name (consistent with `data.cluster` / `data.namespace` / `data.application`). That way the name title of the hover / pinned tooltip, and any path using `data.label` as identity or display name, gets the bare name, and the prefix appears **only** in canvas compound naming. This requirement applies only to the decorative compound groups (`cluster` / `storage-cluster` / `namespace` / `application`), and does not affect the label format of any leaf node (pod / service / pvc / node / netapp-aggr) or of the `controller` / `netapp-node` compounds. The whole canvas label (prefix + name) keeps the existing `font-weight: 600` — a single cytoscape label does not support mixed font weights within one node, so the prefix and the name share one weight.

#### Scenario: Several cluster groups of the same kind share one color

- **WHEN** the graph has two or more `cluster` group nodes with different names
- **THEN** every `cluster` group node's `data.clusterColor` is the same fixed value, unaffected by the differing names

#### Scenario: The three kinds' fixed colors differ from one another and contrast with the edge colors

- **WHEN** the Graph view renders `cluster` / `namespace` / `application` groups
- **THEN** their three fixed colors differ from one another, and none is exactly equal to any edge color in `EDGE_STYLE_BY_TYPE` or any status color (green `#73BF69` / yellow `#F2CC0C` / red `#E02F44`)

#### Scenario: A decorative group's canvas label carries the kind prefix while data.label stays the bare name

- **WHEN** a `cluster` group named `prod`, a `namespace` group named `checkout` and an `application` group named `mongo` are normalized and rendered
- **THEN** their `data.label` values are `prod`, `checkout`, `mongo` respectively (the bare names)
- **AND** the labels the stylesheet renders on the canvas are `Cluster: prod`, `Namespace: checkout`, `Release Unit: mongo` respectively

#### Scenario: Non-decorative node labels are unaffected

- **WHEN** a `pod` / `service` / `pvc` / `node` / `netapp-aggr` leaf node or a `controller` / `netapp-node` compound node is normalized
- **THEN** its `data.label` stays the original name, with no kind prefix applied

### Requirement: physical-network and k8s node compound header label alignment

The header labels of the physical-network fabric box (`kind: network`, the compound wrapping the switches) and the k8s `node` **compound** box (the one wrapping pods in node-layout mode, that is, a `:parent`) MUST align with the three decorative group headers in **capitalization and font size**: the physical-network name is title-cased (`physical network` → `Physical Network`), the k8s node takes a `Node: ` prefix (`worker-0` → `Node: worker-0`), and the font sizes are raised respectively (network 17, node 18) to match the group headers.

This alignment for a k8s node MUST apply **only when that node is a compound**: the selectors are `node[kind='node']:parent` (wrapping pods under node-layout) plus `node[kind='node'].cy-expand-collapse-collapsed-node` (once collapsed the children are removed and `:parent` is lost, so a class keeps the header stable). **Under controller-layout a k8s node is a leaf node** (pods hang under the controller, not under the node), matches neither selector, and MUST fall back to the base `node` ordinary title (bare `data.label`, base font size, label at the bottom). A leaf node is never a compound and so never carries the collapsed class, and the sibling selector does not leak onto leaf nodes.

This alignment MUST be implemented as a **render-only function `label` mapper in the stylesheet**, and **MUST NOT** rewrite `data.label` — because a k8s `node`'s `data.label` is its identity value: the `name=` parameter of the `/dashboard` query and the detail panel title (see `node-detail`) both read it directly, and baking the prefix into `data.label` would send the wrong `name=Node: worker-0` and duplicate the title against the kind badge. The decorative groups' kind prefix is likewise render-only (see "Decorative compound groups use per-kind fixed colors and kind-prefixed labels"), and all three share one contract: the prefix serves canvas compound naming only. Switch leaf nodes are out of scope here.

#### Scenario: The physical-network fabric box header is title-cased with a raised font size

- **WHEN** the Graph view renders the `kind: network` physical-network fabric box (`data.label` is `physical network`)
- **THEN** its on-canvas label renders as `Physical Network` (title-cased word by word), `font-size` 17, `font-weight` 600
- **AND** its `data.label` stays `physical network` unchanged

#### Scenario: The compound k8s node box header takes the `Node: ` prefix with a raised font size, identity unchanged

- **WHEN** the Graph view renders a compound k8s node wrapping pods in node-layout (`kind: node`, `:parent`, `data.label` is `worker-0`)
- **THEN** its on-canvas label renders as `Node: worker-0`, `font-size` 18, `font-weight` 600
- **AND** its `data.label` stays `worker-0`, so the `name=` parameter of the `/dashboard` query and the detail panel title are both `worker-0` (without the prefix)
- **AND** once that compound is collapsed (`.cy-expand-collapse-collapsed-node`) it still keeps the `Node: worker-0` aligned header

#### Scenario: A leaf k8s node falls back to the ordinary title

- **WHEN** the Graph view renders a leaf k8s node in controller-layout (`kind: node`, not `:parent`, `data.label` is `worker-9`)
- **THEN** its label falls back to the base `node` ordinary title: bare `worker-9`, base font size (11), label at the bottom, with no `Node: ` prefix and no size raise

### Requirement: Meta-edges after a compound collapse are drawn as straight lines

When cytoscape expand-collapse collapses a compound parent, the edges crossing the boundary are re-pointed at the collapsed container and given the `cy-expand-collapse-meta-edge` class. The stylesheet MUST use `curve-style: 'straight'` (a straight line) for `edge.cy-expand-collapse-meta-edge`, and keep the existing widening cue (`width: 2.5`). A meta-edge MUST NOT force an override of `line-color` / arrow color — the color and line style still cascade from the base `edge` rule (per the original `data.edgeType`). This rule affects only the meta-edges synthesized on collapse; ordinary edge routing (fabric `taxi`, `bezier` for the rest) is unchanged.

#### Scenario: A meta-edge after collapse is straight and widened

- **WHEN** a compound parent is collapsed and at least one boundary-crossing edge is re-pointed by expand-collapse as a `cy-expand-collapse-meta-edge`
- **THEN** that meta-edge's `curve-style` is `straight` and its `width` is `2.5`
- **AND** its `line-color` / arrow color still cascades from the base `edge` rule per the original `edgeType` (the meta-edge rule itself pins no color)

#### Scenario: Non-meta edge routing is unaffected

- **WHEN** the graph contains both uncollapsed ordinary edges (including fabric `taxi` and non-fabric `bezier`) and meta-edges produced by collapse
- **THEN** the ordinary edges keep their existing routing; the `taxi` / `bezier` selector behavior is unchanged

### Requirement: The hover tooltip shows an edge's RED and storage I/O metrics

When the user hovers an edge **carrying `data.metrics`**, the hover tooltip MUST append, **after** the existing `edgeType` row and **before** the `labels` divider, the promoted attr rows of that edge's family in order (the row keys being fixed English UI strings). `metrics` is the union of two mutually exclusive families (see `graph-data-source`), and the tooltip MUST discriminate with **`'rate' in metrics`** and render only that family's rows — it **MUST NOT** assume `rate` exists on an arbitrary `metrics` object.

**The RED family** (trace-derived call edges), at most three rows:

| row key         | source field          | display format                                                          |
| --------------- | --------------------- | ----------------------------------------------------------------------- |
| `rate`          | `metrics.rate`        | `<value> req/s`                                                         |
| `errorRate`     | `metrics.errorRate`   | `<value×100>%`                                                          |
| `duration(p90)` | `metrics.p90ServerMs` | `<value> ms` (below `1000`); at `>= 1000` converted to `<value/1000> s` |

**The I/O family** (only `pvc-to-netapp-aggr` edges), at most eight rows, in a fixed order — the six **measured** rows first, the two **declared ceiling** rows after:

| row key            | source field               | display format                                                           |
| ------------------ | -------------------------- | ------------------------------------------------------------------------ |
| `read`             | `metrics.readOps`          | `<value> ops/s`                                                          |
| `write`            | `metrics.writeOps`         | `<value> ops/s`                                                          |
| `read latency`     | `metrics.readLatencyUs`    | `<value> µs` (below `1000`); at `>= 1000` converted to `<value/1000> ms` |
| `write latency`    | `metrics.writeLatencyUs`   | same as above                                                            |
| `read throughput`  | `metrics.readBytesPerSec`  | `<decimal byte unit>/s` (for example `5.24 MB/s`)                        |
| `write throughput` | `metrics.writeBytesPerSec` | same as above                                                            |
| `max iops`         | `metrics.maxIops`          | `<value> ops/s`                                                          |
| `max throughput`   | `metrics.maxBytesPerSec`   | `<decimal byte unit>/s` (for example `250 MB/s`)                         |

The two ceiling rows sit **after** the measured rows, because they are the **configured values** of the volume's QoS policy group rather than observations: the reader's first question is what the volume is doing now, not what it is allowed to do. Every ceiling row MUST use **exactly the same** formatter as its corresponding measured row (`max iops` takes the ops ladder, `max throughput` the decimal byte ladder), so `read throughput: 5.24 MB/s` and `max throughput: 250 MB/s` compare at a glance — which is precisely why the backend converts `max_bytes_per_sec` to bytes per second.

Numeric formatting rules:

- `rate` / `errorRate` / `duration(p90)` / `read` / `write` / `read latency` / `write latency` / `max iops` share one set of pure functions: a value MUST be rendered to no more than **3 significant digits** with trailing zeros stripped (`5` rather than `5.00`; `3.2` rather than `3.20`).
- **`read throughput` / `write throughput` / `max throughput` are the exception** (the three bytes-per-second rows): their values are bytes/s, and a bare 3-significant-digit rendering degrades to an unreadable exponent at the real magnitudes, so they MUST use **the decimal byte unit ladder already adopted by the node `usage` row** (`B` / `KB` / `MB` / `GB` / `TB` …) plus a `/s` suffix. Sharing one ladder lets a `700 GB` aggregate and a `5.24 MB/s` edge read on the same scale.
- **A non-zero value MUST NOT be formatted as `0`**: rounding may lose digits but MUST NOT lose magnitude. A very small value (such as `3.86e-7` req/s, a ratio of `6.7e-8`, or `12 B/s`) MUST keep its magnitude.
- `errorRate` is a ratio in `[0,1]`, and MUST be multiplied by 100 with a `%` suffix before display; `0` MUST render as `0%` (meaning "measured, no failures").

The failure emphasis rule: when `errorRate` is **measured and non-zero** (`errorRate !== 0`), that row's **value** MUST render in the app theme's error color, with the key kept in the secondary color, so the row does not break the list's rhythm. The decision MUST be based on **the numeric value itself** rather than the formatted string — `6.7e-8` renders as `0.0000067%` and is still a real failure ratio. `errorRate: 0` MUST stay neutral, and when `errorRate` is missing that row MUST NOT render (and so carries no color either). All other rows (RED's `rate` / `duration(p90)` and **all** of the I/O rows, including the two ceilings) MUST NOT be colored — I/O measurements have no notion of "failure", and high throughput or high latency MUST NOT be colored as an error. Approaching or exceeding a declared ceiling MUST NOT trigger coloring or a warning either: a ceiling is configuration, not a threshold, and QoS throttling is normal operation, not a fault.

Omission rules:

- When an edge has **no** `data.metrics`, the tooltip MUST be exactly as it is today — no metrics rows, no heading, no `N/A`-style placeholder.
- When any optional field within a family is missing, its row MUST NOT render (**and especially MUST NOT show `0`**: missing means "could not be measured", a different state from measuring zero). This rule applies to RED's `errorRate` / `p90ServerMs` and to all eight I/O fields. For the two ceiling fields the distinction has the same form but reads differently: missing means the volume declares no ceiling at all, and MUST NOT be presented as `0` or an unlimited sentinel.
- Metrics values MUST NOT appear in the `labels` block — they come from `data.metrics`, not from the backend's labels map.

Both families affect only the **edge** tooltip in floating hover mode. Pinned mode applies only to a selected **node** and is therefore unaffected by this requirement; and an edge's color, width, line style and label on the canvas MUST NOT change because of either family's metrics.

#### Scenario: Hovering an edge with complete RED shows three rows

- **WHEN** the user hovers an edge with `edgeType: 'pod-calls-service'` and `data.metrics = { rate: 5, errorRate: 0.2, p90ServerMs: 45 }`
- **THEN** the tooltip shows, in order, `edgeType: pod-calls-service`, `rate: 5 req/s`, `errorRate: 20%`, `duration(p90): 45 ms`
- **AND** the three RED rows sit after `edgeType` and before the `labels` divider

#### Scenario: An edge with no metrics is unchanged

- **WHEN** the user hovers a `pod-mounts-pvc` edge (with no `data.metrics`)
- **THEN** the tooltip shows only the `source → target` title, the `edgeType` row and the existing labels — no metrics row of either family, and no placeholder

#### Scenario: An omitted errorRate does not render as 0%

- **WHEN** the user hovers an edge with `data.metrics = { rate: 3 }` (neither `errorRate` nor `p90ServerMs` present)
- **THEN** the tooltip appends only the `rate: 3 req/s` row; no `errorRate` or `duration(p90)` row may appear

#### Scenario: A measured zero failure rate shows 0%

- **WHEN** the user hovers an edge with `data.metrics = { rate: 1, errorRate: 0 }`
- **THEN** the tooltip shows `errorRate: 0%` (clearly distinct from the previous scenario's "no row")
- **AND** that value renders in the neutral text color, never in the error color

#### Scenario: A non-zero failure rate is marked in the error color

- **WHEN** the user hovers an edge with `data.metrics = { rate: 5, errorRate: 0.2 }`
- **THEN** the **value** of the `errorRate` row renders in the app theme's error color, with its key kept in the existing secondary color
- **AND** the `rate` and `duration(p90)` rows in the same tooltip MUST NOT be colored

#### Scenario: A very small value is not formatted as 0

- **WHEN** the user hovers an edge with `data.metrics = { rate: 3.86e-7, errorRate: 6.7e-8 }`
- **THEN** the `rate` row shows `3.86e-7 req/s` (exponent form) and the `errorRate` row shows `0.0000067%` (full decimal)
- **AND** neither may render as `0 req/s` / `0%`
- **AND** that `errorRate` still renders in the error color (the coloring is decided by the numeric `6.7e-8 !== 0`, not by the formatted string)

#### Scenario: A long duration renders in seconds

- **WHEN** the user hovers an edge with `data.metrics.p90ServerMs = 2500`
- **THEN** the `duration(p90)` row shows `2.5 s` (rather than `2500 ms`)

#### Scenario: Metrics do not change the canvas visuals

- **WHEN** the graph contains both edges with metrics (RED or I/O) and edges without
- **THEN** the line color, width, line style, arrowhead and canvas label of both are decided entirely by the existing edge-type / ingressPath / relation rules, independently of `metrics`

#### Scenario: A storage edge shows all eight I/O rows

- **WHEN** the user hovers an edge with `edgeType: 'pvc-to-netapp-aggr'` and `data.metrics = { readOps: 150, writeOps: 40, readLatencyUs: 830, writeLatencyUs: 1200, readBytesPerSec: 5242880, writeBytesPerSec: 1048576, maxIops: 5000, maxBytesPerSec: 262144000 }` (no `rate`)
- **THEN** the tooltip shows, in order, `read: 150 ops/s`, `write: 40 ops/s`, `read latency: 830 µs`, `write latency: 1.2 ms`, `read throughput: 5.24 MB/s`, `write throughput: 1.05 MB/s`, `max iops: 5000 ops/s`, `max throughput: 262 MB/s`, and no `rate` / `errorRate` / `duration(p90)` row

#### Scenario: A missing I/O field renders no row

- **WHEN** a storage edge's `data.metrics` holds only `{ readOps: 150, readBytesPerSec: 5242880 }`
- **THEN** the tooltip shows only the `read` and `read throughput` rows; `write` / `read latency` / `write latency` / `write throughput` / `max iops` / `max throughput` all do not render (no `0`, no placeholder)

#### Scenario: A volume with measurements but no declared ceiling

- **WHEN** a storage edge carries the six measured fields but no `maxIops` and `maxBytesPerSec`
- **THEN** the tooltip shows the six measured rows and **no** ceiling row — a missing value never renders as `0`, `unlimited` or a `max …: —` placeholder

#### Scenario: A ceiling row shares its measured row's formatter

- **WHEN** a storage edge carries `readBytesPerSec: 5242880` and `maxBytesPerSec: 262144000`
- **THEN** the two rows render as `5.24 MB/s` and `262 MB/s` — both taking the decimal byte ladder, so the reader can compare without converting units in their head

#### Scenario: Throughput takes the byte unit ladder rather than bare 3 significant digits

- **WHEN** a storage edge's `readBytesPerSec` is `5242880` and `writeBytesPerSec` is `12`
- **THEN** the two rows render as `5.24 MB/s` and `12 B/s` respectively — the same decimal unit ladder as the node `usage` row; they MUST NOT render as `5.24e6 B/s`, and a small value MUST NOT be rounded to `0`

#### Scenario: No I/O row takes the failure color

- **WHEN** a storage edge carries all eight I/O fields and its measured throughput is above the declared ceiling
- **THEN** the values of all eight rows render in the neutral color — the error color is reserved for a measured, non-zero `errorRate`, and exceeding a ceiling is never colored as a fault

### Requirement: Node usage visuals (data-driven on usage, independent of kind)

The system SHALL draw usage visuals on the canvas for **any node carrying `data.usageRatio`**, so an operator can see storage approaching its capacity ceiling at a glance without opening a tooltip. In practice that set is `pvc` (kubelet volume stats) and `netapp-aggr` (Harvest aggregate space), but the rule MUST be triggered **solely by the presence of `usageRatio`**, and **MUST NOT** hardcode any kind list — so it applies automatically when the backend adds `usage` for other kinds in the future, with no stylesheet change.

`usageRatio` is flattened by the normalization layer into a top-level numeric field of the node's `data` (see `graph-data-source`), because a cytoscape selector can neither read nested `data` nor perform division inside a selector.

Visual encoding rules:

- usage MUST be drawn **inside the cylinder outline of the kind SVG** (bottom-up, with a height proportional to `usageRatio`), and **MUST NOT** fill the 40px node box with cytoscape's `background-fill` — a box fill overflows the cylinder outline and, at high utilization, covers `netapp-aggr`'s internal tier lines.
- The liquid color MUST take `STATUS_COLOR` per three thresholds, and MUST be drawn at **fill-opacity 0.4** (drawn before the line art, which stays opaque, keeping the aggregate's tier lines readable):
  - `usageRatio < 0.8` → `STATUS_COLOR.normal` (`#73BF69`)
  - `usageRatio >= 0.8` → `STATUS_COLOR.warning` (`#F2CC0C`)
  - `usageRatio >= 0.9` → `STATUS_COLOR.critical` (`#E02F44`)
- The node's kind icon MUST keep its original size (`NODE_SIZE` / `background-fit: contain`), and the label MUST stay `data(label)` rather than being rewritten as a percentage.
- A node with no `usageRatio` (every non-storage node, and any storage node whose `usage` is incomplete) MUST keep its existing background and unfilled icon, with no liquid applied — **missing data MUST NOT render as 0%**.
- The k8s `status` outline rule MUST be unaffected: the liquid occupies the interior color channel and status the outline, and the two can appear together on one node.

This visual is **presentation only**: it MUST NOT affect selection, filtering, layout or tooltip content, and MUST NOT write back any `data` field. The textual `usage` row in the tooltip (see "Hover tooltip showing element metadata") and this visual are two presentations of the same data and MUST coexist.

#### Scenario: A node carrying usageRatio renders cylinder liquid

- **WHEN** a `netapp-aggr` node carries `usageRatio: 0.7` and a `pvc` node carries `usageRatio: 0.5`
- **THEN** both have bottom-up cylinder liquid inside their kind SVG, at roughly 70% and 50% of the cylinder height respectively; the node box itself MUST NOT apply `background-fill: linear-gradient`; and both are triggered by **the same** `usageRatio` rule, not by per-kind triggers

#### Scenario: A node with no usageRatio has no liquid

- **WHEN** a `pvc` node has no `usage` (or its `usage` holds only `capacityBytes`, so the normalization layer wrote no `usageRatio`)
- **THEN** that node keeps its existing background and unfilled icon, MUST NOT render any liquid, and MUST NOT be rendered as 0% full

#### Scenario: The usage liquid applies STATUS_COLOR per the 80/90 thresholds

- **WHEN** three nodes have `usageRatio` of `0.7`, `0.8` and `0.9` respectively
- **THEN** their liquid colors are `STATUS_COLOR.normal` / `warning` / `critical` respectively (`#73BF69` / `#F2CC0C` / `#E02F44`), all at fill-opacity 0.4; `0.79` MUST still be green

#### Scenario: The usage liquid does not obscure the kind line art or the status outline

- **WHEN** rendering a `netapp-aggr` carrying `usageRatio: 0.7` (with two internal tier lines) and a `status`
- **THEN** its cylinder outline and internal tier lines stay visible (the liquid sits below the line art and is semi-transparent), the icon size is unchanged, and its status outline color still follows the existing rules (the liquid affects only the SVG interior, never the outline)

#### Scenario: The usage visual does not affect interaction or layout

- **WHEN** the user selects, filters or switches the pod-parent mode on a node carrying `usageRatio`
- **THEN** the behavior is exactly the same as for a node of the same kind without that field (the fill is presentation only, and does not participate in the visibility decision, layout or selection resolution)

### Requirement: Promoted attribute rows for `role` / `ready` / `volumename` / `svm`

The node attribute construction logic — the single source feeding both the floating hover tooltip and the pinned selection card — SHALL additionally produce the following rows, each produced only when the source value is a non-empty string, and never appearing as an empty row or a placeholder row:

| Row key      | Source                   | Emitted on                                             |
| ------------ | ------------------------ | ------------------------------------------------------ |
| `role`       | `data.labels.role`       | Any node carrying that label, with no kind restriction |
| `ready`      | `data.readyStatus`       | A K8s node for which the backend provides that field   |
| `volumename` | `data.labels.volumename` | A claim carrying that label                            |
| `svm`        | `data.labels.svm`        | A claim carrying that label                            |

The row order SHALL be: `kind`, `role`, `namespace`, `application`, `ipAddress`, `storageclass`, `volumename`, `svm`, `health`, `ready`, `usage`. `role` sits directly below `kind`, because it qualifies **what that node is**; the two storage label rows sit alongside `storageclass` and `usage`, because they are read together.

`role` SHALL be promoted for **any** value, not only the ingress pair. It is essential for the two ingress shapes — both are ordinary `type="service"` nodes, this label is the only information distinguishing them, and the two behave differently under the ingress toggle — but an unrecognizable role must stay readable too, rather than being filtered out.

`volumename` and `svm` are the keys the NetApp join depends on: `volumename` is the value the Harvest relabel rule uses to match a FlexVol, and `svm` scopes the QoS read. When a claim cannot reach an aggregate, they are the first things an operator checks, so they belong beside the storage rows rather than buried in the raw label list. A claim carrying `volumename` but **no** `svm` is itself the signal that "no Harvest label series matched it"; a missing row MUST NOT be filled in.

Every label key promoted to a row SHALL be suppressed from the raw label list below the tooltip's divider, driven by a **single** promoted-key list **shared** by promotion and suppression — so adding a promotion leaves no duplicate row.

#### Scenario: The two ingress shapes are distinguishable at a glance

- **WHEN** the user hovers a `service` node carrying `labels.role = "ingress-lb"`
- **THEN** the tooltip shows a `role: ingress-lb` row directly below `kind`, and no duplicate `role` row appears below the labels divider

#### Scenario: A K8s node's Ready condition shows, and does not show when missing

- **WHEN** the user hovers a K8s node carrying `readyStatus: "NotReady"`
- **THEN** the tooltip shows `ready: NotReady`
- **AND** hovering a K8s node with no `readyStatus` shows no `ready` row — not `ready: Unknown`, and not an empty row

#### Scenario: A claim resolved to a PV but not joined to an aggregate

- **WHEN** the user hovers a `pvc` carrying `labels.volumename` but no `labels.svm`
- **THEN** the tooltip shows the `volumename` row and no `svm` row

### Requirement: Node identity encoded by icon

The system SHALL carry node identity (`kind`) with a per-kind **icon**, replacing the earlier per-kind shape encoding. All leaf nodes MUST render in a uniform `round-rectangle` container, with the kind distinguished by the node's `background-image` (its icon). `ICON_SVG_BY_KIND` MUST be the single source of the kind → icon mapping, shared by the stylesheet and the legend (taking over the identity role the earlier shape table carried). The `NodeKind` enumeration MUST be `pod` / `node` / `pvc` / `service` / `external`, plus the workload kinds `deployment` / `statefulset` / `daemonset` / `job` / `cronjob`, the physical-network kind `switch` (backend v0.0.18), **the physical-storage kinds `netapp-aggr` (an ONTAP aggregate, a leaf node) and `netapp-node` (an ONTAP controller, a **genuine** compound container — see the compound icon requirement below)**, and the virtual **container** kind `network` wrapping the switch fabric (the `network > switch` group; its wifi glyph is drawn only when collapsed, and like other containers it has no icon when expanded; when collapsed it replaces `switch` in the Node Kinds legend with the label `physical network` — see "Legend" and `switch-tier-layout`). `storageclass` MUST NOT exist (the backend removed it from the contract; the physical storage chain replaces it). `others` MUST NOT exist (the backend removed it from the contract; `external` absorbed that fallback). A ReplicaSet is **not** a `NodeKind` — the backend collapses `Deployment → ReplicaSet → Pod` and attributes pods directly to their top-level controller, so a ReplicaSet never appears in the graph and needs no icon.

`netapp-aggr` and `netapp-node` MUST each have their own icon, and the two MUST be visually distinguishable (the aggregate taking storage-pool vocabulary, the controller taking chassis / controller vocabulary), so the two tiers sharing the `Storage` category are not confused in the legend or on the canvas.

#### Scenario: A known kind maps to the correct icon

- **WHEN** a node's data carries `kind: 'deployment'` (or any other defined kind)
- **THEN** that node renders in the uniform `round-rectangle` container, its centered `background-image` is the icon from `ICON_SVG_BY_KIND['deployment']`, and the mapping is consistent with the icon lookup table

#### Scenario: Leaf node shape no longer encodes kind

- **WHEN** two leaf nodes of different kinds (for example a `pod` and a `service`) render together
- **THEN** both containers are `round-rectangle` (shape no longer distinguishes kind), and only the icon distinguishes identity

#### Scenario: The two NetApp kinds have distinguishable icons

- **WHEN** `kind: 'netapp-aggr'` and `kind: 'netapp-node'` nodes render together in a single graph
- **THEN** `ICON_SVG_BY_KIND` provides a different icon for each, and `storageclass` is no longer a key of `ICON_SVG_BY_KIND`

### Requirement: Icons colored monochrome with the app theme

The system SHALL provide a pure icon coloring function that replaces the line-art SVG's `currentColor` sentinel with the theme color `hex` passed in, then encodes it with `encodeURIComponent` into a `data:image/svg+xml,...` string (**not base64** — the cytoscape style documentation states explicitly to use encodeURIComponent for an SVG data-URI and not base64). Every icon SVG MUST carry an XML header (`<?xml version="1.0" encoding="UTF-8"?>`) and explicit `width` / `height`; without the XML header cytoscape rasterizes it blank on the canvas (while the same URI works as an `<img>`, so the legend shows and the canvas is blank). The coloring MUST be concentrated in a pure stylesheet factory taking the app theme as input: a `function(ele)` mapper looks up `ICON_SVG_BY_KIND` by `ele.data('kind')` and produces a `background-image` data-URI in the theme color; `background-fit` MUST be `contain` and `background-clip` `none`, and the icon's width and height MUST be inset (about 60%) so the container border / status color stays visible. The produced data-URI MUST be memoized keyed by `(kind, hex)` (avoiding per-node unique URIs that would break cytoscape's image cache). The normalization layer MUST NOT be involved with icons or the theme (staying purely anti-corruption).

#### Scenario: Icons are recolored on a theme switch without rebuilding the instance

- **WHEN** the user switches dark ↔ light theme in the app-shell
- **THEN** the stylesheet factory recomputes each kind's icon data-URI in the new theme color and applies it to the existing instance; the instance reference is unchanged; the icon colors change with the theme

#### Scenario: The icon coloring function encodes correctly

- **WHEN** the icon coloring function is called with an SVG containing `currentColor` and some theme hex (such as `#c3cbd9`)
- **THEN** `currentColor` has been replaced by that hex in the returned string, every `#` is encoded as `%23`, and the string starts with `data:image/svg+xml,` (not `;base64,`)

#### Scenario: The same (kind, hex) returns a stable memoized result

- **WHEN** the same `(kind, hex)` obtains an icon data-URI through the stylesheet several times
- **THEN** the same string is returned (referentially stable), with no repeated encoding

### Requirement: A compound container's icon (none when expanded, centered when collapsed or a leaf)

When a `node` / `controller` / `netapp-node` node is an **expanded** compound parent (with visible children, matching `:parent`), the system MUST NOT render a resource icon (`node:parent` sets `background-image: 'none'`), and MUST show only the label and the container frame, so the icon is not tiled behind the children. The same node in the **collapsed** state (not `:parent`) shows its kind icon at the center, resolved by the base `node` selector from `data.kind`. Among these, `controller` is a compound group the backend emits directly under D6, but it still carries a genuine `kind` (derived by enrichment from the child pods' `owner.kind`), so its behavior is exactly the same as the controller the front end used to synthesize: **a Workloads glyph when collapsed, a frame when expanded.**

`netapp-node` belongs to the same class, a real node compound parent **named directly by the backend contract** (the storage chain `storage-cluster > netapp-node > netapp-aggr`): it carries a genuine `kind`, is selectable, has an icon, and frames its `netapp-aggr` children at the same time. It therefore MUST follow `node` / `controller`'s expand / collapse icon behavior exactly (a frame when expanded, its kind icon when collapsed). `netapp-aggr` is a leaf node beneath it and always draws its icon as a leaf node.

`storageclass` has been removed from `NodeKind`, and its expand / collapse and leaf glyph behavior disappeared with it; there is no corresponding rule any more.

Any decorative compound group **with no `kind`** MUST NOT render a resource icon in either state (expanded or collapsed). Besides the existing `cluster` container (`isCluster`), this covers the `namespace` (`isNamespace`), `application` (`isApplication`) and `storage-cluster` (`isStorageCluster`) groups the backend emits under D6: all of them are kind-less, accent-only group frames. The corresponding stylesheet selectors (`node[?isCluster]` / `node[?isNamespace]` / `node[?isApplication]` / `node[?isStorageCluster]`) MUST force `background-image: 'none'`, presenting only the label and the accent frame (for the folder glyph when collapsed see "A collapsed decorative group shows a folder icon"; it fills a gap outside `NodeKind` and is not a resource icon).

#### Scenario: An expanded container has no icon

- **WHEN** a `node` / `controller` / `netapp-node` container holds visible children (expanded, matching `:parent`)
- **THEN** that container's `background-image` is `none`, the center is left to the children, and only the label and the container frame show

#### Scenario: A collapsed node / controller shows a centered kind icon

- **WHEN** a `node`, `controller` or `netapp-node` container is collapsed (not `:parent`)
- **THEN** its center shows its `kind` icon — a collapsed K8s node shows the node icon, a collapsed controller shows its Workloads glyph, and a collapsed `netapp-node` shows its controller icon

#### Scenario: The storageclass leaf glyph no longer exists

- **WHEN** inspecting `ICON_SVG_BY_KIND` and the stylesheet's kind resolution
- **THEN** there is no `storageclass` kind (removed from the contract and the enumeration), and the old leaf glyph behavior this scenario originally described disappeared with it; the `netapp-aggr` leaf icon takes its place

#### Scenario: A kind-less decorative group has no resource icon

- **WHEN** rendering an `isCluster` / `isNamespace` / `isApplication` / `isStorageCluster` compound container, whether expanded or collapsed
- **THEN** that container carries no resource icon (`background-image: 'none'`, apart from the folder glyph when collapsed), serving only as a group frame in its accent color

### Requirement: An unknown kind takes the fallback icon and is visible by default

When a node's `data.kind` is not among the `ICON_SVG_BY_KIND` keys, the system MUST render it with a generic fallback icon, and that node MUST be visible by default (continuing the existing unknown-kind visibility philosophy), throwing no exception, so a resource type newly added upstream / by the backend does not silently disappear.

#### Scenario: An unknown kind shows the fallback icon

- **WHEN** upstream returns a node whose `data.kind` is not in `ICON_SVG_BY_KIND` (example: `ingress`)
- **THEN** that node renders with the uniform container plus the generic fallback icon, is visible by default, and the console reports no error

### Requirement: Icon coloring is a pure function and headlessly verifiable

The icon coloring function MUST be a pure function (the same input always giving the same output, with no side effects and no dependence on the DOM or a cytoscape instance), and the icon-carrying stylesheet factory MUST produce the stylesheet deterministically from `(theme, …)`. Verification of both MUST be headless, asserting nothing at the pixel level.

#### Scenario: The pure function and the stylesheet are deterministically verifiable

- **WHEN** the icon coloring function and the stylesheet factory are called with fixed inputs in a headless environment (with no browser canvas)
- **THEN** the icon coloring function gives the expected results for the `currentColor` replacement, the `#`→`%23` encoding, being non-base64, and `(kind, hex)` memoization stability; the stylesheet factory produces the same node styles for the same theme (including the icon-carrying `background-image`), comparable verbatim
