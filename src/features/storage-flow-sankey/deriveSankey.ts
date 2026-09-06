import type cytoscape from 'cytoscape';

import { isNodeStatus, rankToStatus, STATUS_RANK } from '../../shared/constants/colorByStatus';
import type { NodeStatus } from '../../shared/constants/types';
import { formatBytes } from '../../shared/format/measurements';
import { EMPTY_STORAGE_GRAPH_ROOTS, type StorageGraphRoots } from '../graph-data';

export type SankeyMode = 'read' | 'write' | 'both';
export type SankeyKind = 'netapp-node' | 'netapp-aggr' | 'netapp-svm' | 'pvc' | 'pod' | 'application' | 'namespace';
export type SankeyDirection = 'read' | 'write';
export type StorageFlowTier = 'node-aggr' | 'aggr-svm' | 'svm-pvc' | 'pvc-pod';
export type DerivedFlowTier = 'pod-application' | 'pod-namespace' | 'application-namespace';
export type SankeyLinkTier = StorageFlowTier | DerivedFlowTier;

export const SANKEY_KIND_ORDER: readonly SankeyKind[] = [
  'netapp-node',
  'netapp-aggr',
  'netapp-svm',
  'pvc',
  'pod',
  'application',
  'namespace',
];

export const DERIVED_TIER_LABEL: Record<DerivedFlowTier, string> = {
  'pod-application': 'pod → application',
  'pod-namespace': 'pod → namespace',
  'application-namespace': 'application → namespace',
};

const BACKEND_KINDS = new Set<string>(['netapp-node', 'netapp-aggr', 'netapp-svm', 'pvc', 'pod']);
const DRAWN_TIERS = new Set<string>(['node-aggr', 'aggr-svm', 'svm-pvc', 'pvc-pod']);

export interface SankeyNode {
  id: string;
  label: string;
  kind: SankeyKind;
  namespace?: string;
  ontapCluster?: string;
  usage?: { usedBytes?: number; capacityBytes?: number };
  health?: string;
  /**
   * The backend's folded verdict (`graph.FoldStatus`), passed through untouched — the same
   * field Graph view borders a node by, so the two views cannot disagree about an estate.
   * Absent on every node the backend sends none for (SVMs, synthesised compounds), which
   * draws the neutral border rather than a green one it has no evidence for. On a card that
   * HIDES other nodes (`application` / `namespace`, and the Node-layout wrapper) it is the
   * worst status of the members instead, matching a collapsed compound in Graph view.
   */
  status?: NodeStatus;
  hardware?: cytoscape.NodeDataDefinition['hardware'];
  perf?: cytoscape.NodeDataDefinition['perf'];
  alerts?: cytoscape.NodeDataDefinition['alerts'];
  noFlow?: boolean;
  /** Present on a pod that is the source of a `pod-node` edge. */
  k8sNodeId?: string;
  derived?: true;
  memberPodCount?: number;
}

export interface SankeyLink {
  source: string;
  target: string;
  direction: SankeyDirection;
  value: number;
  tier: SankeyLinkTier;
  attribution?: string;
  maxBytesPerSec?: number;
  maxIops?: number;
  readLatencyUs?: number;
  writeLatencyUs?: number;
  derived?: true;
}

export interface SankeyK8sNode {
  id: string;
  label: string;
  podIds: string[];
  /** Worst status among the pods this wrapper draws, plus the node's own. */
  status?: NodeStatus;
  noFlow?: boolean;
}

export interface SankeyGraph {
  nodes: SankeyNode[];
  links: SankeyLink[];
  k8sNodes: SankeyK8sNode[];
  hasStorageFlowEdges: boolean;
  hasCurrentDirectionMeasurement: boolean;
}

interface NodeRec {
  id: string;
  label: string;
  kind: string;
  parent?: string;
  namespace?: string;
  ontapCluster?: string;
  usage?: { usedBytes?: number; capacityBytes?: number };
  health?: string;
  status?: NodeStatus;
  hardware?: cytoscape.NodeDataDefinition['hardware'];
  perf?: cytoscape.NodeDataDefinition['perf'];
  alerts?: cytoscape.NodeDataDefinition['alerts'];
}

/**
 * Compound groups (`application` / `namespace` / `controller`) are kind-less on the
 * wire after normalize — they carry `isApplication` / `isNamespace` / `isController`
 * instead. The parent-chain walk needs the D6 kind, so those flags are folded back
 * here. A controller also receives a workload `kind` from enrichControllers; that is
 * the icon, not the hop, so `isController` wins.
 */
function recKind(d: cytoscape.NodeDataDefinition): string {
  if (d.isController === true) {
    return 'controller';
  }
  if (d.isApplication === true) {
    return 'application';
  }
  if (d.isNamespace === true) {
    return 'namespace';
  }
  if (d.isCluster === true) {
    return 'cluster';
  }
  if (d.isStorageCluster === true) {
    return 'storage-cluster';
  }
  return typeof d.kind === 'string' ? d.kind : '';
}

function indexNodes(elements: readonly cytoscape.ElementDefinition[]): Map<string, NodeRec> {
  const map = new Map<string, NodeRec>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (typeof d.id !== 'string') {
      continue;
    }
    const namespace =
      typeof d.namespace === 'string' && d.namespace.length > 0
        ? d.namespace
        : typeof d.labels?.namespace === 'string'
          ? d.labels.namespace
          : undefined;
    const ontapCluster = typeof d.labels?.ontap_cluster === 'string' ? d.labels.ontap_cluster : undefined;
    const parent = typeof d.parent === 'string' && d.parent.length > 0 ? d.parent : undefined;
    map.set(d.id, {
      id: d.id,
      label: typeof d.label === 'string' ? d.label : d.id,
      kind: recKind(d),
      ...(parent !== undefined ? { parent } : {}),
      ...(namespace !== undefined ? { namespace } : {}),
      ...(ontapCluster !== undefined ? { ontapCluster } : {}),
      ...(d.usage !== undefined ? { usage: d.usage } : {}),
      ...(typeof d.health === 'string' ? { health: d.health } : {}),
      ...(isNodeStatus(d.status) ? { status: d.status } : {}),
      ...(d.hardware !== undefined ? { hardware: d.hardware } : {}),
      ...(d.perf !== undefined ? { perf: d.perf } : {}),
      ...(d.alerts !== undefined ? { alerts: d.alerts } : {}),
    });
  }
  return map;
}

function metricOf(
  metrics: cytoscape.EdgeIoMetrics | cytoscape.EdgeRedMetrics | undefined,
  direction: SankeyDirection
): number | undefined {
  if (metrics === undefined || 'rate' in metrics) {
    return undefined;
  }
  const value = direction === 'read' ? metrics.readBytesPerSec : metrics.writeBytesPerSec;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function ioMetrics(data: cytoscape.EdgeDataDefinition): cytoscape.EdgeIoMetrics | undefined {
  const metrics = data.metrics;
  if (metrics === undefined || 'rate' in metrics) {
    return undefined;
  }
  return metrics;
}

function asBackendKind(kind: string): SankeyKind | undefined {
  return BACKEND_KINDS.has(kind) ? (kind as SankeyKind) : undefined;
}

function asDrawnTier(value: string | undefined): StorageFlowTier | undefined {
  return value !== undefined && DRAWN_TIERS.has(value) ? (value as StorageFlowTier) : undefined;
}

export function isDerivedTier(tier: SankeyLinkTier): tier is DerivedFlowTier {
  return tier === 'pod-application' || tier === 'pod-namespace' || tier === 'application-namespace';
}

/**
 * First ancestor of `kind` walking `data.parent` upward. The walk is hop-bounded by a
 * seen-set so a parent cycle cannot hang it.
 */
function firstAncestorOfKind(nodes: Map<string, NodeRec>, id: string, kind: string): NodeRec | undefined {
  const seen = new Set<string>();
  let current = nodes.get(id);
  while (current?.parent !== undefined && !seen.has(current.parent)) {
    seen.add(current.parent);
    const rec = nodes.get(current.parent);
    if (rec === undefined) {
      return undefined;
    }
    if (rec.kind === kind) {
      return rec;
    }
    current = rec;
  }
  return undefined;
}

/**
 * Does this node answer one of the roots the request asked for?
 *
 * The wire carries no root marker, so the ONLY local evidence that the backend
 * materialised a node as a root is the selection the request was built from. Matching is
 * by name, exactly as the backend matches: `node` deliberately hits both a NetApp
 * controller and a Kubernetes node (the operator often does not know which side a name
 * belongs to), `ontap_cluster` claims every controller / aggregate / SVM inside it, and a
 * pod root is `<namespace>/<pod>`. `pvc` is not a root kind, so a claim is never one.
 *
 * This is NOT a client-side filter on the response — it only ever KEEPS a node the
 * projection already contains, so it cannot break the backend's weight conservation.
 */
function isRequestedRoot(rec: NodeRec, roots: StorageGraphRoots): boolean {
  const inOntapCluster = rec.ontapCluster !== undefined && roots.ontap_cluster.includes(rec.ontapCluster);
  switch (rec.kind) {
    case 'netapp-node':
      return inOntapCluster || roots.node.includes(rec.label);
    case 'netapp-aggr':
      return inOntapCluster || roots.aggr.includes(rec.label);
    case 'netapp-svm':
      return inOntapCluster || roots.svm.includes(rec.label);
    case 'node':
      return roots.node.includes(rec.label);
    case 'pod':
      return rec.namespace !== undefined && roots.pod.includes(`${rec.namespace}/${rec.label}`);
    default:
      return false;
  }
}

function toSankeyNode(rec: NodeRec, noFlow: boolean, k8sNodeId?: string): SankeyNode | undefined {
  const kind = asBackendKind(rec.kind);
  if (kind === undefined) {
    return undefined;
  }
  return {
    id: rec.id,
    label: rec.label,
    kind,
    ...(rec.namespace !== undefined ? { namespace: rec.namespace } : {}),
    ...(rec.ontapCluster !== undefined ? { ontapCluster: rec.ontapCluster } : {}),
    ...(rec.usage !== undefined ? { usage: rec.usage } : {}),
    ...(rec.health !== undefined ? { health: rec.health } : {}),
    ...(rec.status !== undefined ? { status: rec.status } : {}),
    ...(rec.hardware !== undefined ? { hardware: rec.hardware } : {}),
    ...(rec.perf !== undefined ? { perf: rec.perf } : {}),
    ...(rec.alerts !== undefined ? { alerts: rec.alerts } : {}),
    ...(k8sNodeId !== undefined ? { k8sNodeId } : {}),
    ...(noFlow ? { noFlow: true } : {}),
  };
}

interface GroupAgg {
  rec: NodeRec;
  members: Set<string>;
  namespace?: string;
}

function touchGroup(map: Map<string, GroupAgg>, rec: NodeRec, podId: string, namespace?: string): GroupAgg {
  const existing = map.get(rec.id);
  if (existing !== undefined) {
    existing.members.add(podId);
    if (existing.namespace === undefined && namespace !== undefined) {
      existing.namespace = namespace;
    }
    return existing;
  }
  const created: GroupAgg = {
    rec,
    members: new Set([podId]),
    ...(namespace !== undefined ? { namespace } : {}),
  };
  map.set(rec.id, created);
  return created;
}

/**
 * Worst status over a set of ids, or `undefined` when none of them carries one.
 *
 * Absent must NOT collapse to `normal`: a green border on a card whose members the backend
 * never judged claims a verdict nobody made. That is the same reason `FALLBACK_STATUS` is
 * an aggregation default only — it counts an unjudged member as healthy INSIDE a fold that
 * already has evidence, never as evidence of its own.
 */
function worstStatusOf(nodes: Map<string, NodeRec>, ids: Iterable<string>): NodeStatus | undefined {
  let rank: number | undefined;
  for (const id of ids) {
    const status = nodes.get(id)?.status;
    if (status === undefined) {
      continue;
    }
    rank = rank === undefined ? STATUS_RANK[status] : Math.max(rank, STATUS_RANK[status]);
  }
  return rank === undefined ? undefined : rankToStatus(rank);
}

function toDerivedNode(agg: GroupAgg, kind: 'application' | 'namespace', status: NodeStatus | undefined): SankeyNode {
  return {
    id: agg.rec.id,
    label: agg.rec.label,
    kind,
    derived: true,
    memberPodCount: agg.members.size,
    ...(agg.namespace !== undefined ? { namespace: agg.namespace } : {}),
    ...(status !== undefined ? { status } : {}),
  };
}

/**
 * Kubernetes nodes in the body whose name is one of the request's `node` roots.
 * Used to hint under the Flat layout, where those nodes have nowhere to be drawn.
 */
export function kubernetesNodeRoots(
  elements: readonly cytoscape.ElementDefinition[],
  roots: StorageGraphRoots
): Array<{ id: string; label: string }> {
  if (roots.node.length === 0) {
    return [];
  }
  const hits: Array<{ id: string; label: string }> = [];
  for (const rec of indexNodes(elements).values()) {
    if (rec.kind === 'node' && roots.node.includes(rec.label)) {
      hits.push({ id: rec.id, label: rec.label });
    }
  }
  return hits;
}

/**
 * Derive a Sankey from a storage-graph body.
 *
 * Backend-tier weights come from each `storage-flow` edge's metrics as-is. The only
 * client-side sum is the derived `application` / `namespace` columns, taken per direction
 * over already-drawn `pvc-pod` links. The function does not mutate the input.
 */
export function deriveSankey(
  elements: readonly cytoscape.ElementDefinition[],
  mode: SankeyMode,
  roots: StorageGraphRoots = EMPTY_STORAGE_GRAPH_ROOTS
): SankeyGraph {
  const nodes = indexNodes(elements);
  const directions: SankeyDirection[] = mode === 'both' ? ['read', 'write'] : [mode];

  const flowEdges: Array<{
    source: string;
    target: string;
    tier: StorageFlowTier;
    attribution?: string;
    metrics: cytoscape.EdgeIoMetrics | undefined;
  }> = [];
  const incident = new Set<string>();
  const podToK8s = new Map<string, { id: string; label: string }>();
  const k8sPodIds = new Map<string, string[]>();

  for (const el of elements) {
    if (el.group !== 'edges') {
      continue;
    }
    const d = el.data as cytoscape.EdgeDataDefinition;
    if (d.edgeType !== 'storage-flow') {
      continue;
    }
    const sourceId = typeof d.source === 'string' ? d.source : undefined;
    const targetId = typeof d.target === 'string' ? d.target : undefined;
    if (sourceId === undefined || targetId === undefined) {
      continue;
    }
    if (!nodes.has(sourceId) || !nodes.has(targetId)) {
      continue;
    }
    const rawTier = d.labels?.tier;
    if (rawTier === 'pod-node') {
      // Placement only: never a ribbon. Recorded even when the edge carries no metrics.
      incident.add(sourceId);
      incident.add(targetId);
      const target = nodes.get(targetId);
      if (target !== undefined && target.kind === 'node') {
        podToK8s.set(sourceId, { id: target.id, label: target.label });
        const list = k8sPodIds.get(target.id) ?? [];
        list.push(sourceId);
        k8sPodIds.set(target.id, list);
      }
      continue;
    }
    const tier = asDrawnTier(rawTier);
    if (tier === undefined) {
      continue;
    }
    incident.add(sourceId);
    incident.add(targetId);
    flowEdges.push({
      source: sourceId,
      target: targetId,
      tier,
      ...(d.labels?.attribution !== undefined ? { attribution: d.labels.attribution } : {}),
      metrics: ioMetrics(d),
    });
  }

  const links: SankeyLink[] = [];
  const used = new Set<string>();
  let hasCurrentDirectionMeasurement = false;

  for (const edge of flowEdges) {
    for (const direction of directions) {
      const value = metricOf(edge.metrics, direction);
      if (value === undefined) {
        continue;
      }
      hasCurrentDirectionMeasurement = true;
      const io = edge.metrics;
      links.push({
        source: edge.source,
        target: edge.target,
        direction,
        value,
        tier: edge.tier,
        ...(edge.attribution !== undefined ? { attribution: edge.attribution } : {}),
        ...(io?.maxBytesPerSec !== undefined ? { maxBytesPerSec: io.maxBytesPerSec } : {}),
        ...(io?.maxIops !== undefined ? { maxIops: io.maxIops } : {}),
        ...(io?.readLatencyUs !== undefined ? { readLatencyUs: io.readLatencyUs } : {}),
        ...(io?.writeLatencyUs !== undefined ? { writeLatencyUs: io.writeLatencyUs } : {}),
      });
      used.add(edge.source);
      used.add(edge.target);
    }
  }

  const kept: SankeyNode[] = [];
  for (const rec of nodes.values()) {
    if (rec.kind === 'node') {
      continue;
    }
    const kind = asBackendKind(rec.kind);
    if (kind === undefined) {
      continue;
    }
    const k8s = podToK8s.get(rec.id);
    if (used.has(rec.id)) {
      const node = toSankeyNode(rec, false, k8s?.id);
      if (node !== undefined) {
        kept.push(node);
      }
      continue;
    }
    // Materialised root. Two shapes, one meaning — the backend answered with this node and
    // it carries no drawn flow:
    //   - no storage-flow edge at all (a degraded aggregate holding no claim), and
    //   - edges that exist but went entirely unmeasured, which is a real path the backend
    //     deliberately returns without `metrics`. Its non-root nodes are dropped above;
    //     its roots must survive, and rootness is only knowable from the request.
    if (!incident.has(rec.id) || isRequestedRoot(rec, roots)) {
      const node = toSankeyNode(rec, true, k8s?.id);
      if (node !== undefined) {
        kept.push(node);
      }
    }
  }

  const applications = new Map<string, GroupAgg>();
  const namespaces = new Map<string, GroupAgg>();
  const derivedLinks: SankeyLink[] = [];

  /** Running `pod -> application` inflow per application and direction, so the
   *  `application -> namespace` weight is a lookup rather than a rescan of every derived link. */
  const appInflow = new Map<string, Partial<Record<SankeyDirection, number>>>();

  const emitDerived = (
    source: string,
    target: string,
    direction: SankeyDirection,
    value: number,
    tier: DerivedFlowTier
  ): void => {
    derivedLinks.push({ source, target, direction, value, tier, derived: true });
    if (tier === 'pod-application') {
      const acc = appInflow.get(target) ?? {};
      acc[direction] = (acc[direction] ?? 0) + value;
      appInflow.set(target, acc);
    }
  };

  // Drawn `pvc-pod` weight per pod, indexed once. Scanning every link per pod is quadratic
  // at the spec's stated bound (1000 pods against ~3500 links).
  const pvcPodByPod = new Map<string, { read?: number; write?: number }>();
  for (const link of links) {
    if (link.tier !== 'pvc-pod') {
      continue;
    }
    const acc = pvcPodByPod.get(link.target) ?? {};
    if (link.direction === 'read') {
      acc.read = (acc.read ?? 0) + link.value;
    } else {
      acc.write = (acc.write ?? 0) + link.value;
    }
    pvcPodByPod.set(link.target, acc);
  }

  for (const pod of kept) {
    if (pod.kind !== 'pod' || pod.noFlow === true) {
      continue;
    }
    const { read, write } = pvcPodByPod.get(pod.id) ?? {};
    if (read === undefined && write === undefined) {
      continue;
    }
    const app = firstAncestorOfKind(nodes, pod.id, 'application');
    const ns = firstAncestorOfKind(nodes, pod.id, 'namespace');
    if (app !== undefined) {
      const appNs = firstAncestorOfKind(nodes, app.id, 'namespace')?.label ?? ns?.label ?? pod.namespace;
      touchGroup(applications, app, pod.id, appNs);
      if (ns !== undefined) {
        touchGroup(namespaces, ns, pod.id);
      }
      if (read !== undefined) {
        emitDerived(pod.id, app.id, 'read', read, 'pod-application');
      }
      if (write !== undefined) {
        emitDerived(pod.id, app.id, 'write', write, 'pod-application');
      }
    } else if (ns !== undefined) {
      touchGroup(namespaces, ns, pod.id);
      if (read !== undefined) {
        emitDerived(pod.id, ns.id, 'read', read, 'pod-namespace');
      }
      if (write !== undefined) {
        emitDerived(pod.id, ns.id, 'write', write, 'pod-namespace');
      }
    }
  }

  for (const [appId, agg] of applications) {
    const ns = firstAncestorOfKind(nodes, appId, 'namespace');
    if (ns === undefined) {
      continue;
    }
    for (const podId of agg.members) {
      touchGroup(namespaces, ns, podId);
    }
    const inflow = appInflow.get(appId);
    for (const direction of directions) {
      const sum = inflow?.[direction];
      if (sum !== undefined) {
        emitDerived(appId, ns.id, direction, sum, 'application-namespace');
      }
    }
  }

  for (const agg of applications.values()) {
    kept.push(toDerivedNode(agg, 'application', worstStatusOf(nodes, agg.members)));
  }
  for (const agg of namespaces.values()) {
    kept.push(toDerivedNode(agg, 'namespace', worstStatusOf(nodes, agg.members)));
  }

  const keptPodIds = new Set(kept.filter((n) => n.kind === 'pod').map((n) => n.id));
  const k8sNodes: SankeyK8sNode[] = [];
  for (const rec of nodes.values()) {
    if (rec.kind !== 'node') {
      continue;
    }
    const members = (k8sPodIds.get(rec.id) ?? []).filter((id) => keptPodIds.has(id));
    const isRoot = isRequestedRoot(rec, roots);
    if (members.length === 0 && !isRoot) {
      continue;
    }
    // The node's OWN status folds in beside its pods': the wrapper is the only thing drawn
    // for it, so a degraded node holding healthy pods must still read as degraded.
    const worst = worstStatusOf(nodes, [rec.id, ...members]);
    k8sNodes.push({
      id: rec.id,
      label: rec.label,
      podIds: members,
      ...(worst !== undefined ? { status: worst } : {}),
      ...(members.length === 0 ? { noFlow: true } : {}),
    });
  }

  const nodeIds = new Set(kept.map((n) => n.id));
  const keptLinks = [...links, ...derivedLinks].filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target));
  return sortSankey({
    nodes: kept,
    links: keptLinks,
    k8sNodes,
    hasStorageFlowEdges: flowEdges.length > 0,
    hasCurrentDirectionMeasurement,
  });
}

/** Peak of inbound and outbound per node, in ONE pass over the links. */
function nodeFlows(graph: SankeyGraph): Map<string, number> {
  const sums = new Map<string, { in: number; out: number }>();
  for (const link of graph.links) {
    const s = sums.get(link.source) ?? { in: 0, out: 0 };
    s.out += link.value;
    sums.set(link.source, s);
    const t = sums.get(link.target) ?? { in: 0, out: 0 };
    t.in += link.value;
    sums.set(link.target, t);
  }
  const flow = new Map<string, number>();
  for (const [id, { in: inbound, out: outbound }] of sums) {
    flow.set(id, Math.max(inbound, outbound));
  }
  return flow;
}

function sortSankey(graph: SankeyGraph): SankeyGraph {
  const peak = nodeFlows(graph);
  const flow = new Map<string, number>();
  for (const node of graph.nodes) {
    flow.set(node.id, node.noFlow === true ? 0 : (peak.get(node.id) ?? 0));
  }
  const nodes = [...graph.nodes].sort((a, b) => {
    const ka = SANKEY_KIND_ORDER.indexOf(a.kind);
    const kb = SANKEY_KIND_ORDER.indexOf(b.kind);
    if (ka !== kb) {
      return ka - kb;
    }
    const fa = flow.get(a.id) ?? 0;
    const fb = flow.get(b.id) ?? 0;
    if (fb !== fa) {
      return fb - fa;
    }
    return a.label.localeCompare(b.label);
  });
  const k8sNodes = [...graph.k8sNodes].sort((a, b) => a.label.localeCompare(b.label));
  const links = [...graph.links].sort((a, b) => {
    if (a.source !== b.source) {
      return a.source.localeCompare(b.source);
    }
    if (a.target !== b.target) {
      return a.target.localeCompare(b.target);
    }
    return a.direction.localeCompare(b.direction);
  });
  return { ...graph, nodes, links, k8sNodes };
}

// Rates ride the SAME SI ladder as every other byte count in the app — a tooltip renders a
// link's rate next to the node's `usage` and `total_bytes_per_sec`, and a second local ladder
// would let one row read `262 kB/s` beside another reading `262 KB`. `formatBytes` owns the
// unit table and the round-then-promote rule; this only appends the `/s`.
export function formatBytesPerSec(value: number): string {
  return `${formatBytes(value)}/s`;
}

export function hoverPathLinks(graph: SankeyGraph, nodeId: string): SankeyLink[] {
  const out = new Set<SankeyLink>();
  const forward = (id: string, seen: Set<string>): void => {
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    for (const link of graph.links) {
      if (link.source === id) {
        out.add(link);
        forward(link.target, seen);
      }
    }
  };
  const backward = (id: string, seen: Set<string>): void => {
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    for (const link of graph.links) {
      if (link.target === id) {
        out.add(link);
        backward(link.source, seen);
      }
    }
  };
  forward(nodeId, new Set());
  backward(nodeId, new Set());
  return [...out];
}

/** Union of every member pod's path — hovering a wrapper title lights them all. */
export function hoverPathForWrapper(graph: SankeyGraph, k8sNode: SankeyK8sNode): SankeyLink[] {
  const seen = new Set<SankeyLink>();
  for (const podId of k8sNode.podIds) {
    for (const link of hoverPathLinks(graph, podId)) {
      seen.add(link);
    }
  }
  return [...seen];
}
