// Display formatting for the backend's edge measurements (`data.metrics`) — the RED family
// on a trace-derived call edge and the I/O family on a storage edge.
//
// Pure and dependency-free by design (design D4). `@grafana/data`'s value formatters were
// the obvious alternative, but none of them implement the rule this module exists for:
// the backend rounds to 6 significant digits and a wide query window legitimately yields
// `rate: 3.86e-7`, so any formatter that can round a non-zero value down to `0` renders
// live traffic as "no traffic". Everything here is built around never doing that.
//
// The significant-digit and byte helpers live in `shared/format/measurements` because the
// promoted node attributes need them too, and `shared/` must not import a feature.

import { RATIO_TO_PERCENT, formatBytes, formatSignificant } from '../../shared/format/measurements';

export { formatSignificant };

// Above this many milliseconds the duration reads better in seconds: `2.5 s` is grasped at
// a glance where `2500 ms` invites a decimal-place miscount.
const SECONDS_THRESHOLD_MS = 1000;

const MS_PER_SECOND = 1000;

/** Requests per second, e.g. `5 req/s`. */
export function formatRate(rate: number): string {
  return `${formatSignificant(rate)} req/s`;
}

/**
 * Failed fraction rendered as a percentage, e.g. `0.2` → `20%`.
 *
 * `0` renders as `0%` and means "measured, no failures" — the *unmeasured* case is an
 * absent field, which the caller renders as no row at all rather than as `0%`.
 */
export function formatErrorRate(errorRate: number): string {
  return `${formatSignificant(errorRate * RATIO_TO_PERCENT)}%`;
}

/** Server-observed duration, in milliseconds below 1000 and seconds at or above it. */
export function formatDurationMs(durationMs: number): string {
  if (durationMs >= SECONDS_THRESHOLD_MS) {
    return `${formatSignificant(durationMs / MS_PER_SECOND)} s`;
  }
  return `${formatSignificant(durationMs)} ms`;
}

/** Storage IOPS, e.g. `150 ops/s`. Same significant-digit rule as the RED rate. */
export function formatOps(ops: number): string {
  return `${formatSignificant(ops)} ops/s`;
}

// Harvest reports volume latency in microseconds. Below this it reads better as µs; at or
// above it, milliseconds — the same "grasped at a glance" rule formatDurationMs applies one
// unit up, so a 830 µs read stays 830 µs while a 12000 µs read becomes 12 ms.
const MS_THRESHOLD_US = 1000;

const US_PER_MS = 1000;

/** Storage latency, in microseconds below 1000 and milliseconds at or above it. */
export function formatLatencyUs(latencyUs: number): string {
  if (latencyUs >= MS_THRESHOLD_US) {
    return `${formatSignificant(latencyUs / US_PER_MS)} ms`;
  }
  return `${formatSignificant(latencyUs)} µs`;
}

/**
 * Storage throughput as a decimal byte rate, e.g. `5.24 MB/s`.
 *
 * Delegates to the shared byte ladder used by the node `usage` row so a `700 GB`
 * aggregate and a `5.24 MB/s` edge read on the same scale. The `/s` suffix is
 * attached here — `formatBytes` is a count, this is a rate.
 */
export function formatThroughputBytesPerSec(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}
