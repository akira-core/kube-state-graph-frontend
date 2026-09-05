import 'cytoscape';

import type { GraphEdgeType, GraphNodeKind, NodeStatus, NodeAlert } from '../constants/types';

import type { ContainerSpec } from './containerSpec';

declare module 'cytoscape' {
  interface NodeDataDefinition {
    kind?: GraphNodeKind; // mapped from upstream data.type (may be an unknown backend kind)
    status?: NodeStatus; // mapped from upstream data.status; normalize defaults to 'normal'
    namespace?: string; // extracted from upstream data.labels.namespace
    ipAddress?: string[]; // mapped from upstream data.ipaddress (moved out of labels in 524057b)
    // ArgoCD application name carried on pod nodes by the backend; a synthesized
    // controller takes it from its first valued owned pod in stable podId order
    // (normalize.ts). Drives the detail panel's Application section and both
    // detail-URL queries. Omitted when absent/empty.
    application?: string;
    // Container name/image specs carried on pod nodes (upstream `containers`); an
    // enriched backend controller carries the (name, image)-deduped union across its
    // child pods. Omitted when absent or nothing valid survives validation.
    containers?: ContainerSpec[];
    // The claim's StorageClass NAME, carried on the PVC itself now that the backend has
    // no storageclass node. Kept purely as the operator's discriminator between "this
    // claim was never meant to have a NetApp backend" and "this claim should have joined
    // and did not" — the panel only displays it. Omitted when unresolved.
    storageclass?: string;
    // ONTAP health on `netapp-aggr` / `netapp-node`, normally 'online' | 'degraded' but
    // typed as a bare string so an unknown backend value passes through rather than
    // failing the build. ABSENCE IS NOT 'degraded': the backend omits it when it has no
    // status data at all, and consumers MUST NOT default it.
    health?: string;
    // The K8s node's Kubernetes Ready condition (upstream `ready_status`), normally
    // 'Ready' | 'NotReady' | 'Unknown' but typed as a bare string so an unknown backend
    // value passes through. A THIRD axis, independent of `status` (alert severity) and
    // `worstStatus` (what a collapsed box hides) — a NotReady node with no alerts is
    // still status-normal. ABSENCE IS NOT 'Unknown': the backend reserves that literal
    // for a kubelet that stopped reporting and omits the field when it has no Ready
    // series at all, so a monitoring gap must never render as an outage.
    readyStatus?: string;
    // Storage usage in bytes, on `pvc` (kubelet volume stats) and `netapp-aggr` (Harvest
    // aggregate space) — the SAME shape for both, so one formatter and one visual rule
    // serve them. Each field is independently optional; the object is omitted when
    // neither resolved. Never a placeholder 0.
    usage?: { usedBytes?: number; capacityBytes?: number };
    // Harvest hardware identity on a `netapp-node`. Each field independently optional;
    // the object is omitted when none survive. Absence is NOT "unknown".
    hardware?: {
      model?: string;
      serial?: string;
      version?: string;
      vendor?: string;
      location?: string;
    };
    // Raw Harvest readings on a `netapp-node`. Independently optional; omitted when
    // none survive. MUST NOT drive health, status, or any colour/alert — those arrive
    // via `health` and `alerts`.
    perf?: {
      cpuBusyPct?: number;
      totalOps?: number;
      totalLatencyUs?: number;
      totalBytesPerSec?: number;
    };
    // usedBytes / capacityBytes, clamped to [0,1], derived by normalize ONLY when both
    // are valid and capacity > 0. Flattened out of `usage` because cytoscape cannot
    // compute a ratio in a mapper's data() call either — the icon mapper reads this
    // top-level field, so it is kind-agnostic by construction and an ABSENT ratio
    // paints no liquid (structurally distinct from 0%).
    usageRatio?: number;
    // A pod's controller owner (typed upstream `data.owner` passthrough). The
    // detail-URL queries resolve a pod's controller kind/name from it; a pod
    // without one queries as itself (standalone pod).
    owner?: { kind: string; name: string };
    // Mapped from upstream data.alerts (omitted when absent/empty). A synthesized
    // controller aggregates its child pods' alerts here (normalize.ts) so its detail
    // panel lists them — colour still comes from status/worstStatus, never alerts.
    alerts?: NodeAlert[];
    labels?: Record<string, string>;
    // Compound (cluster) container nodes — see normalize.ts. The grouping
    // structure (the native `parent` field) comes from the backend untouched;
    // the panel only tags `type: "cluster"` containers and assigns their colour.
    isCluster?: boolean; // true only on a backend-provided cluster container node
    cluster?: string; // cluster name carried on the container node
    clusterColor?: string; // accent colour assigned in normalize so the stylesheet stays pure
    // true on a backend-provided `controller` group node, enriched in normalize (kind
    // derived from a child pod's owner.kind). Distinguishes a controller container from
    // a K8s `node` container in controller mode (deriveContainers).
    isController?: boolean;
    // Worst STATUS a COLLAPSED container would HIDE, surfaced as its border tint in
    // getStylesheet. On an enriched controller = worst child-pod status; on a k8s
    // `node` container = worst of its OWN status and its pods' statuses (controller view:
    // pods reachable via `pod-to-node`; node view: nested child pods) — worst-wins.
    // Aggregated in normalize. Omitted when there is no status info (so the folded box
    // keeps its neutral border — "no info" is not "normal").
    worstStatus?: NodeStatus;
    // Backend D6 `namespace` group node — accent-only decorative compound (no kind),
    // recognized in normalize. Decorative (selectable:false), carries NO status / alerts
    // / worstStatus; coloured by a stable hash of the namespace name. node mode strips
    // namespace groups, so neither flag appears there.
    isNamespace?: boolean; // true only on a backend namespace group node
    namespaceColor?: string; // accent assigned in normalize so the stylesheet stays pure
    // Backend D6 `application` group node (ArgoCD app) — accent-only decorative compound
    // (no kind), recognized in normalize. Sibling of isNamespace: selectable:false, no
    // status/alerts; coloured by a stable hash (applicationPalette). node mode strips
    // application groups too.
    isApplication?: boolean; // true only on a backend application group node
    applicationColor?: string; // accent assigned in normalize so the stylesheet stays pure
    // Backend `storage-cluster` group node (one ONTAP cluster) — accent-only decorative
    // compound, sibling of isCluster: kind-less, non-selectable, no status/alerts. NOT
    // merged into isCluster despite the identical shape: isCluster drives the K8s
    // Clusters legend/palette, and an ONTAP cluster is not a Kubernetes cluster.
    isStorageCluster?: boolean; // true only on a backend storage-cluster group node
    storageCluster?: string; // ONTAP cluster name carried on the group node
    storageClusterColor?: string; // accent assigned in normalize so the stylesheet stays pure
    // PANEL-SYNTHESIZED node group (wrapNodeGroup) — the `cluster > node group > node`
    // tier that boxes a cluster's K8s machines. Never comes from the wire: normalize has
    // no idea it exists, so unlike every flag above it appears only AFTER the view
    // transforms run. Kind-less like isNamespace / isApplication, and carries no accent
    // field of its own — the box inherits its cluster's accent through the stylesheet's
    // parent-chain walk. Unlike every other decorative group it stays SELECTABLE: the
    // expand-collapse `+`/`-` cue is drawn only on a SELECTED parent, and folding the
    // group is the whole point of it.
    isNodeGroup?: boolean;
  }

  // RED measurements the backend attaches to trace-derived edges (upstream `data.metrics`),
  // renamed to the panel's camelCase convention in normalize. Present only on edges whose
  // BOTH endpoints resolve to a pod or service node — in practice `pod-calls-pod` and
  // `pod-calls-service`; never on `service-selects-pod` / `pod-to-node` / `pod-mounts-pvc` /
  // fabric edges, nor on any edge touching an `external` node.
  //
  // Three-valued by design — the states are NOT interchangeable:
  //   `metrics` absent      → no measurement exists for this edge
  //   `errorRate` absent    → the failure counter could not be read
  //   `errorRate: 0`        → read successfully, no failures
  // Consumers MUST NOT default an absent field to 0.
  //
  // Values arrive rounded to 6 significant digits, so a wide query window legitimately
  // yields exponent notation (`3.86e-7`) — format defensively, never `toFixed`.
  interface EdgeRedMetrics {
    rate: number; // requests per second over the query window; > 0 whenever this family exists
    errorRate?: number; // failed FRACTION in [0,1], not a percentage
    p90ServerMs?: number; // server-observed p90 request duration, in milliseconds
  }

  // Storage I/O measurements, carried on `pvc-to-netapp-aggr` edges and on
  // storage-graph `storage-flow` edges. Read verbatim
  // from NetApp Harvest — the ops are already per-second and the latencies already
  // averaged, so nothing here is a counter. Each field rides its own upstream series
  // family, hence each is independently optional and absence ≠ 0.
  interface EdgeIoMetrics {
    readOps?: number; // read requests per second
    writeOps?: number; // write requests per second
    readLatencyUs?: number; // average read latency, MICROseconds
    writeLatencyUs?: number; // average write latency, MICROseconds
    readBytesPerSec?: number; // read throughput, bytes per second (not a cumulative counter)
    writeBytesPerSec?: number; // write throughput, bytes per second (not a cumulative counter)
    // The volume's DECLARED QoS ceilings, from the policy-group families rather than the
    // workload ones — a limit, not a reading. ABSENCE MEANS NO DECLARED CEILING (the volume
    // is in no policy group): never 0, never an unlimited sentinel. `maxBytesPerSec` is
    // bytes per second, already converted upstream from Harvest's MB/s, so it shares the
    // throughput ladder with the two readings above.
    maxIops?: number; // ceiling on combined read+write ops per second
    maxBytesPerSec?: number; // ceiling on combined throughput, bytes per second
  }

  // The two families are mutually exclusive by provenance — a trace-derived call edge or a
  // storage edge, never both — so `metrics` is a union and `rate` can no longer be assumed
  // present. Discriminate with `'rate' in metrics`; normalize guarantees it never emits a
  // mixed object (RED wins if both somehow arrive).
  type EdgeMetrics = EdgeRedMetrics | EdgeIoMetrics;

  interface EdgeDataDefinition {
    edgeType?: GraphEdgeType; // mapped from upstream data.type (may be an unknown backend edge type)
    labels?: Record<string, string>;
    // Mapped from upstream `data.metrics` (`error_rate` → `errorRate`, `p90_server_ms` →
    // `p90ServerMs`). Omitted when the backend sent none, or when what it sent failed
    // validation — see normalize's parseEdgeMetrics. Purely informational: it never gates
    // the edge and never reaches the stylesheet.
    metrics?: EdgeMetrics;
    // true on edges along the ingress-gateway TRAFFIC path — an endpoint is an ingress node
    // AND the type carries traffic (so the ingress pod's own pod-to-node / pod-mounts-pvc
    // edges are excluded). Set by normalize's markIngressEdges → dashed via the
    // `edge[?ingressPath]` stylesheet rule.
    ingressPath?: boolean;
    // Hoisted verbatim from `data.labels.relation` by normalize (cytoscape selectors
    // cannot read nested data). 'transport' = the pod's real network hop to a broker →
    // dashed via the `edge[relation = "transport"]` rule; 'link' = the logical dependency
    // that hop stands in for → solid; absent = ordinary RPC edge → solid. Typed as a bare
    // string like edgeType's GraphEdgeType: an unknown backend value must pass through,
    // not fail the build.
    relation?: string;
  }

  // `events` is a real cytoscape node style key (toggles event capture) missing
  // from @types/cytoscape — declared here so getStylesheet can set it without a cast.
  namespace Css {
    interface Node {
      events?: 'yes' | 'no';
    }
  }

  // cytoscape-expand-collapse: Core augmentation (expandCollapse method) is the
  // panel's extension API surface. The module stub lives in cytoscape-extensions.d.ts.
  interface ExpandCollapseOptions {
    layoutBy: cytoscape.LayoutOptions | null;
    fisheye: boolean;
    animate: boolean;
    undoable: boolean;
    cueEnabled: boolean;
  }

  interface ExpandCollapseApi {
    collapse(nodes: cytoscape.NodeCollection): void;
    expand(nodes: cytoscape.NodeCollection): void;
    collapseAll(): void;
    expandAll(): void;
    isExpandable(node: cytoscape.NodeSingular): boolean;
    isCollapsible(node: cytoscape.NodeSingular): boolean;
    getCollapsedChildren(node: cytoscape.NodeSingular): cytoscape.NodeCollection;
    getCollapsedChildrenRecursively(node: cytoscape.NodeSingular): cytoscape.NodeCollection;
  }

  interface Core {
    // 'get' returns the already-initialised api WITHOUT re-running the extension's
    // full init (which would stack an extra cue canvas + duplicate listeners).
    expandCollapse(options: Partial<ExpandCollapseOptions> | 'get'): ExpandCollapseApi;
  }
}
