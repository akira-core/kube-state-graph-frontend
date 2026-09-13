## ADDED Requirements

### Requirement: Top pods projection

The scope bar SHALL carry a **Top pods** control: an integer of at least `1`, default `10`, with an accessible name, applied by the app to the normalized storage-graph body after every successful load and **before** derivation. It keeps the K pods with the highest total inflow in the current mode (Both mode counts read plus write), ties broken by `label` ascending (`localeCompare`), among the pods that have at least one inbound `pvc-pod` link; pods with no such link (a no-flow root) are outside the ranking and unaffected. Every other pod is dropped, and with it every `pvc` / `netapp-svm` / `netapp-aggr` / `netapp-node` that no longer lies on a path to a kept pod, the dropped pods' `pod-node` edges, and under the `Node` layout any wrapper left without a kept pod. The derived `application` / `namespace` columns are computed from the kept pods only.

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

## MODIFIED Requirements

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

Every kind may be repeated and mixed. The control MUST state explicitly that `node` matches both kinds of node (operators often do not know which kind the name in hand is), and MUST state explicitly that when both sides are mixed the backend takes the **intersection** (a path must touch both a storage-side root and a workload-side root), not the union.

A `pod` value MUST be validated before being added as containing exactly one `/` with both segments non-empty; when invalid it MUST prompt inline, MUST NOT be added, and MUST NOT be sent (the backend would reject the whole request with 400 `invalid_scope`, taking the other valid roots down with it).

The root kind is chosen with the shared dropdown (single-select, custom values not allowed). The root values are chosen with that **same** dropdown in **multi-select** form (custom values allowed, no `All` row, its empty text saying that values are picked to be added) and committed to the draft with an **Add** action, which adds every checked value as a root pill of that kind and clears the pending values; Add MUST be inert while nothing is pending, and changing the root kind MUST clear the pending values — a value picked under one kind is wrong under another. Adding, removing or clearing roots edits the draft only and MUST NOT issue a request (see `explicit-query`).

The values offered MUST be per kind, from the sources that can answer **before anything is drawn** — a required root can no longer wait for a body:

- `node`: the Kubernetes node names enumerated from `endpoints.labelValues` (the `node` label of `kube_pod_info`, see `graph-filters`), plus the NetApp controller names of the drawn body when one is drawn; the list states that the two families are mixed.
- `pod`: `<namespace>/<pod>` enumerated from `endpoints.labelValues` for each namespace the `namespace` narrowing names, plus the drawn body's pods that carry a namespace; with no namespace narrowing selected the list is empty and explains that a namespace must be selected to list pods, or a value typed. A pod carrying no namespace MUST NOT be offered at all, since a bare name is a 400 rather than a narrower graph.
- `ontap_cluster` / `aggr` / `svm`: the drawn body when one is drawn (`ontap_cluster` from the NetApp nodes' `ontap_cluster` label, the others from those kinds' names); with nothing drawn the list is empty and explains that these names are typed until a query has drawn them — `endpoints.labelValues` reaches only the store holding `kube_pod_info`, which carries none of the NetApp label names.

A value belonging to another kind, committed here, is a silently empty graph rather than an error, which is why the list is per kind. Once a root is applied the backend answers with that projection only, so the body's contribution NARROWS to it: the control MUST keep accepting a typed custom value, because the body is a projection and never the authority on what exists. Failure of a label-values request follows `graph-filters`: the list is empty, the source indicator reports it, and a typed value still works.

The root value control MUST carry its own label of the same rank as every other control's, so the whole scope bar is ONE row of label-over-control columns on a shared baseline — `AZ`, `Env`, `Root kind`, `Root value`, `Add`, `Top pods` and `Query` — the same shape as the Graph view's filter bar. The root controls MUST NOT be nested inside a group with a heading of its own: a second label rank in a row that reads as one throws every control in the bar out of alignment. Added roots, the inline pod-root error, the "root required" text and the explanatory text MUST sit BELOW that row, so a growing list of roots can never reflow the controls. The applied roots MUST sync to the URL query with the same parameter names as the backend (`ontap_cluster` / `node` / `aggr` / `svm` / `pod`, repeated keys), written by the Query commit; on page mount they are read from the URL into the draft, and an invalid `pod` value in the URL MUST NOT be added and MUST prompt inline.

The app MUST NOT further filter the elements returned by the backend by root on the client side — the projection has already been done by the backend, and client-side filtering by root would break weight conservation (the Top pods cut is the one sanctioned client-side narrowing, see "Top pods projection").

The view SHALL additionally provide optional `cluster` and `namespace` narrowing controls (multi-select dropdowns, contract see `graph-filters`, options from `endpoints.labelValues`; the applied selection syncs to the URL's `cluster` / `namespace` on commit), sent as request parameters when non-empty. They MUST NOT filter on the client side — for the same reason as above. The `namespace` narrowing doubles as the scope of the `pod` root candidates.

Unlike `az` / `env`, these two narrow an **enumerable set**: when no option can be listed and there is currently no selection, they MUST NOT render (there is nothing to narrow, and the request does not need them anyway).

#### Scenario: One row, one baseline

- **WHEN** the user views the scope bar
- **THEN** `AZ`, `Env`, `Root kind`, `Root value`, `Add`, `Top pods` and `Query` are in the same row with their labels on one baseline, no control sits under a group heading of its own, and adding a root puts its removable pill on a row below rather than between the controls

#### Scenario: No root is a valid state

- **WHEN** `az` and `env` are selected and the user clears all roots
- **THEN** no error is shown and every control stays operable — an empty root list is a valid **draft** — but Query is unavailable, the text below the row states that at least one root is required, and the request count to `endpoints.storageGraph` is 0

#### Scenario: The root value dropdown offers what is drawn, per kind

- **WHEN** nothing has been drawn yet, `endpoints.labelValues` reports nodes `worker-0` / `worker-1`, and the operator selects the root kind `Node`
- **THEN** the root value dropdown lists `worker-0` and `worker-1`; switching the kind to `Aggregate` clears the pending values, lists nothing, explains that aggregate names are typed until a query has drawn them, and still offers the custom-value row for a typed `aggr1`

#### Scenario: Pod candidates follow the namespace narrowing

- **WHEN** the operator selects namespace `shop` in the narrowing and the root kind `Pod`, and the label-values store lists pods `orders-0` and `catalog-0` in `shop`
- **THEN** the root value dropdown lists `shop/orders-0` and `shop/catalog-0`; with the namespace narrowing cleared the list is empty and explains that a namespace must be selected to list pods

#### Scenario: Several values of one kind are added at once

- **WHEN** after a committed query the body holds aggregates `aggr1` / `aggr2` / `aggr3`, the root kind is `Aggregate`, and the operator checks `aggr1` and `aggr2` and activates Add
- **THEN** two root pills `aggr: aggr1` and `aggr: aggr2` appear below the row, the pending values are cleared, no request is issued, and the Query control indicates a pending draft

#### Scenario: A name the current projection omits is still reachable

- **WHEN** the operator knows of `aggr9`, which no source lists, and types it into the root value dropdown
- **THEN** the custom-value row offers it, committing it adds root `aggr: aggr9`, and the request Query then sends carries `aggr=aggr9`

#### Scenario: Storage-side root

- **WHEN** the user adds root `aggr: aggr1` and activates Query
- **THEN** the request contains `aggr=aggr1`, the returned body contains only paths flowing through `aggr1`, and the view draws it as-is (subject only to the Top pods cut) without filtering further by root

#### Scenario: Workload-side root

- **WHEN** the user adds root `pod: shop/orders-0` and activates Query
- **THEN** the request contains `pod=shop%2Forders-0`, and the view draws the full storage chain beneath that pod

#### Scenario: Mixing both sides takes the intersection

- **WHEN** the user adds both `aggr: aggr1` and `pod: shop/orders-0` and activates Query, and that pod also mounts a claim located on `aggr2`
- **THEN** both roots are sent together; the control's explanatory text states that the two sides are intersected, and the view draws only the path from `aggr1` to that pod (the backend has already done the projection)

#### Scenario: An invalid pod root is not sent

- **WHEN** the user enters pod root `orders-0` (namespace missing)
- **THEN** the control prompts inline that it must be `<namespace>/<pod>`, no pill is added, and the other existing roots are unaffected

#### Scenario: Roots restored from the URL

- **WHEN** the user opens `/sankey?az=zone-a&env=prod&aggr=aggr1&pod=shop%2Forders-0`
- **THEN** the root control lists `aggr: aggr1` and `pod: shop/orders-0`, no request is issued, and the request Query then sends carries both

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

### Requirement: Numeric summary outside the chart

**Below** the chart there MUST be a separate numeric summary; these numbers MUST NOT be stuffed into node box cards:

- **Node summary table**: one row per drawn card, including the derived `application` / `namespace` cards (the tier column names their column) and, under the `Node` layout, one row per wrapper (tier `node`, inflow being the sum of its pods' inflow, marked derived), with columns tier, `label`, total inflow and total outflow in the current mode, and the card's `status` shown as the same colored dot the border uses — the derived `application` / `namespace` rows show the missing-value placeholder in that column, since those cards carry no status (see "Nodes are presented as box cards"); `pvc` / `netapp-aggr` additionally list usage, `netapp-aggr` / `netapp-node` additionally list health. Status and health are separate columns and MUST NOT be merged: `health` is one of the signals the backend folded into `status`, and a `netapp-node` can be `online` while its status is `critical`. Missing values MUST be presented with a missing-value placeholder, and MUST NOT be shown as `0`, `0 B` or `unknown`.
- **Application subtotal table**: one row per application on the application column, with columns application, namespace, pod count and total flow in the current mode, ordered by total descending. When no drawn pod has an `application` ancestor, the whole table MUST NOT be drawn.
- **Namespace subtotal table**: one row per namespace on the pod tier, with columns namespace, pod count and total flow in the current mode, ordered by total descending. When the pod tier has no pod carrying a namespace, the whole table MUST NOT be drawn.

The summary MUST be **collapsible and MUST open collapsed**: the chart is what the view is for, and seven tiers make these tables tall enough to take half the column from it. Its header strip MUST stay drawn while collapsed, naming how many rows each table holds and, whenever the Top pods cut hid any pod, how many pods are shown out of how many the body carried (see "Top pods projection") — a summary that vanishes entirely is indistinguishable from an estate that has no numbers. The collapsed / expanded state is transient view state like the layout switch: it MUST NOT be written to the URL and MUST NOT be persisted, and it MUST return to collapsed after navigating away or a full refresh. Expanding or collapsing it changes the chart area's height and therefore MUST NOT move the zoom / pan viewport (see "Sizing and container resize").

All tables MUST update in step with mode, layout, the Top pods cut, estate / root selection and storage-graph refresh. When a table is too wide it MUST scroll horizontally inside its own container, and MUST NOT give the page a horizontal scrollbar. While an empty state is shown (see "Empty states"), neither the tables nor the header strip MUST be drawn.

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

### Requirement: Labels and tooltips for nodes and links

Every node MUST show its `label`. On hovering a node the tooltip MUST show:

- The node kind and `label`; `pod` / `pvc` additionally show `namespace`; `netapp-aggr` / `netapp-svm` / `netapp-node` additionally show `ontap_cluster`.
- Total inflow and total outflow in bytes/sec for the current mode (in Both mode read / write listed separately).
- `pvc` / `netapp-aggr`: when `usage` is present, show `used_bytes` / `capacity_bytes`; when `usage` or either field is missing, omit the item, and MUST NOT fill in `0`.
- Any node the backend sent a `status` for: show it as-is, next to `health` rather than in place of it — `health` is one of the signals folded into `status`, and the two answer different questions. On a wrapper the status item MUST say it is the worst of the node and its members, the same way its flow items say they are derived from them. The derived `application` / `namespace` cards show **no** status item (see "Nodes are presented as box cards").
- `netapp-aggr` / `netapp-node`: when `health` is present, show it as-is; when missing, omit it, and MUST NOT fill in `unknown` or `degraded`.
- `netapp-node`: when `hardware` is present, show the fields it has (at least `model`); when `perf` is present, show the fields it has (`cpu_busy_pct` / `total_ops` / `total_latency_us` / `total_bytes_per_sec`) marked as raw readings. The app MUST NOT derive a health verdict from `perf`, and MUST NOT color by threshold or add a warning icon — thresholds are model- and estate-specific, and verdicts arrive via `alerts`.
- When any node's `alerts` is present and non-empty, its alerts (name and severity) MUST be shown, and the node marked with the status color.
- A no-flow root node: MUST state explicitly "this node is a selected root with no flow in this time range".
- `application` / `namespace`: the kind and `label`, the namespace (for an application), the member pod count, and the total inflow in the current mode marked **derived from member pods**; no status, usage, health, hardware or perf item (the body carries none for a group).
- A wrapper under the `Node` layout (hovering its title row): kind `node`, `label`, member pod count, and the total inflow of its pods in the current mode marked derived; when the node is a no-flow root, the root statement above.

On hovering a link the tooltip MUST show the source `label`, target `label`, tier, direction (read / write) and weight value. A derived link (`pod → application`, `pod → namespace`, `application → namespace`) MUST show source, target, direction and weight, name its column pair in place of a backend tier, and mark the value as derived from member pods; it MUST NOT show a ceiling, latency or attribution item. An `svm-pvc` link additionally MUST show `max_bytes_per_sec` / `max_iops` informationally when present (marked as QoS ceiling); when missing they are omitted, and MUST NOT be shown as `0` or "unlimited"; when the measurement exceeds the ceiling the app MUST NOT color, warn or change the link's style. Links on other tiers MUST NOT show ceiling or latency fields (the backend does not provide them there). A link whose `labels.attribution` is `"split"` MUST be marked "split estimate".

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

### Requirement: Fully independent of the Graph view's controls

The Sankey's data MUST be fully independent of the Graph view's kind / edge-type display toggles, ingress visibility toggle, search query, pod-parent mode, collapse state, `prune` setting, and the filter bar's multi-value `cluster` / `az` / `env` / `namespace` selections — any change to those MUST NOT change the Sankey's nodes, links or weights, and MUST NOT trigger a storage-graph refetch. The edge-type toggles named here are the legend's client-side display refinement (`element-filter`); there is no backend edge-type filter on either page.

The reverse also holds: changes to the Sankey's `az` / `env` / roots / `cluster` / `namespace` / mode / Top pods are written only to the `/sankey` query, MUST NOT rewrite the `/graph` query, and MUST NOT make the Graph page carry the Sankey's selections on its next mount. The Sankey's `Layout` control (`Flat` / `Node`) and the Graph's pod-parent `Layout` control (`Node` / `Controller`) are two unrelated pieces of transient state that happen to share a label: neither MUST read or write the other.

The only input the two pages share is the **view time range** (see `app-shell`; passed via the URL and the browser-local saved value): it is a draft input on both pages, a change to it reaches the current page's data on its next Query commit, and the other page seeds its draft with the applied value on its next mount.

#### Scenario: Graph view controls do not affect the Sankey

- **WHEN** the user, on `/graph`, hides the `pvc` kind, enters the search `nats`, switches the pod-parent mode to `node`, switches the Projection to `Full inventory` and commits it, then presses Back to return to `/sankey?az=zone-a&env=prod&aggr=aggr1`
- **THEN** the Sankey remounts with its controls prefilled from that URL and awaits Query; the request Query then sends has the same query string as before (without `prune` or the Graph's filters), and the Sankey's nodes, links and weights are the same as before

#### Scenario: Sankey controls do not affect the Graph view

- **WHEN** the user, on `/sankey`, adds root `aggr: aggr1`, changes `env` and commits, then clicks the Graph link in the nav bar
- **THEN** the address bar is `/graph` (with only `from` / `to` filled in), the filter bar has nothing selected, and the request Query then sends contains no `aggr` / `az` / `env`

#### Scenario: The two Layout controls do not share state

- **WHEN** the user switches the Sankey layout to `Node`, clicks the Graph link, and finds the Graph's pod-parent mode at its default `controller`; then switches the Graph to `node` and presses Back
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
