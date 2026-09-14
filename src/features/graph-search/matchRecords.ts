import type { ComputeHitsResult, SearchResult, SearchResultContext } from './types';

// One (field, value) pair a query token can substring-match. A multi-valued field (a node's
// `ipAddress` array, a trace leaf's clients) repeats its field name once per value, so a hit
// reports the SPECIFIC value that matched.
export interface SearchField {
  field: string;
  value: string;
}

// A searchable thing, already flattened by its view: a cytoscape node for Graph, a drawn
// card for the Sankey-style views. `fields` carries a `label` entry only when the label is a
// real one — a label-less record falls back to its id for display without that id matching.
export interface SearchRecord {
  id: string;
  label: string;
  kind?: string;
  context?: SearchResultContext;
  fields: readonly SearchField[];
}

/** Whitespace-separated, lower-cased query tokens. Empty = search inactive. */
export function tokenizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * The hit rule every search box shares (design D2 / CONTEXT.md "Hit"): whitespace-separated
 * tokens, case-insensitive substring, AND-combined across tokens (any field may satisfy any
 * one token — OR within a token). An empty (or whitespace-only) query means search is
 * inactive (no hits). Results are stably ordered by label — the single source the dropdown
 * (ResultList) caps and paginates, not a separate sort.
 */
export function matchRecords(records: Iterable<SearchRecord>, query: string): ComputeHitsResult {
  const tokens = tokenizeQuery(query);
  const hitIds = new Set<string>();
  const results: SearchResult[] = [];
  if (tokens.length === 0) {
    return { hitIds, results };
  }

  for (const record of records) {
    const matchesPerToken = tokens.map((token) =>
      record.fields.filter((entry) => entry.value.toLowerCase().includes(token))
    );
    if (matchesPerToken.some((matches) => matches.length === 0)) {
      continue; // at least one token matched nothing — AND fails
    }
    hitIds.add(record.id);

    const allMatches = matchesPerToken.flat();
    const matchedViaLabel = allMatches.some((m) => m.field === 'label');
    const nonLabelMatch = matchedViaLabel ? undefined : allMatches[0];

    results.push({
      id: record.id,
      label: record.label,
      ...(record.kind !== undefined ? { kind: record.kind } : {}),
      ...(record.context !== undefined ? { context: record.context } : {}),
      ...(nonLabelMatch !== undefined
        ? { matchedField: { field: nonLabelMatch.field, value: nonLabelMatch.value } }
        : {}),
    });
  }

  results.sort((a, b) => a.label.localeCompare(b.label));
  return { hitIds, results };
}
