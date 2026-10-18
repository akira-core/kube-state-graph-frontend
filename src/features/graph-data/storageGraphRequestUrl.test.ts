import { describe, expect, it } from 'vitest';

import type { ViewTimeRange } from '../../shared/time/viewTimeRange';

import {
  buildStorageGraphRequestUrl,
  EMPTY_STORAGE_GRAPH_QUERY,
  EMPTY_STORAGE_GRAPH_ROOTS,
  hasAnyRoot,
  hasMixedRootKinds,
  isValidPodRoot,
  type StorageGraphQuery,
  withRootValues,
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
    roots: { ...EMPTY_STORAGE_GRAPH_QUERY.roots, aggr: ['aggr1'], ...overrides.roots },
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

  it('does not produce a URL when no root is present', () => {
    expect(
      buildStorageGraphRequestUrl('/api/v1/storage-graph', RANGE, query({ roots: EMPTY_STORAGE_GRAPH_ROOTS }), NOW_MS)
    ).toBeUndefined();
  });

  it('always sends start, end, and a single az / env', () => {
    const url = buildStorageGraphRequestUrl('/api/v1/storage-graph', RANGE, query(), NOW_MS);
    expect(url).toBeDefined();
    const q = params(url!);
    expect(q.get('start')).toBe(String(NOW_S - 3600));
    expect(q.get('end')).toBe(String(NOW_S));
    expect(q.getAll('az')).toEqual(['local-a']);
    expect(q.getAll('env')).toEqual(['demo']);
    expect(q.has('prune')).toBe(false);
  });

  it('repeats scope parameters and the values of the one root kind, and encodes a pod root', () => {
    const url = buildStorageGraphRequestUrl(
      '/api/v1/storage-graph',
      RANGE,
      query({
        cluster: ['prod', 'dr'],
        namespace: ['shop'],
        roots: { ...EMPTY_STORAGE_GRAPH_ROOTS, aggr: [], pod: ['shop/orders-0', 'orders-0', 'shop/orders-1'] },
      }),
      NOW_MS
    );
    const q = params(url!);
    expect(q.getAll('cluster')).toEqual(['prod', 'dr']);
    expect(q.getAll('namespace')).toEqual(['shop']);
    expect(q.getAll('pod')).toEqual(['shop/orders-0', 'shop/orders-1']);
    expect(url).toContain('pod=shop%2Forders-0');
  });

  it.each(['ontap_cluster', 'ontap_node', 'node', 'aggr', 'svm'] as const)(
    'sends %s as its own parameter name',
    (kind) => {
      const url = buildStorageGraphRequestUrl(
        '/api/v1/storage-graph',
        RANGE,
        query({ roots: { ...EMPTY_STORAGE_GRAPH_ROOTS, aggr: [], [kind]: ['x', 'y'] } }),
        NOW_MS
      );
      expect(params(url!).getAll(kind)).toEqual(['x', 'y']);
    }
  );

  it('does not produce a URL for two root kinds — the backend answers 400 invalid_scope', () => {
    const mixed = query({ roots: { ...EMPTY_STORAGE_GRAPH_ROOTS, aggr: ['aggr1'], pod: ['shop/orders-0'] } });
    expect(buildStorageGraphRequestUrl('/api/v1/storage-graph', RANGE, mixed, NOW_MS)).toBeUndefined();
  });

  it('does not count a blank value as a root — a bare `aggr=` is 400 missing_root', () => {
    const blank = query({ roots: { ...EMPTY_STORAGE_GRAPH_ROOTS, aggr: ['', '  '] } });
    expect(hasAnyRoot(blank.roots)).toBe(false);
    expect(buildStorageGraphRequestUrl('/api/v1/storage-graph', RANGE, blank, NOW_MS)).toBeUndefined();
    const padded = query({ roots: { ...EMPTY_STORAGE_GRAPH_ROOTS, aggr: ['', 'aggr1'] } });
    expect(params(buildStorageGraphRequestUrl('/api/v1/storage-graph', RANGE, padded, NOW_MS)!).getAll('aggr')).toEqual(
      ['aggr1']
    );
  });

  it('omits empty optional lists rather than sending blank values', () => {
    const q = params(buildStorageGraphRequestUrl('/api/v1/storage-graph', RANGE, query(), NOW_MS)!);
    for (const key of ['cluster', 'namespace', 'ontap_cluster', 'ontap_node', 'node', 'svm', 'pod', 'prune']) {
      expect(q.has(key)).toBe(false);
    }
    expect(q.get('aggr')).toBe('aggr1');
  });

  it('re-reads the clock so a relative window does not freeze', () => {
    const first = params(buildStorageGraphRequestUrl('/api/v1/storage-graph', RANGE, query(), NOW_MS)!);
    const later = params(buildStorageGraphRequestUrl('/api/v1/storage-graph', RANGE, query(), NOW_MS + 30_000)!);
    expect(Number(later.get('start'))).toBe(Number(first.get('start')) + 30);
    expect(Number(later.get('end'))).toBe(Number(first.get('end')) + 30);
  });
});

describe('root kind helpers', () => {
  it('flags only more than one non-blank kind as mixed', () => {
    expect(hasMixedRootKinds(EMPTY_STORAGE_GRAPH_ROOTS)).toBe(false);
    expect(hasMixedRootKinds({ ...EMPTY_STORAGE_GRAPH_ROOTS, aggr: ['a', 'b'] })).toBe(false);
    expect(hasMixedRootKinds({ ...EMPTY_STORAGE_GRAPH_ROOTS, aggr: ['a'], svm: [''] })).toBe(false);
    expect(hasMixedRootKinds({ ...EMPTY_STORAGE_GRAPH_ROOTS, aggr: ['a'], ontap_cluster: ['c'] })).toBe(true);
  });

  it('withRootValues keeps one kind: adding to another kind replaces, adding to the same kind appends', () => {
    const start = { ...EMPTY_STORAGE_GRAPH_ROOTS, aggr: ['aggr1'] };
    const same = withRootValues(start, 'aggr', ['aggr2', 'aggr1']);
    expect(same).toEqual({ ...EMPTY_STORAGE_GRAPH_ROOTS, aggr: ['aggr1', 'aggr2'] });
    const other = withRootValues(start, 'pod', ['shop/orders-0']);
    expect(other).toEqual({ ...EMPTY_STORAGE_GRAPH_ROOTS, pod: ['shop/orders-0'] });
    expect(start).toEqual({ ...EMPTY_STORAGE_GRAPH_ROOTS, aggr: ['aggr1'] });
  });
});
