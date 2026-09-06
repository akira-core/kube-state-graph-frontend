import type cytoscape from 'cytoscape';

import { computeHits } from './computeHits';

const node = (id: string, extra: Record<string, unknown> = {}): cytoscape.ElementDefinition =>
  ({ group: 'nodes', data: { id, ...extra } }) as unknown as cytoscape.ElementDefinition;
const edge = (
  id: string,
  source: string,
  target: string,
  extra: Record<string, unknown> = {}
): cytoscape.ElementDefinition =>
  ({ group: 'edges', data: { id, source, target, ...extra } }) as unknown as cytoscape.ElementDefinition;

describe('computeHits', () => {
  it('matches a single token as a case-insensitive substring of the label', () => {
    const elements = [node('p1', { label: 'mongodb-replica-0' })];
    const { hitIds, results } = computeHits(elements, 'Mongo');
    expect([...hitIds]).toEqual(['p1']);
    expect(results).toHaveLength(1);
    expect(results[0]?.label).toBe('mongodb-replica-0');
    // The match came from label — no matchedField override for the subline.
    expect(results[0]?.matchedField).toBeUndefined();
  });

  it('AND-combines whitespace tokens across DIFFERENT fields', () => {
    const elements = [
      node('a', { cluster: 'prod', label: 'mongodb-0' }),
      node('b', { cluster: 'dr', label: 'mongodb-0' }),
    ];
    const { hitIds } = computeHits(elements, 'prod mongo');
    expect([...hitIds]).toEqual(['a']);
  });

  it('matches a pod by IP address and reports it as the matched field', () => {
    const elements = [node('p1', { label: 'pod-x', ipAddress: ['10.0.3.17', '10.0.3.18'] })];
    const { hitIds, results } = computeHits(elements, '10.0.3');
    expect([...hitIds]).toEqual(['p1']);
    expect(results[0]?.matchedField).toEqual({ field: 'ipAddress', value: '10.0.3.17' });
  });

  it('never treats an edge as a hit, even when its edgeType string matches the query', () => {
    const elements = [
      node('a', { label: 'foo' }),
      node('b', { label: 'bar' }),
      edge('e1', 'a', 'b', { edgeType: 'pod-calls-pod' }),
    ];
    const { hitIds, results } = computeHits(elements, 'pod-calls-pod');
    expect(hitIds.size).toBe(0);
    expect(results).toHaveLength(0);
  });

  it('treats an empty or whitespace-only query as inactive (no hits)', () => {
    const elements = [node('p1', { label: 'mongodb-0' })];
    expect(computeHits(elements, '').hitIds.size).toBe(0);
    expect(computeHits(elements, '   ').hitIds.size).toBe(0);
  });

  it('skips missing fields defensively instead of matching against them', () => {
    const elements = [node('p1', {})]; // no label, kind, namespace, cluster, application, ipAddress
    const { hitIds } = computeHits(elements, 'anything');
    expect(hitIds.size).toBe(0);
  });

  it("falls back to id for the result's display label when data.label is absent", () => {
    // Matching still only covers the six searchable fields — `id` is not one of them
    // — so the query must hit `kind` here for this node to be a hit at all.
    const elements = [node('svc-checkout', { kind: 'service' })];
    const { results } = computeHits(elements, 'service');
    expect(results[0]?.label).toBe('svc-checkout');
  });

  it('is case-insensitive on both the query and the field value', () => {
    const elements = [node('p1', { label: 'MongoDB' })];
    expect(computeHits(elements, 'mongodb').hitIds.has('p1')).toBe(true);
    expect(computeHits(elements, 'MONGODB').hitIds.has('p1')).toBe(true);
  });

  it('is stably ordered by label', () => {
    const elements = [node('b', { label: 'zebra-pod' }), node('a', { label: 'alpha-pod' })];
    const { results } = computeHits(elements, 'pod');
    expect(results.map((r) => r.label)).toEqual(['alpha-pod', 'zebra-pod']);
  });

  it('carries namespace/cluster as context when present', () => {
    const elements = [node('p1', { label: 'mongo-0', namespace: 'shop', cluster: 'prod' })];
    const { results } = computeHits(elements, 'mongo');
    expect(results[0]?.context).toEqual({ namespace: 'shop', cluster: 'prod' });
  });
});
