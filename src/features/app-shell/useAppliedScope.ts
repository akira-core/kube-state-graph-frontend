import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';

import { parseTimeQuery, type ViewTimeRange } from '../../shared/time/viewTimeRange';
import { buildSearchString } from '../../shared/url/search';

/**
 * The URL is the applied selection. `commit` is the page's only writer: scope pairs,
 * immediate view values and `from` / `to` in one replace. Nothing here writes on render.
 */
export function useAppliedScope<T>(
  parse: (params: URLSearchParams) => T,
  serialize: (value: T) => Array<[string, string]>
): {
  applied: T;
  commit: (scope: T, range: ViewTimeRange) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const serializeRef = useRef(serialize);
  serializeRef.current = serialize;
  const applied = useMemo(() => parse(searchParams), [parse, searchParams]);

  const commit = useCallback(
    (scope: T, range: ViewTimeRange): void => {
      const next = buildSearchString(serializeRef.current(scope), range);
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

  return { applied, commit };
}

/**
 * On mount: a valid URL `from` / `to` seeds the shell draft; otherwise the page writes
 * the shell draft once. Never a request.
 */
export function useSeedTimeOnMount<T>(
  applied: T,
  commit: (scope: T, range: ViewTimeRange) => void,
  time: { range: ViewTimeRange; seedDraft: (next: ViewTimeRange) => void }
): void {
  const [params] = useSearchParams();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) {
      return;
    }
    seeded.current = true;
    const urlRange = parseTimeQuery(params);
    if (urlRange !== undefined) {
      time.seedDraft(urlRange);
      return;
    }
    commit(applied, time.range);
  }, [applied, commit, params, time]);
}
