import { describe, expect, it } from 'vitest';

import {
  buildTraceQuery,
  cleanMinBps,
  EMPTY_TRACE_DRAFT,
  MSG_HOSTNAME_REQUIRED,
  MSG_MAX_HOPS,
  MSG_THRESHOLD,
  MSG_TOP_N,
  MSG_TRACK_DIR,
  parseTraceScope,
  serializeTraceScope,
  type TraceDraft,
  type TraceUrlScope,
} from './traceUrlScope';

function draft(overrides: Partial<TraceDraft> = {}): TraceDraft {
  return { ...EMPTY_TRACE_DRAFT, hostname: 'sw-tor-1', ...overrides };
}

function scope(overrides: Partial<TraceUrlScope> = {}, query: Partial<TraceDraft> = {}): TraceUrlScope {
  return { query: draft(query), minBps: 0, problems: [], ...overrides };
}

describe('parseTraceScope', () => {
  it('reads an empty URL as the unconfigured draft with no problems', () => {
    expect(parseTraceScope(new URLSearchParams(''))).toEqual({
      query: { hostname: '', maxHops: '', topN: '', threshold: '', trackDir: 'source' },
      minBps: 0,
      problems: [],
    });
  });

  it('keeps every valid value as the raw string it was given', () => {
    const parsed = parseTraceScope(
      new URLSearchParams('hostname=sw-tor-1&max_hops=3&top_n=5&threshold=2.5&track_dir=destination&min_bps=500')
    );
    expect(parsed).toEqual({
      query: { hostname: 'sw-tor-1', maxHops: '3', topN: '5', threshold: '2.5', trackDir: 'destination' },
      minBps: 500,
      problems: [],
    });
  });

  it('trims the hostname but does not treat a blank one as a problem (unconfigured, not invalid)', () => {
    const parsed = parseTraceScope(new URLSearchParams('hostname=%20%20'));
    expect(parsed.query.hostname).toBe('');
    expect(parsed.problems).toEqual([]);
  });

  it('keeps an invalid numeric value verbatim in the draft AND reports it', () => {
    const parsed = parseTraceScope(new URLSearchParams('max_hops=abc&top_n=0&threshold=101'));
    expect(parsed.query.maxHops).toBe('abc');
    expect(parsed.query.topN).toBe('0');
    expect(parsed.query.threshold).toBe('101');
    expect(parsed.problems).toEqual([MSG_MAX_HOPS, MSG_TOP_N, MSG_THRESHOLD]);
  });

  it('rejects a fractional hop count and a negative threshold', () => {
    expect(parseTraceScope(new URLSearchParams('max_hops=2.5')).problems).toEqual([MSG_MAX_HOPS]);
    expect(parseTraceScope(new URLSearchParams('threshold=-1')).problems).toEqual([MSG_THRESHOLD]);
  });

  it('accepts the threshold bounds inclusively', () => {
    expect(parseTraceScope(new URLSearchParams('threshold=0')).problems).toEqual([]);
    expect(parseTraceScope(new URLSearchParams('threshold=100')).problems).toEqual([]);
  });

  it('falls back to source for an unknown track_dir, with a problem', () => {
    const parsed = parseTraceScope(new URLSearchParams('track_dir=sideways'));
    expect(parsed.query.trackDir).toBe('source');
    expect(parsed.problems).toEqual([MSG_TRACK_DIR]);
  });

  it('cleans min_bps rather than reporting it (floor, non-positive or junk → 0)', () => {
    expect(parseTraceScope(new URLSearchParams('min_bps=1500.9')).minBps).toBe(1500);
    expect(parseTraceScope(new URLSearchParams('min_bps=-5')).minBps).toBe(0);
    expect(parseTraceScope(new URLSearchParams('min_bps=lots')).minBps).toBe(0);
    expect(parseTraceScope(new URLSearchParams('min_bps=lots')).problems).toEqual([]);
  });

  it('ignores keys it does not own', () => {
    const parsed = parseTraceScope(new URLSearchParams('hostname=sw-tor-1&from=now-1h&to=now&az=zone-a'));
    expect(parsed).toEqual(scope());
  });
});

describe('serializeTraceScope', () => {
  it('writes nothing for the unconfigured default scope', () => {
    expect(serializeTraceScope({ query: EMPTY_TRACE_DRAFT, minBps: 0, problems: [] })).toEqual([]);
  });

  it('omits every default, whether spelled as empty or as the default number', () => {
    expect(serializeTraceScope(scope({}, { maxHops: '', topN: '3', threshold: '10', trackDir: 'source' }))).toEqual([
      ['hostname', 'sw-tor-1'],
    ]);
    expect(serializeTraceScope(scope({}, { maxHops: '7', topN: '', threshold: '' }))).toEqual([
      ['hostname', 'sw-tor-1'],
    ]);
  });

  it('writes non-default values verbatim, and min_bps only when positive', () => {
    expect(
      serializeTraceScope(
        scope({ minBps: 500 }, { maxHops: '3', topN: '5', threshold: '2.5', trackDir: 'destination' })
      )
    ).toEqual([
      ['hostname', 'sw-tor-1'],
      ['max_hops', '3'],
      ['top_n', '5'],
      ['threshold', '2.5'],
      ['track_dir', 'destination'],
      ['min_bps', '500'],
    ]);
  });

  it('never writes problems, and strips unknown keys on a round trip', () => {
    const parsed = parseTraceScope(new URLSearchParams('hostname=sw-tor-1&max_hops=abc&bogus=1'));
    expect(parsed.problems).toEqual([MSG_MAX_HOPS]);
    const pairs = serializeTraceScope(parsed);
    expect(pairs.map(([key]) => key)).toEqual(['hostname', 'max_hops']);
    expect(pairs).not.toContainEqual(expect.arrayContaining(['bogus']));
  });

  it('round-trips a fully specified scope through the URL', () => {
    const original = scope({ minBps: 1500 }, { maxHops: '4', topN: '2', threshold: '0', trackDir: 'destination' });
    const url = new URLSearchParams(serializeTraceScope(original));
    expect(parseTraceScope(url)).toEqual(original);
  });

  it('round-trips an invalid value so the operator sees it after a reload', () => {
    const parsed = parseTraceScope(new URLSearchParams('hostname=sw-tor-1&threshold=200'));
    const again = parseTraceScope(new URLSearchParams(serializeTraceScope(parsed)));
    expect(again).toEqual(parsed);
    expect(again.problems).toEqual([MSG_THRESHOLD]);
  });
});

describe('buildTraceQuery', () => {
  it('fills defaults for blank fields and types the rest', () => {
    expect(buildTraceQuery(draft())).toEqual({
      ok: true,
      query: { hostname: 'sw-tor-1', maxHops: 7, topN: 3, threshold: 10, trackDir: 'source' },
    });
  });

  it('parses filled-in fields and trims the hostname', () => {
    expect(
      buildTraceQuery(
        draft({ hostname: ' sw-1 ', maxHops: ' 3', topN: '5', threshold: '2.5', trackDir: 'destination' })
      )
    ).toEqual({
      ok: true,
      query: { hostname: 'sw-1', maxHops: 3, topN: 5, threshold: 2.5, trackDir: 'destination' },
    });
  });

  it('requires a hostname', () => {
    expect(buildTraceQuery(draft({ hostname: '  ' }))).toEqual({ ok: false, problems: [MSG_HOSTNAME_REQUIRED] });
  });

  it.each([['0'], ['-1'], ['2.5'], ['abc'], ['Infinity']])('refuses max_hops=%s', (maxHops) => {
    expect(buildTraceQuery(draft({ maxHops }))).toEqual({ ok: false, problems: [MSG_MAX_HOPS] });
  });

  it.each([['0'], ['1.5'], ['x']])('refuses top_n=%s', (topN) => {
    expect(buildTraceQuery(draft({ topN }))).toEqual({ ok: false, problems: [MSG_TOP_N] });
  });

  it.each([['-0.1'], ['100.1'], ['ten'], ['NaN']])('refuses threshold=%s', (threshold) => {
    expect(buildTraceQuery(draft({ threshold }))).toEqual({ ok: false, problems: [MSG_THRESHOLD] });
  });

  it('accepts threshold 0 and 100 inclusively', () => {
    expect(buildTraceQuery(draft({ threshold: '0' })).ok).toBe(true);
    expect(buildTraceQuery(draft({ threshold: '100' })).ok).toBe(true);
  });

  it('reports every problem at once, in field order', () => {
    expect(buildTraceQuery({ hostname: '', maxHops: 'a', topN: 'b', threshold: 'c', trackDir: 'source' })).toEqual({
      ok: false,
      problems: [MSG_HOSTNAME_REQUIRED, MSG_MAX_HOPS, MSG_TOP_N, MSG_THRESHOLD],
    });
  });
});

describe('cleanMinBps', () => {
  it('floors a positive number and accepts a numeric string', () => {
    expect(cleanMinBps(1500.9)).toBe(1500);
    expect(cleanMinBps(' 42.2 ')).toBe(42);
    expect(cleanMinBps('1e3')).toBe(1000);
  });

  it('maps blank, zero, negative, non-finite and junk to 0', () => {
    expect(cleanMinBps('')).toBe(0);
    expect(cleanMinBps(0)).toBe(0);
    expect(cleanMinBps(-3)).toBe(0);
    expect(cleanMinBps(Number.NaN)).toBe(0);
    expect(cleanMinBps(Number.POSITIVE_INFINITY)).toBe(0);
    expect(cleanMinBps('lots')).toBe(0);
  });

  it('keeps a sub-1 positive value at 0 (floor), so it does not count as a floor', () => {
    expect(cleanMinBps(0.7)).toBe(0);
  });
});
