## ADDED Requirements

### Requirement: SVM display switch: column and group

The Sankey control bar SHALL provide a segmented control labelled `SVM`, beside `Layout`, with two segments: `Column` (default) and `Group`. It selects how SVMs are presented and nothing else: switching MUST NOT issue a request, and MUST NOT change the scope, the mode, the Top pods cut or any weight.

- **`Column`**: SVMs are cards on their own column, as "Flow chain and tier structure" describes.
- **`Group`**: the `netapp-svm` column is not drawn. Each SVM holding a drawn PVC becomes a **frame in the PVC column** around its PVCs. A PVC belongs to exactly one SVM, the source of its `svm-pvc` edge, so the containment is exact; an SVM could not wrap aggregates instead, which it shares with other SVMs. A frame has a title row carrying the SVM's `label` and a subtitle carrying its member PVC count; its PVCs are stacked beneath the title in the PVC column's own order ("Sorting within a tier"). Frames are ordered top to bottom by SVM `label`, lexicographically ascending (`localeCompare`) — an SVM is an inventory item the operator looks up by name. Ribbons attach to the PVC cards, never to a frame. A frame's border is neutral, since the backend judges no status for an SVM, and its title row, like an SVM card, is not locatable: `/v1/graph` has no SVM node. An SVM selected as a root whose PVCs are all undrawn is still drawn, as an empty frame marked no-flow.
  - Each `svm-pvc` edge whose PVC has a **claim aggregate** (see "Flow chain and tier structure") is drawn from that aggregate straight to the PVC, one ribbon per direction, carrying the edge's own weight unchanged. `aggr-svm` edges draw no ribbon. A PVC without a claim aggregate — a FlexGroup claim — is drawn in its frame with no inbound ribbon; the view MUST NOT guess its aggregate from the SVM's inbound hops.
- **Unavailable without claim aggregates.** When the body has PVCs with an inbound `svm-pvc` edge but **reports no claim aggregates**, the `Group` segment MUST be presented disabled, with text saying that the backend reports no claim aggregates, and the view draws as under `Column` — frames with no inbound flow would read as storage that carries nothing.

The switch is **transient view state**, like `Layout`: it MUST NOT be written to the URL, MUST NOT be persisted, and MUST return to `Column` after the page remounts or a full refresh. It is independent of `Layout`, and the two combine: frames wrap PVCs while wrappers wrap pods. Switching MUST preserve the zoom / pan viewport, the mode, the estate / root / narrowing selections and — when the hovered card still exists — the hover highlight, and MUST complete within the redraw bound of "Performance bounds".

#### Scenario: Group draws each aggregate straight to its claims

- **WHEN**, on the fixture, `svm_shop` holds `data-mongo-0` on `aggr1` and `data-mongo-1` on `aggr2`, and the user switches the SVM display to `Group`
- **THEN** no SVM column and no `SVM` header is drawn; the PVC column shows a frame `svm_shop` holding `data-mongo-0`, `data-mongo-1` and `data-scratch`; the ribbons `aggr1 → data-mongo-0` and `aggr2 → data-mongo-1` carry the weights of the `svm_shop → data-mongo-0` and `svm_shop → data-mongo-1` edges; no `aggr → svm` ribbon is drawn; and the storage-graph request count is unchanged

#### Scenario: A FlexGroup claim sits in its frame with no aggregate ribbon

- **WHEN** under `Group` the fixture's FlexGroup claim `data-scratch`, whose PVC carries no `labels.aggr`, is drawn
- **THEN** it is inside the `svm_shop` frame with no inbound ribbon, its downstream ribbons are drawn as usual, and no aggregate is synthesized for it

#### Scenario: Group is unavailable when no claim aggregate is reported

- **WHEN** the body comes from a backend whose PVCs carry no `labels.aggr`
- **THEN** the `Group` segment is disabled with text saying the backend reports no claim aggregates, and the chart draws as under `Column`

#### Scenario: Frames are ordered by name

- **WHEN** under `Group` the body holds SVMs `svm_b` (claims totalling 9 MB/s) and `svm_a` (claims totalling 1 MB/s)
- **THEN** the frame `svm_a` is above the frame `svm_b`

#### Scenario: The switch is transient and independent of the layout

- **WHEN** the user switches the SVM display to `Group` and the layout to `Node`, then refreshes the page
- **THEN** before the refresh PVCs are framed by SVM and pods wrapped by Kubernetes node; after it the two controls read `Column` and `Flat`; the address bar never carried either; and neither switch issued a request

## MODIFIED Requirements

### Requirement: Flow chain and tier structure

The Sankey SHALL present seven columns from left to right, in the direction **storage → workload**: `netapp-node` → `netapp-aggr` → `netapp-svm` → `pvc` → `pod` → `application` → `namespace`. The first five are the backend's `storage-flow` tiers; the last two are **derived columns** walked up from each pod's `data.parent` chain (see "Derived columns" below). The Kubernetes `node` is **not a column under either layout**: the `pod-node` hop is a physical placement rather than a further flow, and its weights only restate the `pvc-pod` weights of the pods on that node. Under the `Node` layout a Kubernetes node is drawn as a wrapper around its pods inside the pod column instead (see "Layout switch: flat and node grouping"); under the `Flat` layout it is not drawn at all. Under the SVM display's `Group` the `netapp-svm` column is not drawn either: SVMs become frames around their PVCs inside the PVC column (see "SVM display switch: column and group").

Links on the backend tiers MUST correspond one-to-one to the `storage-flow` edges in the body whose `labels.tier` is `node-aggr` / `aggr-svm` / `svm-pvc` / `pvc-pod`; tier membership MUST be read from that label and MUST NOT be inferred from the endpoints' kinds. Under `Group` an `aggr-svm` edge draws no ribbon, and an `svm-pvc` edge is drawn from its PVC's claim aggregate rather than from the SVM. A `pod-node` edge MUST NOT produce a ribbon under either layout; it is consumed only to decide which wrapper a pod belongs to under the `Node` layout:

- The path of a **FlexGroup claim** starts at `svm-pvc` (no `node-aggr` / `aggr-svm`); its SVM has no inbound edge on the aggregate tier — this is a normal shape, MUST NOT be treated as a gap, and MUST NOT have a substitute node synthesized.
- An **unscheduled pod** has no `pod-node` edge; it is drawn like any other pod, and under the `Node` layout it sits outside every wrapper.
- A **no-flow root** (a node the backend materialised but that has no drawn link) MUST still be drawn on its column as an orphaned node, with "no flow" marked on its label or tooltip; this is a deliberate answer from the backend (a degraded aggregate with no claims, a pod mounting no NetApp claim) and MUST NOT be dropped as a missing value.
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

Because every derived weight is a per-direction sum of values the backend already conserved, the derived columns are conserved by construction. The application and namespace cards are the only cards not produced by any edge in the body, and the derived links are the only links not backed by a `storage-flow` edge; both MUST be marked as derived in **the tooltip and the summary tables** (see "Labels and tooltips for nodes and links" and "Numeric summary outside the chart"). The mid-ribbon value label carries no marker: it is a bare formatted rate with room for nothing else, and a marker abbreviated to fit there would say less than the tooltip one hover away.

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
- **THEN** both nodes are drawn on their respective columns, marked as no-flow, and the view MUST NOT show the "no data" empty state

#### Scenario: A claim aggregate is read from the PVC, never inferred

- **WHEN** `svm_shop` has inbound `aggr-svm` edges from `aggr1` and `aggr2`, `data-mongo-0` carries a `labels.aggr` naming `aggr1`, `data-mongo-1` one naming `aggr2`, and the FlexGroup claim `data-scratch` carries none
- **THEN** the claim aggregates of `data-mongo-0` and `data-mongo-1` are `aggr1` and `aggr2`, `data-scratch` has none, and none of the three is given an aggregate from `svm_shop`'s inbound edges

### Requirement: Column headers

Each of the seven columns MUST carry one header line at the top of its column, left to right `NetApp node`, `NetApp aggregate`, `SVM`, `PVC`, `Pod`, `Application`, `Namespace`; under the `Node` layout the pod column's header reads `Node / Pod` instead of `Pod`, and under the SVM display's `Group` the SVM column and its header are not drawn and the PVC column's header reads `SVM / PVC` instead of `PVC`. Headers MUST be rendered in the secondary foreground color with wider letter spacing, and MUST NOT occupy node layout space (they do not push the box cards). When a column has no drawn node under the current mode, layout and estate / root selection, that column's header MUST NOT be drawn **and that column MUST NOT reserve horizontal space** — the remaining columns close up and the chart's intrinsic width shrinks with them. Not every estate resolves every column (a pod need not have an `application` ancestor), and a reserved empty column would put a gutter through the middle of the diagram and make "fit to window" scale the whole chart down to enclose it.

#### Scenario: Seven column headers

- **WHEN** the Sankey is opened with the fixture in Both mode
- **THEN** the seven column headers `NetApp node`, `NetApp aggregate`, `SVM`, `PVC`, `Pod`, `Application`, `Namespace` appear in order from left to right; after switching the layout to `Node` the fifth reads `Node / Pod`; after also switching the SVM display to `Group` the headers read `NetApp node`, `NetApp aggregate`, `SVM / PVC`, `Node / Pod`, `Application`, `Namespace`

#### Scenario: An empty column has no header

- **WHEN** no `pvc-pod` edge points at any pod from a pvc that carries a measurement, so the pod column has no nodes
- **THEN** the `Pod`, `Application` and `Namespace` headers are not drawn, and the other four lines are drawn as usual

#### Scenario: An empty column reserves no width

- **WHEN** no drawn pod has an `application` ancestor, so only the application column is empty
- **THEN** the `Namespace` column sits directly to the right of the `Pod` column with the usual column gap and no wider one, the chart's intrinsic width is smaller by exactly one column plus one gap, and "fit to window" fits that narrower content

### Requirement: Weights come straight from the backend, with no client-side aggregation or splitting

A link's weight MUST be read directly from that `storage-flow` edge's `data.metrics`, from the direction field matching the current mode (`read_bytes_per_sec` / `write_bytes_per_sec`). The app MUST NOT:

- sum downstream links itself to derive an upstream weight (the backend already guarantees per-tier conservation);
- split a claim's measurement evenly across several pods itself (the backend has already done the split);
- use `read_ops` / `write_ops` / `read_latency_us` / `write_latency_us` / `max_iops` / `max_bytes_per_sec` as link thickness.

For a `pvc-pod` link whose `labels.attribution` is `"split"`, the weight is the **attributed value** after evenly splitting an RWX claim, not a measured value; that link's tooltip MUST mark it as "split estimate". A link lacking that label MUST NOT be marked as an estimate.

The **only** client-side summations are the one producing the derived `application` / `namespace` columns (see "Flow chain and tier structure") and the totals of an SVM frame under the SVM display's `Group` (see "SVM display switch: column and group"): they sum, per direction, the weights of links that are already drawn; they MUST NOT replace or adjust any backend link's weight, MUST NOT feed back into the five backend tiers, and MUST NOT be used to reconcile one backend tier against another. Under `Group` an aggregate → PVC ribbon is the claim's `svm-pvc` edge drawn from its claim aggregate: its weight is that edge's own, re-sourced and never re-summed, and the `aggr-svm` weight it no longer passes through is drawn nowhere. A derived link's value and a frame's totals MUST be marked as derived from their members in the tooltip and in the summary tables; the mid-ribbon value label is exempt (see "Flow chain and tier structure").

#### Scenario: Derived sums never touch backend weights

- **WHEN** the `ontap-prod-01 → aggr1` edge carries `read_bytes_per_sec: 6000000` while the derived `mongodb → prod` read sum comes to `5999999`
- **THEN** the backend link keeps `6000000`, the derived link shows `5999999` marked as derived, and the app MUST NOT show a warning because the two differ

The view SHALL provide a mode selector with the options **Read** / **Write** / **Both**, defaulting to **Both**. In Read or Write mode each edge yields at most one link; in Both mode each edge MUST draw two distinguishable links (one read, one write, in different colors), and the page MUST show a legend explaining the two colors. Outside demo mode the mode MUST sync to the `mode` URL query (`read` / `write`; the default `both` is not written); on page mount it is read from the URL, and an invalid value is treated as `both`. In demo mode it is component state like the rest of the scope (see "az / env are required single-value selectors").

#### Scenario: Mode restored from the URL

- **WHEN** the user opens `/sankey?az=zone-a&env=prod&mode=write`
- **THEN** the mode selector is Write and only write links are drawn

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

### Requirement: Hover highlights the path

On hovering a node, the view MUST highlight all links on every path passing through that node — that is, the union of all links reachable by walking back along inbound edges (upstream, toward the storage side) and all links reachable by walking along outbound edges (downstream, toward the workload side, through the derived links) — and fade the remaining links and nodes; in Both mode links of both the read and write directions are included. A link not on any path passing through that node (for example the outbound edges of other aggregates under the same controller) MUST NOT be highlighted.

When the body reports claim aggregates (see "Flow chain and tier structure"), a claim's path runs through its claim aggregate only. Walking up from a PVC, or from a pod downstream of it, crosses the PVC's SVM only over the `aggr-svm` link from its claim aggregate, and a PVC without a claim aggregate — a FlexGroup claim — stops at its SVM; walking down from an aggregate crosses an SVM only toward the PVCs whose claim aggregate it is. Hovering an SVM card lights every path through it. A body that reports no claim aggregates is walked over every link, which is all such a body can say. Under the SVM display's `Group` the aggregate → PVC ribbons are direct, and hovering a frame's title row MUST highlight the union of its member PVCs' paths.

Hovering a wrapper's title row under the `Node` layout MUST highlight the union of its member pods' paths. After the mouse leaves, everything MUST revert to normal display. Hover highlighting MUST only change styles and MUST NOT trigger a re-layout.

#### Scenario: Hovering a pvc highlights upstream and downstream

- **WHEN** the user hovers `data-mongo-0` in Both mode, where `svm_shop` is fed by `aggr1` and `aggr2` and `data-mongo-0`'s claim aggregate is `aggr1`
- **THEN** the read and write links of `ontap-prod-01→aggr1`, `aggr1→svm_shop`, `svm_shop→data-mongo-0`, `data-mongo-0→mongo-0`, `mongo-0→mongodb`, `mongodb→prod` are all highlighted; `aggr2→svm_shop` and the rest of the `aggr2` side, `svm_shop→data-mongo-1` and `mongo-1→mongodb` are faded

#### Scenario: Hovering an aggregate lights only its own claims

- **WHEN** the user hovers `aggr2`, the claim aggregate of `data-mongo-1` and of no other PVC of `svm_shop`
- **THEN** `ontap-prod-02→aggr2`, `aggr2→svm_shop`, `svm_shop→data-mongo-1`, `data-mongo-1→mongo-1`, `mongo-1→mongodb` and `mongodb→prod` are highlighted, while `svm_shop→data-mongo-0` and `svm_shop→data-scratch` are faded

#### Scenario: A FlexGroup claim's path starts at its SVM

- **WHEN** the user hovers the FlexGroup claim `data-scratch`, which has no claim aggregate
- **THEN** `svm_shop→data-scratch` and its downstream links are highlighted, and no `aggr-svm` or `node-aggr` link is

#### Scenario: Without claim aggregates every link is walked

- **WHEN** the body reports no claim aggregates and the user hovers `data-mongo-0`
- **THEN** both `aggr1→svm_shop` and `aggr2→svm_shop` are highlighted, with the `node-aggr` links above them

#### Scenario: Hovering a frame highlights its claims' paths

- **WHEN** under `Group` the user hovers the title row of the `svm_shop` frame
- **THEN** `aggr1→data-mongo-0`, `aggr2→data-mongo-1`, the `node-aggr` links above them and every downstream link of the three PVCs are highlighted, and no layout recomputation occurs

#### Scenario: Hovering a wrapper highlights its pods' paths

- **WHEN** the layout is `Node` and the user hovers the title row of `worker-0`, which holds `mongo-0`
- **THEN** every link on `mongo-0`'s paths is highlighted, `mongo-1`'s paths are faded, and no layout recomputation occurs

#### Scenario: Side branches are not highlighted

- **WHEN** two aggregates (`aggrA`, `aggrB`) belong to the same controller, and the user hovers `aggrA`
- **THEN** `ontap-node→aggrA` and all outbound edges of `aggrA` are highlighted; `ontap-node→aggrB` and the outbound edges of `aggrB` are faded

#### Scenario: Reverts after leaving

- **WHEN** the user moves the mouse off any node
- **THEN** all links and nodes revert to the un-faded state, and the layout coordinates are exactly the same as before the hover

### Requirement: Labels and tooltips for nodes and links

Every node MUST show its `label`. On hovering a node the tooltip MUST show:

- The node kind and `label`; `pod` / `pvc` additionally show `namespace`; `pvc` additionally shows its SVM and, when it has a claim aggregate, that aggregate's `label`; `netapp-aggr` / `netapp-svm` / `netapp-node` additionally show `ontap_cluster`.
- Total inflow and total outflow in bytes/sec for the current mode (in Both mode read / write listed separately).
- `pvc` / `netapp-aggr`: when `usage` is present, show `used_bytes` / `capacity_bytes`; when `usage` or either field is missing, omit the item, and MUST NOT fill in `0`.
- Any node the backend sent a `status` for: show it as-is, next to `health` rather than in place of it — `health` is one of the signals folded into `status`, and the two answer different questions. On a wrapper the status item MUST say it is the worst of the node and its members, the same way its flow items say they are derived from them. The derived `application` / `namespace` cards show **no** status item (see "Nodes are presented as box cards").
- `netapp-aggr` / `netapp-node`: when `health` is present, show it as-is; when missing, omit it, and MUST NOT fill in `unknown` or `degraded`.
- `netapp-node`: when `hardware` is present, show the fields it has (at least `model`); when `perf` is present, show the fields it has (`cpu_busy_pct` / `total_ops` / `total_latency_us` / `total_bytes_per_sec`) marked as raw readings. The app MUST NOT derive a health verdict from `perf`, and MUST NOT color by threshold or add a warning icon — thresholds are model- and estate-specific, and verdicts arrive via `alerts`.
- When any node's `alerts` is present and non-empty, its alerts (name and severity) MUST be shown, and the node marked with the status color.
- A no-flow root node: MUST state explicitly "this node is a selected root with no flow in this time range".
- `application` / `namespace`: the kind and `label`, the namespace (for an application), the member pod count, and the total inflow in the current mode marked **derived from member pods**; no status, usage, health, hardware or perf item (the body carries none for a group).
- A wrapper under the `Node` layout (hovering its title row): kind `node`, `label`, member pod count, and the total inflow of its pods in the current mode marked derived; when the node is a no-flow root, the root statement above.
- A frame under the SVM display's `Group` (hovering its title row): kind `netapp-svm`, `label`, `ontap_cluster`, member PVC count, and the total inflow of its PVCs in the current mode marked derived; no status item; when the SVM is a no-flow root, the root statement above.

On hovering a link the tooltip MUST show the source `label`, target `label`, tier, direction (read / write) and weight value. A derived link (`pod → application`, `pod → namespace`, `application → namespace`) MUST show source, target, direction and weight, name its column pair in place of a backend tier, and mark the value as derived from member pods; it MUST NOT show a ceiling, latency or attribution item. An `svm-pvc` link additionally MUST show `max_bytes_per_sec` / `max_iops` informationally when present (marked as QoS ceiling); when missing they are omitted, and MUST NOT be shown as `0` or "unlimited"; when the measurement exceeds the ceiling the app MUST NOT color, warn or change the link's style. Under `Group` an aggregate → PVC ribbon is an `svm-pvc` link: its tooltip names the aggregate as source and the PVC as target, gives tier `svm-pvc` with the SVM the claim belongs to, and shows that edge's ceiling items as above. Links on other tiers MUST NOT show ceiling or latency fields (the backend does not provide them there). A link whose `labels.attribution` is `"split"` MUST be marked "split estimate".

#### Scenario: Hovering an aggregate node

- **WHEN** the user hovers `aggr1` in Read mode
- **THEN** the tooltip shows `netapp-aggr` / `aggr1` / `ontap_cluster: ontap-prod`, inflow `5.24 MB/s`, outflow `5.24 MB/s`, usage `700 GB / 1 TB`, status `warning` and health `online`

#### Scenario: Hovering a netapp-node shows hardware and performance readings

- **WHEN** the user hovers `ontap-prod-02`, which has `hardware: { model: "AFF-A400" }`, `perf: { cpu_busy_pct: 41.2 }`, `health: "degraded"`
- **THEN** the tooltip shows the model, `cpu_busy_pct` marked as a raw reading, health `degraded`, and no usage item; `cpu_busy_pct` triggers no color or icon change

#### Scenario: Ceiling only on svm-pvc links

- **WHEN** the user hovers the read link of `svm_shop → data-mongo-0`, then hovers the read link of `ontap-prod-01 → aggr1`
- **THEN** the former shows read `5.24 MB/s`, `max_bytes_per_sec` `105 MB/s`, `max_iops` `5000`, with no warning style; the latter shows only tier and weight, with no ceiling or latency items

#### Scenario: Hovering a derived card and a derived link

- **WHEN** the user hovers `mongodb` and then the read link of `mongodb → prod` in Both mode, where a member pod carries `status: "warning"`
- **THEN** the card tooltip shows `application` / `mongodb` / namespace `prod` / `2 pods` and read / write inflow marked derived from member pods, with no status, usage or health item; the link tooltip shows `mongodb` → `prod`, read, the summed value marked derived, and no ceiling, latency or split item

#### Scenario: Hovering a PVC names its SVM and aggregate

- **WHEN** the user hovers `data-mongo-1`, then the FlexGroup claim `data-scratch`
- **THEN** the first tooltip shows `pvc` / `data-mongo-1` / namespace `prod` / SVM `svm_shop` / aggregate `aggr2`; the second shows SVM `svm_shop` and no aggregate item

### Requirement: Numeric summary outside the chart

**Below** the chart there MUST be a separate numeric summary; these numbers MUST NOT be stuffed into node box cards:

- **Node summary table**: one row per drawn card, including the derived `application` / `namespace` cards (the tier column names their column); under the `Node` layout, one row per wrapper (tier `node`, inflow being the sum of its pods' inflow, marked derived); and under the SVM display's `Group`, one row per SVM frame in place of the SVM card rows (tier `netapp-svm`, inflow being the sum of its PVCs' inflow, marked derived, status the missing-value placeholder). Its columns are tier, `label`, total inflow and total outflow in the current mode, and the card's `status` shown as the same colored dot the border uses — the derived `application` / `namespace` rows show the missing-value placeholder in that column, since those cards carry no status (see "Nodes are presented as box cards"); `pvc` / `netapp-aggr` additionally list usage, `netapp-aggr` / `netapp-node` additionally list health. Status and health are separate columns and MUST NOT be merged: `health` is one of the signals the backend folded into `status`, and a `netapp-node` can be `online` while its status is `critical`. Missing values MUST be presented with a missing-value placeholder, and MUST NOT be shown as `0`, `0 B` or `unknown`.
- **Application subtotal table**: one row per application on the application column, with columns application, namespace, pod count and total flow in the current mode, ordered by total descending. When no drawn pod has an `application` ancestor, the whole table MUST NOT be drawn.
- **Namespace subtotal table**: one row per namespace on the pod tier, with columns namespace, pod count and total flow in the current mode, ordered by total descending. When the pod tier has no pod carrying a namespace, the whole table MUST NOT be drawn.

The summary MUST be **collapsible and MUST open collapsed**: the chart is what the view is for, and seven tiers make these tables tall enough to take half the column from it. Its header strip MUST stay drawn while collapsed, naming how many rows each table holds and, whenever the Top pods cut hid any pod, how many pods are shown out of how many the body carried (see "Top pods projection") — a summary that vanishes entirely is indistinguishable from an estate that has no numbers. The collapsed / expanded state is transient view state like the layout switch: it MUST NOT be written to the URL and MUST NOT be persisted, and it MUST return to collapsed after navigating away or a full refresh. Expanding or collapsing it changes the chart area's height and therefore MUST NOT move the zoom / pan viewport (see "Sizing and container resize").

All tables MUST update in step with mode, layout, the SVM display, the Top pods cut, estate / root selection and storage-graph refresh. When a table is too wide it MUST scroll horizontally inside its own container, and MUST NOT give the page a horizontal scrollbar. While an empty state is shown (see "Empty states"), neither the tables nor the header strip MUST be drawn.

#### Scenario: The summary opens collapsed

- **WHEN** the user opens the Sankey view on an estate that draws a chart
- **THEN** the summary's header strip is shown, stating the row counts, and no table is drawn; activating it expands the tables, and activating it again collapses them; the chart's zoom readout is unchanged across both

#### Scenario: Status sits beside health, not instead of it

- **WHEN** the fixture is drawn and the summary is expanded
- **THEN** the `aggr1` row shows status `warning` beside health `online`, and the `ontap-prod-02` row status `critical` beside health `degraded`

#### Scenario: Derived rows carry no status

- **WHEN** the fixture is drawn, `batch-pending` (`warning`) belongs to namespace `prod`, and the summary is expanded
- **THEN** the `prod` row (tier `namespace`) and every `application` row show the missing-value placeholder in the status column, while the `batch-pending` row shows the warning dot

#### Scenario: Summary tables follow the mode

- **WHEN** the user switches from Both to Write
- **THEN** the node summary table's total inflow / total outflow count only the write direction, and the namespace subtotals change accordingly

#### Scenario: Missing values are not filled with zero

- **WHEN** `ontap-prod-01` has no `usage`
- **THEN** its row's usage column is the missing-value placeholder, not `0` or `0 B`

#### Scenario: Derived rows and the application subtotal

- **WHEN** the fixture is drawn in Both mode
- **THEN** the node summary table carries rows for `mongodb` (tier `application`) and `prod` (tier `namespace`) whose inflow equals the sum of `mongo-0` and `mongo-1`'s inflow, and the application subtotal table lists `mongodb` / `prod` / `2` / that sum; after switching the layout to `Node` the node summary table additionally carries `worker-0` and `worker-1` rows (tier `node`), and no other row changes

#### Scenario: The header strip names the cut

- **WHEN** the synthetic 1000-pod body is drawn with Top pods at `10`
- **THEN** the collapsed header strip states `10 of 1000 pods` beside the row counts; after Top pods is raised to `1000` that statement disappears

#### Scenario: A frame replaces its SVM's row

- **WHEN** the fixture is drawn, the summary is expanded, and the SVM display is switched to `Group`
- **THEN** the `svm_shop` row (tier `netapp-svm`) shows as inflow the sum of the inflow of `data-mongo-0`, `data-mongo-1` and `data-scratch`, marked derived, with the missing-value placeholder in the status column, and the PVC rows keep their figures

### Requirement: Top pods projection

The scope bar SHALL carry a **Top pods** control: an integer of at least `1`, default `10`, with an accessible name, applied by the app to the normalized storage-graph body after every successful load and **before** derivation. It keeps the K pods with the highest total inflow in the current mode (Both mode counts read plus write), ties broken by `label` ascending (`localeCompare`), among the pods that have at least one inbound `pvc-pod` link; pods with no such link (a no-flow root) are outside the ranking and unaffected. Every other pod is dropped, and with it every `pvc` / `netapp-svm` / `netapp-aggr` / `netapp-node` that no longer lies on a path to a kept pod, the dropped pods' `pod-node` edges, under the `Node` layout any wrapper left without a kept pod, and under the SVM display's `Group` any frame left without a kept PVC. The derived `application` / `namespace` columns are computed from the kept pods only.

When the body reports claim aggregates (see "Flow chain and tier structure"), a kept claim's path runs through its claim aggregate only: an aggregate is kept when it is the claim aggregate of a kept PVC, not merely because it feeds a kept SVM, and a kept PVC without a claim aggregate keeps no aggregate. A body that reports no claim aggregates keeps every aggregate feeding a kept SVM, which is all such a body can say.

This is the **one** client-side narrowing the view performs, and it narrows membership only: every kept link MUST keep the weight the backend gave it, and the app MUST NOT rescale, split or re-sum any hop — so a kept upstream ribbon may carry more than the kept downstream shows, which is the truth (the hidden pods still flow through that aggregate). The summary's header strip and the "Empty states" hints MUST therefore state how many pods are shown out of how many the body carried whenever the cut hid any, and the chart toolbar MUST name the cut (`Top 10 pods`) while it is in effect. When K is at least the number of ranked pods nothing is hidden and no such statement is shown. The cut MUST NOT mutate the normalized result (the deep-equality rule of "Input is its own storage-graph fetch" holds across it), MUST be re-applied on every refresh, and MUST be re-ranked on a mode switch, since the ranking is per direction.

The control MUST be unavailable — presented disabled, with text saying why — while the **draft** contains any `pod` root, and the cut MUST NOT be applied to a body whose **applied** selection contains any `pod` root: naming pods and ranking them are mutually exclusive, and an operator who asked for `shop/orders-0` must never find it cut. The value is not a draft input: changing it redraws immediately with no request (see `explicit-query`). Outside demo mode it MUST sync to the URL as `top_pods` (replace, written only when it differs from `10` and no `pod` root is present, read on mount, an unparseable or sub-`1` value falling back to `10`); it MUST NOT be sent to the backend, which has no such parameter. Under `demoMode` it is held in component state like the other scope values.

#### Scenario: The default cut bounds a large body

- **WHEN** the synthetic 3000-edge body of "Performance bounds" (1000 pods) is loaded with Top pods at its default and no `pod` root
- **THEN** the pod column draws exactly 10 cards, being the 10 pods with the highest inflow in the current mode; every `pvc` / `netapp-svm` / `netapp-aggr` / `netapp-node` drawn lies on a path to one of them; every drawn link carries the weight the backend gave it; the summary header strip states `10 of 1000 pods`; and the toolbar names `Top 10 pods`

#### Scenario: The ranking follows the mode

- **WHEN** in Write mode pod `batch-7` has the largest write inflow and a read inflow below every other pod's, K is `1`, and the operator switches to Read mode
- **THEN** in Write mode `batch-7` is the one pod drawn; in Read mode it is not drawn and the pod with the largest read inflow is, with no request issued

#### Scenario: A pod root disables the cut

- **WHEN** the operator adds root `pod: shop/orders-0` to the draft
- **THEN** the Top pods control is disabled with text stating that a pod root names the pods; after Query the whole returned body is drawn with no cut, the header strip states no hidden count, and the address bar carries no `top_pods`

#### Scenario: The value syncs to the URL without a request

- **WHEN** after a committed query the operator sets Top pods to `25`
- **THEN** the chart redraws with up to 25 pod cards, no request is issued, the address bar carries `top_pods=25` with the history length unchanged; after a refresh and a new Query the control still shows `25`

#### Scenario: K beyond the pod count hides nothing

- **WHEN** the body carries 4 ranked pods and Top pods is `10`
- **THEN** all 4 are drawn, the header strip states no hidden count, and the toolbar does not name a cut

#### Scenario: The cut keeps only the kept claims' aggregates

- **WHEN**, on the fixture, Top pods is `1` and `mongo-0` has the largest inflow, so `data-mongo-0` (claim aggregate `aggr1`) and the FlexGroup claim `data-scratch` are kept while `data-mongo-1` (claim aggregate `aggr2`) is not
- **THEN** `aggr1` and `ontap-prod-01` are drawn; `aggr2`, its `aggr2 → svm_shop` link and `ontap-prod-02` are not, although `aggr2` feeds the kept `svm_shop`; and every drawn link carries the weight the backend gave it
