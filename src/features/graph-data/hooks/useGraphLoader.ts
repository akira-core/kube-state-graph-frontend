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
  graphUrl: string | undefined;
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

export function useGraphLoader({ demoMode, graphUrl, refreshIntervalSeconds }: UseGraphLoaderOptions): {
  state: GraphDataState;
  reload: () => void;
} {
  const [state, setState] = useState<GraphDataState>(INITIAL);
  const inflightRef = useRef(false);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);

  const loadDemo = useCallback(() => {
    const next = normalizePayload(SHOWCASE_GRAPH);
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

  const loadRemote = useCallback(async (url: string, isRefresh: boolean) => {
    if (inflightRef.current) {
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
      void isRefresh;
    }
  }, []);

  const reload = useCallback(() => {
    if (demoMode) {
      loadDemo();
      return;
    }
    if (graphUrl === undefined || graphUrl === '') {
      return;
    }
    void loadRemote(graphUrl, true);
  }, [demoMode, graphUrl, loadDemo, loadRemote]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    inflightRef.current = false;
    if (demoMode) {
      loadDemo();
      return;
    }
    if (graphUrl === undefined || graphUrl === '') {
      setState(INITIAL);
      return;
    }
    void loadRemote(graphUrl, false);
  }, [demoMode, graphUrl, loadDemo, loadRemote]);

  useEffect(() => {
    if (demoMode || refreshIntervalSeconds <= 0 || graphUrl === undefined) {
      return;
    }
    const id = window.setInterval(() => {
      void loadRemote(graphUrl, true);
    }, refreshIntervalSeconds * 1000);
    return () => window.clearInterval(id);
  }, [demoMode, graphUrl, refreshIntervalSeconds, loadRemote, state.lastLoadedAt]);

  return { state, reload };
}
