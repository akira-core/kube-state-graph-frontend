// Aligned with upstream kube-state-graph `GET /v1/graph` cytoscape payload.
// Node `data.type` and edge `data.type` enums are the source of truth here;
// see internal/graph/{node,edge}.go in the backend repo.

// Identity is encoded by a per-kind icon (see iconSvgByKind.ts), not by shape, so
// this enum can grow without exhausting the shape budget. Workload controller
// kinds (deployment/statefulset/daemonset/job/cronjob) are panel-renderable as
// soon as the backend emits them; ReplicaSet is intentionally absent — the
// backend collapses Deployment → ReplicaSet → Pod, so pods attribute directly to
// their top-level controller and a ReplicaSet node never appears.
export type NodeKind =
  | 'pod'
  | 'node'
  | 'pvc'
  | 'service'
  | 'external'
  | 'switch'
  | 'deployment'
  | 'statefulset'
  | 'daemonset'
  | 'job'
  | 'cronjob'
  // The physical NetApp ONTAP storage a PVC actually lands on. `netapp-aggr` is the
  // aggregate holding the claim's FlexVol (a leaf, carrying `health` + `usage`);
  // `netapp-node` is the controller that currently owns it — a REAL node that is also
  // a compound parent (`storage-cluster > netapp-node > netapp-aggr`), the one tier
  // where a kind-ful selectable node boxes another real node. Neither carries a
  // `cluster` label: they belong to no Kubernetes cluster and never enter `clusters[]`.
  // Replaces the retired `storageclass` kind — the claim's StorageClass NAME now rides
  // on the PVC's own `data.storageclass`.
  | 'netapp-aggr'
  | 'netapp-node'
  // A virtual compound GROUP wrapping the physical switch fabric (network > switch).
  // Pure grouping box, collapsible like other containers; collapsing swaps
  // `switch` → `network` in the node-kinds legend (deriveLegendKinds). Never
  // carries status/alerts.
  | 'network';

// Full wire contract: every edge type the backend's core graph can carry (D6 — all
// backend-emitted, no panel synthetics). `pod-to-node` (pod→node) replaced the retired
// panel synthetics `pod-runs-on-node` / `controller-owns-pod`; `pvc-to-netapp-aggr`
// (pvc→netapp-aggr) replaced `pvc-to-storageclass` when the backend re-anchored storage
// on the physical ONTAP aggregate. `switch-to-switch` / `node-to-switch` are the
// physical network-fabric edges added in backend v0.0.18 (pkg/graph/edge.go);
// they involve neither pods nor controllers, so they are drawn in both pod-parent modes.
export type EdgeType =
  | 'pod-to-node'
  | 'pod-mounts-pvc'
  | 'pod-calls-pod'
  | 'pod-calls-service'
  | 'service-selects-pod'
  | 'pvc-to-netapp-aggr'
  | 'switch-to-switch'
  | 'node-to-switch';

// Which edge types are actually DRAWN (and listed in the legend) depends on the
// pod-parent mode — see `drawnEdgeTypesForMode`. Notably `pod-to-node` is expressed
// as compound nesting in the `node` (infra) mode and only drawn as an edge in the
// default `controller` mode (design D6/D7).

// Runtime-honest kind / edge type as it actually arrives in graph data: free-form
// string so unknown backend values stay typed (computeVisibility leaves them visible,
// categoryForKind / the *_BY_KIND maps fall back) — never dropped. Named aliases keep
// the domain clear; closed-union autocomplete lives on NodeKind / EdgeType where those
// are used. (Avoid `string & {}` — Sonar typescript:S4335.)
export type GraphNodeKind = string;
export type GraphEdgeType = string;

// Health status carried on leaf nodes (upstream data.status). Drives the status
// border colour (pod/node/pvc) and the detail panel badge. Absent/unknown values
// are normalised to 'normal'.
export type NodeStatus = 'normal' | 'warning' | 'critical';

// The KNOWN alert-severity tiers that carry a dedicated badge colour. A DISTINCT
// scale from node health status: an alert is by definition not-normal (so no
// 'normal' tier) and carries an 'info' tier that node status never has. The
// backend sends node.status and alert.severity as separate attributes; the
// detail-panel alert table colours from SEVERITY_COLOR (see colorBySeverity.ts),
// not STATUS_COLOR. NodeAlert.severity itself is a free-form `string` (users
// define custom labels) — these three just get a non-neutral colour.
export type AlertSeverity = 'info' | 'warning' | 'critical';

// A single alert attached to a node, carried on the optional upstream graph-JSON
// node field `alerts` and surfaced in the detail panel's alert table. The backend
// groups repeats of the same alert into ONE entry whose `time_records` wire field
// lists every occurrence time; `normalizeGraph` projects that to `timeRecords`.
export interface NodeAlert {
  pod?: string;
  service?: string;
  name: string; // alert name
  // Free-form label from the backend: 'info'/'warning'/'critical' get a dedicated
  // colour (see SEVERITY_COLOR), any other custom label is kept verbatim and
  // rendered in the critical fallback colour. Never dropped for being "unknown".
  severity: string;
  // Every occurrence time of this (grouped) alert, Unix epoch SECONDS, ASCENDING.
  // Count = timeRecords.length, last-occurred = max(timeRecords) (the last element); both
  // are derived at render, never stored. A legacy backend's single `time` scalar
  // normalises to a one-element list. The panel converts to milliseconds only at the
  // render / time-rewind boundary.
  timeRecords: number[];
  id?: string; // optional stable row id; synthesised from name+records+index if absent
}

// Which K8s object a pod is compound-nested under (panel-side view toggle, not a
// wire value). 'controller' (default) = backend D6 payload as-is: pod nests under
// its `controller` group (cluster > namespace > application > controller > pod) and
// `pod-to-node` is a drawn edge. 'node' (infra view) = re-parent each pod under its
// K8s node (cluster > node > pod), drop the workload group tiers, and express
// pod↔node as nesting (drop `pod-to-node` edges). See features/pod-parent-mode.
export type PodParentMode = 'node' | 'controller';
