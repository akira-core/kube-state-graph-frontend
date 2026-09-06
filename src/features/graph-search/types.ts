// Namespace / cluster context line for a result's subline (design D2). Omitted keys mean
// the field was absent on the node — the subline renderer skips what it doesn't have.
export interface SearchResultContext {
  namespace?: string;
  cluster?: string;
}

// One row of the search dropdown list — a hit (CONTEXT.md "Result"). `matchedField` is set
// ONLY when the query matched via a field other than `label`, so the subline can explain the
// match ("ipAddress: 10.0.3.17"); when label itself matched, the namespace/cluster `context`
// is enough. `collapsedUnder` / `filterHidden` are added by the collapsedIds/visibility
// post-process pass (resolveSearchHits), not by computeHits itself.
export interface SearchResult {
  id: string;
  label: string;
  kind?: string;
  context?: SearchResultContext;
  matchedField?: { field: string; value: string };
  // Set when the hit sits inside a collapsed container: that container's id (the proxy
  // hit) — renders the "in <container> (collapsed)" annotation.
  collapsedUnder?: string;
  // True when the kind/edge/ingress filter hides this hit — rendered disabled with an
  // eye-slash marker; never locatable, and the filter is never silently overridden.
  filterHidden?: boolean;
}

export interface ComputeHitsResult {
  hitIds: Set<string>;
  results: SearchResult[];
}
