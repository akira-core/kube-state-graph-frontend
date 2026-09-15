import { TRACE_DEFAULTS, type TraceDirection, type TraceQuery } from '../graph-data';

/**
 * The Network category's form state — raw STRINGS, as the inputs hold them. Empty means
 * "use the backend default" and is not an error; a filled-in but unusable value is
 * refused at Query time with a message, never silently coerced to another number. The
 * strings round-trip through the URL verbatim so an operator's typo survives a reload
 * long enough to be seen and fixed.
 */
export interface TraceDraft {
  hostname: string;
  maxHops: string;
  topN: string;
  threshold: string;
  trackDir: TraceDirection;
}

/** What the `/network/*` URL carries: the applied draft, the Sankey's display floor, and any parse problems. */
export interface TraceUrlScope {
  query: TraceDraft;
  /** Ribbons below this many bits/s fold into the residuals. `0` = show everything. */
  minBps: number;
  /** English messages for URL values that could not be honoured. Never serialised. */
  problems: string[];
}

export const EMPTY_TRACE_DRAFT: TraceDraft = {
  hostname: '',
  maxHops: '',
  topN: '',
  threshold: '',
  trackDir: TRACE_DEFAULTS.trackDir,
};

export const EMPTY_TRACE_URL_SCOPE: TraceUrlScope = { query: EMPTY_TRACE_DRAFT, minBps: 0, problems: [] };

export const MSG_HOSTNAME_REQUIRED = 'Hostname is required';
export const MSG_MAX_HOPS = 'Max hops must be a positive integer';
export const MSG_TOP_N = 'Top N must be a positive integer';
export const MSG_THRESHOLD = 'Threshold must be a number between 0 and 100';
export const MSG_TRACK_DIR = 'Track direction must be source or destination';

// Empty → the default; anything else must parse as a finite number, else NaN so the
// caller can report it. Mirrors the form convention: blank is not a mistake.
function numberOrDefault(raw: string, fallback: number): number {
  const s = raw.trim();
  if (s === '') {
    return fallback;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

function isPositiveInteger(n: number): boolean {
  return Number.isFinite(n) && Number.isInteger(n) && n >= 1;
}

function isValidThreshold(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

function isTraceDirection(raw: string): raw is TraceDirection {
  return raw === 'source' || raw === 'destination';
}

/**
 * Display floor from a form string or a number: floored to whole bits/s, and anything
 * that is not a positive finite number (blank, junk, negative) means "no floor" (0).
 */
export function cleanMinBps(raw: string | number): number {
  const n = typeof raw === 'number' ? raw : Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) {
    return 0;
  }
  return Math.floor(n);
}

/**
 * Form strings → a typed request, or the reasons it cannot be sent. A port of
 * sankey-panel's `TraceQueryBar.buildParams` without its time fields (the shell's time
 * range owns those here). Every field is checked so the operator sees all problems at
 * once rather than one per attempt.
 */
export function buildTraceQuery(
  draft: TraceDraft
): { ok: true; query: TraceQuery } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const hostname = draft.hostname.trim();
  if (hostname === '') {
    problems.push(MSG_HOSTNAME_REQUIRED);
  }
  const maxHops = numberOrDefault(draft.maxHops, TRACE_DEFAULTS.maxHops);
  if (!isPositiveInteger(maxHops)) {
    problems.push(MSG_MAX_HOPS);
  }
  const topN = numberOrDefault(draft.topN, TRACE_DEFAULTS.topN);
  if (!isPositiveInteger(topN)) {
    problems.push(MSG_TOP_N);
  }
  const threshold = numberOrDefault(draft.threshold, TRACE_DEFAULTS.threshold);
  if (!isValidThreshold(threshold)) {
    problems.push(MSG_THRESHOLD);
  }
  if (problems.length > 0) {
    return { ok: false, problems };
  }
  return { ok: true, query: { hostname, maxHops, topN, threshold, trackDir: draft.trackDir } };
}

/**
 * URL → scope. An absent key is `''` (= default) in the draft; a present-but-unusable
 * value is kept VERBATIM in the draft and reported in `problems`, so the scope bar shows
 * the operator exactly what the URL said and the Query button stays disabled until it is
 * fixed. `track_dir` is the exception: the draft is a closed enum, so an unknown value
 * falls back to `source` with a problem. A blank hostname is unconfigured, not a problem.
 */
export function parseTraceScope(params: URLSearchParams): TraceUrlScope {
  const problems: string[] = [];
  const hostname = (params.get('hostname') ?? '').trim();
  const maxHops = params.get('max_hops') ?? '';
  if (!isPositiveInteger(numberOrDefault(maxHops, TRACE_DEFAULTS.maxHops))) {
    problems.push(MSG_MAX_HOPS);
  }
  const topN = params.get('top_n') ?? '';
  if (!isPositiveInteger(numberOrDefault(topN, TRACE_DEFAULTS.topN))) {
    problems.push(MSG_TOP_N);
  }
  const threshold = params.get('threshold') ?? '';
  if (!isValidThreshold(numberOrDefault(threshold, TRACE_DEFAULTS.threshold))) {
    problems.push(MSG_THRESHOLD);
  }
  const rawTrackDir = params.get('track_dir') ?? '';
  let trackDir: TraceDirection = TRACE_DEFAULTS.trackDir;
  if (rawTrackDir !== '') {
    if (isTraceDirection(rawTrackDir)) {
      trackDir = rawTrackDir;
    } else {
      problems.push(MSG_TRACK_DIR);
    }
  }
  return {
    query: { hostname, maxHops, topN, threshold, trackDir },
    minBps: cleanMinBps(params.get('min_bps') ?? ''),
    problems,
  };
}

// `''` and the default number are the same fact (the backend default) and neither is
// written; any other string — valid or not — is written as it stands.
function isDefaultNumber(raw: string, fallback: number): boolean {
  const s = raw.trim();
  return s === '' || Number(s) === fallback;
}

/**
 * Scope → URL pairs. Defaults are omitted (`''` and the default number alike, `source`,
 * `min_bps=0`); a non-default value is written verbatim so the draft round-trips.
 * `problems` are derived on parse and never written.
 */
export function serializeTraceScope(scope: TraceUrlScope): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const { query } = scope;
  const hostname = query.hostname.trim();
  if (hostname !== '') {
    out.push(['hostname', hostname]);
  }
  if (!isDefaultNumber(query.maxHops, TRACE_DEFAULTS.maxHops)) {
    out.push(['max_hops', query.maxHops.trim()]);
  }
  if (!isDefaultNumber(query.topN, TRACE_DEFAULTS.topN)) {
    out.push(['top_n', query.topN.trim()]);
  }
  if (!isDefaultNumber(query.threshold, TRACE_DEFAULTS.threshold)) {
    out.push(['threshold', query.threshold.trim()]);
  }
  if (query.trackDir !== TRACE_DEFAULTS.trackDir) {
    out.push(['track_dir', query.trackDir]);
  }
  const minBps = cleanMinBps(scope.minBps);
  if (minBps > 0) {
    out.push(['min_bps', String(minBps)]);
  }
  return out;
}
