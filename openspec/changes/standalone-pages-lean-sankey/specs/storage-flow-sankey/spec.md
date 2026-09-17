## MODIFIED Requirements

### Requirement: Nodes are presented as box cards, with links entering and leaving through slots

Each Sankey node MUST be drawn as a rounded box card rather than a thin rectangle whose height is proportional to its weight. The card's content, top to bottom, is the same shape a network-trace card has:

- **Title row**: the node's `label`.
- **Divider**: between the title row and the body.
- **Subtitle row**: the node kind alone — `netapp-node` / `netapp-aggr` / `netapp-svm` followed by ` · <ontap_cluster>` when present, and any no-flow root followed by ` · no flow`.
- **Attribute lines**: one monospace line each, in this order and only when present — `ns/<namespace>` (a `pod`, a `pvc`, an `application`); `usage <used> / <capacity> (<pct>%)` (a `pvc` or a `netapp-aggr`, through the shared usage formatter, only when **both** `usedBytes` and `capacityBytes` of `usage` are present; if either is missing the line is omitted, and the app MUST NOT fill in `0`); `<n> pods` (an `application` or a `namespace`); and, on a `namespace` leaf, `total <inflow>` — that namespace's total inflow in the current mode. Nothing else is printed on a card: flow figures, status, health and perf are the tooltip's.

Links MUST enter and leave through **slots** on the card's edges: inbound edges attach to the left edge, outbound edges to the right edge; slots on the same side are ordered top to bottom by that link's weight, descending, and on equal weight by the opposite node's `label` lexicographically ascending (`localeCompare`). A slot's height is max(that link's ribbon thickness, a fixed minimum row height), with a fixed gap between slots; the card's height is the height needed by the title, the subtitle and its attribute lines (one line step per attribute line, as the trace's hop header) plus max(total height of the left slot stack, total height of the right slot stack, minimum body height), with each side's slot stack vertically centred within the card body below the attribute lines. Because slots have a minimum row height and ribbon thickness does not, the total heights of a node's left and right stacks **need not** be equal — conservation is about ribbon thickness, not slot-stack height.

Node kinds MUST be distinguished by a stroke vocabulary, and the distinction MUST NOT rely on hue alone: `netapp-node`, `netapp-aggr` and `netapp-svm` are not Kubernetes resources and use a **dashed** stroke; `pvc`, `pod`, `application` and `namespace` use a **solid** stroke. The `netapp-node` cards on the leftmost column are the flow's origin and carry only right-edge slots. The `namespace` cards on the rightmost column are the flow's terminus and MUST be presented as smaller **leaf cards** (title, kind, the `<n> pods` and `total` lines, with no right-edge slots). Under the `Node` layout a wrapper is a larger solid-stroked box in the pod column whose title row names the Kubernetes node and whose body holds the member pod cards; it carries no slots of its own. A `pod` card keeps its namespace colour stripe (see "Namespace grouping color bars").

A card whose node carries `data.status` MUST be bordered in that status's color, from the **same** palette the Graph view borders by, and with a thicker stroke than the neutral border so the distinction does not rest on hue alone. `status` MUST be passed through as the backend folded it (worst-wins over alert severity, NetApp `health` and Kubernetes readiness) — the app MUST NOT derive, adjust or re-fold it from `health`, `alerts` or `perf`. A node the backend sends no `status` for (an `netapp-svm`, for instance) MUST keep the neutral border: an absent verdict is not a healthy one, and painting it green would claim a judgement nobody made. The three status colors MUST be named in the scope bar's legend, otherwise a colored border is an unexplained decoration.

The `Node` layout's wrapper, which HIDES the Kubernetes node it stands for, MUST border by the **worst** status among that node's own status and the statuses of the pods it draws, exactly as a collapsed container does in the Graph view; when none of them carries a status, the wrapper MUST keep the neutral border rather than fall back to normal. The derived `application` and `namespace` cards MUST keep the **neutral** border regardless of their members' statuses: they are synthesised columns, nothing in the backend raises an alert, health or readiness on them, and a coloured border there would claim a judgement nobody made while duplicating the member pods' own borders one column away.

No text inside a box card MUST receive pointer events (`pointer-events: none`): text that takes events would cut off the hover highlight and tooltip of the ribbon beneath it.

The box card and the wrapper are the shared `SankeyCard` and `SankeyWrapperBox` primitives of `sankey-canvas`, and the slot-stack placement (`stackHeight`, `placeStack`, the row minimum, the gap, the card widths, header height and line step) comes from `sankey-canvas/geometry`; this view passes them its labels, subtitles, attribute lines, status, stroke style and slot positions and MUST NOT draw a card of its own. A storage card and a trace card handed the same title, subtitle and attribute lines render the same markup.

#### Scenario: The three rows of a pvc box card

- **WHEN** the user views `data-mongo-0` (namespace `prod`, whose `usage` is `usedBytes` `700` GB and `capacityBytes` `1` TB)
- **THEN** the card shows the title `data-mongo-0`, the subtitle `pvc`, and two attribute lines `ns/prod` and `usage 700 GB / 1 TB (70%)`; its inbound edges attach to the left edge and its outbound edges to the right edge, below the attribute lines

#### Scenario: A card missing usage does not fill in zero

- **WHEN** some `pvc` node has no `usage`, or has only `usedBytes` without `capacityBytes`
- **THEN** that card has no `usage` line and shows no `0`; its height is one line step shorter than a pvc card with usage and the same slots

#### Scenario: Slot ordering and minimum row height

- **WHEN** some `netapp-aggr` has three inbound edges with weights `5242880`, `0` and `1000`
- **THEN** the left-edge slots top to bottom are `5242880`, `1000`, `0`; although the ribbon thickness of the latter two is far below the minimum row height, their slots each still occupy the minimum row height, and the three ribbons do not overlap

#### Scenario: namespace is a leaf card

- **WHEN** the user views `prod` in Both mode
- **THEN** that node is presented as a leaf card (smaller size, solid stroke) with only left-edge slots and no right-edge slots, its subtitle is `namespace`, its attribute lines are `2 pods` and `total <inflow>`, and no ribbon leaves it

#### Scenario: netapp-node carries only right-edge slots

- **WHEN** the user views `ontap-prod-01`
- **THEN** that card has a dashed stroke, the subtitle `netapp-node · ontap-prod`, right-edge slots for its `node-aggr` links and no left-edge slots

#### Scenario: Status colors the border, and an unjudged node keeps the neutral one

- **WHEN** the fixture is drawn, in which `aggr1` carries `status: "warning"`, `ontap-prod-02` carries `status: "critical"` and `svm_shop` carries no `status`
- **THEN** the `aggr1` card's border is the warning color and `ontap-prod-02`'s the critical color, both from the same palette the Graph view uses; the `svm_shop` card's border is the neutral one and is none of the three status colors; and the scope bar's legend names `normal` / `warning` / `critical` beside a swatch of each

#### Scenario: A container borders by the worst status it hides

- **WHEN** the namespace `prod` holds pods `mongo-0` / `mongo-1` (`normal`) and `batch-pending` (`warning`), and under the `Node` layout the `worker-1` wrapper's own status is `warning` while every pod it draws is `normal`
- **THEN** the `prod` namespace card and every `application` card keep the neutral border, `batch-pending`'s own card is bordered warning, and the `worker-1` wrapper is bordered warning

#### Scenario: A wrapper holds its pod cards

- **WHEN** the layout is `Node` and the user views `worker-0`
- **THEN** a solid-stroked wrapper titled `worker-0` with the subtitle `node · 2 pods` encloses the `mongo-0` and `orphan-0` cards; the `svm_shop → data-mongo-0 → mongo-0` ribbon ends at the `mongo-0` card's left edge inside the wrapper, and the wrapper itself has no slots

#### Scenario: The shared card draws the same SVG

- **WHEN** a storage `pod` card and a trace `pod` card are rendered with the same title, the subtitle `pod` and the attribute line `ns/prod`
- **THEN** their static markup differs only in the storage card's namespace stripe

### Requirement: Links are gradient ribbons on a shared scale

The thickness of every link MUST come from **one and the same** scale: the scale is the maximum thickness divided by the maximum weight among all **drawn** links in the current mode, and a link's thickness is max(minimum thickness, weight × scale). In Both mode the read and write families MUST share this one scale — scaling each separately would make their thicknesses incomparable. After a mode switch or a refetch the scale MUST be recomputed from the new maximum.

A ribbon MUST be a **filled area** bounded by cubic Bézier curves (not a constant-width stroked path), anchored at each end to the centre of the source and target slots, and filled with a linear gradient from the source end to the target end; both gradient stops MUST belong to that direction's (read / write) color family so that the direction remains recognisable.

Every ribbon MUST end in the **direction chevron** of `sankey-canvas` ("Ribbon end chevron"): an open chevron just inside the ribbon's target end pointing rightward — the way every storage ribbon runs — sized to the ribbon's thickness, stroked in the primary foreground token, faded with its ribbon when it is off the lit path, and drawn on a zero-weight dashed ribbon too. Under the `Node` layout and the SVM display's `Group` it sits inside the target card's edge like anywhere else.

Hover highlighting MUST be done by a style switch driven by a class or CSS `:hover`, and MUST still revert in cases where `mouseleave` does not fire (the pointer leaving the browser window directly, a touch being interrupted, a pan starting): no link MUST ever be stuck in the highlighted style.

The ribbon path generator, the thickness scale (`ribbonPath`, `thicknessScale`, `MIN_THICKNESS`, `MAX_THICKNESS`, `LABEL_MIN_THICKNESS`) and the chevron are the shared ones in `sankey-canvas`, used by the network Sankey too; this view keeps its own gradients and mode colours.

#### Scenario: Shared scale

- **WHEN** in Both mode, the maximum weight among all drawn links is `5242880` (a read link)
- **THEN** that link is drawn at the maximum thickness; a write link of weight `1048576` is about one fifth as thick, both converted with the same scale

#### Scenario: Switching mode recomputes the scale

- **WHEN** the user switches from Both to Write, and the maximum weight changes from `5242880` to `1048576`
- **THEN** the scale is recomputed from `1048576`, and that write link is now drawn at the maximum thickness

#### Scenario: Every ribbon ends in a chevron

- **WHEN** the fixture is drawn in Both mode
- **THEN** every read and write ribbon carries one chevron inside its target end pointing right, including the zero-weight dashed ribbons; hovering `aggr2` leaves the chevrons of its lit ribbons at full opacity and fades the rest with their ribbons

#### Scenario: Hover does not get stuck highlighted

- **WHEN** the user hovers a ribbon and then moves the pointer straight out of the browser window (without passing over any other element)
- **THEN** that ribbon returns to the un-highlighted style

### Requirement: Labels and tooltips for nodes and links

Every node MUST show its `label`. On hovering a node the tooltip MUST show:

- The node kind and `label`; `pod` / `pvc` additionally show `namespace`; `pvc` additionally shows its SVM and, when it has a claim aggregate, that aggregate's `label`; `netapp-aggr` / `netapp-svm` / `netapp-node` additionally show `ontap_cluster`.
- Total inflow and total outflow in bytes/sec for the current mode (in Both mode read / write listed separately), each row **painted in the colour of the ribbons it sums** — the read rows in the read ribbon colour, the write rows in the write ribbon colour, in Read or Write mode the `in` / `out` rows in that direction's colour — the way the network trace paints `traced in` / `traced out` like its ribbons and `other in` / `other out` like its residuals. Rows marked derived are painted the same way. Every other row is plain.
- `pvc` / `netapp-aggr`: when `usage` is present, show `used_bytes` / `capacity_bytes`; when `usage` or either field is missing, omit the item, and MUST NOT fill in `0`.
- Any node the backend sent a `status` for: show it as-is, next to `health` rather than in place of it — `health` is one of the signals folded into `status`, and the two answer different questions. On a wrapper the status item MUST say it is the worst of the node and its members, the same way its flow items say they are derived from them. The derived `application` / `namespace` cards show **no** status item (see "Nodes are presented as box cards").
- `netapp-aggr` / `netapp-node`: when `health` is present, show it as-is; when missing, omit it, and MUST NOT fill in `unknown` or `degraded`.
- `netapp-node`: when `hardware` is present, show the fields it has (at least `model`); when `perf` is present, show the fields it has (`cpu_busy_pct` / `total_ops` / `total_latency_us` / `total_bytes_per_sec`) marked as raw readings. The app MUST NOT derive a health verdict from `perf`, and MUST NOT color by threshold or add a warning icon — thresholds are model- and estate-specific, and verdicts arrive via `alerts`.
- When any node's `alerts` is present and non-empty, its alerts (name and severity) MUST be shown, and the node marked with the status color.
- A no-flow root node: MUST state explicitly "this node is a selected root with no flow in this time range".
- `application` / `namespace`: the kind and `label`, the namespace (for an application), the member pod count, and the total inflow in the current mode marked **derived from member pods**; no status, usage, health, hardware or perf item (the body carries none for a group).
- A wrapper under the `Node` layout (hovering its title row): kind `node`, `label`, member pod count, and the total inflow of its pods in the current mode marked derived; when the node is a no-flow root, the root statement above.
- A frame under the SVM display's `Group` (hovering its title row): kind `netapp-svm`, `label`, `ontap_cluster`, member PVC count, and the total inflow of its PVCs in the current mode marked derived; no status item; when the SVM is a no-flow root, the root statement above.

On hovering a link the tooltip MUST show the source `label`, target `label`, tier, direction (read / write) and weight value, the direction-and-weight row painted in that direction's ribbon colour. A derived link (`pod → application`, `pod → namespace`, `application → namespace`) MUST show source, target, direction and weight, name its column pair in place of a backend tier, and mark the value as derived from member pods; it MUST NOT show a ceiling, latency or attribution item. An `svm-pvc` link additionally MUST show `max_bytes_per_sec` / `max_iops` informationally when present (marked as QoS ceiling); when missing they are omitted, and MUST NOT be shown as `0` or "unlimited"; when the measurement exceeds the ceiling the app MUST NOT color, warn or change the link's style. Under `Group` an aggregate → PVC ribbon is an `svm-pvc` link: its tooltip names the aggregate as source and the PVC as target, gives tier `svm-pvc` with the SVM the claim belongs to, and shows that edge's ceiling items as above. Links on other tiers MUST NOT show ceiling or latency fields (the backend does not provide them there). A link whose `labels.attribution` is `"split"` MUST be marked "split estimate".

The tooltip is the shared `SankeyTooltip` of `sankey-canvas`, fed lines that are plain or carry the colour of the mark they describe; the colours are the theme's read / write tokens and follow a theme switch.

#### Scenario: Hovering an aggregate node

- **WHEN** the user hovers `aggr1` in Read mode
- **THEN** the tooltip shows `netapp-aggr` / `aggr1` / `ontap_cluster: ontap-prod`, inflow `5.24 MB/s` and outflow `5.24 MB/s` both painted in the read colour, usage `700 GB / 1 TB`, status `warning` and health `online` plain

#### Scenario: Flow rows are painted like their ribbons

- **WHEN** the user hovers `data-mongo-0` in Both mode, then the write link of `svm_shop → data-mongo-0`
- **THEN** the card tooltip's `in read` and `out read` rows carry the read ribbon colour and its `in write` and `out write` rows the write ribbon colour while `namespace`, `SVM`, `aggregate`, `usage` and `status` are plain; the link tooltip's `write: …` row carries the write colour and its `tier` and ceiling rows are plain; after switching the theme every painted row takes the new theme's token

#### Scenario: Hovering a netapp-node shows hardware and performance readings

- **WHEN** the user hovers `ontap-prod-02`, which has `hardware: { model: "AFF-A400" }`, `perf: { cpu_busy_pct: 41.2 }`, `health: "degraded"`
- **THEN** the tooltip shows the model, `cpu_busy_pct` marked as a raw reading and uncoloured, health `degraded`, and no usage item; `cpu_busy_pct` triggers no color or icon change

#### Scenario: Ceiling only on svm-pvc links

- **WHEN** the user hovers the read link of `svm_shop → data-mongo-0`, then hovers the read link of `ontap-prod-01 → aggr1`
- **THEN** the former shows read `5.24 MB/s`, `max_bytes_per_sec` `105 MB/s`, `max_iops` `5000`, with no warning style; the latter shows only tier and weight, with no ceiling or latency items

#### Scenario: Hovering a derived card and a derived link

- **WHEN** the user hovers `mongodb` and then the read link of `mongodb → prod` in Both mode, where a member pod carries `status: "warning"`
- **THEN** the card tooltip shows `application` / `mongodb` / namespace `prod` / `2 pods` and read / write inflow marked derived from member pods and painted read / write, with no status, usage or health item; the link tooltip shows `mongodb` → `prod`, read, the summed value marked derived and painted read, and no ceiling, latency or split item

#### Scenario: Hovering a PVC names its SVM and aggregate

- **WHEN** the user hovers `data-mongo-1`, then the FlexGroup claim `data-scratch`
- **THEN** the first tooltip shows `pvc` / `data-mongo-1` / namespace `prod` / SVM `svm_shop` / aggregate `aggr2`; the second shows SVM `svm_shop` and no aggregate item

### Requirement: Layout switch: flat and node grouping

The scope bar's **view-controls group** (see "Top nav bar" in `app-shell`) SHALL provide a **layout segmented control** labelled `Layout` with two segments, `Flat` (default) and `Node`. It selects how the pod column is arranged and nothing else: the other six columns, every link and every weight MUST be identical under both layouts, and switching MUST NOT issue any request. It remains operable in every empty state.

- **`Flat`**: pods are laid out by "Sorting within a tier" and "Namespace grouping color bars and adjacent placement on the pod tier". Kubernetes nodes are not drawn.
- **`Node`**: every pod that is the source of a `pod-node` edge in the body is drawn **inside a wrapper** representing its Kubernetes node (that edge's target), placed in the pod column. A wrapper has a title row carrying the node's `label` and a subtitle carrying its member pod count; its pods are stacked beneath the title. Wrappers are ordered top to bottom by node `label` **lexicographically ascending** (`localeCompare`) — not by flow: a node is an inventory item the operator looks up by name. Within a wrapper, pods follow the pod column's own rules (namespace adjacency, then total flow descending, ties by label). Pods with no `pod-node` edge (unscheduled) are placed **below every wrapper**, unwrapped, in the pod column's own order. Ribbons attach to the pod cards, never to the wrapper. A wrapper is drawn only when it holds at least one drawn pod, with one exception: a Kubernetes node selected as a `node` root whose pods are all undrawn MUST still be drawn as an empty wrapper marked no-flow (the "root is always drawn" rule). The pod column header reads `Node / Pod` under this layout.

Under the `Flat` layout a `node` root that matched a **Kubernetes** node has nowhere to be drawn. That is not an error, and the view MUST NOT raise a hint about it beside the root control either: the paths flowing through that node's pods are drawn as usual, and the `Node` layout is where the node itself appears. A standing sentence naming every such root read as a warning on a perfectly valid draw.

The layout is **transient view state** (see "Page transient state lives and dies with the route" in `app-shell`): it MUST NOT be written to the URL, MUST NOT be persisted, and MUST return to `Flat` after the page remounts or a full refresh. It is independent of the Graph page's pod-parent mode, which happens to carry the same `Layout` label and a `Node` segment: changing either MUST NOT change the other.

Switching the layout re-runs the layout (the pod column's intrinsic coordinates change) but MUST preserve the zoom / pan viewport, the mode, the estate / root / narrowing selections and — when the hovered card still exists — the hover highlight. It MUST complete within the redraw bound of "Performance bounds".

#### Scenario: Flat is the default

- **WHEN** the user opens `/sankey?az=zone-a&env=prod`
- **THEN** the layout control, found in the scope bar after the Query action, highlights `Flat`, no wrapper is drawn, and no Kubernetes node appears in any column

#### Scenario: Node layout wraps pods in name order

- **WHEN**, on the fixture, the user switches the layout to `Node`
- **THEN** the pod column shows the wrapper `worker-0` holding `mongo-0` above the wrapper `worker-1` holding `mongo-1`; the pod column header reads `Node / Pod`; the ribbons `svm_shop → data-mongo-0 → mongo-0 → mongodb` attach to the pod card; no `pod-node` ribbon is drawn; and the storage-graph request count is unchanged

#### Scenario: Wrappers are ordered by name, not by flow

- **WHEN** the body holds pods on nodes `worker-b` (pods totalling 9 MB/s) and `worker-a` (pods totalling 1 MB/s)
- **THEN** under the `Node` layout the wrapper `worker-a` is above `worker-b`

#### Scenario: An unscheduled pod sits below the wrappers

- **WHEN** some pod has a `pvc-pod` inbound edge but no `pod-node` edge, and the layout is `Node`
- **THEN** that pod is drawn in the pod column below every wrapper, unwrapped, and no placeholder wrapper appears for it

#### Scenario: A Kubernetes node root under the Flat layout

- **WHEN** the user uses `node: worker-0` as root under the `Flat` layout, and the backend returns the paths through `worker-0`'s pods
- **THEN** those paths are drawn, no card for `worker-0` appears, and neither an error nor a hint is shown; switching to `Node` draws it as a wrapper

#### Scenario: Switching the layout preserves the viewport and does not refetch

- **WHEN** the user zooms to 180%, pans, hovers `data-mongo-0`, then switches from `Flat` to `Node`
- **THEN** the zoom readout is still 180%, the mode and every selector are unchanged, the path of `data-mongo-0` is still highlighted, and the storage-graph request count is unchanged

#### Scenario: The layout is transient and independent of the Graph

- **WHEN** the user switches the Sankey layout to `Node`, Locates a card into `/graph`, then presses Back
- **THEN** the Sankey remounts with the layout `Flat`; the Graph page's pod-parent mode was `controller` throughout; and the address bar never carried a layout parameter

### Requirement: SVM display switch: column and group

The scope bar's view-controls group SHALL provide a segmented control labelled `SVM`, beside `Layout`, with two segments: `Column` (default) and `Group`. It selects how SVMs are presented and nothing else: switching MUST NOT issue a request, and MUST NOT change the scope, the mode, the Top pods cut or any weight.

- **`Column`**: SVMs are cards on their own column, as "Flow chain and tier structure" describes.
- **`Group`**: the `netapp-svm` column is not drawn. Each SVM holding a drawn PVC becomes a **frame in the PVC column** around its PVCs. A PVC belongs to exactly one SVM, the source of its `svm-pvc` edge, so the containment is exact; an SVM could not wrap aggregates instead, which it shares with other SVMs. A frame has a title row carrying the SVM's `label` and a subtitle carrying its member PVC count; its PVCs are stacked beneath the title in the PVC column's own order ("Sorting within a tier"). Frames are ordered top to bottom by SVM `label`, lexicographically ascending (`localeCompare`) — an SVM is an inventory item the operator looks up by name. Ribbons attach to the PVC cards, never to a frame. A frame's border is neutral, since the backend judges no status for an SVM, and its title row, like an SVM card, is not locatable: `/v1/graph` has no SVM node. An SVM selected as a root whose PVCs are all undrawn is still drawn, as an empty frame marked no-flow.
  - Each `svm-pvc` edge whose PVC has a **claim aggregate** (see "Flow chain and tier structure") is drawn from that aggregate straight to the PVC, one ribbon per direction, carrying the edge's own weight unchanged. `aggr-svm` edges draw no ribbon. A PVC without a claim aggregate — a FlexGroup claim — is drawn in its frame with no inbound ribbon; the view MUST NOT guess its aggregate from the SVM's inbound hops.
- **Unavailable without claim aggregates.** When the body has PVCs with an inbound `svm-pvc` edge but **reports no claim aggregates**, the `Group` segment MUST be presented disabled, with text beside it saying that the backend reports no claim aggregates, and the view draws as under `Column` — frames with no inbound flow would read as storage that carries nothing.

The switch is **transient view state**, like `Layout`: it MUST NOT be written to the URL, MUST NOT be persisted, and MUST return to `Column` after the page remounts or a full refresh. It is independent of `Layout`, and the two combine: frames wrap PVCs while wrappers wrap pods. Switching MUST preserve the zoom / pan viewport, the mode, the estate / root / narrowing selections and — when the hovered card still exists — the hover highlight, and MUST complete within the redraw bound of "Performance bounds".

#### Scenario: Group draws each aggregate straight to its claims

- **WHEN**, on the fixture, `svm_shop` holds `data-mongo-0` on `aggr1` and `data-mongo-1` on `aggr2`, and the user switches the SVM display to `Group`
- **THEN** no SVM column and no `SVM` header is drawn; the PVC column shows a frame `svm_shop` holding `data-mongo-0`, `data-mongo-1` and `data-scratch`; the ribbons `aggr1 → data-mongo-0` and `aggr2 → data-mongo-1` carry the weights of the `svm_shop → data-mongo-0` and `svm_shop → data-mongo-1` edges; no `aggr → svm` ribbon is drawn; and the storage-graph request count is unchanged

#### Scenario: A FlexGroup claim sits in its frame with no aggregate ribbon

- **WHEN** under `Group` the fixture's FlexGroup claim `data-scratch`, whose PVC carries no `labels.aggr`, is drawn
- **THEN** it is inside the `svm_shop` frame with no inbound ribbon, its downstream ribbons are drawn as usual, and no aggregate is synthesized for it

#### Scenario: Group is unavailable when no claim aggregate is reported

- **WHEN** the body comes from a backend whose PVCs carry no `labels.aggr`
- **THEN** the `Group` segment in the scope bar is disabled with text saying the backend reports no claim aggregates, and the chart draws as under `Column`

#### Scenario: Frames are ordered by name

- **WHEN** under `Group` the body holds SVMs `svm_b` (claims totalling 9 MB/s) and `svm_a` (claims totalling 1 MB/s)
- **THEN** the frame `svm_a` is above the frame `svm_b`

#### Scenario: The switch is transient and independent of the layout

- **WHEN** the user switches the SVM display to `Group` and the layout to `Node`, then refreshes the page
- **THEN** before the refresh PVCs are framed by SVM and pods wrapped by Kubernetes node; after it the two controls read `Column` and `Flat`; the address bar never carried either; and neither switch issued a request

### Requirement: Top pods projection

The scope bar SHALL carry a **Top pods** control: an integer of at least `1`, default `10`, with an accessible name, applied by the app to the normalized storage-graph body after every successful load and **before** derivation. It keeps the K pods with the highest total inflow in the current mode (Both mode counts read plus write), ties broken by `label` ascending (`localeCompare`), among the pods that have at least one inbound `pvc-pod` link; pods with no such link (a no-flow root) are outside the ranking and unaffected. Every other pod is dropped, and with it every `pvc` / `netapp-svm` / `netapp-aggr` / `netapp-node` that no longer lies on a path to a kept pod, the dropped pods' `pod-node` edges, under the `Node` layout any wrapper left without a kept pod, and under the SVM display's `Group` any frame left without a kept PVC. The derived `application` / `namespace` columns are computed from the kept pods only.

When the body reports claim aggregates (see "Flow chain and tier structure"), a kept claim's path runs through its claim aggregate only: an aggregate is kept when it is the claim aggregate of a kept PVC, not merely because it feeds a kept SVM, and a kept PVC without a claim aggregate keeps no aggregate. A body that reports no claim aggregates keeps every aggregate feeding a kept SVM, which is all such a body can say.

This is the **one** client-side narrowing the view performs, and it narrows membership only: every kept link MUST keep the weight the backend gave it, and the app MUST NOT rescale, split or re-sum any hop — so a kept upstream ribbon may carry more than the kept downstream shows, which is the truth (the hidden pods still flow through that aggregate). The scope bar's view-controls group MUST therefore carry a **cut statement** — `<shown> of <total> pods` — whenever the cut hid any pod, and the "Empty states" hints likewise state how many pods are shown out of how many the body carried. When K is at least the number of ranked pods nothing is hidden and no such statement is shown. The cut MUST NOT mutate the normalized result (the deep-equality rule of "Input is its own storage-graph fetch" holds across it), MUST be re-applied on every refresh, and MUST be re-ranked on a mode switch, since the ranking is per direction.

The control MUST be unavailable — presented disabled, with text saying why — while the **draft** contains any `pod` root, and the cut MUST NOT be applied to a body whose **applied** selection contains any `pod` root: naming pods and ranking them are mutually exclusive, and an operator who asked for `shop/orders-0` must never find it cut. The value is not a draft input: changing it redraws immediately with no request (see `explicit-query`). Outside demo mode it MUST sync to the URL as `top_pods` (replace, written only when it differs from `10` and no `pod` root is present, read on mount, an unparseable or sub-`1` value falling back to `10`); it MUST NOT be sent to the backend, which has no such parameter. Under `demoMode` it is held in component state like the other scope values.

#### Scenario: The default cut bounds a large body

- **WHEN** the synthetic 3000-edge body of "Performance bounds" (1000 pods) is loaded with Top pods at its default and no `pod` root
- **THEN** the pod column draws exactly 10 cards, being the 10 pods with the highest inflow in the current mode; every `pvc` / `netapp-svm` / `netapp-aggr` / `netapp-node` drawn lies on a path to one of them; every drawn link carries the weight the backend gave it; and the scope bar states `10 of 1000 pods`

#### Scenario: The ranking follows the mode

- **WHEN** in Write mode pod `batch-7` has the largest write inflow and a read inflow below every other pod's, K is `1`, and the operator switches to Read mode
- **THEN** in Write mode `batch-7` is the one pod drawn; in Read mode it is not drawn and the pod with the largest read inflow is, with no request issued

#### Scenario: A pod root disables the cut

- **WHEN** the operator adds root `pod: shop/orders-0` to the draft
- **THEN** the Top pods control is disabled with text stating that a pod root names the pods; after Query the whole returned body is drawn with no cut, no cut statement is shown, and the address bar carries no `top_pods`

#### Scenario: The value syncs to the URL without a request

- **WHEN** after a committed query the operator sets Top pods to `25`
- **THEN** the chart redraws with up to 25 pod cards, no request is issued, the address bar carries `top_pods=25` with the history length unchanged; after a refresh and a new Query the control still shows `25`

#### Scenario: K beyond the pod count hides nothing

- **WHEN** the body carries 4 ranked pods and Top pods is `10`
- **THEN** all 4 are drawn and no cut statement is shown

#### Scenario: The cut keeps only the kept claims' aggregates

- **WHEN**, on the fixture, Top pods is `1` and `mongo-0` has the largest inflow, so `data-mongo-0` (claim aggregate `aggr1`) and the FlexGroup claim `data-scratch` are kept while `data-mongo-1` (claim aggregate `aggr2`) is not
- **THEN** `aggr1` and `ontap-prod-01` are drawn; `aggr2`, its `aggr2 → svm_shop` link and `ontap-prod-02` are not, although `aggr2` feeds the kept `svm_shop`; and every drawn link carries the weight the backend gave it

### Requirement: Weights come straight from the backend, with no client-side aggregation or splitting

A link's weight MUST be read directly from that `storage-flow` edge's `data.metrics`, from the direction field matching the current mode (`read_bytes_per_sec` / `write_bytes_per_sec`). The app MUST NOT:

- sum downstream links itself to derive an upstream weight (the backend already guarantees per-tier conservation);
- split a claim's measurement evenly across several pods itself (the backend has already done the split);
- use `read_ops` / `write_ops` / `read_latency_us` / `write_latency_us` / `max_iops` / `max_bytes_per_sec` as link thickness.

For a `pvc-pod` link whose `labels.attribution` is `"split"`, the weight is the **attributed value** after evenly splitting an RWX claim, not a measured value; that link's tooltip MUST mark it as "split estimate". A link lacking that label MUST NOT be marked as an estimate.

The **only** client-side summations are the one producing the derived `application` / `namespace` columns (see "Flow chain and tier structure") and the totals of an SVM frame under the SVM display's `Group` (see "SVM display switch: column and group"): they sum, per direction, the weights of links that are already drawn; they MUST NOT replace or adjust any backend link's weight, MUST NOT feed back into the five backend tiers, and MUST NOT be used to reconcile one backend tier against another. Under `Group` an aggregate → PVC ribbon is the claim's `svm-pvc` edge drawn from its claim aggregate: its weight is that edge's own, re-sourced and never re-summed, and the `aggr-svm` weight it no longer passes through is drawn nowhere. A derived link's value and a frame's totals MUST be marked as derived from their members in the tooltip; the mid-ribbon value label is exempt (see "Flow chain and tier structure").

#### Scenario: Derived sums never touch backend weights

- **WHEN** the `ontap-prod-01 → aggr1` edge carries `read_bytes_per_sec: 6000000` while the derived `mongodb → prod` read sum comes to `5999999`
- **THEN** the backend link keeps `6000000`, the derived link shows `5999999` marked as derived, and the app MUST NOT show a warning because the two differ

The scope bar's view-controls group SHALL provide a mode selector with the options **Read** / **Write** / **Both**, defaulting to **Both**, operable in every empty state. In Read or Write mode each edge yields at most one link; in Both mode each edge MUST draw two distinguishable links (one read, one write, in different colors), and the legend in the same group MUST explain the two colors (a read swatch, a dashed write swatch, each labelled in text), showing only the directions the mode draws. Outside demo mode the mode MUST sync to the `mode` URL query (`read` / `write`; the default `both` is not written); on page mount it is read from the URL, and an invalid value is treated as `both`. In demo mode it is component state like the rest of the scope (see "az / env are required single-value selectors").

#### Scenario: Mode restored from the URL

- **WHEN** the user opens `/sankey?az=zone-a&env=prod&mode=write`
- **THEN** the mode selector, found in the scope bar after the Query action, is Write and only write links are drawn

#### Scenario: Demo mode ignores scope parameters

- **WHEN** `demoMode` is `true` and the user opens `/sankey?az=zone-a&env=prod&mode=write`
- **THEN** the mode selector is Both and the fixture draws unscoped; the address bar keeps only `from` / `to` after the page's next write, and no request is issued to any URL

#### Scenario: Weights taken as-is

- **WHEN** in Read mode, the `svm_shop → data-mongo-0` edge carries `metrics.read_bytes_per_sec: 5242880`
- **THEN** that link's weight is `5242880`, unaffected by the same edge's `write_bytes_per_sec`, `read_ops` or `max_bytes_per_sec`

#### Scenario: Upstream weights are not summed by the client

- **WHEN** the `ontap-prod-01 → aggr1` edge carries `metrics.read_bytes_per_sec: 6000000`, while the sum of its two downstream `aggr-svm` links is `5999999` (backend rounding)
- **THEN** the upstream link's weight remains the backend-given `6000000`; the app MUST NOT replace it with the downstream sum, and MUST NOT show a warning because the two differ

#### Scenario: Split attribution is marked as an estimate

- **WHEN** some `pvc-pod` link carries `labels.attribution: "split"` and `write_bytes_per_sec: 524288`
- **THEN** its weight is `524288`, and the tooltip marks the value as a split estimate; the `svm-pvc` link on the same path (without that label) is not marked as an estimate

#### Scenario: Switching mode recomputes immediately

- **WHEN** the user switches from Both to Write
- **THEN** each edge keeps only its write link, the legend no longer shows the read item, and the app MUST NOT refetch

#### Scenario: Group re-sources a claim's weight without re-summing

- **WHEN** in Read mode under `Group`, SVM `svm_a` holds claims `pvc-1` (its `svm-pvc` edge read `700`) and `pvc-2` (read `300`), both with claim aggregate `aggr1`, and the `aggr1 → svm_a` edge carries read `1000`
- **THEN** the ribbons `aggr1 → pvc-1` and `aggr1 → pvc-2` carry `700` and `300`, no drawn ribbon carries `1000`, and the `svm_a` frame's inflow of `1000` is marked derived from its PVCs

### Requirement: Flow chain and tier structure

The Sankey SHALL present seven columns from left to right, in the direction **storage → workload**: `netapp-node` → `netapp-aggr` → `netapp-svm` → `pvc` → `pod` → `application` → `namespace`. The first five are the backend's `storage-flow` tiers; the last two are **derived columns** walked up from each pod's `data.parent` chain (see "Derived columns" below). The Kubernetes `node` is **not a column under either layout**: the `pod-node` hop is a physical placement rather than a further flow, and its weights only restate the `pvc-pod` weights of the pods on that node. Under the `Node` layout a Kubernetes node is drawn as a wrapper around its pods inside the pod column instead (see "Layout switch: flat and node grouping"); under the `Flat` layout it is not drawn at all. Under the SVM display's `Group` the `netapp-svm` column is not drawn either: SVMs become frames around their PVCs inside the PVC column (see "SVM display switch: column and group").

Links on the backend tiers MUST correspond one-to-one to the `storage-flow` edges in the body whose `labels.tier` is `node-aggr` / `aggr-svm` / `svm-pvc` / `pvc-pod`; tier membership MUST be read from that label and MUST NOT be inferred from the endpoints' kinds. Under `Group` an `aggr-svm` edge draws no ribbon, and an `svm-pvc` edge is drawn from its PVC's claim aggregate rather than from the SVM. A `pod-node` edge MUST NOT produce a ribbon under either layout; it is consumed only to decide which wrapper a pod belongs to under the `Node` layout:

- The path of a **FlexGroup claim** starts at `svm-pvc` (no `node-aggr` / `aggr-svm`); its SVM has no inbound edge on the aggregate tier — this is a normal shape, MUST NOT be treated as a gap, and MUST NOT have a substitute node synthesized.
- An **unscheduled pod** has no `pod-node` edge; it is drawn like any other pod, and under the `Node` layout it sits outside every wrapper.
- A **no-flow root** (a node the backend materialised but that has no drawn link) MUST still be drawn on its column as an orphaned node, with "no flow" marked on its card subtitle and in its tooltip; this is a deliberate answer from the backend (a degraded aggregate with no claims, a pod mounting no NetApp claim) and MUST NOT be dropped as a missing value.
  - This covers **two** shapes: a node with no edges at all, and a node that has edges but none of whose edges carries a measurement (see "Missing-value handling"). The latter cannot be decided by "has no edges".
  - The response's wire format **carries no root marker**, so the app MUST decide rootness from **the root selection at the time that request was issued**, with matching rules consistent with the backend: `node` matches the names of both `netapp-node` and Kubernetes `node`, `ontap_cluster` covers every controller / aggregate / SVM under it, `pod` matches `<namespace>/<pod>`; `pvc` is not a root kind, so a claim is never retained on this basis.
  - This decision is used only to **retain** nodes already present in the projection; it MUST NOT be used to remove any node — that would be the forbidden client-side root filtering, which breaks weight conservation. With all roots empty no node is retained on this basis, reverting to the single "no edges at all" shape.
  - A `node` root that matched a **Kubernetes** node has a column only under the `Node` layout, where it is retained as a wrapper; under the `Flat` layout it is not drawn, and no hint announces it (see "Layout switch: flat and node grouping").

**Claim aggregates.** A PVC's **claim aggregate** is the `netapp-aggr` node its `labels.aggr` names, when that node is in the body: the backend sets the label to the id of the aggregate the claim's volume sits on, and omits it for a FlexGroup claim. A body **reports claim aggregates** when at least one PVC with an inbound `svm-pvc` edge carries `labels.aggr`. An `aggr-svm` edge is shared by every claim an SVM holds on that aggregate, so once an SVM spans aggregates only the claim aggregate says which one a PVC sits on. The hover walk, the Top pods cut, the `Group` presentation and the PVC tooltip read it, and the app MUST NOT infer it from the SVM's inbound hops.

**Derived columns.** For every pod that has at least one drawn inbound `pvc-pod` link, the view SHALL walk that pod's `data.parent` chain upward and take the first ancestor whose kind is `application` and the first whose kind is `namespace`:

- **`pod → application`**: drawn when an `application` ancestor exists. Its weight for a direction is the **sum of that pod's drawn inbound `pvc-pod` weights** in that direction; a direction in which the pod has no drawn inbound link yields no link (absent ≠ 0 still holds).
- **`application → namespace`**: its weight for a direction is the sum of the `pod → application` weights of that application's member pods in that direction.
- A pod with **no `application` ancestor** but a `namespace` ancestor MUST draw a **`pod → namespace`** link directly, spanning the application column; the view MUST NOT synthesize a placeholder application. Its weight follows the `pod → application` rule.
- A pod with neither ancestor draws no derived link and is the terminus of its path.
- A no-flow pod (root or otherwise) contributes nothing to either derived column; an application or namespace with no contributing pod is not drawn.

Because every derived weight is a per-direction sum of values the backend already conserved, the derived columns are conserved by construction. The application and namespace cards are the only cards not produced by any edge in the body, and the derived links are the only links not backed by a `storage-flow` edge; both MUST be marked as derived in **the tooltip** (see "Labels and tooltips for nodes and links"). The mid-ribbon value label carries no marker: it is a bare formatted rate with room for nothing else, and a marker abbreviated to fit there would say less than the tooltip one hover away.

An edge's `source` / `target` MUST resolve by id to nodes actually present in the body; otherwise that edge MUST be ignored. `storage-cluster`, `cluster`, `controller`, `service` and `switch` MUST NOT appear as cards; they exist only as `data.parent`. `application` and `namespace` appear **only** as derived-column cards, never from an edge; a Kubernetes `node` appears **only** as a wrapper under the `Node` layout; an SVM appears as a card under the SVM display's `Column` and as a frame under `Group`.

#### Scenario: The fixture derives seven columns

- **WHEN** the Sankey is derived from the storage fixture (`SHOWCASE_STORAGE_GRAPH`) in Both mode
- **THEN** the seven columns are respectively `ontap-prod-01` / `ontap-prod-02`, `aggr1` / `aggr2`, `svm_shop`, `data-mongo-0` / `data-mongo-1`, `mongo-0` / `mongo-1`, `mongodb`, `prod`
- **AND** the backend-tier links fall into four groups by `labels.tier` (`node-aggr` / `aggr-svm` / `svm-pvc` / `pvc-pod`), the derived links are `mongo-0 → mongodb`, `mongo-1 → mongodb` and `mongodb → prod`, the `pod-node` edges produce no ribbon, and none of `storage-cluster/ontap-prod`, `prod/ctrl/StatefulSet/mongodb`, `node/worker-0`, `node/worker-1` appears as a card

#### Scenario: Derived weights are per-direction sums of drawn links

- **WHEN** in Both mode `mongo-0` has drawn inbound `pvc-pod` links of read `5242880` / write `1048576`, and `mongo-1` has read `262144` / write `49152`, both under application `mongodb` in namespace `prod`
- **THEN** `mongo-0 → mongodb` is read `5242880` / write `1048576`, `mongo-1 → mongodb` is read `262144` / write `49152`, and `mongodb → prod` is read `5505024` / write `1097728`; the tooltips of all three mark the value as derived from member pods

#### Scenario: A pod without an application spans to its namespace

- **WHEN** some pod's parent chain is `controller → namespace → cluster` with no `application` in it, and that pod has a drawn inbound link
- **THEN** a `pod → namespace` link is drawn across the application column with that pod's inbound sum as its weight, and no application card is synthesized for it

#### Scenario: A FlexGroup path starts at the SVM

- **WHEN** the most upstream edge of some path in the body has `labels.tier` `svm-pvc`, and no `aggr-svm` edge points at that SVM
- **THEN** that SVM is drawn on the SVM tier with no inbound edge, its downstream is drawn normally, and the view synthesizes no aggregate or controller node

#### Scenario: A pod-node edge produces no ribbon

- **WHEN** some pod has a `pvc-pod` inbound edge and a `pod-node` outbound edge carrying `metrics`
- **THEN** under both layouts the only ribbons leaving that pod are its derived links; no ribbon ends at a Kubernetes node, and the `pod-node` weights appear nowhere in the chart

#### Scenario: A no-flow root is still drawn

- **WHEN** the user uses `aggr: aggr9` as root, and the body contains the `aggr9` node and its controller but no edges at all
- **THEN** both nodes are drawn on their respective columns, their subtitles ending in `· no flow`, and the view MUST NOT show the "no data" empty state

#### Scenario: A claim aggregate is read from the PVC, never inferred

- **WHEN** `svm_shop` has inbound `aggr-svm` edges from `aggr1` and `aggr2`, `data-mongo-0` carries a `labels.aggr` naming `aggr1`, `data-mongo-1` one naming `aggr2`, and the FlexGroup claim `data-scratch` carries none
- **THEN** the claim aggregates of `data-mongo-0` and `data-mongo-1` are `aggr1` and `aggr2`, `data-scratch` has none, and none of the three is given an aggregate from `svm_shop`'s inbound edges

### Requirement: Focus mode

Focus mode MUST collapse the app shell's top nav bar and the page's scope bar — the estate / root / narrowing controls, Top pods and Query together with the view-controls group they are followed by (mode selector, `Layout`, `SVM`, the cut statement and the legend) — so that the chart area fills the whole window; nothing else stands between the chart and the window's edges, since the page draws no title-bar row and no summary. `Esc` or activating the control bar's focus button again MUST leave it. Entering and leaving MUST preserve the zoom / pan viewport, mode, layout, SVM display, estate / root selection and hover state. Focus mode MUST be transient view state: it MUST NOT be written to the URL and MUST NOT be persisted; after navigating away from the Sankey page or a full refresh it MUST return to inactive.

#### Scenario: Entering and leaving focus mode preserves the viewport

- **WHEN** the user zooms to 180%, presses `F`, then presses `Esc`
- **THEN** on entering, the nav bar and the scope bar with its view-controls group collapse and the chart fills the window; after leaving, both are restored and the zoom factor is still 180%

#### Scenario: Leaving the route ends focus mode

- **WHEN** the user, while in focus mode, presses the browser's Back to leave `/sankey`, then returns with Forward
- **THEN** the Sankey page remounts: focus mode is inactive, the nav bar is visible, the viewport is the initial one; the estate / roots / mode carried by the URL are restored

### Requirement: Fully independent of the Graph view's controls

The Sankey's data MUST be fully independent of the Graph view's kind / edge-type display toggles, ingress visibility toggle, search query, pod-parent mode, collapse state, `prune` setting, and the filter bar's multi-value `cluster` / `az` / `env` / `namespace` selections — any change to those MUST NOT change the Sankey's nodes, links or weights, and MUST NOT trigger a storage-graph refetch. The edge-type toggles named here are the legend's client-side display refinement (`element-filter`); there is no backend edge-type filter on either page.

The reverse also holds: changes to the Sankey's `az` / `env` / roots / `cluster` / `namespace` / mode / Top pods are written only to the `/sankey` query, MUST NOT rewrite the `/graph` query, and MUST NOT make the Graph page carry the Sankey's selections on its next mount. The Sankey's `Layout` control (`Flat` / `Node`) and the Graph's pod-parent `Layout` control (`Node` / `Controller`) are two unrelated pieces of transient state that happen to share a label: neither MUST read or write the other.

The only input the two pages share is the **view time range** (see `app-shell`; passed via the URL and the browser-local saved value): it is a draft input on both pages, a change to it reaches the current page's data on its next Query commit, and the other page seeds its draft with the applied value on its next mount.

#### Scenario: Graph view controls do not affect the Sankey

- **WHEN** the user, on `/graph` (entered by a Locate from `/sankey?az=zone-a&env=prod&aggr=aggr1`), hides the `pvc` kind, enters the search `nats`, switches the pod-parent mode to `node`, switches the Projection to `Full inventory` and commits it, then presses Back to return to `/sankey?az=zone-a&env=prod&aggr=aggr1`
- **THEN** the Sankey remounts with its controls prefilled from that URL and awaits Query; the request Query then sends has the same query string as before (without `prune` or the Graph's filters), and the Sankey's nodes, links and weights are the same as before

#### Scenario: Sankey controls do not affect the Graph view

- **WHEN** the user, on `/sankey`, adds root `aggr: aggr1`, changes `env` and commits, then clicks a card (Locate to `/graph`)
- **THEN** the address bar is `/graph` (with only `from` / `to` filled in), the filter bar has nothing selected, and the request Query then sends contains no `aggr` / `az` / `env`

#### Scenario: The two Layout controls do not share state

- **WHEN** the user switches the Sankey layout to `Node`, Locates a card into `/graph`, and finds the Graph's pod-parent mode at its default `controller`; then switches the Graph to `node` and presses Back
- **THEN** the Sankey remounts at `Flat` (its own default), and neither switch was reflected in the other page or in the URL

## REMOVED Requirements

### Requirement: Numeric summary outside the chart

**Reason**: The tables below the chart took height from the diagram (they were already folded on arrival for that reason) on a page whose purpose is the diagram; every figure they carried is in the card tooltips, and the one statement that was not — how many pods the Top pods cut hid — now sits beside the Top pods control (see "Top pods projection").

**Migration**: Read a card's flow, usage, status and health from its tooltip; read the cut from the `<shown> of <total> pods` statement in the scope bar. There is no per-namespace or per-application subtotal table; the derived `application` / `namespace` cards carry those totals in the chart.
