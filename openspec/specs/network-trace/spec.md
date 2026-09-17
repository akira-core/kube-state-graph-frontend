## Purpose

Defines the Network category's trace Sankey: a conserving Sankey of one switch trace fetched from `endpoints.trace` — hop boxes with interface slot labels, other-in / other-out residuals that make every hop balance, the anchor card for the investigated interface, trace-stop and client cards, owner aggregation, and derived pod / application / namespace cards — drawn with the shared `sankey-canvas` presentation module.

## Requirements

### Requirement: Input is the trace fetch, shared by both Network views

The Network Sankey view MUST take the response of `endpoints.trace` (normalized through the same normalize boundary of `graph-data-source`) as its sole input, held by the Network category's single loader (see `app-shell`); the Network Graph view draws the same normalized elements. The request is `GET <endpoints.trace>?hostname=<h>&from_ts=<ms>&to_ts=<ms>&max_hops=<n>&top_n=<n>&threshold=<pct>&track_dir=<source|destination>`, assembled by `graph-data-source`: all seven parameters MUST always be sent explicitly, including those at their default, and `from_ts` / `to_ts` MUST be the applied view time range resolved **at send time** to epoch **milliseconds** (13 digits for any date in this century). The response body is the cytoscape-style wire shape shared with the other endpoints plus four network fields (`metrics.delta_bps`, node `investigation`, `clients`, `other_in_bps` / `other_out_bps`).

The trace model is **read-only derived data** computed from the normalized elements by `deriveTrace(elements, { direction, minBps, grouping })`; the derivation MUST NOT mutate any element (deep-equal before and after). While the loader is loading or in error, the view MUST present that state and draw nothing. When `endpoints.trace` is not configured and `demoMode` is `false`, the view MUST show the not-configured state and MUST NOT issue a request. When `demoMode` is `true`, the view renders the built-in `SHOWCASE_TRACE` fixture on mount, issues no request, and holds every scope value in component state as the storage view does.

#### Scenario: One request with seven explicit parameters

- **WHEN** the user opens `/network/sankey?hostname=sw-tor-1&from=now-1h&to=now`, leaves every other control at its default and activates Query at time `T`
- **THEN** exactly one request is issued to `endpoints.trace` whose query string contains `hostname=sw-tor-1`, `max_hops=7`, `top_n=3`, `threshold=10`, `track_dir=source`, `from_ts` equal to `(T − 1h)` in milliseconds and `to_ts` equal to `T` in milliseconds; the Graph view of the same category issues nothing of its own

#### Scenario: Derivation does not change the source data

- **WHEN** `deriveTrace` runs on the normalized fixture for both directions, with `minBps` `0` and `5e8`, and both groupings
- **THEN** the normalized elements after derivation are deep-equal to a deep copy taken before

#### Scenario: Endpoint not configured

- **WHEN** the runtime config lacks `endpoints.trace` and `demoMode` is `false`
- **THEN** the view shows `trace-empty-unconfigured`, issues no request, and the Network links stay reachable in the nav bar

### Requirement: Scope controls hold raw strings and refuse invalid values

The Network scope bar SHALL provide: `Hostname` (single-select dropdown with the shared dropdown contract, custom values allowed, options from "Hostname candidates"), `Max hops`, `Top N`, `Threshold %` (text inputs), `Track` (`source` | `destination`) and the shared Query / Cancel control. They edit the **draft** (see `explicit-query`), stored as **raw strings**. The rules per parameter:

| URL key     | Default  | Valid                     | Missing in URL   | Invalid in URL                                       |
| ----------- | -------- | ------------------------- | ---------------- | ---------------------------------------------------- |
| `hostname`  | none     | non-empty string          | empty (required) | —                                                    |
| `max_hops`  | `7`      | integer ≥ 1               | default          | raw value kept in the draft; problem; Query disabled |
| `top_n`     | `3`      | integer ≥ 1               | default          | same                                                 |
| `threshold` | `10`     | number in `[0, 100]`      | default          | same                                                 |
| `track_dir` | `source` | `source` \| `destination` | default          | default applied; problem                             |
| `min_bps`   | `0`      | integer ≥ 0 (display, D3) | `0`              | `cleanMinBps`: floor, `> 0` else `0`                 |

A missing value is the default; an invalid value MUST be refused with a message naming the field and the rule, and MUST NOT be rewritten, clamped or replaced silently. Query MUST be unavailable while the draft has any problem or an empty hostname, with the first problem as the reason; the app MUST NOT assemble a request from an invalid or empty value. Problems from the URL on mount MUST be shown in the scope bar (`data-testid="trace-scope-problem"`) until the draft is edited to a valid value.

The applied scope is written to the `/network/:view` query by the Query commit (replace), with the same key names as the request: `hostname` only when non-empty, a numeric key only when it differs from its default, `track_dir` only when `destination`, `min_bps` only when greater than `0`; `from` / `to` follow `app-shell`. `min_bps` is an immediate view value: changing it redraws without a request and writes the query with replace, like `top_pods` on the storage view. Outside demo mode the URL is the applied scope; in demo mode the scope lives in component state and the URL carries only `from` / `to`.

#### Scenario: Missing parameters are the defaults

- **WHEN** the user opens `/network/sankey?hostname=sw-tor-1`
- **THEN** the controls show `7`, `3`, `10`, `source`, no problem is shown, and Query is available; the request Query sends carries those defaults explicitly

#### Scenario: An invalid parameter is refused, not rewritten

- **WHEN** the user opens `/network/sankey?hostname=sw-tor-1&max_hops=abc&threshold=150`
- **THEN** the `Max hops` input shows `abc` and `Threshold %` shows `150`, two problems are shown naming each field, Query is disabled with the first problem as its reason, no request is issued, and the address bar still reads `max_hops=abc&threshold=150`; after the user types `5` and `10` the problems clear and Query becomes available

#### Scenario: Defaults are omitted from the URL

- **WHEN** the user commits hostname `sw-tor-1` with every other control at its default
- **THEN** the address bar becomes `/network/sankey?hostname=sw-tor-1&from=…&to=…` with no `max_hops`, `top_n`, `threshold`, `track_dir` or `min_bps`

#### Scenario: A hostname is required

- **WHEN** the draft's hostname is empty
- **THEN** Query is unavailable with a reason stating that a hostname is required, the view shows `trace-empty-scope`, and no request is issued

### Requirement: Hostname candidates come from the last response's switches

The `Hostname` dropdown's options MUST be the labels of every `switch` kind node in the current normalized elements (deduplicated, sorted, `localeCompare`), so that after one draw the operator can start the next trace from any switch on the chart. Before any payload the list is empty and the control MUST explain that a hostname is typed until a query has drawn one; the control MUST always accept a typed custom value, because the body is a projection of one trace and never the authority on what switches exist. Changing the selection edits the draft only.

#### Scenario: Switches of the drawn body are offered

- **WHEN** a committed query drew switches `sw-tor-1`, `sw-core-1` and hosts `srv-db-07`
- **THEN** the dropdown lists `sw-core-1` and `sw-tor-1` only; typing `sw-tor-9` offers the custom-value row, and committing it sends `hostname=sw-tor-9`

### Requirement: Trace direction comes from `track_dir`

Packets always flow left to right and every edge is written in packet direction (`source` upstream, `target` downstream), regardless of the trace direction. The direction is the applied `track_dir`:

- `destination`: the investigated counter is an **in** interface; the trace follows edges downstream; the start hop is pinned to the **leftmost** column; a leaf is an edge `target`.
- `source`: the investigated counter is an **out** interface; the trace walks upstream against edge direction; the start hop is pinned to the **rightmost** column; a leaf is an edge `source`.

When the start node's `investigation.direction` disagrees (`in` with `source`, `out` with `destination`) the model MUST carry a warning naming both values, and the request's `track_dir` MUST win. The wire's top-level `kind` MUST NOT be read. When no node carries `investigation`, the model is still valid: there is no anchor card, the direction is purely `track_dir`, and a warning states that the response named no investigated interface.

#### Scenario: Source pins the start to the right

- **WHEN** the applied `track_dir` is `source` and the start switch's `investigation.direction` is `out`
- **THEN** the start hop is in the rightmost column, its anchor card sits to its right, the upstream switches and hosts are to its left, and no direction warning is listed

#### Scenario: A disagreeing direction warns and the request wins

- **WHEN** the applied `track_dir` is `destination` and the start switch carries `investigation.direction: "out"`
- **THEN** the chart is laid out with the start hop leftmost, and the warnings drawer lists that the response's `out` disagrees with the requested `destination`

### Requirement: Node kinds are hops, groups or leaves; hop boxes carry interface slot labels

Nodes are classified by kind: **hop** kinds `switch`, `router`, `node`, `pod`, `netapp-node`, `netapp-aggr`, `netapp-svm`, `pvc` are drawn as box cards with slots and residuals (a `router` is a hop exactly like a `switch`: the trace follows traffic through it); **group** kinds `namespace`, `application`, `cluster`, `storage-cluster`, `controller` are never drawn directly and exist only on `parent` chains; any other kind (`host`, an unknown value) is a **leaf** (see "Leaf and trace-stop cards"). A `node` touched only by placement edges (`labels.tier === "pod-node"` or `edgeType === "pod-to-node"`) MUST be dropped silently as a hop.

A hop box is a `SankeyCard` (see `sankey-canvas`) whose title is the node's `label` (`name`, falling back to `id`), whose subtitle is `<kind>` followed by ` · <labels.tier>` or ` · <labels.ontap_cluster>` when present, whose attribute lines are `ns/<namespace>` (a pod's derived namespace; other kinds' `labels.namespace`) and `usage` as `used / capacity (pct%)` only when both fields are present, and whose slots carry **interface labels**: the edge's `labels.source_iface` beside the slot on the source card's right edge, `labels.target_iface` beside the slot on the target card's left edge; an absent label leaves the slot unlabelled and MUST NOT be guessed. Slots on one side are ordered by ribbon value descending, ties by the opposite label. `node`, `pod` and `netapp-*` boxes use the dashed device stroke; `switch` and `pvc` the solid stroke. The border colour precedence is: `status` colour (the same palette the storage view uses) > the start hop's accent > dashed device > neutral. A **no-flow hop** (listed in `nodes`, hop kind, but no drawable flow edge touches it) is drawn as a box with no slots and no residuals, is not counted by the display threshold as hidden, and any explicit `otherInBps` / `otherOutBps` on it MUST be zeroed with a warning. The card face never prints the id; the id appears as the tooltip's last line only when it differs from the label.

#### Scenario: A switch box labels its slots

- **WHEN** edge `e0` runs `sw-edge-a → sw-core-1` with `labels: { source_iface: "et-0/0/48", target_iface: "et-1/0/1" }` and `metrics.deltaBps: 20e9`
- **THEN** the `sw-edge-a` card shows `et-0/0/48` beside its right-edge slot, the `sw-core-1` card shows `et-1/0/1` beside its left-edge slot, and a third edge without `target_iface` leaves its target slot unlabelled

#### Scenario: A placement-only node is not a hop

- **WHEN** `node/worker-3` appears in `nodes` and is touched only by a `pod-node` edge
- **THEN** no card is drawn for it and no error is reported

#### Scenario: A no-flow hop draws a bare box

- **WHEN** switch `sw-spare` is listed with `other_out_bps: 100` but no flow edge touches it
- **THEN** it is drawn as a box with no slots and no residual, the warnings list that its residual was ignored, and the hidden pill does not count it

### Requirement: Only `network-flow` edges draw, aggregated by interface pair

Only edges whose `edgeType` is `network-flow` produce ribbons. `storage-flow` edges and every other type MUST be ignored without error; a body containing only such edges yields the "nothing drawable" model error, not an exception. A ribbon's value is `metrics.deltaBps` (finite, ≥ 0, bits/s); an edge without it draws nothing but still counts as "an edge exists" for the leaf-pod, proxy-pod and no-flow decisions, and such edges are counted into one warning. A `0` value is a real reading and draws a ribbon at the minimum thickness, visually distinguished from non-zero ribbons. Several edges with the same `(source, target, source_iface, target_iface)` MUST be summed into one ribbon; the first edge's `labels.tier` / `attribution` are kept for the tooltip. An edge whose endpoint is a group node, or a leaf that has an onward edge (a `source` under `destination`, a `target` under `source`), is a model error naming the edge. An edge whose endpoint is missing from `nodes` was already dropped by normalize.

#### Scenario: Storage edges are ignored without crashing

- **WHEN** the storage fixture (`storage-flow` edges only) is fed to `deriveTrace`
- **THEN** the result is `ok: false` with the message that the body contains no drawable node, and no exception is thrown

#### Scenario: Same interface pair is summed

- **WHEN** two `network-flow` edges run `sw-a → sw-b` with `source_iface: "et-1"`, `target_iface: "et-2"` and `deltaBps` `3e9` and `2e9`
- **THEN** one ribbon of `+5 Gbps` is drawn between the two cards, and its tooltip lists one from / to pair

#### Scenario: A leaf continuing onward is an error

- **WHEN** under `destination` a `host` node is the `source` of a `network-flow` edge
- **THEN** `deriveTrace` returns `ok: false` with a message naming the node, its kind and that a leaf cannot carry an onward flow edge, and the view shows `trace-empty-model-error` listing it

### Requirement: Residuals make every hop conserve

For every hop the model MUST satisfy the balance `known in + other in = traced out + other out`, where `known in` is the sum of drawn inbound ribbons (plus the anchor edge's Δ on the start hop under `destination`) and `traced out` the sum of drawn outbound ribbons (plus the anchor Δ under `source`). `other in` / `other out` are the node's explicit `otherInBps` / `otherOutBps` when present; a missing one MUST be filled by the balance; when both are explicit and do not balance, the chart draws the explicit values and a warning spells out both sides and the difference. Amounts hidden by the display threshold MUST be folded into the residuals so the balance still holds. Two exceptions: a hop with **no inbound edge at all** (none drawn and none hidden) and no explicit `otherInBps` is a **source** and gets no other-in residual (only the in side is exempt — a hop with no onward edge still gets its other-out filled); and residuals never split by channel. A residual below the hop's own reading tolerance `eps = max(known in, traced out) × 0.005 + 1` bps MUST NOT be drawn, and the summary uses the same eps.

Residuals are drawn as dashed colour blocks on the outside of the box — other in on the left, other out on the right — as **real slots** in the card's slot stacks, with height on the **same thickness scale** as the ribbons (the scale's maximum includes residuals), labelled `other in` / `other out` with the amount through `formatDeltaBps`. The residual blocks are not subject to the display threshold. Colours are `sankey.traceResidualIn` / `traceResidualOut`.

#### Scenario: A missing 10 G becomes other in

- **WHEN** `Edge A` is the start with `investigation.delta_bps: 10e9` (`in`) and its only outbound ribbon carries `20e9`
- **THEN** `Edge A` shows an `other in` block of `+10 Gbps` on its left, no `other out`, and the summary's balance row for it reads `10 + 10 = 20 + 0`

#### Scenario: A source hop gets no other in

- **WHEN** `netapp-node-1` has outbound ribbons totalling `6e9`, no inbound edge and no explicit `other_in_bps`
- **THEN** no residual is drawn on its left, and its balance row shows `known in` `0` without an other-in entry

#### Scenario: A leaf-like node gets other out from the balance

- **WHEN** `node-w-13` receives `5e9` and has no onward edge
- **THEN** its right side shows `other out` `+5 Gbps`

#### Scenario: Both explicit but unbalanced

- **WHEN** a hop carries `other_in_bps: 1e9` and `other_out_bps: 0` while its ribbons are in `10e9`, out `12e9`
- **THEN** both blocks are drawn as given, the left and right stacks differ in thickness, and the warnings list `10 + 1 ≠ 12 + 0` with the shortfall of `1 Gbps`

#### Scenario: Noise below eps is not drawn

- **WHEN** a hop's ribbons sum to in `10e9` and out `10.02e9`
- **THEN** the `20 Mbps` difference is below `eps = 10.02e9 × 0.005 + 1` and no residual block is drawn

### Requirement: The anchor card marks the investigated interface

When exactly one node carries `investigation` and that node is a hop kind, the view MUST draw an **anchor card** on the start hop's outer side (left under `destination`, right under `source`): a `SankeyCard` whose label is `investigation.iface`, whose subtitle is `<in|out> · <formatDeltaBps(delta_bps)>`, bordered with the accent colour and dashed, with `note` in its tooltip; and an **anchor edge** between the anchor card and the start hop carrying `delta_bps`, which is never filtered by the display threshold and never aggregated with other edges. More than one node carrying `investigation`, or an `investigation` on a non-hop node, is a model error. The anchor card is not locatable.

#### Scenario: Anchor drawn on the outer side

- **WHEN** `sw-edge-a` carries `investigation: { iface: "xe-0/0/1", delta_bps: 10e9, direction: "in", note: "spike at 14:02" }` and the applied direction is `destination`
- **THEN** a card labelled `xe-0/0/1` with subtitle `in · +10 Gbps` sits left of `sw-edge-a`, an anchor ribbon of `+10 Gbps` joins them, hovering the card shows `spike at 14:02`, and a `Min Δ` of `50e9` still leaves that ribbon drawn

#### Scenario: Two investigations are an error

- **WHEN** two nodes carry `investigation`
- **THEN** `deriveTrace` returns `ok: false` naming both ids, and the view shows `trace-empty-model-error`

### Requirement: Leaf and trace-stop cards, with a clients table

A leaf node is drawn as a smaller `SankeyCard` whose title is its `label`, with attribute lines `ns/<labels.namespace>` when present and `<iface> · <amount>` for its ribbon (the interface from the edge's leaf-side label), and a role text `trace stop` in its top-right corner in the muted foreground. It has slots on its inbound side only.

When the node carries `clients`, each entry with at least an `ip` or a `hostname` is kept (an entry with neither is silently dropped; unknown keys ignored), and the card face becomes a table with a header row `hostname · ip · owner` and **one row per client, all listed**; a column whose value is empty on every client MUST be omitted and the card narrowed; a cell longer than its column is truncated with `…` while the full value is in the tooltip. The synthesized id (`<switch>:<iface>`) MUST NOT be printed as a title — a title appears only when `name` was given — and the last line carries the amount without repeating the interface. The role text becomes `client` for one client or `N clients`. When the node has no `name` and exactly one client, its display name (used by the inbound ribbon's tooltip) is that client's `hostname`, else its `ip`. Any node may carry `clients` (a hop's go to the tooltip only); only leaves draw them on the card. Leaf cards, including `host` leaves, are not locatable.

#### Scenario: A port with clients lists them

- **WHEN** leaf `sw-tor-1:xe-0/0/12` (kind `host`, no `name`) carries clients `{ ip: "10.42.7.31", hostname: "lab-gpu-01", owner: "Network Ops" }` and `{ ip: "10.42.7.32", hostname: "lab-gpu-02" }`
- **THEN** the card shows no title, a header `hostname ip owner`, two rows, `2 clients` in the corner, and the amount line without an interface; hovering the card lists both clients untruncated and ends with the id

#### Scenario: A single client names the leaf

- **WHEN** a leaf without `name` carries one client `{ ip: "10.42.7.40" }`
- **THEN** the inbound ribbon's tooltip reads `sw-tor-1 → 10.42.7.40`, the `owner` column is omitted from the card, and the id `sw-tor-1:xe-0/0/13` appears only in the card tooltip

### Requirement: Owner aggregation and ownership lines

For every leaf with `clients`, the model SHALL derive an **owner column** after the leaf column: one owner card per distinct non-empty `owner` string across the whole chart (same owner merged), and no card and no line for clients without an owner. How a port's amount reaches its owners depends on the port:

| Port                                                           | Link to each named owner                              | Reason                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| Every client has the same owner                                | **metered ribbon** carrying the port's full amount    | a regrouping of one measured number, like pod → application  |
| Clients of more than one owner, or any client without an owner | **ownership line**: dashed, unmetered, no value label | splitting one port reading among owners would be an estimate |
| No client has an owner                                         | none                                                  | nothing to aggregate                                         |

An owner card is a `SankeyCard` with the owner string as title; its first line is the **metered total** (metered ribbons only), suffixed `(partial ports)` when any of its ports is mixed, or reading `metered at port` when none of its ports is metered — it MUST never print a `0`; its second line is `N clients · M ports`. A leaf that gained an owner layer keeps its client-count role text (`client` / `N clients`); the owner band beside it says the rest. The owner layer is the owner band after the k8s band and MUST NOT enter any hop's balance. Owner cards are not locatable.

#### Scenario: A single-owner port meters its owner

- **WHEN** port `A` (`+4 Gbps`) has two clients both owned by `Network Ops`
- **THEN** a metered ribbon of `+4 Gbps` runs from `A` to the `Network Ops` card, whose first line reads `+4 Gbps` and second `2 clients · 1 port`; `A`'s role text reads `2 clients`

#### Scenario: A mixed port draws ownership lines only

- **WHEN** port `B` (`+6 Gbps`) has clients owned by `Network Ops`, `Research`, and one with no owner
- **THEN** dashed lines without labels run from `B` to both owner cards, no value leaves `B` toward them, `Network Ops`'s first line reads `+4 Gbps (partial ports)`, `Research`'s reads `metered at port`, and every hop's balance is unchanged by the owner layer

#### Scenario: No known owner, no owner layer

- **WHEN** a port's clients all lack `owner`
- **THEN** no owner card is created for it, its role text stays its client count, and the owner band (if other ports created one) is unaffected

### Requirement: Derived pod, application and namespace cards

A **leaf pod** is a `pod` kind with no onward flow edge (under `destination`: no outbound edge; under `source`: no inbound edge; existence, not measurement, decides). A pod with an onward edge is a **proxy pod**, drawn as an ordinary hop with no derived link (its namespace is only a subtitle). For every leaf pod the view SHALL derive terminus cards from the pod's `parent` chain: an `application` ancestor (card titled by that group's `name`) then that application's `namespace` ancestor; otherwise the pod's own `namespace` ancestor; otherwise `labels.namespace`; otherwise nothing — a pod without a namespace is legal, gets no derived link, no `ns/` line and no warning. A `parent` pointing at a missing id is treated as absent; a chain that loops stops at the first repeat.

`pod → application` and `application → namespace` links carry the sum of the pod's drawn inbound ribbons — a regrouping, not an estimate — and are exempt from the display threshold. The same application (per namespace) and the same namespace across the chart merge into one card showing the total and the pod count; an application appearing under two namespaces is two cards. Derived cards carry the worst `status` among their member pods and the neutral border when none has one; the leaf pod card keeps its own status. Pod cards draw `ns/<ns>` and `<iface> · <amount>` lines; application cards `ns/<ns>`, `N pods`, `total <amount>`; namespace cards `N pods`, `total <amount>`. Leaf pods are locatable; application, namespace and owner cards are not.

#### Scenario: A pod with an application ancestor

- **WHEN** leaf pod `ingest-7d9c` (`parent: app/telemetry-ingest`, whose parent is `ns/telemetry`) receives `+8 Gbps`
- **THEN** cards `telemetry-ingest` (application, `1 pod`, `total +8 Gbps`) and `telemetry` (namespace) are drawn to its right with two derived ribbons of `+8 Gbps`, and the pod card reads `ns/telemetry`

#### Scenario: Namespace from the label as a last resort

- **WHEN** leaf pod `kafka-2` has no `parent` but `labels.namespace: "stream"`
- **THEN** a `stream` namespace card is derived directly from the pod, spanning the application column

#### Scenario: A proxy pod derives nothing

- **WHEN** pod `envoy-0` receives `+3 Gbps` and forwards `+3 Gbps` to `pod/app-1`
- **THEN** `envoy-0` is an ordinary hop box with no derived link and no residual, and only `app-1`'s namespace is a terminus card

### Requirement: Bands, columns, tier locking, cycle breaking, backward and lateral ribbons

The drawing is three **bands** in trace order — the **switch** band (the anchor and every switch hop), the **k8s** band (the fixed chain `k8s node` → `pod` → `application` → `namespace`, each a column only when some card needs it) and the **owner** band (one column). Under a `destination` trace the bands run left → right from the start; under a `source` trace the k8s and owner bands sit to the LEFT of the switch band so packets still flow left → right and the start hop keeps the far right. Every non-k8s trace stop (a `host`, a neighbourless port, any leaf kind) is placed in the k8s band's **last** column as its lower partition, below every k8s card of that column (the "client partition"); when nothing on the chart is Kubernetes that column holds the clients alone. The two partitions of the k8s band share one top line each across its columns: the k8s cards start together, and the client cards start together below the tallest k8s partition.

Inside the switch band, column assignment is the longest path from the start hop: every drawn edge between two switch-band nodes forces its downstream node at least one column after its upstream node. Nodes sharing a `labels.tier` value MUST be locked into one column (treated as one super node for the longest path; edges inside a tier do not participate); `netapp-node`, `netapp-aggr`, `netapp-svm` and `pvc` MUST take their kind as tier when the label is absent, while `switch`, `node` and `pod` MUST NOT. When two groups carry flow in both directions, the direction with the smaller total is marked **backward**, excluded from ordering, and warned; a cycle over three or more groups is broken by dropping the smallest-flow direction on it from ordering, with a warning; a topology that still cannot be ordered warns that a cycle is suspected. An edge that runs from the k8s band back into the switch band takes no part in the ordering, is backward, and is warned as crossing the band boundary. Backward ribbons are drawn with the `sankey.traceBackward` gradient; edges between two nodes of one column are **lateral** ribbons drawn as an arc on the column's right side with an arrowhead at the downstream end; both use the shared thickness scale and pass through conservation as ordinary traced amounts.

Column captions read `Trace start (in)` / `Trace start (out)` for the anchor column and `Hop N` (`Hop N · <kind>` when the column holds one non-switch hop kind) in the switch band; `k8s node`, `pod`, `application` and `namespace` in the k8s band, the last of them suffixed ` / client` when the client partition is present, and plain `client` when the column holds no k8s card; and `owner` for the owner band. Without an anchor the first switch column is `Hop 0`. The vertical order inside a column is `Flow` by default (see "Layout and order switches").

#### Scenario: Three bands under a destination trace

- **WHEN** the start ToR feeds two k8s nodes whose pods carry namespaces, and also a host port with clients owned by `Network Ops`
- **THEN** the columns read `Trace start (in)`, `Hop 1`, `k8s node`, `pod`, `namespace / client`, `owner`; the host port sits in the `namespace / client` column below every namespace card; and the `Network Ops` card is the only card of the last column

#### Scenario: Three bands under a source trace

- **WHEN** the same body is walked as a `source` trace
- **THEN** the columns read `namespace`, `pod`, `k8s node`, `Hop 1`, `Trace start (out)`, with the ribbons still running left → right

#### Scenario: A tier stays in one column

- **WHEN** `bdr-1` and `bdr-2` carry `labels.tier: "bdr"` and `bdr-1 → bdr-2` carries `+2 Gbps` beside their downstream edges
- **THEN** both sit in the same column, the `bdr-1 → bdr-2` ribbon is drawn as a right-side arc with an arrowhead, their downstream switches are one column later, and `bdr-2`'s balance includes the `2 Gbps`

#### Scenario: Two-way flow demotes the smaller direction

- **WHEN** `sw-a → sw-b` carries `+9 Gbps` and `sw-b → sw-a` carries `+1 Gbps`
- **THEN** `sw-a` is placed before `sw-b`, the `+1 Gbps` ribbon is drawn backward with the backward gradient, and the warnings list the demotion

### Requirement: Layout and order switches

The control bar SHALL provide `Group` (`None` default | `Cluster`) and `Order` (`Flow` default | `Barycenter`), both **transient** page state (not in the URL, not persisted, reset on remount), and switching either issues no request and preserves the zoom / pan viewport and hover state.

Every card reads its Kubernetes cluster from its own `labels.cluster` (k8s nodes and pods on the wire); a synthesised namespace / application card inherits its pod's, and one namespace name present in two clusters is two namespace cards. Under `Cluster`, every k8s-band card (k8s node hop, pod, application, namespace) that names a cluster is framed with the others of that cluster in one `SankeyWrapperBox` spanning every k8s column, one row block per cluster shared across the columns (a column with no member of a cluster leaves that block's row empty); frames are ordered by the summed traced flow of the cluster's pod cards under `Flow` and by name under `Barycenter`, cards naming no cluster sit below every frame, the client partition below everything, and a frame's border takes the worst status of its members. A frame is not a graph node: it has no edges, no column of its own and no residuals; ribbons attach to the cards. Its title row hovers (tooltip `cluster / <name>`, the card count, the folded status) and lights the union of its members' paths, and is not locatable. Under `None`, or when no card names a cluster, no frame is drawn and the layout is exactly the ungrouped one.

Under `Flow`, a node's rank is the amount on its **traced side** — the sum of its inbound ribbons under a `destination` trace, of its outbound ribbons under a `source` trace — **excluding residuals**, descending; leaf pods and application cards of one namespace stay adjacent (groups ordered by group total), cluster frames partition the k8s columns first, a lateral chain stays adjacent with the producer above, and equal ranks fall back to the upstream barycenter. `Barycenter` orders purely by the upstream barycenter. Both orders apply to the k8s partition and the client partition of a column separately: the client cards are always below the k8s cards.

#### Scenario: Cluster grouping frames a cluster across the k8s columns

- **WHEN** the fixture's `node-w-11`, `ingest-7d9c` and `kafka-2` carry `labels.cluster: east`, `node-w-12` and its pods `west`, and the user switches `Group` to `Cluster`
- **THEN** a frame titled `east` encloses the `node-w-11` hop, both pod cards and their namespace cards across the k8s columns, a second frame `west` sits below it, `node-w-13` sits below both, the ribbons still end on the cards, the request count is unchanged, and the zoom readout is unchanged

#### Scenario: Flow order ignores residuals

- **WHEN** switch `X` has ribbons totalling `+3 Gbps` and an `other out` of `+20 Gbps`, and switch `Y` in the same column has ribbons totalling `+5 Gbps`
- **THEN** `Y` is placed above `X`

### Requirement: The `Min Δ` display threshold

The control bar SHALL provide a `Min Δ` input (bits/s, raw string, the same input styling as the storage view's Top pods field, an accessible name, an adjacent rendering of the value in `Gbps` / `Mbps` / `kbps`) with a `Clear` action. Edits apply after a 200 ms debounce; blur normalizes the field through `cleanMinBps` (floor; a value not greater than `0` is `0`). The chart keeps only ribbons whose aggregated value is **strictly greater** than the threshold (`>`, never `>=`); hidden amounts fold into the hop's residuals (see "Residuals"); the anchor edge and derived edges are exempt; a hop with no ribbon left is hidden as a whole (a no-flow hop is not counted); the residual blocks themselves are not filtered. While anything is hidden the control bar MUST show a pill `hidden N ribbons / M hops (X)` where `X` is the hidden total through `formatDeltaBps`, and the same sentence appears in the warnings drawer. When the threshold hides every hop and there is no anchor, the view shows `trace-empty-filtered` with the pill still visible. The threshold is a display value: it is never sent to the backend, changing it issues no request, and outside demo mode it is written to the URL as `min_bps` (omitted when `0`).

#### Scenario: Strictly greater

- **WHEN** ribbons of exactly `500000000` and `500000001` exist and the user sets `Min Δ` to `500000000`
- **THEN** the first is hidden and the second is drawn

#### Scenario: Hidden amounts stay in the balance

- **WHEN** `sw-core-1` has outbound ribbons `+14 Gbps`, `+5 Gbps` and `+0.4 Gbps`, and `Min Δ` is `1e9`
- **THEN** the `0.4 Gbps` ribbon disappears, `sw-core-1`'s `other out` grows by `0.4 Gbps`, the pill reads `hidden 1 ribbon / 0 hops (+400 Mbps)`, no request is issued, and the address bar carries `min_bps=1000000000`

#### Scenario: Everything filtered

- **WHEN** a body without `investigation` has every ribbon below the threshold
- **THEN** the view shows `trace-empty-filtered` naming the threshold, the pill states the hidden counts, and the scope bar stays operable

### Requirement: Legend

The chart area SHALL show a legend whose rows are presence-gated: a traced Δ ribbon row (always when a chart is drawn), a backward ribbon row, a lateral ribbon row, an ownership-line row, `other in` / `other out` swatches, and the shared `StatusLegend` dots when any card carries a status. Rows are drawn with the same SVG line samples the storage view's legend uses and text labels; the legend MUST NOT rely on hue alone to distinguish traced, backward and ownership lines (dashing and arrowheads distinguish them).

#### Scenario: Rows follow the chart

- **WHEN** the fixture draws with one backward edge and owner lines but no lateral edge
- **THEN** the legend shows the Δ, backward, ownership and residual rows and no lateral row; after `Min Δ` hides the backward edge the backward row disappears

### Requirement: Tooltips

Tooltips are rendered by the shared `SankeyTooltip` from lines the model produces. Hovering a ribbon MUST show: `from → to` (display names), the exit interface and the entry interface only where that end has a label, the rate through `formatDeltaBps`, the namespace where the downstream end is a pod, the `client` line when the downstream leaf has clients (an owner-bound edge lists the port side instead), `ownership` for an ownership line (which has no rate line), `tier` and `attribution` when present (`split` reads as an evenly split estimate), and whether the ribbon is the anchor, backward or derived. Hovering a card MUST show, in order and only when present: kind and name, `ns`, `ontap_cluster`, for a hop, a pod, a client leaf and an application / namespace card `traced in` / `traced out` painted in the ribbon colour followed by `other in` / `other out` painted in the residual colours (both always present, a `0` reads as `0 bps`; a trace-end pod or client counts only its measured, non-derived ribbons as traced and takes other in / out from its `otherInBps` / `otherOutBps`, else `0`; an application / namespace card sums its member cards' four values; these tooltip rows never add residual blocks to the chart), for an owner card its `in` and `out` totals (an owner card metered at the port shows `—` for `in`), for application / namespace cards `derived from member pods` and the pod count, for owner cards the source (`derived from ports`) plus client and port counts, `usage`, `status` (`worst of member pods` on derived cards), `health`, `hardware.model`, the four `perf` readings marked raw, `alerts` as `<severity> <name>`, the no-flow statement, every client on its own untruncated line, and the id last when it differs from the name. Residual blocks have their own tooltip naming the hop, the side and the amount.

#### Scenario: Ribbon tooltip

- **WHEN** the user hovers the `sw-core-1 → srv-db-07` ribbon whose edge carries `source_iface: "et-1/0/9"` and no `target_iface`
- **THEN** the tooltip shows `sw-core-1 → srv-db-07`, `exit et-1/0/9`, no entry line, and `+20 Gbps`

#### Scenario: Card tooltip ends with the id

- **WHEN** the user hovers `Edge A` (id `sw-edge-a`, `status: warning`)
- **THEN** the tooltip shows `switch · Edge A`, `in +10 Gbps`, `out +20 Gbps`, `other in +10 Gbps`, `status warning`, and `id sw-edge-a` as its last line

### Requirement: Hover highlights the path

Hovering a card MUST highlight every ribbon on every path through it — upstream and downstream, through derived and ownership edges — and fade the rest through the shared `lit` opacity mechanism; hovering a cluster frame's title row highlights the union of its members' paths; leaving reverts everything; hover MUST change styles only and never re-run layout. When a refresh removes the hovered node the tooltip and highlight MUST be cleared.

#### Scenario: Hovering a host lights its whole path

- **WHEN** the user hovers `srv-db-07`
- **THEN** the anchor ribbon, `sw-edge-a → sw-core-1` and `sw-core-1 → srv-db-07` are lit, every other ribbon and card is faded, and the layout function is not called

### Requirement: Clicking a card Locates into the Network Graph

Clicking a locatable card MUST push-navigate to `/network/graph` keeping the current query string, passing the node id through navigation state (not the URL). Because both views share the category's loader, the Graph view MUST run Locate as soon as it mounts with the payload already held (no new request); when no payload is held it runs after the first successful load, once. Locatable cards are hop boxes except `netapp-svm` and leaf pods; anchor, application, namespace, owner and leaf (`host`) cards and cluster frame title rows are not and MUST NOT be presented as clickable. Back returns to `/network/sankey` with the same query and no selection.

#### Scenario: Locate keeps the scope and issues no request

- **WHEN** after a committed query on `/network/sankey?hostname=sw-tor-1&from=…&to=…` the user clicks the `sw-core-1` card
- **THEN** the address bar becomes `/network/graph?hostname=sw-tor-1&from=…&to=…` (push), the Graph view selects `sw-core-1` and fits its neighbourhood without issuing a request, and Back returns to the Sankey with the same query and no selected card

### Requirement: Zoom, keyboard and focus are the shared behaviour

The chart area's zoom / pan, opening viewport, control bar (zoom out, factor readout, zoom in, fit, 1:1, focus), keyboard shortcuts (`+` `-` `0` `1` `F` `Esc`, on the chart container only) and focus mode (collapsing the nav bar, scope bar, control bar, legend and summary) MUST be provided by `sankey-canvas` and behave exactly as specified there and in `storage-flow-sankey`; the trace view MUST NOT reimplement any of them. Changing `Min Δ`, `Layout`, `Order`, the theme, the container size or a refresh preserves the viewport; a new payload for a different hostname returns to the opening viewport.

#### Scenario: Focus mode on the Network Sankey

- **WHEN** the user zooms to 150 %, presses `F`, then `Esc`
- **THEN** in focus mode the nav bar, scope bar, control bar, legend and summary are hidden and the chart fills the window; after leaving, all are restored and the readout still says `150%`

### Requirement: Empty states

The view MUST distinguish six states by cause, each with its own `data-testid` and explanatory text in the same format as the storage view's empty states, with the scope bar operable in every state:

1. `trace-empty-unconfigured` — `endpoints.trace` absent outside demo mode.
2. `trace-empty-scope` — the draft has no hostname or has problems; names the problem and states that no request has been issued.
3. `trace-empty-awaiting` — the draft is valid but nothing has been committed on this mount; points at Query.
4. `trace-empty-cancelled` — the only request of this mount was cancelled and no payload is held.
5. `trace-empty-model-error` — `deriveTrace` returned `ok: false` (including an empty or storage-only body): lists every error.
6. `trace-empty-filtered` — the display threshold hid every hop.

A warnings drawer below the chart lists the model's warnings together with the normalize boundary's `errors`, collapsed by default with a count.

#### Scenario: A deep link awaits Query

- **WHEN** the user opens `/network/sankey?hostname=sw-tor-1&from=now-1h&to=now`
- **THEN** `trace-empty-awaiting` is shown naming the Query control, no request has been issued, and Reload is unavailable

#### Scenario: Empty body is a model error, not a blank

- **WHEN** the backend answers 200 with `{ elements: { nodes: [], edges: [] } }`
- **THEN** the view shows `trace-empty-model-error` stating that the body contains no drawable node, and the status indicator reads ready

### Requirement: Bits-per-second formatting

Every Δ value (ribbons, residuals, tooltips, summary, the `Min Δ` readout) MUST be formatted by `formatBitsPerSec` on the shared significant-digit ladder (`shared/format/measurements`): base 1000, units `bps` / `kbps` / `Mbps` / `Gbps` / `Tbps`, three significant digits, `0` → `0 bps`, a non-zero value below `1 bps` in exponential form. `formatDeltaBps` prefixes `+` and is the **only** place a sign is produced: ribbon labels, residual labels, anchor subtitle, owner totals, tooltips and the pill all go through it, so a traced amount and a residual are formatted alike. No unit conversion happens anywhere: `delta_bps` is bits per second as received.

#### Scenario: Ladder and sign

- **WHEN** formatting `10000000000`, `400000000`, `0` through `formatDeltaBps`
- **THEN** the results are `+10 Gbps`, `+400 Mbps`, `+0 bps`, and `formatBitsPerSec(10000000000)` is `10 Gbps`

### Requirement: Theme through tokens only

The trace view MUST use theme tokens for every colour and render in both themes; the feature directory MUST contain no hex colour, no CSS file and none of the ported project's class names. Only these tokens are introduced: `kind.host`, `edge['network-flow']`, `sankey.traceFlow` / `traceFlowEnd`, `sankey.traceBackward` / `traceBackwardEnd`, `sankey.traceResidualIn` / `traceResidualOut`; every other colour reuses an existing token (card fill and stroke, status palette, `accent.primary` for the start hop and anchor, `border.medium` / `fg.muted` for leaf, group and owner cards and ownership lines, `bg.canvas` for label halos, `sankey.namespace1-5` for namespace bars). A theme switch redraws without losing hover, layout or the viewport and issues no request.

#### Scenario: No colour outside the tokens

- **WHEN** the invariants test scans `src/features/network-trace/`
- **THEN** it finds no `#rrggbb` literal, no `.css` file and no `className` string style, and the ribbon gradients reference `sankey.traceFlow` / `traceFlowEnd`

### Requirement: Performance bounds

For a synthetic body of 2000 `network-flow` edges (400 switches, 300 Kubernetes nodes, 800 leaf pods over 40 namespaces and 100 applications, 200 hosts each with 3 clients over 20 owners, one investigation, ten tier groups, five backward edges), on the hardware the e2e suite runs on: the time from the normalized result to the first completed draw (`None`, `Flow`, `Min Δ` `0`) MUST be within **1000 ms**; a `Min Δ`, `Group` or `Order` change MUST redraw within **500 ms**; hover and zoom / pan MUST call the layout function 0 times and complete within one animation frame.

#### Scenario: First draw of the synthetic body

- **WHEN** the trace view receives the synthetic body above
- **THEN** the first completed draw is within 1000 ms, every hop's balance holds, and switching `Group` to `Cluster` redraws within 500 ms

### Requirement: Card search

The Network trace Sankey SHALL show the card search of `sankey-canvas` "Card search overlay". The searchable records are exactly the placed cards — hop boxes, leaf, pod, application, namespace and owner cards, the anchor card — and every k8s node frame under the `Node` layout; a hop hidden by `Min Δ` MUST NOT be a hit.

- A card's fields are its `label`, its role (a leaf's wire type such as `host` in place of the role `leaf`), `namespace`, NetApp cluster, tier, k8s node and owner, and for a leaf each client's `ip`, `hostname` and `owner` as separate values, so a hit on an address names that address on its result line. A frame's fields are its `label` and the kind `node`.
- A hit's lit path is its "Hover highlights the path" set; a frame hit lights the union of its member pods' paths.

#### Scenario: A pod lights its path to the start

- **WHEN** the user types `kafka-2` on the showcase trace
- **THEN** `kafka-2`, `node-w-11`, `ToR k8s (k8s)` and `Core 1` are lit and the `網管部 王小明` owner card is faded

#### Scenario: A client address finds its leaf

- **WHEN** the user types `10.42.7.31`
- **THEN** one result is listed with the line `ip: 10.42.7.31`, and the leaf's path including its owner card `網管部 王小明` is lit
