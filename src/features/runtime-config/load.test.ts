import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadRuntimeConfig } from './load';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('loadRuntimeConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the validated config on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ demoMode: true })));
    const result = await loadRuntimeConfig();
    expect(result).toEqual({
      ok: true,
      path: '/config.json',
      config: {
        endpoints: {},
        demoMode: true,
        refreshIntervalSeconds: 0,
        defaultLayout: 'fcose',
        theme: 'system',
      },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/config.json', expect.objectContaining({ method: 'GET', cache: 'no-store' }));
  });

  it('reports HTTP 404 without falling back to demo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('missing', { status: 404 })));
    const result = await loadRuntimeConfig();
    expect(result).toEqual({ ok: false, path: '/config.json', problem: 'HTTP 404' });
  });

  it('reports invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{ "endpoints": ', { status: 200 })));
    const result = await loadRuntimeConfig();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem).toMatch(/JSON/i);
    }
  });

  it('reports the first validation failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ theme: 'dark' })));
    const result = await loadRuntimeConfig();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem).toContain('endpoints.graph');
    }
  });

  it('does not read the page URL query or hash to choose the config path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ demoMode: true })));
    window.history.replaceState(null, '', '/graph?config=https://evil.example/c.json#/other');
    const result = await loadRuntimeConfig();
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/config.json', expect.anything());
  });
});
