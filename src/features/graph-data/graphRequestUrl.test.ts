import { describe, expect, it } from 'vitest';

import { DEFAULT_GRAPH_FILTERS, type GraphFilters } from '../../shared/types/graphFilters';

import { buildGraphRequestUrl, graphRequestKey } from './graphRequestUrl';

const NOW_MS = 1_767_225_600_000; // 2026-01-01T00:00:00Z
const NOW_S = NOW_MS / 1000;

function params(url: string): URLSearchParams {
  return new URLSearchParams(url.slice(url.indexOf('?') + 1));
}

describe('buildGraphRequestUrl', () => {
  it('always sends the window the backend requires', () => {
    const url = buildGraphRequestUrl(
      '/api/v1/graph',
      { kind: 'relative', window: '1h' },
      DEFAULT_GRAPH_FILTERS,
      NOW_MS
    );
    const q = params(url);
    expect(q.get('start')).toBe(String(NOW_S - 3600));
    expect(q.get('end')).toBe(String(NOW_S));
  });

  it('sends the projection even at its default, so a captured request is self-describing', () => {
    const q = params(
      buildGraphRequestUrl('/api/v1/graph', { kind: 'relative', window: '1h' }, DEFAULT_GRAPH_FILTERS, NOW_MS)
    );
    expect(q.get('prune')).toBe('true');
  });

  it('omits every unselected filter rather than sending an empty value', () => {
    const q = params(
      buildGraphRequestUrl('/api/v1/graph', { kind: 'relative', window: '1h' }, DEFAULT_GRAPH_FILTERS, NOW_MS)
    );
    for (const key of ['cluster', 'az', 'env', 'namespace', 'edge_type']) {
      expect(q.has(key)).toBe(false);
    }
  });

  it('sends every selected filter under the backend parameter name', () => {
    const filters: GraphFilters = {
      cluster: ['ksg-demo'],
      az: ['local-a'],
      env: ['demo'],
      namespace: ['shop'],
      edgeType: ['pod-calls-pod'],
      prune: false,
    };
    const q = params(buildGraphRequestUrl('/api/v1/graph', { kind: 'relative', window: '6h' }, filters, NOW_MS));
    expect(q.get('cluster')).toBe('ksg-demo');
    expect(q.get('az')).toBe('local-a');
    expect(q.get('env')).toBe('demo');
    expect(q.get('namespace')).toBe('shop');
    expect(q.get('edge_type')).toBe('pod-calls-pod');
    expect(q.get('prune')).toBe('false');
  });

  it('repeats a dimension the backend ORs rather than joining it', () => {
    const filters: GraphFilters = { ...DEFAULT_GRAPH_FILTERS, namespace: ['shop', 'platform'] };
    const q = params(buildGraphRequestUrl('/api/v1/graph', { kind: 'relative', window: '1h' }, filters, NOW_MS));
    expect(q.getAll('namespace')).toEqual(['shop', 'platform']);
  });

  it('extends an endpoint that already carries a query string', () => {
    const url = buildGraphRequestUrl(
      '/api/v1/graph?tenant=0',
      { kind: 'relative', window: '1h' },
      DEFAULT_GRAPH_FILTERS,
      NOW_MS
    );
    const q = params(url);
    expect(q.get('tenant')).toBe('0');
    expect(q.get('start')).toBe(String(NOW_S - 3600));
    expect(url.indexOf('?')).toBe(url.lastIndexOf('?'));
  });

  it('passes an absolute window through unchanged', () => {
    const q = params(
      buildGraphRequestUrl(
        '/api/v1/graph',
        { kind: 'absolute', window: { fromUnixSeconds: 100, toUnixSeconds: 200 } },
        DEFAULT_GRAPH_FILTERS,
        NOW_MS
      )
    );
    expect(q.get('start')).toBe('100');
    expect(q.get('end')).toBe('200');
  });

  it('re-reads the clock, so the same relative selection yields a later window', () => {
    const range = { kind: 'relative', window: '1h' } as const;
    const first = params(buildGraphRequestUrl('/api/v1/graph', range, DEFAULT_GRAPH_FILTERS, NOW_MS));
    const later = params(buildGraphRequestUrl('/api/v1/graph', range, DEFAULT_GRAPH_FILTERS, NOW_MS + 3_600_000));
    expect(Number(later.get('end'))).toBe(Number(first.get('end')) + 3600);
  });
});

describe('graphRequestKey', () => {
  it('is stable while only the clock moves', () => {
    const range = { kind: 'relative', window: '1h' } as const;
    expect(graphRequestKey('/api/v1/graph', range, DEFAULT_GRAPH_FILTERS)).toBe(
      graphRequestKey('/api/v1/graph', range, { ...DEFAULT_GRAPH_FILTERS })
    );
  });

  it('changes when the selection changes', () => {
    const base = graphRequestKey('/api/v1/graph', { kind: 'relative', window: '1h' }, DEFAULT_GRAPH_FILTERS);
    expect(graphRequestKey('/api/v1/graph', { kind: 'relative', window: '6h' }, DEFAULT_GRAPH_FILTERS)).not.toBe(base);
    expect(
      graphRequestKey('/api/v1/graph', { kind: 'relative', window: '1h' }, { ...DEFAULT_GRAPH_FILTERS, prune: false })
    ).not.toBe(base);
    expect(graphRequestKey(undefined, { kind: 'relative', window: '1h' }, DEFAULT_GRAPH_FILTERS)).not.toBe(base);
  });
});
