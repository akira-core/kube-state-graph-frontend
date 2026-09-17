import type cytoscape from 'cytoscape';

import { isNodeStatus, worstStatus } from '../../shared/constants/colorByStatus';
import type { NodeStatus } from '../../shared/constants/types';
import { formatBytes, formatOps } from '../../shared/format/measurements';
import { EMPTY_STORAGE_GRAPH_ROOTS, recKind, type StorageGraphRoots } from '../graph-data';

export type SankeyMode = 'read' | 'write' | 'both';
/** Which measured pair becomes ribbon weight. Independent of `SankeyMode`. */
export type SankeyWeight = 'throughput' | 'iops';
/**
 * How SVMs are presented. `column` draws today's `netapp-svm` card column; `group` removes
 * it and wraps each SVM's PVCs into a frame in the PVC column instead — see "SVM display
 * switch: column and group".
 */
export type SankeySvmDisplay = 'column' | 'group';
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
   * HIDES other nodes: the Node-layout wrapper folds the worst of its members; derived
   * `application` / `namespace` cards carry none.
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
  /** A `pvc`'s raw `labels.svm` name — display text only, never resolved to a node id. */
  svm?: string;
  /** A `pvc`'s claim aggregate node id, when `resolveClaimAggregates` found one. */
  claimAggregateId?: string;
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

/**
 * An SVM under the `group` SVM display: it leaves `nodes` and becomes a frame around its
 * member PVCs in the PVC column instead of a card of its own. The backend judges no status
 * for an SVM, so this carries none.
 */
export interface SankeySvmFrame {
  id: string;
  label: string;
  ontapCluster?: string;
  pvcIds: string[];
  noFlow?: boolean;
}

export interface SankeyGraph {
  nodes: SankeyNode[];
  links: SankeyLink[];
  k8sNodes: SankeyK8sNode[];
  hasStorageFlowEdges: boolean;
  hasCurrentDirectionMeasurement: boolean;
  /**
   * PVC id -> its claim aggregate's node id, for every PVC whose `labels.aggr` names a
   * `netapp-aggr` node present in the body. See "Flow chain and tier structure" —
   * `resolveClaimAggregates` below is the ONE place this is read, shared by hover, the Top
   * pods cut, the `Group` presentation and the PVC tooltip (design D1).
   */
  claimAggregates: ReadonlyMap<string, string>;
  /** At least one PVC with an inbound `svm-pvc` edge carries a claim aggregate. */
  reportsClaimAggregates: boolean;
  /** Only populated under the `group` SVM display; empty under `column`. */
  svmFrames: SankeySvmFrame[];
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
  /** Raw `labels.svm` passthrough — display text only, never resolved to a node id. */
  svm?: string;
  /** Resolved against the body's node ids by `resolveClaimAggregates`; a `pvc` only. */
  claimAggr?: string;
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
    const svm = typeof d.labels?.svm === 'string' && d.labels.svm.length > 0 ? d.labels.svm : undefined;
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
      ...(svm !== undefined ? { svm } : {}),
    });
  }
  return map;
}

/**
 * A PVC's claim aggregate: the `netapp-aggr` node its `labels.aggr` names, when that node
 * is present in the body — the backend omits the label entirely for a FlexGroup claim, and
 * a label naming a node absent from the body resolves to no claim aggregate rather than a
 * guess. This is the ONE place that reads `labels.aggr`; `deriveSankey` and `cutTopPods`
 * both call it so the hover walk, the Top pods cut, the `Group` presentation and the PVC
 * tooltip cannot drift from one another (design D1).
 */
export function resolveClaimAggregates(elements: readonly cytoscape.ElementDefinition[]): ReadonlyMap<string, string> {
  const nodeIds = new Set<string>();
  const raw = new Map<string, string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (typeof d.id !== 'string') {
      continue;
    }
    nodeIds.add(d.id);
    if (recKind(d) === 'pvc' && typeof d.labels?.aggr === 'string' && d.labels.aggr.length > 0) {
      raw.set(d.id, d.labels.aggr);
    }
  }
  const resolved = new Map<string, string>();
  for (const [pvcId, aggrId] of raw) {
    if (nodeIds.has(aggrId)) {
      resolved.set(pvcId, aggrId);
    }
  }
  return resolved;
}

export function metricOf(
  metrics: cytoscape.EdgeIoMetrics | cytoscape.EdgeRedMetrics | undefined,
  direction: SankeyDirection,
  weight: SankeyWeight = 'throughput'
): number | undefined {
  if (metrics === undefined || 'rate' in metrics) {
    return undefined;
  }
  const value =
    weight === 'iops'
      ? direction === 'read'
        ? metrics.readOps
        : metrics.writeOps
      : direction === 'read'
        ? metrics.readBytesPerSec
        : metrics.writeBytesPerSec;
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
    ...(rec.svm !== undefined ? { svm: rec.svm } : {}),
    ...(rec.claimAggr !== undefined ? { claimAggregateId: rec.claimAggr } : {}),
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

/** Selectable root values, one bucket per root kind so the control can index it by kind. */
export type SankeyRootOptions = Record<keyof StorageGraphRoots, string[]>;

export const EMPTY_SANKEY_ROOT_OPTIONS: SankeyRootOptions = {
  ontap_cluster: [],
  node: [],
  aggr: [],
  svm: [],
  pod: [],
};

/**
 * Root values offered by the body currently drawn.
 *
 * There is no endpoint that enumerates these — `endpoints.labelValues` reaches only the
 * store holding `kube_pod_info`, which carries no `aggr` / `svm` / `ontap_cluster` at all,
 * and its `pod` values are bare names while a pod root is `<namespace>/<pod>`. The drawn
 * body is the one inventory the app already has, and with no root selected it IS the whole
 * estate, so the list starts complete.
 *
 * It NARROWS once a root is applied, because the backend then answers with that projection
 * only: with `aggr: aggr1` in the request, `aggr2` is no longer in the body to offer. That
 * is why the control keeps accepting custom values — the dropdown is a shortcut for names
 * on screen, never the authority on what exists. Removing the root repopulates it, and
 * `ScopeSelect` unions the current selection back in meanwhile.
 *
 * `node` deliberately collects BOTH sides, exactly as the backend matches that kind.
 */
export function rootValueOptions(elements: readonly cytoscape.ElementDefinition[]): SankeyRootOptions {
  const buckets: Record<keyof StorageGraphRoots, Set<string>> = {
    ontap_cluster: new Set(),
    node: new Set(),
    aggr: new Set(),
    svm: new Set(),
    pod: new Set(),
  };
  for (const rec of indexNodes(elements).values()) {
    if (rec.ontapCluster !== undefined) {
      buckets.ontap_cluster.add(rec.ontapCluster);
    }
    switch (rec.kind) {
      case 'netapp-node':
      case 'node':
        buckets.node.add(rec.label);
        break;
      case 'netapp-aggr':
        buckets.aggr.add(rec.label);
        break;
      case 'netapp-svm':
        buckets.svm.add(rec.label);
        break;
      case 'pod':
        // A bare pod name is not a root the backend accepts, so a pod with no namespace
        // cannot be offered at all — half a value in the list would be a 400 waiting to
        // happen, and the operator has no way to see what is missing from it.
        if (rec.namespace !== undefined) {
          buckets.pod.add(`${rec.namespace}/${rec.label}`);
        }
        break;
      default:
        break;
    }
  }
  const sorted = (set: Set<string>): string[] => [...set].sort((a, b) => a.localeCompare(b));
  return {
    ontap_cluster: sorted(buckets.ontap_cluster),
    node: sorted(buckets.node),
    aggr: sorted(buckets.aggr),
    svm: sorted(buckets.svm),
    pod: sorted(buckets.pod),
  };
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
  roots: StorageGraphRoots = EMPTY_STORAGE_GRAPH_ROOTS,
  svmDisplay: SankeySvmDisplay = 'column',
  weight: SankeyWeight = 'throughput'
): SankeyGraph {
  const nodes = indexNodes(elements);
  const claimAggregates = resolveClaimAggregates(elements);
  for (const [pvcId, aggrId] of claimAggregates) {
    const rec = nodes.get(pvcId);
    if (rec !== undefined) {
      rec.claimAggr = aggrId;
    }
  }
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
  /** svmId -> member pvc ids, from every `svm-pvc` edge regardless of SVM display — frame
   *  membership under `group` must include a FlexGroup claim even though it draws no ribbon. */
  const svmMembers = new Map<string, string[]>();
  let reportsClaimAggregates = false;

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
    if (tier === 'svm-pvc') {
      const members = svmMembers.get(sourceId) ?? [];
      members.push(targetId);
      svmMembers.set(sourceId, members);
    }
    if (tier === 'svm-pvc' && claimAggregates.has(targetId)) {
      reportsClaimAggregates = true;
    }
    // Under `group` the SVM tier draws no card: an `aggr-svm` edge draws no ribbon at all,
    // and an `svm-pvc` edge is re-sourced from the SVM to the claim's aggregate — a claim
    // with none (a FlexGroup claim) draws no inbound ribbon rather than a guessed one.
    if (svmDisplay === 'group' && tier === 'aggr-svm') {
      continue;
    }
    let effectiveSource = sourceId;
    if (svmDisplay === 'group' && tier === 'svm-pvc') {
      const claimAggr = claimAggregates.get(targetId);
      if (claimAggr === undefined) {
        continue;
      }
      effectiveSource = claimAggr;
    }
    incident.add(effectiveSource);
    incident.add(targetId);
    flowEdges.push({
      source: effectiveSource,
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
      const value = metricOf(edge.metrics, direction, weight);
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
    if (svmDisplay === 'group' && rec.kind === 'netapp-svm') {
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
    kept.push(toDerivedNode(agg, 'application', undefined));
  }
  for (const agg of namespaces.values()) {
    kept.push(toDerivedNode(agg, 'namespace', undefined));
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
    const worst = worstStatus([rec.id, ...members].map((id) => nodes.get(id)?.status));
    k8sNodes.push({
      id: rec.id,
      label: rec.label,
      podIds: members,
      ...(worst !== null ? { status: worst } : {}),
      ...(members.length === 0 ? { noFlow: true } : {}),
    });
  }

  const keptPvcIds = new Set(kept.filter((n) => n.kind === 'pvc').map((n) => n.id));
  const svmFrames: SankeySvmFrame[] = [];
  if (svmDisplay === 'group') {
    for (const rec of nodes.values()) {
      if (rec.kind !== 'netapp-svm') {
        continue;
      }
      const members = (svmMembers.get(rec.id) ?? []).filter((id) => keptPvcIds.has(id));
      const isRoot = isRequestedRoot(rec, roots);
      if (members.length === 0 && !isRoot) {
        continue;
      }
      svmFrames.push({
        id: rec.id,
        label: rec.label,
        ...(rec.ontapCluster !== undefined ? { ontapCluster: rec.ontapCluster } : {}),
        pvcIds: members,
        ...(members.length === 0 ? { noFlow: true } : {}),
      });
    }
  }

  const nodeIds = new Set(kept.map((n) => n.id));
  const keptLinks = [...links, ...derivedLinks].filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target));
  return sortSankey({
    nodes: kept,
    links: keptLinks,
    k8sNodes,
    hasStorageFlowEdges: flowEdges.length > 0,
    hasCurrentDirectionMeasurement,
    claimAggregates,
    reportsClaimAggregates,
    svmFrames,
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
  // Frames are looked up by name, like the wrappers above — see "Frames are ordered by
  // name".
  const svmFrames = [...graph.svmFrames].sort((a, b) => a.label.localeCompare(b.label));
  const links = [...graph.links].sort((a, b) => {
    if (a.source !== b.source) {
      return a.source.localeCompare(b.source);
    }
    if (a.target !== b.target) {
      return a.target.localeCompare(b.target);
    }
    return a.direction.localeCompare(b.direction);
  });
  return { ...graph, nodes, links, k8sNodes, svmFrames };
}

// Rates ride the SAME SI ladder as every other byte count in the app — a tooltip renders a
// link's rate next to the node's `usage` and `total_bytes_per_sec`, and a second local ladder
// would let one row read `262 kB/s` beside another reading `262 KB`. `formatBytes` owns the
// unit table and the round-then-promote rule; this only appends the `/s`.
export function formatBytesPerSec(value: number): string {
  return `${formatBytes(value)}/s`;
}

export function formatWeight(value: number, weight: SankeyWeight): string {
  return weight === 'iops' ? formatOps(value) : formatBytesPerSec(value);
}

interface LinkIndex {
  kindOf: Map<string, SankeyKind>;
  /** Wrapper (k8s node) id -> its pods; SVM frame id -> its PVCs. */
  membersOf: Map<string, readonly string[]>;
  outBy: Map<string, SankeyLink[]>;
  inBy: Map<string, SankeyLink[]>;
  /** SVM id -> its `svm-pvc` links. */
  svmPvcBySvm: Map<string, SankeyLink[]>;
  /** SVM id -> its inbound `aggr-svm` links. */
  aggrSvmBySvm: Map<string, SankeyLink[]>;
}

// A graph is immutable once derived, so its adjacency is built once however many walks
// (one per hovered card, or one per search hit) read it.
const linkIndexCache = new WeakMap<SankeyGraph, LinkIndex>();

function linkIndexOf(graph: SankeyGraph): LinkIndex {
  const cached = linkIndexCache.get(graph);
  if (cached !== undefined) {
    return cached;
  }
  const push = (map: Map<string, SankeyLink[]>, key: string, link: SankeyLink): void => {
    const list = map.get(key);
    if (list === undefined) {
      map.set(key, [link]);
    } else {
      list.push(link);
    }
  };
  const index: LinkIndex = {
    kindOf: new Map(graph.nodes.map((n) => [n.id, n.kind])),
    membersOf: new Map([
      ...graph.k8sNodes.map((k): [string, readonly string[]] => [k.id, k.podIds]),
      ...graph.svmFrames.map((f): [string, readonly string[]] => [f.id, f.pvcIds]),
    ]),
    outBy: new Map(),
    inBy: new Map(),
    svmPvcBySvm: new Map(),
    aggrSvmBySvm: new Map(),
  };
  for (const link of graph.links) {
    push(index.outBy, link.source, link);
    push(index.inBy, link.target, link);
    if (link.tier === 'svm-pvc') {
      push(index.svmPvcBySvm, link.source, link);
    } else if (link.tier === 'aggr-svm') {
      push(index.aggrSvmBySvm, link.target, link);
    }
  }
  linkIndexCache.set(graph, index);
  return index;
}

/**
 * Every link on a path through any of `startIds` — see "Hover highlights the path" — as
 * one set: what a hover lights for one card, and what a search lights for all its hits at
 * once. A wrapper (a Kubernetes node under the `Node` layout) stands for its member pods
 * and an SVM frame (under the `Group` display) for its member PVCs, so naming either
 * lights every member's path. Each walk step depends only on the node it is at (and on
 * whether the walk is claim-constrained), so starts sharing a constraint share their
 * visited sets: the union is exact and costs one pass over the reachable links however
 * many starts there are.
 *
 * When the body reports claim aggregates, crossing an SVM is claim-aware (design D4):
 * walking UP from a pvc leaves it only toward ITS OWN claim aggregate, never the SVM's
 * other inbound `aggr-svm` edges (which may belong to a different claim), and stops at the
 * SVM for a claim with none (a FlexGroup claim); walking DOWN from an aggregate enters the
 * SVM only toward the pvcs whose claim aggregate is that same aggregate. Both crossings are
 * handled by reading straight from the pvc / aggregate endpoint — the walk never lands ON
 * the SVM node itself, so two claims sharing one SVM (a merge point) never fight over a
 * single "visited" flag. Hovering the SVM card itself is unconstrained (its own inbound and
 * outbound are both generic), and so is the whole walk when the body reports none at all —
 * "a body that reports no claim aggregates is walked over every link, which is all such a
 * body can say." Under the `Group` SVM display the SVM tier draws no card and no
 * `aggr-svm` link at all, so neither special case ever triggers there — the plain walk is
 * already exact.
 */
export function hoverPathLinksMany(graph: SankeyGraph, startIds: Iterable<string>): SankeyLink[] {
  const out = new Set<SankeyLink>();
  const { kindOf, membersOf, outBy, inBy, svmPvcBySvm, aggrSvmBySvm } = linkIndexOf(graph);

  const walk = (starts: readonly string[], constrained: boolean): void => {
    const seenForward = new Set<string>();
    const seenBackward = new Set<string>();

    const forward = (id: string): void => {
      if (seenForward.has(id)) {
        return;
      }
      seenForward.add(id);
      for (const link of outBy.get(id) ?? []) {
        if (constrained && link.tier === 'aggr-svm') {
          // Enter the svm only toward the claims whose claim aggregate is `id` — the
          // aggregate this walk is currently at — bypassing the svm's own unconstrained
          // fan-out (which may hold claims on a different aggregate).
          out.add(link);
          for (const sp of svmPvcBySvm.get(link.target) ?? []) {
            if (graph.claimAggregates.get(sp.target) === id) {
              out.add(sp);
              forward(sp.target);
            }
          }
          continue;
        }
        out.add(link);
        forward(link.target);
      }
    };

    const backward = (id: string): void => {
      if (seenBackward.has(id)) {
        return;
      }
      seenBackward.add(id);
      for (const link of inBy.get(id) ?? []) {
        if (constrained && link.tier === 'svm-pvc' && kindOf.get(link.source) === 'netapp-svm') {
          // Leave the pvc toward its OWN claim aggregate only. A FlexGroup claim (no claim
          // aggregate) stops here — its SVM's other inbound edges may belong to a claim on
          // a different aggregate entirely.
          out.add(link);
          const claimAggr = graph.claimAggregates.get(id);
          if (claimAggr === undefined) {
            continue;
          }
          for (const as of aggrSvmBySvm.get(link.source) ?? []) {
            if (as.source === claimAggr) {
              out.add(as);
              backward(as.source);
            }
          }
          continue;
        }
        out.add(link);
        backward(link.source);
      }
    };

    for (const id of starts) {
      forward(id);
      backward(id);
    }
  };

  // Hovering an SVM card is unconstrained (see above), so SVM starts walk apart.
  const svmStarts: string[] = [];
  const otherStarts: string[] = [];
  for (const id of startIds) {
    for (const start of membersOf.get(id) ?? [id]) {
      (kindOf.get(start) === 'netapp-svm' ? svmStarts : otherStarts).push(start);
    }
  }
  walk(svmStarts, false);
  walk(otherStarts, graph.reportsClaimAggregates);
  return [...out];
}
