## Purpose

Defines how the app obtains kube-state-graph's graph data. The backend provides **two independent graph endpoints**, each serving one view:

- `GET /v1/graph` (runtime config `endpoints.graph`) — the workload topology for the Graph view;
- `GET /v1/storage-graph` (runtime config `endpoints.storageGraph`) — the storage-flow DAG for the Sankey view.

Both return a body of **the same cytoscape.js shape**, so they share the same normalize boundary and the same set of wire types; they differ only in request parameters, projection rules and the node / edge types they carry. Under `demoMode` each is replaced by a built-in fixture instead of fetching.

This capability covers: request assembly and fetching for both endpoints, propagation of the loading / error / reload / auto-refresh states, and the complete contract by which the normalize boundary (anti-corruption layer) validates the wire payload and maps it to the app's internal cytoscape.js element model: node kind, edge type, the RED / storage I/O metrics union, usage / health / ready_status / hardware / perf, alerts, controller aggregation and worstStatus. How the Sankey **view** consumes the storage-graph body (tiers, modes, selectors, empty states) is specified by `storage-flow-sankey`.

## ADDED Requirements

### Requirement: Direct backend fetch (`GET endpoints.graph`) and demo mode

The app SHALL use the browser's native `fetch` to issue a `GET` request directly to the URL named by `endpoints.graph` in the runtime config (request header carrying `Accept: application/json`) to obtain the **Graph view's** graph data, without any intermediary datasource layer. The request MUST be issued once at app startup (when the runtime config has finished loading); subsequent refetching is defined by "Reload and auto-refresh". This endpoint MUST NOT be used for the Sankey view — Sankey goes through `endpoints.storageGraph`, see "storage-graph fetch".

The **origin and path** of `endpoints.graph` MUST be used as-is — both absolute URLs (such as `https://ksg.example/v1/graph`) and root-relative URLs (such as `/api/v1/graph`, forwarded by a same-origin reverse proxy) are valid, and the app MUST NOT concatenate, rewrite or derive the **path** on its own (for example it MUST NOT append `/service_graph` or any sub-path after it). The app only appends query parameters, as defined by "graph request parameter assembly"; a query string carried by the endpoint itself MUST be preserved, with same-named parameters replaced by the app's values.

The response body MUST be parsed as JSON and then handed to the normalize boundary for validation as type `unknown`; the app MUST NOT make any type assertion about or place any trust in the payload (including the `apiVersion` and `clusters` fields); the presence and type of every field is verified one by one by the normalize boundary.

When the runtime config's `demoMode` is `true`, the app SHALL instead feed the built-in showcase fixture (type `WireGraph`, the single fake data source shared with the panel) as the payload into the **same** normalize boundary, and MUST NOT issue a network request to `endpoints.graph` (or any backend endpoint); a clean checkout MUST be able to render the complete graph with no backend. Sankey uses a **second** fixture under demo mode, see "storage-graph fetch". When `demoMode` is `false` and `endpoints.graph` is missing, the graph data source MUST NOT issue a request, and presents a configuration error per the runtime-config capability's missing-value rules.

CORS allowance or a same-origin reverse proxy is a deployment responsibility (see the container-deployment capability); the graph data source does no additional handling.

#### Scenario: Fetch from the configured URL at startup

- **WHEN** the runtime config has finished loading, `demoMode` is `false` and `endpoints.graph` is `https://ksg.example/v1/graph`
- **THEN** the app issues exactly one `GET` request to that URL (path `/v1/graph`, query parameters per "graph request parameter assembly"), with a header containing `Accept: application/json`
- **AND** the response body, after JSON parsing, is handed to the normalize boundary as `unknown`, and the produced elements are used by graph-view

#### Scenario: Root-relative URL used as-is

- **WHEN** `endpoints.graph` is `/api/v1/graph`
- **THEN** the request is sent to `/api/v1/graph` under the current origin, and the app does no concatenation or rewriting of the path

#### Scenario: The two endpoints fetch independently

- **WHEN** `endpoints.graph` is `/api/v1/graph`, `endpoints.storageGraph` is `/api/v1/storage-graph`, and the user switches to `/sankey` after `/graph` has loaded
- **THEN** the Graph page's requests go only to `/api/v1/graph` and the Sankey page's requests go only to `/api/v1/storage-graph`; the two fetch paths, states and errors are mutually independent, and one page's failure MUST NOT leak into the other in any form

#### Scenario: Demo mode issues no network request

- **WHEN** the runtime config's `demoMode` is `true` (regardless of whether `endpoints.graph` exists)
- **THEN** the app issues no network request to any backend endpoint, the showcase fixture produces elements through the same normalize boundary, and the graph renders completely

#### Scenario: No fetch when endpoints.graph is missing outside demo mode

- **WHEN** `demoMode` is `false` and the runtime config lacks `endpoints.graph`
- **THEN** the graph data source issues no request, and the app presents the configuration error defined by the runtime-config capability, rather than a blank screen or an exception

#### Scenario: The response is not trusted

- **WHEN** the backend response is valid JSON but its shape does not match the contract (for example the top level is an array, or `elements` is a string)
- **THEN** the app does not throw; the normalize boundary reports the shape error via `errors`, and the error state is presented per "Loading and error state propagation"

### Requirement: graph request parameter assembly (time range and filters)

On each fetch to `endpoints.graph`, the app SHALL assemble query parameters from the **view time range** (see `app-shell`) and the Graph page's filter selections, appended after the configured URL; the filter and time-range values are read from the current route's URL query (see `app-shell` and `graph-filters`):

- `start` / `end`: MUST be resolved from the view time range to Unix seconds **at send time** and MUST always be sent. A relative window (such as `6h`) MUST NOT be frozen to fixed values at selection time — each request re-reads the clock, otherwise the window stops moving, eventually falls outside the store's retention, and the backend returns an empty graph indistinguishable from a "broken pipeline".
- `prune`: MUST always be sent as `true` / `false` (even at the default value), so that a captured request can attest its own projection.
- `cluster` / `az` / `env` / `namespace` / `edge_type`: each dimension is a string list, sent as a **repeated parameter of the same name** when non-empty (the backend ORs within a name and ANDs across parameters); an empty list MUST NOT send that parameter at all.
- Parameters beyond the above MUST NOT be sent. The conversion from frontend field name to parameter name (`edgeType` → `edge_type`) MUST happen in this one place only.

A change of **selection** (time-range option, any filter dimension, `prune`) MUST trigger one refetch; the **clock advancing** by itself MUST NOT trigger any request — the refetch decision MUST be keyed on the selection and not on the assembled URL, otherwise a relative window would produce a different URL on every render and refetch endlessly.

When the backend rejects a request with 400 (such as `missing_start` / `invalid_range`), the app MUST present the backend-reported `reason` and message in the error state of "Loading and error state propagation", and MUST NOT silently retry or degrade to demo data.

#### Scenario: Relative window re-resolved on every request

- **WHEN** the view time range is `6h`, and the app fetches once at `T` and once at `T+30s` (auto-refresh)
- **THEN** the two requests' `start` / `end` differ, being `[T-6h, T]` and `[T+30s-6h, T+30s]` respectively, rather than the same frozen pair

#### Scenario: Filters sent as repeated parameters, empty dimensions not sent

- **WHEN** the filters are `cluster: []`, `az: ['zone-a']`, `env: ['prod', 'dev']`, `namespace: []`, `edgeType: ['pod-calls-pod']`, `prune: false`
- **THEN** the request contains `az=zone-a&env=prod&env=dev&edge_type=pod-calls-pod&prune=false` plus `start` / `end`, and contains no `cluster` or `namespace` parameter at all

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
- `edge_type` / `prune` MUST NOT be sent (the backend would ignore them, but sending them would mislead a reader of a captured request).

Any change to `az` / `env` / root / `cluster` / `namespace` MUST trigger one refetch (while the page is mounted); the source of truth for these selections is the current route's URL query (see `app-shell` and `storage-flow-sankey`); as with the graph request, the clock advancing by itself MUST NOT trigger a request. A backend 400's `reason` MUST be presented verbatim in the error state.

When `demoMode` is `true`, the app SHALL feed a second built-in fixture (`/v1/storage-graph` shape, likewise of type `WireGraph`) into the same normalize boundary, and MUST NOT issue any request; the fixture content MUST NOT change with the `az` / `env` / root selection. When `demoMode` is `false` and `endpoints.storageGraph` is missing, no request MUST be issued, and the Sankey view presents the not-configured state per runtime-config's absence rules (not the configuration error screen).

#### Scenario: First request only once az / env are both present

- **WHEN** the user opens `/sankey?az=zone-a` and `env` is not yet selected
- **THEN** the app issues no storage-graph request; once the user then selects `env: prod`, the app issues exactly one request whose query string contains `az=zone-a&env=prod` plus `start` / `end`, and contains neither `edge_type` nor `prune`

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

### Requirement: Loading and error state propagation

Each data source (graph and storage-graph) SHALL expose to the rest of the app **a data state of identical shape and independent content**, containing at least `{ status, elements, errors, error, hasPayload }`: `status` is one of `idle` / `loading` / `ready` / `error` (the app's own state; there is no external data state to rely on); `elements` are the cytoscape.js elements produced by the normalize boundary; `errors` are the normalize boundary's partial-parse warnings (for graph-view's warning banner); `error` is the user-readable error message (on fetch failure or normalize failure); `hasPayload` distinguishes "no recognizable graph payload obtained yet" from "payload loaded successfully but normalized to zero elements".

Fetch failures MUST be classified case by case and produce a **named**, user-readable message:

- HTTP response not 2xx: the message MUST contain the configured URL and the HTTP status code (such as `GET https://ksg.example/v1/graph failed: 503`).
- Network error (`fetch` rejects, DNS / connection failure, CORS block): the message MUST contain the configured URL and identify it as a network error.
- Response body not valid JSON: the message MUST contain the configured URL and identify a JSON parse failure; it MUST NOT stuff the full raw body into the message.
- The normalize boundary reports a shape error (zero elements and `errors` non-empty): `error` is the first message of `errors`.

`hasPayload` MUST be `false` when: no response has been obtained yet (`idle` / first `loading`), HTTP / network / JSON error; MUST be `true` once the payload has been successfully parsed as JSON and handed to the normalize boundary (including a valid empty graph `{ nodes: [], edges: [] }`, and a payload with a shape error). graph-view uses this to distinguish the three state UIs loading / error / empty, and MUST NOT present "no data obtained" as "the graph is empty".

#### Scenario: Fetch data and normalize

- **WHEN** `GET endpoints.graph` returns 2xx and the body is a valid graph payload
- **THEN** the status proceeds `loading` → `ready`, `elements` are the normalize output, `error` is `undefined`, and `hasPayload` is `true`

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

#### Scenario: partial-parse warnings do not block rendering

- **WHEN** the normalize boundary produces non-empty `elements` with `errors` non-empty (some entries skipped)
- **THEN** the status is `ready`, `errors` are exposed verbatim for graph-view to show the warning banner, and `error` is `undefined`

### Requirement: Reload and auto-refresh

The app SHALL provide a user-triggerable "Reload" action that re-issues, for **the current view's data source**, the same `GET` request as its first one — `endpoints.graph` on the Graph view, `endpoints.storageGraph` on the Sankey view (and only issued once `az` / `env` are both present); when the runtime config's `refreshIntervalSeconds` is greater than 0, the app SHALL refetch automatically at that period in seconds, likewise acting only on the current view's source (the default 0 means off). Only the current page's source exists — an unmounted page has no source and MUST NOT generate any background request. Under `demoMode`, reload MUST NOT issue a network request (the fixture passes through the normalize boundary again with an unchanged result), and MUST NOT start the auto-refresh timer.

The two sources never exist at the same time (each belongs to one page); every rule in this requirement holds for either page's source. Unmounting the page MUST abort the in-flight request and stop the auto-refresh timer.

During a refresh (whether manual or automatic) **the previously successfully rendered graph MUST remain visible** until the new payload has been successfully produced through the normalize boundary; on success it is replaced by the new elements. A failed refresh (HTTP / network / JSON / normalize shape error) MUST show an error indicator (containing the same named message as in "Loading and error state propagation") but MUST keep the last successful elements rendering, and MUST NOT clear the screen or fall back to the full-page error state. A refresh in progress MUST be presented with a non-blocking indicator, and MUST NOT cover the rendered graph with a full-page loading overlay.

There MUST be at most one in-flight request at a time: triggering reload or a timer firing while a request is in flight MUST NOT issue a second concurrent request; the in-flight request's result prevails.

View state MUST be preserved across refreshes, consistent with the "data refresh preserve" behavior defined by the graph-view / graph-search / pod-parent-mode / node-group-compound capabilities: selection (if the node still exists), collapse state (desired ∩ present reconciled), kind / edge-type / ingress filters, search query and pod-parent mode MUST NOT be reset by the new elements; nodes removed by the new payload are handled per each capability's rules (such as deselecting, clearing the pinned card).

#### Scenario: Manual reload

- **WHEN** the user triggers "Reload"
- **THEN** the app issues another `GET` request to `endpoints.graph`, shows a non-blocking refresh indicator, and the existing graph remains visible; elements update once the response succeeds

#### Scenario: Auto-refresh at the configured period

- **WHEN** `refreshIntervalSeconds` is `30`
- **THEN** the app refetches automatically every 30 seconds
- **AND** no timer is started when `refreshIntervalSeconds` is `0` or missing

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

#### Scenario: Reload under demo mode does not go to the network

- **WHEN** `demoMode` is `true` and the user triggers "Reload"
- **THEN** no network request is issued, the fixture passes through the normalize boundary again, and the rendered result is identical to before

### Requirement: Upstream kube-state-graph payload contract (cytoscape.js shape)

The upstream kube-state-graph backend's two endpoints `GET /v1/graph` and `GET /v1/storage-graph` emit JSON of **the same cytoscape.js elements shape**; the app MUST treat it as the sole data-source contract and normalize accordingly, with both endpoints sharing one set of wire types and one normalize boundary. The backend (design D6, replacing the old `cluster > node > pod` model) is **the single source of truth for the entire topology hierarchy**. The top-level shape is:

```
{ apiVersion: string, clusters: string[], elements: { nodes: CyNode[], edges: CyEdge[] } }
```

Each node and edge is wrapped in a `data` object per cytoscape convention:

- `CyNode.data { id: string, name: string, type: string, parent?: string, ipaddress?: string[], owner?: { kind: string, name: string }, application?: string, containers?: Array<{ name: string; image: string }>, storageclass?: string, health?: string, ready_status?: string, usage?: { used_bytes?: number, capacity_bytes?: number }, hardware?: { model?: string, serial?: string, version?: string, vendor?: string, location?: string }, perf?: { cpu_busy_pct?: number, total_ops?: number, total_latency_us?: number, total_bytes_per_sec?: number }, labels: Record<string,string> }`
- `CyEdge.data { id: string, type: string, source: string, target: string, labels: Record<string,string>, metrics?: EdgeMetricsUnion }`

The backend node `type` enum (lowercase): core resources `pod` / `node` / `pvc` / `service` / `external`; **physical storage** `netapp-aggr` / `netapp-node` / `netapp-svm`; **compound group nodes** `cluster` / `storage-cluster` / `namespace` / `application` / `controller`; physical network `switch`. `netapp-svm` **appears only in the `/v1/storage-graph` body** — `/v1/graph` never emits that type (its SVM information exists only as the PVC's `svm` label). A `controller` group's `type` is the literal `controller` (**not** the lowercased workload Kind); its Kind exists only in the id path and in the child pods' `owner.kind`. `node` is a leaf node under its cluster. An endpoint that cannot be mapped to a concrete K8s resource is `external` (the contract has no `others` type). `storageclass` **has been removed from the contract** — the backend no longer emits that node type; the claim's StorageClass name is instead placed on the PVC's own `data.storageclass` (string, omitempty).

**NetApp storage chain.** `netapp-aggr` (ONTAP aggregate, id `netapp/<ontap-cluster>/aggr/<aggr>`) is the physical unit where a PVC actually lands; its `labels` are exactly `{ontap_cluster, node}` (`node` = the controller currently owning that aggregate); `netapp-node` (ONTAP controller, id `netapp/<ontap-cluster>/<node>`) has `labels` of exactly `{ontap_cluster}`. Neither carries a `cluster` label (they belong to no K8s cluster and do not appear in the top-level `clusters[]`), so the app's cluster color emphasis and cluster filtering do not apply to them. Both may carry `health` (exactly `"online"` or `"degraded"`, omitempty); `netapp-aggr` may additionally carry `usage`. **A missing `health` is not `"degraded"`** — a missing value means the backend has no status data for it, and consumers MUST NOT interpret a missing value as `"degraded"`.

`netapp-svm` (ONTAP SVM, id `netapp/<ontap-cluster>/svm/<svm>`) has `labels` of exactly `{ontap_cluster}`, likewise carries no `cluster`, does not appear in the top-level `clusters[]`, and carries no `health` / `usage`. Its parent is `storage-cluster/<ontap-cluster>` (**not** `netapp-node` or `netapp-aggr` — SVM and aggregate are two orthogonal dimensions).

`netapp-node` may additionally carry two optional, **typed, possibly absent** attributes, **which may appear on both endpoints**:

- `hardware`: `{ model?, serial?, version?, vendor?, location? }`, all strings, each field independently optional. Sourced from Harvest's `node_labels`; it is the hardware identity an operator uses to match the machine at hand.
- `perf`: `{ cpu_busy_pct?, total_ops?, total_latency_us?, total_bytes_per_sec? }`, all JSON numbers, each field independently optional, **all raw readings** (the backend does no `rate()` and no threshold judgement). The app MUST NOT derive health verdicts or warning coloring from these values on its own — `health` keeps its precise meaning (the status reported by ONTAP), and health verdicts arrive via `alerts` (see "Alert (alerts) normalization").

When either is absent the whole key is absent; the app MUST NOT fill in `0`, `null` or `"unknown"`.

**The `usage` field** has the shape `{ used_bytes?: number, capacity_bytes?: number }` (bytes, JSON number), appearing with **the same shape** on `pvc` (from kubelet volume stats) and `netapp-aggr` (from Harvest aggregate space). The object itself appears when at least one field has a value; an unresolved field is simply absent (never padded with `0`).

The backend edge `type` enum: `pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr`, plus the physical network fabric edges `switch-to-switch` / `node-to-switch`. `pod-to-node` (pod→node) expresses the relation between a pod and its K8s node (since D6, pod-runs-on-node is no longer expressed by nesting); `pvc-to-netapp-aggr` (pvc→netapp-aggr) connects a PVC to the ONTAP aggregate hosting its FlexVol (replacing the removed `pvc-to-storageclass`); `pod-calls-service` (pod→service) and `service-selects-pod` (service→pod) are a pair of opposite direction. Edge visuals (color, line style, arrows) are defined by the graph-view capability.

**`storage-flow` is the ninth edge type, and appears only in the `/v1/storage-graph` body.** `/v1/graph` never emits it (sending `?edge_type=storage-flow` to that endpoint yields a 200 with no edges); conversely the storage-graph body contains **only** this one kind of edge, with no `pod-mounts-pvc` / `pod-to-node` / `pvc-to-netapp-aggr` / `pod-calls-*` / `service-selects-pod`, and no `service` or `external` nodes. Its direction is always **storage → workload**; each edge is one adjacent pair on the fixed tier chain `netapp-node → netapp-aggr → netapp-svm → pvc → pod → node`, naming that hop with `labels.tier`, whose value is exactly one of `node-aggr` / `aggr-svm` / `svm-pvc` / `pvc-pod` / `pod-node`. The same `(source, target)` pair appears at most once in one body, however many claims flow through it. `labels.attribution` is optional; the value `"split"` means that `pvc-pod` edge's weight is the attributed value of a claim mounted by multiple pods (RWX) **split evenly**, rather than a direct measurement; absence of the label means a single mount, whose weight is the measured value. The app MUST determine the hop from `labels.tier`, and MUST NOT infer it from the source / target kinds (a FlexGroup claim's path starts at `svm-pvc`, and an unscheduled pod ends at `pvc-pod`; both break the assumption that "the chain is necessarily complete").

**Edge `metrics` is the union of two mutually exclusive families.** A single edge carries only one of the families, never a mix:

1. **RED family** (trace-derived edges): attached by the backend when both ends resolve to `pod` or `service` nodes and the edge comes from the `traces_service_graph_request_*` series. In practice only `pod-calls-pod` and `pod-calls-service` carry it. Fields are `rate` / `error_rate` / `p90_server_ms`.
2. **I/O family** (`pvc-to-netapp-aggr` edges, and the storage-graph's `storage-flow` edges): six **measured** fields — `read_ops` / `write_ops` / `read_latency_us` / `write_latency_us` / `read_bytes_per_sec` / `write_bytes_per_sec` — plus two **declared ceiling** fields `max_iops` / `max_bytes_per_sec`. All eight are **independently** optional (each corresponds to its own Harvest series family; a missing family only drops the corresponding field). ops is count per second, latency is average microseconds, throughput is bytes per second — the backend passes all values through verbatim.

   **The I/O family on `storage-flow` edges has two more rules.** (a) `read_ops` / `write_ops` / `read_bytes_per_sec` / `write_bytes_per_sec` are **the sum over all claims flowing through that hop**, summed by the backend at build time and guaranteed **conserved** across tiers (for every non-root intermediate node, the sum of in-edges equals the sum of out-edges, up to rounding); the app MUST use these values directly and MUST NOT sum, split or redistribute on its own — any client-side recomputation breaks conservation. (b) `read_latency_us` / `write_latency_us` and `max_iops` / `max_bytes_per_sec` **appear only on the `svm-pvc` tier** (the claim-level hop); the other four tiers never carry these four fields, and the app MUST NOT look for or display them on other tiers. When no claim on the whole path has a measurement, the edge carries no `metrics` key at all.

   The measured fields and the ceiling fields come from **two different hops** of the backend's NetApp join and degrade independently: the six measurements come from the Harvest QoS workload families (hop B), the two ceilings from the QoS fixed-policy families (hop C), joined to the already-matched workload series by the `(ontap_cluster, svm, policy_group)` triple. The backend therefore guarantees that **ceiling fields never appear without any measured field** — the app may rely on this invariant, but MUST NOT assume the converse: a volume with measurements that belongs to no QoS policy group has no ceilings at all, which is a normal state and not an error.

`service-selects-pod` / `pod-to-node` / `pod-mounts-pvc` / fabric edges, any edge with an `external` end, and all backend-synthesized edges MUST be treated as **never carrying** `metrics`. Per-field contract:

- `rate`: requests per second within the query window (**req/s**, not a cumulative count). **When the RED family is present** this field is always present and > 0; but because `metrics` is a union, consumers MUST NOT assume that any `metrics` object has `rate` (the I/O family never carries it).
- `error_rate`: failure **ratio**, in `[0,1]` (**not** a percentage). A missing value means the failure counter **could not be read**; `0` means **it was read and there were no failures** — these are different states, and consumers MUST NOT treat a missing value as `0`.
- `p90_server_ms`: p90 request duration observed on the server side, in **milliseconds**. Absent when no classic histogram is available (such as native histograms or `vmrange`).
- `read_ops` / `write_ops`: reads / writes per second.
- `read_latency_us` / `write_latency_us`: average read / write latency, in **microseconds** (µs).
- `read_bytes_per_sec` / `write_bytes_per_sec`: read / write throughput, in **bytes per second** (decimal). **Not** a cumulative byte count, and not KB or MB.
- `max_iops`: the IOPS ceiling (operations per second) declared by the QoS policy group the volume belongs to, passed through verbatim by the backend.
- `max_bytes_per_sec`: the throughput ceiling declared by the same policy group, in **bytes per second**. This is the **only field the backend unit-converts** (multiplied by `1048576` from Harvest's MB/s), precisely so that it shares a unit with `read_bytes_per_sec` / `write_bytes_per_sec` and is directly comparable. The app MUST NOT do any further unit conversion.
- **Missing-value semantics of the two ceiling fields**: a missing value means the volume **has no declared ceiling** (it belongs to no QoS policy group, or that policy does not set this dimension). MUST NOT be rendered as `0`, MUST NOT be rendered as an `∞` / `unlimited` sentinel, MUST NOT be used to derive a utilization percentage — no ceiling means that row is not drawn.

All backend numbers are emitted with **6 significant digits**, so values may arrive in exponential form (such as `3.86e-7`); the app MUST format by the actual value and MUST NOT assume small integers. When `metrics` is absent the whole key is absent (not `null`, not `0`). None of these numeric fields MUST appear in the `labels` map — `labels` remains a strict `Record<string,string>`.

`ipaddress` is an **array** (possibly multiple IPs, possibly empty), carried only by `pod` / `node` / `service` nodes. Upstream has moved IP data out of `labels` (formerly `pod_ip` / `host_ip` / `external_ip`) into this dedicated field; the app MUST read IPs from `data.ipaddress` and **MUST NOT** read them from `labels`.

**D6 parent chain (`data.parent`).** The workload chain is `cluster > namespace > application > controller > pod`; `pvc` / `service` have their `namespace` group as direct parent; `node` is a leaf under the cluster. **The storage chain is `storage-cluster > netapp-node > netapp-aggr`, and the storage-graph body additionally has `storage-cluster > netapp-svm`** (SVM and aggregate are on the same level, both direct children of storage-cluster) — where the middle layer `netapp-node` is a **real node** (with a kind, an icon, selectable) rather than a decorative group. The storage-graph body's compound groups are **identical** to `/v1/graph` (`cluster > namespace > application > controller > pod`, `cluster > namespace > [application >] pvc`, `cluster > node`), and `namespace` and `application` are **not** Sankey tiers — they are orthogonal groupings above the pod / pvc tiers; a consumer that needs a namespace- or Application-level Sankey MUST walk up `data.parent` and sum the conserved weights, rather than expecting the backend to provide edges at that level. This is the only place in the contract where "a real node doubles as a compound parent"; the app MUST build the nesting from `data.parent` as-is and MUST NOT switch to expressing it as an edge because the parent is a real kind. The `namespace` / `application` / `storage-cluster` groups have `labels: {}`, no status, no edges; they exist purely as `data.parent` targets.

**Pod controller ownership.** The backend still carries `data.owner: { kind, name }`, `application: <string>` and `labels.node` (its K8s node id) on pod nodes, **even when the pod is already nested under its `controller` group via `data.parent`**. The backend **directly emits** the `controller` / `namespace` / `application` group nodes and the `pod-to-node` edges — the app no longer synthesizes controller nodes or `controller-owns-pod` edges from `data.owner`. For a PVC not joined to a NetApp aggregate (no `volumename`, no matching Harvest series, or the matched series has an empty `aggr`), the backend does **not** emit a `pvc-to-netapp-aggr` edge.

#### Scenario: Contract fields anchored to the backend golden fixture

- **WHEN** the normalize boundary is fed the contents of the backend golden fixture `with-netapp-storage-cytoscape.json`
- **THEN** the corresponding numbers of nodes and edges are parsed, and the three node types `netapp-aggr` / `netapp-node` / `storage-cluster` and the `pvc-to-netapp-aggr` edge are all mapped correctly

#### Scenario: Backend D6 hierarchy consumed as-is; pods nested under a controller keep owner / application / labels.node

- **WHEN** an upstream pod node's `data` carries `owner: { kind: "StatefulSet", name: "mongo" }`, `application: "mongo"`, `labels.node: "prod/node-1"`, and its `data.parent` points to a `controller` group
- **THEN** normalize synthesizes no controller node and no `controller-owns-pod` edge, and preserves that pod's `owner` / `application` / `labels.node` and the backend-given `parent`

#### Scenario: pod-to-node and pvc-to-netapp-aggr edge mapping

- **WHEN** upstream edges contain `type: 'pod-to-node'` (pod→node) and `type: 'pvc-to-netapp-aggr'` (pvc→netapp-aggr; replacing the removed `pvc-to-storageclass`)
- **THEN** both map to the corresponding `edgeType`, and neither falls into the unknown-type fallback

#### Scenario: PVC not joined to an aggregate has no storage edge

- **WHEN** a PVC is not joined to a NetApp aggregate (the backend emitted no corresponding `pvc-to-netapp-aggr` edge; the `pvc-to-storageclass` edge type has been removed from the contract)
- **THEN** normalize produces no storage edge for it, and the PVC remains an ordinary node

#### Scenario: storage-flow edge and netapp-svm node mapping

- **WHEN** the normalize boundary is fed a payload of `/v1/storage-graph` shape containing `{id:"netapp/ontap-prod/svm/svm_shop", name:"svm_shop", type:"netapp-svm", parent:"storage-cluster/ontap-prod", labels:{ontap_cluster:"ontap-prod"}}` and five edges of `type: 'storage-flow'` (`labels.tier` being `node-aggr` / `aggr-svm` / `svm-pvc` / `pvc-pod` / `pod-node` respectively)
- **THEN** the SVM maps to `kind: 'netapp-svm'` with parent `storage-cluster/ontap-prod`; all five edges map to `edgeType: 'storage-flow'`, `labels.tier` is preserved verbatim, and none falls into the unknown-type fallback

#### Scenario: Evenly split attributed pvc-pod edge

- **WHEN** a `pvc-pod` `storage-flow` edge carries `labels.attribution: "split"` and `metrics: { read_ops: 100 }`
- **THEN** normalize preserves that label and that value verbatim, MUST NOT multiply back by the pod count, and MUST NOT remove the label (the consumer uses it to mark the value as an estimate)

#### Scenario: latency and ceilings only on the svm-pvc tier

- **WHEN** in the payload the `svm-pvc` edge carries `read_latency_us` and `max_iops`, while the `node-aggr` and `pod-node` edges carry only the four sum fields
- **THEN** normalize maps the present fields one by one, fills nothing in for the absent latency / ceilings, and does not propagate the `svm-pvc` values to other tiers

#### Scenario: netapp-node hardware and perf degrade per field

- **WHEN** one `netapp-node` carries `hardware: { model: "AFF-A400" }` (no `serial`) and `perf: { cpu_busy_pct: 41.2 }` (none of the other three fields), and another `netapp-node` has both keys absent
- **THEN** the former keeps the present fields and absent fields stay absent; the latter's `hardware` and `perf` are both absent, MUST NOT appear as `{}`, `null` or an object padded with `0`, and the `perf` values MUST NOT affect that node's `health` or status border

#### Scenario: RED metrics contract anchored to the backend golden fixture

- **WHEN** the normalize boundary is fed content shaped like the backend golden fixture `with-red-metrics-cytoscape.json` (the same payload containing one edge with a complete `metrics: { rate, error_rate, p90_server_ms }`, one edge with only `{ rate, error_rate }`, and one edge with no `metrics` at all)
- **THEN** the three edges parse respectively into elements with complete `metrics`, with only the present fields, and with `metrics` entirely absent

#### Scenario: NetApp nodes carry no cluster label and do not appear in clusters[]

- **WHEN** the upstream payload contains `netapp-aggr` and `netapp-node` nodes whose `labels` are `{ontap_cluster, node}` and `{ontap_cluster}` respectively
- **THEN** neither has a `cluster` label, normalize assigns no cluster color emphasis, and the top-level `clusters[]` contains no ONTAP cluster name

### Requirement: Internal Graph model (hand-written, no codegen)

The app's internal model MUST use cytoscape.js's native element types as the single source: custom node / edge `data` fields extend cytoscape.js's `NodeDataDefinition` / `EdgeDataDefinition` via declaration merging, and the normalize boundary directly produces cytoscape.js `ElementDefinition[]`. **OpenAPI codegen is not adopted** — the approach is "hand-written types + runtime validation at the boundary"; if the schema grows substantially later, codegen is introduced in a separate change. The wire side is expressed by the `WireGraph` type (backend snake_case verbatim, no conversion), letting the showcase fixture align with the contract at compile time; at runtime, entry into the normalize boundary is always as `unknown`, without relying on that type. Fields follow the upstream contract, mapped to the app's internal naming:

- node `data { id, kind, label?, namespace?, ipAddress?, labels? }` (`kind` mapped from upstream `data.type`; `label` mapped from `data.name`; `namespace` extracted from `data.labels.namespace`; `ipAddress` mapped from `data.ipaddress`)
- edge `data { id, source, target, edgeType, labels? }` (`edgeType` mapped from upstream `data.type`)

#### Scenario: Internal elements keep the required fields

- **WHEN** the project typecheck runs, and the normalize boundary produces elements for a valid payload
- **THEN** the typecheck passes, the produced node `data` contains `id` / `kind` / `ipAddress` (when upstream has a value), and the edge `data` contains `id` / `source` / `target` / `edgeType`

#### Scenario: Fixture aligned with the wire type

- **WHEN** the showcase fixture is declared with the `WireGraph` type, and the normalize boundary newly reads some wire field and adds it to `WireGraph`
- **THEN** a fixture lacking that field fails at the typecheck stage, rather than rendering an incomplete graph at runtime

### Requirement: Normalize boundary (anti-corruption layer)

The system SHALL provide a pure function as the normalize boundary, with the contract `(raw: unknown) => { elements: cytoscape.ElementDefinition[]; errors: string[] }`, responsible for (a) validating the upstream payload shape; (b) mapping upstream cytoscape `data` to the app's internal cytoscape elements; (c) skipping invalid entries and collecting warnings in `errors`. Whether the payload comes from an `endpoints.graph` response or the showcase fixture, it MUST pass through the same boundary.

normalize MUST tolerate both of the following top-level shapes: the full response `{ elements: { nodes, edges } }`, or the already-unwrapped `{ nodes, edges }`. Each node / edge entry MUST tolerate both the cytoscape wrapper `{ data: {...} }` and a flat object (prefer `entry.data`, else use the entry itself). This leniency lets backend responses, fixtures and hand-written test payloads share one path.

Field mapping: node `type → data.kind`, `name → data.label` (fallback to id when missing), `labels.namespace → data.namespace`, `ipaddress → data.ipAddress` (only when it is a non-empty string array), `labels → data.labels`; edge `type → data.edgeType`.

#### Scenario: Normalize is a pure function

- **WHEN** the normalize boundary is called multiple times with the same input
- **THEN** the return value structure is fully identical, and the function has no side effects (no I/O, no mutation of external variables, no modification of the input)

#### Scenario: Map upstream cytoscape data to internal fields

- **WHEN** the upstream node `data` is `{ id, name: 'checkout', type: 'pod', labels: { namespace: 'shop' } }`
- **THEN** the produced cytoscape node element `data` contains `kind: 'pod'`, `label: 'checkout'`, `namespace: 'shop'`; edge `data.type` maps to `edgeType`

#### Scenario: ipAddress taken from the dedicated field rather than labels

- **WHEN** an upstream `service` node `data` contains `ipaddress: ['10.0.0.5']`
- **THEN** the produced element's `data.ipAddress` is `['10.0.0.5']`; it is unaffected even if `labels` contains no `pod_ip` / `host_ip` / `external_ip`

#### Scenario: Tolerate wrapped and unwrapped top-level shapes

- **WHEN** fed `{ elements: { nodes, edges } }` or the already-unwrapped `{ nodes, edges }`
- **THEN** both parse into the same cytoscape elements

#### Scenario: Invalid data does not interrupt rendering

- **WHEN** the upstream payload contains a node lacking the `id` field
- **THEN** the normalize boundary skips that node, adds a descriptive string to `errors`, and the remaining valid data maps normally

### Requirement: Alert (alerts) normalization and time_records parsing

The normalize boundary SHALL, at the anti-corruption boundary, normalize the upstream leaf node's optional `alerts` field (array) into the app's internal `NodeAlert[]`, carrying **all occurrence times** of the same alert in an **optional** `timeRecords: number[]` (replacing the old single `time` scalar).

`alerts` has **two upstream producers with different notions of "time"**, and the contract MUST accommodate both:

| Producer                                                                                | Sends                                                               | Occurrence time                                                                                                                          |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| kube-state-graph's alert overlay                                                        | `{ name, state, severity }`, read from the upstream `ALERTS` series | **None at all** — that series only states "this alert is firing within the request window"; `last_over_time` keeps no occurrence history |
| panel-era producers (the built-in fixture, alert sources fronting existing deployments) | Aggregates repeated occurrences of the same alert into one entry    | `time_records` (or legacy `time`)                                                                                                        |

Therefore `name` is the **only** required field — it is the alert's identity. **Neither the occurrence time nor `severity` is**:

- the overlay carries no occurrence time at all;
- the overlay's `severity` is serialized with `omitempty`; **a rule that declares no severity label produces an alert without that field**.

An alert missing either is still a **complete** alert and MUST NOT be discarded for it — discarding would let the real backend's overlay silently empty out under a 200 response, which is exactly the state the overlay exists to reveal. Both degrade the same way as `pod` / `service`: omit the field, and the table shows the missing-value placeholder in that cell. Rules:

- Each alert MUST carry at least a non-empty `name` (free string), otherwise it is discarded.
- Occurrence times are taken from the upstream wire field `time_records` (number array): MUST keep only finite (`Number.isFinite`) values ≥ 0, and store them **sorted ascending** as `timeRecords`.
- **Compatibility with older backends**: when `time_records` is missing (or all its elements are invalid), MUST fall back to reading the legacy scalar field `time` (Unix seconds, must be finite and ≥ 0) → `timeRecords: [time]`.
- When no valid occurrence time remains after the above filtering, `timeRecords` MUST be **omitted** (it must not be written as `[]`, nor as an `undefined` value) — "no occurrence history" has only one representation, so downstream need not test for two. The alert itself MUST be kept.
- The upstream `state` field (`firing` / `pending`) MUST NOT be projected onto `NodeAlert`: the backend query carries a fixed `alertstate="firing"` selector and its reader tests it again, so everything arriving here is already firing, and presenting that field would only be a constant.
- `severity` is an optional free string: a non-empty string is kept verbatim; when missing / an empty string / not a string, the field MUST be **omitted** (no default level substituted). A missing `severity` is **different from an unrecognized custom label** — the latter is still a level and takes the fallback color; the former is "nobody rated it", and the table shows a placeholder.
- `pod` / `service` / `id` are optional strings, omitted when missing.
- Group containers (`cluster` / `namespace` / `application` / `controller`) MUST NOT carry their own `alerts` (discarded even if upstream sends them; a controller's alerts are instead aggregated from its child pods by enrichment — see "controller alert (alerts) aggregation from child pods").

Downstream (node-detail's alert table) derives from `timeRecords`: Count = `timeRecords.length`, Last occurred = `max(timeRecords)` (the last element, since ascending), with no separate fields stored; the degraded presentation of both columns when `timeRecords` is missing is specified by `node-detail`.

#### Scenario: time_records parsed into ascending timeRecords

- **WHEN** an upstream node's `alerts` contains `{ name: 'HighMem', severity: 'critical', time_records: [1717500300, 1717500000] }`
- **THEN** the produced `NodeAlert.timeRecords` is `[1717500000, 1717500300]` (ascending); its Count derives to `2` and its last occurred derives to `1717500300`

#### Scenario: Compatible with legacy scalar time

- **WHEN** an upstream alert carries only `time: 1717500000` (no `time_records`)
- **THEN** `timeRecords: [1717500000]` is produced (equivalent to a single occurrence), with no error reported

#### Scenario: Filter non-finite / negative occurrence times

- **WHEN** an upstream alert has `time_records: [1717500000, -5, NaN, 1717500300]`
- **THEN** `timeRecords: [1717500000, 1717500300]` is produced (`-5` and `NaN` filtered out, ascending)

#### Scenario: Keep an overlay alert with no occurrence time

- **WHEN** an upstream alert is `{ name: 'NetAppControllerDegraded', state: 'firing', severity: 'critical' }` (the kube-state-graph overlay's shape, with neither `time_records` nor `time`)
- **THEN** that alert appears in `data.alerts` with `name` and `severity`, and **MUST NOT** carry a `timeRecords` field

#### Scenario: Omit timeRecords rather than writing an empty array when there is no valid occurrence time

- **WHEN** an upstream alert's `time_records` is `[]` or all its elements are non-finite / negative, and there is no valid scalar `time`
- **THEN** the alert still appears in `data.alerts` and **MUST NOT** carry a `timeRecords` field (must not be `[]`); the other alerts on the same node are unaffected

#### Scenario: Upstream state field not projected

- **WHEN** an upstream alert carries `state: 'firing'`
- **THEN** the produced `NodeAlert` **MUST NOT** have a `state` field, and the other fields parse as usual

#### Scenario: Keep an alert with no severity

- **WHEN** an upstream alert's `severity` is missing, an empty string, or not a string
- **THEN** the alert still appears in `data.alerts` and **MUST NOT** carry a `severity` field (no default such as `info` / `critical` substituted)

#### Scenario: Missing both severity and occurrence time

- **WHEN** an upstream alert is merely `{ name: 'Ungraded', state: 'firing' }`
- **THEN** the produced `NodeAlert` is `{ name: 'Ungraded' }`, with neither `severity` nor `timeRecords`

#### Scenario: Alert missing name is discarded

- **WHEN** an upstream alert lacks `name`, `name` is an empty string, or `name` is not a string
- **THEN** that alert is discarded (even if `time_records` and `severity` are valid), and the remaining valid alerts parse normally

#### Scenario: Group containers carry no alerts

- **WHEN** an upstream `cluster` or `namespace` node carries `alerts`
- **THEN** in the normalized result that node MUST NOT have `data.alerts`

### Requirement: pod / service / pvc `application`, pod `containers` pass-through and controller aggregation

The normalize boundary SHALL, at the anti-corruption boundary, carry the two fields the backend emits on pod nodes — **`application?: string`** (ArgoCD application name) and **`containers?: Array<{ name: string; image: string }>`** (containers and their images) — and aggregate both from child pods for the `controller` group nodes the backend **directly emits**. Since backend D6, **service and pvc leaves may also carry `application`** (the backend resolves it from their annotation tracking-id and nests that leaf under the corresponding application group); normalize MUST pass that field through by the same rule as for pods. Controllers are not synthesized by the app; instead the `type: "controller"` group nodes sent by the backend are **enriched**. Both fields are declared via declaration merging on the internal model's `NodeDataDefinition`, for display in the node-detail panel and for the parameter assembly of the change-history queries (`endpoints.codeChanges` / `endpoints.configChanges`). That query itself is **not** a normalize responsibility — it is a UI-side asynchronous action issued by the node-detail capability. Rules:

- **pod `application`**: passed through verbatim when the backend value is a non-empty string; when missing or an empty string, the field MUST be omitted (no `undefined` value written).
- **service / pvc `application`** (backend D6): when a service or pvc leaf carries the backend-resolved ArgoCD `application`, it MUST be passed through by **exactly the same** rule as pod `application` (non-empty string kept, missing or empty string omitted). `containers` and the typed `owner` remain **pod-only** — even if the backend mistakenly sends these two fields on a service / pvc, normalize MUST NOT carry them.
- **pod `containers`**: validated item by item — items whose `name` and `image` are both non-empty strings are kept, and items of mismatched shape MUST be discarded (anti-corruption); when the array is empty after validation or the field is missing, the field MUST be omitted.
- **controller `kind`**: the backend `controller` group's `type` is the literal `controller` and carries no `kind`; normalize MUST derive the controller's `kind` by **lowercasing** the `owner.kind` of **any one child pod** (`pod.parent === controllerId`) (such as `StatefulSet` → `statefulset`), and mark `isController: true`, making the controller a Workloads kind and keeping its detail panel.
- **controller `application`** (enrich; the backend does not send it): MUST be aggregated from the `application` of its **child pods** (`pod.parent === controllerId`) — take any child pod carrying a value (deterministically selecting the **first** under a stable sort); when no child pod carries a value, the field MUST be omitted.
- **controller `containers`**: MUST be aggregated as the union of the `containers` of **all its child pods**, deduplicated by **(name, image)** and stably sorted; when no child pod carries containers, the field MUST be omitted.
- Parsing / aggregation MUST be a pure function, deterministic and immutable (producing new elements, not modifying the input in place).
- The two fields MUST NOT affect the `worstStatus` roll-up or alerts aggregation.
- Older backends (not sending these two fields) MUST be completely unaffected — the output is identical to the current one, with no errors and no extra fields.

#### Scenario: pod application passed through verbatim

- **WHEN** a backend pod node's `data.application` is `"checkout"`
- **THEN** after normalization that pod element's `data.application` is `"checkout"`

#### Scenario: service / pvc application passed through verbatim (backend D6)

- **WHEN** a backend service or pvc node's `data.application` is `"mongodb"`
- **THEN** after normalization that element's `data.application` is `"mongodb"`; and that leaf MUST NOT thereby carry `data.containers` or `data.owner` (pod-only)

#### Scenario: Omitted when the field is missing or empty

- **WHEN** a backend pod node has no `application` (or an empty string) and no `containers` (or empty after validation)
- **THEN** that pod element MUST NOT carry `data.application` or `data.containers`

#### Scenario: pod containers passed through verbatim

- **WHEN** a backend pod node's `data.containers` is `[{ name: "app", image: "repo/app:1.2" }]`
- **THEN** after normalization that pod element's `data.containers` is preserved with equal value

#### Scenario: container items of mismatched shape are discarded

- **WHEN** a backend pod's `containers` is `[{ name: "app", image: "repo/app:1.2" }, { name: "", image: "x" }, { name: "noimg" }]`
- **THEN** after normalization only `{ name: "app", image: "repo/app:1.2" }` is kept

#### Scenario: controller kind derived from child pod owner.kind

- **WHEN** a child pod under a backend `controller` group (`type: "controller"`, no `kind`) carries `owner: { kind: "StatefulSet", name: "mongo" }`
- **THEN** after enrichment that controller node's `data.kind` is `'statefulset'` (lowercased) and `data.isController === true`

#### Scenario: controller aggregates application from child pods

- **WHEN** a child pod under a backend `controller` group carries `data.application: "mongo"`
- **THEN** after enrichment that controller node's `data.application` is `"mongo"` (the backend does not send this field on the controller itself)

#### Scenario: controller aggregates containers deduplicated by (name, image)

- **WHEN** three child pods under a controller all carry `containers: [{ name: "app", image: "repo/app:1.2" }]`, and one of them additionally carries `{ name: "sidecar", image: "repo/sc:0.9" }`
- **THEN** after enrichment that controller node's `data.containers` has two items: `app` / `repo/app:1.2` and `sidecar` / `repo/sc:0.9` (deduplicated, stably sorted)

#### Scenario: controller omits the fields when no child pod carries a value

- **WHEN** no child pod under a controller carries `application` or `containers`
- **THEN** after enrichment that controller node MUST NOT carry `data.application` or `data.containers`

#### Scenario: Aggregation is a pure and deterministic function

- **WHEN** the normalize boundary is called multiple times with the same input, and a controller has multiple child pods carrying different `application` values
- **THEN** the selected `data.application` is the same each time (deterministic selection under a stable sort), and the input is not modified in place

#### Scenario: Older backends unaffected

- **WHEN** the backend response's pod nodes contain no `application` / `containers` fields
- **THEN** the normalize boundary output has no related fields, and `errors` contains no related errors

### Requirement: controller alert (alerts) aggregation from child pods

The normalize boundary SHALL, when **enriching** the `controller` group nodes the backend directly emits, aggregate that controller's `data.alerts` (`NodeAlert[]`) from the `data.alerts` of its **child pods** (`pod.parent === controllerId`), so that the node-detail panel's alert table shows, for a controller, the alerts of all pods under it. Aggregation applies only to backend `controller` groups (`isController === true` after enrichment); k8s `node` containers and other backend physical nodes are not included. Rules:

- **Order**: concatenate each pod's alerts in the child pods' stable order (podId ascending), keeping the parsed order within a pod — deterministic for the same input.
- **pod attribution**: an aggregated item lacking the `pod` field MUST be back-filled with the source pod's label; an item already carrying `pod` MUST keep its original value. Back-filling MUST act on a new object — the source pod element's own `alerts` MUST NOT be modified.
- **Deduplication**: items carrying an `id` MUST be deduplicated across pods by `id` (first seen wins under the stable order); items without an `id` are always kept.
- **Omission**: when no child pod carries alerts, the controller MUST NOT carry an `alerts` field (no `undefined` value written).
- **Color unaffected**: this aggregation MUST NOT change the `worstStatus` roll-up (**status remains the sole source of node coloring**; alerts do not participate in the stylesheet).

#### Scenario: controller aggregates child pod alerts

- **WHEN** two pods under a backend `controller` group (`pod.parent === controllerId`) each carry one alert (`HighMem` / `CrashLoop`)
- **THEN** after enrichment that controller node's `data.alerts` contains both (concatenated in podId ascending order), and the node-detail alert table shows two rows for that controller

#### Scenario: Alert lacking the pod field back-filled from the source pod

- **WHEN** the alert of a child pod (label `mongo-0`) carries no `pod` field
- **THEN** the aggregated copy on the controller has `pod` of `"mongo-0"`; the pod's own element's alert still carries no `pod` field (the input and the pod element are unmodified)

#### Scenario: Alerts with an id deduplicated across pods

- **WHEN** two child pods each carry the same alert with `id: "alert-1"`
- **THEN** the controller's `data.alerts` contains only one entry with `id: "alert-1"` (first seen under the stable order)

#### Scenario: Omitted when no child pod carries alerts

- **WHEN** no child pod under a controller carries `alerts`
- **THEN** after enrichment that controller node MUST NOT carry `data.alerts` (the alert table shows "No alerts")

#### Scenario: Alert aggregation does not affect status coloring

- **WHEN** the only pod under a controller has `status: normal` but carries one alert with `severity: 'critical'`
- **THEN** the controller's `data.alerts` contains that alert, but `worstStatus` remains `normal` (an alert does not escalate status — color is still decided by status)

### Requirement: Recognition and coloring of backend group nodes (namespace / application / controller / storage-cluster)

The normalize boundary SHALL recognize the four compound group node types the backend directly emits (`data.type` of `namespace` / `application` / `controller` / `storage-cluster`) and, following the existing handling of the `cluster` flag-group, normalize them as **decorative compound parents** — giving no `kind` except to `controller` (making them invisible to kind filtering and the icon legend, and skipped by visibility filtering: no kind ⇒ always visible, affected only by the orphan cascade). Their `data.parent` is always **passed through verbatim** (the app does not restructure; it only assigns color emphasis). **Selectability is specified by graph-view's "Interaction and selection state"**: the `namespace` / `application` groups and `controller` all remain selectable (the selection-driven collapse cue depends on this; selecting a `namespace` opens no detail panel, while `application` is the detail-eligible exception), and the `cluster` and `storage-cluster` groups are `selectable: false`. normalize MUST NOT set `selectable: false` on `namespace` / `application` / `controller` — otherwise the canvas's tap gate would drop their clicks, the collapse cue would never appear, and the controller / application detail panel could never open. The mapping is:

- `namespace` → `{ isNamespace, namespace: <label>, namespaceColor }` — **reusing** the existing `isNamespace` flag, stylesheet selector and namespace legend; the color emphasis is the fixed per-kind color (see graph-view "Decorative compound groups use per-kind fixed colors and kind-prefixed labels").
- `application` → `{ isApplication, application: <label>, applicationColor }` — **adding** the `isApplication` flag, application palette, stylesheet selector and application legend; the color emphasis is likewise the fixed per-kind color.
- `storage-cluster` → `{ isStorageCluster, storageCluster: <label>, storageClusterColor }` — the decorative frame around an ONTAP cluster; the color emphasis is likewise the fixed per-kind color; `selectable: false` as with `cluster` (the selectable real nodes are the `netapp-node` / `netapp-aggr` beneath it).
- `controller` → `{ isController: true, kind: <child pod's owner.kind lowercased> }` (see "pod / service / pvc `application`, pod `containers` pass-through and controller aggregation"): the controller carries a real `kind` to keep its detail panel, making it both a compound parent and a node with a glyph (drawing that kind's icon when collapsed).

The `namespace` / `application` / `storage-cluster` groups have `labels: {}`, no status, no edges; they exist purely as `data.parent` targets.

For decorative groups (`cluster` / `storage-cluster` / `namespace` / `application`), normalize MUST set `data.label` to the upstream bare name (`data.name`, fallback to id when missing), and **MUST NOT** write a kind prefix (`Cluster:` / `Storage:` / `Namespace:` / `Release Unit:`). The prefixed canvas label is the responsibility of the stylesheet's render-only mapper (see graph-view); the bare `data.label` serves the tooltip title and other identity consumers.

#### Scenario: namespace group normalized and colored

- **WHEN** an upstream node has `data.type === 'namespace'`, `name === 'shop'`, and `parent` pointing to its cluster container
- **THEN** normalize produces `isNamespace: true`, `namespace: 'shop'`, `label: 'shop'` (bare name, no `Namespace:` prefix) and a `namespaceColor` of the fixed per-kind color; **no** `kind` is carried, `selectable: false` is **not** set (remains selectable, cue-driven — see graph-view "Interaction and selection state"), and `parent` is passed through verbatim

#### Scenario: application group normalized and colored

- **WHEN** an upstream node has `data.type === 'application'`, `name === 'checkout'`, and `parent` pointing to its namespace group
- **THEN** normalize produces `isApplication: true`, `application: 'checkout'`, `label: 'checkout'` (bare name, no `Release Unit:` prefix) and an `applicationColor` of the fixed per-kind color; **no** `kind` is carried, `selectable: false` is **not** set (remains selectable; `application` is detail-eligible — see graph-view), and `parent` is passed through verbatim

#### Scenario: cluster group normalized to a bare label

- **WHEN** an upstream node has `data.type === 'cluster'` and `name === 'prod'`
- **THEN** normalize produces `isCluster: true`, `cluster: 'prod'`, `label: 'prod'` (bare name, no `Cluster:` prefix), a `clusterColor` of the fixed per-kind color, and `selectable: false`

#### Scenario: storage-cluster group normalized to a bare label

- **WHEN** an upstream node has `data.type === 'storage-cluster'` and `name === 'ontap-prod'` (no `parent`)
- **THEN** normalize produces `isStorageCluster: true`, `storageCluster: 'ontap-prod'`, `label: 'ontap-prod'` (bare name, no prefix) and a `storageClusterColor` of the fixed per-kind color; **no** `kind` is carried and `selectable: false`

#### Scenario: controller group marked isController and takes kind from child pods (remains selectable)

- **WHEN** an upstream node has `data.type === 'controller'` (no `kind`), and one of its child pods has `owner.kind === 'StatefulSet'`
- **THEN** normalize produces `isController: true` and `kind: 'statefulset'`, `parent` is passed through verbatim, and `selectable: false` **MUST NOT** be set (the controller is detail-eligible and must remain selectable to open the detail panel)

#### Scenario: Groups without a kind are invisible to kind filtering and the icon legend

- **WHEN** visibility filtering and icon-legend derivation run over the `namespace` / `application` / `storage-cluster` groups
- **THEN** all three are skipped by visibility filtering because they have no `kind` (always visible, affected only by the orphan cascade), and none appears in the icon legend

### Requirement: Node worstStatus aggregated over pod-to-node edges

Since design D6, pods are no longer nested under the k8s `node` (`pod-runs-on-node` is instead expressed by the `pod-to-node` edge), so in the `controller` view a node's collapsed border color can no longer be computed from its child nodes. The normalize boundary SHALL recompute each `node`'s `data.worstStatus` as: **the worst status among the pods linked via `pod-to-node` edges** (worst-wins, also including the node's own status; ordering critical > warning > normal; status taken from the pod's `data.status`, defaulting to `normal` when missing / invalid). Written when **status information exists** (the node itself carries a valid status, or at least one `pod-to-node` edge links to a pod); when it has no status of its own and no linked pod, this field MUST be omitted ("no information" must not masquerade as `normal`). This field serves graph-view's stylesheet to color the border of a **collapsed** node (see the graph-view spec). In the `node` view, pods are re-nested under the node, and the existing child-node-computed worstStatus also holds.

#### Scenario: node worstStatus takes the worst of the pod-to-node linked pods

- **WHEN** a `node` (itself `status: normal`) is linked via `pod-to-node` edges to two pods with `status: warning` and `status: critical` respectively
- **THEN** that node's `data.worstStatus` is `critical` (critical > warning)

#### Scenario: A node's own status is not downgraded by linked pods

- **WHEN** a `node` itself has `status: critical`, and the pods it links to via `pod-to-node` are all `normal`
- **THEN** that node's `data.worstStatus` is `critical` (worst-wins, not downgraded by child nodes)

#### Scenario: worstStatus omitted when there is no status information

- **WHEN** a `node` has no `status` of its own and no pod linked by any `pod-to-node` edge
- **THEN** that node MUST omit `worstStatus` (no status information)

### Requirement: Edge metrics normalization and per-field degradation

The normalize boundary MUST carry the upstream edge's `data.metrics` to the produced cytoscape edge's `data.metrics` with **the same names and the same units**, its type declared via declaration merging on the internal model. `metrics` is the union of two mutually exclusive families (see "Upstream kube-state-graph payload contract"): the RED family `rate` / `errorRate` / `p90ServerMs`, and the I/O family `readOps` / `writeOps` / `readLatencyUs` / `writeLatencyUs` / `readBytesPerSec` / `writeBytesPerSec` / `maxIops` / `maxBytesPerSec` (snake_case → camelCase, otherwise unchanged). This is **pure pass-through plus validation**: the app MUST NOT convert units, turn values into percentages, round, or fill defaults at this layer — formatting belongs to the rendering layer (graph-view / storage-flow-sankey).

Validation and degradation rules (metrics is an additional information layer; **no metrics problem may make an edge disappear**):

- `metrics` not a plain object → discard the whole `metrics`; the edge is produced as usual.
- `rate` present but not a `number` or not finite (`NaN` / `±Infinity`) → discard the whole `metrics` (`rate` is the RED family's required field); the edge is produced as usual.
- **A missing `rate` MUST NOT discard the whole `metrics`**: parse as the I/O family instead — if any of the eight I/O fields is a finite `number`, keep that family; otherwise discard the whole `metrics`. This is the only behavioral difference the union introduces.
- Any optional field (`error_rate` / `p90_server_ms` / the eight I/O fields) present but not a finite `number` → **drop only that field**, keeping the rest of `metrics`.
- The two ceiling fields (`max_iops` / `max_bytes_per_sec`) go through **exactly the same** per-field guard as the six measured fields. normalize MUST NOT additionally enforce "ceilings must not appear alone": that invariant belongs to the backend (see the hop B / hop C description in the upstream contract), and re-validating it here would silently drop data when the backend's behavior changes.
- If fields of both families appear together (impossible per the contract), the RED family MUST win and the I/O fields MUST be discarded — never produce a mixed object the consumer cannot tell apart.
- Optional fields not sent by upstream MUST remain absent (**never** padded with `0`, `null` or any placeholder value).
- Values MUST be preserved verbatim, including very small values in exponential form (such as `3.86e-7`) and `0`.

A metrics validation failure MUST NOT be written to the normalize boundary's `errors` array — that channel is reserved for partial-parse warnings affecting topology correctness; a metrics gap does not affect topology, and writing it would only turn the warning banner into noise.

#### Scenario: Valid metrics passed through to edge data

- **WHEN** the upstream edge `data` is `{ id, source, target, type: 'pod-calls-service', labels: {}, metrics: { rate: 5, error_rate: 0.2, p90_server_ms: 45 } }` (both end nodes exist)
- **THEN** the produced edge element's `data.metrics` is `{ rate: 5, errorRate: 0.2, p90ServerMs: 45 }`, with no unit conversion and no rounding

#### Scenario: Edge without metrics does not produce the field

- **WHEN** the upstream edge `data` has no `metrics` key (for example a `pod-mounts-pvc` edge)
- **THEN** the produced edge element's `data` likewise has no `metrics` key (not an explicit `undefined`, not an empty object)

#### Scenario: Absent error_rate and zero error_rate are different states

- **WHEN** one upstream edge carries `metrics: { rate: 3 }` (no `error_rate`) and another carries `metrics: { rate: 1, error_rate: 0 }`
- **THEN** the former's `data.metrics` has no `errorRate` key, and the latter's is `errorRate: 0`

#### Scenario: A single invalid field does not drag down the rest of metrics

- **WHEN** an upstream edge's `metrics` is `{ rate: 5, error_rate: 'high', p90_server_ms: 45 }`
- **THEN** the produced `data.metrics` is `{ rate: 5, p90ServerMs: 45 }` (`errorRate` dropped), and the edge itself is produced as usual

#### Scenario: Unusable rate discards metrics but keeps the edge

- **WHEN** an upstream edge's `metrics` is `{ rate: null, error_rate: 0.1 }` (`rate` present but invalid), or `metrics` is a string, or `{ error_rate: 0.1, p90_server_ms: 45 }` (no `rate` and no valid I/O field either)
- **THEN** the produced edge element has no `metrics` key, but that edge element still exists in `elements`, with its `edgeType` / `labels` unaffected

#### Scenario: Very small values in exponential form preserved verbatim

- **WHEN** an upstream edge's `metrics` is `{ rate: 3.86e-7, error_rate: 6.7e-8 }`
- **THEN** the produced `data.metrics.rate` strictly equals `3.86e-7` and `data.metrics.errorRate` strictly equals `6.7e-8` (neither truncated to `0`)

#### Scenario: RED gaps do not enter the errors channel

- **WHEN** the upstream payload contains an edge with invalid `metrics` in any of the forms above
- **THEN** the `errors` array returned by the normalize boundary MUST NOT gain any entry because of it

#### Scenario: I/O family metrics passed through to the storage edge

- **WHEN** an upstream `pvc-to-netapp-aggr` edge carries `metrics: { read_ops: 150, write_ops: 40, read_latency_us: 830, write_latency_us: 1200, read_bytes_per_sec: 5242880, write_bytes_per_sec: 1048576, max_iops: 5000, max_bytes_per_sec: 262144000 }` (no `rate`)
- **THEN** the produced `data.metrics` is `{ readOps: 150, writeOps: 40, readLatencyUs: 830, writeLatencyUs: 1200, readBytesPerSec: 5242880, writeBytesPerSec: 1048576, maxIops: 5000, maxBytesPerSec: 262144000 }`, with no `rate` key and no conversion at this layer (not converted to MB/s here; `maxBytesPerSec` has already been converted from MB/s by the backend)

#### Scenario: I/O family degrades per field

- **WHEN** an upstream storage edge's `metrics` is `{ read_ops: 150, write_ops: 'many', read_bytes_per_sec: 5242880 }` (only some fields, one of them invalid)
- **THEN** the produced `data.metrics` is `{ readOps: 150, readBytesPerSec: 5242880 }`, the edge is produced as usual, and `errors` gains no entry

#### Scenario: Measurements without declared ceilings

- **WHEN** an upstream storage edge carries `metrics: { read_ops: 150, write_ops: 40, read_bytes_per_sec: 5242880 }` (the volume belongs to no QoS policy group; the backend sent no ceilings)
- **THEN** the produced `data.metrics` has no `maxIops` or `maxBytesPerSec` key (never `0`, `null` or an unlimited sentinel), and the other fields pass through as usual

#### Scenario: Ceiling fields degrade per field

- **WHEN** an upstream storage edge carries `metrics: { read_ops: 150, max_iops: 5000, max_bytes_per_sec: 'unlimited' }`
- **THEN** the produced `data.metrics` is `{ readOps: 150, maxIops: 5000 }` — only the invalid `max_bytes_per_sec` field is dropped, the rest of the family is intact, and `errors` gains no entry

### Requirement: NetApp node and PVC storage field (health / usage / storageclass) normalization

The normalize boundary SHALL normalize upstream nodes with `data.type === 'netapp-aggr'` and `data.type === 'netapp-node'` into nodes of the corresponding `kind` with **real leaf-node semantics** (with an icon, selectable, in the `Storage` category), passing `parent` through verbatim — including the case where a `netapp-aggr`'s parent is a **real** `netapp-node` id (see the storage chain in "Upstream kube-state-graph payload contract"). The backend sends no `status`, so `status` is omitted.

Three node fields pass through under independent per-field guards, without affecting one another:

- `health` (`netapp-aggr` / `netapp-node`): passed through when the value is the string `"online"` or `"degraded"`; **any other string is also passed through verbatim** (an unknown backend value must never fail the node); omitted when not a string or an empty string. A missing `health` MUST NOT be padded with `"degraded"` or any default.
- `usage` (`netapp-aggr` / `pvc`): `used_bytes` / `capacity_bytes` are each passed through as `usedBytes` / `capacityBytes` when a finite `number` and `>= 0`; when neither qualifies, the whole `usage` is omitted.
- `storageclass` (`pvc`): passed through when a non-empty string.

**Deriving `usageRatio`.** When `usage` holds both a qualifying `usedBytes` and a qualifying `capacityBytes` with `capacityBytes > 0`, normalize MUST additionally write the derived field `usageRatio` (`usedBytes / capacityBytes`, clamped to `[0,1]`). This field exists **specifically for the stylesheet's node utilization visual** — a cytoscape selector can neither read nested `data` nor do division, so it must be flattened at normalize. When `capacityBytes` is `0`, either field is absent, or the ratio cannot be computed, `usageRatio` MUST NOT be written (absent = the utilization visual is not drawn). This derivation is **kind-independent**: any node with a qualifying `usage` gets `usageRatio`; `pvc` and `netapp-aggr` follow the same rule, and any future kind carrying usage is covered automatically.

`netapp-aggr` and `netapp-node` are both icon-bearing `NodeKind`s of the `Storage` category, so they appear in the kind legend automatically; both are **selectable**, detail-eligible nodes — `netapp-node` remains selectable although it is a compound parent, the same as `controller` and the k8s `node` container.

#### Scenario: netapp-aggr normalized, health / usage passed through and usageRatio derived

- **WHEN** an upstream node has `data.type === 'netapp-aggr'`, `parent` pointing to a real `netapp-node` id, `health: "online"`, `usage: { used_bytes: 700000000000, capacity_bytes: 1000000000000 }`
- **THEN** normalize produces `kind: 'netapp-aggr'`, `health: 'online'`, `usage: { usedBytes: 700000000000, capacityBytes: 1000000000000 }` and `usageRatio: 0.7`, carries **no** `status`, and `parent` and `label` (= `name`) are preserved verbatim

#### Scenario: netapp-node is a real compound parent and remains selectable

- **WHEN** an upstream node has `data.type === 'netapp-node'`, `parent` pointing to the `storage-cluster` group, `health: "degraded"`, and another `netapp-aggr` node's `parent` points to it
- **THEN** normalize produces `kind: 'netapp-node'` and `health: 'degraded'`, **MUST NOT** set `selectable: false`, and that `netapp-aggr`'s `parent` still points to this node's id (cytoscape builds the nesting from `data.parent`)

#### Scenario: Absent health is not padded

- **WHEN** an upstream `netapp-aggr` or `netapp-node` has no `health` field (or its value is an empty string or not a string)
- **THEN** the produced element's `data` has no `health` key (no `undefined` value written), and MUST NOT be filled with `'degraded'`

#### Scenario: PVC passes through storageclass and usage

- **WHEN** an upstream `pvc` node carries `storageclass: "netapp-nas"` and `usage: { used_bytes: 5368709120, capacity_bytes: 10737418240 }`
- **THEN** normalize produces `storageclass: 'netapp-nas'`, `usage: { usedBytes: 5368709120, capacityBytes: 10737418240 }` and `usageRatio: 0.5`

#### Scenario: usage degrades per field

- **WHEN** an upstream node's `usage` is `{ capacity_bytes: 1000 }` (capacity only) or `{ used_bytes: 'lots', capacity_bytes: 1000 }` (one field invalid)
- **THEN** both produce `usage: { capacityBytes: 1000 }`, and because `usedBytes` is missing, `usageRatio` **MUST NOT** be written

#### Scenario: Zero capacity produces no usageRatio

- **WHEN** an upstream node's `usage` is `{ used_bytes: 0, capacity_bytes: 0 }`
- **THEN** `usage: { usedBytes: 0, capacityBytes: 0 }` is produced, and `usageRatio` **MUST NOT** be written (avoiding division by zero)

#### Scenario: Malformed usage discarded whole

- **WHEN** an upstream node's `usage` is not a plain object (a string, an array or `null`)
- **THEN** normalize omits `usage` and `usageRatio`, the other fields normalize as usual, and the node is produced as usual

### Requirement: K8s node `ready_status` normalization

The normalize boundary SHALL carry the upstream node's `ready_status` to the produced cytoscape node as `data.readyStatus` (`string`) when it is a non-empty string; otherwise the field SHALL be **entirely absent** from `data`.

The value SHALL be passed through **verbatim**, with no mapping, no case change, and no membership check against the backend's three values `"Ready"` / `"NotReady"` / `"Unknown"`. The guard is the same as for `health`, for the same reason: if upstream adds a fourth condition value, it must surface rather than vanish.

**A missing value MUST NOT default to `"Unknown"`, `""` or any other value.** The backend omits this field when a node has no Ready-condition series at all, and reserves the literal `"Unknown"` for the real Kubernetes state where the kubelet has stopped reporting. Conflating the two would render a scrape gap as a cluster-level failure.

`readyStatus` is **a third status axis**, and MUST NOT feed into `data.status`, `data.worstStatus`, the status border color or any alerts aggregation. Kubernetes's Ready condition and the app's alert severity answer different questions; a node can legitimately be `NotReady` with no alert at all; folding one into the other would make the same color mean two things.

#### Scenario: Each condition value passed through verbatim

- **WHEN** an upstream `node` carries `ready_status: "NotReady"`
- **THEN** the produced node's `data.readyStatus` is `'NotReady'`

#### Scenario: A node with no Ready data carries no field

- **WHEN** an upstream `node` has no `ready_status` key, or it is an empty string, or a non-string value
- **THEN** the produced `data` has no `readyStatus` key — never `''`, never `'Unknown'` — and `errors` gains no entry

#### Scenario: Unrecognized condition values are preserved

- **WHEN** an upstream `node` carries `ready_status: "SchedulingDisabled"`
- **THEN** `data.readyStatus` is `'SchedulingDisabled'`

#### Scenario: Status axes do not affect one another

- **WHEN** a node carrying `ready_status: "NotReady"` and no alerts is normalized
- **THEN** its produced `data`, apart from the `readyStatus` field itself, is identical to the normalization result of the same node without `ready_status`
