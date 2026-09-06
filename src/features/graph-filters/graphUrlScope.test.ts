import { describe, expect, it } from 'vitest';

import { parseTimeQuery, serializeTimeQuery } from '../../shared/time/viewTimeRange';
import { DEFAULT_GRAPH_FILTERS } from '../../shared/types/graphFilters';
import { buildSearchString } from '../../shared/url/search';

import { parseGraphScope, serializeGraphScope } from './graphUrlScope';

function parse(raw: string): URLSearchParams {
  return new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
}

describe('graph URL scope', () => {
  it('round-trips cluster, namespace and prune=false', () => {
    const filters = { ...DEFAULT_GRAPH_FILTERS, cluster: ['prod', 'dr'], namespace: ['shop'], prune: false };
    const range = { kind: 'relative' as const, window: '1h' as const };
    const qs = buildSearchString(serializeGraphScope(filters), range);
    const params = parse(qs);
    expect(parseGraphScope(params)).toEqual(filters);
    expect(parseTimeQuery(params)).toEqual(range);
    expect(qs).toBe('cluster=prod&cluster=dr&namespace=shop&prune=false&from=now-1h&to=now');
  });

  it('omits empty lists and the prune default', () => {
    const qs = buildSearchString(serializeGraphScope(DEFAULT_GRAPH_FILTERS), { kind: 'relative', window: '24h' });
    expect(qs).toBe('from=now-24h&to=now');
    expect(parseGraphScope(parse(qs))).toEqual(DEFAULT_GRAPH_FILTERS);
  });

  it('strips unknown params on the next write', () => {
    const incoming = parse('foo=bar&namespace=shop&from=now-1h&to=now');
    const filters = parseGraphScope(incoming);
    const time = parseTimeQuery(incoming) ?? { kind: 'relative' as const, window: '24h' as const };
    expect(filters.namespace).toEqual(['shop']);
    expect(buildSearchString(serializeGraphScope(filters), time)).toBe('namespace=shop&from=now-1h&to=now');
  });

  it('keeps an unlisted namespace from the URL', () => {
    expect(parseGraphScope(parse('namespace=ghost')).namespace).toEqual(['ghost']);
  });

  it('treats an invalid prune as the default', () => {
    expect(parseGraphScope(parse('prune=maybe')).prune).toBe(true);
  });

  it('ignores an inverted from/to pair as a whole', () => {
    expect(parseTimeQuery(parse('from=1700000000&to=1600000000'))).toBeUndefined();
    expect(parseTimeQuery(parse('from=now-2h&to=now'))).toBeUndefined();
    expect(parseTimeQuery(parse('from=now-1h'))).toBeUndefined();
  });

  it('serialises an absolute window as unix seconds', () => {
    const range = {
      kind: 'absolute' as const,
      window: { fromUnixSeconds: 1_700_000_000, toUnixSeconds: 1_700_003_600 },
    };
    expect(serializeTimeQuery(range)).toEqual({ from: '1700000000', to: '1700003600' });
    expect(parseTimeQuery(parse('from=1700000000&to=1700003600'))).toEqual(range);
  });
});
