import {
  formatDurationMs,
  formatErrorRate,
  formatRate,
  formatSignificant,
  formatThroughputBytesPerSec,
} from './formatEdgeMetrics';

describe('formatSignificant', () => {
  it('keeps at most 3 significant digits', () => {
    expect(formatSignificant(12.345)).toBe('12.3');
    expect(formatSignificant(1234.5)).toBe('1230');
    expect(formatSignificant(0.123456)).toBe('0.123');
  });

  it('strips trailing zeros', () => {
    // `5.00` / `3.20` read as false precision the backend never claimed.
    expect(formatSignificant(5)).toBe('5');
    expect(formatSignificant(3.2)).toBe('3.2');
    expect(formatSignificant(20)).toBe('20');
  });

  it('renders an exact zero as zero', () => {
    expect(formatSignificant(0)).toBe('0');
  });

  it('never renders a non-zero value as zero', () => {
    // The load-bearing rule. The backend rounds to 6 significant digits, so a wide query
    // window legitimately yields magnitudes this small — printing `0` would read as
    // "no traffic", the exact opposite of the truth.
    for (const value of [3.86e-7, 6.7e-8, 1e-12, 0.0004, 6.7e-6]) {
      expect(formatSignificant(value)).not.toBe('0');
      expect(Number(formatSignificant(value))).toBeGreaterThan(0);
    }
  });

  it('round-trips to the same magnitude it was given', () => {
    // Whatever notation is chosen, parsing the output back must land within 3-significant-
    // digit rounding distance (≤ 0.5% relative) of the input — the display may lose
    // digits, never orders of magnitude.
    for (const value of [3.86e-7, 45, 1234.5, 0.2]) {
      const parsed = Number(formatSignificant(value));
      expect(Math.abs(parsed - value) / value).toBeLessThan(0.005);
    }
  });
});

describe('formatRate', () => {
  it('appends the per-second unit', () => {
    expect(formatRate(5)).toBe('5 req/s');
    expect(formatRate(12.345)).toBe('12.3 req/s');
  });

  it('keeps a tiny rate visible as non-zero', () => {
    expect(formatRate(3.86e-7)).toBe('3.86e-7 req/s');
  });
});

describe('formatErrorRate', () => {
  it('converts the ratio to a percentage', () => {
    // The backend emits a fraction in [0,1]; the `%` and the ×100 are attached together
    // at the display leaf so the two can never drift apart.
    expect(formatErrorRate(0.2)).toBe('20%');
    expect(formatErrorRate(0.032)).toBe('3.2%');
    expect(formatErrorRate(1)).toBe('100%');
  });

  it('renders a measured zero as 0%', () => {
    // Distinct from the omitted case, which renders no row at all.
    expect(formatErrorRate(0)).toBe('0%');
  });

  it('keeps a tiny error ratio visible as non-zero', () => {
    const formatted = formatErrorRate(6.7e-8);
    expect(formatted).not.toBe('0%');
    expect(Number(formatted.replace('%', ''))).toBeGreaterThan(0);
  });
});

describe('formatDurationMs', () => {
  it('renders sub-second durations in milliseconds', () => {
    expect(formatDurationMs(45)).toBe('45 ms');
    expect(formatDurationMs(999)).toBe('999 ms');
    expect(formatDurationMs(0.5)).toBe('0.5 ms');
  });

  it('switches to seconds at or above 1000 ms', () => {
    // `2.5 s` is read correctly at a glance; `2500 ms` invites a decimal-place miscount.
    expect(formatDurationMs(1000)).toBe('1 s');
    expect(formatDurationMs(2500)).toBe('2.5 s');
    expect(formatDurationMs(45000)).toBe('45 s');
  });
});

describe('formatThroughputBytesPerSec', () => {
  it('formats through the shared decimal byte ladder with a /s suffix', () => {
    // Same ladder as the node usage row, so a 700 GB aggregate and a 5.24 MB/s edge
    // read on one scale. 5242880 bytes/s is the spec's harvest-shaped example.
    expect(formatThroughputBytesPerSec(5242880)).toBe('5.24 MB/s');
    expect(formatThroughputBytesPerSec(1048576)).toBe('1.05 MB/s');
  });

  it('keeps small throughputs in bytes rather than rounding them to zero', () => {
    expect(formatThroughputBytesPerSec(12)).toBe('12 B/s');
    expect(formatThroughputBytesPerSec(0)).toBe('0 B/s');
  });

  it('never renders a non-zero throughput as zero', () => {
    for (const value of [12, 0.4, 3.86e-7]) {
      const formatted = formatThroughputBytesPerSec(value);
      expect(formatted).not.toBe('0 B/s');
      expect(formatted.endsWith('/s')).toBe(true);
    }
  });
});
