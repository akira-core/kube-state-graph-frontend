import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchEdgeTypes, parseEdgeTypes } from './edgeTypes';

const CATALOGUE = {
  apiVersion: 'v1',
  edge_types: [
    { type: 'pod-calls-pod', description: 'a', directed: true },
    { type: 'pvc-to-netapp-aggr', description: 'b', directed: true },
  ],
};

describe('parseEdgeTypes', () => {
  it('reads the registered types', () => {
    expect(parseEdgeTypes('/u', CATALOGUE)).toEqual({ ok: true, types: ['pod-calls-pod', 'pvc-to-netapp-aggr'] });
  });

  it('reports a malformed catalogue rather than offering a short list', () => {
    expect(parseEdgeTypes('/u', 'nope').ok).toBe(false);
    expect(parseEdgeTypes('/u', { apiVersion: 'v1' }).ok).toBe(false);
    expect(parseEdgeTypes('/u', { edge_types: [{ description: 'no type' }] }).ok).toBe(false);
  });
});

describe('fetchEdgeTypes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the catalogue on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(CATALOGUE), { headers: { 'Content-Type': 'application/json' } }))
    );
    await expect(fetchEdgeTypes('/api/v1/edge-types')).resolves.toEqual({
      ok: true,
      types: ['pod-calls-pod', 'pvc-to-netapp-aggr'],
    });
  });

  it('reports a failure rather than throwing into the caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    const result = await fetchEdgeTypes('/api/v1/edge-types');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem).toContain('500');
  });
});
