## Purpose

Reads the physical network's tier (level) from the `data.labels.level` of `switch` nodes, and under the force-directed (`fcose`) layout pins the switch fabric into per-level stacked horizontal rows — higher levels above, same level on the same row — while rendering `node-to-switch` / `switch-to-switch` edges with orthogonal routing, so that K8s node uplinks and the switch fabric read as a clearly tiered physical network in the Graph view.

## ADDED Requirements

### Requirement: read the switch level from node labels

The system SHALL read each `switch` node's network **level** from its `data.labels.level` value, parsed as a base-10 integer. A level SHALL be accepted only when it parses to an integer greater than or equal to zero; `switch` nodes whose `labels.level` is absent, blank, non-numeric or negative SHALL be assigned no level. This read SHALL depend only on the graph elements supplied, MUST produce the same result for the same input (deterministic), and must not produce any side effect. The system SHALL NOT derive levels from the graph structure (it must not walk `node-to-switch` / `switch-to-switch` edges).

#### Scenario: a valid level label is read

- **WHEN** a `switch` node's `labels.level` is the string `"2"`
- **THEN** the node is assigned level 2

#### Scenario: a missing level label assigns no level

- **WHEN** a `switch` node has no `labels.level` value
- **THEN** the node is assigned no level and is excluded from the level map

#### Scenario: an invalid level label assigns no level

- **WHEN** a `switch` node's `labels.level` cannot be parsed as a non-negative integer (blank, non-numeric or negative)
- **THEN** the node is assigned no level and is excluded from the level map

#### Scenario: non-switch nodes are ignored

- **WHEN** a node whose `kind` is not `switch` carries a `labels.level` value
- **THEN** the node is ignored and is never assigned a level

#### Scenario: the result is empty when there are no switches

- **WHEN** the graph contains no `switch` nodes
- **THEN** the level read returns an empty map

### Requirement: the switch fabric is pinned into per-level stacked rows

The system SHALL assign every levelled `switch` node a fixed absolute position by level, so that the switches form one horizontal row per level: higher level numbers sit **above** lower ones (for example the highest-level core switches render at the very top), and switches of the same level spread out horizontally along the same row. This pinning SHALL be expressed only through the "fixed node position" capability the force-directed layout natively supports, without introducing a new layout engine or additional dependency.

The system SHALL NOT pin K8s `node` nodes in either pod-parent mode: nodes attached to the fabric (sources of `node-to-switch` edges) are pulled toward the fabric only by their uplink edges, and the force-directed layout is free to place them (and the cluster compounds containing them) without overlapping the fabric. (Rationale: an earlier version pinned fabric-attached nodes in controller mode to a tier below the fabric derived from `min(switchLevel) − 1`; that pinning was removed — the whole cluster compound being dragged onto the pinned fabric caused compound overlap.)

When switches are nested via `data.parent` under a single virtual `network` compound (kind `network`, for example labelled `physical network`) that boxes the whole fabric, the fixed-position constraints SHALL still target only the simple `switch` nodes themselves, and SHALL apply exactly the same result whether or not that wrapper compound exists — the wrapper's outline merely follows its pinned children; as a compound, it keeps its distance from the cluster compounds and can be collapsed like any other container (see graph-view for legend behaviour).

When the data contains at least one **parentless** `switch` and **no** `network` kind node, the app SHALL synthesize this wrapper itself (a pure graph-data step applied after normalization): inject a single `network` node (id `network/fabric`, label `physical network`) and re-parent every parentless `switch` under it. When a `network` kind node already exists (the data owns its own grouping), or every `switch` already carries a `parent` (a backend-assigned parent is never overwritten), this synthesis SHALL back off entirely, leaving the elements unchanged. This step MUST be a pure function (it must not mutate its input).

The constraints SHALL reference only levelled `switch` nodes; every other node (pods, controllers, services, pvcs, clusters, K8s nodes, the virtual `network` wrapper, unlevelled switches) SHALL remain freely placed by the force-directed layout. The constraints SHALL apply only when the current layout is the force-directed (`fcose`) layout. When no `switch` node carries a valid level, the system SHALL produce no constraints and the layout SHALL behave exactly as it would without this feature.

#### Scenario: a wrapper is synthesized for parentless switches

- **WHEN** the data contains `switch` nodes without `data.parent` and no `network` kind node
- **THEN** a single `network/fabric` wrapper (label `physical network`) is injected and those switches are re-parented under it

#### Scenario: a data-provided network grouping takes precedence

- **WHEN** the data already contains a `network` kind node
- **THEN** no wrapper is synthesized and no switch is re-parented (the elements pass through as-is)

#### Scenario: switches of the same level share a row

- **WHEN** under the `fcose` layout, two or more `switch` nodes resolve to the same level
- **THEN** they are pinned at the same vertical position (the same row) and distinct horizontal positions

#### Scenario: levels stack top to bottom from high to low

- **WHEN** under the `fcose` layout, both level `k` and level `k+1` contain switches
- **THEN** the level `k+1` row is pinned above the level `k` row

#### Scenario: K8s nodes are never pinned

- **WHEN** in either pod-parent mode, a K8s `node` is the source of a `node-to-switch` edge
- **THEN** the node is not pinned; only its uplink edge pulls it toward the fabric

#### Scenario: pinning references only levelled switches

- **WHEN** layout constraints are generated
- **THEN** the constraints reference only levelled `switch` ids; no pod / controller / service / pvc / cluster / K8s node, and no unlevelled switch, is pinned

#### Scenario: no constraints are produced when no switch has a level

- **WHEN** no `switch` node carries a valid level (including the case of no switches at all)
- **THEN** no layout constraints are produced

#### Scenario: pinned only under the fcose layout

- **WHEN** the current layout is `dagre`
- **THEN** the fabric constraints are not applied (`dagre` already tiers the whole graph)

### Requirement: orthogonal routing of switch-related edges

The system SHALL render `node-to-switch` and `switch-to-switch` edges with orthogonal (right-angle) routing (cytoscape.js's `taxi` curve style) in **both** pod-parent modes, so that multiple edges converging on the same switch share right-angle channels rather than overlapping curves. Every other edge type SHALL keep its existing curved routing (`bezier` curve style). `node-to-switch` and `switch-to-switch` SHALL share **the same infra color** — color authority is owned by graph-view's edge type color table, and `node-to-switch` MUST NOT have a separate color of its own (for example indigo); routing SHALL NOT change any color graph-view assigns. Edge routing SHALL be a stylesheet-layer responsibility and therefore independent of the layout algorithm currently in use.

#### Scenario: switch edges are routed orthogonally

- **WHEN** an edge's type is `node-to-switch` or `switch-to-switch`
- **THEN** it is rendered with the `taxi` (orthogonal) curve style

#### Scenario: non-switch edges stay curved

- **WHEN** an edge's type is anything other than `node-to-switch` / `switch-to-switch`
- **THEN** it is rendered with the existing `bezier` curve style

#### Scenario: node-to-switch and switch-to-switch share one infra color

- **WHEN** `node-to-switch` and `switch-to-switch` edges are rendered
- **THEN** both use the same infra color and solid line style (node-to-switch has no separate indigo), differing only in their endpoints; `taxi` routing does not change that color

### Requirement: zero impact when no switch has a level

The system SHALL guarantee that when no `switch` node in the graph carries a valid level, its layout result is exactly the same as if this capability did not exist — no constraints are produced and the force-directed layout result is unchanged. (The routing of switch-related edges is governed by the orthogonal routing requirement above and is independent of levels.)

#### Scenario: a graph without switches is unaffected

- **WHEN** the graph contains no `switch` nodes
- **THEN** no layout constraints are produced and the existing layout behaviour is fully preserved

#### Scenario: unlevelled switches are not pinned

- **WHEN** the graph contains `switch` nodes but none carries a valid level
- **THEN** no layout constraints are produced and every switch is freely placed by the force-directed layout
