## ADDED Requirements

### Requirement: Weight family switch: throughput and IOPS

The scope bar's view-controls group SHALL provide a segmented control labelled `Weight`, beside `Mode`, with two segments: `Throughput` (default) and `IOPS`. It selects which measured pair on a `storage-flow` edge becomes ribbon weight, and nothing else:

- **`Throughput`**: the direction fields are `read_bytes_per_sec` / `write_bytes_per_sec`. Formatted values use the bytes/sec ladder of "bytes/sec value formatting".
- **`IOPS`**: the direction fields are `read_ops` / `write_ops`. Formatted values use the Graph tooltip's ops formatter (`<n> ops/s`, 3 significant digits, `0` → `0 ops/s`, a non-zero value never rounding to `0 ops/s`). That formatter MUST be the same implementation the Graph view's `read` / `write` / `max iops` rows use.

`Mode` (`Read` / `Write` / `Both`) stays the direction split and is independent of `Weight`. The two compose: Read + IOPS draws at most the read ops link; Both + Throughput is today's drawing.

Switching MUST NOT issue a request, MUST NOT mark Query as having a pending draft, and MUST NOT change the estate / root / narrowing, `Mode`, `Layout`, the SVM display, or the Top pods value. It MUST re-run derivation and the Top pods ranking, recompute the thickness scale from the newly drawn links, and preserve the zoom / pan viewport and — when the hovered card still exists — the hover highlight, within the redraw bound of "Performance bounds". Switching `Mode`, `Layout` or the SVM display MUST preserve `Weight`.

The control remains operable in every empty state. It is an **immediate view value**, like `Mode`: outside demo mode it MUST sync to the `weight` URL query (`iops`; the default `throughput` is not written); on page mount it is read from the URL, and an invalid value is treated as `throughput`. It MUST NOT be sent to the backend. In demo mode it is component state like the rest of the scope (see "az / env are required single-value selectors").

Every formatted weight the view prints — mid-ribbon label, tooltip flow row, leaf-card `total` line — MUST use the active family's formatter. QoS ceiling rows on an `svm-pvc` link stay informational and still show whichever of `max_bytes_per_sec` / `max_iops` the edge carries, in their own units, regardless of `Weight`.

#### Scenario: IOPS draws the ops pair as weight

- **WHEN** in Read mode the user switches Weight to `IOPS`, and the `svm_shop → data-mongo-0` edge carries `read_ops: 150` and `read_bytes_per_sec: 5242880`
- **THEN** that link's weight is `150`, the mid-ribbon label and the tooltip weight row read `150 ops/s`, the thickness scale is computed from ops values among drawn links, and no storage-graph request is issued

#### Scenario: Throughput is unchanged

- **WHEN** Weight is `Throughput` and the same edge carries `read_ops: 150` and `read_bytes_per_sec: 5242880`
- **THEN** that link's weight is `5242880` and the label reads `5.24 MB/s`, unaffected by `read_ops`

#### Scenario: Weight restored from the URL

- **WHEN** the user opens `/sankey?az=zone-a&env=prod&aggr=aggr1&weight=iops`
- **THEN** the Weight control is IOPS; after Query only ops links are drawn

#### Scenario: Demo mode ignores the parameter

- **WHEN** `demoMode` is `true` and the user opens `/sankey?weight=iops`
- **THEN** the Weight control is Throughput and the fixture draws unscoped; the address bar keeps only `from` / `to` after the page's next write

#### Scenario: Mode and Weight compose

- **WHEN** Weight is `IOPS` and the user switches Mode from Both to Write
- **THEN** only write ops links are drawn, the legend hides the read item, Weight stays IOPS, and no request is issued

#### Scenario: The switch is independent of Layout and SVM

- **WHEN** the user sets Weight to `IOPS`, Layout to `Node` and SVM to `Group`, then refreshes
- **THEN** before the refresh the drawing is IOPS with wrappers and frames; after it and a new Query, Weight is IOPS (from the URL), Layout is `Flat` and SVM is `Column`

## MODIFIED Requirements

### Requirement: az / env are required single-value selectors

The view SHALL provide two **single-select dropdown** controls, `az` and `env` (contract: see "Interaction contract of the dropdown control" in `graph-filters`; custom values allowed), whose options come from `endpoints.labelValues` (the same source as the Graph view's filter bar, see `graph-data-source`). They edit the **draft** (see `explicit-query`). Each MUST send exactly one value: the backend rejects a missing value with 400 `missing_az` / `missing_env` and a repeated value with 400 `invalid_scope`, therefore:

- Until **both are selected** (and at least one root is present, see "Root selector"), Query MUST be unavailable and the view MUST NOT issue any storage-graph request, showing a hint explaining that one `az`, one `env` and at least one root must each be chosen; every control MUST remain operable at this point.
- `endpoints.labelValues` and `endpoints.storageGraph` are each independently optional, so the options may be **entirely unlistable**. In that case both controls MUST still render and MUST still accept a custom value (with zero options the dropdown holds only the search input and the "use "<text>"" row); they MUST NOT disappear or become an empty, unselectable dropdown — the backend requires these two values, and a dropdown that lists no options would leave the hint pointing at a control that cannot be selected, making the view permanently unable to fetch.
- When a dimension has **exactly one** option, the view SHALL auto-preselect that value into the draft (there is no choice to make on that dimension, and requiring a manual click is just friction). With zero or two-or-more options it MUST NOT auto-select. Auto-preselection edits the draft only and MUST NOT issue a request.
- The app MUST NOT pick one of several candidate values on its own, and MUST NOT send an empty value.
- The applied value MUST sync to the `az` / `env` URL query (replace, written by the Query commit); on page mount a value present in the URL seeds the draft and takes precedence over auto-preselect; a URL value not among the options MUST still be applied to the draft and marked as unlisted.

Both are the Sankey's **own** controls and are **independent** of the Graph view filter bar's `az` / `env` (which are multi-select): changing one side MUST NOT rewrite the other page's URL query.

**Demo mode is exempt from every URL-scope rule in this capability.** When `demoMode` is `true` the page MUST NOT read or write any of `az` / `env` / `ontap_cluster` / `node` / `aggr` / `svm` / `pod` / `cluster` / `namespace` / `mode` / `weight` / `top_pods` in the query, and holds those selections in component state instead (`from` / `to` are still written — they belong to `app-shell`, not to this scope). The reason is the same one that hides the Graph filter bar in demo mode (see `graph-filters`): the view renders a bundled fixture, there is no backend for a scope to narrow, and a URL parameter that changed nothing would claim a scope the drawing does not honour. A deep link carrying these parameters in demo mode is therefore ignored, and stripped on the page's next write of the query.

The selected values MUST be retained across mode switches, weight switches, resize and theme switches, and restored via the URL after refresh and Back; a restored value that is no longer among the options MUST still be applied and marked as unlisted (the same rule as `graph-filters`), MUST NOT be cleared, and MUST NOT be silently switched to another value — the backend matches on that value; the listing is only an aid.

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

### Requirement: Top pods projection

The scope bar SHALL carry a **Top pods** control: an integer of at least `1`, default `10`, with an accessible name, applied by the app to the normalized storage-graph body after every successful load and **before** derivation. It keeps the K pods with the highest total inflow in the current mode and weight family (Both mode counts read plus write of that family), ties broken by `label` ascending (`localeCompare`), among the pods that have at least one inbound `pvc-pod` link; pods with no such link (a no-flow root) are outside the ranking and unaffected. Every other pod is dropped, and with it every `pvc` / `netapp-svm` / `netapp-aggr` / `netapp-node` that no longer lies on a path to a kept pod, the dropped pods' `pod-node` edges, under the `Node` layout any wrapper left without a kept pod, and under the SVM display's `Group` any frame left without a kept PVC. The derived `application` / `namespace` columns are computed from the kept pods only.

When the body reports claim aggregates (see "Flow chain and tier structure"), a kept claim's path runs through its claim aggregate only: an aggregate is kept when it is the claim aggregate of a kept PVC, not merely because it feeds a kept SVM, and a kept PVC without a claim aggregate keeps no aggregate. A body that reports no claim aggregates keeps every aggregate feeding a kept SVM, which is all such a body can say.

This is the **one** client-side narrowing the view performs, and it narrows membership only: every kept link MUST keep the weight the backend gave it, and the app MUST NOT rescale, split or re-sum any hop — so a kept upstream ribbon may carry more than the kept downstream shows, which is the truth (the hidden pods still flow through that aggregate). The scope bar's view-controls group MUST therefore carry a **cut statement** — `<shown> of <total> pods` — whenever the cut hid any pod, and the "Empty states" hints likewise state how many pods are shown out of how many the body carried. When K is at least the number of ranked pods nothing is hidden and no such statement is shown. The cut MUST NOT mutate the normalized result (the deep-equality rule of "Input is its own storage-graph fetch" holds across it), MUST be re-applied on every refresh, and MUST be re-ranked on a mode switch or a weight switch, since the ranking is per direction and per family.

The control MUST be unavailable — presented disabled, with text saying why — while the **draft** contains any `pod` root, and the cut MUST NOT be applied to a body whose **applied** selection contains any `pod` root: naming pods and ranking them are mutually exclusive, and an operator who asked for `shop/orders-0` must never find it cut. The value is not a draft input: changing it redraws immediately with no request (see `explicit-query`). Outside demo mode it MUST sync to the URL as `top_pods` (replace, written only when it differs from `10` and no `pod` root is present, read on mount, an unparseable or sub-`1` value falling back to `10`); it MUST NOT be sent to the backend, which has no such parameter. Under `demoMode` it is held in component state like the other scope values.

#### Scenario: The default cut bounds a large body

- **WHEN** the synthetic 3000-edge body of "Performance bounds" (1000 pods) is loaded with Top pods at its default and no `pod` root
- **THEN** the pod column draws exactly 10 cards, being the 10 pods with the highest inflow in the current mode; every `pvc` / `netapp-svm` / `netapp-aggr` / `netapp-node` drawn lies on a path to one of them; every drawn link carries the weight the backend gave it; and the scope bar states `10 of 1000 pods`

#### Scenario: The ranking follows the mode

- **WHEN** in Write mode pod `batch-7` has the largest write inflow and a read inflow below every other pod's, K is `1`, and the operator switches to Read mode
- **THEN** in Write mode `batch-7` is the one pod drawn; in Read mode it is not drawn and the pod with the largest read inflow is, with no request issued

#### Scenario: The ranking follows the weight family

- **WHEN** in Read mode pod `tiny-blocks` has the largest read ops inflow and a read bytes inflow below every other pod's, K is `1`, and the operator switches Weight from IOPS to Throughput
- **THEN** under IOPS `tiny-blocks` is the one pod drawn; under Throughput it is not drawn and the pod with the largest read bytes inflow is, with no request issued

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

A link's weight MUST be read directly from that `storage-flow` edge's `data.metrics`, from the direction field of the **active weight family** matching the current mode: `read_bytes_per_sec` / `write_bytes_per_sec` under Throughput, `read_ops` / `write_ops` under IOPS. The app MUST NOT:

- sum downstream links itself to derive an upstream weight (the backend already guarantees per-tier conservation of **each** family);
- split a claim's measurement evenly across several pods itself (the backend has already done the split);
- convert ops to bytes or bytes to ops;
- use `read_latency_us` / `write_latency_us` / `max_iops` / `max_bytes_per_sec` as link thickness;
- use the inactive family's fields as thickness (under Throughput, `read_ops` / `write_ops` MUST NOT affect weight; under IOPS, `read_bytes_per_sec` / `write_bytes_per_sec` MUST NOT).

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

- **WHEN** in Read mode under Throughput, the `svm_shop → data-mongo-0` edge carries `metrics.read_bytes_per_sec: 5242880`
- **THEN** that link's weight is `5242880`, unaffected by the same edge's `write_bytes_per_sec`, `read_ops` or `max_bytes_per_sec`

#### Scenario: IOPS weights taken as-is

- **WHEN** in Read mode under IOPS, the `svm_shop → data-mongo-0` edge carries `metrics.read_ops: 150` and `metrics.read_bytes_per_sec: 5242880`
- **THEN** that link's weight is `150`, unaffected by the same edge's `read_bytes_per_sec`, `write_ops` or `max_iops`

#### Scenario: Upstream weights are not summed by the client

- **WHEN** the `ontap-prod-01 → aggr1` edge carries `metrics.read_bytes_per_sec: 6000000`, while the sum of its two downstream `aggr-svm` links is `5999999` (backend rounding)
- **THEN** the upstream link's weight remains the backend-given `6000000`; the app MUST NOT replace it with the downstream sum, and MUST NOT show a warning because the two differ

#### Scenario: Split attribution is marked as an estimate

- **WHEN** some `pvc-pod` link carries `labels.attribution: "split"` and `write_bytes_per_sec: 524288`
- **THEN** its weight is `524288`, and the tooltip marks the value as a split estimate; the `svm-pvc` link on the same path (without that label) is not marked as an estimate

#### Scenario: Switching mode recomputes immediately

- **WHEN** the user switches from Both to Write
- **THEN** each edge keeps only its write link, the legend no longer shows the read item, and the app MUST NOT refetch

#### Scenario: Switching weight recomputes immediately

- **WHEN** the user switches from Throughput to IOPS
- **THEN** each drawn link's weight is that edge's ops field for its direction, links whose active ops field is absent disappear, the thickness scale is recomputed from the new maximum, and the app MUST NOT refetch

#### Scenario: Group re-sources a claim's weight without re-summing

- **WHEN** in Read mode under `Group`, SVM `svm_a` holds claims `pvc-1` (its `svm-pvc` edge read `700`) and `pvc-2` (read `300`), both with claim aggregate `aggr1`, and the `aggr1 → svm_a` edge carries read `1000`
- **THEN** the ribbons `aggr1 → pvc-1` and `aggr1 → pvc-2` carry `700` and `300`, no drawn ribbon carries `1000`, and the `svm_a` frame's inflow of `1000` is marked derived from its PVCs

### Requirement: Missing-value handling (absent ≠ 0)

The derivation MUST distinguish "measurement does not exist" from "measurement is 0":

- An edge lacks the active family's field for the current direction (`read_bytes_per_sec` / `write_bytes_per_sec` under Throughput, `read_ops` / `write_ops` under IOPS) → no link is drawn for that direction; in Both mode only the direction that exists is drawn. Presence of the **other** family MUST NOT fill the gap.
- An edge lacks both directions of the active family (including the whole `metrics` being absent) → that edge yields no link at all. For "no claim on the path has a measurement" the backend simply omits the `metrics` key; this is a path that genuinely exists but has no measurement.
- The value is `0` → a zero-weight link MUST be drawn, at the minimum visible thickness and visually distinguishable from non-zero links (for example dashed or semi-transparent); it MUST NOT be treated as a missing value.
- All of a node's links are excluded and the node is not a root → that node is not drawn. **Root nodes are always drawn** (see "Flow chain and tier structure").
- The above decisions MUST depend only on field presence and numeric value; the app MUST NOT fill a missing value with `0`, `null` or any default.

#### Scenario: An edge with only a read measurement

- **WHEN** some `svm-pvc` edge's `metrics` is `{ read_bytes_per_sec: 262144 }` (no `write_bytes_per_sec`)
- **THEN** Read mode under Throughput draws a link of weight `262144`; in Write mode that pair has no link; in Both mode there is only the read link, and the tooltip shows no write value (not shown as `0`)

#### Scenario: Bytes without ops is absent under IOPS

- **WHEN** some edge's `metrics` is `{ read_bytes_per_sec: 262144 }` (no `read_ops`) and Weight is `IOPS`
- **THEN** Read mode draws no link for that pair; switching Weight to `Throughput` draws a link of weight `262144`; neither drawing fills ops in as `0`

#### Scenario: A zero value is drawn as a zero-weight link

- **WHEN** some edge's `metrics` is `{ read_bytes_per_sec: 0, write_bytes_per_sec: 1048576 }` and the mode is Read under Throughput
- **THEN** that pair draws one zero-weight link, the tooltip shows `0 B/s`, its visual style is distinguishable from non-zero links, and its source / target nodes are still drawn

#### Scenario: A complete path with no measurement

- **WHEN** the body contains a path with all five segments present but no `metrics` on any segment
- **THEN** that path yields no link; its nodes are not drawn if they are not roots, and if they are roots (matched against the request's root selection) they are presented as no-flow nodes

#### Scenario: A root on a measurement-less path is still drawn

- **WHEN** the user uses `aggr: aggr1` as root, and the body returns the three nodes `ontap-prod-01 → aggr1 → svm_shop` and two edges both lacking `metrics`
- **THEN** `aggr1` is drawn as a no-flow node on the aggregate tier, `ontap-prod-01` and `svm_shop` are not drawn (they are not roots and have no drawn link), and the view MUST NOT show state 3

### Requirement: Empty states

The view MUST distinguish the following states by cause, each presented with different explanatory text, and the mode selector, the weight selector and all selectors MUST remain operable in every state:

1. **Endpoint not configured** — `endpoints.storageGraph` is absent (see `runtime-config`).
2. **Scope incomplete** — `az`, `env` or a root is missing from the draft; explains that one of each and at least one root must be chosen, and states explicitly that no request has been issued yet.
3. **Awaiting Query** — the draft is complete but nothing has been committed on this mount (see `explicit-query`): states that nothing has been requested yet and points at the Query control.
4. **Cancelled** — the only request of this mount was cancelled and no data is held: says so, and points at Query.
5. **Empty response** — the request succeeded but `elements` has no nodes: explains that the selected estate and roots have no storage flow in this time range, and hints at possible causes (a mistyped root name, no NetApp-backed claim in that estate, the time range falling outside retention).
6. **No measurement in the current direction and weight family** — the body has `storage-flow` edges, but none carries a measurement in the current mode's direction of the active family (for example, in Read mode under Throughput every edge has only `write_bytes_per_sec`; under IOPS every edge has bytes and no ops): explains that the current direction and weight family have no measurement and suggests switching Mode or Weight.

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

- **WHEN** every edge that carries a measurement has only `write_bytes_per_sec`, and the user selects Read mode under Throughput
- **THEN** state 6 is shown with a hint to switch to Write / Both; after switching to Write the graphic draws normally

#### Scenario: No measurement in the current weight family

- **WHEN** every edge that carries a measurement has bytes and no ops, and the user selects IOPS
- **THEN** state 6 is shown with a hint to switch Weight; after switching to Throughput the graphic draws normally; Mode and Weight remain operable

### Requirement: Value labels on ribbons

Every drawn link MUST label the formatted weight for its direction at the midpoint of its ribbon, using the active family's formatter (`5.24 MB/s` under Throughput, `150 ops/s` under IOPS). The label MUST be separated from the ribbon beneath it by a **stroke halo** (the stroke is painted before the fill, in the chart area's background color), and MUST NOT use an opaque backing plate — a plate would punch a gap into the ribbon. In Both mode the read and write ribbons are each labelled separately. When a ribbon's thickness is smaller than the label's font height the label MUST be omitted to avoid overlapping text, and the value MUST still be readable from the link tooltip.

#### Scenario: Both mode labels each ribbon separately

- **WHEN** the user views `data-mongo-0→aggr1` in Both mode under Throughput
- **THEN** the read ribbon is labelled `5.24 MB/s` and the write ribbon `1.05 MB/s`, both labels have a stroke halo, and the ribbon beneath each label remains continuously visible (no gap from an opaque backing plate)

#### Scenario: IOPS labels use ops/s

- **WHEN** the user views `svm_shop → data-mongo-0` in Both mode under IOPS
- **THEN** the read ribbon is labelled `150 ops/s` and the write ribbon `40 ops/s`

#### Scenario: Very thin ribbons omit the label

- **WHEN** some link has weight `0` and its ribbon is drawn at the minimum thickness
- **THEN** that ribbon carries no value label; on hover the tooltip still shows `0 B/s` under Throughput and `0 ops/s` under IOPS

### Requirement: Labels and tooltips for nodes and links

Every node MUST show its `label`. On hovering a node the tooltip MUST show:

- The node kind and `label`; `pod` / `pvc` additionally show `namespace`; `pvc` additionally shows its SVM and, when it has a claim aggregate, that aggregate's `label`; `netapp-aggr` / `netapp-svm` / `netapp-node` additionally show `ontap_cluster`.
- Total inflow and total outflow in the active family's unit for the current mode (in Both mode read / write listed separately), each row **painted in the colour of the ribbons it sums** — the read rows in the read ribbon colour, the write rows in the write ribbon colour, in Read or Write mode the `in` / `out` rows in that direction's colour — the way the network trace paints `traced in` / `traced out` like its ribbons and `other in` / `other out` like its residuals. Rows marked derived are painted the same way. Every other row is plain.
- `pvc` / `netapp-aggr`: when `usage` is present, show `used_bytes` / `capacity_bytes`; when `usage` or either field is missing, omit the item, and MUST NOT fill in `0`.
- Any node the backend sent a `status` for: show it as-is, next to `health` rather than in place of it — `health` is one of the signals folded into `status`, and the two answer different questions. On a wrapper the status item MUST say it is the worst of the node and its members, the same way its flow items say they are derived from them. The derived `application` / `namespace` cards show **no** status item (see "Nodes are presented as box cards").
- `netapp-aggr` / `netapp-node`: when `health` is present, show it as-is; when missing, omit it, and MUST NOT fill in `unknown` or `degraded`.
- `netapp-node`: when `hardware` is present, show the fields it has (at least `model`); when `perf` is present, show the fields it has (`cpu_busy_pct` / `total_ops` / `total_latency_us` / `total_bytes_per_sec`) marked as raw readings. The app MUST NOT derive a health verdict from `perf`, and MUST NOT color by threshold or add a warning icon — thresholds are model- and estate-specific, and verdicts arrive via `alerts`.
- When any node's `alerts` is present and non-empty, its alerts (name and severity) MUST be shown, and the node marked with the status color.
- A no-flow root node: MUST state explicitly "this node is a selected root with no flow in this time range".
- `application` / `namespace`: the kind and `label`, the namespace (for an application), the member pod count, and the total inflow in the current mode marked **derived from member pods**; no status, usage, health, hardware or perf item (the body carries none for a group).
- A wrapper under the `Node` layout (hovering its title row): kind `node`, `label`, member pod count, and the total inflow of its pods in the current mode marked derived; when the node is a no-flow root, the root statement above.
- A frame under the SVM display's `Group` (hovering its title row): kind `netapp-svm`, `label`, `ontap_cluster`, member PVC count, and the total inflow of its PVCs in the current mode marked derived; no status item; when the SVM is a no-flow root, the root statement above.

On hovering a link the tooltip MUST show the source `label`, target `label`, tier, direction (read / write) and weight value in the active family's unit, the direction-and-weight row painted in that direction's ribbon colour. A derived link (`pod → application`, `pod → namespace`, `application → namespace`) MUST show source, target, direction and weight, name its column pair in place of a backend tier, and mark the value as derived from member pods; it MUST NOT show a ceiling, latency or attribution item. An `svm-pvc` link additionally MUST show `max_bytes_per_sec` / `max_iops` informationally when present (marked as QoS ceiling); when missing they are omitted, and MUST NOT be shown as `0` or "unlimited"; when the measurement exceeds the ceiling the app MUST NOT color, warn or change the link's style. Under `Group` an aggregate → PVC ribbon is an `svm-pvc` link: its tooltip names the aggregate as source and the PVC as target, gives tier `svm-pvc` with the SVM the claim belongs to, and shows that edge's ceiling items as above. Links on other tiers MUST NOT show ceiling or latency fields (the backend does not provide them there). A link whose `labels.attribution` is `"split"` MUST be marked "split estimate".

The tooltip is the shared `SankeyTooltip` of `sankey-canvas`, fed lines that are plain or carry the colour of the mark they describe; the colours are the theme's read / write tokens and follow a theme switch.

#### Scenario: Hovering an aggregate node

- **WHEN** the user hovers `aggr1` in Read mode under Throughput
- **THEN** the tooltip shows `netapp-aggr` / `aggr1` / `ontap_cluster: ontap-prod`, inflow `5.24 MB/s` and outflow `5.24 MB/s` both painted in the read colour, usage `700 GB / 1 TB`, status `warning` and health `online` plain

#### Scenario: Hovering an aggregate under IOPS

- **WHEN** the user hovers `aggr1` in Read mode under IOPS
- **THEN** the tooltip's inflow and outflow rows read `150 ops/s`, painted in the read colour; usage, status and health are unchanged and plain

#### Scenario: Flow rows are painted like their ribbons

- **WHEN** the user hovers `data-mongo-0` in Both mode, then the write link of `svm_shop → data-mongo-0`
- **THEN** the card tooltip's `in read` and `out read` rows carry the read ribbon colour and its `in write` and `out write` rows the write ribbon colour while `namespace`, `SVM`, `aggregate`, `usage` and `status` are plain; the link tooltip's `write: …` row carries the write colour and its `tier` and ceiling rows are plain; after switching the theme every painted row takes the new theme's token

#### Scenario: Hovering a netapp-node shows hardware and performance readings

- **WHEN** the user hovers `ontap-prod-02`, which has `hardware: { model: "AFF-A400" }`, `perf: { cpu_busy_pct: 41.2 }`, `health: "degraded"`
- **THEN** the tooltip shows the model, `cpu_busy_pct` marked as a raw reading and uncoloured, health `degraded`, and no usage item; `cpu_busy_pct` triggers no color or icon change

#### Scenario: Ceiling only on svm-pvc links

- **WHEN** the user hovers the read link of `svm_shop → data-mongo-0`, then hovers the read link of `ontap-prod-01 → aggr1`
- **THEN** the former shows the weight in the active family's unit, `max_bytes_per_sec` `105 MB/s`, `max_iops` `5000`, with no warning style; the latter shows only tier and weight, with no ceiling or latency items

#### Scenario: Hovering a derived card and a derived link

- **WHEN** the user hovers `mongodb` and then the read link of `mongodb → prod` in Both mode, where a member pod carries `status: "warning"`
- **THEN** the card tooltip shows `application` / `mongodb` / namespace `prod` / `2 pods` and read / write inflow marked derived from member pods and painted read / write, with no status, usage or health item; the link tooltip shows `mongodb` → `prod`, read, the summed value marked derived and painted read, and no ceiling, latency or split item

#### Scenario: Hovering a PVC names its SVM and aggregate

- **WHEN** the user hovers `data-mongo-1`, then the FlexGroup claim `data-scratch`
- **THEN** the first tooltip shows `pvc` / `data-mongo-1` / namespace `prod` / SVM `svm_shop` / aggregate `aggr2`; the second shows SVM `svm_shop` and no aggregate item
