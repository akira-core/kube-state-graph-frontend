import { describe, expect, it } from 'vitest';

import { SHOWCASE_STORAGE_GRAPH } from '../../shared/fixtures/showcaseStorageGraph';
import { EMPTY_STORAGE_GRAPH_ROOTS, normalizeGraph } from '../graph-data';
import { matchRecords } from '../graph-search';

import { deriveSankey, hoverPathLinksMany } from './deriveSankey';
import { layoutSankey, linkKey } from './layoutSankey';
import { sankeyCardRects, sankeyPathLit, sankeySearchRecords } from './sankeySearch';

const { elements } = normalizeGraph(SHOWCASE_STORAGE_GRAPH);
const PALETTE = ['#111', '#222', '#333', '#444', '#555'];

describe('sankeySearchRecords', () => {
  it('covers every drawn card, and wrappers only where the layout draws them', () => {
    const graph = deriveSankey(elements, 'both');
    const flat = layoutSankey(graph, PALETTE, 'flat');
    const flatIds = sankeySearchRecords(graph, flat).map((r) => r.id);
    expect(flatIds).toEqual(flat.nodes.map((n) => n.id));

    const byNode = layoutSankey(graph, PALETTE, 'node');
    const nodeRecords = sankeySearchRecords(graph, byNode);
    expect(nodeRecords.filter((r) => r.kind === 'node').map((r) => r.label)).toEqual(
      expect.arrayContaining(['worker-0', 'worker-1'])
    );
  });

  it('matches by NetApp cluster and names that field when the label did not match', () => {
    const graph = deriveSankey(elements, 'both');
    const records = sankeySearchRecords(graph, layoutSankey(graph, PALETTE, 'flat'));
    const aggr1 = matchRecords(records, 'ontap-prod aggr1').results;
    expect(aggr1.map((r) => r.label)).toEqual(['aggr1']);
    expect(aggr1[0]?.context).toEqual({ cluster: 'ontap-prod' });
    const svm = matchRecords(records, 'netapp-svm').results;
    expect(svm.map((r) => r.label)).toEqual(expect.arrayContaining(['svm_jobs', 'svm_shop']));
    expect(svm[0]?.matchedField?.field).toBe('kind');
    // A PVC's raw `svm` label is display text, not a search field: the SVM query lists SVMs only.
    expect(matchRecords(records, 'svm_shop').results.map((r) => r.kind)).toEqual(['netapp-svm']);
  });

  it('searches SVM frames under the Group display', () => {
    const graph = deriveSankey(elements, 'both', EMPTY_STORAGE_GRAPH_ROOTS, 'group');
    const layout = layoutSankey(graph, PALETTE, 'flat', 'group');
    const hits = matchRecords(sankeySearchRecords(graph, layout), 'svm_shop').results;
    expect(hits.map((r) => r.kind)).toEqual(['netapp-svm']);
    expect(sankeyCardRects(layout).get(hits[0]!.id)).toBeDefined();
  });
});

describe('sankeyPathLit', () => {
  it('is the hover highlight of one card, and keeps a pathless card lit', () => {
    const graph = deriveSankey(elements, 'both');
    const aggr1 = graph.nodes.find((n) => n.label === 'aggr1')!;
    const lit = sankeyPathLit(graph, [aggr1.id]);
    expect(lit.keys).toEqual(
      new Set(hoverPathLinksMany(graph, [aggr1.id]).map((l) => linkKey(l.source, l.target, l.direction, l.tier)))
    );
    expect(lit.nodeIds.has(aggr1.id)).toBe(true);
    expect(sankeyPathLit(graph, ['not-a-card'])).toEqual({ keys: new Set(), nodeIds: new Set(['not-a-card']) });
    expect(sankeyPathLit(graph, [])).toEqual({ keys: new Set(), nodeIds: new Set() });
  });

  it('lights a wrapper through its member pods', () => {
    const graph = deriveSankey(elements, 'both');
    const worker0 = graph.k8sNodes.find((k) => k.label === 'worker-0')!;
    const lit = sankeyPathLit(graph, [worker0.id]);
    expect(lit.nodeIds.has(worker0.id)).toBe(true);
    expect(lit.keys.size).toBe(hoverPathLinksMany(graph, worker0.podIds).length);
  });
});
