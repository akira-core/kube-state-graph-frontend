import type cytoscape from 'cytoscape';

import { matchRecords, type LazySearchRecord, type SearchDescription, type SearchField } from './matchRecords';
import type { ComputeHitsResult, SearchResultContext } from './types';

// The six searchable fields (design D2 / CONTEXT.md "Hit"), in read order. `ipAddress` is a
// string ARRAY on NodeDataDefinition — expanded to one entry per address below, so a hit
// reports the SPECIFIC address that matched, not the joined array.
type ScalarField = 'label' | 'kind' | 'namespace' | 'cluster' | 'application';
const SCALAR_FIELDS: readonly ScalarField[] = ['label', 'kind', 'namespace', 'cluster', 'application'];

function readScalar(data: Record<string, unknown>, field: ScalarField): string | undefined {
  const value = data[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// Every (field, value) pair a query token could substring-match against. Fields absent or
// not a (non-empty) string are skipped defensively — free-form GraphNodeKind data means
// nothing is guaranteed (design D2).
function fieldValues(data: Record<string, unknown>): SearchField[] {
  const entries: SearchField[] = [];
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

// Built for hits only: a query runs over every node per keystroke, and most nodes miss.
function describeNode(data: Record<string, unknown>, id: string): SearchDescription {
  const kind = readScalar(data, 'kind');
  const context = buildContext(data);
  return {
    label: readScalar(data, 'label') ?? id,
    ...(kind !== undefined ? { kind } : {}),
    ...(context !== undefined ? { context } : {}),
  };
}

function* nodeRecords(elements: cytoscape.ElementDefinition[]): Generator<LazySearchRecord> {
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    if (typeof id !== 'string') {
      continue;
    }
    yield { id, fields: fieldValues(data), describe: () => describeNode(data, id) };
  }
}

/**
 * Pure hit-matching over the six searchable node fields (design D2 / CONTEXT.md "Hit"), by
 * the shared `matchRecords` rule. Nodes only: edges are never hits and never appear in the
 * result list.
 */
export function computeHits(elements: cytoscape.ElementDefinition[], query: string): ComputeHitsResult {
  return matchRecords(nodeRecords(elements), query);
}
