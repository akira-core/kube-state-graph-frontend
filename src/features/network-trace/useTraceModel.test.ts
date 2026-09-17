import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SHOWCASE_TRACE } from '../../shared/fixtures/showcaseTrace';
import { normalizeGraph } from '../graph-data';

import { useTraceModel, type TraceModelInputs } from './useTraceModel';

/** Two switches; the start reports the delta on its inbound side. */
const twoSwitches = normalizeGraph({
  elements: {
    nodes: [
      {
        data: {
          id: 'sw-a',
          name: 'A',
          type: 'switch',
          investigation: { iface: 'et-0/0/1', delta_bps: 10_000_000_000, direction: 'in' },
        },
      },
      { data: { id: 'sw-b', name: 'B', type: 'switch' } },
    ],
    edges: [
      {
        data: {
          id: 'e0',
          type: 'network-flow',
          source: 'sw-a',
          target: 'sw-b',
          labels: { source_iface: 'et-0/0/2', target_iface: 'et-1/0/1' },
          metrics: { delta_bps: 10_000_000_000 },
        },
      },
    ],
  },
}).elements;

describe('useTraceModel', () => {
  it('warns when the start reports the other direction than the query asked for, and still draws', () => {
    const { result } = renderHook(() =>
      useTraceModel({ elements: twoSwitches, trackDir: 'source', minBps: 0, grouping: 'none' })
    );
    expect(result.current.direction.warning).toContain('reports direction "in" (destination)');
    expect(result.current.direction.warning).toContain('asked for source');
    expect(result.current.model.ok).toBe(true);
  });

  it('carries no direction warning when the start agrees with the query', () => {
    const { result } = renderHook(() =>
      useTraceModel({ elements: twoSwitches, trackDir: 'destination', minBps: 0, grouping: 'none' })
    );
    expect(result.current.direction.warning).toBeUndefined();
  });

  it('warns when the response named no investigated interface, and still draws without an anchor', () => {
    // The backend is allowed to answer without `investigation`: the direction is then purely
    // what was asked. The drawing loses its anchor card, which the reader has to be told.
    const anonymous = normalizeGraph({
      elements: {
        nodes: [
          { data: { id: 'sw-a', name: 'A', type: 'switch' } },
          { data: { id: 'sw-b', name: 'B', type: 'switch' } },
        ],
        edges: [
          {
            data: {
              id: 'e0',
              type: 'network-flow',
              source: 'sw-a',
              target: 'sw-b',
              labels: { source_iface: 'et-0/0/2', target_iface: 'et-1/0/1' },
              metrics: { delta_bps: 10_000_000_000 },
            },
          },
        ],
      },
    }).elements;
    const { result } = renderHook(() =>
      useTraceModel({ elements: anonymous, trackDir: 'destination', minBps: 0, grouping: 'none' })
    );
    expect(result.current.direction.warning).toBe(
      'The response named no investigated interface; the trace is drawn without an anchor card.'
    );
    expect(result.current.direction.direction).toBe('destination');
    expect(result.current.model.ok).toBe(true);
    if (result.current.model.ok) {
      expect(result.current.model.nodes.some((n) => n.kind === 'anchor')).toBe(false);
    }
  });

  it('Derivation does not change the source data', () => {
    const elements = normalizeGraph(SHOWCASE_TRACE).elements;
    const before = structuredClone(elements);
    for (const trackDir of ['destination', 'source'] as const) {
      for (const minBps of [0, 5e8]) {
        for (const grouping of ['none', 'cluster'] as const) {
          renderHook(() => useTraceModel({ elements, trackDir, minBps, grouping }));
        }
      }
    }
    expect(elements).toEqual(before);
  });

  it('keeps the model identity across a render with the same inputs', () => {
    const elements = normalizeGraph(SHOWCASE_TRACE).elements;
    const { result, rerender } = renderHook((props: TraceModelInputs) => useTraceModel(props), {
      initialProps: { elements, trackDir: 'destination', minBps: 0, grouping: 'none' },
    });
    const first = result.current.model;
    rerender({ elements, trackDir: 'destination', minBps: 0, grouping: 'none' });
    expect(result.current.model).toBe(first);
  });
});
