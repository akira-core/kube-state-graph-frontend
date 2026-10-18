export class HttpStatusError extends Error {
  public constructor(
    public readonly url: string,
    public readonly status: number,
    public readonly reason?: string
  ) {
    super(reason === undefined ? `GET ${url} failed: ${status}` : `GET ${url} failed: ${status} — ${reason}`);
    this.name = 'HttpStatusError';
  }
}

/** How much of a backend's `reason` is carried into the error state before it is cut. */
const REASON_MAX = 300;

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * A rejected request's own explanation, shown verbatim (only length-capped). Two shapes
 * carry one: the trace endpoint's flat `{ reason }`, and the graph endpoints' nested
 * `{ error: { reason, message } }`, whose `message` is the sentence an operator reads
 * (`exactly one root kind is allowed, got aggr and pod`) and whose `reason` is only the code
 * (`invalid_scope`) — kept as the fallback. A body that is not JSON, not an object, or names
 * neither simply leaves the status message as it was.
 */
async function readReason(response: Response): Promise<string | undefined> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return undefined;
  }
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  const nested =
    typeof record.error === 'object' && record.error !== null ? (record.error as Record<string, unknown>) : {};
  const reason = nonEmptyString(record.reason) ?? nonEmptyString(nested.message) ?? nonEmptyString(nested.reason);
  if (reason === undefined) {
    return undefined;
  }
  return reason.length > REASON_MAX ? `${reason.slice(0, REASON_MAX)}…` : reason;
}

export async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new Error(`GET ${url} failed: network error`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new HttpStatusError(url, response.status, await readReason(response));
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`GET ${url} failed: JSON parse error`);
  }
}

function decodeQueryKey(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    // A malformed escape is not ours to repair — compare it as written.
    return raw;
  }
}

/**
 * Appends `params` to `url`, REPLACING any same-name key the url already carries.
 *
 * Replacing rather than appending is the whole point. `endpoints.graph` is used verbatim
 * and may legitimately carry a query of its own, but a configured `?start=…` plus this
 * request's own `start` would produce `start=old&start=new` — and a Go backend reading
 * `Query().Get("start")` takes the FIRST value, so the stale window would silently win on
 * every refresh. Pairs we do not set are left byte-for-byte as configured.
 */
export function withQuery(url: string, params: Record<string, string | string[] | number>): string {
  const queryStart = url.indexOf('?');
  const base = queryStart === -1 ? url : url.slice(0, queryStart);
  const existing = queryStart === -1 ? '' : url.slice(queryStart + 1);
  const ours = new Set(Object.keys(params));
  const kept = existing.split('&').filter((pair) => pair !== '' && !ours.has(decodeQueryKey(pair.split('=')[0] ?? '')));

  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        qs.append(key, item);
      }
    } else {
      qs.set(key, String(value));
    }
  }
  const serialized = [...kept, qs.toString()].filter((part) => part !== '').join('&');
  return serialized === '' ? base : `${base}?${serialized}`;
}
