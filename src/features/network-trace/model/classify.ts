import type cytoscape from 'cytoscape';

import { isNodeStatus } from '../../../shared/constants/colorByStatus';
import type { NodeStatus } from '../../../shared/constants/types';
import { STORAGE_KIND_CAPTION } from '../../sankey-canvas';

import type { NodeIndex } from './nodeIndex';
import type { NodeClient, NodeInfo, NodeUsage } from './types';
import { isFiniteNumber, isNonEmptyString } from './util';

/** Hop kinds: drawn as boxes with slots and residuals. `role` keeps the wire kind. */
export const HOP_KINDS: readonly string[] = [
  'switch',
  'router',
  'node',
  'pod',
  'netapp-node',
  'netapp-aggr',
  'netapp-svm',
  'pvc',
];
/** Group kinds: never drawn; only reached through a pod's parent chain. */
const GROUP_KINDS: readonly string[] = ['namespace', 'application', 'cluster', 'storage-cluster', 'controller'];
/** The only edge type the trace draws. A `storage-flow` body derives to no-flow hops, never a crash. */
export const FLOW_EDGE_TYPES: readonly string[] = ['network-flow'];
/**
 * Storage kinds lock to one column per kind when no `labels.tier` is given — the
 * reference Sankey's columns ARE the kinds. Deliberately not `switch` / `node` / `pod`.
 */
export const AUTO_TIER: readonly string[] = ['netapp-node', 'netapp-aggr', 'netapp-svm', 'pvc'];

/**
 * Column caption words for a hop kind; kinds not listed print as themselves. The storage
 * kinds are the shared captions; the k8s words stay lower-case like the trace's other headers.
 */
export const KIND_LABEL: Record<string, string> = {
  ...STORAGE_KIND_CAPTION,
  pod: 'pod',
  node: 'k8s node',
  router: 'router',
};

export type NodeClass = 'hop' | 'group' | 'leaf';

export function classOf(kind: string): NodeClass {
  if (HOP_KINDS.includes(kind)) {
    return 'hop';
  }
  if (GROUP_KINDS.includes(kind)) {
    return 'group';
  }
  return 'leaf';
}

function statusOf(v: unknown): NodeStatus | null {
  return isNodeStatus(v) ? v : null;
}

/**
 * The ribbon weight of an edge: the switch-trace rate delta. A RED family (`rate`) is a
 * call edge and never drawn; absent ≠ 0 — a measured `0` draws at minimum thickness.
 */
export function weightOf(metrics: cytoscape.EdgeDataDefinition['metrics']): number | undefined {
  if (metrics === undefined || 'rate' in metrics) {
    return undefined;
  }
  const delta = metrics.deltaBps;
  return isFiniteNumber(delta) && delta >= 0 ? delta : undefined;
}

/** A placement edge: says which k8s node a pod sits on, never drawn as a ribbon. */
export function isPlacementEdge(d: cytoscape.EdgeDataDefinition): boolean {
  return d.labels?.tier === 'pod-node' || d.edgeType === 'pod-to-node';
}

function usageOf(d: cytoscape.NodeDataDefinition): NodeUsage | null {
  const u = d.usage;
  if (u === undefined) {
    return null;
  }
  const out: NodeUsage = {
    ...(isFiniteNumber(u.usedBytes) && u.usedBytes >= 0 ? { usedBytes: u.usedBytes } : {}),
    ...(isFiniteNumber(u.capacityBytes) && u.capacityBytes >= 0 ? { capacityBytes: u.capacityBytes } : {}),
  };
  return Object.keys(out).length > 0 ? out : null;
}

function infoOf(d: cytoscape.NodeDataDefinition): NodeInfo | null {
  const out: NodeInfo = {};
  if (isNonEmptyString(d.health)) {
    out.health = d.health;
  }
  if (isNonEmptyString(d.hardware?.model)) {
    out.model = d.hardware.model;
  }
  if (d.perf !== undefined) {
    const perf: Record<string, number> = {};
    const p = d.perf;
    if (isFiniteNumber(p.cpuBusyPct)) {
      perf.cpu_busy_pct = p.cpuBusyPct;
    }
    if (isFiniteNumber(p.totalOps)) {
      perf.total_ops = p.totalOps;
    }
    if (isFiniteNumber(p.totalLatencyUs)) {
      perf.total_latency_us = p.totalLatencyUs;
    }
    if (isFiniteNumber(p.totalBytesPerSec)) {
      perf.total_bytes_per_sec = p.totalBytesPerSec;
    }
    if (Object.keys(perf).length > 0) {
      out.perf = perf;
    }
  }
  if (d.alerts !== undefined && d.alerts.length > 0) {
    out.alerts = d.alerts.map((a) => (a.severity === undefined ? a.name : `${a.severity} ${a.name}`));
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** normalize already dropped unidentifiable entries; this only shapes them for the card. */
export function clientsOf(d: cytoscape.NodeDataDefinition): NodeClient[] | null {
  if (d.clients === undefined || d.clients.length === 0) {
    return null;
  }
  const out: NodeClient[] = [];
  for (const c of d.clients) {
    if (!isNonEmptyString(c.ip) && !isNonEmptyString(c.hostname)) {
      continue;
    }
    out.push({
      ip: isNonEmptyString(c.ip) ? c.ip : null,
      hostname: isNonEmptyString(c.hostname) ? c.hostname : null,
      owner: isNonEmptyString(c.owner) ? c.owner : null,
    });
  }
  return out.length > 0 ? out : null;
}

/** The card facts a hop box and a leaf card both read straight off the wire node. */
interface WireFacts {
  namespace: string | null;
  ontapCluster: string | null;
  cluster: string | null;
  status: NodeStatus | null;
  usage: NodeUsage | null;
  info: NodeInfo | null;
  clients: NodeClient[] | null;
}

/**
 * One reading of the wire node for both card shapes (`scan.makeHop`, `edges.ensureLeaf`).
 * A pod's namespace comes from its parent chain; anything else states it in `labels`. The
 * Kubernetes cluster is `labels.cluster` on the node itself, never inferred.
 */
export function wireFacts(index: NodeIndex, d: cytoscape.NodeDataDefinition, id: string, kind: string): WireFacts {
  const lab = d.labels ?? {};
  let namespace: string | null = null;
  if (kind === 'pod') {
    namespace = index.nsOfPod(id);
  } else if (isNonEmptyString(lab.namespace)) {
    namespace = lab.namespace;
  }
  return {
    namespace,
    ontapCluster: isNonEmptyString(lab.ontap_cluster) ? lab.ontap_cluster : null,
    cluster: isNonEmptyString(lab.cluster) ? lab.cluster : null,
    status: statusOf(d.status),
    usage: usageOf(d),
    info: infoOf(d),
    clients: clientsOf(d),
  };
}
