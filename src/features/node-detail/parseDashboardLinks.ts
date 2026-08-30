import { isPlainObject } from '../../shared/guards/isPlainObject';

export type DashboardLink = { label: string; url: string };

// A renderable link must resolve to an http(s) target. Relative URLs (the common
// Grafana `/d/uid/slug` form) resolve against the app origin; this also rejects
// `javascript:` / `data:` hrefs that would otherwise reach the rendered anchor.
export function resolveHttpUrl(url: string): URL | undefined {
  const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  try {
    const parsed = new URL(url, base);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// Last non-empty path segment of the resolved URL, e.g. `/d/uid/node-metrics` → `node-metrics`.
function labelFromUrl(resolved: URL): string | undefined {
  const segment = resolved.pathname.split('/').filter(Boolean).pop();
  if (segment === undefined || segment.length === 0) {
    return undefined;
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment; // malformed %-encoding — use the raw segment.
  }
}

type Candidate = { url: string; resolved: URL; explicitLabel?: string };

function toCandidate(raw: unknown): Candidate | undefined {
  if (!isPlainObject(raw) || typeof raw.url !== 'string' || raw.url.length === 0) {
    return undefined;
  }
  const resolved = resolveHttpUrl(raw.url);
  if (resolved === undefined) {
    return undefined; // non-http(s) (javascript:/data:/…) → not renderable.
  }
  const explicit = typeof raw.label === 'string' && raw.label.trim().length > 0 ? raw.label.trim() : undefined;
  return explicit === undefined ? { url: raw.url, resolved } : { url: raw.url, resolved, explicitLabel: explicit };
}

// Assigns labels AFTER invalid entries are dropped, so numbering follows display
// position (no gaps) and duplicate derived labels are disambiguated.
function labelCandidates(candidates: readonly Candidate[]): DashboardLink[] {
  const counts = new Map<string, number>();
  return candidates.map((candidate, position) => {
    const base =
      candidate.explicitLabel ??
      labelFromUrl(candidate.resolved) ??
      (position === 0 ? 'Dashboard' : `Dashboard ${position + 1}`);
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    return { label: n === 1 ? base : `${base} (${n})`, url: candidate.url };
  });
}

function parseUrlsArray(urls: unknown): DashboardLink[] | undefined {
  if (!Array.isArray(urls)) {
    return undefined;
  }
  const candidates = urls
    .map((item) => toCandidate(item))
    .filter((candidate): candidate is Candidate => candidate !== undefined);
  return candidates.length > 0 ? labelCandidates(candidates) : undefined;
}

/**
 * Normalizes a `/dashboard` response body into one or more labeled links.
 * Supports the new `{ urls: [{ label?, url }] }` shape and the legacy `{ url }`;
 * non-http(s) urls are dropped, and an empty result maps to `undefined` (unavailable).
 */
export function parseDashboardLinks(res: unknown): DashboardLink[] | undefined {
  if (!isPlainObject(res)) {
    return undefined;
  }
  const fromUrls = parseUrlsArray(res.urls);
  if (fromUrls !== undefined) {
    return fromUrls;
  }
  // Legacy single `{ url }`: fixed "Dashboard" label, same scheme gate.
  if (typeof res.url === 'string' && res.url.length > 0 && resolveHttpUrl(res.url) !== undefined) {
    return [{ label: 'Dashboard', url: res.url }];
  }
  return undefined;
}
