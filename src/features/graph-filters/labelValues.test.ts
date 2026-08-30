import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchLabelValues, labelValuesUrl, parseLabelValues } from './labelValues';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('labelValuesUrl', () => {
  it('appends the Prometheus label path and the inventory selector to the base', () => {
    expect(labelValuesUrl('/metrics-api', 'cluster')).toBe(
      '/metrics-api/api/v1/label/cluster/values?match%5B%5D=kube_pod_info'
    );
  });

  it('does not double the separator when the base ends in a slash', () => {
    expect(labelValuesUrl('https://vm.example/prometheus/', 'namespace')).toBe(
      'https://vm.example/prometheus/api/v1/label/namespace/values?match%5B%5D=kube_pod_info'
    );
  });
});

describe('parseLabelValues', () => {
  it('reads the values out of a success envelope', () => {
    expect(parseLabelValues('/u', { status: 'success', data: ['ksg-demo'] })).toEqual({
      ok: true,
      values: ['ksg-demo'],
    });
  });

  it('reports a non-success status instead of reading it as no options', () => {
    const result = parseLabelValues('/u', { status: 'error', error: 'store unavailable' });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem).toContain('store unavailable');
  });

  it('reports a malformed body', () => {
    expect(parseLabelValues('/u', 'not json object').ok).toBe(false);
    expect(parseLabelValues('/u', { status: 'success' }).ok).toBe(false);
    expect(parseLabelValues('/u', { status: 'success', data: 'ksg-demo' }).ok).toBe(false);
    expect(parseLabelValues('/u', { status: 'success', data: ['ok', 7] }).ok).toBe(false);
  });

  it('accepts an empty option list — an estate can genuinely carry none', () => {
    expect(parseLabelValues('/u', { status: 'success', data: [] })).toEqual({ ok: true, values: [] });
  });
});

describe('fetchLabelValues', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the values on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 'success', data: ['shop', 'platform'] })));
    await expect(fetchLabelValues('/metrics-api', 'namespace')).resolves.toEqual({
      ok: true,
      values: ['shop', 'platform'],
    });
  });

  it('reports a network failure rather than throwing into the caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const result = await fetchLabelValues('/metrics-api', 'cluster');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem).toContain('network error');
  });

  it('reports an HTTP failure rather than throwing into the caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 502 })));
    const result = await fetchLabelValues('/metrics-api', 'az');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem).toContain('502');
  });

  it('re-throws an abort so a superseded request is not reported as a failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    await expect(fetchLabelValues('/metrics-api', 'env')).rejects.toBeInstanceOf(DOMException);
  });
});
