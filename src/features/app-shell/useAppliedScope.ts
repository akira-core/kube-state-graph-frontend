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

/**
 * A control that commits one field of the applied scope straight to the URL (Top pods, the
 * Sankey mode, the trace threshold): the rest of the scope and the applied `from` / `to`
 * ride along unchanged, so the write never disturbs the drawn query. Demo mode has no URL
 * scope — the value goes to the page's own state instead.
 */
export function useCommitField<T, K extends keyof T>(
  field: K,
  {
    applied,
    commit,
    fallbackRange,
    demoMode,
    onDemo,
  }: {
    applied: T;
    commit: (scope: T, range: ViewTimeRange) => void;
    /** The shell's range, for a URL with no `from` / `to` pair of its own. */
    fallbackRange: ViewTimeRange;
    demoMode: boolean;
    onDemo: (value: T[K]) => void;
  }
): (value: T[K]) => void {
  const [searchParams] = useSearchParams();
  // Memoised on the params object: `parseTimeQuery` returns a fresh object per call, and an
  // identity that changed every render would churn the callback and, through the trace
  // view's `onMinBpsChange`, restart its threshold debounce on each render.
  const appliedRange = useMemo(() => parseTimeQuery(searchParams) ?? fallbackRange, [fallbackRange, searchParams]);
  return useCallback(
    (value: T[K]) => {
      if (demoMode) {
        onDemo(value);
        return;
      }
      const next = { ...applied };
      next[field] = value;
      commit(next, appliedRange);
    },
    [applied, appliedRange, commit, demoMode, field, onDemo]
  );
}
