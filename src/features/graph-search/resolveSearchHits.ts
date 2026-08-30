import { outermostCollapsedAncestor } from '../../shared/graph/collapsedAncestors';

import type { ComputeHitsResult, SearchResult } from './types';

export interface ResolvedSearchHits {
  // Hit node ids for miss-fade / viewport-fit (design D3/D5): a hit folded inside a
  // collapsed container is substituted by its OUTERMOST collapsed ancestor (proxy hit) —
  // the container stays lit/in-frame instead of the off-canvas node. Includes
  // filter-hidden hits too (harmless — D3): the fit hook's own `.visible()` filtering is
  // what excludes them from the fit box, not this set.
  litNodeIds: Set<string>;
  results: SearchResult[];
}

/**
 * Post-processes `computeHits`' output against live `collapsedIds` / `visibleNodeIds`
 * (design D4): annotates each result with `collapsedUnder` (proxy hit) and `filterHidden`,
 * and derives the substituted lit/fit node-id set. Pure — no cytoscape instance involved.
 */
export function resolveSearchHits(
  computed: ComputeHitsResult,
  parentById: ReadonlyMap<string, string>,
  collapsedIds: ReadonlySet<string>,
  visibleNodeIds: ReadonlySet<string>
): ResolvedSearchHits {
  const litNodeIds = new Set<string>();
  const results = computed.results.map((result): SearchResult => {
    const proxy = outermostCollapsedAncestor(parentById, result.id, collapsedIds);
    litNodeIds.add(proxy ?? result.id);
    const filterHidden = !visibleNodeIds.has(result.id);
    return {
      ...result,
      ...(proxy !== null ? { collapsedUnder: proxy } : {}),
      ...(filterHidden ? { filterHidden: true } : {}),
    };
  });
  return { litNodeIds, results };
}
