import { describe, expect, it } from 'vitest';

import { deriveSankey } from './deriveSankey';
import { layoutSankey } from './layoutSankey';

function el(
  group: 'nodes' | 'edges',
  data: Record<string, unknown>
): { group: 'nodes' | 'edges'; data: Record<string, unknown> } {
  return { group, data };
}

/**
 * Synthetic storage-graph at the spec's performance bound: 5 / 25 / 10 / 500 / 1000 / 100 / 20
 * columns, every pod with a `pod-node` edge and a full parent chain.
 */
function syntheticBody(): Array<{ group: 'nodes' | 'edges'; data: Record<string, unknown> }> {
  const out: Array<{ group: 'nodes' | 'edges'; data: Record<string, unknown> }> = [];
  out.push(el('nodes', { id: 'cluster/c', label: 'c', kind: 'cluster' }));
  for (let n = 0; n < 20; n += 1) {
    out.push(el('nodes', { id: `ns/${String(n)}`, label: `ns-${String(n)}`, kind: 'namespace', parent: 'cluster/c' }));
  }
  for (let a = 0; a < 100; a += 1) {
    const ns = a % 20;
    out.push(
      el('nodes', {
        id: `app/${String(a)}`,
        label: `app-${String(a)}`,
        kind: 'application',
        parent: `ns/${String(ns)}`,
        isApplication: true,
      })
    );
    out.push(
      el('nodes', {
        id: `ctrl/${String(a)}`,
        label: `ctrl-${String(a)}`,
        kind: 'controller',
        parent: `app/${String(a)}`,
        isController: true,
      })
    );
  }
  for (let i = 0; i < 5; i += 1) {
    out.push(el('nodes', { id: `nn/${String(i)}`, label: `nn-${String(i)}`, kind: 'netapp-node' }));
  }
  for (let i = 0; i < 25; i += 1) {
    out.push(el('nodes', { id: `ag/${String(i)}`, label: `ag-${String(i)}`, kind: 'netapp-aggr' }));
  }
  for (let i = 0; i < 10; i += 1) {
    out.push(el('nodes', { id: `sv/${String(i)}`, label: `sv-${String(i)}`, kind: 'netapp-svm' }));
  }
  for (let i = 0; i < 50; i += 1) {
    out.push(el('nodes', { id: `node/${String(i)}`, label: `worker-${String(i)}`, kind: 'node' }));
  }
  for (let i = 0; i < 500; i += 1) {
    out.push(el('nodes', { id: `pvc/${String(i)}`, label: `pvc-${String(i)}`, kind: 'pvc' }));
  }
  for (let i = 0; i < 1000; i += 1) {
    const app = Math.floor(i / 10);
    out.push(
      el('nodes', {
        id: `pod/${String(i)}`,
        label: `pod-${String(i)}`,
        kind: 'pod',
        parent: `ctrl/${String(app)}`,
        namespace: `ns-${String(app % 20)}`,
      })
    );
  }

  const flow = (
    id: string,
    source: string,
    target: string,
    tier: string
  ): { group: 'edges'; data: Record<string, unknown> } => ({
    group: 'edges',
    data: {
      id,
      source,
      target,
      edgeType: 'storage-flow',
      labels: { tier },
      metrics: { readBytesPerSec: 1000 + (id.length % 50), writeBytesPerSec: 100 },
    },
  });

  for (let i = 0; i < 25; i += 1) {
    out.push(flow(`na-${String(i)}`, `nn/${String(i % 5)}`, `ag/${String(i)}`, 'node-aggr'));
  }
  for (let a = 0; a < 25; a += 1) {
    for (let s = 0; s < 10; s += 1) {
      out.push(flow(`as-${String(a)}-${String(s)}`, `ag/${String(a)}`, `sv/${String(s)}`, 'aggr-svm'));
    }
  }
  for (let i = 0; i < 500; i += 1) {
    out.push(flow(`sp-${String(i)}`, `sv/${String(i % 10)}`, `pvc/${String(i)}`, 'svm-pvc'));
  }
  for (let i = 0; i < 1000; i += 1) {
    out.push(flow(`pp-${String(i)}`, `pvc/${String(Math.floor(i / 2))}`, `pod/${String(i)}`, 'pvc-pod'));
    out.push(flow(`pn-${String(i)}`, `pod/${String(i)}`, `node/${String(i % 50)}`, 'pod-node'));
  }
  return out;
}

describe('Sankey performance bound', () => {
  it('first Flat draw of the synthetic body is within 1000 ms at seven-column counts, Node switch within 500 ms', () => {
    const elements = syntheticBody();
    const t0 = performance.now();
    const graph = deriveSankey(elements, 'both');
    const flat = layoutSankey(graph, ['#111', '#222', '#333', '#444', '#555'], 'flat');
    const first = performance.now() - t0;
    expect(first).toBeLessThanOrEqual(1000);

    const count = (kind: string): number => graph.nodes.filter((n) => n.kind === kind).length;
    expect(count('netapp-node')).toBe(5);
    expect(count('netapp-aggr')).toBe(25);
    expect(count('netapp-svm')).toBe(10);
    expect(count('pvc')).toBe(500);
    expect(count('pod')).toBe(1000);
    expect(count('application')).toBe(100);
    expect(count('namespace')).toBe(20);
    expect(flat.columns).toHaveLength(7);

    const t1 = performance.now();
    const grouped = layoutSankey(graph, ['#111', '#222', '#333', '#444', '#555'], 'node');
    expect(performance.now() - t1).toBeLessThanOrEqual(500);
    expect(grouped.wrappers).toHaveLength(50);
  }, 15_000);
});
