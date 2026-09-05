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
 * One alert on a node.
 *
 * TWO PRODUCERS, and they disagree about time. kube-state-graph's alert overlay emits
 * `{name, state, severity}` read from the upstream `ALERTS` series — a point-in-time
 * statement with NO occurrence history, because the query is a `last_over_time` over the
 * request window and the series says only that the alert is firing in it. The panel-era
 * producers (the bundled fixture, and whatever an operator puts in front of a deployment
 * that predates the overlay) group repeats of one alert and carry every occurrence.
 *
 * So `name` and `severity` are the only fields either producer always sends. An alert with
 * no time is a complete alert, not a malformed one — dropping it would empty the whole
 * overlay against the real backend, silently and with a 200.
 */
export interface WireAlert {
  name: string;
  severity: string;
  pod?: string;
  service?: string;
  /**
   * Every occurrence, Unix epoch SECONDS, ascending. Preferred over the legacy `time`.
   * ABSENT from kube-state-graph's overlay — see the note above.
   */
  time_records?: number[];
  /** Legacy single-occurrence form; normalize widens it to a one-element list. */
  time?: number;
  /**
   * `firing` / `pending`, from the overlay only. Deliberately NOT projected: the backend's
   * query carries a fixed `alertstate="firing"` selector and its reader re-tests it, so
   * every entry that reaches here is already firing and a column showing so would be a
   * constant. Declared to document that the field exists and is knowingly ignored.
   */
  state?: string;
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
  /**
   * Hardware identity on a `netapp-node` (Harvest `node_labels`). Each field is
   * independently optional; the whole object is omitted when none resolved.
   */
  hardware?: {
    model?: string;
    serial?: string;
    version?: string;
    vendor?: string;
    location?: string;
  };
  /**
   * Raw performance readings on a `netapp-node`. Absence is NOT 0, and none of
   * these values is a health signal — health arrives via `health` / `alerts`.
   */
  perf?: {
    cpu_busy_pct?: number;
    total_ops?: number;
    total_latency_us?: number;
    total_bytes_per_sec?: number;
  };
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
