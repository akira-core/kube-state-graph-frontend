import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHOWCASE_GRAPH } from '../../../shared/fixtures/showcaseGraph';

import { useGraphLoader } from './useGraphLoader';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
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
      useGraphLoader({ demoMode: true, graphUrl: 'https://ksg.example/v1/graph', refreshIntervalSeconds: 30 })
    );
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state.hasPayload).toBe(true);
    expect(result.current.state.elements.length).toBeGreaterThan(0);
  });

  it('does not fetch when the graph endpoint is unset', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() =>
      useGraphLoader({ demoMode: false, graphUrl: undefined, refreshIntervalSeconds: 0 })
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('idle');
  });

  it('fetches the configured URL and normalizes the payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(SHOWCASE_GRAPH)));
    const { result } = renderHook(() =>
      useGraphLoader({ demoMode: false, graphUrl: 'https://ksg.example/v1/graph', refreshIntervalSeconds: 0 })
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
      useGraphLoader({ demoMode: false, graphUrl: 'https://ksg.example/v1/graph', refreshIntervalSeconds: 0 })
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
      useGraphLoader({ demoMode: false, graphUrl: 'https://ksg.example/v1/graph', refreshIntervalSeconds: 0 })
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
      useGraphLoader({ demoMode: false, graphUrl: '/api/v1/graph', refreshIntervalSeconds: 0 })
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
    renderHook(() => useGraphLoader({ demoMode: false, graphUrl: '/api/v1/graph', refreshIntervalSeconds: 0 }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
