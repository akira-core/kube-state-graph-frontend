import type cytoscape from 'cytoscape';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SHOWCASE_GRAPH } from '../../../shared/fixtures/showcaseGraph';
import { HttpStatusError, fetchJson } from '../../../shared/http/fetchJson';
import { normalizeGraph } from '../normalize';

export type GraphStatus = 'idle' | 'loading' | 'ready' | 'error';

export type MakeUrl = () => string | undefined;

export interface GraphDataState {
  status: GraphStatus;
  elements: cytoscape.ElementDefinition[];
  errors: string[];
  error: string | undefined;
  hasPayload: boolean;
  lastLoadedAt: number | null;
  refreshing: boolean;
  cancelled: boolean;
}

export interface UseGraphLoaderOptions {
  demoMode: boolean;
  /**
   * Fixture fed to the same normalize boundary in demo mode. Graph uses SHOWCASE_GRAPH;
   * storage-graph uses SHOWCASE_STORAGE_GRAPH.
   */
  demoPayload?: unknown;
  refreshIntervalSeconds: number;
}

const INITIAL: GraphDataState = {
  status: 'idle',
  elements: [],
  errors: [],
  error: undefined,
  hasPayload: false,
  lastLoadedAt: null,
  refreshing: false,
  cancelled: false,
};

function normalizePayload(payload: unknown): Pick<GraphDataState, 'elements' | 'errors' | 'error' | 'hasPayload'> {
  const { elements, errors } = normalizeGraph(payload);
  if (elements.length === 0 && errors.length > 0) {
    // Nothing at all parsed: a TOTAL ingestion failure, not a partial one. hasPayload must
    // stay false so GraphView's fatal gate (firstError && !hasPayload && status === 'error')
    // shows the error screen instead of a blank canvas plus a "some entries were skipped"
    // banner.
    return { elements, errors, error: errors[0], hasPayload: false };
  }
  return { elements, errors, error: undefined, hasPayload: true };
}

function describeLoadError(url: string, err: unknown): string {
  if (err instanceof HttpStatusError) {
    return err.message;
  }
  if (err instanceof Error && err.message.length > 0) {
    return err.message;
  }
  return `GET ${url} failed: network error`;
}

export function useGraphLoader({
  demoMode,
  demoPayload = SHOWCASE_GRAPH,
  refreshIntervalSeconds,
}: UseGraphLoaderOptions): {
  state: GraphDataState;
  run: (makeUrl: MakeUrl) => void;
  reload: () => void;
  cancel: () => void;
} {
  const [state, setState] = useState<GraphDataState>(INITIAL);
  const inflightRef = useRef(false);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const makeUrlRef = useRef<MakeUrl | null>(null);
  const timerRef = useRef<number | null>(null);
  const demoPayloadRef = useRef(demoPayload);
  demoPayloadRef.current = demoPayload;
  const demoModeRef = useRef(demoMode);
  demoModeRef.current = demoMode;
  const intervalRef = useRef(refreshIntervalSeconds);
  intervalRef.current = refreshIntervalSeconds;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const loadDemo = useCallback(() => {
    const next = normalizePayload(demoPayloadRef.current);
    setState({
      status: next.error !== undefined ? 'error' : 'ready',
      elements: next.elements,
      errors: next.errors,
      error: next.error,
      hasPayload: next.hasPayload,
      lastLoadedAt: Date.now(),
      refreshing: false,
      cancelled: false,
    });
  }, []);

  const loadRemoteRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const startTimer = useCallback(() => {
    clearTimer();
    if (demoModeRef.current || intervalRef.current <= 0) {
      return;
    }
    timerRef.current = window.setInterval(() => {
      if (inflightRef.current) {
        return;
      }
      void loadRemoteRef.current();
    }, intervalRef.current * 1000);
  }, [clearTimer]);

  const loadRemote = useCallback(async () => {
    if (inflightRef.current) {
      return;
    }
    const makeUrl = makeUrlRef.current;
    if (makeUrl === null) {
      return;
    }
    const url = makeUrl();
    if (url === undefined || url === '') {
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    inflightRef.current = true;
    const gen = generationRef.current;
    setState((prev) => ({
      ...prev,
      status: prev.hasPayload ? prev.status : 'loading',
      refreshing: prev.hasPayload,
      error: prev.hasPayload ? prev.error : undefined,
      cancelled: false,
    }));
    try {
      const payload = await fetchJson(url, { signal: ac.signal });
      if (!mountedRef.current || gen !== generationRef.current || ac.signal.aborted) {
        return;
      }
      const next = normalizePayload(payload);
      setState((prev) => {
        if (next.error !== undefined && prev.hasPayload) {
          // Keep the last good elements, but carry the NEW errors: GraphView renders the
          // soft banner from errors[0], so leaving the previous load's array in place
          // would show a stale message (or none) instead of this refresh's failure.
          return {
            ...prev,
            status: 'ready',
            errors: next.errors,
            error: next.error,
            refreshing: false,
            cancelled: false,
          };
        }
        return {
          status: next.error !== undefined ? 'error' : 'ready',
          elements: next.elements,
          errors: next.errors,
          error: next.error,
          hasPayload: next.hasPayload,
          lastLoadedAt: Date.now(),
          refreshing: false,
          cancelled: false,
        };
      });
    } catch (err) {
      if (!mountedRef.current || gen !== generationRef.current) {
        return;
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const message = describeLoadError(url, err);
      setState((prev) =>
        prev.hasPayload
          ? { ...prev, error: message, refreshing: false, cancelled: false }
          : {
              status: 'error',
              elements: [],
              errors: [],
              error: message,
              hasPayload: false,
              lastLoadedAt: null,
              refreshing: false,
              cancelled: false,
            }
      );
    } finally {
      if (abortRef.current === ac) {
        inflightRef.current = false;
      }
      // Count the next tick from this completed request, success or failure: a commit whose
      // first request fails must still auto-refresh. A cancelled (generation bumped) or
      // unmounted request restarts nothing.
      if (mountedRef.current && gen === generationRef.current && !ac.signal.aborted) {
        startTimer();
      }
    }
  }, [startTimer]);

  loadRemoteRef.current = loadRemote;

  const run = useCallback(
    (makeUrl: MakeUrl) => {
      if (inflightRef.current) {
        return;
      }
      makeUrlRef.current = makeUrl;
      if (demoModeRef.current) {
        loadDemo();
        return;
      }
      void loadRemote();
    },
    [loadDemo, loadRemote]
  );

  const reload = useCallback(() => {
    if (makeUrlRef.current === null || inflightRef.current) {
      return;
    }
    if (demoModeRef.current) {
      loadDemo();
      return;
    }
    void loadRemote();
  }, [loadDemo, loadRemote]);

  const cancel = useCallback(() => {
    if (!inflightRef.current && abortRef.current === null) {
      return;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    generationRef.current += 1;
    inflightRef.current = false;
    clearTimer();
    setState((prev) => ({
      ...prev,
      status: prev.hasPayload ? 'ready' : 'idle',
      refreshing: false,
      error: undefined,
      cancelled: true,
    }));
  }, [clearTimer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      clearTimer();
    };
  }, [clearTimer]);

  return { state, run, reload, cancel };
}
