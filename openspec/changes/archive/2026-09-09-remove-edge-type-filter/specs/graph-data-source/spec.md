## MODIFIED Requirements

### Requirement: graph request parameter assembly (time range and filters)

On each fetch to `endpoints.graph`, the app SHALL assemble query parameters from the **view time range** (see `app-shell`) and the Graph page's filter selections, appended after the configured URL; the filter and time-range values are read from the current route's URL query (see `app-shell` and `graph-filters`):

- `start` / `end`: MUST be resolved from the view time range to Unix seconds **at send time** and MUST always be sent. A relative window (such as `6h`) MUST NOT be frozen to fixed values at selection time — each request re-reads the clock, otherwise the window stops moving, eventually falls outside the store's retention, and the backend returns an empty graph indistinguishable from a "broken pipeline".
- `prune`: MUST always be sent as `true` / `false` (even at the default value), so that a captured request can attest its own projection.
- `cluster` / `az` / `env` / `namespace`: each dimension is a string list, sent as a **repeated parameter of the same name** when non-empty (the backend ORs within a name and ANDs across parameters); an empty list MUST NOT send that parameter at all.
- Parameters beyond the above MUST NOT be sent. In particular `edge_type` MUST NOT be sent: the backend no longer supports it and ignores unknown parameters rather than rejecting them, so a request carrying it would claim a narrowing that never happens.

A change of **selection** (time-range option, any filter dimension, `prune`) MUST trigger one refetch; the **clock advancing** by itself MUST NOT trigger any request — the refetch decision MUST be keyed on the selection and not on the assembled URL, otherwise a relative window would produce a different URL on every render and refetch endlessly.

When the backend rejects a request with 400 (such as `missing_start` / `invalid_range`), the app MUST present the backend-reported `reason` and message in the error state of "Loading and error state propagation", and MUST NOT silently retry or degrade to demo data.

#### Scenario: Relative window re-resolved on every request

- **WHEN** the view time range is `6h`, and the app fetches once at `T` and once at `T+30s` (auto-refresh)
- **THEN** the two requests' `start` / `end` differ, being `[T-6h, T]` and `[T+30s-6h, T+30s]` respectively, rather than the same frozen pair

#### Scenario: Filters sent as repeated parameters, empty dimensions not sent

- **WHEN** the filters are `cluster: []`, `az: ['zone-a']`, `env: ['prod', 'dev']`, `namespace: []`, `prune: false`
- **THEN** the request contains `az=zone-a&env=prod&env=dev&prune=false` plus `start` / `end`, and contains no `cluster`, `namespace` or `edge_type` parameter at all

#### Scenario: Clock advancing triggers no request

- **WHEN** the view time range is `1h` with no selection change, and the component re-renders repeatedly
- **THEN** the app issues no new graph request

#### Scenario: Backend 400 presented as error state

- **WHEN** the backend responds with 400 and `reason: "invalid_range"`
- **THEN** the data status is `error`, the error message exposes that `reason`, and existing data (if any) is retained per "Reload and auto-refresh"

### Requirement: storage-graph fetch (`GET endpoints.storageGraph`)

The Sankey view's data SHALL come from an independent `GET` request to `endpoints.storageGraph` (header carrying `Accept: application/json`), which together with `endpoints.graph` forms **two unrelated data sources**: their in-flight requests, loading / error states, last successful load times and retries are all independent. The response body MUST be handed as `unknown` to the **same** normalize boundary (the two endpoints' bodies share one shape contract).

The request MUST be **lazy**: the first request is issued only when the Sankey page is mounted and both `az` and `env` are selected (brought in by the URL, auto-preselected or selected by the user); while the page is not mounted, no storage-graph request MUST be issued; unmounting the page MUST abort the in-flight request and discard its result.

Query parameters:

- `start` / `end`: the same rule as the graph request (view time range, resolved at send time, always sent).
- `az` / `env`: MUST **each send exactly one value**. The backend answers a missing value with 400 `missing_az` / `missing_env` and a repeated value with 400 `invalid_scope`, so the app MUST **not issue a request** until both are selected, MUST NOT send an empty value, MUST NOT send multiple values, and MUST NOT pick one on its own.
- `cluster` / `namespace`: optional, repeatable narrowing conditions, sent as repeated parameters of the same name when non-empty.
- Root selectors: `ontap_cluster` / `node` / `aggr` / `svm` / `pod`, each a repeatable string list, sent as repeated parameters of the same name when non-empty; a `pod` value MUST take the form `<namespace>/<pod-name>` (before sending, the app MUST verify there is exactly one `/` and both segments are non-empty; an invalid value is not sent and the control prompts inline). All empty is equivalent to "the full storage flow of that estate".
- `prune` MUST NOT be sent (the backend would ignore it, but sending it would mislead a reader of a captured request).

Any change to `az` / `env` / root / `cluster` / `namespace` MUST trigger one refetch (while the page is mounted); the source of truth for these selections is the current route's URL query (see `app-shell` and `storage-flow-sankey`); as with the graph request, the clock advancing by itself MUST NOT trigger a request. A backend 400's `reason` MUST be presented verbatim in the error state.

When `demoMode` is `true`, the app SHALL feed a second built-in fixture (`/v1/storage-graph` shape, likewise of type `WireGraph`) into the same normalize boundary, and MUST NOT issue any request; the fixture content MUST NOT change with the `az` / `env` / root selection. When `demoMode` is `false` and `endpoints.storageGraph` is missing, no request MUST be issued, and the Sankey view presents the not-configured state per runtime-config's absence rules (not the configuration error screen).

#### Scenario: First request only once az / env are both present

- **WHEN** the user opens `/sankey?az=zone-a` and `env` is not yet selected
- **THEN** the app issues no storage-graph request; once the user then selects `env: prod`, the app issues exactly one request whose query string contains `az=zone-a&env=prod` plus `start` / `end`, and contains no `prune`

#### Scenario: No fetch without entering the Sankey view

- **WHEN** the user stays on `/graph` (the Sankey page is not mounted) and the graph data completes several auto-refreshes
- **THEN** the number of requests to `endpoints.storageGraph` during that time is 0

#### Scenario: Roots sent as repeated parameters and may be mixed

- **WHEN** the user selects the roots `aggr: ['aggr1']` and `pod: ['shop/orders-0']`
- **THEN** the request contains `aggr=aggr1&pod=shop%2Forders-0`, both sent together (the intersection semantics of the two sides are decided by the backend; the app does no filtering of its own)

#### Scenario: Invalid pod root not sent

- **WHEN** the user enters `orders-0` (no `/`) in the pod root
- **THEN** the app does not add it to the request, the control prompts inline that the form must be `<namespace>/<pod>`, and no request is issued that the backend would reject with 400 `invalid_scope`

#### Scenario: Errors of the two sources do not affect each other

- **WHEN** the storage-graph request responds with HTTP 500 while the graph request succeeds
- **THEN** the Sankey view presents its own error state, and the Graph view's data and state are completely unaffected; and vice versa
