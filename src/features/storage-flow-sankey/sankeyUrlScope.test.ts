import { describe, expect, it } from 'vitest';

import { buildSearchString } from '../../shared/url/search';

import { EMPTY_SANKEY_URL_SCOPE, parseSankeyScope, serializeSankeyScope } from './sankeyUrlScope';

function parse(raw: string): URLSearchParams {
  return new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
}

describe('sankey URL scope', () => {
  it('round-trips estate, root, narrowing and write mode', () => {
    const scope = parseSankeyScope(parse('az=zone-a&env=prod&aggr=aggr1&pod=shop%2Forders-0&mode=write'));
    expect(scope.query.az).toBe('zone-a');
    expect(scope.query.env).toBe('prod');
    expect(scope.query.roots.aggr).toEqual(['aggr1']);
    expect(scope.query.roots.pod).toEqual(['shop/orders-0']);
    expect(scope.mode).toBe('write');
    const qs = buildSearchString(serializeSankeyScope(scope), { kind: 'relative', window: '6h' });
    expect(qs).toBe('az=zone-a&env=prod&aggr=aggr1&pod=shop%2Forders-0&mode=write&from=now-6h&to=now');
  });

  it('omits the default both mode', () => {
    const qs = buildSearchString(serializeSankeyScope(EMPTY_SANKEY_URL_SCOPE), {
      kind: 'relative',
      window: '24h',
    });
    expect(qs).toBe('from=now-24h&to=now');
  });

  it('drops invalid pod roots and reports them', () => {
    const scope = parseSankeyScope(parse('az=zone-a&env=prod&pod=orders-0&aggr=aggr1'));
    expect(scope.droppedPods).toEqual(['orders-0']);
    expect(scope.query.roots.pod).toEqual([]);
    expect(scope.query.roots.aggr).toEqual(['aggr1']);
    const qs = buildSearchString(serializeSankeyScope(scope), { kind: 'relative', window: '24h' });
    expect(qs).toContain('aggr=aggr1');
    expect(qs).not.toContain('pod=');
  });

  it('treats an unknown mode as both', () => {
    expect(parseSankeyScope(parse('mode=left')).mode).toBe('both');
  });

  it('round-trips no layout key — layout is not URL state', () => {
    const scope = parseSankeyScope(parse('az=zone-a&env=prod&layout=node&group=node'));
    const qs = buildSearchString(serializeSankeyScope(scope), { kind: 'relative', window: '24h' });
    expect(qs).not.toContain('layout=');
    expect(qs).not.toContain('group=');
    expect(qs).toBe('az=zone-a&env=prod&from=now-24h&to=now');
  });

  it('strips unknown params on write', () => {
    const incoming = parse('foo=bar&az=zone-a&env=prod&from=now-1h&to=now');
    const scope = parseSankeyScope(incoming);
    expect(buildSearchString(serializeSankeyScope(scope), { kind: 'relative', window: '1h' })).toBe(
      'az=zone-a&env=prod&from=now-1h&to=now'
    );
  });
});
