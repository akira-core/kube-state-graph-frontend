## Purpose

`storage-flow-sankey` defines the behavioural contract of the Sankey storage-flow view. This view's data comes from **its own backend endpoint** `GET /v1/storage-graph` (`endpoints.storageGraph` in the runtime config), which is a fetch path independent of the Graph view's `GET /v1/graph`; the rules of fetching itself are specified by `graph-data-source`, and this capability specifies the view behaviour: the estate selectors (`az` / `env` / root / `cluster` / `namespace` — presented with the dropdown contract of `graph-filters`, and synced to the URL query together with mode), the presentation of the five backend tiers and the two derived columns (`application` / `namespace`, walked up `data.parent`), the `Flat` / `Node` layout switch (a Kubernetes node is a wrapper around its pods, never a column), drawing with the backend-summed `storage-flow` weights, the read / write split, missing-value handling (absent ≠ 0), sorting, tooltips, hover highlighting, cross-view Locate, theme, sizing, refresh and performance bounds. This capability does not decide the drawing framework (settled in design); it only specifies observable behaviour.

**Why it is no longer derived from `/v1/graph`.** The early design had the Sankey and the Graph share one copy of `/v1/graph` data, with the frontend walking the chain along `pod → pvc → netapp-aggr`, summing the aggregate's inbound edges itself, and splitting an RWX claim's measurement evenly across the pods that mount it. The backend's storage-graph endpoint makes that path both invalid and unnecessary: it adds a `netapp-svm` tier (`/v1/graph` has no such node type), adds a Kubernetes node tier, offers root search starting from either the storage side or the workload side, and guarantees that weights are **conserved per tier** — none of these can be derived from the body of `/v1/graph`, and a frontend summing on its own would only produce a set of numbers that disagree with the backend and cannot be reconciled.

## Requirements

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

The view SHALL provide two **single-select dropdown** controls, `az` and `env` (contract: see "Interaction contract of the dropdown control" in `graph-filters`; custom values allowed), whose options come from `endpoints.labelValues` (the same source as the Graph view's filter bar, see `graph-data-source`). They edit the **draft** (see `explicit-query`). Each MUST send exactly one value: the backend rejects a missing value with 400 `missing_az` / `missing_env` and a repeated value with 400 `invalid_scope`, therefore:

- Until **both are selected** (and at least one root is present, see "Root selector"), Query MUST be unavailable and the view MUST NOT issue any storage-graph request, showing a hint explaining that one `az`, one `env` and at least one root must each be chosen; every control MUST remain operable at this point.
- `endpoints.labelValues` and `endpoints.storageGraph` are each independently optional, so the options may be **entirely unlistable**. In that case both controls MUST still render and MUST still accept a custom value (with zero options the dropdown holds only the search input and the "use "<text>"" row); they MUST NOT disappear or become an empty, unselectable dropdown — the backend requires these two values, and a dropdown that lists no options would leave the hint pointing at a control that cannot be selected, making the view permanently unable to fetch.
- When a dimension has **exactly one** option, the view SHALL auto-preselect that value into the draft (there is no choice to make on that dimension, and requiring a manual click is just friction). With zero or two-or-more options it MUST NOT auto-select. Auto-preselection edits the draft only and MUST NOT issue a request.
- The app MUST NOT pick one of several candidate values on its own, and MUST NOT send an empty value.
- The applied value MUST sync to the `az` / `env` URL query (replace, written by the Query commit); on page mount a value present in the URL seeds the draft and takes precedence over auto-preselect; a URL value not among the options MUST still be applied to the draft and marked as unlisted.

Both are the Sankey's **own** controls and are **independent** of the Graph view filter bar's `az` / `env` (which are multi-select): changing one side MUST NOT rewrite the other page's URL query.

**Demo mode is exempt from every URL-scope rule in this capability.** When `demoMode` is `true` the page MUST NOT read or write any of `az` / `env` / `ontap_cluster` / `node` / `aggr` / `svm` / `pod` / `cluster` / `namespace` / `mode` / `top_pods` in the query, and holds those selections in component state instead (`from` / `to` are still written — they belong to `app-shell`, not to this scope). The reason is the same one that hides the Graph filter bar in demo mode (see `graph-filters`): the view renders a bundled fixture, there is no backend for a scope to narrow, and a URL parameter that changed nothing would claim a scope the drawing does not honour. A deep link carrying these parameters in demo mode is therefore ignored, and stripped on the page's next write of the query.

The selected values MUST be retained across mode switches, resize and theme switches, and restored via the URL after refresh and Back; a restored value that is no longer among the options MUST still be applied and marked as unlisted (the same rule as `graph-filters`), MUST NOT be cleared, and MUST NOT be silently switched to another value — the backend matches on that value; the listing is only an aid.

#### Scenario: No fetch until both are selected

- **WHEN** the user opens bare `/sankey`, `az` has three candidate values and `env` has two
- **THEN** neither is preselected, the view shows the hint naming `az`, `env` and a root, Query is unavailable, and the request count to `endpoints.storageGraph` is 0

#### Scenario: A single candidate value is auto-preselected

- **WHEN** the only candidate value of `az` is `local-a` and the only candidate value of `env` is `demo`
- **THEN** both controls show those values, no request is issued and the address bar is unchanged; after the user adds a root and activates Query, exactly one request is issued whose query string contains `az=local-a&env=demo`, and the address bar is replaced with one containing `az=local-a&env=demo`

#### Scenario: Independent of the Graph filter bar

- **WHEN** the user selects `env: prod` and `env: dev` (two values) in the Graph view's filter bar, then clicks the Sankey link
- **THEN** the Sankey's `env` is decided by the rules of bare `/sankey` (auto-preselected or unselected), unaffected by the Graph side's multiple values, and MUST NOT show an error

#### Scenario: Selection is retained when the option disappears

- **WHEN** `az: zone-b` is selected (URL contains `az=zone-b`) and after a refresh the label values no longer contain `zone-b`
- **THEN** `az` is still `zone-b` and marked as unlisted, and the request Query then sends still carries `az=zone-b`; the user can pick another value from the dropdown

#### Scenario: Deep link carries the estate

- **WHEN** the user opens `/sankey?az=zone-a&env=prod&aggr=aggr1`
- **THEN** both controls show those values and the root is listed, no request is issued, and activating Query issues exactly one request carrying `az=zone-a&env=prod&aggr=aggr1`

### Requirement: Root selector, starting from either the storage side or the workload side

The view SHALL provide a root control that lets the operator start the search from **either end** of the flow, and at least one root is **required**: a whole-estate storage flow is exactly the body that stalls a browser on a large cluster, so Query MUST be unavailable while the draft holds no root, with text stating that a root is required. The supported root kinds match the backend:

| Kind          | Parameter       | Meaning                                                                                                             |
| ------------- | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| ONTAP cluster | `ontap_cluster` | Every controller / aggregate / SVM within that ONTAP cluster                                                        |
| Node          | `node`          | Matches **both NetApp controller names and Kubernetes node names** — a hit on either side makes it that side's root |
| Aggregate     | `aggr`          | One ONTAP aggregate                                                                                                 |
| SVM           | `svm`           | One SVM                                                                                                             |
| Pod           | `pod`           | One pod, with the value in the form `<namespace>/<pod-name>`                                                        |

Every kind may be repeated and mixed. When both sides are mixed the backend takes the **intersection** (a path must touch both a storage-side root and a workload-side root), not the union. The scope bar MUST NOT restate either rule — `node` matching both kinds of node, or the intersection — as standing prose under its controls: they are properties of the backend's projection, documented with the root kinds, and a paragraph under every scope bar spends a line of every session on something read once.

A `pod` value MUST be validated before being added as containing exactly one `/` with both segments non-empty; when invalid it MUST prompt inline, MUST NOT be added, and MUST NOT be sent (the backend would reject the whole request with 400 `invalid_scope`, taking the other valid roots down with it).

The root kind is chosen with the shared dropdown (single-select, custom values not allowed). The root values are chosen with that **same** dropdown in **multi-select** form (custom values allowed, no `All` row, its empty text inviting a pick), and its checked values **are** the draft's roots of the selected kind: checking a value adds it as a root pill of that kind at once, unchecking it — or removing its pill — takes it out, and there is no separate Add step, because the draft is already the staging area Query commits. Changing the root kind shows that kind's roots as the checked values and leaves every other kind's roots in the draft. Adding, removing or clearing roots edits the draft only and MUST NOT issue a request (see `explicit-query`).

The values offered MUST be per kind, from the sources that can answer **before anything is drawn** — a required root can no longer wait for a body:

- `node`: the Kubernetes node names enumerated from `endpoints.labelValues` (the `node` label of `kube_pod_info`, see `graph-filters`), plus the NetApp controller names of the drawn body when one is drawn.
- `pod`: `<namespace>/<pod>` enumerated from `endpoints.labelValues` for each namespace the `namespace` narrowing names, plus the drawn body's pods that carry a namespace; with no namespace narrowing selected the list is empty and explains that a namespace must be selected to list pods, or a value typed. A pod carrying no namespace MUST NOT be offered at all, since a bare name is a 400 rather than a narrower graph.
- `ontap_cluster` / `aggr` / `svm`: the drawn body when one is drawn (`ontap_cluster` from the NetApp nodes' `ontap_cluster` label, the others from those kinds' names); with nothing drawn the list is empty and explains that these names are typed until a query has drawn them — `endpoints.labelValues` reaches only the store holding `kube_pod_info`, which carries none of the NetApp label names.

A value belonging to another kind, committed here, is a silently empty graph rather than an error, which is why the list is per kind. Once a root is applied the backend answers with that projection only, so the body's contribution NARROWS to it: the control MUST keep accepting a typed custom value, because the body is a projection and never the authority on what exists. Failure of a label-values request follows `graph-filters`: the list is empty, the source indicator reports it, and a typed value still works.

The root value control MUST carry its own label of the same rank as every other control's, so the whole scope bar is ONE row of label-over-control columns on a shared baseline — `AZ`, `Env`, `Root kind`, `Root value` and `Top pods` — closed by the Query action (see `explicit-query`), the same shape as the Graph view's filter bar. The root controls MUST NOT be nested inside a group with a heading of its own: a second label rank in a row that reads as one throws every control in the bar out of alignment. Added roots, the inline pod-root error and the "root required" text MUST sit BELOW that row, so a growing list of roots can never reflow the controls. The applied roots MUST sync to the URL query with the same parameter names as the backend (`ontap_cluster` / `node` / `aggr` / `svm` / `pod`, repeated keys), written by the Query commit; on page mount they are read from the URL into the draft, and an invalid `pod` value in the URL MUST NOT be added and MUST prompt inline.

The app MUST NOT further filter the elements returned by the backend by root on the client side — the projection has already been done by the backend, and client-side filtering by root would break weight conservation (the Top pods cut is the one sanctioned client-side narrowing, see "Top pods projection").

The view SHALL additionally provide optional `cluster` and `namespace` narrowing controls (multi-select dropdowns, contract see `graph-filters`, options from `endpoints.labelValues`; the applied selection syncs to the URL's `cluster` / `namespace` on commit), sent as request parameters when non-empty. They MUST NOT filter on the client side — for the same reason as above. The `namespace` narrowing doubles as the scope of the `pod` root candidates.

Unlike `az` / `env`, these two narrow an **enumerable set**: when no option can be listed and there is currently no selection, they MUST NOT render (there is nothing to narrow, and the request does not need them anyway).

#### Scenario: One row, one baseline

- **WHEN** the user views the scope bar
- **THEN** `AZ`, `Env`, `Root kind`, `Root value` and `Top pods` are in the same row with their labels on one baseline, closed by the Query button with no label of its own; no control sits under a group heading of its own, and adding a root puts its removable pill on a row below rather than between the controls

#### Scenario: No root is a valid state

- **WHEN** `az` and `env` are selected and the user clears all roots
- **THEN** no error is shown and every control stays operable — an empty root list is a valid **draft** — but Query is unavailable, the text below the row states that at least one root is required, and the request count to `endpoints.storageGraph` is 0

#### Scenario: The root value dropdown offers what is drawn, per kind

- **WHEN** nothing has been drawn yet, `endpoints.labelValues` reports nodes `worker-0` / `worker-1`, and the operator selects the root kind `Node`
- **THEN** the root value dropdown lists `worker-0` and `worker-1`; switching the kind to `Aggregate` lists nothing and checks nothing, explains that aggregate names are typed until a query has drawn them, and still offers the custom-value row for a typed `aggr1`

#### Scenario: Pod candidates follow the namespace narrowing

- **WHEN** the operator selects namespace `shop` in the narrowing and the root kind `Pod`, and the label-values store lists pods `orders-0` and `catalog-0` in `shop`
- **THEN** the root value dropdown lists `shop/orders-0` and `shop/catalog-0`; with the namespace narrowing cleared the list is empty and explains that a namespace must be selected to list pods

#### Scenario: Checking values adds roots at once

- **WHEN** after a committed query the body holds aggregates `aggr1` / `aggr2` / `aggr3`, the root kind is `Aggregate`, and the operator checks `aggr1` and `aggr2` in the root value dropdown
- **THEN** two root pills `aggr: aggr1` and `aggr: aggr2` appear below the row at once, with no Add step, no request is issued, and the Query control indicates a pending draft; unchecking `aggr1` removes its pill

#### Scenario: Each kind shows its own roots as checked

- **WHEN** the draft holds root `aggr: aggr1` and the operator switches the root kind to `SVM`, then back to `Aggregate`
- **THEN** under `SVM` the root value control checks nothing while the `aggr: aggr1` pill stays below the row; back under `Aggregate`, `aggr1` is checked again

#### Scenario: A name the current projection omits is still reachable

- **WHEN** the operator knows of `aggr9`, which no source lists, and types it into the root value dropdown
- **THEN** the custom-value row offers it, taking it adds root `aggr: aggr9`, and the request Query then sends carries `aggr=aggr9`

#### Scenario: Storage-side root

- **WHEN** the user adds root `aggr: aggr1` and activates Query
- **THEN** the request contains `aggr=aggr1`, the returned body contains only paths flowing through `aggr1`, and the view draws it as-is (subject only to the Top pods cut) without filtering further by root

#### Scenario: Workload-side root

- **WHEN** the user adds root `pod: shop/orders-0` and activates Query
- **THEN** the request contains `pod=shop%2Forders-0`, and the view draws the full storage chain beneath that pod

#### Scenario: Mixing both sides takes the intersection

- **WHEN** the user adds both `aggr: aggr1` and `pod: shop/orders-0` and activates Query, and that pod also mounts a claim located on `aggr2`
- **THEN** both roots are sent together, and the view draws only the path from `aggr1` to that pod (the backend has already done the projection); the scope bar carries no prose explaining the intersection

#### Scenario: An invalid pod root is not sent

- **WHEN** the user enters pod root `orders-0` (namespace missing)
- **THEN** the control prompts inline that it must be `<namespace>/<pod>`, no pill is added, and the other existing roots are unaffected

#### Scenario: Roots restored from the URL

- **WHEN** the user opens `/sankey?az=zone-a&env=prod&aggr=aggr1&pod=shop%2Forders-0`
- **THEN** the root control lists `aggr: aggr1` and `pod: shop/orders-0`, no request is issued, and the request Query then sends carries both

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
2. **Scope incomplete** — `az`, `env` or a root is missing from the draft; explains that one of each and at least one root must be chosen, and states explicitly that no request has been issued yet.
3. **Awaiting Query** — the draft is complete but nothing has been committed on this mount (see `explicit-query`): states that nothing has been requested yet and points at the Query control.
4. **Cancelled** — the only request of this mount was cancelled and no data is held: says so, and points at Query.
5. **Empty response** — the request succeeded but `elements` has no nodes: explains that the selected estate and roots have no storage flow in this time range, and hints at possible causes (a mistyped root name, no NetApp-backed claim in that estate, the time range falling outside retention).
6. **No measurement in the current direction** — the body has `storage-flow` edges, but none carries a measurement in the current mode's direction (for example, in Read mode every edge has only `write_bytes_per_sec`): explains that the current direction has no measurement and suggests switching mode.

When `demoMode` is `true`, the explanation of state 5 MUST additionally point out that demo fixture data is currently being shown.

#### Scenario: Not-both-selected and empty response are distinguishable

- **WHEN** `az` / `env` / root are not all present
- **THEN** the explanation of state 2 is shown, and "no storage flow" is not shown — the two mean entirely different things, and conflating them makes an incomplete selection look like a broken pipeline

#### Scenario: A complete deep link awaits Query

- **WHEN** the user opens `/sankey?az=zone-a&env=prod&aggr=aggr1`
- **THEN** the explanation of state 3 is shown, naming the Query control, and no request has been issued

#### Scenario: Mistyped root

- **WHEN** the user commits `aggr: typo` as root, and the backend returns 200 with empty `elements`
- **THEN** state 5 is shown, its explanation contains the hint "the root name may not exist", and the root control remains editable

#### Scenario: No measurement in the current direction

- **WHEN** every edge that carries a measurement has only `write_bytes_per_sec`, and the user selects Read mode
- **THEN** state 6 is shown with a hint to switch to Write / Both; after switching to Write the graphic draws normally

### Requirement: Sorting within a tier

Within each tier the nodes SHALL be ordered top to bottom by the node's total flow in the **current mode**, descending; total flow is defined as the sum of the weights of all of that node's drawn links (a single direction in Read / Write mode; read + write in Both mode), and for a node with both inbound and outbound edges the larger of the inbound sum and the outbound sum. A no-flow root node's total flow counts as `0` and MUST sort to the bottom of its tier. On equal total flow, nodes MUST be ordered by `label` lexicographically ascending (compared with `localeCompare`). The sort result MUST be deterministic (the same input always yields the same order).

This summation is used only for **sorting** and MUST NOT replace any link's weight (weights always come from the backend, see "Weights come straight from the backend"). The pod tier is additionally constrained by namespace grouping (see "Namespace grouping color bars and adjacent placement on the pod tier"): group adjacency takes precedence over cross-group flow ordering, and within a group this rule still applies. The derived `application` / `namespace` columns follow this rule with total flow defined over their derived links. Under the `Node` layout the pod column is partitioned into wrappers first, ordered by node name (see "Layout switch: flat and node grouping"); this rule then applies within each wrapper and among the unwrapped pods below them.

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

### Requirement: Value labels on ribbons

Every drawn link MUST label the formatted bytes/sec value for its direction at the midpoint of its ribbon. The label MUST be separated from the ribbon beneath it by a **stroke halo** (the stroke is painted before the fill, in the chart area's background color), and MUST NOT use an opaque backing plate — a plate would punch a gap into the ribbon. In Both mode the read and write ribbons are each labelled separately. When a ribbon's thickness is smaller than the label's font height the label MUST be omitted to avoid overlapping text, and the value MUST still be readable from the link tooltip.

#### Scenario: Both mode labels each ribbon separately

- **WHEN** the user views `data-mongo-0→aggr1` in Both mode
- **THEN** the read ribbon is labelled `5.24 MB/s` and the write ribbon `1.05 MB/s`, both labels have a stroke halo, and the ribbon beneath each label remains continuously visible (no gap from an opaque backing plate)

#### Scenario: Very thin ribbons omit the label

- **WHEN** some link has weight `0` and its ribbon is drawn at the minimum thickness
- **THEN** that ribbon carries no value label; on hover the tooltip still shows `0 B/s`

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

### Requirement: Namespace grouping color bars and adjacent placement on the pod tier

Within the pod tier, pods of the same `namespace` MUST be placed adjacently, and each carries a fixed-width rounded color bar on the left edge of its box card, the same color for the same namespace. The palette MUST assign colors in the **order of first appearance** of the namespace within the tier, cycling once exhausted, and MUST NOT be decided by hashing — with a limited palette, hash collisions are uncontrollable, and two adjacent groups sharing a color hurts readability more than colors being unstable across loads. The palette MUST be distinguishable from the read / write semantic colors. A pod without a `namespace` MUST NOT carry a color bar and is placed after all grouped pods.

The order after grouping MUST still be deterministic: groups are ordered by "the maximum total flow among the group's nodes" descending, ties by namespace name lexicographically ascending; within a group by the rules of "Sorting within a tier". Under the `Node` layout adjacency applies **within each wrapper** (and among the unwrapped pods below them); pods of one namespace may then sit in several wrappers, and the color bar is what still ties them together — which is why the bar is kept even though the namespace column now names the namespace. The `namespace` card of that namespace MUST carry the same color as its pods' bars, so the bar and the card read as one thing. The namespace card is a derived-column card (see "Flow chain and tier structure"), not a node produced by any edge; grouping on the pod column is still expressed only through adjacency and bars, never by a link from the pod column to the pod column.

#### Scenario: Same namespace adjacent and same color

- **WHEN** the pod tier contains `mongo-0` and `mongo-1` of `prod` and `redis-0` of `staging`, and `redis-0`'s total flow is higher than both mongos
- **THEN** the `staging` group is placed above the `prod` group; `mongo-0` and `mongo-1` are adjacent with the same left-edge bar color, different from `redis-0`'s bar color

#### Scenario: A pod without a namespace

- **WHEN** some pod has no `namespace`
- **THEN** that pod carries no color bar and is placed after all pods that carry a namespace

#### Scenario: The namespace card shares its pods' bar color

- **WHEN** the pod tier contains two namespaces
- **THEN** each namespace card on the namespace column carries the bar color of its pods, the two colors differ, and no ribbon leaves a namespace card

#### Scenario: Adjacency applies within a wrapper

- **WHEN** the layout is `Node`, `worker-0` holds `mongo-0` (`prod`) and `redis-0` (`staging`), and `worker-1` holds `mongo-1` (`prod`)
- **THEN** within `worker-0` the two pods are ordered by their namespace groups, `mongo-0` and `mongo-1` carry the same bar color across the two wrappers, and the wrapper order is still `worker-0` above `worker-1`

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

### Requirement: Clicking a node Locates across views

Clicking a Sankey node MUST push-navigate to bare `/graph` (the Graph page mounts with its initial scope and fetches), passing the target node id to the Graph page via router navigation state (**not in the URL**); the Graph page MUST, after its **first successful load**, run Locate on the node with that id (semantics as **Locate** in CONTEXT.md): expand its chain of collapsed ancestor containers, select the node, fit the viewport to its closed neighborhood, and clear the search input. The target is retained until the first successful load; if the first load fails the page presents its error state, and when a subsequent manual reload succeeds it MUST still run that Locate. Locate is a one-off action: refreshing `/graph` MUST NOT run it again. The Sankey itself MUST NOT hold persisted selection state — returning to the Sankey via Back remounts the page with no node in the selected state.

Because the two views come from **two endpoints**, a node in the Sankey is not guaranteed to exist in the Graph page's body (the Graph page mounts with the default projection `prune=true` and no filters — the traffic graph keeps only pods on connectivity edges; or that node type is simply not emitted by `/v1/graph`). The view MUST give a recognisable hint according to the cause, and in no case MUST it silently rewrite the `prune` setting:

- The node **does not exist** in the Graph view's current data → hint that the node is not in the current graph query result, and point out the possible causes (filters or a different `prune`); MUST NOT be shown as an error.
- A `netapp-svm` node **has no corresponding graph node** (`/v1/graph` does not emit that type) → nodes on that tier MUST NOT offer the Locate interaction (not presented as clickable), rather than reporting failure only after a click.
- An `application` / `namespace` card is a **compound container** in the Graph view, not a leaf node, and Locate is defined over leaf nodes → these cards MUST NOT offer the Locate interaction either (same presentation as SVM).
- A wrapper's title row under the `Node` layout stands for a Kubernetes `node`, which `/v1/graph` emits as a leaf → it MUST offer Locate for that node's id, with the same rules as any other card; the pod cards inside it Locate their own pod.

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

#### Scenario: Application and namespace cards offer no Locate

- **WHEN** the user moves the cursor over `mongodb` on the application column or `prod` on the namespace column
- **THEN** neither card is presented as clickable, and the tooltip shows normally

#### Scenario: Clicking a wrapper title Locates the Kubernetes node

- **WHEN** the layout is `Node` and the user clicks the title row of `worker-0`
- **THEN** the app push-navigates to `/graph` and, after the first successful load, Locates `node/worker-0`; clicking the `mongo-0` card inside the wrapper Locates `pod/mongo-0` instead

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

### Requirement: Focus mode

Focus mode MUST collapse the app shell's top nav bar and the page's scope bar — the estate / root / narrowing controls, Top pods and Query together with the view-controls group they are followed by (mode selector, `Layout`, `SVM`, the cut statement and the legend) — so that the chart area fills the whole window; nothing else stands between the chart and the window's edges, since the page draws no title-bar row and no summary. `Esc` or activating the control bar's focus button again MUST leave it. Entering and leaving MUST preserve the zoom / pan viewport, mode, layout, SVM display, estate / root selection and hover state. Focus mode MUST be transient view state: it MUST NOT be written to the URL and MUST NOT be persisted; after navigating away from the Sankey page or a full refresh it MUST return to inactive.

#### Scenario: Entering and leaving focus mode preserves the viewport

- **WHEN** the user zooms to 180%, presses `F`, then presses `Esc`
- **THEN** on entering, the nav bar and the scope bar with its view-controls group collapse and the chart fills the window; after leaving, both are restored and the zoom factor is still 180%

#### Scenario: Leaving the route ends focus mode

- **WHEN** the user, while in focus mode, presses the browser's Back to leave `/sankey`, then returns with Forward
- **THEN** the Sankey page remounts: focus mode is inactive, the nav bar is visible, the viewport is the initial one; the estate / roots / mode carried by the URL are restored

### Requirement: In-place update on refresh

When the storage-graph data updates because of a refresh (manual or automatic), the Sankey MUST re-derive and update the chart in place (add / remove nodes and links, update weights, re-sum the derived columns, and under the `Node` layout move a pod whose `pod-node` edge changed into its new wrapper), and MUST NOT reset to the initial state; the values of the mode selector, the layout and all selectors MUST be retained. The tooltip and hover highlight of a node that has disappeared MUST be cleared; the hover highlight of a node that still exists MUST be recomputed against the new topology. During a refresh and after a failed refresh, the previously successfully drawn chart MUST stay visible (see the refresh semantics of `graph-data-source`).

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

### Requirement: Performance bounds

The following bounds MUST hold on developer-machine / CI-grade hardware as used by the e2e test suite:

- For a synthetic body containing 3000 `storage-flow` edges (500 pvcs, 1000 pods, 25 aggregates, 10 SVMs, 5 controllers, 50 Kubernetes nodes, every pod carrying a `pod-node` edge and a full `controller → application → namespace → cluster` parent chain over 100 applications and 20 namespaces, every edge carrying both `read_bytes_per_sec` and `write_bytes_per_sec`), with Top pods set to `1000` so that nothing is cut, the time from obtaining the normalized result to the Sankey's first completed draw (Both mode, `Flat` layout) MUST be within **1000 ms**.
- Applying the Top pods cut at `10` to that body MUST complete within **100 ms**, and the first completed draw of the cut body within **300 ms** of obtaining the normalized result.
- The redraw after a mode switch, a layout switch or a Top pods change MUST be within 500 ms.
- Hover and leave MUST only update styles, MUST NOT trigger a layout recomputation (verified by a layout function call count of 0), and the style update MUST complete within one animation frame.
- Zoom and pan MUST only update the `transform` of the single `<g>`, MUST NOT trigger a layout recomputation (likewise verified by a layout function call count of 0), and each update MUST complete within one animation frame.

#### Scenario: First draw of 3000 storage-flow edges

- **WHEN** the Sankey view is opened with the synthetic body above and Top pods at `1000`
- **THEN** the elapsed time from data availability to the chart's first completed draw is ≤ 1000 ms, and the node counts of the seven columns are respectively 5 / 25 / 10 / 500 / 1000 / 100 / 20; switching to the `Node` layout redraws within 500 ms with 50 wrappers in the pod column and the same seven counts

#### Scenario: The default cut is cheap

- **WHEN** the Sankey view is opened with the synthetic body above and Top pods at its default `10`
- **THEN** the cut completes within 100 ms, the first completed draw is within 300 ms of data availability, and the pod column holds 10 cards

#### Scenario: Hover does not recompute the layout

- **WHEN** 100 different nodes are hovered and left in succession on the synthetic body above
- **THEN** the layout function is called 0 times, each hover's style update completes within one animation frame, and the node coordinates stay unchanged throughout

#### Scenario: Zoom and pan do not recompute the layout

- **WHEN** zoom and pan are performed 100 times in succession on the synthetic graph above
- **THEN** the layout function is called 0 times, each update completes within one animation frame, and the nodes' intrinsic coordinates stay unchanged throughout

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

### Requirement: Card search

The Storage flow Sankey SHALL show the card search of `sankey-canvas` "Card search overlay". The searchable records are exactly the cards the current drawing holds: every card in the layout (including derived `application` / `namespace` cards) and every wrapper it draws — a Kubernetes node wrapper under the `Node` layout, an SVM frame under the `Group` SVM display. A pod removed by the Top pods cut, or a wrapper the current layout does not draw, MUST NOT be a hit.

- A card's fields are its `label`, `kind`, `namespace` and NetApp cluster (`ontap_cluster`); a wrapper's are its `label` and `kind` (`node` / `netapp-svm`), plus the NetApp cluster for an SVM frame. A PVC's `labels.svm` text is not a search field. A result's context line shows the namespace and NetApp cluster when present.
- A hit's lit path is its "Hover highlights the path" set, claim-aware as described there; a wrapper hit lights the union of its member pods' paths and an SVM frame hit the union of its member PVCs' paths.
- Matching and lighting MUST stay within one interaction: on the "Performance bounds" synthetic body with Top pods at `1000`, a query hitting every pod MUST match and compute the lit set within **100 ms**.

#### Scenario: Searching an aggregate lights its claims only

- **WHEN** in Both mode the user types `aggr1`
- **THEN** `ontap-prod-01`, `aggr1`, `data-mongo-0`, `mongo-0`, `mongodb` and `prod` are lit, and `aggr2` and `mongo-1` are faded

#### Scenario: A node wrapper is a hit under the Node layout

- **WHEN** the layout is `Node` and the user types `worker-0`
- **THEN** `mongo-0` and `orphan-0` are lit and `mongo-1` is faded

#### Scenario: A refresh keeps the query

- **WHEN** `aggr` is typed and a refresh drops `aggr1`
- **THEN** the search box still reads `aggr`, and `aggr2` with its claim path is lit
