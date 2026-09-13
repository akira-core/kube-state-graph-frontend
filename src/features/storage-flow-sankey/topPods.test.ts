import { describe, expect, it } from 'vitest';

import { SHOWCASE_STORAGE_GRAPH } from '../../shared/fixtures/showcaseStorageGraph';
import { normalizeGraph } from '../graph-data';

import { syntheticBody } from './sankeyPerformance.test';
import { cutTopPods } from './topPods';

function idsOf(elements: ReadonlyArray<{ group?: string; data: Record<string, unknown> }>, kind: string): string[] {
  return elements
    .filter((el) => el.group === 'nodes' && el.data.kind === kind)
    .map((el) => String(el.data.id))
    .sort();
}

function edgeMetrics(elements: ReadonlyArray<{ group?: string; data: Record<string, unknown> }>): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const el of elements) {
    if (el.group !== 'edges') {
      continue;
    }
    out.set(String(el.data.id), el.data.metrics);
  }
  return out;
}

describe('cutTopPods', () => {
  it('keeps 10 highest-inflow pods on the performance fixture and does not mutate input', () => {
    const input = syntheticBody();
    const beforeLen = input.length;
    const first = input[0];
    const cut = cutTopPods(input, 'both', 10);
    expect(input).toHaveLength(beforeLen);
    expect(input[0]).toBe(first);
    expect(cut.shown).toBe(10);
    expect(cut.total).toBe(1000);
    expect(idsOf(cut.elements, 'pod')).toHaveLength(10);
    const before = edgeMetrics(input);
    for (const el of cut.elements) {
      if (el.group !== 'edges') {
        continue;
      }
      const id = String(el.data.id);
      expect(el.data.metrics).toEqual(before.get(id));
    }
    const keptPods = new Set(idsOf(cut.elements, 'pod'));
    const keptPvc = new Set(idsOf(cut.elements, 'pvc'));
    for (const el of cut.elements) {
      if (el.group !== 'edges' || el.data.labels === undefined) {
        continue;
      }
      const tier = (el.data.labels as { tier?: string }).tier;
      if (tier === 'pvc-pod') {
        expect(keptPods.has(String(el.data.target))).toBe(true);
        expect(keptPvc.has(String(el.data.source))).toBe(true);
      }
    }
  });

  it('is identity when k is at least the ranked total', () => {
    const input = syntheticBody();
    const first = input[0];
    const cut = cutTopPods(input, 'both', 1000);
    expect(cut.shown).toBe(1000);
    expect(cut.total).toBe(1000);
    expect(idsOf(cut.elements, 'pod')).toHaveLength(1000);
    expect(idsOf(cut.elements, 'pvc')).toHaveLength(500);
    expect(cut.elements).toHaveLength(input.length);
    expect(input[0]).toBe(first);
  });

  it('re-ranks when the mode changes', () => {
    const elements = [
      { group: 'nodes' as const, data: { id: 'pvc/a', label: 'a', kind: 'pvc' } },
      { group: 'nodes' as const, data: { id: 'pod/batch-7', label: 'batch-7', kind: 'pod' } },
      { group: 'nodes' as const, data: { id: 'pod/other', label: 'other', kind: 'pod' } },
      {
        group: 'edges' as const,
        data: {
          id: 'e1',
          source: 'pvc/a',
          target: 'pod/batch-7',
          edgeType: 'storage-flow',
          labels: { tier: 'pvc-pod' },
          metrics: { readBytesPerSec: 1, writeBytesPerSec: 1000 },
        },
      },
      {
        group: 'edges' as const,
        data: {
          id: 'e2',
          source: 'pvc/a',
          target: 'pod/other',
          edgeType: 'storage-flow',
          labels: { tier: 'pvc-pod' },
          metrics: { readBytesPerSec: 1000, writeBytesPerSec: 1 },
        },
      },
    ];
    const write = cutTopPods(elements, 'write', 1);
    expect(idsOf(write.elements, 'pod')).toEqual(['pod/batch-7']);
    const read = cutTopPods(elements, 'read', 1);
    expect(idsOf(read.elements, 'pod')).toEqual(['pod/other']);
  });

  describe('claim-aware aggregate keeping', () => {
    const { elements } = normalizeGraph(SHOWCASE_STORAGE_GRAPH);

    it('the cut keeps only the kept claims’ aggregates', () => {
      const cut = cutTopPods(elements, 'both', 1);
      expect(idsOf(cut.elements, 'pod')).toEqual(['pod/mongo-0']);
      expect(idsOf(cut.elements, 'netapp-aggr')).toEqual(['netapp/ontap-prod/aggr/aggr1']);
      expect(idsOf(cut.elements, 'netapp-node')).toEqual(['netapp/ontap-prod/ontap-prod-01']);
      expect(idsOf(cut.elements, 'pvc')).toEqual(['pvc/data-mongo-0', 'pvc/data-scratch']);
      // svm_shop stays drawn even though aggr2 (dropped) also feeds it.
      expect(idsOf(cut.elements, 'netapp-svm')).toContain('netapp/ontap-prod/svm/svm_shop');
      const edgeEndpoints = cut.elements
        .filter((el) => el.group === 'edges')
        .flatMap((el) => [
          String((el.data as Record<string, unknown>).source),
          String((el.data as Record<string, unknown>).target),
        ]);
      expect(edgeEndpoints).not.toContain('netapp/ontap-prod/aggr/aggr2');
      expect(edgeEndpoints).not.toContain('netapp/ontap-prod/ontap-prod-02');
    });

    it('keeps every aggregate feeding a kept SVM when the body carries no claim aggregate labels', () => {
      const stripped = elements.map((el) => {
        if (el.group !== 'nodes') {
          return el;
        }
        const data = el.data as Record<string, unknown>;
        const labels = data.labels as Record<string, string> | undefined;
        if (labels?.aggr === undefined) {
          return el;
        }
        const rest = Object.fromEntries(Object.entries(labels).filter(([key]) => key !== 'aggr'));
        return { ...el, data: { ...data, labels: rest } };
      });
      const cut = cutTopPods(stripped, 'both', 1);
      expect(idsOf(cut.elements, 'netapp-aggr')).toEqual([
        'netapp/ontap-prod/aggr/aggr1',
        'netapp/ontap-prod/aggr/aggr2',
      ]);
    });
  });

  it('leaves a no-flow pod untouched', () => {
    const elements = [
      { group: 'nodes' as const, data: { id: 'pvc/a', label: 'a', kind: 'pvc' } },
      { group: 'nodes' as const, data: { id: 'pod/hot', label: 'hot', kind: 'pod' } },
      { group: 'nodes' as const, data: { id: 'pod/quiet', label: 'quiet', kind: 'pod' } },
      {
        group: 'edges' as const,
        data: {
          id: 'e1',
          source: 'pvc/a',
          target: 'pod/hot',
          edgeType: 'storage-flow',
          labels: { tier: 'pvc-pod' },
          metrics: { readBytesPerSec: 50, writeBytesPerSec: 50 },
        },
      },
    ];
    const cut = cutTopPods(elements, 'both', 1);
    expect(idsOf(cut.elements, 'pod').sort()).toEqual(['pod/hot', 'pod/quiet']);
    expect(cut.total).toBe(1);
    expect(cut.shown).toBe(1);
  });
});
