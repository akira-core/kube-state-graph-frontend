import type { NodeStatus } from '../../../shared/constants/types';

export type TraceDirection = 'destination' | 'source';
/** `cluster` frames the k8s-band cards of one Kubernetes cluster together; `none` draws them loose. */
export type TraceGrouping = 'none' | 'cluster';

/** A client resolved behind a port with no LLDP neighbour (ARP / MAC table / DHCP / CMDB). */
export interface NodeClient {
  ip: string | null;
  hostname: string | null;
  owner: string | null;
}

/** Tooltip-only node facts (health / hardware model / raw perf readings / alerts). */
export interface NodeInfo {
  health?: string;
  model?: string;
  perf?: Record<string, number>;
  alerts?: string[];
}

export interface NodeUsage {
  usedBytes?: number;
  capacityBytes?: number;
}

/** The trace's starting point, resolved onto the node that carries it. */
export interface TraceInvestigation {
  nodeId: string;
  iface: string;
  deltaBps: number;
  direction: 'in' | 'out' | null;
  note: string;
}

export type TraceNodeKind = 'node' | 'leaf' | 'anchor';

/**
 * One drawn card. `kind` decides the shape: `node` = a hop box with slots and residuals,
 * `leaf` = an endpoint card (role `leaf` / `pod` / `ns` / `app` / `owner`), `anchor` = the
 * trace-start card. Every field is present with a neutral default rather than optional:
 * the derive steps fill them in sequence (columns set `col` / `subOrder`, residuals set
 * `tracedIn` …) and a discriminated union would have to be rebuilt at every step.
 */
export interface TraceNode {
  id: string;
  label: string;
  kind: TraceNodeKind;
  /** hop: the wire kind; leaf: `leaf` / `pod` / `ns` / `app` / `owner`; anchor: `anchor`. */
  role: string;
  namespace: string | null;
  col: number;
  subOrder: number;
  inEdges: TraceEdge[];
  outEdges: TraceEdge[];
  tier: string | null;
  ontapCluster: string | null;
  /** Kubernetes cluster from `labels.cluster`; a synthesised namespace / application card inherits its pod's. */
  cluster: string | null;
  status: NodeStatus | null;
  usage: NodeUsage | null;
  info: NodeInfo | null;
  clients: NodeClient[] | null;
  // ── hop ──
  otherInBps: number | null;
  otherOutBps: number | null;
  noFlow: boolean;
  isRoot: boolean;
  tracedIn: number;
  tracedOut: number;
  otherIn: number;
  otherOut: number;
  totalIn: number;
  totalOut: number;
  /** Residuals below this are counter noise: not drawn, not reserved space. */
  resEps: number;
  // ── leaf ──
  /** The wire kind of a trace-stop leaf (`host`, `external`, an unknown kind …). */
  type: string | null;
  /** The wire gave this leaf a name; a client-carrying leaf only draws a title then. */
  named: boolean;
  iface: string;
  localIface: string;
  bps: number;
  podCount: number;
  ownerLinked: boolean;
  /** application card: the shared app → namespace derived edge. */
  nsEdge: TraceEdge | null;
  // ── owner ──
  owner: string | null;
  clientCount: number;
  portCount: number;
  meteredPorts: number;
  // ── anchor ──
  note: string;
  dirLabel: 'in' | 'out' | null;
}

export interface TraceEdge {
  id: string;
  fromId: string;
  toId: string;
  fromIface: string;
  toIface: string;
  /** Rate delta, bits/s. */
  bps: number;
  tier: string | null;
  attribution: string | null;
  namespace: string | null;
  /** pod → app → ns or leaf → owner: the same measurement regrouped, never an estimate. */
  derived: boolean;
  /** Ownership line: a port shared by several owners; the amount stays on the port, bps is 0. */
  owns: boolean;
  isAnchor: boolean;
  /** Left out of column assignment while breaking a cycle. */
  dropped: boolean;
  /** Runs against the majority direction (drawn as a backflow ribbon). */
  backward: boolean;
  /** Both ends in one column (drawn as a right-side arc). */
  lateral: boolean;
}

/**
 * A cluster frame under the `cluster` grouping: the k8s-band cards carrying one
 * `labels.cluster`. Not a graph node — no edges, no column, no residual; the frame spans
 * every k8s column and its border takes the worst status of its members.
 */
export interface TraceCluster {
  id: string;
  label: string;
  kind: 'cluster';
  memberIds: string[];
  status: NodeStatus | null;
}

export interface TraceModelOk {
  ok: true;
  direction: TraceDirection;
  investigation: TraceInvestigation | null;
  grouping: TraceGrouping;
  /** Frames in first-seen order; empty under `none` or when no k8s card names a cluster. */
  clusters: TraceCluster[];
  minBps: number;
  /** Ribbons hidden by the display threshold and their total. */
  filtered: { edges: number; bps: number };
  /** Hops removed whole by the display threshold (labels). */
  filteredNodes: string[];
  nodes: TraceNode[];
  nodeMap: ReadonlyMap<string, TraceNode>;
  edges: TraceEdge[];
  anchorEdge: TraceEdge | null;
  root: TraceNode | null;
  warnings: string[];
  maxCol: number;
}

export interface TraceModelError {
  ok: false;
  errors: string[];
}

export type TraceModel = TraceModelOk | TraceModelError;

export interface DeriveTraceOptions {
  direction: TraceDirection;
  /** Display threshold: only ribbons strictly above it are kept; 0 = off. */
  minBps?: number;
  grouping?: TraceGrouping;
}

export function makeNode(init: Pick<TraceNode, 'id' | 'label' | 'kind' | 'role'> & Partial<TraceNode>): TraceNode {
  return {
    namespace: null,
    col: 0,
    subOrder: 0,
    inEdges: [],
    outEdges: [],
    tier: null,
    ontapCluster: null,
    cluster: null,
    status: null,
    usage: null,
    info: null,
    clients: null,
    otherInBps: null,
    otherOutBps: null,
    noFlow: false,
    isRoot: false,
    tracedIn: 0,
    tracedOut: 0,
    otherIn: 0,
    otherOut: 0,
    totalIn: 0,
    totalOut: 0,
    resEps: 1,
    type: null,
    named: false,
    iface: '',
    localIface: '',
    bps: 0,
    podCount: 0,
    ownerLinked: false,
    nsEdge: null,
    owner: null,
    clientCount: 0,
    portCount: 0,
    meteredPorts: 0,
    note: '',
    dirLabel: null,
    ...init,
  };
}

export function makeEdge(
  from: TraceNode,
  to: TraceNode,
  fromIface: string,
  toIface: string,
  bps: number,
  extra: Partial<Pick<TraceEdge, 'tier' | 'attribution' | 'namespace' | 'derived' | 'owns' | 'isAnchor'>> = {}
): TraceEdge {
  return {
    id: '',
    fromId: from.id,
    toId: to.id,
    fromIface,
    toIface,
    bps,
    tier: null,
    attribution: null,
    namespace: null,
    derived: false,
    owns: false,
    isAnchor: false,
    dropped: false,
    backward: false,
    lateral: false,
    ...extra,
  };
}
