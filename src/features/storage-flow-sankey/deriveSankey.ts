import type cytoscape from 'cytoscape';

import { formatBytes } from '../../shared/format/measurements';
import { EMPTY_STORAGE_GRAPH_ROOTS, type StorageGraphRoots } from '../graph-data';

export type SankeyMode = 'read' | 'write' | 'both';
export type SankeyKind = 'netapp-node' | 'netapp-aggr' | 'netapp-svm' | 'pvc' | 'pod' | 'node';
export type SankeyDirection = 'read' | 'write';
export type StorageFlowTier = 'node-aggr' | 'aggr-svm' | 'svm-pvc' | 'pvc-pod' | 'pod-node';

export const SANKEY_KIND_ORDER: readonly SankeyKind[] = [
  'netapp-node',
  'netapp-aggr',
  'netapp-svm',
  'pvc',
  'pod',
  'node',
];

const KIND_SET = new Set<string>(SANKEY_KIND_ORDER);

const TIERS = new Set<string>(['node-aggr', 'aggr-svm', 'svm-pvc', 'pvc-pod', 'pod-node']);

export interface SankeyNode {
  id: string;
  label: string;
  kind: SankeyKind;
  namespace?: string;
  ontapCluster?: string;
  usage?: { usedBytes?: number; capacityBytes?: number };
  health?: string;
  hardware?: cytoscape.NodeDataDefinition['hardware'];
  perf?: cytoscape.NodeDataDefinition['perf'];
  alerts?: cytoscape.NodeDataDefinition['alerts'];
  noFlow?: boolean;
}

export interface SankeyLink {
  source: string;
  target: string;
  direction: SankeyDirection;
  value: number;
  tier: StorageFlowTier;
  attribution?: string;
  maxBytesPerSec?: number;
  maxIops?: number;
  readLatencyUs?: number;
  writeLatencyUs?: number;
}

export interface SankeyGraph {
  nodes: SankeyNode[];
  links: SankeyLink[];
  hasStorageFlowEdges: boolean;
  hasCurrentDirectionMeasurement: boolean;
}

interface NodeRec {
  id: string;
  label: string;
  kind: string;
  namespace?: string;
  ontapCluster?: string;
  usage?: { usedBytes?: number; capacityBytes?: number };
  health?: string;
  hardware?: cytoscape.NodeDataDefinition['hardware'];
  perf?: cytoscape.NodeDataDefinition['perf'];
  alerts?: cytoscape.NodeDataDefinition['alerts'];
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
    map.set(d.id, {
      id: d.id,
      label: typeof d.label === 'string' ? d.label : d.id,
      kind: typeof d.kind === 'string' ? d.kind : '',
      ...(namespace !== undefined ? { namespace } : {}),
      ...(ontapCluster !== undefined ? { ontapCluster } : {}),
      ...(d.usage !== undefined ? { usage: d.usage } : {}),
      ...(typeof d.health === 'string' ? { health: d.health } : {}),
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

function asSankeyKind(kind: string): SankeyKind | undefined {
  return KIND_SET.has(kind) ? (kind as SankeyKind) : undefined;
}

function asTier(value: string | undefined): StorageFlowTier | undefined {
  return value !== undefined && TIERS.has(value) ? (value as StorageFlowTier) : undefined;
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

function toSankeyNode(rec: NodeRec, noFlow: boolean): SankeyNode | undefined {
  const kind = asSankeyKind(rec.kind);
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
    ...(rec.hardware !== undefined ? { hardware: rec.hardware } : {}),
    ...(rec.perf !== undefined ? { perf: rec.perf } : {}),
    ...(rec.alerts !== undefined ? { alerts: rec.alerts } : {}),
    ...(noFlow ? { noFlow: true } : {}),
  };
}

/**
 * Derive a Sankey from a storage-graph body.
 *
 * Weights come from each `storage-flow` edge's metrics as-is. The function does not
 * aggregate, split, or rewrite the input — the returned graph is a projection.
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
    const tier = asTier(d.labels?.tier);
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
    const kind = asSankeyKind(rec.kind);
    if (kind === undefined) {
      continue;
    }
    if (used.has(rec.id)) {
      const node = toSankeyNode(rec, false);
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
      const node = toSankeyNode(rec, true);
      if (node !== undefined) {
        kept.push(node);
      }
    }
  }

  const nodeIds = new Set(kept.map((n) => n.id));
  const keptLinks = links.filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target));
  return sortSankey({
    nodes: kept,
    links: keptLinks,
    hasStorageFlowEdges: flowEdges.length > 0,
    hasCurrentDirectionMeasurement,
  });
}

function nodeFlow(graph: SankeyGraph, id: string): number {
  let inbound = 0;
  let outbound = 0;
  for (const link of graph.links) {
    if (link.source === id) {
      outbound += link.value;
    }
    if (link.target === id) {
      inbound += link.value;
    }
  }
  return Math.max(inbound, outbound);
}

function sortSankey(graph: SankeyGraph): SankeyGraph {
  const flow = new Map<string, number>();
  for (const node of graph.nodes) {
    flow.set(node.id, node.noFlow === true ? 0 : nodeFlow(graph, node.id));
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
  const links = [...graph.links].sort((a, b) => {
    if (a.source !== b.source) {
      return a.source.localeCompare(b.source);
    }
    if (a.target !== b.target) {
      return a.target.localeCompare(b.target);
    }
    return a.direction.localeCompare(b.direction);
  });
  return { ...graph, nodes, links };
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
