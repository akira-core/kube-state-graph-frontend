## MODIFIED Requirements

### Requirement: The `host` node kind and the `network-flow` edge type are registered

`NodeKind` SHALL include `host` (a non-Kubernetes endpoint reached by the network trace: a server, a client machine, a port with clients behind it) and `EdgeType` SHALL include `network-flow` (one traced hop of switch-interface traffic, direction always packet direction, weight `metrics.deltaBps` in bits/s). Both MUST be registered in every table the compiler keys on the enum, so that a body carrying them takes no fallback path in the Graph view:

- `ICON_SVG_BY_KIND.host`: a host glyph, coloured monochrome with the theme like every other kind; `categoryByKind.host` is `Other`; `tokens.kind.host` exists in both palettes.
- `EDGE_STYLE_BY_TYPE['network-flow']`: colour `tokens.edge['network-flow']` (distinct from every `STATUS_COLOR` value and from the fabric edges' infra colour), solid line, `taxi` routing like the switch fabric edges; `EDGE_ENDPOINTS_BY_TYPE['network-flow']` is `{ from: 'switch', to: 'host' }` so the legend row reads `switch → host`; `EDGE_IS_TRAFFIC_BY_TYPE['network-flow']` is `false`; the type is drawn in both pod-parent modes.
- The showcase coverage test's "every key of `ICON_SVG_BY_KIND` and `EDGE_STYLE_BY_TYPE`" rule is satisfied by the trace fixture (see `dev-environment`), not by adding network elements to `SHOWCASE_GRAPH`.

The `host` kind is a leaf with the ordinary node tooltip path; it is selectable and detail-eligible like `external`. A `network-flow` edge whose endpoints are a switch and a Kubernetes `node` or `pod` is still drawn with the same style — the endpoint table names the legend text, not a constraint. No route draws the trace body on a Graph view; the registration keeps the Graph view correct for any `/v1/graph` body that carries these values.

#### Scenario: A network payload draws without fallbacks

- **WHEN** the Graph view is rendered with the normalized trace fixture as its elements
- **THEN** every `host` node renders the host glyph (no unknown-kind fallback icon), every `network-flow` edge renders in `tokens.edge['network-flow']` with taxi routing, the edge legend lists `switch → host` once, and the node legend lists `host` under `Other`

#### Scenario: The stylesheet snapshot gains only the taxi selector's third type

- **WHEN** `getStylesheet`'s snapshot is regenerated after registering the kind and the edge type
- **THEN** the one change is that the taxi-routing entry's selector reads `edge[edgeType='switch-to-switch'], edge[edgeType='node-to-switch'], edge[edgeType='network-flow']`; the snapshot gains no entry, and `host` needs no rule at all — the base `node` rule resolves `background-image` per kind through a function and the base `edge` rule resolves `line-color` the same way, so a kind and a colour are registered in the maps, never in the stylesheet
