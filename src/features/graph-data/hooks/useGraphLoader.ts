import type cytoscape from 'cytoscape';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SHOWCASE_GRAPH } from '../../../shared/fixtures/showcaseGraph';
import { HttpStatusError, fetchJson } from '../../../shared/http/fetchJson';
import { normalizeGraph } from '../normalize';

export type GraphStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface GraphDataState {
  status: GraphStatus;
  elements: cytoscape.ElementDefinition[];
  errors: string[];
  error: string | undefined;
  hasPayload: boolean;
  lastLoadedAt: number | null;
  refreshing: boolean;
}

export interface UseGraphLoaderOptions {
  demoMode: boolean;
  /**
   * Fixture fed to the same normalize boundary in demo mode. Graph uses SHOWCASE_GRAPH;
   * storage-graph uses SHOWCASE_STORAGE_GRAPH.
   */
  demoPayload?: unknown;
  /**
   * When false the loader neither fetches nor starts its auto-refresh timer. Used to
   * keep storage-graph lazy until Sankey has been visited (and az/env are ready).
   * Default true so the graph loader is unchanged.
   */
  enabled?: boolean;
  /**
   * Builds the request URL, called at REQUEST time rather than at render time.
   *
   * The window has to be resolved per request: the backend takes absolute timestamps
   * only, so a URL built once and held stops moving, and a refresh re-asks for the same
   * minutes until the range falls out of retention and returns an empty graph.
   */
  makeUrl: () => string | undefined;
  /**
   * Changes exactly when the SELECTION changes — endpoint, time range, filters — and not
   * when the clock moves. This is what a new load keys on; keying on the built URL would
   * refetch on every render, because a relative window's URL is different every time.
   */
  requestKey: string;
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
  enabled = true,
  makeUrl,
  requestKey,
  refreshIntervalSeconds,
}: UseGraphLoaderOptions): {
  state: GraphDataState;
  reload: () => void;
} {
  const [state, setState] = useState<GraphDataState>(INITIAL);
  const inflightRef = useRef(false);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  // Held in a ref so a caller may hand a fresh closure every render without that alone
  // counting as a new request. What counts as a new request is requestKey.
  const makeUrlRef = useRef(makeUrl);
  makeUrlRef.current = makeUrl;
  const demoPayloadRef = useRef(demoPayload);
  demoPayloadRef.current = demoPayload;

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
    });
  }, []);

  const loadRemote = useCallback(async () => {
    if (inflightRef.current) {
      return;
    }
    const url = makeUrlRef.current();
    if (url === undefined || url === '') {
      return;
    }
    inflightRef.current = true;
    const gen = generationRef.current;
    setState((prev) => ({
      ...prev,
      status: prev.hasPayload ? prev.status : 'loading',
      refreshing: prev.hasPayload,
      error: prev.hasPayload ? prev.error : undefined,
    }));
    try {
      const payload = await fetchJson(url);
      if (!mountedRef.current || gen !== generationRef.current) {
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
          ? { ...prev, error: message, refreshing: false }
          : {
              status: 'error',
              elements: [],
              errors: [],
              error: message,
              hasPayload: false,
              lastLoadedAt: null,
              refreshing: false,
            }
      );
    } finally {
      inflightRef.current = false;
    }
  }, []);

  const reload = useCallback(() => {
    if (!enabled) {
      return;
    }
    if (demoMode) {
      loadDemo();
      return;
    }
    void loadRemote();
  }, [enabled, demoMode, loadDemo, loadRemote]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // requestKey is this effect's identity: a new selection is a new request.
    void requestKey;
    // Bump the generation BEFORE the enabled guard: a request already in flight when the
    // loader is disabled must not commit its response afterwards. Returning first would
    // leave that fetch on the current generation and let it land into a disabled loader.
    generationRef.current += 1;
    inflightRef.current = false;
    if (!enabled) {
      return;
    }
    if (demoMode) {
      loadDemo();
      return;
    }
    const url = makeUrlRef.current();
    if (url === undefined || url === '') {
      setState(INITIAL);
      return;
    }
    void loadRemote();
  }, [demoMode, requestKey, enabled, loadDemo, loadRemote]);

  useEffect(() => {
    if (!enabled || demoMode || refreshIntervalSeconds <= 0) {
      return;
    }
    const id = window.setInterval(() => {
      void loadRemote();
    }, refreshIntervalSeconds * 1000);
    return () => window.clearInterval(id);
  }, [enabled, demoMode, requestKey, refreshIntervalSeconds, loadRemote, state.lastLoadedAt]);

  return { state, reload };
}
