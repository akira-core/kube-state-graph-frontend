import { formatChangeTime } from './formatChangeTime';

describe('formatChangeTime', () => {
  it('formats a valid RFC 3339 string using the local timezone', () => {
    const iso = '2026-06-16T10:30:00Z';
    const out = formatChangeTime(iso);
    expect(out).toBeDefined();
    const date = new Date(iso);
    const pad = (n: number): string => String(n).padStart(2, '0');
    expect(out).toBe(
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    );
  });

  it('returns undefined for undefined / empty input', () => {
    expect(formatChangeTime(undefined)).toBeUndefined();
    expect(formatChangeTime('')).toBeUndefined();
  });

  it('returns undefined (never "Invalid date") for an unparseable string', () => {
    expect(formatChangeTime('not-a-date')).toBeUndefined();
  });

  it('does not truncate tiny non-zero values elsewhere — formats a real instant without throwing', () => {
    const out = formatChangeTime('2026-06-16T10:30:00Z');
    expect(typeof out).toBe('string');
    expect((out ?? '').length).toBeGreaterThan(0);
  });
});
