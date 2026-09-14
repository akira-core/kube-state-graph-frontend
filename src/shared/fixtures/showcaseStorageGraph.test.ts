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

  const io = (metrics: cytoscape.EdgeDataDefinition['metrics']): { read: number; write: number } => {
    if (metrics === undefined || 'rate' in metrics) {
      return { read: 0, write: 0 };
    }
    return { read: metrics.readBytesPerSec ?? 0, write: metrics.writeBytesPerSec ?? 0 };
  };
  const flowByNode = (): {
    inflow: Map<string, { read: number; write: number }>;
    outflow: Map<string, { read: number; write: number }>;
  } => {
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
    return { inflow, outflow };
  };

  it('conserves storage-flow weights per intermediate node, except an SVM holding a FlexGroup claim', () => {
    const { inflow, outflow } = flowByNode();
    const both = [...new Set([...inflow.keys(), ...outflow.keys()])].filter((id) => inflow.has(id) && outflow.has(id));
    for (const id of both) {
      // A FlexGroup claim's flow enters an SVM only at the `svm-pvc` tier, with no
      // `node-aggr` / `aggr-svm` hop behind it — the SVM is the one node this invariant
      // does not hold for.
      if (nodes.find((n) => n.id === id)?.kind === 'netapp-svm') {
        continue;
      }
      expect(inflow.get(id), id).toEqual(outflow.get(id));
    }
  });

  it('an SVM holding a FlexGroup claim is in ≠ out by exactly that claim’s flow', () => {
    const { inflow, outflow } = flowByNode();
    const svmShop = inflow.get('netapp/ontap-prod/svm/svm_shop');
    const svmShopOut = outflow.get('netapp/ontap-prod/svm/svm_shop');
    const scratch = edges.find((e) => e.target === 'pvc/data-scratch');
    const scratchFlow = io(scratch?.metrics);
    expect(svmShop).toBeDefined();
    expect(svmShopOut).toBeDefined();
    expect(svmShopOut!.read - svmShop!.read).toBe(scratchFlow.read);
    expect(svmShopOut!.write - svmShop!.write).toBe(scratchFlow.write);
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

  // dev-environment spec: "The storage fixture reports claim aggregates"
  it('reports a claim aggregate for every claim on an aggregate, and none for the FlexGroup claim', () => {
    const mongo0 = nodes.find((n) => n.id === 'pvc/data-mongo-0');
    const mongo1 = nodes.find((n) => n.id === 'pvc/data-mongo-1');
    const scratch = nodes.find((n) => n.id === 'pvc/data-scratch');
    expect(mongo0?.labels?.aggr).toBe('netapp/ontap-prod/aggr/aggr1');
    expect(mongo1?.labels?.aggr).toBe('netapp/ontap-prod/aggr/aggr2');
    expect(scratch?.labels?.aggr).toBeUndefined();
    const aggrIds = new Set(nodes.filter((n) => n.kind === 'netapp-aggr').map((n) => n.id));
    expect(aggrIds.has(mongo0!.labels!.aggr as string)).toBe(true);
    expect(aggrIds.has(mongo1!.labels!.aggr as string)).toBe(true);

    const inboundToSvmShop = edges.filter(
      (e) => e.target === 'netapp/ontap-prod/svm/svm_shop' && e.labels?.tier === 'aggr-svm'
    );
    expect(inboundToSvmShop.map((e) => e.source).sort()).toEqual([
      'netapp/ontap-prod/aggr/aggr1',
      'netapp/ontap-prod/aggr/aggr2',
    ]);

    // aggr1's two hops must read exactly `data-mongo-0`'s own svm-pvc weight — not that
    // weight plus `data-scratch`'s, which would mean the FlexGroup claim's flow leaked
    // into an aggregate hop it never passes through.
    const mongo0Flow = io(edges.find((e) => e.target === 'pvc/data-mongo-0' && e.labels?.tier === 'svm-pvc')?.metrics);
    const nodeAggr1 = edges.find((e) => e.labels?.tier === 'node-aggr' && e.target === 'netapp/ontap-prod/aggr/aggr1');
    const aggr1Svm = edges.find((e) => e.labels?.tier === 'aggr-svm' && e.source === 'netapp/ontap-prod/aggr/aggr1');
    expect(io(nodeAggr1?.metrics).read).toBe(mongo0Flow.read);
    expect(io(aggr1Svm?.metrics).read).toBe(mongo0Flow.read);
  });
});
