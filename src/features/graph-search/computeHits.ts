import type cytoscape from 'cytoscape';

import type { ComputeHitsResult, SearchResult, SearchResultContext } from './types';

// The six searchable fields (design D2 / CONTEXT.md "Hit"), in read order. `ipAddress` is a
// string ARRAY on NodeDataDefinition — expanded to one entry per address below, so a hit
// reports the SPECIFIC address that matched, not the joined array.
type ScalarField = 'label' | 'kind' | 'namespace' | 'cluster' | 'application';
const SCALAR_FIELDS: readonly ScalarField[] = ['label', 'kind', 'namespace', 'cluster', 'application'];

interface FieldMatch {
  field: ScalarField | 'ipAddress';
  value: string;
}

function readScalar(data: Record<string, unknown>, field: ScalarField): string | undefined {
  const value = data[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// Every (field, value) pair a query token could substring-match against. Fields absent or
// not a (non-empty) string are skipped defensively — free-form GraphNodeKind data means
// nothing is guaranteed (design D2).
function fieldValues(data: Record<string, unknown>): FieldMatch[] {
  const entries: FieldMatch[] = [];
  for (const field of SCALAR_FIELDS) {
    const value = readScalar(data, field);
    if (value !== undefined) {
      entries.push({ field, value });
    }
  }
  const ipAddress = data.ipAddress;
  if (Array.isArray(ipAddress)) {
    for (const ip of ipAddress) {
      if (typeof ip === 'string' && ip.length > 0) {
        entries.push({ field: 'ipAddress', value: ip });
      }
    }
  }
  return entries;
}

function buildContext(data: Record<string, unknown>): SearchResultContext | undefined {
  const namespace = readScalar(data, 'namespace');
  const cluster = readScalar(data, 'cluster');
  if (namespace === undefined && cluster === undefined) {
    return undefined;
  }
  return {
    ...(namespace !== undefined ? { namespace } : {}),
    ...(cluster !== undefined ? { cluster } : {}),
  };
}

/**
 * Pure hit-matching over the six searchable node fields (design D2 / CONTEXT.md "Hit"):
 * whitespace-separated tokens, case-insensitive substring, AND-combined across tokens (any
 * field may satisfy any one token — OR within a token). Nodes only: edges are never hits and
 * never appear in the result list. An empty (or whitespace-only) query means search is
 * inactive (no hits). Results are stably ordered by label — the single source the dropdown
 * (ResultList) caps and paginates, not a separate sort.
 */
export function computeHits(elements: cytoscape.ElementDefinition[], query: string): ComputeHitsResult {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  const hitIds = new Set<string>();
  const results: SearchResult[] = [];
  if (tokens.length === 0) {
    return { hitIds, results };
  }

  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    if (typeof id !== 'string') {
      continue;
    }
    const values = fieldValues(data);
    const matchesPerToken = tokens.map((token) => values.filter((entry) => entry.value.toLowerCase().includes(token)));
    if (matchesPerToken.some((matches) => matches.length === 0)) {
      continue; // at least one token matched nothing — AND fails
    }
    hitIds.add(id);

    const allMatches = matchesPerToken.flat();
    const matchedViaLabel = allMatches.some((m) => m.field === 'label');
    const nonLabelMatch = matchedViaLabel ? undefined : allMatches[0];

    const label = readScalar(data, 'label') ?? id;
    const kind = readScalar(data, 'kind');
    const context = buildContext(data);
    results.push({
      id,
      label,
      ...(kind !== undefined ? { kind } : {}),
      ...(context !== undefined ? { context } : {}),
      ...(nonLabelMatch !== undefined
        ? { matchedField: { field: nonLabelMatch.field, value: nonLabelMatch.value } }
        : {}),
    });
  }

  results.sort((a, b) => a.label.localeCompare(b.label));
  return { hitIds, results };
}
