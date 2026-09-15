import type cytoscape from 'cytoscape';

import { recKind } from '../graph-data';

import { resolveClaimAggregates, type SankeyMode } from './deriveSankey';

export const DEFAULT_TOP_PODS = 10;

const DRAWN_TIERS = new Set(['node-aggr', 'aggr-svm', 'svm-pvc', 'pvc-pod']);

export interface TopPodsCut {
  elements: cytoscape.ElementDefinition[];
  shown: number;
  total: number;
}

function asId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function metricValue(metrics: cytoscape.EdgeIoMetrics | undefined, mode: SankeyMode): number {
  if (metrics === undefined || 'rate' in metrics) {
    return 0;
  }
  const read =
    typeof metrics.readBytesPerSec === 'number' && Number.isFinite(metrics.readBytesPerSec)
      ? metrics.readBytesPerSec
      : 0;
  const write =
    typeof metrics.writeBytesPerSec === 'number' && Number.isFinite(metrics.writeBytesPerSec)
      ? metrics.writeBytesPerSec
      : 0;
  if (mode === 'read') {
    return read;
  }
  if (mode === 'write') {
    return write;
  }
  return read + write;
}

function ioMetrics(data: cytoscape.EdgeDataDefinition): cytoscape.EdgeIoMetrics | undefined {
  const metrics = data.metrics;
  if (metrics === undefined || 'rate' in metrics) {
    return undefined;
  }
  return metrics;
}

interface FlowEdge {
  source: string;
  target: string;
  tier: string;
  metrics: cytoscape.EdgeIoMetrics | undefined;
}

/**
 * Walks backward from `pods` to every storage node on a path to one of them. The `svm`
 * hop is unconditional — an SVM feeding a kept pvc always stays drawn under `Column`. The
 * `aggr` hop is claim-aware (design D5): when the body reports claim aggregates, an
 * aggregate is kept only when it is a KEPT pvc's own claim aggregate — never merely
 * because it feeds a kept SVM, which may also hold a claim on a different aggregate.
 * Otherwise (no claim aggregates reported) every aggregate feeding a kept SVM is kept,
 * which is all such a body can say.
 */
function reverseFrom(
  pods: ReadonlySet<string>,
  edges: readonly FlowEdge[],
  claimAggregates: ReadonlyMap<string, string>
): Set<string> {
  const keptPods = pods;
  const pvc = new Set<string>();
  for (const edge of edges) {
    if (edge.tier === 'pvc-pod' && keptPods.has(edge.target)) {
      pvc.add(edge.source);
    }
  }
  const svm = new Set<string>();
  for (const edge of edges) {
    if (edge.tier === 'svm-pvc' && pvc.has(edge.target)) {
      svm.add(edge.source);
    }
  }
  const reportsClaimAggregates = edges.some((edge) => edge.tier === 'svm-pvc' && claimAggregates.has(edge.target));
  const aggr = new Set<string>();
  if (reportsClaimAggregates) {
    for (const pvcId of pvc) {
      const claimAggr = claimAggregates.get(pvcId);
      if (claimAggr !== undefined) {
        aggr.add(claimAggr);
      }
    }
  } else {
    for (const edge of edges) {
      if (edge.tier === 'aggr-svm' && svm.has(edge.target)) {
        aggr.add(edge.source);
      }
    }
  }
  const nn = new Set<string>();
  for (const edge of edges) {
    if (edge.tier === 'node-aggr' && aggr.has(edge.target)) {
      nn.add(edge.source);
    }
  }
  return new Set([...pvc, ...svm, ...aggr, ...nn]);
}

/**
 * Keep the K pods with the highest inbound pvc-pod flow in `mode`, plus everything on a
 * path to them. No-flow pods and every non-storage element pass through. Never mutates
 * `elements` or any member.
 */
export function cutTopPods(elements: readonly cytoscape.ElementDefinition[], mode: SankeyMode, k: number): TopPodsCut {
  const keep = Number.isFinite(k) ? Math.max(1, Math.floor(k)) : DEFAULT_TOP_PODS;
  const nodes = new Map<string, { kind: string; label: string }>();
  const flowEdges: FlowEdge[] = [];

  for (const el of elements) {
    if (el.group === 'nodes') {
      const d = el.data as cytoscape.NodeDataDefinition;
      const id = asId(d.id);
      if (id === undefined) {
        continue;
      }
      nodes.set(id, { kind: recKind(d), label: typeof d.label === 'string' ? d.label : id });
      continue;
    }
    if (el.group !== 'edges') {
      continue;
    }
    const d = el.data as cytoscape.EdgeDataDefinition;
    if (d.edgeType !== 'storage-flow') {
      continue;
    }
    const source = asId(d.source);
    const target = asId(d.target);
    const tier = d.labels?.tier;
    if (source === undefined || target === undefined || typeof tier !== 'string' || !DRAWN_TIERS.has(tier)) {
      continue;
    }
    flowEdges.push({ source, target, tier, metrics: ioMetrics(d) });
  }

  const ranked = new Map<string, number>();
  for (const edge of flowEdges) {
    if (edge.tier !== 'pvc-pod') {
      continue;
    }
    ranked.set(edge.target, (ranked.get(edge.target) ?? 0) + metricValue(edge.metrics, mode));
  }

  const ordered = [...ranked.keys()].sort((a, b) => {
    const diff = (ranked.get(b) ?? 0) - (ranked.get(a) ?? 0);
    if (diff !== 0) {
      return diff;
    }
    const la = nodes.get(a)?.label ?? a;
    const lb = nodes.get(b)?.label ?? b;
    return la.localeCompare(lb);
  });
  const total = ordered.length;
  const keptRanked = new Set(ordered.slice(0, Math.min(keep, total)));
  const droppedRanked = new Set(ordered.slice(keptRanked.size));

  const claimAggregates = resolveClaimAggregates(elements);
  const storageOnAny = reverseFrom(new Set(ordered), flowEdges, claimAggregates);
  const storageOnKept = reverseFrom(keptRanked, flowEdges, claimAggregates);
  const drop = new Set<string>(droppedRanked);
  for (const id of storageOnAny) {
    if (!storageOnKept.has(id)) {
      drop.add(id);
    }
  }

  const next: cytoscape.ElementDefinition[] = [];
  for (const el of elements) {
    if (el.group === 'nodes') {
      const id = asId((el.data as cytoscape.NodeDataDefinition).id);
      if (id !== undefined && drop.has(id)) {
        continue;
      }
      next.push(el);
      continue;
    }
    if (el.group === 'edges') {
      const d = el.data as cytoscape.EdgeDataDefinition;
      const source = asId(d.source);
      const target = asId(d.target);
      if ((source !== undefined && drop.has(source)) || (target !== undefined && drop.has(target))) {
        continue;
      }
      next.push(el);
      continue;
    }
    next.push(el);
  }

  return { elements: next, shown: keptRanked.size, total };
}
