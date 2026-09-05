import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useNodeDetailUrls, type NodeDetailQueryInput } from './useNodeDetailUrls';

const input: NodeDetailQueryInput = { application: 'checkout', kind: 'deployment', name: 'gateway', time: 1717500000 };
const appOk = { url: 'https://argo/app/checkout' };
const codeOk = { app: { url: 'https://x/app' }, sidecar: { url: 'https://x/sc' } };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function routeFetch(appResult: unknown, codeResult: unknown): ReturnType<typeof vi.fn> {
  return vi.fn((url: string) => {
    if (String(url).includes('config_changes')) {
      return Promise.resolve(jsonResponse(appResult));
    }
    return Promise.resolve(jsonResponse(codeResult));
  });
}

describe('useNodeDetailUrls', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefetches both endpoints when they are configured', async () => {
    const fetchMock = routeFetch(appOk, codeOk);
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() =>
      useNodeDetailUrls(input, {
        configChanges: '/api/v1/graph/config_changes',
        codeChanges: '/api/v1/graph/code_changes',
      })
    );
    await waitFor(() => {
      expect(result.current.application.status).toBe('ready');
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.enabled).toBe(true);
  });

  it('does not fetch when neither endpoint is set', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useNodeDetailUrls(input, {}));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.enabled).toBe(false);
    expect(result.current.application.status).toBe('unavailable');
  });

  it('does not fetch the missing side when only one endpoint is set', async () => {
    const fetchMock = routeFetch(appOk, codeOk);
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useNodeDetailUrls(input, { configChanges: '/api/v1/graph/config_changes' }));
    await waitFor(() => {
      expect(result.current.application.status).toBe('ready');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('config_changes');
    expect(result.current.containers.phase).toBe('settled');
  });
});
