import { useCallback, useEffect, useMemo, useRef } from 'react';
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

  // The setter reads all of this at call time, so holding it in a ref keeps the setter's
  // identity stable. A setter that changed whenever the scope did would re-run every effect
  // that lists it, and an effect that seeds a value would then undo the user's own clearing
  // of it on the very next write.
  const latest = useRef({ value, range, serialize, writeScope });
  latest.current = { value, range, serialize, writeScope };

  const replaceCanonical = useCallback(
    (nextValue: T): void => {
      const { range: currentRange, serialize: currentSerialize, writeScope: currentWriteScope } = latest.current;
      const next = buildSearchString(currentWriteScope ? currentSerialize(nextValue) : [], currentRange);
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
    [setSearchParams]
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
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(latest.current.value) : next;
      replaceCanonical(resolved);
    },
    [replaceCanonical]
  );

  return [value, setValue];
}
