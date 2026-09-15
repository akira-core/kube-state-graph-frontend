import { describe, expect, it } from 'vitest';

import { SHOWCASE_TRACE } from '../../shared/fixtures/showcaseTrace';
import { normalizeGraph } from '../graph-data';
import { matchRecords } from '../graph-search';

import { layoutTrace } from './layout/layoutTrace';
import { deriveTrace } from './model/deriveTrace';
import { hoverPath, hoverPathMany } from './model/hoverPath';
import type { TraceModelOk } from './model/types';
import { TRACE_SAMPLES } from './testing/samples';
import { traceCardRects, traceSearchRecords } from './traceSearch';

function derive(wire: unknown, direction: 'destination' | 'source'): TraceModelOk {
  const model = deriveTrace(normalizeGraph(wire).elements, { direction });
  if (!model.ok) {
    throw new Error(model.errors.join(' / '));
  }
  return model;
}

describe('hoverPathMany', () => {
  it.each(TRACE_SAMPLES.map((s) => [s.key, s] as const))('%s: equals the union of every card’s own path', (_, s) => {
    const model = derive(s.wire, s.direction);
    const ids = model.nodes.map((n) => n.id);
    const union = { edgeIds: new Set<string>(), nodeIds: new Set<string>() };
    for (const id of ids) {
      const p = hoverPath(model, id);
      p.edgeIds.forEach((e) => union.edgeIds.add(e));
      p.nodeIds.forEach((n) => union.nodeIds.add(n));
    }
    expect(hoverPathMany(model, ids)).toEqual(union);
  });
});

describe('traceSearchRecords', () => {
  const model = derive(SHOWCASE_TRACE, 'destination');
  const geo = layoutTrace(model, { order: 'flow' });
  const records = traceSearchRecords(model, geo);

  it('has one record per placed card, each with a frame to locate', () => {
    const rects = traceCardRects(geo);
    expect(records.length).toBe(geo.nodes.size);
    expect(records.every((r) => rects.has(r.id))).toBe(true);
  });

  it('matches a pod by namespace and a leaf by any client value', () => {
    expect(matchRecords(records, 'kafka-2 stream').results.map((r) => r.id)).toEqual(['k8s/kafka-2']);
    const byIp = matchRecords(records, '10.42.7.31').results;
    expect(byIp).toHaveLength(1);
    expect(byIp[0]?.matchedField).toEqual({ field: 'ip', value: '10.42.7.31' });
    expect(byIp[0]?.kind).toBe('host');
    expect(matchRecords(records, 'lab-gpu-01 網管部').hitIds).toEqual(new Set([byIp[0]?.id]));
  });
});
