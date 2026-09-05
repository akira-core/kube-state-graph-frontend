## Purpose

Defines the graph filtering sent to the backend: a row of filter controls below the nav bar (cluster / AZ / env / namespace / edge type and projection), how they become query parameters of `endpoints.graph`, where the options are enumerated from (the label values of the pod inventory and the backend's edge-type catalogue), and the behaviour when an option source fails. This capability replaces what Grafana dashboard variables did. The controls are presented with the **dropdown interaction of Grafana dashboard variables** (this contract is also shared by the estate / narrowing selectors of `storage-flow-sankey`), and the selection is synced to the URL query of the current route. It is unrelated to `element-filter` (the visual filtering on the legend): the former decides what the backend returns, the latter only visually refines the graph already returned.

## ADDED Requirements

### Requirement: Filter bar and its controls

Outside demo mode, the app SHALL display a fixed-height **filter bar** below the nav bar and above the view area, with the following controls, each of which MUST have an accessible name and be operable by keyboard:

1. Four **multi-select dropdown** controls **Cluster**, **AZ**, **Env**, **Namespace** (identity dimensions; custom values allowed);
2. An **Edge type** multi-select dropdown control (custom values **not** allowed — the backend returns 400 for unregistered values);
3. A **Projection** single-select control, whose two options are `Traffic graph` (mapping to `prune=true`, the default) and `Full inventory` (mapping to `prune=false`);
4. A **Clear** action, restoring every selection to its default (the five lists emptied, projection back to `Traffic graph`); it MUST be disabled when already at the default.

When `demoMode` is `true` the filter bar MUST NOT be shown, and the app MUST NOT read or write any filter-related query parameters — demo mode renders the bundled fixture, and there is no backend to narrow.

A value already selected in some dimension (whether from user action or from the URL), even when it is not in that dimension's option list (e.g. the namespace has been emptied, the cluster has gone offline, the options have not loaded yet, the value is custom), MUST remain in the list and keep its selected styling, and MUST be marked as **unlisted** (on both the pill and the list row): removing it from the list would silently widen the filter scope while the control still claims the filter is in effect.

#### Scenario: Demo mode does not show the filter bar

- **WHEN** `demoMode` in the runtime config is `true`
- **THEN** the filter bar is absent from the DOM, and the app issues no request to `endpoints.labelValues` / `endpoints.edgeTypes`

#### Scenario: Clear restores the defaults

- **WHEN** the user selects two namespaces and changes the projection to `Full inventory`, then presses Clear
- **THEN** all five lists are emptied, the projection returns to `Traffic graph`, and Clear is immediately disabled

#### Scenario: A selected value that has disappeared stays in the list

- **WHEN** the user selects namespace `shop`, and afterwards the option source no longer reports `shop`
- **THEN** `shop` still appears in the Namespace control and remains selected, and the filter scope is unchanged

### Requirement: Interaction contract of the dropdown control (Grafana style)

Each dropdown control SHALL consist of a **trigger** and a **popover**, mimicking the dropdown of Grafana dashboard variables:

- **Trigger**: a button carrying the dimension label, whose accessible name is that dimension name. With no selection it shows `All`; with a selection it shows each selected value as a pill, each pill carrying a removable `×`; with more than two it shows the first two pills and a `+N` summary. Click, `Enter`, `Space` or `↓` MUST open the popover.
- **Popover**: on open, focus MUST land on the **search input** at the top; typing filters the list by case-insensitive substring. The list is a `listbox`: in multi-select each row is a checkbox row, with a fixed `All` row at the top (shown checked when nothing is selected; activating it MUST empty that dimension); in single-select each row is a plain row, with the current value marked. `↑` / `↓` move, `Enter` toggles (multi-select) or selects and closes (single-select), `Esc` closes and returns focus to the trigger, `Tab` and clicking outside close. After a multi-select toggle the popover MUST stay open.
- **Custom value** (dimensions that allow it): when the search text is non-empty and does not exactly match any option, a "Use "<text>"" row MUST appear at the bottom of the list; activating it MUST add that text to the selection (multi-select) or set it as the selection (single-select), marked as unlisted. Dimensions that do not allow custom values MUST NOT show this row — `edge_type` is the only one, because its catalogue and the backend validation come from the same registry.
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

#### Scenario: Edge type offers no custom value

- **WHEN** the user types `bogus-edge` in the Edge type dropdown
- **THEN** the list is empty and there is no "Use "bogus-edge"" row, `Enter` does not change the selection, and the graph request carries no `edge_type`

#### Scenario: Keyboard close and focus restoration

- **WHEN** the user opens the AZ dropdown by keyboard and then presses `Esc`
- **THEN** the popover closes, focus returns to the AZ trigger, and the selection is unchanged

#### Scenario: Pill overflow summary

- **WHEN** Namespace has four values selected
- **THEN** the trigger shows the first two pills and `+2`; after removing one of the pills the graph request updates immediately

### Requirement: Filtering is performed by the backend, not the frontend

The filter selection MUST be sent to `endpoints.graph` as query parameters, and MUST NOT be applied on the frontend to the graph already returned: what is being proven here is precisely that `cluster` / `az` / `env` / `namespace` reach the upstream PromQL as raw label matchers. The parameter mapping is `cluster` / `az` / `env` / `namespace` / `edge_type` (the frontend field `edgeType` is renamed where the URL is built, the only such place) and `prune`. Repeating the same parameter name means OR; between different parameter names it is AND. A dimension whose list is empty MUST NOT appear in the query string at all; `prune` MUST always be carried (see `graph-data-source`).

Changing any filter control MUST refetch `endpoints.graph` with the new selection, and take the same path as "reload": the existing graph stays visible while the request is in flight, the layout is not re-run, and the view state is not reset.

The filter selection MUST be synced to the URL query of the current route (rules in the "view routing" of `app-shell`): the parameter names are the same as those sent to the backend (`cluster` / `az` / `env` / `namespace` / `edge_type` / `prune`), multiple values are expressed as repeated keys; a dimension whose list is empty is not written, and `prune` is written only when `false` (the default `true` is not written). Changes update with replace. On page mount the initial selection MUST be read from the URL — **the URL is the source of truth for these selections**; a value the URL provides that is not in the option list MUST still be applied and marked as unlisted (the options may not have loaded yet, the source may have failed, or the value was custom to begin with). The filter selection MUST NOT be written to browser local storage, and MUST NOT be written to the runtime config: an invisible filter applied automatically would present a narrowed estate as the whole of it, exactly the confusion between "there is nothing here" and "nothing is shown here" that the projection control is meant to avoid; a filter in the URL is visible in the address bar and on the controls at the same time, and a clean `/graph` means no filter.

The kind / edge-type display toggles of `element-filter`, the ingress toggle, search, pod-parent mode and collapse state MUST NOT affect any parameter here, and vice versa.

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

### Requirement: Option sources

The options of the four identity dimensions SHALL be read from the Prometheus-compatible HTTP API root that `endpoints.labelValues` points to: each dimension requests `<root>/api/v1/label/<dimension>/values?match[]=kube_pod_info`, the response MUST be validated against the Prometheus envelope `{"status":"success","data":[…]}`, and `data` MUST be an array of strings. When `status` is not `success` it MUST be treated as a failure and its `error` reported, and MUST NOT be read as an empty list — an empty dropdown and a broken store must not look the same.

The series `kube_pod_info` MUST be fixed, not configurable: it is the definition of the Kubernetes pod inventory, and it is precisely the label family the backend matches against when it pushes `?cluster=` / `?az=` / `?env=` / `?namespace=` into the upstream query. The options MUST NOT instead be derived from the graph response — the response carries the composed `<az>-<env>-<cluster>` identities, and sending one back as `?cluster=` would match no series and yield an empty graph with a 200; `az` and `env` are, more fundamentally, not in the response at all.

The Edge type options SHALL be read from `endpoints.edgeTypes` (the backend's `/v1/edge-types`), with response shape `{ "edge_types": [{ "type": "…" }, …] }`; any element missing `type` is a failure. That catalogue and the validation of `?edge_type=` are the same upstream registry, so the values it offers are necessarily values the backend accepts; a list hard-coded in the frontend will sooner or later offer a value that earns a 400.

Both endpoints are optional: when absent (or an empty string), the corresponding control MUST offer no options, and MUST NOT issue a request because of it; the identity-dimension controls can still take custom values, while the Edge type control has no options and no custom value. Options MUST be loaded once per source, not reloaded with every graph request: options track the inventory and the registry, neither of which changes with the projection or the current selection; rebuilding them per request would shrink the namespace list to exactly the values contained in that pruned graph, and the user could never widen the filter back out.

#### Scenario: Identity dimensions enumerate from label values

- **WHEN** `endpoints.labelValues` is `https://prom.example/`, and `GET https://prom.example/api/v1/label/namespace/values?match[]=kube_pod_info` returns `{"status":"success","data":["shop","infra"]}`
- **THEN** the Namespace control offers the two options `shop` and `infra`

#### Scenario: A store reporting an error is not taken as an empty list

- **WHEN** the label values endpoint returns `{"status":"error","error":"query timed out"}`
- **THEN** that control offers no options, and the filter bar shows a source-unavailable indicator whose details contain `query timed out`

#### Scenario: Edge type enumerates from the backend catalogue

- **WHEN** `endpoints.edgeTypes` returns `{"edge_types":[{"type":"pod-calls-service"},{"type":"pvc-to-netapp-aggr"}]}`
- **THEN** the Edge type control offers exactly these two values

#### Scenario: An absent endpoint offers no options

- **WHEN** the runtime config has no `endpoints.edgeTypes`
- **THEN** the app issues no request for edge type, that control has no options, and the other controls are unaffected

### Requirement: An option source failure must not become a missing graph

Failure of any option source (HTTP non-2xx, network error, JSON parse failure, shape mismatch, Prometheus `status` not `success`) MUST NOT make the graph fetch fail, MUST NOT block the filter bar from rendering, and MUST NOT throw an uncaught error. The failed dimension MUST be presented as a control with no options that still accepts custom values (except edge type: no options and no custom value), and the filter bar MUST carry an indicator stating how many sources are unavailable, whose details (one line per failed source, with URL and reason) MUST be readable by the user. A vanished dropdown must never become a vanished graph.

#### Scenario: One source fails, the rest proceed as usual

- **WHEN** `endpoints.labelValues` returns 503, while `endpoints.edgeTypes` responds normally
- **THEN** the four identity controls have no options but accept custom values, the Edge type control offers options normally, the filter bar shows an indicator of 4 sources unavailable, and the graph still fetches and renders normally with the current selection

#### Scenario: Failure details are readable

- **WHEN** some source fails with `GET https://prom.example/api/v1/label/az/values…: data is not an array`
- **THEN** that message is readable from the filter bar's source indicator, not only logged to the console
