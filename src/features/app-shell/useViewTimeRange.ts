import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import {
  DEFAULT_VIEW_TIME_RANGE,
  VIEW_TIME_STORAGE_KEY,
  parseStoredViewTimeRange,
  parseTimeQuery,
  resolveViewTimeRange,
  serializeTimeQuery,
  type RelativeWindow,
  type ResolvedTimeRange,
  type ViewTimeRange,
} from '../../shared/time/viewTimeRange';

function readStored(): ViewTimeRange {
  try {
    return parseStoredViewTimeRange(localStorage.getItem(VIEW_TIME_STORAGE_KEY));
  } catch {
    return DEFAULT_VIEW_TIME_RANGE;
  }
}

function persistLocal(next: ViewTimeRange): void {
  try {
    localStorage.setItem(VIEW_TIME_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A storage that refuses the write is not a reason to lose the in-page selection.
  }
}

/**
 * URL first, then local storage, then 24h. After mount the URL always carries `from`/`to`
 * so a copied link is self-describing. Writes replace, never push.
 */
export function useViewTimeRange(): {
  range: ViewTimeRange;
  resolved: ResolvedTimeRange;
  setRelative: (window: RelativeWindow) => void;
  setAbsolute: (fromUnixSeconds: number, toUnixSeconds: number) => void;
  setAround: (unixSeconds: number, halfWindowSec?: number) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlRange = useMemo(() => parseTimeQuery(searchParams), [searchParams]);
  const [range, setRange] = useState<ViewTimeRange>(() => urlRange ?? readStored());

  const writeQuery = useCallback(
    (next: ViewTimeRange): void => {
      const { from, to } = serializeTimeQuery(next);
      setSearchParams(
        (prev) => {
          if (prev.get('from') === from && prev.get('to') === to) {
            return prev;
          }
          const copy = new URLSearchParams(prev);
          copy.delete('from');
          copy.delete('to');
          copy.append('from', from);
          copy.append('to', to);
          return copy;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (urlRange !== undefined) {
      setRange((prev) => (JSON.stringify(prev) === JSON.stringify(urlRange) ? prev : urlRange));
      persistLocal(urlRange);
      return;
    }
    writeQuery(range);
  }, [range, urlRange, writeQuery]);

  const persist = useCallback(
    (next: ViewTimeRange) => {
      setRange(next);
      persistLocal(next);
      writeQuery(next);
    },
    [writeQuery]
  );

  const setRelative = useCallback(
    (window: RelativeWindow) => {
      persist({ kind: 'relative', window });
    },
    [persist]
  );

  const setAbsolute = useCallback(
    (fromUnixSeconds: number, toUnixSeconds: number) => {
      // An inverted (or empty) window is refused rather than stored. `parseTimeQuery`
      // rejects `from >= to`, so storing one writes a URL that cannot be read back: a
      // reload or a shared link silently reverts to the stored range, while every request
      // in the meantime goes out with `start >= end`. The two datetime inputs edit one
      // endpoint at a time, so this is reachable by simply moving `from` past `to`.
      if (fromUnixSeconds >= toUnixSeconds) {
        return;
      }
      persist({ kind: 'absolute', window: { fromUnixSeconds, toUnixSeconds } });
    },
    [persist]
  );

  const setAround = useCallback(
    (unixSeconds: number, halfWindowSec = 300) => {
      persist({
        kind: 'absolute',
        window: { fromUnixSeconds: unixSeconds - halfWindowSec, toUnixSeconds: unixSeconds + halfWindowSec },
      });
    },
    [persist]
  );

  // Anchored to the range SELECTION, not to render time. Resolving inline re-read
  // Date.now() on every render, so a relative window handed a fresh object with an
  // advancing `toUnixSeconds` downstream — which churns GraphView's memoized props and
  // re-fires the /dashboard prefetch on every data refresh (node-dashboard-url-button
  // spec: a pure data refresh over the same node/attributes/time range MUST NOT refetch).
  const resolved = useMemo(() => resolveViewTimeRange(range), [range]);

  return { range, resolved, setRelative, setAbsolute, setAround };
}
