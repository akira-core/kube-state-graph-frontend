import { withQuery } from '../../shared/http/fetchJson';
import { resolveViewTimeRange, type ViewTimeRange } from '../../shared/time/viewTimeRange';

/** Which end of the traced traffic to follow from the starting switch. */
export type TraceDirection = 'source' | 'destination';

/** A switch-trace request as the backend understands it — already typed, never raw form strings. */
export interface TraceQuery {
  /** The starting switch. Required and non-empty; the loader must not fire without it. */
  hostname: string;
  /** How many interface hops to follow at most. Positive integer. */
  maxHops: number;
  /** How many of each hop's busiest interfaces to follow. Positive integer. */
  topN: number;
  /** Contribution floor, in percent of the hop's delta, below which an interface is not followed. [0, 100]. */
  threshold: number;
  trackDir: TraceDirection;
}

/** Backend defaults, shared by the form (empty = default) and the request builder. */
export const TRACE_DEFAULTS = { maxHops: 7, topN: 3, threshold: 10, trackDir: 'source' } as const;

const MS_PER_SECOND = 1000;

/**
 * Compose a switch-trace request. Returns `undefined` when `hostname` is blank — the
 * backend has no starting point without one, so the loader must not fire.
 *
 * All seven parameters are ALWAYS sent, defaults included: the backend need not guess,
 * and the access log shows exactly what was asked. The window is resolved at call time
 * (a relative range re-reads the clock) and — unlike every other endpoint, which takes
 * epoch SECONDS — sent as epoch MILLISECONDS, which is what the trace backend expects.
 * The ×1000 happens here and nowhere else; the URL bar's `from` / `to` stay in seconds.
 */
export function buildTraceRequestUrl(
  traceEndpoint: string,
  range: ViewTimeRange,
  query: TraceQuery,
  nowMs: number = Date.now()
): string | undefined {
  const hostname = query.hostname.trim();
  if (hostname === '') {
    return undefined;
  }
  const { fromUnixSeconds, toUnixSeconds } = resolveViewTimeRange(range, nowMs);
  return withQuery(traceEndpoint, {
    hostname,
    from_ts: fromUnixSeconds * MS_PER_SECOND,
    to_ts: toUnixSeconds * MS_PER_SECOND,
    max_hops: query.maxHops,
    top_n: query.topN,
    threshold: query.threshold,
    track_dir: query.trackDir,
  });
}
