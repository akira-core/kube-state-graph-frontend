import { renderHook } from '@testing-library/react';
import type cytoscape from 'cytoscape';
import { describe, expect, it } from 'vitest';

import { SHOWCASE_STORAGE_GRAPH } from '../../shared/fixtures/showcaseStorageGraph';
import { EMPTY_STORAGE_GRAPH_ROOTS, normalizeGraph } from '../graph-data';

import { syntheticBody } from './sankeyPerformance.test';
import { DEFAULT_TOP_PODS } from './sankeyUrlScope';
import { useSankeyProjection, type SankeyProjectionInputs } from './useSankeyProjection';

const { elements: fixture } = normalizeGraph(SHOWCASE_STORAGE_GRAPH);

function podsOf(elements: readonly cytoscape.ElementDefinition[]): number {
  return elements.filter((el) => el.group === 'nodes' && (el.data as { kind?: string }).kind === 'pod').length;
}

/** The fixture's PVCs stripped of `labels.aggr` — a body from a backend without `expose-claim-aggregate`. */
function withoutClaimAggregates(): cytoscape.ElementDefinition[] {
  return fixture.map((el) => {
    const labels = (el.data as cytoscape.NodeDataDefinition).labels;
    if (el.group !== 'nodes' || labels?.aggr === undefined) {
      return el;
    }
    const rest = Object.fromEntries(Object.entries(labels).filter(([key]) => key !== 'aggr'));
    return { ...el, data: { ...el.data, labels: rest } };
  });
}

function project(inputs: Partial<SankeyProjectionInputs> = {}): ReturnType<typeof useSankeyProjection> {
  const { result } = renderHook(() =>
    useSankeyProjection({
      elements: fixture,
      mode: 'both',
      topPods: DEFAULT_TOP_PODS,
      roots: EMPTY_STORAGE_GRAPH_ROOTS,
      ...inputs,
    })
  );
  return result.current;
}

describe('useSankeyProjection', () => {
  it('The default cut bounds a large body', () => {
    const body = syntheticBody();
    const projection = project({ elements: body });
    expect(podsOf(projection.elements)).toBe(10);
    expect(projection.podCut).toEqual({ shown: 10, total: 1000 });
  });

  it('A pod root disables the cut', () => {
    const body = syntheticBody();
    const projection = project({
      elements: body,
      topPods: 1,
      roots: { ...EMPTY_STORAGE_GRAPH_ROOTS, pod: ['shop/orders-0'] },
    });
    expect(projection.elements).toBe(body);
    expect(projection.podCut).toBeUndefined();
  });

  it('K beyond the pod count hides nothing', () => {
    const projection = project({ topPods: 10 });
    expect(podsOf(projection.elements)).toBe(podsOf(fixture));
    expect(podsOf(fixture)).toBeLessThan(10);
    expect(projection.podCut).toBeUndefined();
  });

  it('offers Group when the body reports claim aggregates, and withholds it when it does not', () => {
    expect(project().svmAvailable).toBe(true);
    expect(project({ elements: withoutClaimAggregates() }).svmAvailable).toBe(false);
    // Nothing on the svm-pvc tier is nothing to withhold.
    expect(project({ elements: [] }).svmAvailable).toBe(true);
  });

  it('keeps its answer identity across a render with the same inputs', () => {
    const inputs: SankeyProjectionInputs = {
      elements: fixture,
      mode: 'both',
      topPods: 1,
      roots: EMPTY_STORAGE_GRAPH_ROOTS,
    };
    const { result, rerender } = renderHook((props: SankeyProjectionInputs) => useSankeyProjection(props), {
      initialProps: inputs,
    });
    const first = result.current;
    rerender({ ...inputs });
    expect(result.current.elements).toBe(first.elements);
    expect(result.current.podCut).toBe(first.podCut);
  });
});
