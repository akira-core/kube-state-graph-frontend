import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useNodeDashboardUrl } from './useNodeDashboardUrl';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('useNodeDashboardUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not fetch when the endpoint is unset', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useNodeDashboardUrl({ kind: 'pod', name: 'x' }, undefined));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('unavailable');
  });

  it('does not fetch when params are undefined (ineligible node)', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useNodeDashboardUrl(undefined, '/api/dashboard'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('unavailable');
  });

  it('becomes ready when the endpoint returns at least one url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ url: 'https://dash.example/x' })));
    const { result } = renderHook(() => useNodeDashboardUrl({ kind: 'pod', name: 'mongo-0' }, '/api/dashboard'));
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    if (result.current.status === 'ready') {
      expect(result.current.urls).toEqual([{ label: 'Dashboard', url: 'https://dash.example/x' }]);
    }
  });
  it('uses the configured endpoint verbatim, trailing slash included', async () => {
    // runtime-config: "URL values MUST be used verbatim". `/dashboard/` and `/dashboard`
    // are different routes on plenty of backends, so normalising here would silently
    // rewrite an operator's configuration.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ url: 'https://dash.example/x' }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useNodeDashboardUrl({ kind: 'pod', name: 'mongo-0' }, '/api/dashboard/'));
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    const requested = String(fetchMock.mock.calls[0]?.[0]);
    expect(requested.startsWith('/api/dashboard/?')).toBe(true);
  });
});
