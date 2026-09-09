## MODIFIED Requirements

### Requirement: Filter bar and its controls

Outside demo mode, the app SHALL display a fixed-height **filter bar** below the nav bar and above the view area, with the following controls, each of which MUST have an accessible name and be operable by keyboard:

1. Four **multi-select dropdown** controls **Cluster**, **AZ**, **Env**, **Namespace** (identity dimensions; custom values allowed);
2. A **Projection** single-select control, whose two options are `Traffic graph` (mapping to `prune=true`, the default) and `Full inventory` (mapping to `prune=false`);
3. A **Clear** action, restoring every selection to its default (the four lists emptied, projection back to `Traffic graph`); it MUST be disabled when already at the default.

There MUST be no Edge type control. The backend no longer serves an edge-type catalogue and no longer honours an `edge_type` parameter; it ignores unknown parameters rather than rejecting them, so such a control would accept a selection, write it to the URL, send it, and leave the graph unchanged — a filter that silently does nothing.

When `demoMode` is `true` the filter bar MUST NOT be shown, and the app MUST NOT read or write any filter-related query parameters — demo mode renders the bundled fixture, and there is no backend to narrow.

A value already selected in some dimension (whether from user action or from the URL), even when it is not in that dimension's option list (e.g. the namespace has been emptied, the cluster has gone offline, the options have not loaded yet, the value is custom), MUST remain in the list and keep its selected styling, and MUST be marked as **unlisted** (on both the pill and the list row): removing it from the list would silently widen the filter scope while the control still claims the filter is in effect.

#### Scenario: Demo mode does not show the filter bar

- **WHEN** `demoMode` in the runtime config is `true`
- **THEN** the filter bar is absent from the DOM, and the app issues no request to `endpoints.labelValues`

#### Scenario: Clear restores the defaults

- **WHEN** the user selects two namespaces and changes the projection to `Full inventory`, then presses Clear
- **THEN** all four lists are emptied, the projection returns to `Traffic graph`, and Clear is immediately disabled

#### Scenario: A selected value that has disappeared stays in the list

- **WHEN** the user selects namespace `shop`, and afterwards the option source no longer reports `shop`
- **THEN** `shop` still appears in the Namespace control and remains selected, and the filter scope is unchanged

#### Scenario: No Edge type control is offered

- **WHEN** the user opens `/graph` outside demo mode with every endpoint configured
- **THEN** the filter bar contains exactly the four identity dropdowns, the Projection control and Clear, with no Edge type control in the DOM, and no request is issued for an edge-type catalogue

### Requirement: Filtering is performed by the backend, not the frontend

The filter selection MUST be sent to `endpoints.graph` as query parameters, and MUST NOT be applied on the frontend to the graph already returned: what is being proven here is precisely that `cluster` / `az` / `env` / `namespace` reach the upstream PromQL as raw label matchers. The parameter mapping is `cluster` / `az` / `env` / `namespace` and `prune`. Repeating the same parameter name means OR; between different parameter names it is AND. A dimension whose list is empty MUST NOT appear in the query string at all; `prune` MUST always be carried (see `graph-data-source`). No graph request MUST carry an `edge_type` parameter, under any selection: the backend no longer supports it and ignores it silently, so sending it would misrepresent a request that narrows nothing.

Changing any filter control MUST refetch `endpoints.graph` with the new selection, and take the same path as "reload": the existing graph stays visible while the request is in flight, the layout is not re-run, and the view state is not reset.

The filter selection MUST be synced to the URL query of the current route (rules in the "view routing" of `app-shell`): the parameter names are the same as those sent to the backend (`cluster` / `az` / `env` / `namespace` / `prune`), multiple values are expressed as repeated keys; a dimension whose list is empty is not written, and `prune` is written only when `false` (the default `true` is not written). Changes update with replace. On page mount the initial selection MUST be read from the URL — **the URL is the source of truth for these selections**; a value the URL provides that is not in the option list MUST still be applied and marked as unlisted (the options may not have loaded yet, the source may have failed, or the value was custom to begin with). An `edge_type` parameter present in the URL MUST be ignored on mount and MUST NOT be written back, which is the established handling of any unknown parameter. The filter selection MUST NOT be written to browser local storage, and MUST NOT be written to the runtime config: an invisible filter applied automatically would present a narrowed estate as the whole of it, exactly the confusion between "there is nothing here" and "nothing is shown here" that the projection control is meant to avoid; a filter in the URL is visible in the address bar and on the controls at the same time, and a clean `/graph` means no filter.

The kind / edge-type display toggles of `element-filter`, the ingress toggle, search, pod-parent mode and collapse state MUST NOT affect any parameter here, and vice versa. The legend's per-edge-type visibility toggles remain a purely client-side refinement of the graph already returned and are unaffected by the removal of the backend `edge_type` parameter.

#### Scenario: Multi-select sends repeated parameters

- **WHEN** the user selects `prod` and `dr` in Cluster, and `shop` in Namespace
- **THEN** the graph request sent carries `cluster=prod&cluster=dr&namespace=shop`, and carries no `az` or `env`

#### Scenario: Projection switch sends prune

- **WHEN** the user changes the projection from `Traffic graph` to `Full inventory`
- **THEN** the graph request sent carries `prune=false`, and the existing graph stays visible for the duration of that fetch

#### Scenario: Filters restore from the URL

- **WHEN** the user selects cluster `prod` and then refreshes the page
- **THEN** the address bar contains `cluster=prod`, the Cluster control is still `prod`, the graph request carries `cluster=prod`, and the runtime config has not been written; opening a bare `/graph` separately leaves Cluster with an empty selection

#### Scenario: Deep link carries an unlisted value

- **WHEN** the user opens `/graph?namespace=ghost`, and the label values do not contain `ghost`
- **THEN** Namespace shows `ghost` as selected and marked unlisted, the graph request carries `namespace=ghost`; the (possibly empty) graph the backend returns renders as usual

#### Scenario: prune default is not written to the URL

- **WHEN** the user switches the projection to `Full inventory`, then back to `Traffic graph`
- **THEN** the address bar first contains `prune=false`, and after switching back does not contain `prune`; both graph requests carry `prune`

#### Scenario: A legacy link carrying edge_type is ignored and stripped

- **WHEN** the user opens `/graph?namespace=shop&edge_type=pod-calls-pod`
- **THEN** the graph request carries `namespace=shop` and no `edge_type`, no control shows an edge-type selection, and the next filter change rewrites the address bar without `edge_type`

### Requirement: An option source failure must not become a missing graph

Failure of any option source (HTTP non-2xx, network error, JSON parse failure, shape mismatch, Prometheus `status` not `success`) MUST NOT make the graph fetch fail, MUST NOT block the filter bar from rendering, and MUST NOT throw an uncaught error. The failed dimension MUST be presented as a control with no options that still accepts custom values, and the filter bar MUST carry an indicator stating how many sources are unavailable, whose details (one line per failed source, with URL and reason) MUST be readable by the user. A vanished dropdown must never become a vanished graph.

#### Scenario: One source fails, the rest proceed as usual

- **WHEN** the `az` label-values request returns 503, while the other three respond normally
- **THEN** the AZ control has no options but accepts custom values, the other three controls offer options normally, the filter bar shows an indicator of 1 source unavailable, and the graph still fetches and renders normally with the current selection

#### Scenario: Failure details are readable

- **WHEN** some source fails with `GET https://prom.example/api/v1/label/az/values…: data is not an array`
- **THEN** that message is readable from the filter bar's source indicator, not only logged to the console

## REMOVED Requirements

### Requirement: Interaction contract of the dropdown control (Grafana style)

**Reason**: The dropdown contract no longer needs an Edge type carve-out. It is restated as "Interaction contract of the dropdown control" below, without the scenario describing a control that no longer exists.
**Migration**: None. The dropdown behaviour itself is unchanged; only the clause naming `edge_type` as the sole list dimension without custom values is gone.

### Requirement: Option sources

**Reason**: The filter bar now has a single option source. It is restated as "Filter option source" below, without the edge-type catalogue and its scenarios.
**Migration**: Deployments drop `endpoints.edgeTypes`; the identity dimensions read from `endpoints.labelValues` exactly as before.

## ADDED Requirements

### Requirement: Interaction contract of the dropdown control

Each dropdown control SHALL consist of a **trigger** and a **popover**, mimicking the dropdown of Grafana dashboard variables:

- **Trigger**: a button carrying the dimension label, whose accessible name is that dimension name. With no selection it shows `All`; with a selection it shows each selected value as a pill, each pill carrying a removable `×`; with more than two it shows the first two pills and a `+N` summary. Click, `Enter`, `Space` or `↓` MUST open the popover. The empty text MUST be overridable per control, because `All` is only correct for a **narrowing** dimension, where empty means "matches everything"; a control that is not a narrowing (the Sankey's pending root value, which names ONE thing to add) MUST say so in its own words, since `All` there would read as claiming every root at once.
- **Popover**: on open, focus MUST land on the **search input** at the top; typing filters the list by case-insensitive substring. The list is a `listbox`: in multi-select each row is a checkbox row, with a fixed `All` row at the top (shown checked when nothing is selected; activating it MUST empty that dimension); in single-select each row is a plain row, with the current value marked. `↑` / `↓` move, `Enter` toggles (multi-select) or selects and closes (single-select), `Esc` closes and returns focus to the trigger, `Tab` and clicking outside close. After a multi-select toggle the popover MUST stay open.
- **Custom value** (dimensions that allow it): when the search text is non-empty and does not exactly match any option, a "Use "<text>"" row MUST appear at the bottom of the list; activating it MUST add that text to the selection (multi-select) or set it as the selection (single-select), marked as unlisted. Dimensions that do not allow custom values MUST NOT show this row. Every **list** dimension of the Graph filter bar allows custom values, because each sends a raw label matcher and a typed value is as valid as an enumerated one; the controls that do not are the ones naming a closed set of positions rather than a narrowing — the Projection control and the Sankey's root-kind selector.
- **No options**: for a dimension that allows custom values, with zero options the popover MUST still open and contain only the search input and the custom-value row; for one that does not, it shows "No options available" and is not selectable.
- **ARIA**: trigger `aria-haspopup="listbox"` and `aria-expanded`; search input `role="combobox"`, `aria-controls` pointing at the list; list `role="listbox"`, with `aria-multiselectable="true"` in multi-select; each row `role="option"` and `aria-selected`.
- This contract MUST be implemented by a single shared component, and the Graph filter bar and the Sankey's estate / narrowing selectors MUST use that same component; Projection is single-select and is likewise presented with this component.

#### Scenario: Search and toggle in a multi-select dropdown

- **WHEN** the user opens the Namespace dropdown, types `sh`, moves to `shop` with `↓` and presses `Enter`
- **THEN** `shop` is checked, the trigger shows a `shop` pill, the popover stays open and the search text is still `sh`; the graph request carries `namespace=shop`

#### Scenario: The All row empties the dimension

- **WHEN** Namespace has `shop` and `infra` selected, and the user activates the `All` row at the top of the list
- **THEN** both are deselected, the trigger shows `All`, and the graph request carries no `namespace`

#### Scenario: Custom value

- **WHEN** Cluster's options are `prod` / `dr`, and the user types `staging` and activates the "Use "staging"" row
- **THEN** `staging` becomes selected and is marked as unlisted, and the graph request carries `cluster=staging`

#### Scenario: A control with a closed option set offers no custom value

- **WHEN** the user types `sideways` in the Sankey's root-kind selector, whose options are the fixed root kinds
- **THEN** the list is empty and there is no "Use "sideways"" row, `Enter` does not change the selection, and the selector keeps its previous value

#### Scenario: Keyboard close and focus restoration

- **WHEN** the user opens the AZ dropdown by keyboard and then presses `Esc`
- **THEN** the popover closes, focus returns to the AZ trigger, and the selection is unchanged

#### Scenario: Pill overflow summary

- **WHEN** Namespace has four values selected
- **THEN** the trigger shows the first two pills and `+2`; after removing one of the pills the graph request updates immediately

### Requirement: Filter option source

The options of the four identity dimensions SHALL be read from the Prometheus-compatible HTTP API root that `endpoints.labelValues` points to: each dimension requests `<root>/api/v1/label/<dimension>/values?match[]=kube_pod_info`, the response MUST be validated against the Prometheus envelope `{"status":"success","data":[…]}`, and `data` MUST be an array of strings. When `status` is not `success` it MUST be treated as a failure and its `error` reported, and MUST NOT be read as an empty list — an empty dropdown and a broken store must not look the same.

The series `kube_pod_info` MUST be fixed, not configurable: it is the definition of the Kubernetes pod inventory, and it is precisely the label family the backend matches against when it pushes `?cluster=` / `?az=` / `?env=` / `?namespace=` into the upstream query. The options MUST NOT instead be derived from the graph response — the response carries the composed `<az>-<env>-<cluster>` identities, and sending one back as `?cluster=` would match no series and yield an empty graph with a 200; `az` and `env` are, more fundamentally, not in the response at all.

`endpoints.labelValues` is the filter bar's only option source. The app MUST NOT request an edge-type catalogue from any URL, and MUST NOT enumerate edge types from a list held in the frontend: with the backend parameter withdrawn, every such value would narrow nothing.

The endpoint is optional: when absent (or an empty string), every identity control MUST offer no options, and MUST NOT issue a request because of it; those controls can still take custom values. Options MUST be loaded once per source, not reloaded with every graph request: options track the inventory, which does not change with the projection or the current selection; rebuilding them per request would shrink the namespace list to exactly the values contained in that pruned graph, and the user could never widen the filter back out.

#### Scenario: Identity dimensions enumerate from label values

- **WHEN** `endpoints.labelValues` is `https://prom.example/`, and `GET https://prom.example/api/v1/label/namespace/values?match[]=kube_pod_info` returns `{"status":"success","data":["shop","infra"]}`
- **THEN** the Namespace control offers the two options `shop` and `infra`

#### Scenario: A store reporting an error is not taken as an empty list

- **WHEN** the label values endpoint returns `{"status":"error","error":"query timed out"}`
- **THEN** that control offers no options, and the filter bar shows a source-unavailable indicator whose details contain `query timed out`

#### Scenario: An absent label-values endpoint offers no options

- **WHEN** the runtime config has no `endpoints.labelValues`
- **THEN** the app issues no option request at all, the four identity controls have no options but still accept custom values, and the graph still fetches and renders normally
