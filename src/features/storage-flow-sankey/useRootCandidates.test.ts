import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_SANKEY_ROOT_OPTIONS } from './deriveSankey';
import { useRootCandidates } from './useRootCandidates';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function isNamespace(url: string, ns: string): boolean {
  return url.includes(`namespace%3D%22${ns}%22`) || url.includes(`namespace="${ns}"`);
}

describe('useRootCandidates', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('issues 0 requests before a workload kind is chosen', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() =>
      useRootCandidates({
        labelValuesBase: '/prom',
        kind: 'aggr',
        namespaces: ['shop'],
        drawn: EMPTY_SANKEY_ROOT_OPTIONS,
      })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches node once per mount and does not refetch when toggling kind', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes('/label/node/')) {
        return Promise.resolve(jsonResponse({ status: 'success', data: ['worker-0', 'worker-1'] }));
      }
      if (url.includes('/label/pod/')) {
        return Promise.resolve(jsonResponse({ status: 'success', data: ['orders-0'] }));
      }
      return Promise.resolve(jsonResponse({ status: 'success', data: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(
      ({ kind }: { kind: 'node' | 'pod' | 'aggr' }) =>
        useRootCandidates({
          labelValuesBase: '/prom',
          kind,
          namespaces: ['shop'],
          drawn: EMPTY_SANKEY_ROOT_OPTIONS,
        }),
      { initialProps: { kind: 'node' as 'node' | 'pod' | 'aggr' } }
    );
    await waitFor(() => {
      expect(result.current.options.node).toEqual(['worker-0', 'worker-1']);
    });
    expect(fetchMock.mock.calls.filter((call) => urlOf(call[0]).includes('/label/node/'))).toHaveLength(1);
    rerender({ kind: 'pod' });
    await waitFor(() => {
      expect(result.current.options.pod).toEqual(['shop/orders-0']);
    });
    rerender({ kind: 'node' });
    await waitFor(() => {
      expect(result.current.options.node).toEqual(['worker-0', 'worker-1']);
    });
    expect(fetchMock.mock.calls.filter((call) => urlOf(call[0]).includes('/label/node/'))).toHaveLength(1);
  });

  it('fetches pod values once per namespace in <ns>/<pod> shape', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes('namespace%3D%22shop%22') || url.includes('namespace="shop"')) {
        return Promise.resolve(jsonResponse({ status: 'success', data: ['orders-0', 'catalog-0'] }));
      }
      if (url.includes('namespace%3D%22infra%22') || url.includes('namespace="infra"')) {
        return Promise.resolve(jsonResponse({ status: 'success', data: ['prom-0'] }));
      }
      return Promise.resolve(jsonResponse({ status: 'success', data: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() =>
      useRootCandidates({
        labelValuesBase: '/prom',
        kind: 'pod',
        namespaces: ['shop', 'infra'],
        drawn: EMPTY_SANKEY_ROOT_OPTIONS,
      })
    );
    await waitFor(() => {
      expect(result.current.options.pod).toEqual(['infra/prom-0', 'shop/catalog-0', 'shop/orders-0']);
    });
    expect(fetchMock.mock.calls.filter((call) => urlOf(call[0]).includes('/label/pod/'))).toHaveLength(2);
  });

  it('a failed source yields an empty list plus a problem line', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 502 })));
    const { result } = renderHook(() =>
      useRootCandidates({
        labelValuesBase: '/prom',
        kind: 'node',
        namespaces: [],
        drawn: EMPTY_SANKEY_ROOT_OPTIONS,
      })
    );
    await waitFor(() => {
      expect(result.current.problems.length).toBeGreaterThan(0);
    });
    expect(result.current.options.node).toEqual([]);
    expect(result.current.problems[0]).toContain('502');
  });

  it('retries a failed node lookup on the next switch to node instead of caching it empty', async () => {
    const fetchMock = vi
      .fn(() => Promise.resolve(jsonResponse({ status: 'success', data: ['worker-0'] })))
      .mockImplementationOnce(() => Promise.resolve(new Response('nope', { status: 502 })));
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(
      ({ kind }: { kind: 'node' | 'aggr' }) =>
        useRootCandidates({
          labelValuesBase: '/prom',
          kind,
          namespaces: [],
          drawn: EMPTY_SANKEY_ROOT_OPTIONS,
        }),
      { initialProps: { kind: 'node' as 'node' | 'aggr' } }
    );
    await waitFor(() => {
      expect(result.current.problems).toHaveLength(1);
    });
    expect(result.current.options.node).toEqual([]);

    rerender({ kind: 'aggr' });
    rerender({ kind: 'node' });
    await waitFor(() => {
      expect(result.current.options.node).toEqual(['worker-0']);
    });
    expect(result.current.problems).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a failed namespace on the next pod pass instead of caching it empty', async () => {
    const fetchMock = vi
      .fn((input: RequestInfo | URL) => {
        const url = urlOf(input);
        const data = isNamespace(url, 'shop') ? ['orders-0'] : isNamespace(url, 'infra') ? ['prom-0'] : [];
        return Promise.resolve(jsonResponse({ status: 'success', data }));
      })
      .mockImplementationOnce(() => Promise.resolve(new Response('nope', { status: 502 })));
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(
      ({ namespaces }: { namespaces: string[] }) =>
        useRootCandidates({
          labelValuesBase: '/prom',
          kind: 'pod',
          namespaces,
          drawn: EMPTY_SANKEY_ROOT_OPTIONS,
        }),
      { initialProps: { namespaces: ['shop'] } }
    );
    await waitFor(() => {
      expect(result.current.problems).toHaveLength(1);
    });
    expect(result.current.options.pod).toEqual([]);

    rerender({ namespaces: ['shop', 'infra'] });
    await waitFor(() => {
      expect(result.current.options.pod).toEqual(['infra/prom-0', 'shop/orders-0']);
    });
    expect(result.current.problems).toEqual([]);
    expect(fetchMock.mock.calls.filter((call) => isNamespace(urlOf(call[0]), 'shop'))).toHaveLength(2);
  });

  it('requests every namespace at once rather than one after another', async () => {
    const pending: Array<(value: Response) => void> = [];
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          pending.push(resolve);
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() =>
      useRootCandidates({
        labelValuesBase: '/prom',
        kind: 'pod',
        namespaces: ['shop', 'billing', 'search'],
        drawn: EMPTY_SANKEY_ROOT_OPTIONS,
      })
    );
    // All three are in flight before any of them has answered.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    expect(pending).toHaveLength(3);
  });

  it('does not serve one endpoint’s cached names for another', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = urlOf(input);
      const data = url.startsWith('/prom-b') ? ['b-node'] : ['a-node'];
      return Promise.resolve(jsonResponse({ status: 'success', data }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(
      ({ base }: { base: string }) =>
        useRootCandidates({ labelValuesBase: base, kind: 'node', namespaces: [], drawn: EMPTY_SANKEY_ROOT_OPTIONS }),
      { initialProps: { base: '/prom-a' } }
    );
    await waitFor(() => {
      expect(result.current.options.node).toEqual(['a-node']);
    });
    rerender({ base: '/prom-b' });
    await waitFor(() => {
      expect(result.current.options.node).toEqual(['b-node']);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts the requests a kind switch made obsolete', async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>(() => {
          if (init?.signal !== undefined && init.signal !== null) {
            signals.push(init.signal);
          }
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = renderHook(
      ({ kind }: { kind: 'node' | 'pod' | 'aggr' }) =>
        useRootCandidates({ labelValuesBase: '/prom', kind, namespaces: ['shop'], drawn: EMPTY_SANKEY_ROOT_OPTIONS }),
      { initialProps: { kind: 'pod' as 'node' | 'pod' | 'aggr' } }
    );
    await waitFor(() => {
      expect(signals).toHaveLength(1);
    });
    rerender({ kind: 'aggr' });
    expect(signals[0]?.aborted).toBe(true);
  });
});
