## MODIFIED Requirements

### Requirement: graph request parameter assembly (time range and filters)

On each fetch to `endpoints.graph`, the app SHALL assemble query parameters from the **applied** view time range (see `app-shell`) and the Graph page's **applied** filter selection, appended after the configured URL; both are what the last Query commit wrote to the current route's URL query (see `explicit-query`, `app-shell` and `graph-filters`):

- `start` / `end`: MUST be resolved from the applied view time range to Unix seconds **at send time** and MUST always be sent. A relative window (such as `6h`) MUST NOT be frozen to fixed values at selection time — each request re-reads the clock, otherwise the window stops moving, eventually falls outside the store's retention, and the backend returns an empty graph indistinguishable from a "broken pipeline".
- `prune`: MUST always be sent as `true` / `false` (even at the default value), so that a captured request can attest its own projection.
- `cluster` / `az` / `env` / `namespace`: each dimension is a string list, sent as a **repeated parameter of the same name** when non-empty (the backend ORs within a name and ANDs across parameters); an empty list MUST NOT send that parameter at all.
- Parameters beyond the above MUST NOT be sent. In particular `edge_type` MUST NOT be sent: the backend no longer supports it and ignores unknown parameters rather than rejecting them, so a request carrying it would claim a narrowing that never happens.

A **commit** of the draft (Query) MUST trigger exactly one request; a change of any control MUST NOT, and the **clock advancing** by itself MUST NOT trigger any request — the request decision MUST be keyed on the applied selection and not on the assembled URL, otherwise a relative window would produce a different URL on every render and refetch endlessly.

When the backend rejects a request with 400 (such as `missing_start` / `invalid_range`), the app MUST present the backend-reported `reason` and message in the error state of "Loading and error state propagation", and MUST NOT silently retry or degrade to demo data.

#### Scenario: Relative window re-resolved on every request

- **WHEN** the applied view time range is `6h`, and the app fetches once at `T` (Query) and once at `T+30s` (auto-refresh)
- **THEN** the two requests' `start` / `end` differ, being `[T-6h, T]` and `[T+30s-6h, T+30s]` respectively, rather than the same frozen pair

#### Scenario: Filters sent as repeated parameters, empty dimensions not sent

- **WHEN** the applied filters are `cluster: []`, `az: ['zone-a']`, `env: ['prod', 'dev']`, `namespace: []`, `prune: false`
- **THEN** the request contains `az=zone-a&env=prod&env=dev&prune=false` plus `start` / `end`, and contains no `cluster`, `namespace` or `edge_type` parameter at all

#### Scenario: Clock advancing triggers no request

- **WHEN** after a committed query the operator edits two filters without activating Query, and the component re-renders repeatedly over the following minute
- **THEN** the app issues no new graph request

#### Scenario: Backend 400 presented as error state

- **WHEN** the backend responds with 400 and `reason: "invalid_range"`
- **THEN** the data status is `error`, the error message exposes that `reason`, and existing data (if any) is retained per "Reload and auto-refresh"

### Requirement: storage-graph fetch (`GET endpoints.storageGraph`)

The Sankey view's data SHALL come from an independent `GET` request to `endpoints.storageGraph` (header carrying `Accept: application/json`), which together with `endpoints.graph` forms **two unrelated data sources**: their in-flight requests, loading / error states, last successful load times and retries are all independent. The response body MUST be handed as `unknown` to the **same** normalize boundary (the two endpoints' bodies share one shape contract).

The request MUST be **explicit**: the first request is issued only when the Sankey page is mounted and the operator commits a draft in which `az`, `env` and **at least one root** are present (see `explicit-query` and `storage-flow-sankey`); mounting alone, a deep link, and auto-preselection MUST NOT issue it. While the page is not mounted, no storage-graph request MUST be issued; unmounting the page MUST abort the in-flight request and discard its result.

Query parameters, built from the **applied** selection:

- `start` / `end`: the same rule as the graph request (applied view time range, resolved at send time, always sent).
- `az` / `env`: MUST **each send exactly one value**. The backend answers a missing value with 400 `missing_az` / `missing_env` and a repeated value with 400 `invalid_scope`, so the app MUST **not issue a request** until both are selected, MUST NOT send an empty value, MUST NOT send multiple values, and MUST NOT pick one on its own.
- `cluster` / `namespace`: optional, repeatable narrowing conditions, sent as repeated parameters of the same name when non-empty.
- Root selectors: `ontap_cluster` / `node` / `aggr` / `svm` / `pod`, each a repeatable string list, sent as repeated parameters of the same name when non-empty; at least one value across the five MUST be present or the request MUST NOT be issued. A `pod` value MUST take the form `<namespace>/<pod-name>` (before sending, the app MUST verify there is exactly one `/` and both segments are non-empty; an invalid value blocks the commit and the control prompts inline).
- `prune` MUST NOT be sent (the backend would ignore it, but sending it would mislead a reader of a captured request). `top_pods` MUST NOT be sent either: it is a client-side projection (see `storage-flow-sankey`) and the backend has no such parameter.

Only a commit (Query), a reload or an auto-refresh tick issues a request; a change to `az` / `env` / root / `cluster` / `namespace` edits the draft and MUST NOT (see `explicit-query`); the source of truth for the applied selection is the current route's URL query (see `app-shell` and `storage-flow-sankey`); as with the graph request, the clock advancing by itself MUST NOT trigger a request. A backend 400's `reason` MUST be presented verbatim in the error state.

When `demoMode` is `true`, the app SHALL feed a second built-in fixture (`/v1/storage-graph` shape, likewise of type `WireGraph`) into the same normalize boundary, and MUST NOT issue any request; the fixture content MUST NOT change with the `az` / `env` / root selection. When `demoMode` is `false` and `endpoints.storageGraph` is missing, no request MUST be issued, and the Sankey view presents the not-configured state per runtime-config's absence rules (not the configuration error screen).

#### Scenario: First request only once az / env are both present

- **WHEN** the user opens `/sankey?az=zone-a&env=prod` and adds root `aggr: aggr1` without activating Query
- **THEN** the app issues no storage-graph request; once the user activates Query, the app issues exactly one request whose query string contains `az=zone-a&env=prod&aggr=aggr1` plus `start` / `end`, and contains no `prune` or `top_pods`

#### Scenario: No fetch without entering the Sankey view

- **WHEN** the user stays on `/graph` (the Sankey page is not mounted) and the graph data completes several auto-refreshes
- **THEN** the number of requests to `endpoints.storageGraph` during that time is 0

#### Scenario: Roots sent as repeated parameters and may be mixed

- **WHEN** the user commits the roots `aggr: ['aggr1']` and `pod: ['shop/orders-0']`
- **THEN** the request contains `aggr=aggr1&pod=shop%2Forders-0`, both sent together (the intersection semantics of the two sides are decided by the backend; the app does no root filtering of its own)

#### Scenario: Invalid pod root not sent

- **WHEN** the user enters `orders-0` (no `/`) as a pod root
- **THEN** it is not added, the control prompts inline that the form must be `<namespace>/<pod>`, and no request is issued that the backend would reject with 400 `invalid_scope`

#### Scenario: Errors of the two sources do not affect each other

- **WHEN** the storage-graph request responds with HTTP 500 while the graph request succeeds
- **THEN** the Sankey view presents its own error state, and the Graph view's data and state are completely unaffected; and vice versa

### Requirement: Loading and error state propagation

Each data source (graph and storage-graph) SHALL expose to the rest of the app **a data state of identical shape and independent content**, containing at least `{ status, elements, errors, error, hasPayload, cancelled }`: `status` is one of `idle` / `loading` / `ready` / `error` (the app's own state; there is no external data state to rely on); `elements` are the cytoscape.js elements produced by the normalize boundary; `errors` are the normalize boundary's partial-parse warnings (for graph-view's warning banner); `error` is the user-readable error message (on fetch failure or normalize failure); `hasPayload` distinguishes "no recognizable graph payload obtained yet" from "payload loaded successfully but normalized to zero elements"; `cancelled` is `true` from a Cancel (see `explicit-query`) until the next request starts.

`idle` with `hasPayload` `false` is the **awaiting-Query** state of a mounted page that has not committed yet, and the page presents it as such (see `explicit-query`), never as loading.

Fetch failures MUST be classified case by case and produce a **named**, user-readable message:

- HTTP response not 2xx: the message MUST contain the configured URL and the HTTP status code (such as `GET https://ksg.example/v1/graph failed: 503`).
- Network error (`fetch` rejects, DNS / connection failure, CORS block): the message MUST contain the configured URL and identify it as a network error.
- Response body not valid JSON: the message MUST contain the configured URL and identify a JSON parse failure; it MUST NOT stuff the full raw body into the message.
- The normalize boundary reports a shape error (zero elements and `errors` non-empty): `error` is the first message of `errors`.

An aborted request (Cancel or unmount) is **not** a failure: it MUST NOT set `error`, MUST NOT set `status` to `error`, and MUST leave `elements` / `hasPayload` at their previous values; after a Cancel `status` returns to `ready` when a payload is held and to `idle` otherwise, with `cancelled` `true`.

`hasPayload` MUST be `false` when: no response has been obtained yet (`idle` / first `loading`), HTTP / network / JSON error; MUST be `true` once the payload has been successfully parsed as JSON and handed to the normalize boundary (including a valid empty graph `{ nodes: [], edges: [] }`, and a payload with a shape error). graph-view uses this to distinguish the three state UIs loading / error / empty, and MUST NOT present "no data obtained" as "the graph is empty".

#### Scenario: Fetch data and normalize

- **WHEN** `GET endpoints.graph` returns 2xx and the body is a valid graph payload
- **THEN** the status proceeds `loading` → `ready`, `elements` are the normalize output, `error` is `undefined`, `cancelled` is `false`, and `hasPayload` is `true`

#### Scenario: HTTP non-2xx response

- **WHEN** `GET https://ksg.example/v1/graph` returns `503`
- **THEN** the status is `error`, the `error` message contains `https://ksg.example/v1/graph` and `503`, `hasPayload` is `false`, and graph-view shows the error state rather than a broken canvas

#### Scenario: Network error

- **WHEN** the `fetch` to `endpoints.graph` rejects due to a connection failure or a CORS block
- **THEN** the status is `error`, the `error` message contains the configured URL and identifies a network error, and `hasPayload` is `false`

#### Scenario: Response is not valid JSON

- **WHEN** `GET endpoints.graph` returns 2xx but the body is HTML (for example a reverse proxy's error page)
- **THEN** the status is `error`, the `error` message contains the configured URL and identifies a JSON parse failure, and `hasPayload` is `false`

#### Scenario: error exposed on normalize failure

- **WHEN** the payload is valid JSON but the normalize boundary returns zero elements with `errors` non-empty (payload shape error)
- **THEN** the status is `error`, `elements` is `[]`, `error` is the first message of `errors`, and `hasPayload` is `true`

#### Scenario: No payload and empty graph are distinguishable

- **WHEN** the request has not yet responded or the fetch failed
- **THEN** `hasPayload` is `false`
- **AND** on receiving the valid empty payload `{ nodes: [], edges: [] }`, `hasPayload` is `true`, `status` is `ready`, `elements` is `[]`, and graph-view shows the empty state rather than error or loading

#### Scenario: A cancelled request is not an error

- **WHEN** a refresh request is cancelled while the source holds a payload
- **THEN** `status` is `ready`, `cancelled` is `true`, `error` is `undefined`, `elements` and `hasPayload` are unchanged, and the late response (if any) changes nothing

#### Scenario: partial-parse warnings do not block rendering

- **WHEN** the normalize boundary produces non-empty `elements` with `errors` non-empty (some entries skipped)
- **THEN** the status is `ready`, `errors` are exposed verbatim for graph-view to show the warning banner, and `error` is `undefined`

### Requirement: Reload and auto-refresh

The app SHALL provide a user-triggerable "Reload" action that re-issues, for **the current view's data source**, the request of its **applied** selection — `endpoints.graph` on the Graph view, `endpoints.storageGraph` on the Sankey view; the action MUST be inert before the first commit of the mount (there is no applied selection to re-issue). When the runtime config's `refreshIntervalSeconds` is greater than 0, the app SHALL refetch automatically at that period in seconds, likewise acting only on the current view's source and only after its first commit (the default 0 means off). Only the current page's source exists — an unmounted page has no source and MUST NOT generate any background request. Under `demoMode`, reload MUST NOT issue a network request (the fixture passes through the normalize boundary again with an unchanged result), and MUST NOT start the auto-refresh timer.

The two sources never exist at the same time (each belongs to one page); every rule in this requirement holds for either page's source. Unmounting the page MUST abort the in-flight request and stop the auto-refresh timer. A Cancel (see `explicit-query`) MUST stop the auto-refresh timer until the next commit or manual reload.

During a refresh (whether manual or automatic) **the previously successfully rendered graph MUST remain visible** until the new payload has been successfully produced through the normalize boundary; on success it is replaced by the new elements. A failed refresh (HTTP / network / JSON / normalize shape error) MUST show an error indicator (containing the same named message as in "Loading and error state propagation") but MUST keep the last successful elements rendering, and MUST NOT clear the screen or fall back to the full-page error state. A refresh in progress MUST be presented with a non-blocking indicator, and MUST NOT cover the rendered graph with a full-page loading overlay.

There MUST be at most one in-flight request at a time: triggering reload, committing Query, or a timer firing while a request is in flight MUST NOT issue a second concurrent request; a Query commit while in flight is what Cancel is for.

View state MUST be preserved across refreshes, consistent with the "data refresh preserve" behavior defined by the graph-view / graph-search / pod-parent-mode / node-group-compound capabilities: selection (if the node still exists), collapse state (desired ∩ present reconciled), kind / edge-type / ingress filters, search query and pod-parent mode MUST NOT be reset by the new elements; nodes removed by the new payload are handled per each capability's rules (such as deselecting, clearing the pinned card).

#### Scenario: Manual reload

- **WHEN** after a committed query the user triggers "Reload"
- **THEN** the app issues another `GET` request to `endpoints.graph` with the applied selection, shows a non-blocking refresh indicator, and the existing graph remains visible; elements update once the response succeeds

#### Scenario: Reload is inert before the first commit

- **WHEN** the user mounts `/graph`, edits two filters and triggers "Reload" without having activated Query
- **THEN** no request is issued and the awaiting-Query state is unchanged

#### Scenario: Auto-refresh at the configured period

- **WHEN** `refreshIntervalSeconds` is `30` and a query has been committed
- **THEN** the app refetches automatically every 30 seconds
- **AND** no timer is started when `refreshIntervalSeconds` is `0` or missing, nor before the first commit

#### Scenario: Failed refresh keeps the last successful graph

- **WHEN** after a successful first load, a refresh returns `502`
- **THEN** the error indicator shows a message containing the URL and `502`, the previously successful elements keep rendering, and selection and collapse state are unchanged

#### Scenario: Old graph does not disappear before the refresh succeeds

- **WHEN** a refresh request is in flight (not yet responded)
- **THEN** the previous elements are still on screen, `hasPayload` remains `true`, and graph-view shows no loading overlay

#### Scenario: Refresh preserves view state

- **WHEN** the user has selected node `pod/checkout-0`, collapsed a controller, filtered out the `service` kind, and the search query is `mongo`, and a subsequent refresh returns a new payload still containing those nodes
- **THEN** selection, collapse, filters, search query and pod-parent mode are all preserved, and the hit set and visibility are recomputed from the new elements

#### Scenario: In-flight request is not issued twice

- **WHEN** the user triggers "Reload" while an auto-refresh request has not yet responded
- **THEN** no second concurrent request is issued, and the state updates only after the in-flight request's result is applied

#### Scenario: Cancel stops auto-refresh until the next commit

- **WHEN** `refreshIntervalSeconds` is `30`, a query has been committed, and the user activates Cancel during a refresh
- **THEN** no further request is issued for the next two minutes; after the user activates Query again, refreshes resume every 30 seconds

#### Scenario: Reload under demo mode does not go to the network

- **WHEN** `demoMode` is `true` and the user triggers "Reload"
- **THEN** no network request is issued, the fixture passes through the normalize boundary again, and the rendered result is identical to before
