## ADDED Requirements

### Requirement: `endpoints.trace` is optional and enables only the Network fetch

The configuration document MAY carry `endpoints.trace` (string URL, optional, default absent): the URL of the network trace endpoint that the Network category's page fetches (`GET <trace>?hostname&from_ts&to_ts&max_hops&top_n&threshold&track_dir`, see `graph-data-source`). It is validated by exactly the same "Endpoint URL form rules" as every other `endpoints.*` value, and an empty string is treated as absent. It joins the known endpoint keys, so a document carrying it MUST NOT produce the unknown-key warning. It is independent of every other endpoint: its absence MUST NOT affect the Graph or the storage Sankey, and the absence of `endpoints.graph` / `endpoints.storageGraph` MUST NOT affect it. Under `demoMode` it is ignored like the rest of `endpoints`, and the Network views render the built-in trace fixture.

When `endpoints.trace` is absent (or empty) and `demoMode` is `false`: the Network views MUST issue no request to any URL, `/network/graph` and `/network/sankey` MUST remain reachable through the nav bar (routing unchanged), the Sankey view shows its "trace endpoint not configured" state (`trace-empty-unconfigured`) and the Graph view its equivalent explanatory state, the scope bar stays operable, the nav bar's Reload is unavailable, and the app MUST NOT show the configuration error screen.

#### Scenario: A document with trace configured

- **WHEN** the configuration document's `endpoints` contains `graph` and `"trace": "/api/v1/trace"`
- **THEN** validation passes with no console warning, and the Network page's Query sends its request to `/api/v1/trace` under the page origin

#### Scenario: Trace absent disables only the Network fetch

- **WHEN** `endpoints` contains `graph` and `storageGraph` but no `trace`, and `demoMode` is `false`
- **THEN** validation passes, `/graph` and `/sankey` behave exactly as before, `/network/sankey` shows the not-configured state with the scope bar operable, and the request count to any URL while on the Network views is 0

#### Scenario: A malformed trace value fails like any endpoint

- **WHEN** `endpoints.trace` is `"api/v1/trace"` or `"//trace.example/v1/trace"`
- **THEN** config validation fails and the error screen names `endpoints.trace` and the rule it broke

#### Scenario: Empty string is absent

- **WHEN** `endpoints.trace` is `""`
- **THEN** behaviour is identical to the key being absent, and validation does not fail
