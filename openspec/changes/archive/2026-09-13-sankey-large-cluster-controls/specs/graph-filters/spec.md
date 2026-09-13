## MODIFIED Requirements

### Requirement: Filter bar and its controls

Outside demo mode, the app SHALL display a fixed-height **filter bar** below the nav bar and above the view area, with the following controls, each of which MUST have an accessible name and be operable by keyboard:

1. Four **multi-select dropdown** controls **Cluster**, **AZ**, **Env**, **Namespace** (identity dimensions; custom values allowed);
2. A **Projection** single-select control, whose two options are `Traffic graph` (mapping to `prune=true`, the default) and `Full inventory` (mapping to `prune=false`);
3. A **Clear** action, restoring every draft selection to its default (the four lists emptied, projection back to `Traffic graph`); it MUST be disabled when the draft is already at the default. Clear edits the draft only: it issues no request and does not touch the URL;
4. The **Query / Cancel** control specified by `explicit-query`, in the same row as the other controls.

The controls edit a **draft** (see `explicit-query`): changing any of them MUST NOT issue a request. There MUST be no Edge type control. The backend no longer serves an edge-type catalogue and no longer honours an `edge_type` parameter; it ignores unknown parameters rather than rejecting them, so such a control would accept a selection, write it to the URL, send it, and leave the graph unchanged — a filter that silently does nothing.

When `demoMode` is `true` the filter bar MUST NOT be shown, and the app MUST NOT read or write any filter-related query parameters — demo mode renders the bundled fixture, and there is no backend to narrow.

A value already selected in some dimension (whether from user action or from the URL), even when it is not in that dimension's option list (e.g. the namespace has been emptied, the cluster has gone offline, the options have not loaded yet, the value is custom), MUST remain in the list and keep its selected styling, and MUST be marked as **unlisted** (on both the pill and the list row): removing it from the list would silently widen the filter scope while the control still claims the filter is in effect.

#### Scenario: Demo mode does not show the filter bar

- **WHEN** `demoMode` in the runtime config is `true`
- **THEN** the filter bar is absent from the DOM, and the app issues no request to `endpoints.labelValues`

#### Scenario: Clear restores the defaults

- **WHEN** the user selects two namespaces and changes the projection to `Full inventory`, then presses Clear
- **THEN** all four lists are emptied, the projection returns to `Traffic graph`, Clear is immediately disabled, no request has been issued, and the address bar is unchanged; activating Query then sends a request carrying `prune=true` and no identity parameter

#### Scenario: A selected value that has disappeared stays in the list

- **WHEN** the user selects namespace `shop`, and afterwards the option source no longer reports `shop`
- **THEN** `shop` still appears in the Namespace control and remains selected, and the draft is unchanged

#### Scenario: No Edge type control is offered

- **WHEN** the user opens `/graph` outside demo mode with every endpoint configured
- **THEN** the filter bar contains exactly the four identity dropdowns, the Projection control, Clear and Query, with no Edge type control in the DOM, and no request is issued for an edge-type catalogue

### Requirement: Interaction contract of the dropdown control

Each dropdown control SHALL consist of a **trigger** and a **popover**, mimicking the dropdown of Grafana dashboard variables:

- **Trigger**: a button carrying the dimension label, whose accessible name is that dimension name. With no selection it shows `All`; with a selection it shows each selected value as a pill, each pill carrying a removable `×`; with more than two it shows the first two pills and a `+N` summary. Click, `Enter`, `Space` or `↓` MUST open the popover. The empty text MUST be overridable per control, because `All` is only correct for a **narrowing** dimension, where empty means "matches everything"; a control that is not a narrowing (the Sankey's pending root values, which name things to add) MUST say so in its own words, since `All` there would read as claiming every root at once.
- **Popover**: on open, focus MUST land on the **search input** at the top; typing filters the list by case-insensitive substring. The list is a `listbox`: in multi-select each row is a checkbox row, with a fixed `All` row at the top (shown checked when nothing is selected; activating it MUST empty that dimension); in single-select each row is a plain row, with the current value marked. `↑` / `↓` move, `Enter` toggles (multi-select) or selects and closes (single-select), `Esc` closes and returns focus to the trigger, `Tab` and clicking outside close. After a multi-select toggle the popover MUST stay open. A control whose empty state is not a narrowing (the Sankey's root values) MUST NOT show the `All` row: there is no "everything" to select.
- **Custom value** (dimensions that allow it): when the search text is non-empty and does not exactly match any option, a "Use "<text>"" row MUST appear at the bottom of the list; activating it MUST add that text to the selection (multi-select) or set it as the selection (single-select), marked as unlisted. Dimensions that do not allow custom values MUST NOT show this row. Every **list** dimension of the Graph filter bar allows custom values, because each sends a raw label matcher and a typed value is as valid as an enumerated one; the controls that do not are the ones naming a closed set of positions rather than a narrowing — the Projection control and the Sankey's root-kind selector.
- **No options**: for a dimension that allows custom values, with zero options the popover MUST still open and contain only the search input and the custom-value row (and, when the control says so, one line explaining why nothing is listed); for one that does not, it shows "No options available" and is not selectable.
- **ARIA**: trigger `aria-haspopup="listbox"` and `aria-expanded`; search input `role="combobox"`, `aria-controls` pointing at the list; list `role="listbox"`, with `aria-multiselectable="true"` in multi-select; each row `role="option"` and `aria-selected`.
- This contract MUST be implemented by a single shared component, and the Graph filter bar and the Sankey's estate / narrowing / root selectors MUST use that same component; Projection is single-select and is likewise presented with this component.

Every selection this control makes is a **draft** edit (see `explicit-query`): no request follows a toggle, a pill removal or a custom value, and the request scenarios below describe the request that Query then sends.

#### Scenario: Search and toggle in a multi-select dropdown

- **WHEN** the user opens the Namespace dropdown, types `sh`, moves to `shop` with `↓` and presses `Enter`
- **THEN** `shop` is checked, the trigger shows a `shop` pill, the popover stays open and the search text is still `sh`; no request is issued, and the request Query then sends carries `namespace=shop`

#### Scenario: The All row empties the dimension

- **WHEN** Namespace has `shop` and `infra` selected, and the user activates the `All` row at the top of the list
- **THEN** both are deselected, the trigger shows `All`, and the request Query then sends carries no `namespace`

#### Scenario: Custom value

- **WHEN** Cluster's options are `prod` / `dr`, and the user types `staging` and activates the "Use "staging"" row
- **THEN** `staging` becomes selected and is marked as unlisted, and the request Query then sends carries `cluster=staging`

#### Scenario: A control with a closed option set offers no custom value

- **WHEN** the user types `sideways` in the Sankey's root-kind selector, whose options are the fixed root kinds
- **THEN** the list is empty and there is no "Use "sideways"" row, `Enter` does not change the selection, and the selector keeps its previous value

#### Scenario: Keyboard close and focus restoration

- **WHEN** the user opens the AZ dropdown by keyboard and then presses `Esc`
- **THEN** the popover closes, focus returns to the AZ trigger, and the selection is unchanged

#### Scenario: Pill overflow summary

- **WHEN** Namespace has four values selected
- **THEN** the trigger shows the first two pills and `+2`; after removing one of the pills the draft updates immediately and the Query control indicates a pending draft, with no request issued

### Requirement: Filtering is performed by the backend, not the frontend

The applied filter selection MUST be sent to `endpoints.graph` as query parameters, and MUST NOT be applied on the frontend to the graph already returned: what is being proven here is precisely that `cluster` / `az` / `env` / `namespace` reach the upstream PromQL as raw label matchers. The parameter mapping is `cluster` / `az` / `env` / `namespace` and `prune`. Repeating the same parameter name means OR; between different parameter names it is AND. A dimension whose list is empty MUST NOT appear in the query string at all; `prune` MUST always be carried (see `graph-data-source`). No graph request MUST carry an `edge_type` parameter, under any selection: the backend no longer supports it and ignores it silently, so sending it would misrepresent a request that narrows nothing.

Changing a filter control MUST NOT refetch. The request is issued only when the draft is committed with **Query** (see `explicit-query`), and that request takes the same path as "reload": the existing graph stays visible while the request is in flight, the layout is not re-run, and the view state is not reset.

The **applied** selection MUST be synced to the URL query of the current route (rules in the "view routing" of `app-shell`), written by the Query commit: the parameter names are the same as those sent to the backend (`cluster` / `az` / `env` / `namespace` / `prune`), multiple values are expressed as repeated keys; a dimension whose list is empty is not written, and `prune` is written only when `false` (the default `true` is not written). Writes are replace. On page mount the initial **draft** MUST be read from the URL — **the URL is the source of truth for these selections** — and no request follows until Query; a value the URL provides that is not in the option list MUST still be applied to the draft and marked as unlisted (the options may not have loaded yet, the source may have failed, or the value was custom to begin with). An `edge_type` parameter present in the URL MUST be ignored on mount and MUST NOT be written back, which is the established handling of any unknown parameter. The filter selection MUST NOT be written to browser local storage, and MUST NOT be written to the runtime config: an invisible filter applied automatically would present a narrowed estate as the whole of it, exactly the confusion between "there is nothing here" and "nothing is shown here" that the projection control is meant to avoid; a filter in the URL is visible in the address bar and on the controls at the same time, and a clean `/graph` means no filter.

The kind / edge-type display toggles of `element-filter`, the ingress toggle, search, pod-parent mode and collapse state MUST NOT affect any parameter here, and vice versa. The legend's per-edge-type visibility toggles remain a purely client-side refinement of the graph already returned and are unaffected by the removal of the backend `edge_type` parameter.

#### Scenario: Multi-select sends repeated parameters

- **WHEN** the user selects `prod` and `dr` in Cluster, and `shop` in Namespace, and activates Query
- **THEN** the graph request sent carries `cluster=prod&cluster=dr&namespace=shop`, and carries no `az` or `env`

#### Scenario: Projection switch sends prune

- **WHEN** the user changes the projection from `Traffic graph` to `Full inventory`
- **THEN** no request is issued and the address bar is unchanged; after Query the request sent carries `prune=false`, the address bar carries `prune=false`, and the existing graph stays visible for the duration of that fetch

#### Scenario: Filters restore from the URL

- **WHEN** the user commits cluster `prod` and then refreshes the page
- **THEN** the address bar contains `cluster=prod`, the Cluster control still shows `prod`, no request is issued until Query, the request Query then sends carries `cluster=prod`, and the runtime config has not been written; opening a bare `/graph` separately leaves Cluster with an empty selection

#### Scenario: Deep link carries an unlisted value

- **WHEN** the user opens `/graph?namespace=ghost`, and the label values do not contain `ghost`
- **THEN** Namespace shows `ghost` as selected and marked unlisted; after Query the graph request carries `namespace=ghost`, and the (possibly empty) graph the backend returns renders as usual

#### Scenario: prune default is not written to the URL

- **WHEN** the user switches the projection to `Full inventory` and activates Query, then switches back to `Traffic graph` and activates Query again
- **THEN** the address bar first contains `prune=false`, and after the second commit does not contain `prune`; both graph requests carry `prune`

#### Scenario: A legacy link carrying edge_type is ignored and stripped

- **WHEN** the user opens `/graph?namespace=shop&edge_type=pod-calls-pod` and activates Query
- **THEN** the graph request carries `namespace=shop` and no `edge_type`, no control shows an edge-type selection, and the address bar written by that commit no longer contains `edge_type`

### Requirement: Filter option source

The options of the four identity dimensions SHALL be read from the Prometheus-compatible HTTP API root that `endpoints.labelValues` points to: each dimension requests `<root>/api/v1/label/<dimension>/values?match[]=kube_pod_info`, the response MUST be validated against the Prometheus envelope `{"status":"success","data":[…]}`, and `data` MUST be an array of strings. When `status` is not `success` it MUST be treated as a failure and its `error` reported, and MUST NOT be read as an empty list — an empty dropdown and a broken store must not look the same.

The same source SHALL additionally serve the Sankey's workload-side **root candidates** (see `storage-flow-sankey`), still from `kube_pod_info` and still under `<root>/api/v1/label/`:

- Kubernetes node names: `<root>/api/v1/label/node/values?match[]=kube_pod_info`;
- pod names of one namespace: `<root>/api/v1/label/pod/values?match[]=kube_pod_info{namespace="<ns>"}` (the selector URL-encoded), requested once per namespace the Sankey's namespace narrowing names, and presented by the Sankey as `<ns>/<pod>`.

These two are requested **on demand** — when the Sankey's root kind is `node`, or is `pod` with at least one namespace narrowing selected — never at page mount, and never by the Graph page. Each is loaded once per distinct request per mount, not per query, and failures follow "An option source failure must not become a missing graph" (the root value control then lists nothing and still accepts a typed value). The label names `az` and `env` in these paths are the app's **logical** dimension names; a deployment whose store spells them differently maps them at the front door (`KSG_AZ_LABEL` / `KSG_ENV_LABEL`, see `container-deployment`), never in the app.

The series `kube_pod_info` MUST be fixed, not configurable: it is the definition of the Kubernetes pod inventory, and it is precisely the label family the backend matches against when it pushes `?cluster=` / `?az=` / `?env=` / `?namespace=` into the upstream query. The options MUST NOT instead be derived from the graph response — the response carries the composed `<az>-<env>-<cluster>` identities, and sending one back as `?cluster=` would match no series and yield an empty graph with a 200; `az` and `env` are, more fundamentally, not in the response at all.

`endpoints.labelValues` is the filter bar's only option source. The app MUST NOT request an edge-type catalogue from any URL, and MUST NOT enumerate edge types from a list held in the frontend: with the backend parameter withdrawn, every such value would narrow nothing.

The endpoint is optional: when absent (or an empty string), every identity control MUST offer no options, and MUST NOT issue a request because of it; those controls can still take custom values. Options MUST be loaded once per source, not reloaded with every graph request: options track the inventory, which does not change with the projection or the current selection; rebuilding them per request would shrink the namespace list to exactly the values contained in that pruned graph, and the user could never widen the filter back out.

#### Scenario: Identity dimensions enumerate from label values

- **WHEN** `endpoints.labelValues` is `https://prom.example/`, and `GET https://prom.example/api/v1/label/namespace/values?match[]=kube_pod_info` returns `{"status":"success","data":["shop","infra"]}`
- **THEN** the Namespace control offers the two options `shop` and `infra`

#### Scenario: Pod root candidates are enumerated per namespace on demand

- **WHEN** on `/sankey` the namespace narrowing is `shop` and the operator switches the root kind to `Pod`
- **THEN** the app issues exactly one request `GET <root>/api/v1/label/pod/values?match[]=kube_pod_info{namespace="shop"}` (selector URL-encoded) and offers each returned name as `shop/<pod>`; switching the kind back and forth issues no further request for `shop`, and the Graph page never issues this request

#### Scenario: A store reporting an error is not taken as an empty list

- **WHEN** the label values endpoint returns `{"status":"error","error":"query timed out"}`
- **THEN** that control offers no options, and the filter bar shows a source-unavailable indicator whose details contain `query timed out`

#### Scenario: An absent label-values endpoint offers no options

- **WHEN** the runtime config has no `endpoints.labelValues`
- **THEN** the app issues no option request at all, the four identity controls and the Sankey's root value control have no options but still accept custom values, and the graph still fetches and renders normally after Query
