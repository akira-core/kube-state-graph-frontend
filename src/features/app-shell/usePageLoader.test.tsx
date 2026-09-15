import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHOWCASE_GRAPH } from '../../shared/fixtures/showcaseGraph';
import type { RuntimeConfig } from '../runtime-config';

import { IDLE_PAGE_STATUS, ShellFrameProvider, type PageStatus, type ShellFrameValue } from './ShellFrame';
import { useLocateFromNavigation, usePageLoader } from './usePageLoader';
import type { useViewTimeRange } from './useViewTimeRange';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const RANGE = { kind: 'relative', window: '1h' } as const;

function frame(setStatus: (s: PageStatus) => void): ShellFrameValue {
  return {
    config: { demoMode: false, endpoints: {}, refreshIntervalSeconds: 0 } as unknown as RuntimeConfig,
    time: { range: RANGE } as unknown as ReturnType<typeof useViewTimeRange>,
    status: IDLE_PAGE_STATUS,
    setStatus,
    focusMode: false,
    setFocusMode: () => undefined,
  };
}

function wrapperFor(setStatus: (s: PageStatus) => void, initialEntries?: unknown[]) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MemoryRouter initialEntries={initialEntries as never}>
        <ShellFrameProvider value={frame(setStatus)}>{children}</ShellFrameProvider>
      </MemoryRouter>
    );
  };
}

describe('usePageLoader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('demo mode primes the fixture on mount, counts as committed, and mirrors ready into the shell', async () => {
    const setStatus = vi.fn();
    const { result } = renderHook(() => usePageLoader({ demoMode: true, refreshIntervalSeconds: 0 }), {
      wrapper: wrapperFor(setStatus),
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(result.current.armed).toBe(true);
    expect(result.current.state.hasPayload).toBe(true);
    const last = setStatus.mock.calls.at(-1)?.[0] as PageStatus;
    expect(last.phase).toBe('ready');
    expect(last.reloadDisabled).toBe(false);
  });

  it('live mode issues nothing until onQuery, which arms Reload; the page flag can still disable it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SHOWCASE_GRAPH));
    vi.stubGlobal('fetch', fetchMock);
    const setStatus = vi.fn();
    const { result, rerender } = renderHook(
      ({ reloadDisabled }: { reloadDisabled: boolean }) =>
        usePageLoader({ demoMode: false, refreshIntervalSeconds: 0, reloadDisabled }),
      { wrapper: wrapperFor(setStatus), initialProps: { reloadDisabled: false } }
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.armed).toBe(false);
    expect((setStatus.mock.calls.at(-1)?.[0] as PageStatus).reloadDisabled).toBe(true);

    act(() => {
      result.current.onQuery(() => '/api/v1/graph');
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.armed).toBe(true);
    expect(result.current.inFlight).toBe(false);
    expect((setStatus.mock.calls.at(-1)?.[0] as PageStatus).reloadDisabled).toBe(false);

    rerender({ reloadDisabled: true });
    expect((setStatus.mock.calls.at(-1)?.[0] as PageStatus).reloadDisabled).toBe(true);
  });

  it('hands the shell status back to idle on unmount and runs the page teardown after it', () => {
    const calls: string[] = [];
    const setStatus = vi.fn((s: PageStatus) => {
      calls.push(s === IDLE_PAGE_STATUS ? 'idle' : 'status');
    });
    const onTeardown = vi.fn(() => {
      calls.push('teardown');
    });
    const { unmount } = renderHook(() => usePageLoader({ demoMode: false, refreshIntervalSeconds: 0, onTeardown }), {
      wrapper: wrapperFor(setStatus),
    });
    unmount();
    expect(calls.at(-2)).toBe('idle');
    expect(calls.at(-1)).toBe('teardown');
  });
});

describe('useLocateFromNavigation', () => {
  it('consumes a locate id from navigation state and re-commits the applied scope with the URL range', () => {
    const commit = vi.fn();
    const applied = { cluster: ['prod'] };
    const { result } = renderHook(() => useLocateFromNavigation(applied, commit, RANGE), {
      wrapper: wrapperFor(vi.fn(), [{ pathname: '/graph', search: '?from=100&to=200', state: { locate: 'pod/a' } }]),
    });
    expect(result.current.locateNodeId).toBe('pod/a');
    expect(commit).toHaveBeenCalledWith(applied, {
      kind: 'absolute',
      window: { fromUnixSeconds: 100, toUnixSeconds: 200 },
    });
    act(() => {
      result.current.onLocateConsumed();
    });
    expect(result.current.locateNodeId).toBeNull();
  });

  it('does nothing without a locate id', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useLocateFromNavigation({}, commit, RANGE), {
      wrapper: wrapperFor(vi.fn(), ['/graph']),
    });
    expect(result.current.locateNodeId).toBeNull();
    expect(commit).not.toHaveBeenCalled();
  });
});
