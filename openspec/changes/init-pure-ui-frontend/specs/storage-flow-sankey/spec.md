## Purpose

`storage-flow-sankey` defines the behavioural contract of the Sankey storage-flow view. This view's data comes from **its own backend endpoint** `GET /v1/storage-graph` (`endpoints.storageGraph` in the runtime config), which is a fetch path independent of the Graph view's `GET /v1/graph`; the rules of fetching itself are specified by `graph-data-source`, and this capability specifies the view behaviour: the estate selectors (`az` / `env` / root / `cluster` / `namespace` — presented with the dropdown contract of `graph-filters`, and synced to the URL query together with mode), the presentation of the six tiers, drawing with the backend-summed `storage-flow` weights, the read / write split, missing-value handling (absent ≠ 0), sorting, tooltips, hover highlighting, cross-view Locate, theme, sizing, refresh and performance bounds. This capability does not decide the drawing framework (settled in design); it only specifies observable behaviour.

**Why it is no longer derived from `/v1/graph`.** The early design had the Sankey and the Graph share one copy of `/v1/graph` data, with the frontend walking the chain along `pod → pvc → netapp-aggr`, summing the aggregate's inbound edges itself, and splitting an RWX claim's measurement evenly across the pods that mount it. The backend's storage-graph endpoint makes that path both invalid and unnecessary: it adds a `netapp-svm` tier (`/v1/graph` has no such node type), adds a Kubernetes node tier, offers root search starting from either the storage side or the workload side, and guarantees that weights are **conserved per tier** — none of these can be derived from the body of `/v1/graph`, and a frontend summing on its own would only produce a set of numbers that disagree with the backend and cannot be reconciled.

## ADDED Requirements

### Requirement: Input is its own storage-graph fetch

The Sankey view MUST take the response of `endpoints.storageGraph` (normalized through the same normalize boundary of `graph-data-source`) as its sole input. It MUST NOT read the Graph view's `/v1/graph` data, MUST NOT issue any request to `endpoints.graph`, and MUST NOT derive any node or link from `pvc-to-netapp-aggr` / `pod-mounts-pvc` / `pod-to-node` edges — those edges do not appear in the storage-graph body.

The Sankey's nodes and links are **read-only derived data** computed from that response; the derivation MUST NOT mutate any node, edge or field of the normalized result — the result MUST be deep-equal before and after derivation. While its data source is in the loading / error state, the Sankey MUST present that source's own loading / error state (not the Graph view's) and draw no graphics.

When `endpoints.storageGraph` is not configured, the view MUST show the "storage graph endpoint not configured" explanatory state (see `runtime-config`), MUST NOT show it as an error, and MUST NOT fall back to deriving from `/v1/graph`.

#### Scenario: Sankey does not read the graph endpoint

- **WHEN** the user switches from `/graph` to `/sankey?az=zone-a&env=prod`
- **THEN** the app issues exactly one request to `endpoints.storageGraph`, zero requests to `endpoints.graph`, and every element the Sankey draws comes from the storage-graph response

#### Scenario: Derivation does not change the source data

- **WHEN** the Sankey derivation runs on the normalized result of the storage fixture (once each in Read / Write / Both mode)
- **THEN** the normalized result after derivation is deep-equal to a deep copy taken before derivation (no added fields, no rewritten `metrics`, no removed edges)

#### Scenario: The two sources' states are independent of each other

- **WHEN** `/graph` previously ended in error, and the user switches to `/sankey` where the storage-graph request succeeds
- **THEN** the Sankey draws normally and shows no error; conversely, after a storage-graph failure, switching to `/graph` loads the Graph page with its own state, unaffected

#### Scenario: Endpoint not configured

- **WHEN** the runtime config lacks `endpoints.storageGraph` and `demoMode` is `false`
- **THEN** the view shows the not-configured explanation, issues no request, and MUST NOT draw any graphics from the Graph view's data

### Requirement: az / env are required single-value selectors

The view SHALL provide two **single-select dropdown** controls, `az` and `env` (contract: see "Interaction contract of the dropdown control" in `graph-filters`; custom values allowed), whose options come from `endpoints.labelValues` (the same source as the Graph view's filter bar, see `graph-data-source`). Each MUST send exactly one value: the backend rejects a missing value with 400 `missing_az` / `missing_env` and a repeated value with 400 `invalid_scope`, therefore:

- Until **both are selected**, the view MUST NOT issue any storage-graph request, and shows a hint explaining that one `az` and one `env` must each be chosen; both controls MUST remain operable at this point.
- `endpoints.labelValues` and `endpoints.storageGraph` are each independently optional, so the options may be **entirely unlistable**. In that case both controls MUST still render and MUST still accept a custom value (with zero options the dropdown holds only the search input and the "use "<text>"" row); they MUST NOT disappear or become an empty, unselectable dropdown — the backend requires these two values, and a dropdown that lists no options would leave the "please choose one az and one env" hint pointing at a control that cannot be selected, making the view permanently unable to fetch.
- When a dimension has **exactly one** option, the view SHALL auto-preselect that value (there is no choice to make on that dimension, and requiring a manual click is just friction). With zero or two-or-more options it MUST NOT auto-select.
- The app MUST NOT pick one of several candidate values on its own, and MUST NOT send an empty value.
- The selected value MUST sync to the `az` / `env` URL query (replace); on page mount a value present in the URL takes precedence over auto-preselect; a URL value not among the options MUST still be applied and marked as unlisted.

Both are the Sankey's **own** controls and are **independent** of the Graph view filter bar's `az` / `env` (which are multi-select): changing one side MUST NOT rewrite the other page's URL query.

**Demo mode is exempt from every URL-scope rule in this capability.** When `demoMode` is `true` the page MUST NOT read or write any of `az` / `env` / `ontap_cluster` / `node` / `aggr` / `svm` / `pod` / `cluster` / `namespace` / `mode` in the query, and holds those selections in component state instead (`from` / `to` are still written — they belong to `app-shell`, not to this scope). The reason is the same one that hides the Graph filter bar in demo mode (see `graph-filters`): the view renders a bundled fixture, there is no backend for a scope to narrow, and a URL parameter that changed nothing would claim a scope the drawing does not honour. A deep link carrying these parameters in demo mode is therefore ignored, and stripped on the page's next write of the query.

The selected values MUST be retained across mode switches, resize and theme switches, and restored via the URL after refresh and Back; a restored value that is no longer among the options MUST still be applied and marked as unlisted (the same rule as `graph-filters`), MUST NOT be cleared, and MUST NOT be silently switched to another value — the backend matches on that value; the listing is only an aid.

#### Scenario: No fetch until both are selected

- **WHEN** the user opens bare `/sankey`, `az` has three candidate values and `env` has two
- **THEN** neither is preselected, the view shows the "please choose one az and one env" hint, and the request count to `endpoints.storageGraph` is 0

#### Scenario: A single candidate value is auto-preselected

- **WHEN** the only candidate value of `az` is `local-a` and the only candidate value of `env` is `demo`
- **THEN** both are auto-preselected, the view immediately issues one request whose query string contains `az=local-a&env=demo`, and the address bar is replaced with one containing `az=local-a&env=demo`

#### Scenario: Independent of the Graph filter bar

- **WHEN** the user selects `env: prod` and `env: dev` (two values) in the Graph view's filter bar, then clicks the Sankey link
- **THEN** the Sankey's `env` is decided by the rules of bare `/sankey` (auto-preselected or unselected), unaffected by the Graph side's multiple values, and MUST NOT show an error

#### Scenario: Selection is retained when the option disappears

- **WHEN** `az: zone-b` is selected (URL contains `az=zone-b`) and after a refresh the label values no longer contain `zone-b`
- **THEN** `az` is still `zone-b` and marked as unlisted, the request still carries `az=zone-b`; the user can pick another value from the dropdown

#### Scenario: Deep link carries the estate

- **WHEN** the user opens `/sankey?az=zone-a&env=prod`
- **THEN** both controls show those values, and the view immediately issues one request carrying `az=zone-a&env=prod` without any control being operated

### Requirement: Root selector, starting from either the storage side or the workload side

The view SHALL provide a root control that lets the operator start the search from **either end** of the flow. The supported root kinds match the backend:

| Kind          | Parameter       | Meaning                                                                                                             |
| ------------- | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| ONTAP cluster | `ontap_cluster` | Every controller / aggregate / SVM within that ONTAP cluster                                                        |
| Node          | `node`          | Matches **both NetApp controller names and Kubernetes node names** — a hit on either side makes it that side's root |
| Aggregate     | `aggr`          | One ONTAP aggregate                                                                                                 |
| SVM           | `svm`           | One SVM                                                                                                             |
| Pod           | `pod`           | One pod, with the value in the form `<namespace>/<pod-name>`                                                        |

Every kind may be repeated and mixed. The control MUST state explicitly that `node` matches both kinds of node (operators often do not know which kind the name in hand is), and MUST state explicitly that when both sides are mixed the backend takes the **intersection** (a path must touch both a storage-side root and a workload-side root), not the union.

A `pod` value MUST be validated before sending as containing exactly one `/` with both segments non-empty; when invalid it MUST prompt inline and MUST NOT be sent (the backend would reject the whole request with 400 `invalid_scope`, taking the other valid roots down with it).

The root kind is chosen with the shared dropdown (single-select, custom values not allowed); the root value is free text (there is no listable source). The root selection MUST sync to the URL query with the same parameter names as the backend (`ontap_cluster` / `node` / `aggr` / `svm` / `pod`, repeated keys); on page mount it is read from the URL, and an invalid `pod` value in the URL MUST not be sent and MUST prompt inline.

All roots empty is equivalent to "the complete storage flow of that estate" and MUST be a valid state rather than an error. A root change MUST trigger one refetch. The app MUST NOT further filter the elements returned by the backend by root on the client side — the projection has already been done by the backend, and client-side filtering would break weight conservation.

The view SHALL additionally provide optional `cluster` and `namespace` narrowing controls (multi-select dropdowns, contract see `graph-filters`, options from `endpoints.labelValues`; the selection syncs to the URL's `cluster` / `namespace`), sent as request parameters when non-empty. They MUST NOT filter on the client side — for the same reason as above.

Unlike `az` / `env`, these two narrow an **enumerable set**: when no option can be listed and there is currently no selection, they MUST NOT render (there is nothing to narrow, and the request does not need them anyway).

#### Scenario: Storage-side root

- **WHEN** the user adds root `aggr: aggr1`
- **THEN** the request contains `aggr=aggr1`, the returned body contains only paths flowing through `aggr1`, and the view draws it as-is without filtering further on its own

#### Scenario: Workload-side root

- **WHEN** the user adds root `pod: shop/orders-0`
- **THEN** the request contains `pod=shop%2Forders-0`, and the view draws the full storage chain beneath that pod

#### Scenario: Mixing both sides takes the intersection

- **WHEN** the user adds both `aggr: aggr1` and `pod: shop/orders-0`, and that pod also mounts a claim located on `aggr2`
- **THEN** both roots are sent together; the control's explanatory text states that the two sides are intersected, and the view draws only the path from `aggr1` to that pod (the backend has already done the projection)

#### Scenario: An invalid pod root is not sent

- **WHEN** the user enters pod root `orders-0` (namespace missing)
- **THEN** the control prompts inline that it must be `<namespace>/<pod>`, the value does not enter the request, and the other existing roots keep working normally

#### Scenario: Roots restored from the URL

- **WHEN** the user opens `/sankey?az=zone-a&env=prod&aggr=aggr1&pod=shop%2Forders-0`
- **THEN** the root control lists `aggr: aggr1` and `pod: shop/orders-0`, and the request carries both

#### Scenario: No root is a valid state

- **WHEN** the user clears all roots
- **THEN** the request carries only `start` / `end` / `az` / `env` (plus the optional `cluster` / `namespace`), the view draws that estate's complete storage flow, and no error or hint is shown

### Requirement: Flow chain and tier structure

The Sankey SHALL present six tiers from left to right, in the direction **storage → workload**: `netapp-node` → `netapp-aggr` → `netapp-svm` → `pvc` → `pod` → `node` (Kubernetes node).

Links MUST correspond one-to-one to the `storage-flow` edges in the body; their tier membership MUST be read from the edge's `labels.tier` (`node-aggr` / `aggr-svm` / `svm-pvc` / `pvc-pod` / `pod-node`), and MUST NOT be inferred from the endpoints' kinds:

- The path of a **FlexGroup claim** starts at `svm-pvc` (no `node-aggr` / `aggr-svm`); its SVM has no inbound edge on the aggregate tier — this is a normal shape, MUST NOT be treated as a gap, and MUST NOT have a substitute node synthesized.
- The path of an **unscheduled pod** ends at `pvc-pod` (no `pod-node`); that pod has no outbound edge on the node tier.
- A **no-flow root** (a node the backend materialised but that has no drawn link) MUST still be drawn on its tier as an orphaned node, with "no flow" marked on its label or tooltip; this is a deliberate answer from the backend (a degraded aggregate with no claims, a pod mounting no NetApp claim) and MUST NOT be dropped as a missing value.
  - This covers **two** shapes: a node with no edges at all, and a node that has edges but none of whose edges carries a measurement (see "Missing-value handling"). The latter cannot be decided by "has no edges".
  - The response's wire format **carries no root marker**, so the app MUST decide rootness from **the root selection at the time that request was issued**, with matching rules consistent with the backend: `node` matches the names of both `netapp-node` and Kubernetes `node`, `ontap_cluster` covers every controller / aggregate / SVM under it, `pod` matches `<namespace>/<pod>`; `pvc` is not a root kind, so a claim is never retained on this basis.
  - This decision is used only to **retain** nodes already present in the projection; it MUST NOT be used to remove any node — that would be the forbidden client-side root filtering, which breaks weight conservation. With all roots empty no node is retained on this basis, reverting to the single "no edges at all" shape.

An edge's `source` / `target` MUST resolve by id to nodes actually present in the body; otherwise that edge MUST be ignored. Group or unrelated nodes such as `storage-cluster`, `cluster`, `namespace`, `application`, `controller`, `service`, `switch` MUST NOT appear as Sankey tier nodes; they exist only as `data.parent` (for a future grouped view).

#### Scenario: The fixture derives six tiers

- **WHEN** the Sankey is derived from the storage fixture (`SHOWCASE_STORAGE_GRAPH`) in Both mode
- **THEN** the six tiers are respectively `ontap-prod-01` / `ontap-prod-02`, `aggr1` / `aggr2`, `svm_shop` / `svm_dr`, `data-mongo-0` / `data-mongo-1`, `mongo-0` / `mongo-1`, `node-1` / `node-2`
- **AND** the links fall into five groups by `labels.tier`, and none of `storage-cluster/ontap-prod`, `prod/app/mongodb`, `prod/ctrl/StatefulSet/mongodb` appears as a tier node

#### Scenario: A FlexGroup path starts at the SVM

- **WHEN** the most upstream edge of some path in the body has `labels.tier` `svm-pvc`, and no `aggr-svm` edge points at that SVM
- **THEN** that SVM is drawn on the SVM tier with no inbound edge, its downstream is drawn normally, and the view synthesizes no aggregate or controller node

#### Scenario: An unscheduled pod ends at the pod tier

- **WHEN** some pod has a `pvc-pod` inbound edge but no `pod-node` outbound edge
- **THEN** that pod is drawn on the pod tier with no outbound edge, and no placeholder node appears on the node tier because of it

#### Scenario: A no-flow root is still drawn

- **WHEN** the user uses `aggr: aggr9` as root, and the body contains the `aggr9` node and its controller but no edges at all
- **THEN** both nodes are drawn on their respective tiers, marked as no-flow, and the view MUST NOT show the "no data" empty state

### Requirement: Weights come straight from the backend, with no client-side aggregation or splitting

A link's weight MUST be read directly from that `storage-flow` edge's `data.metrics`, from the direction field matching the current mode (`read_bytes_per_sec` / `write_bytes_per_sec`). The app MUST NOT:

- sum downstream links itself to derive an upstream weight (the backend already guarantees per-tier conservation);
- split a claim's measurement evenly across several pods itself (the backend has already done the split);
- use `read_ops` / `write_ops` / `read_latency_us` / `write_latency_us` / `max_iops` / `max_bytes_per_sec` as link thickness.

For a `pvc-pod` link whose `labels.attribution` is `"split"`, the weight is the **attributed value** after evenly splitting an RWX claim, not a measured value; that link's tooltip MUST mark it as "split estimate". A link lacking that label MUST NOT be marked as an estimate.

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

### Requirement: Missing-value handling (absent ≠ 0)

The derivation MUST distinguish "measurement does not exist" from "measurement is 0":

- An edge lacks the field for the current direction (`read_bytes_per_sec` or `write_bytes_per_sec` does not exist) → no link is drawn for that direction; in Both mode only the direction that exists is drawn.
- An edge lacks both directions (including the whole `metrics` being absent) → that edge yields no link at all. For "no claim on the path has a measurement" the backend simply omits the `metrics` key; this is a path that genuinely exists but has no measurement.
- The value is `0` → a zero-weight link MUST be drawn, at the minimum visible thickness and visually distinguishable from non-zero links (for example dashed or semi-transparent); it MUST NOT be treated as a missing value.
- All of a node's links are excluded and the node is not a root → that node is not drawn. **Root nodes are always drawn** (see "Flow chain and tier structure").
- The above decisions MUST depend only on field presence and numeric value; the app MUST NOT fill a missing value with `0`, `null` or any default.

#### Scenario: An edge with only a read measurement

- **WHEN** some `svm-pvc` edge's `metrics` is `{ read_bytes_per_sec: 262144 }` (no `write_bytes_per_sec`)
- **THEN** Read mode draws a link of weight `262144`; in Write mode that pair has no link; in Both mode there is only the read link, and the tooltip shows no write value (not shown as `0`)

#### Scenario: A zero value is drawn as a zero-weight link

- **WHEN** some edge's `metrics` is `{ read_bytes_per_sec: 0, write_bytes_per_sec: 1048576 }` and the mode is Read
- **THEN** that pair draws one zero-weight link, the tooltip shows `0 B/s`, its visual style is distinguishable from non-zero links, and its source / target nodes are still drawn

#### Scenario: A complete path with no measurement

- **WHEN** the body contains a path with all five segments present but no `metrics` on any segment
- **THEN** that path yields no link; its nodes are not drawn if they are not roots, and if they are roots (matched against the request's root selection) they are presented as no-flow nodes

#### Scenario: A root on a measurement-less path is still drawn

- **WHEN** the user uses `aggr: aggr1` as root, and the body returns the three nodes `ontap-prod-01 → aggr1 → svm_shop` and two edges both lacking `metrics`
- **THEN** `aggr1` is drawn as a no-flow node on the aggregate tier, `ontap-prod-01` and `svm_shop` are not drawn (they are not roots and have no drawn link), and the view MUST NOT show state 3

### Requirement: Empty states

The view MUST distinguish the following states by cause, each presented with different explanatory text, and the mode selector and all selectors MUST remain operable in every state:

1. **Endpoint not configured** — `endpoints.storageGraph` is absent (see `runtime-config`).
2. **Estate not both selected** — `az` or `env` is not yet selected; explains that one of each must be chosen, and states explicitly that no request has been issued yet.
3. **Empty response** — the request succeeded but `elements` has no nodes: explains that the selected estate and roots have no storage flow in this time range, and hints at possible causes (a mistyped root name, no NetApp-backed claim in that estate, the time range falling outside retention).
4. **No measurement in the current direction** — the body has `storage-flow` edges, but none carries a measurement in the current mode's direction (for example, in Read mode every edge has only `write_bytes_per_sec`): explains that the current direction has no measurement and suggests switching mode.

When `demoMode` is `true`, the explanation of state 3 MUST additionally point out that demo fixture data is currently being shown.

#### Scenario: Not-both-selected and empty response are distinguishable

- **WHEN** `az` / `env` are not both selected
- **THEN** the explanation of state 2 is shown, and "no storage flow" is not shown — the two mean entirely different things, and conflating them makes an incomplete selection look like a broken pipeline

#### Scenario: Mistyped root

- **WHEN** the user uses `aggr: typo` as root, and the backend returns 200 with empty `elements`
- **THEN** state 3 is shown, its explanation contains the hint "the root name may not exist", and the root control remains editable

#### Scenario: No measurement in the current direction

- **WHEN** every edge that carries a measurement has only `write_bytes_per_sec`, and the user selects Read mode
- **THEN** state 4 is shown with a hint to switch to Write / Both; after switching to Write the graphic draws normally

### Requirement: Sorting within a tier

Within each tier the nodes SHALL be ordered top to bottom by the node's total flow in the **current mode**, descending; total flow is defined as the sum of the weights of all of that node's drawn links (a single direction in Read / Write mode; read + write in Both mode), and for a node with both inbound and outbound edges the larger of the inbound sum and the outbound sum. A no-flow root node's total flow counts as `0` and MUST sort to the bottom of its tier. On equal total flow, nodes MUST be ordered by `label` lexicographically ascending (compared with `localeCompare`). The sort result MUST be deterministic (the same input always yields the same order).

This summation is used only for **sorting** and MUST NOT replace any link's weight (weights always come from the backend, see "Weights come straight from the backend"). The pod tier is additionally constrained by namespace grouping (see "Namespace grouping color bars and adjacent placement on the pod tier"): group adjacency takes precedence over cross-group flow ordering, and within a group this rule still applies.

#### Scenario: Descending by total flow

- **WHEN** derived from the fixture in Both mode (`aggr1` total flow `6291456`, `aggr2` total flow `311296`)
- **THEN** on the aggregate tier `aggr1` is above `aggr2`; after switching to Write mode (`1048576` vs `49152`) the order is unchanged

#### Scenario: No-flow root sorts to the bottom

- **WHEN** the aggregate tier contains `aggr1` (with flow) and `aggr9` (root, no flow)
- **THEN** `aggr9` is placed below `aggr1`

#### Scenario: Ties sort by label

- **WHEN** two pvcs both have total flow `1048576` in the current mode, with labels `data-b` and `data-a`
- **THEN** `data-a` is placed above `data-b`

### Requirement: Nodes are presented as box cards, with links entering and leaving through slots

Each Sankey node MUST be drawn as a rounded box card rather than a thin rectangle whose height is proportional to its weight. The card's content, top to bottom, is:

- **Title row**: the node's `label`.
- **Divider**: between the title row and the body.
- **Subtitle row**: the node kind; a `pod` additionally shows its `namespace`; a `pvc` and a `netapp-aggr` show `used / capacity` when **both** `usedBytes` and `capacityBytes` of `usage` are present; if either is missing the whole item is omitted, and the app MUST NOT fill in `0`.

Links MUST enter and leave through **slots** on the card's edges: inbound edges attach to the left edge, outbound edges to the right edge; slots on the same side are ordered top to bottom by that link's weight, descending, and on equal weight by the opposite node's `label` lexicographically ascending (`localeCompare`). A slot's height is max(that link's ribbon thickness, a fixed minimum row height), with a fixed gap between slots; the card's height is the height needed by the title and subtitle plus max(total height of the left slot stack, total height of the right slot stack, minimum body height), with each side's slot stack vertically centred within the card body. Because slots have a minimum row height and ribbon thickness does not, the total heights of a node's left and right stacks **need not** be equal — conservation is about ribbon thickness, not slot-stack height.

Node kinds MUST be distinguished by a stroke vocabulary, and the distinction MUST NOT rely on hue alone: `netapp-aggr` and `netapp-node` are not Kubernetes resources and use a **dashed** stroke; `pod` and `pvc` use a **solid** stroke. The `netapp-node` on the rightmost tier is the flow's terminus and MUST be presented as a smaller **leaf card** (title, kind and that node's total inflow in the current mode, with no right-edge slots).

No text inside a box card MUST receive pointer events (`pointer-events: none`): text that takes events would cut off the hover highlight and tooltip of the ribbon beneath it.

#### Scenario: The three rows of a pvc box card

- **WHEN** the user views `data-mongo-0` (whose `usage` is `usedBytes` `700` GB and `capacityBytes` `1` TB)
- **THEN** the card shows the title `data-mongo-0` and a subtitle containing `pvc` and `700 GB / 1 TB`; its inbound edges attach to the left edge and its outbound edges to the right edge

#### Scenario: A card missing usage does not fill in zero

- **WHEN** some `pvc` node has no `usage`, or has only `usedBytes` without `capacityBytes`
- **THEN** that card's subtitle shows only the kind, with no used / capacity item and no `0` shown

#### Scenario: Slot ordering and minimum row height

- **WHEN** some `netapp-aggr` has three inbound edges with weights `5242880`, `0` and `1000`
- **THEN** the left-edge slots top to bottom are `5242880`, `1000`, `0`; although the ribbon thickness of the latter two is far below the minimum row height, their slots each still occupy the minimum row height, and the three ribbons do not overlap

#### Scenario: netapp-node is a leaf card

- **WHEN** the user views `ontap-prod-01`
- **THEN** that node is presented as a leaf card (smaller size, dashed stroke) with only left-edge slots and no right-edge slots

### Requirement: Links are gradient ribbons on a shared scale

The thickness of every link MUST come from **one and the same** scale: the scale is the maximum thickness divided by the maximum weight among all **drawn** links in the current mode, and a link's thickness is max(minimum thickness, weight × scale). In Both mode the read and write families MUST share this one scale — scaling each separately would make their thicknesses incomparable. After a mode switch or a refetch the scale MUST be recomputed from the new maximum.

A ribbon MUST be a **filled area** bounded by cubic Bézier curves (not a constant-width stroked path), anchored at each end to the centre of the source and target slots, and filled with a linear gradient from the source end to the target end; both gradient stops MUST belong to that direction's (read / write) color family so that the direction remains recognisable.

Hover highlighting MUST be done by a style switch driven by a class or CSS `:hover`, and MUST still revert in cases where `mouseleave` does not fire (the pointer leaving the browser window directly, a touch being interrupted, a pan starting): no link MUST ever be stuck in the highlighted style.

#### Scenario: Shared scale

- **WHEN** in Both mode, the maximum weight among all drawn links is `5242880` (a read link)
- **THEN** that link is drawn at the maximum thickness; a write link of weight `1048576` is about one fifth as thick, both converted with the same scale

#### Scenario: Switching mode recomputes the scale

- **WHEN** the user switches from Both to Write, and the maximum weight changes from `5242880` to `1048576`
- **THEN** the scale is recomputed from `1048576`, and that write link is now drawn at the maximum thickness

#### Scenario: Hover does not get stuck highlighted

- **WHEN** the user hovers a ribbon and then moves the pointer straight out of the browser window (without passing over any other element)
- **THEN** that ribbon returns to the un-highlighted style

### Requirement: Value labels on ribbons

Every drawn link MUST label the formatted bytes/sec value for its direction at the midpoint of its ribbon. The label MUST be separated from the ribbon beneath it by a **stroke halo** (the stroke is painted before the fill, in the chart area's background color), and MUST NOT use an opaque backing plate — a plate would punch a gap into the ribbon. In Both mode the read and write ribbons are each labelled separately. When a ribbon's thickness is smaller than the label's font height the label MUST be omitted to avoid overlapping text, and the value MUST still be readable from the link tooltip.

#### Scenario: Both mode labels each ribbon separately

- **WHEN** the user views `data-mongo-0→aggr1` in Both mode
- **THEN** the read ribbon is labelled `5.24 MB/s` and the write ribbon `1.05 MB/s`, both labels have a stroke halo, and the ribbon beneath each label remains continuously visible (no gap from an opaque backing plate)

#### Scenario: Very thin ribbons omit the label

- **WHEN** some link has weight `0` and its ribbon is drawn at the minimum thickness
- **THEN** that ribbon carries no value label; on hover the tooltip still shows `0 B/s`

### Requirement: Column headers

Each of the six tiers MUST carry one header line at the top of its column, left to right `NetApp node`, `NetApp aggregate`, `SVM`, `PVC`, `Pod`, `Node`. Headers MUST be rendered in the secondary foreground color with wider letter spacing, and MUST NOT occupy node layout space (they do not push the box cards). When a tier has no drawn node under the current mode and the current estate / root selection, that column's header MUST NOT be drawn.

#### Scenario: Four column headers

- **WHEN** the Sankey is opened with the fixture in Both mode
- **THEN** the four column headers `Pod`, `PVC`, `NetApp aggregate`, `NetApp node` appear in order from left to right

#### Scenario: An empty tier has no header

- **WHEN** no `pod-mounts-pvc` edge points at any pvc that carries a measurement, so the pod tier has no nodes
- **THEN** the `Pod` column header is not drawn, and the other three lines are drawn as usual

### Requirement: Namespace grouping color bars and adjacent placement on the pod tier

Within the pod tier, pods of the same `namespace` MUST be placed adjacently, and each carries a fixed-width rounded color bar on the left edge of its box card, the same color for the same namespace. The palette MUST assign colors in the **order of first appearance** of the namespace within the tier, cycling once exhausted, and MUST NOT be decided by hashing — with a limited palette, hash collisions are uncontrollable, and two adjacent groups sharing a color hurts readability more than colors being unstable across loads. The palette MUST be distinguishable from the read / write semantic colors. A pod without a `namespace` MUST NOT carry a color bar and is placed after all grouped pods.

The order after grouping MUST still be deterministic: groups are ordered by "the maximum total flow among the group's nodes" descending, ties by namespace name lexicographically ascending; within a group by the rules of "Sorting within a tier". A namespace is not a node on the flow path: it MUST NOT be drawn as a box card and MUST NOT produce any link.

#### Scenario: Same namespace adjacent and same color

- **WHEN** the pod tier contains `mongo-0` and `mongo-1` of `prod` and `redis-0` of `staging`, and `redis-0`'s total flow is higher than both mongos
- **THEN** the `staging` group is placed above the `prod` group; `mongo-0` and `mongo-1` are adjacent with the same left-edge bar color, different from `redis-0`'s bar color

#### Scenario: A pod without a namespace

- **WHEN** some pod has no `namespace`
- **THEN** that pod carries no color bar and is placed after all pods that carry a namespace

#### Scenario: A namespace is not a node

- **WHEN** the pod tier contains two namespaces
- **THEN** the chart has no box card or link representing a namespace; grouping is expressed only through adjacent placement and color bars

### Requirement: Numeric summary outside the chart

**Below** the chart there MUST be a separate numeric summary; these numbers MUST NOT be stuffed into node box cards:

- **Node summary table**: one row per drawn node, with columns tier, `label`, total inflow and total outflow in the current mode; `pvc` / `netapp-aggr` additionally list usage, `netapp-aggr` / `netapp-node` additionally list health. Missing values MUST be presented with a missing-value placeholder, and MUST NOT be shown as `0`, `0 B` or `unknown`.
- **Namespace subtotal table**: one row per namespace on the pod tier, with columns namespace, pod count and total flow in the current mode, ordered by total descending. When the pod tier has no pod carrying a namespace, the whole table MUST NOT be drawn.

Both tables MUST update in step with mode, estate / root selection and storage-graph refresh. When a table is too wide it MUST scroll horizontally inside its own container, and MUST NOT give the page a horizontal scrollbar. While an empty state is shown (see "Empty states"), neither table MUST be drawn.

#### Scenario: Summary tables follow the mode

- **WHEN** the user switches from Both to Write
- **THEN** the node summary table's total inflow / total outflow count only the write direction, and the namespace subtotals change accordingly

#### Scenario: Missing values are not filled with zero

- **WHEN** `ontap-prod-01` has no `usage`
- **THEN** its row's usage column is the missing-value placeholder, not `0` or `0 B`

### Requirement: Labels and tooltips for nodes and links

Every node MUST show its `label`. On hovering a node the tooltip MUST show:

- The node kind and `label`; `pod` / `pvc` additionally show `namespace`; `netapp-aggr` / `netapp-svm` / `netapp-node` additionally show `ontap_cluster`.
- Total inflow and total outflow in bytes/sec for the current mode (in Both mode read / write listed separately).
- `pvc` / `netapp-aggr`: when `usage` is present, show `used_bytes` / `capacity_bytes`; when `usage` or either field is missing, omit the item, and MUST NOT fill in `0`.
- `netapp-aggr` / `netapp-node`: when `health` is present, show it as-is; when missing, omit it, and MUST NOT fill in `unknown` or `degraded`.
- `netapp-node`: when `hardware` is present, show the fields it has (at least `model`); when `perf` is present, show the fields it has (`cpu_busy_pct` / `total_ops` / `total_latency_us` / `total_bytes_per_sec`) marked as raw readings. The app MUST NOT derive a health verdict from `perf`, and MUST NOT color by threshold or add a warning icon — thresholds are model- and estate-specific, and verdicts arrive via `alerts`.
- When any node's `alerts` is present and non-empty, its alerts (name and severity) MUST be shown, and the node marked with the status color.
- A no-flow root node: MUST state explicitly "this node is a selected root with no flow in this time range".

On hovering a link the tooltip MUST show the source `label`, target `label`, tier, direction (read / write) and weight value. An `svm-pvc` link additionally MUST show `max_bytes_per_sec` / `max_iops` informationally when present (marked as QoS ceiling); when missing they are omitted, and MUST NOT be shown as `0` or "unlimited"; when the measurement exceeds the ceiling the app MUST NOT color, warn or change the link's style. Links on other tiers MUST NOT show ceiling or latency fields (the backend does not provide them there). A link whose `labels.attribution` is `"split"` MUST be marked "split estimate".

#### Scenario: Hovering an aggregate node

- **WHEN** the user hovers `aggr1` in Read mode
- **THEN** the tooltip shows `netapp-aggr` / `aggr1` / `ontap_cluster: ontap-prod`, inflow `5.24 MB/s`, outflow `5.24 MB/s`, usage `700 GB / 1 TB`, health `online`

#### Scenario: Hovering a netapp-node shows hardware and performance readings

- **WHEN** the user hovers `ontap-prod-02`, which has `hardware: { model: "AFF-A400" }`, `perf: { cpu_busy_pct: 41.2 }`, `health: "degraded"`
- **THEN** the tooltip shows the model, `cpu_busy_pct` marked as a raw reading, health `degraded`, and no usage item; `cpu_busy_pct` triggers no color or icon change

#### Scenario: Ceiling only on svm-pvc links

- **WHEN** the user hovers the read link of `svm_shop → data-mongo-0`, then hovers the read link of `ontap-prod-01 → aggr1`
- **THEN** the former shows read `5.24 MB/s`, `max_bytes_per_sec` `105 MB/s`, `max_iops` `5000`, with no warning style; the latter shows only tier and weight, with no ceiling or latency items

### Requirement: bytes/sec value formatting

All bytes/sec values (weights, tooltip totals, `max_bytes_per_sec`) MUST be formatted in SI units (base 1000: `B/s`, `KB/s`, `MB/s`, `GB/s`, `TB/s`), by these rules:

- Choose the largest unit such that the scaled value is ≥ 1, and present it with **3 significant digits** (e.g. `5242880` → `5.24 MB/s`; `104857600` → `105 MB/s`; `262144` → `262 KB/s`; `49152` → `49.2 KB/s`).
- The value `0` → `0 B/s`.
- A non-zero value below `1 B/s` MUST be presented in exponential notation with 3 significant digits (e.g. `3.86e-7` → `3.86e-7 B/s`), and MUST NOT be shown as `0 B/s` or `0.00 B/s`.
- Formatting MUST NOT use fixed-decimal truncation (such as `toFixed(2)`) on values of arbitrary magnitude.

`used_bytes` / `capacity_bytes` and `total_bytes_per_sec` MUST be formatted by the same SI rule (the former without the `/s` suffix).

This ladder MUST **share one implementation** with the Graph view's `usage` / throughput rows (`shared/format/measurements`); a separate copy must not be built inside this feature: the same tooltip renders a link's rate and a node's `usage` at the same time, and two ladders whose unit spellings differ (`kB` versus `KB`) would show up together on two adjacent rows.

#### Scenario: Ordinary magnitudes

- **WHEN** formatting `5242880`, `104857600`, `49152`
- **THEN** the results are `5.24 MB/s`, `105 MB/s`, `49.2 KB/s` respectively

#### Scenario: Tiny values and zero

- **WHEN** formatting `3.86e-7` and `0`
- **THEN** the results are `3.86e-7 B/s` and `0 B/s` respectively; the former MUST NOT be truncated to zero

#### Scenario: Tooltip clamped within the window

- **WHEN** the user hovers a node at the far right or bottom edge of the view area
- **THEN** the tooltip is fully visible without overflowing the window, and the page shows no scrollbar

### Requirement: Hover highlights the path

On hovering a node, the view MUST highlight all links on every path passing through that node — that is, the union of all links reachable by walking back along inbound edges (upstream, toward the storage side) and all links reachable by walking along outbound edges (downstream, toward the workload side) — and fade the remaining links and nodes; in Both mode links of both the read and write directions are included. A link not on any path passing through that node (for example the outbound edges of other aggregates under the same controller) MUST NOT be highlighted. After the mouse leaves, everything MUST revert to normal display. Hover highlighting MUST only change styles and MUST NOT trigger a re-layout.

#### Scenario: Hovering a pvc highlights upstream and downstream

- **WHEN** the user hovers `data-mongo-0` in Both mode
- **THEN** the read and write links of `ontap-prod-01→aggr1`, `aggr1→svm_shop`, `svm_shop→data-mongo-0`, `data-mongo-0→mongo-0`, `mongo-0→node-1` are all highlighted; the path on the `aggr2` side is faded

#### Scenario: Side branches are not highlighted

- **WHEN** two aggregates (`aggrA`, `aggrB`) belong to the same controller, and the user hovers `aggrA`
- **THEN** `ontap-node→aggrA` and all outbound edges of `aggrA` are highlighted; `ontap-node→aggrB` and the outbound edges of `aggrB` are faded

#### Scenario: Reverts after leaving

- **WHEN** the user moves the mouse off any node
- **THEN** all links and nodes revert to the un-faded state, and the layout coordinates are exactly the same as before the hover

### Requirement: Clicking a node Locates across views

Clicking a Sankey node MUST push-navigate to bare `/graph` (the Graph page mounts with its initial scope and fetches), passing the target node id to the Graph page via router navigation state (**not in the URL**); the Graph page MUST, after its **first successful load**, run Locate on the node with that id (semantics as **Locate** in CONTEXT.md): expand its chain of collapsed ancestor containers, select the node, fit the viewport to its closed neighborhood, and clear the search input. The target is retained until the first successful load; if the first load fails the page presents its error state, and when a subsequent manual reload succeeds it MUST still run that Locate. Locate is a one-off action: refreshing `/graph` MUST NOT run it again. The Sankey itself MUST NOT hold persisted selection state — returning to the Sankey via Back remounts the page with no node in the selected state.

Because the two views come from **two endpoints**, a node in the Sankey is not guaranteed to exist in the Graph page's body (the Graph page mounts with the default projection `prune=true` and no filters — the traffic graph keeps only pods on connectivity edges; or that node type is simply not emitted by `/v1/graph`). The view MUST give a recognisable hint according to the cause, and in no case MUST it silently rewrite the `prune` setting:

- The node **does not exist** in the Graph view's current data → hint that the node is not in the current graph query result, and point out the possible causes (filters or a different `prune`); MUST NOT be shown as an error.
- A `netapp-svm` node **has no corresponding graph node** (`/v1/graph` does not emit that type) → nodes on that tier MUST NOT offer the Locate interaction (not presented as clickable), rather than reporting failure only after a click.

#### Scenario: Clicking an aggregate Locates into the Graph view

- **WHEN** the user clicks `aggr1` in the Sankey, and that node exists in the Graph view's current data
- **THEN** the app push-navigates to `/graph` (query containing only `from` / `to`); after the Graph page finishes loading, `netapp/ontap-prod/aggr/aggr1` becomes the selected node, its collapsed ancestors are expanded, the viewport fits its closed neighborhood, and the search input is empty

#### Scenario: Target not in the graph query result

- **WHEN** some pod sits on no connectivity edge and is therefore not in the `prune=true` body, and the user clicks that pod in the Sankey
- **THEN** the app navigates to `/graph`; after loading it hints that the node is not in the current query result, possibly because the Projection is Traffic graph; `prune` and the filters stay at their defaults, and the user can change the projection themselves

#### Scenario: Refresh does not repeat Locate

- **WHEN** the user refreshes after Locating into `/graph`
- **THEN** the Graph page loads normally, no node is selected, and the viewport is the initial fit

#### Scenario: SVM nodes offer no Locate

- **WHEN** the user moves the cursor over any `netapp-svm` node
- **THEN** that node is not presented as clickable (no pointer cursor, no click effect), and the tooltip shows normally

#### Scenario: Returning to the Sankey has no selection

- **WHEN** the user presses Back to return to the Sankey after a Locate
- **THEN** the Sankey page remounts, restores estate / roots / mode from the URL and fetches; no node shows the selected style

### Requirement: Theme support and distinguishable read / write colors

The Sankey view MUST read the app shell's theme tokens and render correctly in both the dark and light themes (background, nodes, links, text, tooltip and legend all use theme tokens; colors must not be hardcoded); on a theme switch it MUST redraw immediately without losing mode / hover state, and MUST NOT refetch. The read and write link colors MUST be distinguishable in both themes, and the distinction MUST NOT rely on hue alone: the two MUST also be distinguished by a lightness difference or a fill pattern, and explained by the legend's text labels.

#### Scenario: Theme switch

- **WHEN** the user switches the theme from dark to light while in the Sankey view (Write mode, mid-hover)
- **THEN** the chart redraws with the light theme tokens, the mode selector is still Write, the hover highlight state is preserved, and no request is issued

#### Scenario: read / write not by hue alone

- **WHEN** viewing the legend and links in Both mode
- **THEN** read and write differ by a lightness difference or a fill pattern in addition to hue, and the legend labels read / write in text

#### Scenario: New visual elements redraw with the theme

- **WHEN** the user switches the theme while in the Sankey view
- **THEN** the box cards, column headers, ribbon gradients, the stroke halos of the value labels, the namespace color bars and the zoom control bar all switch to the new theme's tokens, with no hardcoded color left behind

### Requirement: Sizing and container resize

The Sankey's SVG MUST fill the view area the app shell provides (both width and height follow the container), and MUST carry **no `viewBox`**: one SVG user unit is one CSS pixel, so the `<g>` viewport transform below is the only thing that scales the diagram. A `viewBox` of the layout's intrinsic size would map the content onto the element a _second_ time, and the two mappings compose — the transform would draw at its own scale times the viewBox factor, squaring "fit to window" (2096x442 of content in a 756px-wide area draws at 13% while the readout says 36%), shortening every pan by that factor, and pulling wheel zoom off the pointer. Fitting belongs to the transform alone; that is what makes the pixel-space contract of the zoom / pan requirements below true.

A container size change MUST NOT trigger a re-layout: the intrinsic coordinates of nodes and links MUST stay unchanged, and the viewport MUST be preserved rather than refitted; during it the app MUST NOT lose the hover highlight state, the mode selector value, the `az` / `env` / root / `cluster` / `namespace` selections or the current zoom / pan viewport. The content does not produce horizontal scrolling outside the view area because of a size change.

**All** nodes (including the orphaned cards of no-flow roots) MUST fall within the intrinsic coordinate frame computed by the layout: no-flow nodes hang below the flow chart of the same tier, and the layout MUST count them into the intrinsic height, otherwise "fit to window" cannot fit them — it scales by that intrinsic size, and a node outside the frame is indistinguishable from "the backend did not return that node".

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

The initial viewport MUST be "fit to window but not enlarged beyond 1:1": when the chart is larger than the view area, shrink until the whole chart is visible; when smaller, keep the original size and centre it. Mode switches, estate / root selection changes, theme switches, container resize and storage-graph refresh MUST preserve the current viewport. The viewport MUST NOT be written to the URL (the query carries only estate / roots / narrowing / mode and the time range), and MUST NOT be persisted; after the page remounts it MUST return to the initial viewport.

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

### Requirement: Focus mode

Focus mode MUST collapse the app shell's top nav bar and the Sankey's own controls (mode selector, estate / root selector row, legend and the summary tables outside the chart), so that the chart area fills the whole window. `Esc` or activating the control bar's focus button again MUST leave it. Entering and leaving MUST preserve the zoom / pan viewport, mode, estate / root selection and hover state. Focus mode MUST be transient view state: it MUST NOT be written to the URL and MUST NOT be persisted; after navigating away from the Sankey view or a full refresh it MUST return to inactive.

#### Scenario: Entering and leaving focus mode preserves the viewport

- **WHEN** the user zooms to 180%, presses `F`, then presses `Esc`
- **THEN** on entering, the nav bar and controls collapse and the chart fills the window; after leaving, both are restored and the zoom factor is still 180%

#### Scenario: Leaving the route ends focus mode

- **WHEN** the user, while in focus mode, presses the browser's Back to leave `/sankey`, then returns with Forward
- **THEN** the Sankey page remounts: focus mode is inactive, the nav bar is visible, the viewport is the initial one; the estate / roots / mode carried by the URL are restored

### Requirement: In-place update on refresh

When the storage-graph data updates because of a refresh (manual or automatic), the Sankey MUST re-derive and update the chart in place (add / remove nodes and links, update weights), and MUST NOT reset to the initial state; the values of the mode selector and all selectors MUST be retained. The tooltip and hover highlight of a node that has disappeared MUST be cleared; the hover highlight of a node that still exists MUST be recomputed against the new topology. During a refresh and after a failed refresh, the previously successfully drawn chart MUST stay visible (see the refresh semantics of `graph-data-source`).

#### Scenario: Weight update

- **WHEN** in Write mode, after a refresh the `write_bytes_per_sec` of `svm_shop → data-mongo-0` changes from `1048576` to `2097152`
- **THEN** that link and its upstream `aggr1 → svm_shop`, `ontap-prod-01 → aggr1` update their weights to **the values given by the new response** (not derived by client-side summing), and the mode selector is still Write

#### Scenario: Nodes appear and disappear

- **WHEN** after a refresh a new complete path is added while the path of `data-mongo-1` disappears
- **THEN** the new path's nodes appear on their tiers; `data-mongo-1`, `mongo-1` and the nodes serving only it disappear; if `data-mongo-1` was being hovered at the time, the tooltip closes with no residual highlight

#### Scenario: A failed refresh keeps the existing chart

- **WHEN** an auto-refresh storage-graph request responds with HTTP 500
- **THEN** the existing chart stays visible, the status indicator shows the error, and the view MUST NOT be cleared to an empty state

### Requirement: Fully independent of the Graph view's controls

The Sankey's data MUST be fully independent of the Graph view's kind / edge-type filters, ingress visibility toggle, search query, pod-parent mode, collapse state, `prune` setting, and the filter bar's multi-value `cluster` / `az` / `env` / `namespace` selections — any change to those MUST NOT change the Sankey's nodes, links or weights, and MUST NOT trigger a storage-graph refetch.

The reverse also holds: changes to the Sankey's `az` / `env` / roots / `cluster` / `namespace` / mode are written only to the `/sankey` query, MUST NOT rewrite the `/graph` query, and MUST NOT make the Graph page carry the Sankey's selections on its next mount.

The only input the two pages share is the **view time range** (see `app-shell`; passed via the URL and the browser-local saved value): a change to it MUST make the current page refetch, and the other page uses the new `start` / `end` on its next mount.

#### Scenario: Graph view controls do not affect the Sankey

- **WHEN** the user, on `/graph`, hides the `pvc` kind, enters the search `nats`, switches the pod-parent mode to `node`, switches the Projection to `Full inventory`, then presses Back to return to `/sankey?az=zone-a&env=prod`
- **THEN** the storage-graph request's query string is the same as before (without `prune` / `edge_type` / the Graph's filters), and the Sankey's nodes, links and weights are the same as before

#### Scenario: Sankey controls do not affect the Graph view

- **WHEN** the user, on `/sankey`, adds root `aggr: aggr1` and changes `env`, then clicks the Graph link in the nav bar
- **THEN** the address bar is `/graph` (with only `from` / `to` filled in), the filter bar has nothing selected, and the graph request contains no `aggr` / `az` / `env`

### Requirement: Performance bounds

The following bounds MUST hold on developer-machine / CI-grade hardware as used by the e2e test suite:

- For a synthetic body containing 3000 `storage-flow` edges (500 pvcs, 1000 pods, 25 aggregates, 10 SVMs, 5 controllers, 50 Kubernetes nodes, every edge carrying both `read_bytes_per_sec` and `write_bytes_per_sec`), the time from obtaining the normalized result to the Sankey's first completed draw (Both mode) MUST be within **1000 ms**.
- The redraw after a mode switch MUST be within 500 ms.
- Hover and leave MUST only update styles, MUST NOT trigger a layout recomputation (verified by a layout function call count of 0), and the style update MUST complete within one animation frame.
- Zoom and pan MUST only update the `transform` of the single `<g>`, MUST NOT trigger a layout recomputation (likewise verified by a layout function call count of 0), and each update MUST complete within one animation frame.

#### Scenario: First draw of 3000 storage-flow edges

- **WHEN** the Sankey view is opened with the synthetic body above
- **THEN** the elapsed time from data availability to the chart's first completed draw is ≤ 1000 ms, and the node counts of the six tiers are respectively 5 / 25 / 10 / 500 / 1000 / 50

#### Scenario: Hover does not recompute the layout

- **WHEN** 100 different nodes are hovered and left in succession on the synthetic body above
- **THEN** the layout function is called 0 times, each hover's style update completes within one animation frame, and the node coordinates stay unchanged throughout

#### Scenario: Zoom and pan do not recompute the layout

- **WHEN** zoom and pan are performed 100 times in succession on the synthetic graph above
- **THEN** the layout function is called 0 times, each update completes within one animation frame, and the nodes' intrinsic coordinates stay unchanged throughout
