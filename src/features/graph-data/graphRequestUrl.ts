import { withQuery } from '../../shared/http/fetchJson';
import { resolveViewTimeRange, type ViewTimeRange } from '../../shared/time/viewTimeRange';
import type { GraphFilters } from '../../shared/types/graphFilters';

/**
 * Compose the graph request from the configured endpoint, the time SELECTION and the
 * filter selection.
 *
 * The window is resolved here rather than passed in already resolved, so a relative
 * selection re-reads the clock on every request. A window resolved once and carried
 * around stops moving: the first refresh re-asks for the same minutes, and after long
 * enough the range falls out of the stores' retention and the backend answers with an
 * empty graph that looks exactly like a broken pipeline.
 *
 * `start` and `end` are not optional upstream — the backend answers `missing_start` /
 * `missing_end` with a 400 — so they are always sent. `prune` is always sent too, even
 * at its default, so a captured request says which projection produced it.
 */
export function buildGraphRequestUrl(
  graphEndpoint: string,
  range: ViewTimeRange,
  filters: GraphFilters,
  nowMs: number = Date.now()
): string {
  const { fromUnixSeconds, toUnixSeconds } = resolveViewTimeRange(range, nowMs);
  const params: Record<string, string | string[] | number> = {
    start: fromUnixSeconds,
    end: toUnixSeconds,
    prune: filters.prune ? 'true' : 'false',
    ...(filters.cluster.length > 0 ? { cluster: filters.cluster } : {}),
    ...(filters.az.length > 0 ? { az: filters.az } : {}),
    ...(filters.env.length > 0 ? { env: filters.env } : {}),
    ...(filters.namespace.length > 0 ? { namespace: filters.namespace } : {}),
    ...(filters.edgeType.length > 0 ? { edge_type: filters.edgeType } : {}),
  };
  return withQuery(graphEndpoint, params);
}

/**
 * A value that changes exactly when the SELECTION changes, and not when the clock moves.
 *
 * The loader reloads on this rather than on the built URL: a relative window's URL
 * differs on every render, so keying the effect on it would refetch forever.
 */
export function graphRequestKey(
  graphEndpoint: string | undefined,
  range: ViewTimeRange,
  filters: GraphFilters
): string {
  return JSON.stringify([graphEndpoint ?? null, range, filters]);
}
