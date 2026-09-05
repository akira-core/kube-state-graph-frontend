import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { VIEW_TIME_STORAGE_KEY } from '../../shared/time/viewTimeRange';

import { useViewTimeRange } from './useViewTimeRange';

describe('useViewTimeRange', () => {
  const mem = new Map<string, string>();

  beforeEach(() => {
    mem.clear();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => mem.get(key) ?? null,
        setItem: (key: string, value: string) => {
          mem.set(key, value);
        },
        removeItem: (key: string) => {
          mem.delete(key);
        },
        clear: () => mem.clear(),
        key: () => null,
        get length() {
          return mem.size;
        },
      },
    });
  });

  afterEach(() => {
    window.localStorage.removeItem(VIEW_TIME_STORAGE_KEY);
  });

  it('defaults to 24h and persists a relative choice', () => {
    const { result } = renderHook(() => useViewTimeRange());
    expect(result.current.range).toEqual({ kind: 'relative', window: '24h' });
    act(() => {
      result.current.setRelative('6h');
    });
    expect(result.current.range).toEqual({ kind: 'relative', window: '6h' });
    expect(JSON.parse(window.localStorage.getItem(VIEW_TIME_STORAGE_KEY) ?? '{}')).toEqual({
      kind: 'relative',
      window: '6h',
    });
  });

  it('resolves a relative window against now rather than freezing the selection instant', () => {
    const { result } = renderHook(() => useViewTimeRange());
    act(() => {
      result.current.setRelative('1h');
    });
    const first = result.current.resolved;
    expect(first.toUnixSeconds - first.fromUnixSeconds).toBe(3600);
  });

  it('stores an absolute window', () => {
    const { result } = renderHook(() => useViewTimeRange());
    act(() => {
      result.current.setAbsolute(1_700_000_000, 1_700_003_600);
    });
    expect(result.current.range).toEqual({
      kind: 'absolute',
      window: { fromUnixSeconds: 1_700_000_000, toUnixSeconds: 1_700_003_600 },
    });
    expect(result.current.resolved).toEqual({ fromUnixSeconds: 1_700_000_000, toUnixSeconds: 1_700_003_600 });
  });

  it('setAround writes [t-300, t+300]', () => {
    const { result } = renderHook(() => useViewTimeRange());
    act(() => {
      result.current.setAround(1_000_000);
    });
    expect(result.current.range).toEqual({
      kind: 'absolute',
      window: { fromUnixSeconds: 999_700, toUnixSeconds: 1_000_300 },
    });
  });
});
