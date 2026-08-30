import type cytoscape from 'cytoscape';

export type SankeyMode = 'read' | 'write' | 'both';
export type SankeyKind = 'pod' | 'pvc' | 'netapp-aggr' | 'netapp-node';
export type SankeyDirection = 'read' | 'write';

export interface SankeyNode {
  id: string;
  label: string;
  kind: SankeyKind;
  cluster?: string;
  namespace?: string;
  usage?: { usedBytes?: number; capacityBytes?: number };
  health?: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  direction: SankeyDirection;
  value: number;
  splitAmong?: number;
  maxBytesPerSec?: number;
  maxIops?: number;
}

export interface SankeyGraph {
  nodes: SankeyNode[];
  links: SankeyLink[];
  hasAnyMeasurement: boolean;
}

interface NodeRec {
  id: string;
  label: string;
  kind: string;
  parent?: string;
  cluster?: string;
  namespace?: string;
  usage?: { usedBytes?: number; capacityBytes?: number };
  health?: string;
}

function nodeKind(d: cytoscape.NodeDataDefinition): string | undefined {
  return typeof d.kind === 'string' ? d.kind : undefined;
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
    const clusterLabel = d.labels?.cluster;
    const namespace =
      typeof d.namespace === 'string' && d.namespace.length > 0
        ? d.namespace
        : typeof d.labels?.namespace === 'string'
          ? d.labels.namespace
          : undefined;
    map.set(d.id, {
      id: d.id,
      label: typeof d.label === 'string' ? d.label : d.id,
      kind: nodeKind(d) ?? '',
      ...(typeof d.parent === 'string' ? { parent: d.parent } : {}),
      ...(typeof clusterLabel === 'string' && clusterLabel.length > 0 ? { cluster: clusterLabel } : {}),
      ...(namespace !== undefined ? { namespace } : {}),
      ...(d.usage !== undefined ? { usage: d.usage } : {}),
      ...(typeof d.health === 'string' ? { health: d.health } : {}),
    });
  }
  return map;
}

function resolveCluster(nodes: Map<string, NodeRec>, id: string): string | undefined {
  let cur = nodes.get(id);
  let hops = 0;
  while (cur !== undefined && hops <= nodes.size) {
    if (cur.cluster !== undefined) {
      return cur.cluster;
    }
    if (cur.parent === undefined) {
      return undefined;
    }
    cur = nodes.get(cur.parent);
    hops += 1;
  }
  return undefined;
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

export function deriveSankey(
  elements: readonly cytoscape.ElementDefinition[],
  mode: SankeyMode,
  clusterFilter?: string
): SankeyGraph {
  const nodes = indexNodes(elements);
  const directions: SankeyDirection[] = mode === 'both' ? ['read', 'write'] : [mode];

  const pvcAggr: Array<{
    source: string;
    target: string;
    metrics: cytoscape.EdgeIoMetrics | undefined;
  }> = [];
  const podPvc: Array<{ source: string; target: string }> = [];

  for (const el of elements) {
    if (el.group !== 'edges') {
      continue;
    }
    const d = el.data as cytoscape.EdgeDataDefinition;
    const source = typeof d.source === 'string' ? nodes.get(d.source) : undefined;
    const target = typeof d.target === 'string' ? nodes.get(d.target) : undefined;
    if (source === undefined || target === undefined) {
      continue;
    }
    if (d.edgeType === 'pvc-to-netapp-aggr' && source.kind === 'pvc' && target.kind === 'netapp-aggr') {
      pvcAggr.push({ source: source.id, target: target.id, metrics: ioMetrics(d) });
    }
    if (d.edgeType === 'pod-mounts-pvc' && source.kind === 'pod' && target.kind === 'pvc') {
      podPvc.push({ source: source.id, target: target.id });
    }
  }

  let hasAnyMeasurement = false;
  for (const edge of pvcAggr) {
    if (metricOf(edge.metrics, 'read') !== undefined || metricOf(edge.metrics, 'write') !== undefined) {
      hasAnyMeasurement = true;
    }
  }

  const links: SankeyLink[] = [];
  const used = new Set<string>();

  const mountsByPvc = new Map<string, string[]>();
  for (const edge of podPvc) {
    const list = mountsByPvc.get(edge.target) ?? [];
    list.push(edge.source);
    mountsByPvc.set(edge.target, list);
  }

  for (const edge of pvcAggr) {
    for (const direction of directions) {
      const value = metricOf(edge.metrics, direction);
      if (value === undefined) {
        continue;
      }
      const io = edge.metrics;
      links.push({
        source: edge.source,
        target: edge.target,
        direction,
        value,
        ...(io?.maxBytesPerSec !== undefined ? { maxBytesPerSec: io.maxBytesPerSec } : {}),
        ...(io?.maxIops !== undefined ? { maxIops: io.maxIops } : {}),
      });
      used.add(edge.source);
      used.add(edge.target);
    }
  }

  const aggrIn = new Map<string, { read: number; write: number }>();
  for (const link of links) {
    const cur = aggrIn.get(link.target) ?? { read: 0, write: 0 };
    if (link.direction === 'read') {
      cur.read += link.value;
    } else {
      cur.write += link.value;
    }
    aggrIn.set(link.target, cur);
  }

  for (const [aggrId, totals] of aggrIn) {
    const aggr = nodes.get(aggrId);
    if (aggr === undefined || aggr.parent === undefined) {
      continue;
    }
    const parent = nodes.get(aggr.parent);
    if (parent === undefined || parent.kind !== 'netapp-node') {
      continue;
    }
    for (const direction of directions) {
      const value = direction === 'read' ? totals.read : totals.write;
      if (!Object.hasOwn(totals, direction === 'read' ? 'read' : 'write')) {
        continue;
      }
      const present = links.some((l) => l.target === aggrId && l.direction === direction);
      if (!present) {
        continue;
      }
      links.push({ source: aggrId, target: parent.id, direction, value });
      used.add(parent.id);
    }
  }

  const pvcTotals = new Map<string, { read?: number; write?: number }>();
  for (const link of links) {
    if (!pvcAggr.some((e) => e.source === link.source && e.target === link.target)) {
      continue;
    }
    const cur = pvcTotals.get(link.source) ?? {};
    if (link.direction === 'read') {
      cur.read = (cur.read ?? 0) + link.value;
    } else {
      cur.write = (cur.write ?? 0) + link.value;
    }
    pvcTotals.set(link.source, cur);
  }

  for (const [pvcId, totals] of pvcTotals) {
    const mounts = mountsByPvc.get(pvcId) ?? [];
    const n = mounts.length;
    if (n === 0) {
      continue;
    }
    for (const direction of directions) {
      const total = direction === 'read' ? totals.read : totals.write;
      if (total === undefined) {
        continue;
      }
      const share = total / n;
      for (const podId of mounts) {
        const pod = nodes.get(podId);
        if (pod === undefined || pod.kind !== 'pod') {
          continue;
        }
        links.push({ source: podId, target: pvcId, direction, value: share, splitAmong: n });
        used.add(podId);
      }
    }
  }

  const toNode = (id: string): SankeyNode | undefined => {
    const rec = nodes.get(id);
    if (rec === undefined) {
      return undefined;
    }
    if (rec.kind !== 'pod' && rec.kind !== 'pvc' && rec.kind !== 'netapp-aggr' && rec.kind !== 'netapp-node') {
      return undefined;
    }
    const cluster = resolveCluster(nodes, id);
    return {
      id: rec.id,
      label: rec.label,
      kind: rec.kind,
      ...(cluster !== undefined ? { cluster } : {}),
      ...(rec.namespace !== undefined ? { namespace: rec.namespace } : {}),
      ...(rec.usage !== undefined ? { usage: rec.usage } : {}),
      ...(rec.health !== undefined ? { health: rec.health } : {}),
    };
  };

  let keptNodes = [...used].map(toNode).filter((n): n is SankeyNode => n !== undefined);

  if (clusterFilter !== undefined) {
    const allowed = new Set(
      keptNodes
        .filter((n) => n.kind === 'pod' || n.kind === 'pvc')
        .filter((n) => n.cluster === clusterFilter)
        .map((n) => n.id)
    );
    if (allowed.size === 0) {
      return { nodes: [], links: [], hasAnyMeasurement };
    }
    // Keep storage tiers that remain connected after pod/pvc filter.
    const nextLinks = links.filter((l) => {
      const src = nodes.get(l.source);
      const dst = nodes.get(l.target);
      if (src?.kind === 'pod' || src?.kind === 'pvc') {
        if (!allowed.has(l.source)) {
          return false;
        }
      }
      if (dst?.kind === 'pod' || dst?.kind === 'pvc') {
        if (!allowed.has(l.target)) {
          return false;
        }
      }
      return true;
    });
    const still = new Set<string>();
    for (const l of nextLinks) {
      still.add(l.source);
      still.add(l.target);
    }
    keptNodes = keptNodes.filter((n) => still.has(n.id));
    const filteredLinks = nextLinks.filter((l) => still.has(l.source) && still.has(l.target));
    return sortSankey({ nodes: keptNodes, links: filteredLinks, hasAnyMeasurement });
  }

  const nodeIds = new Set(keptNodes.map((n) => n.id));
  const keptLinks = links.filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target));
  return sortSankey({ nodes: keptNodes, links: keptLinks, hasAnyMeasurement });
}

function sortSankey(graph: SankeyGraph): SankeyGraph {
  const flow = new Map<string, number>();
  for (const link of graph.links) {
    flow.set(link.source, (flow.get(link.source) ?? 0) + link.value);
    flow.set(link.target, (flow.get(link.target) ?? 0) + link.value);
  }
  const nodes = [...graph.nodes].sort((a, b) => {
    if (a.kind !== b.kind) {
      const order: SankeyKind[] = ['pod', 'pvc', 'netapp-aggr', 'netapp-node'];
      return order.indexOf(a.kind) - order.indexOf(b.kind);
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

export function formatBytesPerSec(value: number): string {
  return `${formatSiBytes(value)}/s`;
}

function formatSiBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'] as const;
  let value = bytes;
  let unit = 0;
  // Promote against the ROUNDED value (see shared/format/measurements formatBytes):
  // 999999 rounds to 3 significant digits as 1000, so a bare `>= 1000` test would render
  // "1000 KB/s" instead of "1 MB/s".
  while (Number(value.toPrecision(3)) >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${String(Number(value.toPrecision(3)))} ${units[unit]}`;
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
