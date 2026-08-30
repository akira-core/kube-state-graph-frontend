import { buildParentIndex } from '../../shared/graph/collapsedAncestors';

import { computeHits } from './computeHits';
import { resolveSearchHits } from './resolveSearchHits';

const node = (id: string, extra: Record<string, unknown> = {}) => ({ group: 'nodes' as const, data: { id, ...extra } });

// app > ctrl > pod, plus a lone unrelated service.
const elements = [
  node('cluster', {}),
  node('app', { label: 'checkout', parent: 'cluster' }),
  node('ctrl', { label: 'mongo', parent: 'app' }),
  node('pod', { label: 'mongo-0', parent: 'ctrl' }),
  node('svc', { label: 'mongo-svc', kind: 'service', parent: 'cluster' }),
];
const parentById = buildParentIndex(elements);

describe('resolveSearchHits', () => {
  it('leaves results/lit set untouched when nothing is collapsed and everything is visible', () => {
    const computed = computeHits(elements, 'mongo-0');
    const visibleNodeIds = new Set(elements.map((e) => e.data.id));
    const { results, litNodeIds } = resolveSearchHits(computed, parentById, new Set(), visibleNodeIds);
    expect(results).toHaveLength(1);
    expect(results[0]?.collapsedUnder).toBeUndefined();
    expect(results[0]?.filterHidden).toBeUndefined();
    expect([...litNodeIds]).toEqual(['pod']);
  });

  it('annotates a hit folded inside a collapsed container with its OUTERMOST collapsed ancestor', () => {
    const computed = computeHits(elements, 'mongo-0');
    const visibleNodeIds = new Set(elements.map((e) => e.data.id));
    const { results, litNodeIds } = resolveSearchHits(computed, parentById, new Set(['ctrl', 'app']), visibleNodeIds);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('pod');
    expect(results[0]?.collapsedUnder).toBe('app');
    // The proxy container substitutes for the hidden pod in the lit/fit set — the pod
    // itself (folded off canvas) is never in it.
    expect([...litNodeIds]).toEqual(['app']);
  });

  it('marks a hit disabled (filterHidden) when the kind/edge/ingress filter hides it, but keeps it listed', () => {
    const computed = computeHits(elements, 'mongo-svc');
    const visibleNodeIds = new Set(['cluster', 'app', 'ctrl', 'pod']); // svc filtered out
    const { results, litNodeIds } = resolveSearchHits(computed, parentById, new Set(), visibleNodeIds);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('svc');
    expect(results[0]?.filterHidden).toBe(true);
    // Still included in the lit set (D3: harmless on an invisible element); the
    // fit hook's own .visible() filtering is what excludes it from the fit box.
    expect(litNodeIds.has('svc')).toBe(true);
  });
});
