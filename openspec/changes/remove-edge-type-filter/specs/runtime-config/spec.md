## MODIFIED Requirements

### Requirement: Config schema, types and defaults

The root of the configuration document MUST be a JSON object. The app SHALL validate every known key per the table below; any known key that is present but of invalid type or value (including `null`) is a validation failure. Absent optional keys MUST take their default.

| Key                       | Type                                | Requirement                         | Default    | Meaning                                                                                                                                                                                                                                                         |
| ------------------------- | ----------------------------------- | ----------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `endpoints`               | object                              | optional                            | `{}`       | Set of backend endpoint URLs                                                                                                                                                                                                                                    |
| `endpoints.graph`         | string (URL)                        | required when `demoMode` is `false` | none       | URL of the backend's `GET /v1/graph`, the Graph view's fetch endpoint                                                                                                                                                                                           |
| `endpoints.storageGraph`  | string (URL)                        | optional                            | absent     | URL of the backend's `GET /v1/storage-graph`, the Sankey view's fetch endpoint (**a separate endpoint from `graph`**)                                                                                                                                           |
| `endpoints.labelValues`   | string (URL)                        | optional                            | absent     | Base URL of the Prometheus-compatible HTTP API holding the pod inventory; filter options are read from `<base>/api/v1/label/<name>/values`. **A different upstream from `graph`**: the graph API does not serve that path, and pointing at it only yields a 404 |
| `endpoints.codeChanges`   | string (URL)                        | optional                            | absent     | URL of the backend's `/v1/graph/code_changes`                                                                                                                                                                                                                   |
| `endpoints.configChanges` | string (URL)                        | optional                            | absent     | URL of the backend's `/v1/graph/config_changes`                                                                                                                                                                                                                 |
| `endpoints.dashboard`     | string (URL)                        | optional                            | absent     | URL of the backend's `/dashboard`                                                                                                                                                                                                                               |
| `demoMode`                | boolean                             | optional                            | `false`    | When `true`, renders the built-in showcase fixture instead of fetching                                                                                                                                                                                          |
| `refreshIntervalSeconds`  | integer, `>= 0`                     | optional                            | `0` (off)  | Auto-refresh interval for graph data (seconds); `0` means no auto-refresh                                                                                                                                                                                       |
| `defaultLayout`           | `"fcose"` \| `"dagre"`              | optional                            | `"fcose"`  | The Graph view's initial layout algorithm; the user can switch in the app                                                                                                                                                                                       |
| `theme`                   | `"dark"` \| `"light"` \| `"system"` | optional                            | `"system"` | Initial theme; the user's in-app choice MUST take precedence over this value (see `app-shell`)                                                                                                                                                                  |

There MUST be no `endpoints.edgeTypes` key. The backend no longer serves an edge-type catalogue, so the key names nothing; a document that still carries it is handled by "Unknown keys are ignored with a warning" and MUST NOT be a validation failure.

`refreshIntervalSeconds` MUST be a JSON integer: fractions, negative numbers and numbers in string form are all validation failures. `demoMode` MUST be a JSON boolean: the strings `"true"` / `"false"` are validation failures. Enum fields MUST match exactly (case-sensitive). The app MUST NOT auto-correct any field (type coercion, trimming whitespace, adding a scheme).

#### Scenario: Minimal valid config

- **WHEN** the configuration document's content is `{ "endpoints": { "graph": "https://ksg.example/v1/graph" } }`
- **THEN** config validation passes, and `demoMode` is `false`, `refreshIntervalSeconds` is `0`, `defaultLayout` is `"fcose"`, `theme` is `"system"`, and the remaining `endpoints.*` are treated as absent

#### Scenario: Root is not an object

- **WHEN** the configuration document's content is the JSON array `[]` or the string `"x"`
- **THEN** config validation fails and the app shows the config error screen (see "Error screen when config is missing or invalid")

#### Scenario: A type error is a validation failure

- **WHEN** the configuration document contains one of `"refreshIntervalSeconds": "30"`, `"refreshIntervalSeconds": 1.5`, `"refreshIntervalSeconds": -1`, `"demoMode": "true"`, `"endpoints": "https://ksg.example"`, or `"theme": null`
- **THEN** config validation fails and the error screen names the key and the problem (for example `refreshIntervalSeconds: must be an integer >= 0`)

#### Scenario: Invalid enum value

- **WHEN** the configuration document contains `"defaultLayout": "cola"` or `"theme": "auto"` or `"theme": "Dark"`
- **THEN** config validation fails and the error screen names the key and the allowed values

#### Scenario: Auto-refresh interval takes effect

- **WHEN** the configuration document contains `"refreshIntervalSeconds": 30` and `demoMode` is `false`
- **THEN** the app refetches graph data every 30 seconds (refresh behavior and status presentation are in `app-shell`)

### Requirement: Absent optional endpoints disable the corresponding feature

When any of `endpoints.storageGraph`, `endpoints.labelValues`, `endpoints.codeChanges`, `endpoints.configChanges`, `endpoints.dashboard` is absent (or an empty string), the feature depending on that endpoint MUST be disabled: the app MUST NOT issue any request to that endpoint, UI depending on its data MUST not render (it must not be replaced by an error message, a disabled-state button, or a spinner), and MUST NOT show the user any error. "UI depending on its data" means UI that has no purpose without it: a dropdown that accepts a custom value still has one, because the value it sends is a raw label matcher and a typed value is as valid as an enumerated one — see the `labelValues` bullet. The mapping is as follows:

- `endpoints.storageGraph` absent → the Sankey view MUST NOT issue any fetch request, and replaces the diagram with a "storage graph endpoint not configured" explanatory state; the nav bar's Sankey link MUST remain reachable (routing unchanged), and MUST NOT replace the whole app with the config error screen.
- `endpoints.labelValues` absent → the Sankey's `cluster` / `namespace` narrowing controls do not render: they narrow an estate that `az` / `env` have already scoped, and with nothing to enumerate they add nothing. **The Graph view filter bar's `cluster` / `az` / `env` / `namespace` controls and the Sankey's `az` / `env` MUST still render, with an empty option list, and MUST still accept a custom value** (dropdown contract in `graph-filters`): these dimensions reach the upstream PromQL as raw label matchers, so a typed value is as usable as an enumerated one, and for the Sankey the `storage-graph` endpoint requires `az` / `env` while being independently optional from `labelValues` — removing those controls would leave a deployment that has configured `storageGraph` permanently unable to fetch, with only a hint pointing at a control that does not exist. No request is issued to any label-values URL either way. See `storage-flow-sankey` and `graph-filters`.
- `endpoints.codeChanges` absent → the node detail's code change history section does not render.
- `endpoints.configChanges` absent → the node detail's config change history section does not render.
- `endpoints.dashboard` absent → the Dashboard button does not render, and no dashboard URL prefetch is issued.

Each endpoint is judged independently: one endpoint being absent MUST NOT affect the features of other configured endpoints — in particular, `endpoints.storageGraph` being absent MUST NOT affect the Graph view; `endpoints.graph` and `endpoints.storageGraph` are two independent fetch endpoints, and each one's failure and absence do not implicate the other. Fetch and presentation behavior when an endpoint is present is governed by `graph-data-source`, `storage-flow-sankey` and `node-detail`.

#### Scenario: Only the graph endpoint configured

- **WHEN** the configuration document's `endpoints` contains only `graph`
- **THEN** the graph loads normally; when any node's detail panel is opened, the change history sections and the Dashboard button do not render, and no request is issued to code_changes / config_changes / dashboard
- **AND** the filter bar's identity dimensions render with no options and still accept a custom value; switching to the Sankey view shows "storage graph endpoint not configured", and no storage-graph request is issued to any URL

#### Scenario: graph configured but storageGraph not configured

- **WHEN** `endpoints` contains `graph` and `labelValues` but no `storageGraph`
- **THEN** config validation passes, the Graph view and filter bar are fully normal; the Sankey view is reachable via the nav bar, shows the not-configured notice, issues no request and shows no error screen

#### Scenario: storageGraph configured but labelValues not configured

- **WHEN** `endpoints` contains `graph` and `storageGraph` but no `labelValues`
- **THEN** the Sankey's `az` / `env` controls still render and accept a custom value, and once both are filled in the storage-graph request is issued; the filter bar's identity dimension controls render with no options and still accept custom values, the Sankey's `cluster` / `namespace` do not render, and no request is issued to any label-values URL

#### Scenario: Partial endpoint configuration

- **WHEN** `endpoints` contains `graph` and `dashboard`, but no `codeChanges` / `configChanges`
- **THEN** the Dashboard button operates per `node-detail`'s applicability rules, while the change history sections do not render

#### Scenario: Empty string is equivalent to absent

- **WHEN** `endpoints.dashboard` is `""`
- **THEN** behavior is exactly the same as `endpoints.dashboard` being absent, and it is not treated as a validation error

### Requirement: Unknown keys are ignored with a warning

When a key not defined by this contract appears at the configuration document's root level or under `endpoints`, the app MUST ignore that key, MUST NOT treat it as a validation failure, and MUST emit one warning to the browser console naming the ignored key (as a full path, such as `endpoints.metrics`).

#### Scenario: Unknown key at root level

- **WHEN** the configuration document contains `"title": "Prod"` (an undefined key) and the rest of its content is valid
- **THEN** config validation passes, the app starts normally, and the console shows one warning stating that `title` was ignored

#### Scenario: Unknown key under endpoints

- **WHEN** the configuration document's `endpoints` contains `"metrics": "/api/metrics"`
- **THEN** config validation passes, the console shows one warning stating that `endpoints.metrics` was ignored, and the app issues no request to that URL

#### Scenario: A deployment still carrying edgeTypes keeps working

- **WHEN** the configuration document's `endpoints` contains `graph` and a left-over `"edgeTypes": "/api/v1/edge-types"`
- **THEN** config validation passes, the console shows one warning stating that `endpoints.edgeTypes` was ignored, the app issues no request to that URL, and the filter bar renders without an Edge type control
