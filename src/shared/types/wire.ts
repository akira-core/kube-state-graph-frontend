// The kube-state-graph `GET /v1/graph` response, typed as it arrives on the wire.
//
// This is the INPUT side of the anti-corruption layer: `normalizeGraph` accepts `unknown`
// and validates its way to the cytoscape model, so nothing here is enforced at runtime.
// What these types buy is a compile-time contract for the demo fixture — a fixture typed
// as `WireGraph` cannot silently fall behind the fields normalize learns to read, because
// adding a field here and forgetting the fixture is a typecheck failure, not a blank panel.
//
// Field names are the backend's snake_case, deliberately unconverted. The camelCase rename
// happens exactly once, inside normalize.
//
// Backend source of truth: `openspec/specs/graph-api/spec.md` in the kube-state-graph repo.

/**
 * One occurrence-grouped alert on a node.
 *
 * PANEL-ONLY. No version of the backend emits `alerts` — the field is the panel's own
 * extension point, fed by the fixture (and, in a real deployment, by whatever the operator
 * puts in front of the panel). Kept in the wire types because normalize parses it from the
 * same payload, but never expect it from kube-state-graph itself.
 */
export interface WireAlert {
  name: string;
  severity: string;
  pod?: string;
  service?: string;
  /** Every occurrence, Unix epoch SECONDS, ascending. Preferred over the legacy `time`. */
  time_records?: number[];
  /** Legacy single-occurrence form; normalize widens it to a one-element list. */
  time?: number;
  id?: string;
}

/** Storage usage in bytes. Same shape on a `pvc` (kubelet) and a `netapp-aggr` (Harvest). */
export interface WireUsage {
  used_bytes?: number;
  capacity_bytes?: number;
}

/** RED measurements on a trace-derived call edge. `rate` is what discriminates the union. */
export interface WireRedMetrics {
  /** Requests per second. Required — a RED object without it is meaningless. */
  rate: number;
  /** Failed FRACTION in [0,1], not a percentage. Absent ≠ 0. */
  error_rate?: number;
  p90_server_ms?: number;
}

/** Storage I/O measurements on a `pvc-to-netapp-aggr` edge. Verbatim Harvest values. */
export interface WireIoMetrics {
  read_ops?: number;
  write_ops?: number;
  read_latency_us?: number;
  write_latency_us?: number;
  read_bytes_per_sec?: number;
  write_bytes_per_sec?: number;
  /** Declared QoS ceilings. Absent = the volume is in no policy group — never 0. */
  max_iops?: number;
  max_bytes_per_sec?: number;
}

export type WireMetrics = WireRedMetrics | WireIoMetrics;

export interface WireNodeData {
  id: string;
  name: string;
  /**
   * The backend's node `type` enum plus its synthesized compound-group types
   * (`cluster` / `storage-cluster` / `namespace` / `application` / `controller`).
   * Typed as a bare string: an unknown kind must render with fallbacks, not fail.
   */
  type: string;
  /** The cytoscape compound container this node nests under. */
  parent?: string;
  /** Strictly `map[string]string` upstream — never a number or a bool. */
  labels?: Record<string, string>;
  ipaddress?: string[];
  owner?: { kind: string; name: string };
  application?: string;
  containers?: Array<{ name: string; image: string }>;
  /** The claim's StorageClass NAME, on the PVC itself (there is no storageclass node). */
  storageclass?: string;
  /** ONTAP health on a `netapp-aggr` / `netapp-node`. Absence is NOT 'degraded'. */
  health?: string;
  /** The K8s node's Ready condition. Absence is NOT 'Unknown'. */
  ready_status?: string;
  usage?: WireUsage;
  /** PANEL-ONLY, like `alerts` — the backend emits no health status field. */
  status?: string;
  /** PANEL-ONLY. See WireAlert. */
  alerts?: WireAlert[];
}

export interface WireEdgeData {
  id: string;
  /** One of the registered edge types from `/v1/edge-types`. */
  type: string;
  source: string;
  target: string;
  labels?: Record<string, string>;
  metrics?: WireMetrics;
}

export interface WireGraph {
  /** Present on a real response; the panel ignores it, the fixture carries it for fidelity. */
  apiVersion?: string;
  /** Kubernetes cluster names only — an ONTAP cluster name never appears here. */
  clusters?: string[];
  elements: {
    nodes: Array<{ data: WireNodeData }>;
    edges: Array<{ data: WireEdgeData }>;
  };
}
