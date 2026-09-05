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

export function useViewTimeRange(): {
  range: ViewTimeRange;
  resolved: ResolvedTimeRange;
  setRelative: (window: RelativeWindow) => void;
  setAbsolute: (fromUnixSeconds: number, toUnixSeconds: number) => void;
  setAround: (unixSeconds: number, halfWindowSec?: number) => void;
} {
  const [range, setRange] = useState<ViewTimeRange>(() => {
    try {
      return parseStoredViewTimeRange(localStorage.getItem(VIEW_TIME_STORAGE_KEY));
    } catch {
      return DEFAULT_VIEW_TIME_RANGE;
    }
  });

  const persist = useCallback((next: ViewTimeRange) => {
    setRange(next);
    try {
      localStorage.setItem(VIEW_TIME_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const setRelative = useCallback(
    (window: RelativeWindow) => {
      persist({ kind: 'relative', window });
    },
    [persist]
  );

  const setAbsolute = useCallback(
    (fromUnixSeconds: number, toUnixSeconds: number) => {
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
