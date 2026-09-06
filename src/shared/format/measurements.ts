// Numeric display helpers shared by anything that renders a measured value — the tooltip's
// RED/IO rows and the promoted node attributes both need them, and `shared/` is the only
// layer both may import from (a `shared/` module reaching into a feature would invert the
// dependency direction the feature-first layout depends on).

// Significant digits kept before the value is stringified. Three is enough to read a rate,
// a latency or a byte count at a glance and few enough that the key column stays narrow.
const SIGNIFICANT_DIGITS = 3;

/**
 * Renders a number at up to 3 significant digits with trailing zeros stripped.
 *
 * Magnitude is never lost: rounding happens through `toPrecision`, and the result is
 * stringified by `Number`, which falls back to exponent notation for magnitudes too small
 * to write out in full. A non-zero input therefore never formats as `"0"` — the property
 * holds by construction rather than by a special case.
 */
export function formatSignificant(value: number): string {
  return String(Number(value.toPrecision(SIGNIFICANT_DIGITS)));
}

// Percent conversion for a fraction-valued number. The multiplication and the `%` suffix
// are applied together by the callers so the two can never drift apart.
export const RATIO_TO_PERCENT = 100;

// Decimal (SI) byte units, matching how NetApp and kubelet report capacity — a 1 TB
// aggregate is 1e12 bytes there, so binary units would render it as `931 GiB` and invite
// a "did we lose a disk?" reading.
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'] as const;

const BYTES_PER_UNIT = 1000;

/**
 * Byte count at up to 3 significant digits with an SI unit, e.g. `700 GB`.
 *
 * Negative and non-finite inputs never reach here (normalize rejects them), and `0`
 * renders as `0 B` — a real measurement, distinct from the absent field the caller
 * renders as no row at all.
 */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  // Promote against the ROUNDED value, not the raw one: 999999 rounds to 3 significant
  // digits as 1000, so a bare `>= 1000` test renders "1000 KB" instead of "1 MB".
  while (roundsToUnitBoundary(value) && unit < BYTE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unit += 1;
  }
  return `${formatSignificant(value)} ${BYTE_UNITS[unit]}`;
}

function roundsToUnitBoundary(value: number): boolean {
  return Number(value.toPrecision(SIGNIFICANT_DIGITS)) >= BYTES_PER_UNIT;
}

/**
 * Storage usage as `<used> / <capacity> (<pct>%)`, e.g. `700 GB / 1 TB (70%)`.
 *
 * Each half is independently optional (they ride separate upstream series), so a partial
 * reading renders what it has: used-only as `700 GB used`, capacity-only as `1 TB capacity`.
 * The percentage appears only when both are present and capacity is non-zero — the same
 * condition under which normalize derives `usageRatio`, so the text row and the on-node
 * fill can never disagree about whether a percentage exists. Returns `undefined` when
 * neither half is present, so the caller emits no row rather than an empty one.
 */
export function formatUsage(usedBytes: number | undefined, capacityBytes: number | undefined): string | undefined {
  if (usedBytes === undefined && capacityBytes === undefined) {
    return undefined;
  }
  if (usedBytes === undefined) {
    return `${formatBytes(capacityBytes as number)} capacity`;
  }
  if (capacityBytes === undefined) {
    return `${formatBytes(usedBytes)} used`;
  }
  const base = `${formatBytes(usedBytes)} / ${formatBytes(capacityBytes)}`;
  if (capacityBytes === 0) {
    return base;
  }
  return `${base} (${Math.round((usedBytes / capacityBytes) * RATIO_TO_PERCENT)}%)`;
}
