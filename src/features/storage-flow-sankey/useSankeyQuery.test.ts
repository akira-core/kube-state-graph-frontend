import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSankeyQuery } from './useSankeyQuery';

describe('useSankeyQuery', () => {
  it('auto-selects a dimension when it has exactly one option', () => {
    const { result } = renderHook(() => useSankeyQuery({ az: ['local-a'], env: ['demo'], cluster: [], namespace: [] }));
    expect(result.current.query.az).toBe('local-a');
    expect(result.current.query.env).toBe('demo');
    expect(result.current.azEnvReady).toBe(true);
  });

  it('does not auto-select when there are zero or several options', () => {
    const { result } = renderHook(() => useSankeyQuery({ az: ['a', 'b'], env: [], cluster: [], namespace: [] }));
    expect(result.current.query.az).toBeUndefined();
    expect(result.current.query.env).toBeUndefined();
    expect(result.current.azEnvReady).toBe(false);
  });

  it('clears a selection that disappeared from the options', () => {
    const { result, rerender } = renderHook(
      ({ az }: { az: string[] }) => useSankeyQuery({ az, env: ['demo'], cluster: [], namespace: [] }),
      { initialProps: { az: ['zone-b'] } }
    );
    expect(result.current.query.az).toBe('zone-b');
    rerender({ az: ['zone-a'] });
    expect(result.current.query.az).toBeUndefined();
  });

  it('rejects an invalid pod root in place and keeps other roots', () => {
    const { result } = renderHook(() => useSankeyQuery({ az: ['a'], env: ['b'], cluster: [], namespace: [] }));
    act(() => {
      expect(result.current.addRoot('aggr', 'aggr1')).toBe(true);
      expect(result.current.addRoot('pod', 'orders-0')).toBe(false);
    });
    expect(result.current.query.roots.aggr).toEqual(['aggr1']);
    expect(result.current.query.roots.pod).toEqual([]);
    expect(result.current.podError).toMatch(/namespace/);
  });

  it('accepts a valid pod root and treats empty roots as legal', () => {
    const { result } = renderHook(() => useSankeyQuery({ az: ['a'], env: ['b'], cluster: [], namespace: [] }));
    act(() => {
      expect(result.current.addRoot('pod', 'shop/orders-0')).toBe(true);
    });
    expect(result.current.query.roots.pod).toEqual(['shop/orders-0']);
    act(() => {
      result.current.clearRoots();
    });
    expect(result.current.query.roots.pod).toEqual([]);
    expect(result.current.azEnvReady).toBe(true);
  });
});
