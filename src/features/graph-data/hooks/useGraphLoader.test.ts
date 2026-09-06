import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHOWCASE_GRAPH } from '../../../shared/fixtures/showcaseGraph';
import type { ViewTimeRange } from '../../../shared/time/viewTimeRange';
import { DEFAULT_GRAPH_FILTERS } from '../../../shared/types/graphFilters';
import { buildGraphRequestUrl, graphRequestKey } from '../graphRequestUrl';

import { useGraphLoader } from './useGraphLoader';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const NOW_MS = 1_767_225_600_000; // 2026-01-01T00:00:00Z

/** The window the Nth fetch actually asked for, in Unix seconds. */
function requestedWindow(fetchMock: { mock: { calls: unknown[][] } }, index: number): { start: number; end: number } {
  const call = fetchMock.mock.calls[index];
  const url = new URL(String(call?.[0]), 'http://localhost');
  return {
    start: Number(url.searchParams.get('start')),
    end: Number(url.searchParams.get('end')),
  };
}

describe('useGraphLoader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('loads the fixture in demo mode without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() =>
      useGraphLoader({
        demoMode: true,
        makeUrl: () => 'https://ksg.example/v1/graph',
        requestKey: 'https://ksg.example/v1/graph',
        refreshIntervalSeconds: 30,
      })
    );
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state.hasPayload).toBe(true);
    expect(result.current.state.elements.length).toBeGreaterThan(0);
  });

  it('does not fetch when disabled, even if a URL is available', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() =>
      useGraphLoader({
        demoMode: false,
        enabled: false,
        makeUrl: () => 'https://ksg.example/v1/storage-graph',
        requestKey: 'https://ksg.example/v1/storage-graph',
        refreshIntervalSeconds: 0,
      })
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('idle');
    act(() => {
      result.current.reload();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads a custom demo payload without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const payload = { elements: { nodes: [{ data: { id: 'n', name: 'n', type: 'pod' } }], edges: [] } };
    const { result } = renderHook(() =>
      useGraphLoader({
        demoMode: true,
        demoPayload: payload,
        makeUrl: () => 'https://ksg.example/v1/storage-graph',
        requestKey: 'storage-demo',
        refreshIntervalSeconds: 0,
      })
    );
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state.elements.some((el) => el.data.id === 'n')).toBe(true);
  });

  it('does not fetch when the graph endpoint is unset', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() =>
      useGraphLoader({ demoMode: false, makeUrl: () => undefined, requestKey: 'unset', refreshIntervalSeconds: 0 })
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('idle');
  });

  it('fetches the configured URL and normalizes the payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(SHOWCASE_GRAPH)));
    const { result } = renderHook(() =>
      useGraphLoader({
        demoMode: false,
        makeUrl: () => 'https://ksg.example/v1/graph',
        requestKey: 'https://ksg.example/v1/graph',
        refreshIntervalSeconds: 0,
      })
    );
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://ksg.example/v1/graph',
      expect.objectContaining({ headers: expect.any(Headers) as Headers })
    );
    expect(result.current.state.hasPayload).toBe(true);
  });

  it('names HTTP errors with URL and status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 503 })));
    const { result } = renderHook(() =>
      useGraphLoader({
        demoMode: false,
        makeUrl: () => 'https://ksg.example/v1/graph',
        requestKey: 'https://ksg.example/v1/graph',
        refreshIntervalSeconds: 0,
      })
    );
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });
    expect(result.current.state.error).toContain('https://ksg.example/v1/graph');
    expect(result.current.state.error).toContain('503');
    expect(result.current.state.hasPayload).toBe(false);
  });

  it('keeps the last good graph when a refresh fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(SHOWCASE_GRAPH))
      .mockResolvedValueOnce(new Response('down', { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() =>
      useGraphLoader({
        demoMode: false,
        makeUrl: () => 'https://ksg.example/v1/graph',
        requestKey: 'https://ksg.example/v1/graph',
        refreshIntervalSeconds: 0,
      })
    );
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    const count = result.current.state.elements.length;
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.state.error).toMatch(/502/);
    });
    expect(result.current.state.elements).toHaveLength(count);
    expect(result.current.state.hasPayload).toBe(true);
  });

  it('does not start a second in-flight request', async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() =>
      useGraphLoader({
        demoMode: false,
        makeUrl: () => '/api/v1/graph',
        requestKey: '/api/v1/graph',
        refreshIntervalSeconds: 0,
      })
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    act(() => {
      result.current.reload();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFirst?.(jsonResponse(SHOWCASE_GRAPH));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
  });

  it('does not auto-refresh when the interval is 0', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SHOWCASE_GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() =>
      useGraphLoader({
        demoMode: false,
        makeUrl: () => '/api/v1/graph',
        requestKey: '/api/v1/graph',
        refreshIntervalSeconds: 0,
      })
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('issues a request with a new window when the time selection changes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SHOWCASE_GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = renderHook(
      ({ range }: { range: ViewTimeRange }) =>
        useGraphLoader({
          demoMode: false,
          makeUrl: () => buildGraphRequestUrl('/api/v1/graph', range, DEFAULT_GRAPH_FILTERS, NOW_MS),
          requestKey: graphRequestKey('/api/v1/graph', range, DEFAULT_GRAPH_FILTERS),
          refreshIntervalSeconds: 0,
        }),
      { initialProps: { range: { kind: 'relative', window: '1h' } as ViewTimeRange } }
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    rerender({ range: { kind: 'relative', window: '6h' } });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const first = requestedWindow(fetchMock, 0);
    const second = requestedWindow(fetchMock, 1);
    expect(second.start).toBe(first.start - 5 * 3600);
    expect(second.end).toBe(first.end);
  });

  it('re-reads the clock on a refresh, so a relative window does not age', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SHOWCASE_GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    let now = NOW_MS;
    const range: ViewTimeRange = { kind: 'relative', window: '1h' };
    const { result } = renderHook(() =>
      useGraphLoader({
        demoMode: false,
        makeUrl: () => buildGraphRequestUrl('/api/v1/graph', range, DEFAULT_GRAPH_FILTERS, now),
        // Unchanged across the refresh: the SELECTION did not move, only the clock did.
        requestKey: graphRequestKey('/api/v1/graph', range, DEFAULT_GRAPH_FILTERS),
        refreshIntervalSeconds: 0,
      })
    );
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    now += 3_600_000;
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(requestedWindow(fetchMock, 1).end).toBe(requestedWindow(fetchMock, 0).end + 3600);
  });

  it('aborts an in-flight request on unmount and does not update afterwards', async () => {
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { unmount, result } = renderHook(() =>
      useGraphLoader({
        demoMode: false,
        makeUrl: () => '/api/v1/graph',
        requestKey: '/api/v1/graph',
        refreshIntervalSeconds: 0,
      })
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(result.current.state.status).toBe('loading');
    unmount();
    expect(signal?.aborted).toBe(true);
    expect(result.current.state.status).toBe('loading');
  });

  it('clears the auto-refresh timer on unmount', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SHOWCASE_GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderHook(() =>
      useGraphLoader({
        demoMode: false,
        makeUrl: () => '/api/v1/graph',
        requestKey: '/api/v1/graph',
        refreshIntervalSeconds: 30,
      })
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
