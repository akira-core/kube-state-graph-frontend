export type RelativeWindow = '1h' | '6h' | '24h' | '7d';

export interface AbsoluteWindow {
  fromUnixSeconds: number;
  toUnixSeconds: number;
}

export type ViewTimeRange = { kind: 'relative'; window: RelativeWindow } | { kind: 'absolute'; window: AbsoluteWindow };

export interface ResolvedTimeRange {
  fromUnixSeconds: number;
  toUnixSeconds: number;
}

export const DEFAULT_VIEW_TIME_RANGE: ViewTimeRange = { kind: 'relative', window: '24h' };

export const VIEW_TIME_STORAGE_KEY = 'ksg.viewTimeRange';

const RELATIVE_SECONDS: Record<RelativeWindow, number> = {
  '1h': 3600,
  '6h': 6 * 3600,
  '24h': 24 * 3600,
  '7d': 7 * 24 * 3600,
};

export function resolveViewTimeRange(range: ViewTimeRange, nowMs: number = Date.now()): ResolvedTimeRange {
  if (range.kind === 'absolute') {
    return range.window;
  }
  const toUnixSeconds = Math.floor(nowMs / 1000);
  return {
    fromUnixSeconds: toUnixSeconds - RELATIVE_SECONDS[range.window],
    toUnixSeconds,
  };
}

export function parseStoredViewTimeRange(raw: string | null): ViewTimeRange {
  if (raw === null || raw === '') {
    return DEFAULT_VIEW_TIME_RANGE;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'kind' in parsed) {
      const rec = parsed as { kind?: unknown; window?: unknown };
      if (
        rec.kind === 'relative' &&
        (rec.window === '1h' || rec.window === '6h' || rec.window === '24h' || rec.window === '7d')
      ) {
        return { kind: 'relative', window: rec.window };
      }
      if (
        rec.kind === 'absolute' &&
        typeof rec.window === 'object' &&
        rec.window !== null &&
        'fromUnixSeconds' in rec.window &&
        'toUnixSeconds' in rec.window
      ) {
        const w = rec.window;
        if (typeof w.fromUnixSeconds === 'number' && typeof w.toUnixSeconds === 'number') {
          return { kind: 'absolute', window: { fromUnixSeconds: w.fromUnixSeconds, toUnixSeconds: w.toUnixSeconds } };
        }
      }
    }
  } catch {
    return DEFAULT_VIEW_TIME_RANGE;
  }
  return DEFAULT_VIEW_TIME_RANGE;
}
