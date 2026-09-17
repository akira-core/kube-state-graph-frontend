## ADDED Requirements

### Requirement: Trace fetch (`GET endpoints.trace`) and request assembly

The Network page's data SHALL come from an independent `GET` request to `endpoints.trace` (header carrying `Accept: application/json`), a third data source unrelated to `endpoints.graph` and `endpoints.storageGraph`: its in-flight request, loading / error state, last successful load time, retries and timer are independent, and one source serves both `/network/graph` and `/network/sankey` (see `app-shell`). The response body MUST be handed as `unknown` to the **same** normalize boundary. The endpoint's origin, path and query string MUST be used as-is; the app only appends parameters.

The request MUST be **explicit** (see `explicit-query`): issued only on a Query commit whose draft holds a non-empty hostname and no validation problem, on Reload, or on an auto-refresh tick; mounting, a deep link, a view switch and a control edit MUST NOT issue it. The seven query parameters are built from the **applied** scope and MUST always all be sent, even at their default value, so a captured request attests what was asked:

| Parameter   | Source                                 | Form                                                  |
| ----------- | -------------------------------------- | ----------------------------------------------------- |
| `hostname`  | applied `hostname`                     | non-empty string; the request is not built when empty |
| `from_ts`   | applied view time range, start         | epoch **milliseconds**, resolved at send time         |
| `to_ts`     | applied view time range, end           | epoch **milliseconds**, resolved at send time         |
| `max_hops`  | applied `max_hops` (default `7`)       | integer ≥ 1                                           |
| `top_n`     | applied `top_n` (default `3`)          | integer ≥ 1                                           |
| `threshold` | applied `threshold` (default `10`)     | number in `[0, 100]`, per cent                        |
| `track_dir` | applied `track_dir` (default `source`) | `source` \| `destination`                             |

Milliseconds are produced **only** in the trace request builder (`from` / `to` in the URL remain in seconds per `app-shell`); a relative window is re-read from the clock on every request. `min_bps` is a client-side display value and MUST NOT be sent; no other parameter MUST be sent. A backend 400's `reason` MUST be presented verbatim in the error state. When `demoMode` is `true` the app feeds `SHOWCASE_TRACE` through the normalize boundary and issues no request; when `demoMode` is `false` and `endpoints.trace` is absent, no request MUST be issued and the Network views show the not-configured state.

#### Scenario: Seven parameters and millisecond timestamps

- **WHEN** the applied scope is `hostname=sw-tor-1` with every other value at its default, the applied range is `1h`, and Query is activated at Unix time `1757000000` seconds
- **THEN** exactly one request is issued whose query contains `hostname=sw-tor-1&from_ts=1756996400000&to_ts=1757000000000&max_hops=7&top_n=3&threshold=10&track_dir=source`, and contains no `min_bps`

#### Scenario: Relative window re-resolved on every request

- **WHEN** the applied range is `6h` and the trace source runs once at `T` (Query) and once at `T+30s` (auto-refresh)
- **THEN** the two requests' `from_ts` / `to_ts` differ by 30000, each pair spanning six hours in milliseconds

#### Scenario: No request without a valid hostname

- **WHEN** the draft's hostname is empty or a parameter has a problem
- **THEN** the request builder returns nothing, no request is issued, and the page stays in its scope state

#### Scenario: The trace source is independent

- **WHEN** the trace request responds with HTTP 500 while `/sankey`'s last storage-graph load had succeeded
- **THEN** the Network page presents its own error state; on switching to `/sankey` the Sankey page mounts with its own state, and `endpoints.storageGraph` is not affected

### Requirement: Network node fields are normalized additively

The normalize boundary SHALL read three node-level network fields and carry them onto the produced node `data`, each validated independently, and each **dropped with one `errors` entry naming `nodes[i].data.<field>` and the rule it broke** when malformed (unlike a metrics gap, a malformed trace field changes what the trace can draw, so it is reported; the node itself is always kept). One entry per malformed FIELD, never one per broken rule: the reader needs to know which field went missing from the drawing, and a list of rules for one field would not tell them more.

- `investigation` → `data.investigation: { iface: string; deltaBps: number; direction?: 'in' | 'out'; note?: string }`. Required: `iface` non-empty string, `delta_bps` finite and `> 0`. `direction` kept only when `in` / `out`; `note` only when a string. A non-object value, a missing `iface`, a `delta_bps` not > 0, an invalid `direction` or a non-string `note` each drop the WHOLE field — the anchor is one fact and half an anchor is not a fact — reported as a single entry naming `nodes[i].data.investigation` and restating the rules the object had to meet.
- `clients` → `data.clients: Array<{ ip?: string; hostname?: string; owner?: string }>`. A non-array value drops the field with an error; an entry that is not an object or has neither a non-empty `ip` nor a non-empty `hostname` is dropped **silently**; unknown keys are ignored; an empty result omits the field.
- `other_in_bps` / `other_out_bps` → `data.otherInBps` / `data.otherOutBps`. Each kept when a finite number `≥ 0`; a negative or non-numeric value drops that field with an error naming it.

Absent fields stay absent (never `undefined`, `null`, `0` or `[]`). The trace-level semantic checks — more than one node with `investigation`, an `investigation` on a non-hop kind, a flow edge touching a group node, a leaf continuing onward, a synthesized id collision, no drawable hop — are **not** normalize's job: they belong to `deriveTrace` (see `network-trace`), because the Graph view must still draw such a body. The deprecated top-level `investigation` and the top-level `kind` MUST NOT be read. This is a deliberate difference from the source project's whole-document failure: the boundary partial-parses, as it does for every other field.

Existing payloads MUST normalize byte-identically: for a body without any of the four network fields the produced elements MUST deep-equal the output before this change, and `errors` MUST be unchanged.

#### Scenario: A valid investigation is carried

- **WHEN** a `switch` node's `data` carries `investigation: { iface: "xe-0/0/1", delta_bps: 10000000000, direction: "in", note: "spike" }`
- **THEN** the produced `data.investigation` is `{ iface: "xe-0/0/1", deltaBps: 10000000000, direction: "in", note: "spike" }` and `errors` gains no entry

#### Scenario: A malformed investigation is dropped with an error

- **WHEN** a node's `investigation` is `{ iface: "", delta_bps: 0 }` — two rules broken at once
- **THEN** the node is produced without `data.investigation`, and `errors` gains exactly ONE entry, naming `nodes[i].data.investigation` and the rules the object had to meet (`iface` a non-empty string, `delta_bps` > 0, `direction` in / out, `note` a string)

#### Scenario: Clients are filtered per entry

- **WHEN** a `host` node's `clients` is `[{ ip: "10.0.0.1", hostname: "a", owner: "Ops" }, { owner: "Ops" }, "x", { hostname: "b", mac: "…" }]`
- **THEN** the produced `data.clients` is `[{ ip: "10.0.0.1", hostname: "a", owner: "Ops" }, { hostname: "b" }]` and `errors` gains no entry; when `clients` is the string `"none"` the field is absent and `errors` names `nodes[i].data.clients`

#### Scenario: Residual fields are kept when non-negative

- **WHEN** one node carries `other_out_bps: 2500000000` and another `other_in_bps: -1`
- **THEN** the first has `data.otherOutBps: 2500000000` and no `otherInBps`; the second has neither field and `errors` names `nodes[i].data.other_in_bps`

#### Scenario: Existing fixtures are unchanged

- **WHEN** `normalizeGraph` runs on `SHOWCASE_GRAPH` and `SHOWCASE_STORAGE_GRAPH`
- **THEN** the produced elements and `errors` deep-equal the output recorded before this change

## MODIFIED Requirements

### Requirement: Edge metrics normalization and per-field degradation

The normalize boundary MUST carry the upstream edge's `data.metrics` to the produced cytoscape edge's `data.metrics` with **the same names and the same units**, its type declared via declaration merging on the internal model. `metrics` is the union of two mutually exclusive families (see "Upstream kube-state-graph payload contract"): the RED family `rate` / `errorRate` / `p90ServerMs`, and the I/O family `readOps` / `writeOps` / `readLatencyUs` / `writeLatencyUs` / `readBytesPerSec` / `writeBytesPerSec` / `maxIops` / `maxBytesPerSec` **plus the network flow field `deltaBps`** (from `delta_bps`, bits per second, finite and `≥ 0`), which the trace endpoint's `network-flow` edges carry (snake_case → camelCase, otherwise unchanged). `deltaBps` is declared as an intersection on the I/O family — `EdgeMetrics = EdgeRedMetrics | (EdgeIoMetrics & EdgeFlowMetrics)` — so the union stays two-membered and every existing narrowing on `'rate' in metrics` keeps its meaning; the trace consumer discriminates on `typeof metrics.deltaBps === 'number'`. This is **pure pass-through plus validation**: the app MUST NOT convert units, turn values into percentages, round, or fill defaults at this layer — formatting belongs to the rendering layer (graph-view / storage-flow-sankey / network-trace).

Validation and degradation rules (metrics is an additional information layer; **no metrics problem may make an edge disappear**):

- `metrics` not a plain object → discard the whole `metrics`; the edge is produced as usual.
- `rate` present but not a `number` or not finite (`NaN` / `±Infinity`) → discard the whole `metrics` (`rate` is the RED family's required field); the edge is produced as usual.
- **A missing `rate` MUST NOT discard the whole `metrics`**: parse as the I/O family instead — if any of the eight I/O fields or `delta_bps` is a finite `number` (for `delta_bps`, also `≥ 0`), keep that family; otherwise discard the whole `metrics`. This is the only behavioral difference the union introduces.
- Any optional field (`error_rate` / `p90_server_ms` / the eight I/O fields / `delta_bps`) present but not a finite `number` (or, for `delta_bps`, negative) → **drop only that field**, keeping the rest of `metrics`.
- The two ceiling fields (`max_iops` / `max_bytes_per_sec`) go through **exactly the same** per-field guard as the six measured fields. normalize MUST NOT additionally enforce "ceilings must not appear alone": that invariant belongs to the backend (see the hop B / hop C description in the upstream contract), and re-validating it here would silently drop data when the backend's behavior changes.
- If fields of both families appear together (impossible per the contract), the RED family MUST win and the I/O fields (including `delta_bps`) MUST be discarded — never produce a mixed object the consumer cannot tell apart.
- Optional fields not sent by upstream MUST remain absent (**never** padded with `0`, `null` or any placeholder value).
- Values MUST be preserved verbatim, including very small values in exponential form (such as `3.86e-7`) and `0`.

A metrics validation failure MUST NOT be written to the normalize boundary's `errors` array — that channel is reserved for partial-parse warnings affecting topology correctness; a metrics gap does not affect topology, and writing it would only turn the warning banner into noise. (A dropped negative `delta_bps` is therefore reported by `deriveTrace` as a warning, not here.)

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

- **WHEN** an upstream edge's `metrics` is `{ rate: null, error_rate: 0.1 }` (`rate` present but invalid), or `metrics` is a string, or `{ error_rate: 0.1, p90_server_ms: 45 }` (no `rate` and no valid I/O or flow field either)
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

#### Scenario: delta_bps passed through on a network-flow edge

- **WHEN** an upstream `network-flow` edge carries `metrics: { delta_bps: 20000000000 }`
- **THEN** the produced `data.metrics` is `{ deltaBps: 20000000000 }`, with no `rate` key, no unit conversion, and `errors` gains no entry

#### Scenario: A negative or non-numeric delta_bps is dropped per field

- **WHEN** one `network-flow` edge carries `metrics: { delta_bps: -5 }` and another `metrics: { delta_bps: "10G", read_bytes_per_sec: 100 }`
- **THEN** the first edge is produced with no `metrics` key; the second with `{ readBytesPerSec: 100 }`; both edges exist in `elements` and `errors` gains no entry

#### Scenario: Storage narrowing is unaffected by the flow field

- **WHEN** the storage Sankey derives from a body whose `storage-flow` edges carry the I/O family only
- **THEN** `deriveSankey`, `cutTopPods` and the fixture tests behave and typecheck exactly as before, with no reference to `deltaBps`
