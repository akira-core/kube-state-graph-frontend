import { DEFAULT_GRAPH_FILTERS, type GraphFilters } from '../../shared/types/graphFilters';

/** Canonical Graph query keys, excluding the shared `from`/`to`. */
export const GRAPH_SCOPE_KEYS = ['cluster', 'az', 'env', 'namespace', 'edge_type', 'prune'] as const;

/**
 * Graph page scope. Unknown keys are ignored here; the writer strips them.
 * `prune` is true unless the URL carries the literal `false`.
 */
export function parseGraphScope(params: URLSearchParams): GraphFilters {
  const pruneValues = params.getAll('prune');
  let prune = true;
  if (pruneValues.length > 0) {
    const last = pruneValues[pruneValues.length - 1];
    if (last === 'false') {
      prune = false;
    } else if (last === 'true') {
      prune = true;
    }
  }
  return {
    cluster: params.getAll('cluster'),
    az: params.getAll('az'),
    env: params.getAll('env'),
    namespace: params.getAll('namespace'),
    edgeType: params.getAll('edge_type'),
    prune,
  };
}

/** Defaults omitted: empty lists and `prune=true` are not written. */
export function serializeGraphScope(filters: GraphFilters): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const value of filters.cluster) {
    out.push(['cluster', value]);
  }
  for (const value of filters.az) {
    out.push(['az', value]);
  }
  for (const value of filters.env) {
    out.push(['env', value]);
  }
  for (const value of filters.namespace) {
    out.push(['namespace', value]);
  }
  for (const value of filters.edgeType) {
    out.push(['edge_type', value]);
  }
  if (!filters.prune) {
    out.push(['prune', 'false']);
  }
  return out;
}

export function graphScopeIsDefault(filters: GraphFilters): boolean {
  return (
    filters.cluster.length === 0 &&
    filters.az.length === 0 &&
    filters.env.length === 0 &&
    filters.namespace.length === 0 &&
    filters.edgeType.length === 0 &&
    filters.prune === DEFAULT_GRAPH_FILTERS.prune
  );
}
