## ADDED Requirements

### Requirement: The `host` node kind and the `network-flow` edge type are registered

`NodeKind` SHALL include `host` (a non-Kubernetes endpoint reached by the network trace: a server, a client machine, a port with clients behind it) and `EdgeType` SHALL include `network-flow` (one traced hop of switch-interface traffic, direction always packet direction, weight `metrics.deltaBps` in bits/s). Both MUST be registered in every table the compiler keys on the enum, so that a Network payload drawn by the Graph view takes no fallback path:

- `ICON_SVG_BY_KIND.host`: a host glyph, coloured monochrome with the theme like every other kind; `categoryByKind.host` is `Other`; `tokens.kind.host` exists in both palettes.
- `EDGE_STYLE_BY_TYPE['network-flow']`: colour `tokens.edge['network-flow']` (distinct from every `STATUS_COLOR` value and from the fabric edges' infra colour), solid line, `taxi` routing like the switch fabric edges; `EDGE_ENDPOINTS_BY_TYPE['network-flow']` is `{ from: 'switch', to: 'host' }` so the legend row reads `switch → host`; `EDGE_IS_TRAFFIC_BY_TYPE['network-flow']` is `false`; the type is drawn in both pod-parent modes.
- The showcase coverage test's "every key of `ICON_SVG_BY_KIND` and `EDGE_STYLE_BY_TYPE`" rule is satisfied by the trace fixture (see `dev-environment`), not by adding network elements to `SHOWCASE_GRAPH`.

The `host` kind is a leaf with the ordinary node tooltip path; it is selectable and detail-eligible like `external`. A `network-flow` edge whose endpoints are a switch and a Kubernetes `node` or `pod` is still drawn with the same style — the endpoint table names the legend text, not a constraint.

#### Scenario: A network payload draws without fallbacks

- **WHEN** the Graph view receives the normalized trace fixture on `/network/graph`
- **THEN** every `host` node renders the host glyph (no unknown-kind fallback icon), every `network-flow` edge renders in `tokens.edge['network-flow']` with taxi routing, the edge legend lists `switch → host` once, and the node legend lists `host` under `Other`

#### Scenario: The stylesheet snapshot gains only the taxi selector's third type

- **WHEN** `getStylesheet`'s snapshot is regenerated after registering the kind and the edge type
- **THEN** the one change is that the taxi-routing entry's selector reads `edge[edgeType='switch-to-switch'], edge[edgeType='node-to-switch'], edge[edgeType='network-flow']`; the snapshot gains no entry, and `host` needs no rule at all — the base `node` rule resolves `background-image` per kind through a function and the base `edge` rule resolves `line-color` the same way, so a kind and a colour are registered in the maps, never in the stylesheet

### Requirement: The hover tooltip shows an edge's Δ rate

When a hovered or pinned edge's `data.metrics` carries `deltaBps`, the tooltip MUST render one row `Δ rate: <formatDeltaBps(deltaBps)>` (for example `Δ rate: +8 Gbps`) **first**, ahead of every I/O row: a `network-flow` hop carries that one measurement and nothing else, so it heads the block rather than trailing a run of storage rows that are absent for it. When the field is absent the row MUST NOT render. The row is additive: edges without `deltaBps` render exactly as today, and an edge carrying both I/O fields and `deltaBps` shows the Δ row and then the I/O rows in their existing read-then-write order.

#### Scenario: Δ row present and absent

- **WHEN** the user hovers a `network-flow` edge with `metrics: { deltaBps: 8000000000 }`, then an edge whose `metrics` carries both `deltaBps` and `readOps`, then a `pod-to-node` edge without `metrics`
- **THEN** the first tooltip shows `edgeType`, `source → target` and `Δ rate: +8 Gbps`; the second lists the Δ row above the ops row; the third shows no Δ row

### Requirement: Node attributes surface `investigation` and `clients`

`buildNodeAttributes` SHALL add promoted rows for the network node fields:

- a **`trace start`** row — keyed by what it means, not by the wire field — reading `<iface> <formatDeltaBps(deltaBps)> <direction>` when the node carries `investigation` (for example `Ethernet1/1 +8.5 Gbps in`): the interface the trace was anchored on and the delta seen there. The direction is appended ONLY when the backend stated one, because its absence means the request's `track_dir` decided the side and naming one here would contradict the Sankey; the delta likewise only when it is a number.
- a **`clients`** row reading the COUNT alone (`2 clients`) when the node carries a non-empty `clients`. The endpoint list itself is the Sankey leaf card's job; the tooltip says only that there is one and how big, so a port standing for fifty machines stays one row.

Both are omitted when absent and MUST NOT change any existing row.

#### Scenario: Rows for a switch and a host

- **WHEN** the user hovers the start switch (carrying `investigation: { iface: "Ethernet1/1", deltaBps: 8500000000, direction: "in" }`) and then a `host` node with two clients
- **THEN** the first tooltip shows `trace start: Ethernet1/1 +8.5 Gbps in` and no `clients` row; the second shows `clients: 2 clients` with no per-client line and no `trace start` row; a `pod` node's tooltip is unchanged
