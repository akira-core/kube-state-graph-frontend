import { useCallback, useMemo, useState } from 'react';

import {
  DEFAULT_VIEW_TIME_RANGE,
  VIEW_TIME_STORAGE_KEY,
  parseStoredViewTimeRange,
  resolveViewTimeRange,
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
 * Shell-held draft of the view time range. The page commits it to the URL; this hook
 * never reads or writes the query string.
 */
export function useViewTimeRange(): {
  range: ViewTimeRange;
  resolved: ResolvedTimeRange;
  setRelative: (window: RelativeWindow) => void;
  setAbsolute: (fromUnixSeconds: number, toUnixSeconds: number) => void;
  setAround: (unixSeconds: number, halfWindowSec?: number) => void;
  seedDraft: (next: ViewTimeRange) => void;
  persist: (next: ViewTimeRange) => void;
} {
  const [range, setRange] = useState<ViewTimeRange>(readStored);

  const seedDraft = useCallback((next: ViewTimeRange) => {
    setRange(next);
  }, []);

  const persist = useCallback((next: ViewTimeRange) => {
    persistLocal(next);
  }, []);

  const setRelative = useCallback((window: RelativeWindow) => {
    setRange({ kind: 'relative', window });
  }, []);

  const setAbsolute = useCallback((fromUnixSeconds: number, toUnixSeconds: number) => {
    // An inverted (or empty) window is refused rather than stored. `parseTimeQuery`
    // rejects `from >= to`, so storing one writes a URL that cannot be read back: a
    // reload or a shared link silently reverts to the stored range, while every request
    // in the meantime goes out with `start >= end`. The two datetime inputs edit one
    // endpoint at a time, so this is reachable by simply moving `from` past `to`.
    if (fromUnixSeconds >= toUnixSeconds) {
      return;
    }
    setRange({ kind: 'absolute', window: { fromUnixSeconds, toUnixSeconds } });
  }, []);

  const setAround = useCallback((unixSeconds: number, halfWindowSec = 300) => {
    setRange({
      kind: 'absolute',
      window: { fromUnixSeconds: unixSeconds - halfWindowSec, toUnixSeconds: unixSeconds + halfWindowSec },
    });
  }, []);

  // Anchored to the range SELECTION, not to render time. Resolving inline re-read
  // Date.now() on every render, so a relative window handed a fresh object with an
  // advancing `toUnixSeconds` downstream — which churns GraphView's memoized props and
  // re-fires the /dashboard prefetch on every data refresh (node-dashboard-url-button
  // spec: a pure data refresh over the same node/attributes/time range MUST NOT refetch).
  const resolved = useMemo(() => resolveViewTimeRange(range), [range]);

  return { range, resolved, setRelative, setAbsolute, setAround, seedDraft, persist };
}
