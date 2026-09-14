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

#### Scenario: The stylesheet snapshot changes by exactly two entries

- **WHEN** `getStylesheet` is regenerated after registering the kind and the edge type
- **THEN** the snapshot diff adds the `host` kind rule and the `network-flow` edge rule and changes nothing else

### Requirement: The hover tooltip shows an edge's Δ rate

When a hovered or pinned edge's `data.metrics` carries `deltaBps`, the tooltip MUST add one row `Δ rate: <formatDeltaBps(deltaBps)>` (for example `Δ rate: +8 Gbps`) after the existing RED / I/O rows; when the field is absent the row MUST NOT render. The row is additive: edges without `deltaBps` render exactly as today, and an edge carrying both I/O fields and `deltaBps` shows both families' rows.

#### Scenario: Δ row present and absent

- **WHEN** the user hovers a `network-flow` edge with `metrics: { deltaBps: 8000000000 }` and then a `pod-to-node` edge without `metrics`
- **THEN** the first tooltip shows `edgeType`, `source → target` and `Δ rate: +8 Gbps`; the second shows no Δ row

### Requirement: Node attributes surface `investigation` and `clients`

`buildNodeAttributes` SHALL add promoted rows for the network node fields: an `investigation` row reading `<iface> · <in|out> · <formatDeltaBps(delta_bps)>` when the node carries `investigation`, and a `clients` row reading `N clients` followed by one line per client (`hostname`, `ip`, `owner`, present fields only) when the node carries `clients`. Both are omitted when absent and MUST NOT change any existing row.

#### Scenario: Rows for a switch and a host

- **WHEN** the user hovers the start switch (with `investigation`) and then a `host` node with two clients
- **THEN** the first tooltip shows the `investigation` row and no `clients` row; the second shows `2 clients` with two lines and no `investigation` row; a `pod` node's tooltip is unchanged
