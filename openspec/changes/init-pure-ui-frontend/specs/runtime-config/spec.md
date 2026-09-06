## Purpose

Defines the SPA's runtime config contract: at startup the app reads all backend endpoint URLs, demo mode, auto-refresh interval, default layout and initial theme from a configuration document, and this spec governs the schema, validation rules, missing-value and error behavior, so that the same build artifact (the same container image) can be deployed to any environment on the strength of the configuration document alone.

## ADDED Requirements

### Requirement: Configuration document location and load timing

The app SHALL, on every full page load and before rendering any view, fetch one JSON configuration document via HTTP `GET`; its path is `config.json` under the app base URL (`/config.json` when the app is deployed at `/`, `/ksg/config.json` when deployed at `/ksg/`). Inside the container the configuration document is provided by a Kubernetes ConfigMap mount (see `container-deployment` for the mount method).

The configuration document MUST be read only once per full page load; the app MUST NOT poll or re-read the config within a session, MUST NOT write the config content to browser local storage or reuse a previous copy on subsequent loads — a change to the configuration document MUST take effect on the next full page load.

The configuration document's path MUST NOT be overridable via the page URL (query string, hash) or any user-controllable input: no link may cause the app to read its config from another source.

#### Scenario: Config is fetched before views render at startup

- **WHEN** the user opens any URL of the app
- **THEN** the app issues exactly one `GET <base>/config.json` before issuing any backend data request or rendering any view; until config parsing completes it MUST NOT issue any request to `endpoints.*`

#### Scenario: Config changes take effect on the next full load

- **WHEN** a ConfigMap update changes the content of `config.json` while the user's tab is still running
- **THEN** the running session keeps using the originally loaded config; after the user fully refreshes the page, the app refetches the configuration document and operates per the new content

#### Scenario: The page URL cannot change the config source

- **WHEN** the user opens a URL of the form `/graph?config=https://evil.example/c.json`
- **THEN** the app still reads only `<base>/config.json`, and that query parameter does not affect the config source

### Requirement: Config schema, types and defaults

The root of the configuration document MUST be a JSON object. The app SHALL validate every known key per the table below; any known key that is present but of invalid type or value (including `null`) is a validation failure. Absent optional keys MUST take their default.

| Key                       | Type                                | Requirement                         | Default    | Meaning                                                                                                                                                                                                                                                         |
| ------------------------- | ----------------------------------- | ----------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `endpoints`               | object                              | optional                            | `{}`       | Set of backend endpoint URLs                                                                                                                                                                                                                                    |
| `endpoints.graph`         | string (URL)                        | required when `demoMode` is `false` | none       | URL of the backend's `GET /v1/graph`, the Graph view's fetch endpoint                                                                                                                                                                                           |
| `endpoints.storageGraph`  | string (URL)                        | optional                            | absent     | URL of the backend's `GET /v1/storage-graph`, the Sankey view's fetch endpoint (**a separate endpoint from `graph`**)                                                                                                                                           |
| `endpoints.labelValues`   | string (URL)                        | optional                            | absent     | Base URL of the Prometheus-compatible HTTP API holding the pod inventory; filter options are read from `<base>/api/v1/label/<name>/values`. **A different upstream from `graph`**: the graph API does not serve that path, and pointing at it only yields a 404 |
| `endpoints.edgeTypes`     | string (URL)                        | optional                            | absent     | URL of the backend's `/v1/edge-types`, the source of `edge_type` filter options                                                                                                                                                                                 |
| `endpoints.codeChanges`   | string (URL)                        | optional                            | absent     | URL of the backend's `/v1/graph/code_changes`                                                                                                                                                                                                                   |
| `endpoints.configChanges` | string (URL)                        | optional                            | absent     | URL of the backend's `/v1/graph/config_changes`                                                                                                                                                                                                                 |
| `endpoints.dashboard`     | string (URL)                        | optional                            | absent     | URL of the backend's `/dashboard`                                                                                                                                                                                                                               |
| `demoMode`                | boolean                             | optional                            | `false`    | When `true`, renders the built-in showcase fixture instead of fetching                                                                                                                                                                                          |
| `refreshIntervalSeconds`  | integer, `>= 0`                     | optional                            | `0` (off)  | Auto-refresh interval for graph data (seconds); `0` means no auto-refresh                                                                                                                                                                                       |
| `defaultLayout`           | `"fcose"` \| `"dagre"`              | optional                            | `"fcose"`  | The Graph view's initial layout algorithm; the user can switch in the app                                                                                                                                                                                       |
| `theme`                   | `"dark"` \| `"light"` \| `"system"` | optional                            | `"system"` | Initial theme; the user's in-app choice MUST take precedence over this value (see `app-shell`)                                                                                                                                                                  |

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

### Requirement: Endpoint URL form rules

Every `endpoints.*` value MUST take one of the following two forms, otherwise it is a validation failure:

1. **Absolute URL**: scheme is `http` or `https` (case-insensitive) and includes a host, for example `https://ksg.example/v1/graph`.
2. **Root-relative path**: a path beginning with a single `/`, for example `/api/v1/graph`; the app MUST resolve it against the current page's origin (`scheme://host[:port]`), not the app base path — when the app is deployed at `https://host/ksg/`, `/api/v1/graph` resolves to `https://host/api/v1/graph`. This form is for a same-origin reverse proxy.

The following forms MUST be judged validation failures: relative paths not beginning with `/` (`api/v1/graph`, `./graph`, `../graph`), protocol-relative URLs (`//host/path`), non-`http(s)` schemes (`ftp:`, `javascript:`, `file:`, `data:`), strings that cannot be parsed as a URL, and any non-string value.

The empty string `""` MUST be treated as absent for an optional endpoint (feature disabled, not an error); for `endpoints.graph` it MUST be treated as absent (a validation failure when `demoMode` is `false`). URL values MUST be used as-is (including their query string); how each consumer appends parameters after it is governed by the corresponding capability.

#### Scenario: Absolute https URL passes validation

- **WHEN** `endpoints.graph` is `"https://ksg.example/v1/graph"`
- **THEN** validation passes and graph data requests go to that URL

#### Scenario: Root-relative path resolves against the page origin

- **WHEN** the app runs at `https://ops.example/ksg/graph`, and `endpoints.graph` is `"/api/v1/graph"`
- **THEN** validation passes and graph data requests go to `https://ops.example/api/v1/graph`

#### Scenario: Relative path not beginning with a slash is rejected

- **WHEN** `endpoints.dashboard` is `"api/dashboard"`
- **THEN** config validation fails and the error screen shows that `endpoints.dashboard` must be an absolute http(s) URL or a path beginning with `/`

#### Scenario: Non-http(s) schemes and protocol-relative URLs are rejected

- **WHEN** any `endpoints.*` is `"ftp://ksg.example/v1/graph"`, `"javascript:alert(1)"` or `"//ksg.example/v1/graph"`
- **THEN** config validation fails and the error screen names the key and the problem

#### Scenario: Non-string values are rejected

- **WHEN** any `endpoints.*` is a number, object, array or `null`
- **THEN** config validation fails and the error screen names the key and the problem

### Requirement: endpoints.graph is the required endpoint outside demo mode

When `demoMode` is `false` (including the default when absent), `endpoints.graph` MUST be present and a valid URL; absent, empty string or invalid are all validation failures, the app MUST show the config error screen, and MUST NOT substitute demo mode. When `demoMode` is `true`, the absence of `endpoints.graph` MUST NOT be treated as an error.

#### Scenario: Graph endpoint missing outside demo mode

- **WHEN** the configuration document is `{ "theme": "dark" }` (no `endpoints.graph`, `demoMode` absent)
- **THEN** config validation fails, the error screen states that `endpoints.graph` is required when `demoMode` is `false`, and the app MUST NOT render the fixture

#### Scenario: Demo mode allows a missing graph endpoint

- **WHEN** the configuration document is `{ "demoMode": true }`
- **THEN** config validation passes and the app renders with the built-in fixture

### Requirement: Absent optional endpoints disable the corresponding feature

When any of `endpoints.storageGraph`, `endpoints.labelValues`, `endpoints.edgeTypes`, `endpoints.codeChanges`, `endpoints.configChanges`, `endpoints.dashboard` is absent (or an empty string), the feature depending on that endpoint MUST be disabled: the app MUST NOT issue any request to that endpoint, UI depending on its data MUST not render (it must not be replaced by an error message, a disabled-state button, or a spinner), and MUST NOT show the user any error. "UI depending on its data" means UI that has no purpose without it: a dropdown that accepts a custom value still has one, because the value it sends is a raw label matcher and a typed value is as valid as an enumerated one — see the `labelValues` bullet. The mapping is as follows:

- `endpoints.storageGraph` absent → the Sankey view MUST NOT issue any fetch request, and replaces the diagram with a "storage graph endpoint not configured" explanatory state; the nav bar's Sankey link MUST remain reachable (routing unchanged), and MUST NOT replace the whole app with the config error screen.
- `endpoints.labelValues` absent → the Sankey's `cluster` / `namespace` narrowing controls do not render: they narrow an estate that `az` / `env` have already scoped, and with nothing to enumerate they add nothing. **The Graph view filter bar's `cluster` / `az` / `env` / `namespace` controls and the Sankey's `az` / `env` MUST still render, with an empty option list, and MUST still accept a custom value** (dropdown contract in `graph-filters`): these dimensions reach the upstream PromQL as raw label matchers, so a typed value is as usable as an enumerated one, and for the Sankey the `storage-graph` endpoint requires `az` / `env` while being independently optional from `labelValues` — removing those controls would leave a deployment that has configured `storageGraph` permanently unable to fetch, with only a hint pointing at a control that does not exist. No request is issued to any label-values URL either way. See `storage-flow-sankey` and `graph-filters`.
- `endpoints.edgeTypes` absent → the filter bar's `edge_type` control renders with no options and offers **no** custom value — its catalogue and the backend's validation of `?edge_type=` are the same registry, so a typed value could only ever earn a 400. Nothing being selectable, graph requests carry no `edge_type` parameter.
- `endpoints.codeChanges` absent → the node detail's code change history section does not render.
- `endpoints.configChanges` absent → the node detail's config change history section does not render.
- `endpoints.dashboard` absent → the Dashboard button does not render, and no dashboard URL prefetch is issued.

Each endpoint is judged independently: one endpoint being absent MUST NOT affect the features of other configured endpoints — in particular, `endpoints.storageGraph` being absent MUST NOT affect the Graph view; `endpoints.graph` and `endpoints.storageGraph` are two independent fetch endpoints, and each one's failure and absence do not implicate the other. Fetch and presentation behavior when an endpoint is present is governed by `graph-data-source`, `storage-flow-sankey` and `node-detail`.

#### Scenario: Only the graph endpoint configured

- **WHEN** the configuration document's `endpoints` contains only `graph`
- **THEN** the graph loads normally; when any node's detail panel is opened, the change history sections and the Dashboard button do not render, and no request is issued to code_changes / config_changes / dashboard
- **AND** the filter bar's identity dimensions render with no options and still accept a custom value, while `edge_type` renders with no options and no custom value; switching to the Sankey view shows "storage graph endpoint not configured", and no storage-graph request is issued to any URL

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

### Requirement: demoMode semantics

When `demoMode` is `true`, the app SHALL use the built-in showcase fixture as its data source — the Graph view uses a fixture in the `/v1/graph` shape, the Sankey view uses a fixture in the `/v1/storage-graph` shape (two of them, see `graph-data-source`) — MUST NOT issue requests to any backend endpoint, and MUST continuously and prominently badge in the UI that demo mode is active (presentation is in `app-shell`). In demo mode the Sankey's `az` / `env` and root controls MUST remain operable, but their changes MUST NOT trigger any network request, and the fixture content does not change with them. The entire `endpoints` object MUST then be ignored: its absence, the absence of its sub-keys and their values neither take part in validation nor are used. Features depending on optional endpoints MUST be handled per "Absent optional endpoints disable the corresponding feature" (treating all `endpoints.*` as absent).

`demoMode` exempts only the validation of `endpoints`; the other fields (`refreshIntervalSeconds`, `defaultLayout`, `theme`) MUST be validated and take effect as usual in demo mode. The "reload" action and auto-refresh in demo mode MUST NOT issue network requests, but instead regenerate the data from the same fixture.

#### Scenario: Demo mode does not fetch and is badged

- **WHEN** the configuration document is `{ "demoMode": true, "endpoints": { "graph": "https://ksg.example/v1/graph" } }`
- **THEN** the app renders the fixture graph, issues no request to `https://ksg.example/v1/graph` or any endpoint for the whole session, and the UI shows the demo mode badge

#### Scenario: Demo mode ignores invalid endpoints

- **WHEN** the configuration document is `{ "demoMode": true, "endpoints": { "graph": "not a url" } }`
- **THEN** config validation passes (`endpoints` is ignored) and the app renders with the fixture

#### Scenario: Demo mode still validates other fields

- **WHEN** the configuration document is `{ "demoMode": true, "theme": "blue" }`
- **THEN** config validation fails and the app shows the config error screen

#### Scenario: Endpoint-dependent features disabled in demo mode

- **WHEN** `demoMode` is `true` and the user opens some node's detail panel
- **THEN** the change history sections and the Dashboard button do not render, and no request is issued

### Requirement: Error screen when config is missing or invalid

When the configuration document cannot be fetched (HTTP non-2xx, including 404), on a network error, when the content is not valid JSON, or on validation failure, the app MUST render a full-screen config error screen and MUST NOT render anything else (no nav bar, no view, no data request). The error screen MUST show:

- the configuration document path actually requested (for example `/config.json` or `/ksg/config.json`);
- a description of the first problem: the HTTP status code (such as `HTTP 404`), the JSON parse error, or the key and reason of the first validation problem.

The app MUST NOT silently fall back to demo mode in any of the above cases: a 404 or an empty response MUST NOT be interpreted as "not configured → demo". The error screen SHALL offer a "Retry" action that reissues the configuration document request once and re-runs the startup flow per the result. The error screen MUST be readable in both the dark and light themes.

#### Scenario: Configuration document 404

- **WHEN** `GET /config.json` responds HTTP 404
- **THEN** the app shows the full-screen config error screen, containing `/config.json` and `HTTP 404`, renders no nav bar or any view, and does not render the fixture either

#### Scenario: Configuration document is not valid JSON

- **WHEN** `GET /config.json` responds HTTP 200 but the body is `{ "endpoints": ` (truncated) or an HTML page
- **THEN** the app shows the config error screen, containing the config path and an explanation of the JSON parse failure

#### Scenario: Validation failure shows only the first problem

- **WHEN** the configuration document contains both `"refreshIntervalSeconds": -1` and `"theme": "auto"`
- **THEN** the error screen shows the key and reason of one of the problems (at least one, and the first one detected), and renders no view

#### Scenario: Network error

- **WHEN** `GET /config.json` gets no response because of a network failure
- **THEN** the app shows the config error screen, containing the config path and an explanation of the connection failure

#### Scenario: Success after retry

- **WHEN** the error screen is showing, operations fixes the ConfigMap and the user clicks "Retry"
- **THEN** the app reissues `GET /config.json`; if it succeeds and validation passes, it leaves the error screen and enters the app normally

### Requirement: Unknown keys are ignored with a warning

When a key not defined by this contract appears at the configuration document's root level or under `endpoints`, the app MUST ignore that key, MUST NOT treat it as a validation failure, and MUST emit one warning to the browser console naming the ignored key (as a full path, such as `endpoints.metrics`).

#### Scenario: Unknown key at root level

- **WHEN** the configuration document contains `"title": "Prod"` (an undefined key) and the rest of its content is valid
- **THEN** config validation passes, the app starts normally, and the console shows one warning stating that `title` was ignored

#### Scenario: Unknown key under endpoints

- **WHEN** the configuration document's `endpoints` contains `"metrics": "/api/metrics"`
- **THEN** config validation passes, the console shows one warning stating that `endpoints.metrics` was ignored, and the app issues no request to that URL

### Requirement: Config source can be overridden during development

When a developer runs `npm run dev`, they SHALL be able to make the app read another configuration document or point at another backend without modifying the committed configuration document or any source code; the override mechanism exists only in the dev server and has no effect on the build artifact or the container image. When overridden, the app's startup flow MUST be exactly the same as in production — still `GET <base>/config.json`, only the dev server responds with different content. When not overridden, the dev server MUST serve the default configuration document committed in the repo, and that default MUST be `demoMode: true`, so that a clean checkout renders the full fixture graph without a backend.

#### Scenario: Starts in demo mode when not overridden

- **WHEN** a developer runs `npm run dev` on a clean checkout and opens the app
- **THEN** the app reads the committed default config, renders the fixture in demo mode, and `git status` shows the configuration document unmodified

#### Scenario: Pointing at a local backend

- **WHEN** a developer uses the dev server's override mechanism to specify a config containing `"endpoints": { "graph": "http://localhost:8080/v1/graph" }` and then runs `npm run dev`
- **THEN** the app obtains that override content from `GET <base>/config.json` and fetches from `http://localhost:8080/v1/graph`, while the content of the committed configuration document in the repo is unchanged

### Requirement: Config is not baked in at build time

The build artifact (static assets) MUST NOT contain any environment-specific backend URL, demo flag or config value from this contract; all config values MUST come only from the configuration document fetched at runtime. Differences in behavior of the same build artifact across environments MUST be caused only by the configuration document: replacing the configuration document without rebuilding MUST be sufficient to switch backends, toggle demo mode and change other settings.

#### Scenario: The same image serves different environments

- **WHEN** the same container image is deployed with two ConfigMaps whose `endpoints.graph` is `https://ksg-staging.example/v1/graph` and `https://ksg-prod.example/v1/graph` respectively
- **THEN** the two deployments each fetch from their corresponding URL, with no rebuild needed

#### Scenario: The build artifact contains no environment URL

- **WHEN** inspecting the content of all static assets produced by `npm run build`
- **THEN** they contain no backend hostname or `endpoints.*` value; changing an environment URL requires no change to the build artifact
