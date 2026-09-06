import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import type { ViewTimeRange } from '../../shared/time/viewTimeRange';
import { buildSearchString } from '../../shared/url/search';

/**
 * Page-owned URL scope. Writes with replace, and only when the canonical string
 * actually changes — a write on every render would spam history and can loop.
 */
export function useUrlScope<T>(
  parse: (params: URLSearchParams) => T,
  serialize: (value: T) => Array<[string, string]>,
  range: ViewTimeRange,
  writeScope: boolean,
  fallback: T
): [T, (next: T | ((prev: T) => T)) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = useMemo(
    () => (writeScope ? parse(searchParams) : fallback),
    [fallback, parse, searchParams, writeScope]
  );
  const canonical = buildSearchString(writeScope ? serialize(value) : [], range);

  const replaceCanonical = useCallback(
    (nextValue: T): void => {
      const next = buildSearchString(writeScope ? serialize(nextValue) : [], range);
      setSearchParams(
        (prev) => {
          if (prev.toString() === next) {
            return prev;
          }
          return new URLSearchParams(next);
        },
        { replace: true }
      );
    },
    [range, serialize, setSearchParams, writeScope]
  );

  useEffect(() => {
    setSearchParams(
      (prev) => {
        if (prev.toString() === canonical) {
          return prev;
        }
        return new URLSearchParams(canonical);
      },
      { replace: true }
    );
  }, [canonical, setSearchParams]);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)): void => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
      replaceCanonical(resolved);
    },
    [replaceCanonical, value]
  );

  return [value, setValue];
}
