import type cytoscape from 'cytoscape';

import { deriveLegendKinds } from './deriveLegendKinds';

function node(data: Record<string, unknown>): cytoscape.ElementDefinition {
  return { group: 'nodes', data };
}
const NONE = new Set<string>();

describe('deriveLegendKinds', () => {
  it('lists drawn leaves but drops expanded containers (which live in their own swatch section)', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true }),
      node({ id: 'node/w0', kind: 'node', parent: 'cluster/prod' }), // expanded container → dropped
      node({ id: 'pod/a', kind: 'pod', parent: 'node/w0' }), // leaf → listed
      node({ id: 'svc/s', kind: 'service', parent: 'cluster/prod' }), // leaf → listed
    ];
    expect(deriveLegendKinds(els, NONE)).toEqual(['pod', 'service']);
  });

  it('drops a synthesized node group (no kind) entirely, and hides the nodes it folds', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true }),
      node({ id: 'node-group/cluster/prod', isNodeGroup: true, label: 'nodes', parent: 'cluster/prod' }),
      node({ id: 'node/w0', kind: 'node', parent: 'node-group/cluster/prod' }),
      node({ id: 'svc/s', kind: 'service', parent: 'cluster/prod' }),
    ];
    // Expanded: the node is a childless container → a drawn leaf contributing its kind;
    // the group itself contributes nothing (kind-less), exactly like a cluster.
    expect(deriveLegendKinds(els, NONE)).toEqual(['node', 'service']);
    // Collapsed: the group hides its nodes and STILL contributes no kind of its own —
    // it folds to a folder glyph, not a resource icon.
    expect(deriveLegendKinds(els, new Set(['node-group/cluster/prod']))).toEqual(['service']);
  });

  it('drops a cluster (no kind) entirely', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true }),
      node({ id: 'pod/a', kind: 'pod', parent: 'cluster/prod' }),
    ];
    expect(deriveLegendKinds(els, NONE)).toEqual(['pod']);
  });

  it('shows a kind for a childless container (drawn leaf, e.g. controller-mode K8s node)', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true }),
      node({ id: 'node/w0', kind: 'node', parent: 'cluster/prod' }), // no children → leaf → listed
    ];
    expect(deriveLegendKinds(els, NONE)).toEqual(['node']);
  });

  it('swaps netapp-node ⇄ netapp-aggr on collapse: expanded shows the aggregates, collapsed the controller', () => {
    // The one tier where a REAL kind-ful node is a compound parent, so it must behave like
    // any other container here: dropped from the legend while expanded, glyph while folded.
    const els = [
      node({ id: 'storage-cluster/ontap-prod', isStorageCluster: true }),
      node({
        id: 'netapp/ontap-prod/ontap-prod-01',
        kind: 'netapp-node',
        parent: 'storage-cluster/ontap-prod',
      }),
      node({ id: 'netapp/ontap-prod/aggr/a1', kind: 'netapp-aggr', parent: 'netapp/ontap-prod/ontap-prod-01' }),
      node({ id: 'netapp/ontap-prod/aggr/a2', kind: 'netapp-aggr', parent: 'netapp/ontap-prod/ontap-prod-01' }),
    ];
    // Expanded: netapp-node is a container (dropped), its aggregates are visible leaves.
    expect(deriveLegendKinds(els, NONE)).toEqual(['netapp-aggr']);
    // Collapsed: aggregates are aggregated away (collapsed ancestor) → netapp-aggr drops;
    // the collapsed controller renders its glyph → netapp-node takes its place.
    expect(deriveLegendKinds(els, new Set(['netapp/ontap-prod/ontap-prod-01']))).toEqual(['netapp-node']);
  });

  it('drops children of a collapsed K8s node and shows the node kind instead', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true }),
      node({ id: 'node/w0', kind: 'node', parent: 'cluster/prod' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/w0' }),
    ];
    expect(deriveLegendKinds(els, new Set(['node/w0']))).toEqual(['node']);
  });

  it('hides everything inside a collapsed cluster (cluster has no kind/icon)', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true }),
      node({ id: 'node/w0', kind: 'node', parent: 'cluster/prod' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/w0' }),
    ];
    expect(deriveLegendKinds(els, new Set(['cluster/prod']))).toEqual([]);
  });

  it('is deduped and in first-seen order', () => {
    const els = [
      node({ id: 'p1', kind: 'pod' }),
      node({ id: 'e1', kind: 'external' }),
      node({ id: 'p2', kind: 'pod' }),
    ];
    expect(deriveLegendKinds(els, NONE)).toEqual(['pod', 'external']);
  });
});
