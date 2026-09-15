import { describe, expect, it } from 'vitest';

import type { ViewTimeRange } from '../../shared/time/viewTimeRange';

import { buildTraceRequestUrl, TRACE_DEFAULTS, type TraceQuery } from './traceRequestUrl';

const NOW_MS = 1_767_225_600_000;
const NOW_S = NOW_MS / 1000;
const RANGE: ViewTimeRange = { kind: 'relative', window: '1h' };

function params(url: string): URLSearchParams {
  return new URLSearchParams(url.slice(url.indexOf('?') + 1));
}

function query(overrides: Partial<TraceQuery> = {}): TraceQuery {
  return { hostname: 'sw-tor-1', ...TRACE_DEFAULTS, ...overrides };
}

describe('buildTraceRequestUrl', () => {
  it('always sends all seven parameters, defaults included', () => {
    const url = buildTraceRequestUrl('/api/v1/trace', RANGE, query(), NOW_MS);
    expect(url).toBeDefined();
    const q = params(url!);
    expect([...q.keys()].sort()).toEqual(
      ['from_ts', 'hostname', 'max_hops', 'threshold', 'to_ts', 'top_n', 'track_dir'].sort()
    );
    expect(q.get('hostname')).toBe('sw-tor-1');
    expect(q.get('max_hops')).toBe('7');
    expect(q.get('top_n')).toBe('3');
    expect(q.get('threshold')).toBe('10');
    expect(q.get('track_dir')).toBe('source');
  });

  it('sends the window as 13-digit epoch milliseconds (seconds × 1000)', () => {
    const q = params(buildTraceRequestUrl('/api/v1/trace', RANGE, query(), NOW_MS)!);
    expect(q.get('from_ts')).toBe(String((NOW_S - 3600) * 1000));
    expect(q.get('to_ts')).toBe(String(NOW_S * 1000));
    expect(q.get('from_ts')).toMatch(/^\d{13}$/);
    expect(q.get('to_ts')).toMatch(/^\d{13}$/);
  });

  it('sends an absolute window in milliseconds too', () => {
    const range: ViewTimeRange = {
      kind: 'absolute',
      window: { fromUnixSeconds: 1_700_000_000, toUnixSeconds: 1_700_003_600 },
    };
    const q = params(buildTraceRequestUrl('/api/v1/trace', range, query(), NOW_MS)!);
    expect(q.get('from_ts')).toBe('1700000000000');
    expect(q.get('to_ts')).toBe('1700003600000');
  });

  it('re-reads the clock so a relative window does not freeze', () => {
    const first = params(buildTraceRequestUrl('/api/v1/trace', RANGE, query(), NOW_MS)!);
    const later = params(buildTraceRequestUrl('/api/v1/trace', RANGE, query(), NOW_MS + 30_000)!);
    expect(Number(later.get('from_ts'))).toBe(Number(first.get('from_ts')) + 30_000);
    expect(Number(later.get('to_ts'))).toBe(Number(first.get('to_ts')) + 30_000);
  });

  it('does not produce a URL when hostname is empty or whitespace', () => {
    expect(buildTraceRequestUrl('/api/v1/trace', RANGE, query({ hostname: '' }), NOW_MS)).toBeUndefined();
    expect(buildTraceRequestUrl('/api/v1/trace', RANGE, query({ hostname: '   ' }), NOW_MS)).toBeUndefined();
  });

  it('trims the hostname before sending it', () => {
    const q = params(buildTraceRequestUrl('/api/v1/trace', RANGE, query({ hostname: '  sw-tor-1 ' }), NOW_MS)!);
    expect(q.get('hostname')).toBe('sw-tor-1');
  });

  it('carries non-default values and the destination direction verbatim', () => {
    const q = params(
      buildTraceRequestUrl(
        '/api/v1/trace',
        RANGE,
        query({ maxHops: 3, topN: 5, threshold: 2.5, trackDir: 'destination' }),
        NOW_MS
      )!
    );
    expect(q.get('max_hops')).toBe('3');
    expect(q.get('top_n')).toBe('5');
    expect(q.get('threshold')).toBe('2.5');
    expect(q.get('track_dir')).toBe('destination');
  });

  it('merges with a query the endpoint already carries, replacing same-name keys', () => {
    const url = buildTraceRequestUrl('/api/v1/trace?tenant=a&hostname=stale', RANGE, query(), NOW_MS)!;
    const q = params(url);
    expect(q.get('tenant')).toBe('a');
    expect(q.getAll('hostname')).toEqual(['sw-tor-1']);
    expect(url.startsWith('/api/v1/trace?')).toBe(true);
  });
});
