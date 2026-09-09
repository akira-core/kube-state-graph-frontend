import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useFilterOptions } from './useFilterOptions';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function routed(byUrl: (url: string) => Response) {
  return vi.fn().mockImplementation((url: string) => Promise.resolve(byUrl(url)));
}

describe('useFilterOptions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enumerates every identity dimension from the pod inventory', async () => {
    vi.stubGlobal(
      'fetch',
      routed((url) => {
        if (url.includes('/label/cluster/')) return jsonResponse({ status: 'success', data: ['ksg-demo'] });
        if (url.includes('/label/az/')) return jsonResponse({ status: 'success', data: ['local-a'] });
        if (url.includes('/label/env/')) return jsonResponse({ status: 'success', data: ['demo'] });
        if (url.includes('/label/namespace/')) return jsonResponse({ status: 'success', data: ['shop'] });
        throw new Error(`unexpected request to ${url}`);
      })
    );
    const { result } = renderHook(() => useFilterOptions('/metrics-api'));
    await waitFor(() => {
      expect(result.current.cluster).toEqual(['ksg-demo']);
    });
    expect(result.current.az).toEqual(['local-a']);
    expect(result.current.env).toEqual(['demo']);
    expect(result.current.namespace).toEqual(['shop']);
    expect(result.current.problems).toEqual([]);
  });

  it('issues exactly the four label-values requests and nothing else', async () => {
    const fetchMock = routed(() => jsonResponse({ status: 'success', data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useFilterOptions('/metrics-api'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain('match%5B%5D=kube_pod_info');
      expect(String(call[0])).not.toContain('edge-types');
    }
  });

  it('one failing dimension leaves the others populated and is reported', async () => {
    vi.stubGlobal(
      'fetch',
      routed((url) =>
        url.includes('/label/az/')
          ? new Response('down', { status: 502 })
          : jsonResponse({ status: 'success', data: ['value'] })
      )
    );
    const { result } = renderHook(() => useFilterOptions('/metrics-api'));
    await waitFor(() => {
      expect(result.current.problems).toHaveLength(1);
    });
    expect(result.current.cluster).toEqual(['value']);
    expect(result.current.az).toEqual([]);
    expect(result.current.problems[0]).toContain('502');
  });

  it('consults nothing when no source is configured', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useFilterOptions(undefined));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.problems).toEqual([]);
  });
});
