import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import { parseTimeQuery, type ViewTimeRange } from '../../shared/time/viewTimeRange';
import { useGraphLoader, type GraphDataState, type MakeUrl } from '../graph-data';

import { IDLE_PAGE_STATUS, phaseOf, useShellFrame } from './ShellFrame';

export interface UsePageLoaderOptions {
  demoMode: boolean;
  demoPayload?: unknown;
  refreshIntervalSeconds: number;
  /**
   * The page's own reasons Reload is unavailable (endpoint missing, draft unsendable), on
   * top of the shared one: nothing has been committed on this mount yet.
   */
  reloadDisabled?: boolean;
  /** Runs once on unmount, after the shell status has been reset to idle. */
  onTeardown?: () => void;
}

export interface PageLoader {
  state: GraphDataState;
  reload: () => void;
  cancel: () => void;
  /** A commit has been made on this mount (demo mode counts as committed). */
  armed: boolean;
  /** A request is in flight, first load or refresh — the scope bar shows Cancel. */
  inFlight: boolean;
  /** Arm the page and issue the committed request. Callers commit the URL first. */
  onQuery: (makeUrl: MakeUrl) => void;
}

/**
 * What every category page does around `useGraphLoader`, once: prime the demo fixture on
 * mount, remember whether a commit has happened, mirror the loader into the shell's status
 * indicator, and hand the indicator back to idle on unmount. Pages keep only what differs —
 * how the URL is built and which draft gates Query.
 */
export function usePageLoader({
  demoMode,
  demoPayload,
  refreshIntervalSeconds,
  reloadDisabled = false,
  onTeardown,
}: UsePageLoaderOptions): PageLoader {
  const { setStatus } = useShellFrame();
  const loader = useGraphLoader({
    demoMode,
    ...(demoPayload === undefined ? {} : { demoPayload }),
    refreshIntervalSeconds,
  });
  const { state, run, reload, cancel } = loader;
  const [armed, setArmed] = useState(demoMode);

  useEffect(() => {
    if (!demoMode) {
      return;
    }
    run(() => undefined);
  }, [demoMode, run]);

  const onQuery = useCallback(
    (makeUrl: MakeUrl) => {
      setArmed(true);
      run(makeUrl);
    },
    [run]
  );

  useEffect(() => {
    setStatus({
      phase: phaseOf(state),
      lastLoadedAt: state.lastLoadedAt,
      refreshing: state.refreshing || (state.status === 'loading' && !state.hasPayload),
      error: state.cancelled ? undefined : state.error,
      reload,
      reloadDisabled: !armed || reloadDisabled,
    });
  }, [armed, reload, reloadDisabled, setStatus, state]);

  const teardownRef = useRef(onTeardown);
  teardownRef.current = onTeardown;
  useEffect(() => {
    return () => {
      setStatus(IDLE_PAGE_STATUS);
      teardownRef.current?.();
    };
  }, [setStatus]);

  const inFlight = state.status === 'loading' || state.refreshing;
  return useMemo(
    () => ({ state, reload, cancel, armed, inFlight, onQuery }),
    [armed, cancel, inFlight, onQuery, reload, state]
  );
}

/**
 * Locate arrives from another page with the node id in navigation state. Consume it once
 * and clear the state through `commit`, whose replace carries none. A navigate of its own
 * here would run in the same effect flush as the mount seed with this render's URL,
 * writing the pre-seed query back over the `from` / `to` the seed just wrote. Built from
 * the seed's own inputs, the two writes agree whichever lands last.
 */
export function useLocateFromNavigation<T>(
  applied: T,
  commit: (scope: T, range: ViewTimeRange) => void,
  fallbackRange: ViewTimeRange
): { locateNodeId: string | null; onLocateConsumed: () => void } {
  const location = useLocation();
  const [locateNodeId, setLocateNodeId] = useState<string | null>(null);

  useEffect(() => {
    const state = location.state as { locate?: unknown } | null;
    if (typeof state?.locate !== 'string' || state.locate.length === 0) {
      return;
    }
    setLocateNodeId(state.locate);
    commit(applied, parseTimeQuery(new URLSearchParams(location.search)) ?? fallbackRange);
  }, [applied, commit, fallbackRange, location.search, location.state]);

  const onLocateConsumed = useCallback(() => setLocateNodeId(null), []);
  return { locateNodeId, onLocateConsumed };
}
