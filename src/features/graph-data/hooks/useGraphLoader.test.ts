import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHOWCASE_GRAPH } from '../../../shared/fixtures/showcaseGraph';
import type { ViewTimeRange } from '../../../shared/time/viewTimeRange';
import { DEFAULT_GRAPH_FILTERS } from '../../../shared/types/graphFilters';
import { buildGraphRequestUrl } from '../graphRequestUrl';

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

const LIVE = { demoMode: false, refreshIntervalSeconds: 0 } as const;

/**
 * Lets an in-flight request finish. The timer tests fake only setInterval, which is also what
 * waitFor polls with — so waitFor never re-checks there, while a real zero-delay timeout still
 * runs after every promise the fetch chain queued.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useGraphLoader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('issues 0 requests on mount', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useGraphLoader(LIVE));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('idle');
    expect(result.current.state.hasPayload).toBe(false);
    expect(result.current.state.cancelled).toBe(false);
  });

  it('run issues 1 request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(SHOWCASE_GRAPH)));
    const { result } = renderHook(() => useGraphLoader(LIVE));
    act(() => {
      result.current.run(() => 'https://ksg.example/v1/graph');
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://ksg.example/v1/graph',
      expect.objectContaining({ headers: expect.any(Headers) as Headers })
    );
    expect(result.current.state.hasPayload).toBe(true);
    expect(result.current.state.cancelled).toBe(false);
  });

  it('reload before run is inert', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useGraphLoader(LIVE));
    act(() => {
      result.current.reload();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('idle');
  });

  it('loads the fixture in demo mode without fetching, only after run', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useGraphLoader({ demoMode: true, refreshIntervalSeconds: 30 }));
    expect(result.current.state.status).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => {
      result.current.run(() => 'https://ksg.example/v1/graph');
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state.hasPayload).toBe(true);
    expect(result.current.state.elements.length).toBeGreaterThan(0);
  });

  it('loads a custom demo payload without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const payload = { elements: { nodes: [{ data: { id: 'n', name: 'n', type: 'pod' } }], edges: [] } };
    const { result } = renderHook(() =>
      useGraphLoader({ demoMode: true, demoPayload: payload, refreshIntervalSeconds: 0 })
    );
    act(() => {
      result.current.run(() => 'https://ksg.example/v1/storage-graph');
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state.elements.some((el) => el.data.id === 'n')).toBe(true);
  });

  it('does not fetch when run’s builder returns undefined', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useGraphLoader(LIVE));
    act(() => {
      result.current.run(() => undefined);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('idle');
  });

  it('names HTTP errors with URL and status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 503 })));
    const { result } = renderHook(() => useGraphLoader(LIVE));
    act(() => {
      result.current.run(() => 'https://ksg.example/v1/graph');
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });
    expect(result.current.state.error).toContain('https://ksg.example/v1/graph');
    expect(result.current.state.error).toContain('503');
    expect(result.current.state.hasPayload).toBe(false);
    expect(result.current.state.cancelled).toBe(false);
  });

  it('keeps the last good graph when a refresh fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(SHOWCASE_GRAPH))
      .mockResolvedValueOnce(new Response('down', { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useGraphLoader(LIVE));
    act(() => {
      result.current.run(() => 'https://ksg.example/v1/graph');
    });
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

  it('reload during flight is inert; run during flight supersedes the request with the new URL', async () => {
    const signals: AbortSignal[] = [];
    let resolveFirst: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          if (init?.signal !== undefined && init.signal !== null) {
            signals.push(init.signal);
          }
          if (signals.length === 1) {
            resolveFirst = resolve;
          } else {
            resolve(jsonResponse(SHOWCASE_GRAPH));
          }
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useGraphLoader(LIVE));
    act(() => {
      result.current.run(() => '/api/v1/graph');
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    act(() => {
      result.current.reload();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The page committed a new scope to the URL and asked for it. The first request is
    // aborted and the new one goes out at once — the drawn body must follow the address bar.
    act(() => {
      result.current.run(() => '/api/v1/graph?other=1');
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('/api/v1/graph?other=1');
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(result.current.state.cancelled).toBe(false);

    // The superseded response lands late and changes nothing.
    const loadedAt = result.current.state.lastLoadedAt;
    resolveFirst?.(jsonResponse({ elements: { nodes: [], edges: [] } }));
    await settle();
    expect(result.current.state.lastLoadedAt).toBe(loadedAt);
    expect(result.current.state.hasPayload).toBe(true);
  });

  it('cancel after a completed request is a no-op', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(SHOWCASE_GRAPH)));
    const { result } = renderHook(() => useGraphLoader(LIVE));
    act(() => {
      result.current.run(() => '/api/v1/graph');
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    const before = result.current.state;
    act(() => {
      result.current.cancel();
    });
    expect(result.current.state).toBe(before);
    expect(result.current.state.cancelled).toBe(false);
  });

  it('cancel aborts and keeps a payload as ready with no error', async () => {
    let signal: AbortSignal | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(SHOWCASE_GRAPH))
      .mockImplementation((_url: RequestInfo | URL, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useGraphLoader(LIVE));
    act(() => {
      result.current.run(() => '/api/v1/graph');
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    const elements = result.current.state.elements;
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    act(() => {
      result.current.cancel();
    });
    expect(signal?.aborted).toBe(true);
    expect(result.current.state.status).toBe('ready');
    expect(result.current.state.cancelled).toBe(true);
    expect(result.current.state.error).toBeUndefined();
    expect(result.current.state.hasPayload).toBe(true);
    expect(result.current.state.elements).toBe(elements);
  });

  it('cancel before any payload returns idle with cancelled and no error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: RequestInfo | URL, init?: RequestInit) => {
        void init;
        return new Promise<Response>(() => undefined);
      })
    );
    const { result } = renderHook(() => useGraphLoader(LIVE));
    act(() => {
      result.current.run(() => '/api/v1/graph');
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('loading');
    });
    act(() => {
      result.current.cancel();
    });
    expect(result.current.state.status).toBe('idle');
    expect(result.current.state.cancelled).toBe(true);
    expect(result.current.state.error).toBeUndefined();
    expect(result.current.state.hasPayload).toBe(false);
  });

  it('a late response after cancel or unmount changes nothing', async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result, unmount } = renderHook(() => useGraphLoader(LIVE));
    act(() => {
      result.current.run(() => '/api/v1/graph');
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    act(() => {
      result.current.cancel();
    });
    expect(result.current.state.cancelled).toBe(true);
    expect(result.current.state.status).toBe('idle');
    await act(async () => {
      resolveFetch?.(jsonResponse(SHOWCASE_GRAPH));
      await Promise.resolve();
    });
    expect(result.current.state.status).toBe('idle');
    expect(result.current.state.hasPayload).toBe(false);
    expect(result.current.state.cancelled).toBe(true);

    let resolveSecond: ((value: Response) => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveSecond = resolve;
        })
    );
    act(() => {
      result.current.run(() => '/api/v1/graph');
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    unmount();
    await act(async () => {
      resolveSecond?.(jsonResponse(SHOWCASE_GRAPH));
      await Promise.resolve();
    });
    expect(result.current.state.status).toBe('loading');
  });

  it('does not auto-refresh when the interval is 0', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SHOWCASE_GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useGraphLoader({ demoMode: false, refreshIntervalSeconds: 0 }));
    act(() => {
      result.current.run(() => '/api/v1/graph');
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not tick before the first run, ticks after, and stops after cancel until the next run', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SHOWCASE_GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useGraphLoader({ demoMode: false, refreshIntervalSeconds: 30 }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      result.current.run(() => '/api/v1/graph');
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockImplementation((_url: RequestInfo | URL, init?: RequestInit) => {
      void init;
      return new Promise<Response>(() => undefined);
    });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    act(() => {
      result.current.cancel();
    });
    await act(async () => {
      vi.advanceTimersByTime(90_000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    fetchMock.mockResolvedValue(jsonResponse(SHOWCASE_GRAPH));
    act(() => {
      result.current.run(() => '/api/v1/graph');
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it.each([
    ['an HTTP 502', () => Promise.resolve(new Response('upstream not ready', { status: 502 }))],
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('keeps ticking when the first request after run fails with %s, so a later tick recovers', async (_label, fail) => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const fetchMock = vi.fn().mockImplementationOnce(fail).mockResolvedValue(jsonResponse(SHOWCASE_GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useGraphLoader({ demoMode: false, refreshIntervalSeconds: 30 }));
    act(() => {
      result.current.run(() => '/api/v1/graph');
    });
    await settle();
    expect(result.current.state.status).toBe('error');
    expect(result.current.state.hasPayload).toBe(false);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await settle();
    expect(result.current.state.status).toBe('ready');
    expect(result.current.state.error).toBeUndefined();
    expect(result.current.state.hasPayload).toBe(true);
  });

  it('re-reads the clock on a refresh, so a relative window does not age', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SHOWCASE_GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    let now = NOW_MS;
    const range: ViewTimeRange = { kind: 'relative', window: '1h' };
    const { result } = renderHook(() => useGraphLoader(LIVE));
    act(() => {
      result.current.run(() => buildGraphRequestUrl('/api/v1/graph', range, DEFAULT_GRAPH_FILTERS, now));
    });
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

  it('issues a request with a new window when run is called with a new selection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SHOWCASE_GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useGraphLoader(LIVE));
    act(() => {
      result.current.run(() =>
        buildGraphRequestUrl('/api/v1/graph', { kind: 'relative', window: '1h' }, DEFAULT_GRAPH_FILTERS, NOW_MS)
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    act(() => {
      result.current.run(() =>
        buildGraphRequestUrl('/api/v1/graph', { kind: 'relative', window: '6h' }, DEFAULT_GRAPH_FILTERS, NOW_MS)
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const first = requestedWindow(fetchMock, 0);
    const second = requestedWindow(fetchMock, 1);
    expect(second.start).toBe(first.start - 5 * 3600);
    expect(second.end).toBe(first.end);
  });

  it('aborts an in-flight request on unmount and does not update afterwards', async () => {
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { unmount, result } = renderHook(() => useGraphLoader(LIVE));
    act(() => {
      result.current.run(() => '/api/v1/graph');
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(result.current.state.status).toBe('loading');
    unmount();
    expect(signal?.aborted).toBe(true);
    expect(result.current.state.status).toBe('loading');
  });

  it('clears the auto-refresh timer on unmount', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SHOWCASE_GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const { result, unmount } = renderHook(() => useGraphLoader({ demoMode: false, refreshIntervalSeconds: 30 }));
    act(() => {
      result.current.run(() => '/api/v1/graph');
    });
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
