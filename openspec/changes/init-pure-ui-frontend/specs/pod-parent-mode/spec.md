## Purpose

Defines the Graph view's pod-parent mode: the control by which the user switches between the two compound topologies `controller` (default, consuming the backend hierarchy `cluster > namespace > application > controller > pod` as-is) and `node` (the infrastructure view `cluster > node > pod`), the pure-function topology transform, the drawable edge set of each mode, the exactly-once re-layout after a mode switch, and the behaviour of collapsing all controller containers by default in controller mode. This mode is ephemeral view state and is not persisted.

## ADDED Requirements

### Requirement: Pod-parent mode switch control

The Graph view SHALL provide, at the **very top** of the legend (before the cluster legend and every other legend section), a **layout segmented control** (segmented control, two options `Node` / `Controller`, labelled `Layout`) for switching between the `node` and `controller` (default) pod compound topologies, highlighted to reflect the current mode. This segmented control MUST be the only entry point for switching modes: the edge-type legend section MUST NOT render any mode switch button and is responsible only for listing edges. The mode state MUST be ephemeral view state owned by the Graph view (like the collapse state), defaulting to `controller`, and MUST NOT be persisted in the runtime config; a switch MUST take effect immediately. "Layout" here means the compound group topology, which is a **different concept** from the fcose / dagre layout algorithm choice (an app setting). **The hierarchy is owned by the backend**: `controller` mode (default) consumes the backend `GET /v1/graph` payload directly as-is — pods stay nested in their backend `controller` group, the full parent chain is `cluster > namespace > application > controller > pod`, and `pod-to-node` is represented as a drawn edge; `node` mode (the infrastructure view) has the pod-parent topology transform re-parent every pod to its K8s `node` and strip the workload group tiers (`namespace` / `application` / `controller`), presenting the flat view `cluster > node > pod` (`pod-to-node` is represented by nesting instead).

#### Scenario: the segmented control switches the mode

- **WHEN** the user clicks the `Controller` segment of the layout segmented control at the top of the legend
- **THEN** the Graph view's pod-parent mode becomes `controller`, and the graph immediately redraws as the backend hierarchy `cluster > namespace > application > controller > pod`
- **AND** clicking the `Node` segment switches back to `node` (`cluster > node > pod`, no workload group tiers), each taking effect immediately without any settings persistence

#### Scenario: the control sits at the top of the legend and the edge legend carries no switch button

- **WHEN** the legend is rendered
- **THEN** the layout segmented control appears above every legend section; the edge-type legend section renders no mode switch button (it only lists edges)

#### Scenario: controller mode is the default

- **WHEN** the Graph view loads for the first time (the user has not yet switched)
- **THEN** the pod-parent mode is `controller` and the layout segmented control highlights `Controller` by default; pods are nested in their backend `controller` group (`cluster > namespace > application > controller > pod`, the hierarchy provided by the backend payload) and `pod-to-node` is a drawn edge; and every controller container in the graph is collapsed by default on first load (pods aggregated)

### Requirement: drawable edge set per mode and legend / stylesheet adaptation

The system SHALL cover all 8 edge types (`pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr` / `switch-to-switch` / `node-to-switch`) with a **single primary edge style source**, and SHALL derive the **drawable edge set** per mode with a pure function: `controller` mode is `['pod-mounts-pvc', 'pod-calls-pod', 'pod-calls-service', 'service-selects-pod', 'pod-to-node', 'pvc-to-netapp-aggr', 'switch-to-switch', 'node-to-switch']`; `node` mode is the same set **minus `pod-to-node`** (that is, `['pod-mounts-pvc', 'pod-calls-pod', 'pod-calls-service', 'service-selects-pod', 'pvc-to-netapp-aggr', 'switch-to-switch', 'node-to-switch']`) — in `node` mode `pod-to-node` is represented by nesting and removed wholesale by the pod-parent topology transform. `pvc-to-storageclass`, already removed from the contract, MUST NOT appear in the primary style source, in either mode's drawable set, or in the full edge-type set. The system MUST NOT synthesize hierarchy edges such as `pod-runs-on-node` / `controller-owns-pod` (the hierarchy is owned by the backend; the app does not synthesize it). `pvc-to-netapp-aggr` is drawn in both modes; `service-selects-pod` and `pod-calls-service` are drawn in both modes (a service is not a compound parent); the physical network fabric edges `switch-to-switch` / `node-to-switch` are also **drawn in both modes**. The stylesheet's edge colors MUST be taken from the primary style source and be mode-independent — it can color any edge that exists; types not present in the current mode simply sit idle and do not affect the output. The full edge-type set and the default visible set of the edge-type filter MUST equal all 8 edge types, so that the edges of both modes (fabric included) are visible by default — otherwise `pod-to-node` would be filtered out by default when switching to controller mode, or the fabric edges would be excluded from the default visible set. The edges listed by the edge-type legend section MUST be "the current mode's drawable set ∩ the edge types actually present in the graph", presented in the existing `<from> → <to>` form (arrow glyph centered), and MUST NOT append any extra nesting explanation text.

#### Scenario: the drawable edge set of node mode

- **WHEN** the pod-parent mode is `node`
- **THEN** the drawable edge set contains `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr`, plus the ever-present `switch-to-switch` / `node-to-switch`; the canvas draws no `pod-to-node` edge at all (represented by nesting and removed by the topology transform)

#### Scenario: the drawable edge set of controller mode

- **WHEN** the pod-parent mode is `controller`
- **THEN** the drawable edge set contains `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pod-to-node` / `pvc-to-netapp-aggr`, plus the ever-present `switch-to-switch` / `node-to-switch`; `pod-to-node` edges are drawn with the color (`#3b82f6`) and line style defined by the primary style source, and `pvc-to-netapp-aggr` is drawn in its own color, distinguishable from the purple of `pod-mounts-pvc`

#### Scenario: fabric edges exist in both modes

- **WHEN** the graph contains `switch-to-switch` or `node-to-switch` edges
- **THEN** both pod-parent modes draw them (they do not disappear when switching modes), and they are visible by default (the edge-type filter's default visible set covers them)

#### Scenario: unknown edge types still take the fallback

- **WHEN** in either mode an edge's `data.edgeType` is not in the primary style source
- **THEN** the edge is drawn with the grey solid-line fallback without throwing (the existing forward-compatible behaviour)

### Requirement: a mode switch triggers a re-layout

A mode switch changes the compound structure (`data.parent` and the edge set), so the system MUST trigger a re-layout **exactly once** after applying it. The mechanism that triggers the re-layout MUST be shared by collapse changes and pod-parent mode changes (the same "layout needs re-running" signal), re-running the layout whenever either changes; visibility-only changes still MUST NOT trigger a re-layout.

#### Scenario: switching modes re-runs the layout

- **WHEN** the user switches the pod-parent mode
- **THEN** the system aborts any in-flight layout, then re-runs the layout exactly once with the current layout algorithm; the cytoscape.js instance is not rebuilt (same instance); the collapse state is preserved by the existing reconcile rule (desired ∩ present, that is, containers still present in the graph keep their collapse state)

#### Scenario: an unchanged mode does not re-run the layout

- **WHEN** other inputs change but neither the pod-parent mode nor the contents of the collapse set change
- **THEN** no re-layout signal is emitted and the layout is not re-run

#### Scenario: switching and reverting both actually change the compound nesting

- **WHEN** the user switches to `controller` mode and later switches back to `node` mode
- **THEN** pods MUST actually be nested in their owning controller container in `controller` mode, and MUST actually be nested back in their K8s node container after switching back to `node` mode, taking effect in both directions
- **AND** because cytoscape.js only reliably establishes compound nesting when elements are added (dynamically rewriting a parent or moving elements is unreliable when batching and the expand-collapse extension are used together), when the canvas detects a pod-parent mode change it MUST apply the new hierarchy with a wholesale rebuild (remove all elements, then re-add the elements of the new hierarchy) rather than a diff-patch; the mode switch also emits the re-layout signal, and the layout is re-run after the rebuild

### Requirement: the pure functions of pod-parent mode are unit-testable

The pod-parent topology transform (taking elements and a mode, returning new elements) and the per-mode drawable edge set derivation MUST be pure functions, and MUST have unit test coverage.

#### Scenario: pure function test coverage

- **WHEN** CI runs the project's unit tests
- **THEN** the topology transform tests cover: controller mode is an identity clone (pods stay nested in the backend `controller` group, no edge is synthesized, `data.parent` and the edge set are unchanged, every element is a new object); node mode re-parents pods to their `labels.node` (pointing at an existing `node` kind); node mode strips the `namespace` / `application` / `controller` groups and re-parents `pvc` / `service` to the `cluster`; node mode removes every `pod-to-node` edge; the fallback where a pod stays under its cluster when `labels.node` is missing or cannot be resolved; `service-selects-pod` / `pod-calls-service` / `pvc-to-netapp-aggr` survive in both modes; **the NetApp storage chain is neither stripped nor re-parented in either mode**; cross-cluster `pod-calls-pod` is unaffected; both modes return independent new objects without mutating the input
- **AND** the drawable edge set derivation tests cover both modes' sets (`node` mode excludes `pod-to-node`, neither mode contains `pvc-to-storageclass`); all pass

### Requirement: controller mode keeps the backend hierarchy, node mode re-parents pods

The system SHALL provide a pure-function pod-parent topology transform (taking elements and a mode, returning new elements), applied after the wire → internal-model normalization and before the elements enter the canvas; the normalize boundary itself MUST remain a pure anti-corruption boundary and MUST NOT accept a mode parameter. **The hierarchy is owned by the backend**, so `controller` mode (default) MUST be an **identity clone**: it MUST NOT re-parent any pod and MUST NOT synthesize any edge — the backend payload already nests every pod in its `controller` group (full parent chain `cluster > namespace > application > controller > pod`), and `pod-to-node` is already a drawn edge provided by the backend. This mode only copies element by element to produce independent new objects (`data` at least shallow-copied), preserving the original `data.parent` and edge set. `node` mode MUST return a clean infrastructure view (`cluster > node > pod`): for every `pod`, reset `data.parent` to its `labels.node` (its K8s node id), re-parenting only when that id points at a `node` kind element that **exists** in the elements — when `labels.node` is missing or does not point at any such node, the pod MUST stay under its `cluster` (fallback). This mode MUST also strip every `namespace` / `application` / `controller` group node, re-parent their non-pod members (`pvc` / `service`) to their `cluster`, and MUST remove every `pod-to-node` edge (that relation is represented by nesting in `node` mode).

**The NetApp storage chain stays as-is in `node` mode.** `storage-cluster` is **not** a stripped workload group (the stripped set is exactly `namespace` / `application` / `controller`), and `netapp-node` / `netapp-aggr` are real nodes rather than groups, so the entire `storage-cluster > netapp-node > netapp-aggr` nesting MUST be **preserved as-is in both modes**, and the topology transform MUST NOT re-parent or flatten any part of it. In `node` mode a PVC is re-parented to the cluster because its `namespace` group is stripped, but its `pvc-to-netapp-aggr` edge still points at the unmoved aggregate — **an edge crossing from the K8s cluster container into the storage-cluster container is the expected result**, and neither endpoint's parent may be changed to tidy the picture.

`service-selects-pod` / `pod-calls-service` / `pvc-to-netapp-aggr` edges MUST be preserved in both modes (`node` mode only additionally removes `pod-to-node` on top of the shared behaviour). `node` mode removing `pod-to-node` MUST NOT make pods whose only connection is that edge (such as the pods of a DaemonSet / Job / CronJob) disappear from the canvas: `graph-view`'s orphan cascade decides whether a leaf is "orphaned to begin with" from the **baseline graph output by the normalize boundary**, and this transform happens after that baseline, so these pods count as "edge hidden by the UI" and stay visible — see the "Node Kind / Edge Type filtering" requirement of `graph-view`. Every node / edge change MUST produce new objects immutably and MUST NOT mutate the input in place. Furthermore, **every** element the topology transform returns in both modes MUST be a brand-new independent object (`data` at least shallow-copied), not only the changed elements — cytoscape.js references the `data` objects handed to it directly, and the expand-collapse extension rewrites the `data.source` / `data.target` of edges attached to a collapsed controller in place. If the return value shares objects with the normalized base elements, that in-place rewrite contaminates the normalized input, wrong edges appear when the user switches back to the other mode, and whole workloads become orphaned or disappear.

#### Scenario: controller mode is an identity clone

- **WHEN** the mode is `controller`
- **THEN** the topology transform re-parents no pod and synthesizes no edge; pods stay nested in their backend `controller` group and `pod-to-node` remains a drawn edge; every returned element is a new object (a different reference from the input), with `data.parent` and the edge set contents matching the backend payload

#### Scenario: node mode re-parents pods to K8s nodes and strips the workload groups

- **WHEN** the mode is `node`
- **THEN** every pod's `data.parent` is reset to its `labels.node` (pointing at an existing `node` kind); every `namespace` / `application` / `controller` group node is stripped, with its `pvc` / `service` members re-parented to their `cluster`; every `pod-to-node` edge is removed; the result is the flat `cluster > node > pod` view, and every returned element is a new object

#### Scenario: the fallback keeps the pod under the cluster when labels.node is missing

- **WHEN** the mode is `node` and a pod's `labels.node` is missing, or its value does not point at any existing `node` kind element
- **THEN** that pod MUST stay under its `cluster` (it is not parented to a non-existent node id), and the other pods are unaffected

#### Scenario: service and storage edges survive in both modes

- **WHEN** the graph contains `service-selects-pod` / `pod-calls-service` / `pvc-to-netapp-aggr` edges (`pvc-to-storageclass` has been removed from the contract and is not among them)
- **THEN** both modes keep them as drawn edges; `node` mode only additionally removes `pod-to-node`, never these

#### Scenario: the NetApp storage chain is neither stripped nor re-parented in node mode

- **WHEN** the mode is `node` and the graph contains the `storage-cluster > netapp-node > netapp-aggr` nesting and a `pvc-to-netapp-aggr` edge
- **THEN** the `storage-cluster` group node MUST NOT be stripped, `netapp-node` / `netapp-aggr` MUST keep their `data.parent` as-is, and the `pvc-to-netapp-aggr` edge still exists — its PVC end is re-parented to the cluster because the namespace group is stripped, and its aggregate end does not move

#### Scenario: the input is never mutated in place

- **WHEN** the topology transform is called on the same elements once with `controller` and once with `node` mode in sequence
- **THEN** the input elements array and its node / edge objects are not modified (new objects are produced under new references), and the results of the two calls do not contaminate each other

### Requirement: controller mode aggregates (collapses) controller containers by default

So that `controller` mode presents by default a compact view in which "pods are aggregated into their controllers", **on first load (controller being the default mode) and every time the user switches into `controller` mode**, the system MUST, on the render in which controller containers first appear in that mode, add **every controller container** in the graph (the controller group nodes provided by the backend and marked `data.isController === true` during normalization) to the collapse set, so that they are collapsed by default; this default collapse MUST be guarded by a one-shot guard so that it fires at most once during the same stretch of controller mode — later graph data refreshes from the backend MUST NOT re-collapse (controllers the user has expanded stay expanded), and leaving controller mode resets the guard so that entering it again re-collapses everything. The user can then expand individual controllers to inspect their pods. When switching back to `node` mode the controller groups are stripped by the topology transform, and their ids drop out of the collapse set naturally through the existing collapse reconcile rule (desired ∩ present); switching into `controller` mode **again** MUST re-collapse every controller container (that is, every entry collapses everything and does not keep the previous expanded state). This default aggregation MUST act only on controller containers and not affect the user's existing collapse choices for `cluster` / K8s `node` containers.

#### Scenario: first load or switching into controller mode collapses everything by default

- **WHEN** the Graph view loads for the first time (controller being the default mode), or the user switches from `node` to `controller` mode
- **THEN** every controller container is collapsed by default as soon as it first appears in that mode (pods aggregated inside), and the canvas shows the controller icon rather than expanded pods

#### Scenario: a data refresh in controller mode does not re-collapse

- **WHEN** the user expands a controller in controller mode, and the graph data later refreshes from the backend (that controller still exists)
- **THEN** that expanded controller MUST stay expanded (the one-shot guard keeps the default collapse from re-running during the same stretch of controller mode)

#### Scenario: re-entering after expanding still collapses everything

- **WHEN** the user expands a controller in controller mode, switches back to `node`, then switches back to `controller`
- **THEN** every controller container is collapsed by default again (the previous expanded state is not kept)

#### Scenario: cluster / node collapse choices are unaffected

- **WHEN** the user has collapsed a `cluster` container and then switches into `controller` mode
- **THEN** that `cluster` keeps its collapse state; the controller containers are additionally all collapsed

#### Scenario: a single-pod controller is also collapsed by default

- **WHEN** the user switches into `controller` mode and a controller owns only one pod
- **THEN** that single-pod controller is collapsed by default as well (the default aggregation acts on **every** controller container regardless of its pod count, with no `>1` exception)

#### Scenario: default-collapsed controllers are not hidden by the orphan cascade

- **WHEN** the user switches into `controller` mode, every controller is collapsed by default, and a controller itself has no incident drawn edge (pods are nested inside it, and `pod-to-node` runs from the pod to the K8s node, not through the controller)
- **THEN** that controller MUST NOT be hidden by the orphan cascade — its child pods remain in the visible node set after the visibility computation (collapse is a canvas-layer visual operation and does not remove from the visible set), so by `graph-view`'s orphan rule "a container with visible children is kept", the collapsed controller counts as having visible children and is retained
