import { formatBitsPerSec, formatBytes, formatDeltaBps, formatSignificant, formatUsage } from './measurements';

describe('formatSignificant', () => {
  it('keeps at most 3 significant digits and strips trailing zeros', () => {
    expect(formatSignificant(12.345)).toBe('12.3');
    expect(formatSignificant(5)).toBe('5');
    expect(formatSignificant(0)).toBe('0');
  });
});

describe('formatBytes', () => {
  it('promotes on the rounded value so 999999 reads as 1 MB, not 1000 KB', () => {
    expect(formatBytes(999_999)).toBe('1 MB');
    expect(formatBytes(7e11)).toBe('700 GB');
    expect(formatBytes(0)).toBe('0 B');
  });
});

describe('formatUsage', () => {
  it('renders both halves with a percentage, or the half it has', () => {
    expect(formatUsage(7e11, 1e12)).toBe('700 GB / 1 TB (70%)');
    expect(formatUsage(undefined, 1e10)).toBe('10 GB capacity');
    expect(formatUsage(5e9, undefined)).toBe('5 GB used');
    expect(formatUsage(undefined, undefined)).toBeUndefined();
  });
});

describe('formatBitsPerSec', () => {
  it('climbs the SI bit-rate ladder at 3 significant digits', () => {
    expect(formatBitsPerSec(0)).toBe('0 bps');
    expect(formatBitsPerSec(12)).toBe('12 bps');
    expect(formatBitsPerSec(1500)).toBe('1.5 kbps');
    expect(formatBitsPerSec(5_000_000)).toBe('5 Mbps');
    expect(formatBitsPerSec(8_500_000_000)).toBe('8.5 Gbps');
    expect(formatBitsPerSec(1.234e12)).toBe('1.23 Tbps');
  });

  it('promotes on the ROUNDED value so 999999 reads as 1 Mbps, not 1000 kbps', () => {
    expect(formatBitsPerSec(999_999)).toBe('1 Mbps');
    expect(formatBitsPerSec(999_999_999)).toBe('1 Gbps');
  });

  it('stops at Tbps rather than inventing a larger unit', () => {
    expect(formatBitsPerSec(2.5e15)).toBe('2500 Tbps');
  });

  it('uses bits units, never the byte ladder', () => {
    // A 5 Mbps link is not five megabytes per second; the two ladders must not share a unit.
    expect(formatBitsPerSec(5_000_000)).not.toContain('MB');
    expect(formatBitsPerSec(5_000_000)).toMatch(/bps$/);
  });

  it('never renders a non-zero rate as zero', () => {
    for (const value of [0.4, 3.86e-7]) {
      expect(formatBitsPerSec(value)).not.toBe('0 bps');
    }
  });
});

describe('formatDeltaBps', () => {
  it('prefixes a positive delta with + so it cannot be read as a throughput', () => {
    expect(formatDeltaBps(8_500_000_000)).toBe('+8.5 Gbps');
    expect(formatDeltaBps(12)).toBe('+12 bps');
  });

  it('leaves an exact zero unsigned', () => {
    expect(formatDeltaBps(0)).toBe('0 bps');
  });

  it('keeps the minus sign on a negative delta (normalize never emits one, the formatter stays honest)', () => {
    expect(formatDeltaBps(-1500)).toBe('-1.5 kbps');
    expect(formatDeltaBps(-1500)).not.toContain('+');
  });
});
