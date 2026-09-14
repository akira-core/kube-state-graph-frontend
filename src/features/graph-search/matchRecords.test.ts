import { matchRecords, tokenizeQuery, type SearchRecord } from './matchRecords';

const record = (
  id: string,
  fields: Record<string, string | string[]>,
  extra: Partial<SearchRecord> = {}
): SearchRecord => ({
  id,
  label: typeof fields.label === 'string' ? fields.label : id,
  fields: Object.entries(fields).flatMap(([field, value]) =>
    (Array.isArray(value) ? value : [value]).map((v) => ({ field, value: v }))
  ),
  ...extra,
});

describe('tokenizeQuery', () => {
  it('lower-cases and splits on any run of whitespace', () => {
    expect(tokenizeQuery('  Prod\t MONGO  ')).toEqual(['prod', 'mongo']);
    expect(tokenizeQuery('   ')).toEqual([]);
  });
});

describe('matchRecords', () => {
  it('AND-combines tokens, each satisfied by any field', () => {
    const records = [
      record('a', { label: 'mongodb-0', ontapCluster: 'prod' }),
      record('b', { label: 'mongodb-1', ontapCluster: 'dr' }),
    ];
    expect([...matchRecords(records, 'PROD mongo').hitIds]).toEqual(['a']);
  });

  it('reports the specific value of a multi-valued field that matched', () => {
    const records = [record('leaf', { label: 'host-a', ip: ['10.0.0.1', '10.0.3.17'] })];
    expect(matchRecords(records, '10.0.3').results[0]?.matchedField).toEqual({ field: 'ip', value: '10.0.3.17' });
  });

  it('omits matchedField when the label matched', () => {
    const records = [record('a', { label: 'kafka-2', role: 'kafka' })];
    expect(matchRecords(records, 'kafka').results[0]?.matchedField).toBeUndefined();
  });

  it('never matches the display-only label fallback', () => {
    const records = [record('svc-checkout', { kind: 'service' })];
    expect(matchRecords(records, 'checkout').hitIds.size).toBe(0);
    expect(matchRecords(records, 'service').results[0]?.label).toBe('svc-checkout');
  });

  it('passes kind and context through and orders by label', () => {
    const records = [
      record('z', { label: 'zebra' }, { kind: 'pod', context: { namespace: 'shop' } }),
      record('a', { label: 'alpha' }),
    ];
    const { results } = matchRecords(records, 'a');
    expect(results.map((r) => r.id)).toEqual(['a', 'z']);
    expect(results[1]).toMatchObject({ kind: 'pod', context: { namespace: 'shop' } });
  });

  it('treats an empty query as inactive', () => {
    expect(matchRecords([record('a', { label: 'a' })], ' ').hitIds.size).toBe(0);
  });
});
