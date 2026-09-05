import { describe, expect, it } from 'vitest';

import type { ViewTimeRange } from '../../shared/time/viewTimeRange';

import {
  buildStorageGraphRequestUrl,
  EMPTY_STORAGE_GRAPH_QUERY,
  isValidPodRoot,
  storageGraphRequestKey,
  type StorageGraphQuery,
} from './storageGraphRequestUrl';

const NOW_MS = 1_767_225_600_000;
const NOW_S = NOW_MS / 1000;
const RANGE: ViewTimeRange = { kind: 'relative', window: '1h' };

function params(url: string): URLSearchParams {
  return new URLSearchParams(url.slice(url.indexOf('?') + 1));
}

function query(overrides: Partial<StorageGraphQuery> = {}): StorageGraphQuery {
  return {
    ...EMPTY_STORAGE_GRAPH_QUERY,
    az: 'local-a',
    env: 'demo',
    ...overrides,
    roots: { ...EMPTY_STORAGE_GRAPH_QUERY.roots, ...overrides.roots },
  };
}

describe('isValidPodRoot', () => {
  it('accepts namespace/name and rejects anything else', () => {
    expect(isValidPodRoot('shop/orders-0')).toBe(true);
    expect(isValidPodRoot('orders-0')).toBe(false);
    expect(isValidPodRoot('/orders-0')).toBe(false);
    expect(isValidPodRoot('shop/')).toBe(false);
    expect(isValidPodRoot('shop/orders/0')).toBe(false);
    expect(isValidPodRoot('')).toBe(false);
  });
});

describe('buildStorageGraphRequestUrl', () => {
  it('does not produce a URL when az or env is missing', () => {
    expect(
      buildStorageGraphRequestUrl('/api/v1/storage-graph', RANGE, query({ az: undefined }), NOW_MS)
    ).toBeUndefined();
    expect(
      buildStorageGraphRequestUrl('/api/v1/storage-graph', RANGE, query({ env: undefined }), NOW_MS)
    ).toBeUndefined();
    expect(buildStorageGraphRequestUrl('/api/v1/storage-graph', RANGE, query({ az: '' }), NOW_MS)).toBeUndefined();
  });

  it('always sends start, end, and a single az / env', () => {
    const url = buildStorageGraphRequestUrl('/api/v1/storage-graph', RANGE, query(), NOW_MS);
    expect(url).toBeDefined();
    const q = params(url!);
    expect(q.get('start')).toBe(String(NOW_S - 3600));
    expect(q.get('end')).toBe(String(NOW_S));
    expect(q.getAll('az')).toEqual(['local-a']);
    expect(q.getAll('env')).toEqual(['demo']);
    expect(q.has('edge_type')).toBe(false);
    expect(q.has('prune')).toBe(false);
  });

  it('repeats root and scope parameters and encodes a pod root', () => {
    const url = buildStorageGraphRequestUrl(
      '/api/v1/storage-graph',
      RANGE,
      query({
        cluster: ['prod', 'dr'],
        namespace: ['shop'],
        roots: {
          ontap_cluster: ['ontap-prod'],
          node: ['ontap-prod-01', 'worker-0'],
          aggr: ['aggr1'],
          svm: ['svm_shop'],
          pod: ['shop/orders-0', 'orders-0'],
        },
      }),
      NOW_MS
    );
    const q = params(url!);
    expect(q.getAll('cluster')).toEqual(['prod', 'dr']);
    expect(q.getAll('namespace')).toEqual(['shop']);
    expect(q.getAll('ontap_cluster')).toEqual(['ontap-prod']);
    expect(q.getAll('node')).toEqual(['ontap-prod-01', 'worker-0']);
    expect(q.getAll('aggr')).toEqual(['aggr1']);
    expect(q.getAll('svm')).toEqual(['svm_shop']);
    expect(q.getAll('pod')).toEqual(['shop/orders-0']);
    expect(url).toContain('pod=shop%2Forders-0');
  });

  it('omits empty optional lists rather than sending blank values', () => {
    const q = params(buildStorageGraphRequestUrl('/api/v1/storage-graph', RANGE, query(), NOW_MS)!);
    for (const key of ['cluster', 'namespace', 'ontap_cluster', 'node', 'aggr', 'svm', 'pod', 'edge_type', 'prune']) {
      expect(q.has(key)).toBe(false);
    }
  });

  it('re-reads the clock so a relative window does not freeze', () => {
    const first = params(buildStorageGraphRequestUrl('/api/v1/storage-graph', RANGE, query(), NOW_MS)!);
    const later = params(buildStorageGraphRequestUrl('/api/v1/storage-graph', RANGE, query(), NOW_MS + 30_000)!);
    expect(Number(later.get('start'))).toBe(Number(first.get('start')) + 30);
    expect(Number(later.get('end'))).toBe(Number(first.get('end')) + 30);
  });
});

describe('storageGraphRequestKey', () => {
  it('is stable while only the clock moves', () => {
    expect(storageGraphRequestKey('/api/v1/storage-graph', RANGE, query())).toBe(
      storageGraphRequestKey('/api/v1/storage-graph', RANGE, query())
    );
  });

  it('changes when the selection changes, not when the clock would', () => {
    const base = storageGraphRequestKey('/api/v1/storage-graph', RANGE, query());
    expect(storageGraphRequestKey('/api/v1/storage-graph', { kind: 'relative', window: '6h' }, query())).not.toBe(base);
    expect(storageGraphRequestKey('/api/v1/storage-graph', RANGE, query({ az: 'zone-b' }))).not.toBe(base);
    expect(storageGraphRequestKey(undefined, RANGE, query())).not.toBe(base);
  });
});
