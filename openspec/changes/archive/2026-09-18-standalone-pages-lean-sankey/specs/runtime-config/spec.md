## MODIFIED Requirements

### Requirement: `endpoints.trace` is optional and enables only the Network fetch

The configuration document MAY carry `endpoints.trace` (string URL, optional, default absent): the URL of the network trace endpoint that the Network Sankey page fetches (`GET <trace>?hostname&from_ts&to_ts&max_hops&top_n&threshold&track_dir`, see `graph-data-source`). It is validated by exactly the same "Endpoint URL form rules" as every other `endpoints.*` value, and an empty string is treated as absent. It joins the known endpoint keys, so a document carrying it MUST NOT produce the unknown-key warning. It is independent of every other endpoint: its absence MUST NOT affect the Storage Graph or the Storage Sankey, and the absence of `endpoints.graph` / `endpoints.storageGraph` MUST NOT affect it. Under `demoMode` it is ignored like the rest of `endpoints`, and the Network Sankey renders the built-in trace fixture.

When `endpoints.trace` is absent (or empty) and `demoMode` is `false`: the Network Sankey page MUST issue no request to any URL, `/network/sankey` MUST remain reachable at its path (routing unchanged), the page shows its "trace endpoint not configured" state (`trace-empty-unconfigured`), the scope bar stays operable, the nav bar's Reload is unavailable, and the app MUST NOT show the configuration error screen.

#### Scenario: A document with trace configured

- **WHEN** the configuration document's `endpoints` contains `graph` and `"trace": "/api/v1/trace"`
- **THEN** validation passes with no console warning, and the Network Sankey's Query sends its request to `/api/v1/trace` under the page origin

#### Scenario: Trace absent disables only the Network fetch

- **WHEN** `endpoints` contains `graph` and `storageGraph` but no `trace`, and `demoMode` is `false`
- **THEN** validation passes, `/graph` and `/sankey` behave exactly as before, `/network/sankey` shows the not-configured state with the scope bar operable, and the request count to any URL while on `/network/sankey` is 0

#### Scenario: A malformed trace value fails like any endpoint

- **WHEN** `endpoints.trace` is `"api/v1/trace"` or `"//trace.example/v1/trace"`
- **THEN** config validation fails and the error screen names `endpoints.trace` and the rule it broke

#### Scenario: Empty string is absent

- **WHEN** `endpoints.trace` is `""`
- **THEN** behaviour is identical to the key being absent, and validation does not fail

### Requirement: Absent optional endpoints disable the corresponding feature

When any of `endpoints.storageGraph`, `endpoints.labelValues`, `endpoints.codeChanges`, `endpoints.configChanges`, `endpoints.dashboard` is absent (or an empty string), the feature depending on that endpoint MUST be disabled: the app MUST NOT issue any request to that endpoint, UI depending on its data MUST not render (it must not be replaced by an error message, a disabled-state button, or a spinner), and MUST NOT show the user any error. "UI depending on its data" means UI that has no purpose without it: a dropdown that accepts a custom value still has one, because the value it sends is a raw label matcher and a typed value is as valid as an enumerated one — see the `labelValues` bullet. The mapping is as follows:

- `endpoints.storageGraph` absent → the Storage Sankey page MUST NOT issue any fetch request, and replaces the diagram with a "storage graph endpoint not configured" explanatory state; `/sankey` MUST remain reachable at its path (routing unchanged), and the app MUST NOT replace the whole app with the config error screen.
- `endpoints.labelValues` absent → the Sankey's `cluster` / `namespace` narrowing controls do not render: they narrow an estate that `az` / `env` have already scoped, and with nothing to enumerate they add nothing. **The Graph view filter bar's `cluster` / `az` / `env` / `namespace` controls and the Sankey's `az` / `env` MUST still render, with an empty option list, and MUST still accept a custom value** (dropdown contract in `graph-filters`): these dimensions reach the upstream PromQL as raw label matchers, so a typed value is as usable as an enumerated one, and for the Sankey the `storage-graph` endpoint requires `az` / `env` while being independently optional from `labelValues` — removing those controls would leave a deployment that has configured `storageGraph` permanently unable to fetch, with only a hint pointing at a control that does not exist. No request is issued to any label-values URL either way. See `storage-flow-sankey` and `graph-filters`.
- `endpoints.codeChanges` absent → the node detail's code change history section does not render.
- `endpoints.configChanges` absent → the node detail's config change history section does not render.
- `endpoints.dashboard` absent → the Dashboard button does not render, and no dashboard URL prefetch is issued.

Each endpoint is judged independently: one endpoint being absent MUST NOT affect the features of other configured endpoints — in particular, `endpoints.storageGraph` being absent MUST NOT affect the Graph view; `endpoints.graph` and `endpoints.storageGraph` are two independent fetch endpoints, and each one's failure and absence do not implicate the other. Fetch and presentation behavior when an endpoint is present is governed by `graph-data-source`, `storage-flow-sankey` and `node-detail`.

#### Scenario: Only the graph endpoint configured

- **WHEN** the configuration document's `endpoints` contains only `graph`
- **THEN** the graph loads normally; when any node's detail panel is opened, the change history sections and the Dashboard button do not render, and no request is issued to code_changes / config_changes / dashboard
- **AND** the filter bar's identity dimensions render with no options and still accept a custom value; opening `/sankey` shows "storage graph endpoint not configured", and no storage-graph request is issued to any URL

#### Scenario: graph configured but storageGraph not configured

- **WHEN** `endpoints` contains `graph` and `labelValues` but no `storageGraph`
- **THEN** config validation passes, the Graph view and filter bar are fully normal; `/sankey` is reachable at its path, shows the not-configured notice, issues no request and shows no error screen

#### Scenario: storageGraph configured but labelValues not configured

- **WHEN** `endpoints` contains `graph` and `storageGraph` but no `labelValues`
- **THEN** the Sankey's `az` / `env` controls still render and accept a custom value, and once both are filled in the storage-graph request is issued; the filter bar's identity dimension controls render with no options and still accept custom values, the Sankey's `cluster` / `namespace` do not render, and no request is issued to any label-values URL

#### Scenario: Partial endpoint configuration

- **WHEN** `endpoints` contains `graph` and `dashboard`, but no `codeChanges` / `configChanges`
- **THEN** the Dashboard button operates per `node-detail`'s applicability rules, while the change history sections do not render

#### Scenario: Empty string is equivalent to absent

- **WHEN** `endpoints.dashboard` is `""`
- **THEN** behavior is exactly the same as `endpoints.dashboard` being absent, and it is not treated as a validation error
