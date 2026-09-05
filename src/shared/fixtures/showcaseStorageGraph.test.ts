import type cytoscape from 'cytoscape';

import { normalizeGraph } from '../../features/graph-data/normalize';

import { SHOWCASE_GRAPH } from './showcaseGraph';
import { SHOWCASE_STORAGE_GRAPH } from './showcaseStorageGraph';

describe('SHOWCASE_STORAGE_GRAPH', () => {
  const { elements, errors } = normalizeGraph(SHOWCASE_STORAGE_GRAPH);
  const graphIds = new Set(SHOWCASE_GRAPH.elements.nodes.map((n) => n.data.id).filter((id) => typeof id === 'string'));
  const nodes = elements.filter((el) => el.group === 'nodes').map((el) => el.data as cytoscape.NodeDataDefinition);
  const edges = elements.filter((el) => el.group === 'edges').map((el) => el.data as cytoscape.EdgeDataDefinition);

  it('parses with no errors', () => {
    expect(errors).toEqual([]);
  });

  it('keeps pod / pvc / netapp ids that exist in the graph fixture (SVM excepted)', () => {
    const missing = nodes
      .filter((n) => n.kind === 'pod' || n.kind === 'pvc' || n.kind === 'netapp-aggr' || n.kind === 'netapp-node')
      .map((n) => n.id as string)
      .filter((id) => !graphIds.has(id));
    expect(missing).toEqual([]);
    expect(nodes.some((n) => n.kind === 'netapp-svm' && !graphIds.has(n.id as string))).toBe(true);
  });

  it('conserves storage-flow weights per intermediate node', () => {
    const io = (metrics: cytoscape.EdgeDataDefinition['metrics']): { read: number; write: number } => {
      if (metrics === undefined || 'rate' in metrics) {
        return { read: 0, write: 0 };
      }
      return { read: metrics.readBytesPerSec ?? 0, write: metrics.writeBytesPerSec ?? 0 };
    };
    const inflow = new Map<string, { read: number; write: number }>();
    const outflow = new Map<string, { read: number; write: number }>();
    const add = (
      map: Map<string, { read: number; write: number }>,
      id: string,
      delta: { read: number; write: number }
    ): void => {
      const cur = map.get(id) ?? { read: 0, write: 0 };
      map.set(id, { read: cur.read + delta.read, write: cur.write + delta.write });
    };
    for (const edge of edges) {
      expect(edge.edgeType).toBe('storage-flow');
      const weight = io(edge.metrics);
      add(outflow, edge.source, weight);
      add(inflow, edge.target, weight);
    }
    const both = [...new Set([...inflow.keys(), ...outflow.keys()])].filter((id) => inflow.has(id) && outflow.has(id));
    for (const id of both) {
      expect(inflow.get(id), id).toEqual(outflow.get(id));
    }
  });

  it('covers all five storage-flow tiers, a split pvc-pod, a FlexGroup svm-pvc, and hardware/perf', () => {
    const tiers = new Set(edges.map((e) => e.labels?.tier));
    expect(tiers).toEqual(new Set(['node-aggr', 'aggr-svm', 'svm-pvc', 'pvc-pod', 'pod-node']));
    expect(edges.some((e) => e.labels?.attribution === 'split' && e.labels.tier === 'pvc-pod')).toBe(true);
    const scratch = edges.find((e) => e.target === 'pvc/data-scratch');
    expect(scratch?.labels?.tier).toBe('svm-pvc');
    expect(edges.some((e) => e.target === 'pvc/data-scratch' && e.labels?.tier === 'aggr-svm')).toBe(false);
    const controller = nodes.find((n) => n.id === 'netapp/ontap-prod/ontap-prod-02');
    expect(controller?.hardware?.model).toBe('AFF-A400');
    expect(controller?.perf?.cpuBusyPct).toBe(41.2);
  });
});
