## Purpose

An app-side synthesized compound container that boxes a cluster's K8s `node` elements into a single group (`cluster > node group > node`), so that the cluster's machines read as one tier and can be collapsed as a unit. It is purely a rendering convenience — it carries no backend identity and never appears in the wire contract.

## ADDED Requirements

### Requirement: node group synthesis

The system SHALL insert a synthesized compound container between every K8s `node` element and its current parent, producing the render hierarchy `cluster > node group > node`. Grouping is keyed by the node's **current parent**: all `node` kind elements sharing the same parent fall into the same group, and each distinct parent gets a group of its own. `node` elements without a parent are grouped into a top-level (parentless) group, so this rule needs no special case for graphs where nodes sit outside any cluster. The synthesized container SHALL carry: a deterministic id derived from the parent it sits under, a `nodes` label, an `isNodeGroup` marker, and the original parent of the grouped nodes; it SHALL NOT carry a `kind`, `status`, `worstStatus` or any alert. This synthesis step SHALL be a pure function: it never mutates its input, and every element it returns is a brand-new object.

#### Scenario: nodes of the same cluster are boxed together

- **WHEN** a cluster contains two or more `node` kind elements
- **THEN** a synthesized group is inserted under that cluster, both nodes are re-parented under it, and the cluster's other children (services, PVCs, workload groups, storage chains) stay where they are

#### Scenario: each distinct parent gets its own group

- **WHEN** two clusters each contain `node` elements
- **THEN** each cluster gets its own group; a group never spans two clusters

#### Scenario: a single node is still grouped

- **WHEN** a cluster contains exactly one `node` element
- **THEN** the node is still wrapped in a group — the structure does not depend on exactly how many machines the cluster has, so the cluster does not change shape when a second node appears

#### Scenario: parentless nodes get a top-level group

- **WHEN** a `node` element has no parent
- **THEN** it is re-parented under a synthesized group that itself has no parent

#### Scenario: input is never mutated

- **WHEN** the synthesis step runs
- **THEN** no element object in the input array is mutated, and the caller's array remains unchanged

### Requirement: synthesis backs off

When there is nothing to group — no `node` kind elements exist — and when synthesis would collide with existing elements, the system SHALL return the element set as-is: if any element already occupies an id this step would produce, or already carries the `isNodeGroup` marker, this step SHALL back off entirely rather than produce an incomplete or conflicting hierarchy.

#### Scenario: no node kind exists

- **WHEN** the graph contains no `node` kind elements
- **THEN** the returned element set has no added groups and no parent is rewritten

#### Scenario: an id collision makes the whole step back off

- **WHEN** an element already occupies an id this step would synthesize
- **THEN** no group is inserted at all and no `node` element is re-parented

### Requirement: both pod-parent modes carry the group

The node group SHALL exist in **both** pod-parent modes. In `controller` mode K8s nodes are leaves and the render chain is `cluster > node group > node`; in `node` mode nodes box their pods and the chain is `cluster > node group > node > pod`. Switching modes SHALL NOT lose the group, and grouping SHALL be applied on top of the elements the mode transform has already produced, so the mode's own re-parenting rules are never disturbed by it.

#### Scenario: the group persists after a mode switch

- **WHEN** the user switches between the `Controller` and `Node` layouts
- **THEN** the node group box exists in both, with the K8s nodes kept inside it

#### Scenario: node mode leaves pods under their node

- **WHEN** `node` mode has re-parented pods under their K8s node
- **THEN** the group wraps the nodes, not the pods: the chain reads `cluster > node group > node > pod`, and no pod becomes a direct child of the group

### Requirement: node group rendering

The node group SHALL render as a labelled compound plate consistent with the other group boxes: no resource icon, tinted with the accent of the cluster it belongs to (so it reads as part of that cluster's family), and titled with the title-case `Nodes` label in the same enlarged, semibold style as the other group titles. When collapsed, it SHALL show the folder glyph the other kind-less decorative groups show, tinted the same way, rather than a blank color block. This label transform SHALL be confined to the render layer: the element's own `label` remains the bare string `nodes`, so any logic that reads identity is unaffected.

#### Scenario: an expanded group is a tinted, labelled box

- **WHEN** the node group is expanded
- **THEN** it renders as an icon-less rounded-rectangle plate, tinted with its cluster's accent, titled `Nodes`

#### Scenario: a collapsed group shows the folder glyph

- **WHEN** the node group is collapsed
- **THEN** it renders the folder glyph in its cluster's accent — never a blank color block — and its border thickens like every other collapsed compound

### Requirement: node group collapse

The node group SHALL be selectable, so that selecting it draws the expand-collapse `+` / `−` cue and lets the user collapse every K8s node of that cluster in one click. It SHALL default to **expanded** on load, and its collapsed state SHALL flow through the same collapsed-id state shared by every other compound — so it is preserved after the graph data refreshes from the backend, reconciled when it disappears from the graph, and auto-expanded when a search result is located inside it.

#### Scenario: the cue collapses the whole group

- **WHEN** the user selects the node group and clicks its `−` cue
- **THEN** every K8s node of that cluster folds into a single group box, and clicking `+` restores them

#### Scenario: expanded by default

- **WHEN** the Graph view loads, in either pod-parent mode
- **THEN** the node group is expanded — the machines are visible without any interaction

#### Scenario: locating a hit inside a collapsed group expands it

- **WHEN** a search result resolves to an element nested inside a collapsed node group
- **THEN** the group is expanded so the hit can be selected, exactly like any other collapsed ancestor

### Requirement: the node group is app-owned, not a wire concept

The node group SHALL NOT appear in the wire contract, the demo fixture, or the wire → internal-model normalize boundary: it is synthesized from already-normalized elements. Since it has no kind, it SHALL NOT appear in the icon `Node Kinds` legend, and no legend swatch section SHALL be added for it — the existing container swatch section continues to list the K8s `node` container itself. It SHALL NOT be toggleable by the kind filter, and when every node it holds is filtered out, it SHALL disappear via the existing orphan cascade.

#### Scenario: absent from the wire contract

- **WHEN** the backend graph payload is parsed
- **THEN** no node group exists among the parsed elements; it is only added by the subsequent view transform

#### Scenario: contributes nothing to the legend

- **WHEN** the legend is derived
- **THEN** the node group adds no icon row and no swatch row; the container swatch section still lists the K8s `node` container

#### Scenario: the group disappears when the filter empties it

- **WHEN** the user hides the `node` kind
- **THEN** the group has no visible children and no visible connected edges, so the orphan cascade removes the group box too — no empty box is left on the canvas
