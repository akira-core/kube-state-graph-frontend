import { isPlainObject } from '../../shared/guards/isPlainObject';
import { fetchJson } from '../../shared/http/fetchJson';

export type EdgeTypesResult = { ok: true; types: string[] } | { ok: false; problem: string };

/**
 * Read the backend's edge-type catalogue.
 *
 * The catalogue and the `?edge_type=` validator are the same registry upstream, so every
 * value returned here is one the backend accepts. That is the whole reason the control
 * is populated from the backend rather than from a list held here: an unregistered value
 * is rejected with a 400, and a hardcoded list that outlived a backend release would
 * offer one.
 *
 * Never throws (an abort aside), for the same reason as the label-values client: a
 * missing dropdown must not become a missing graph.
 */
export async function fetchEdgeTypes(url: string): Promise<EdgeTypesResult> {
  let payload: unknown;
  try {
    payload = await fetchJson(url);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    return { ok: false, problem: err instanceof Error ? err.message : `GET ${url} failed` };
  }
  return parseEdgeTypes(url, payload);
}

export function parseEdgeTypes(url: string, payload: unknown): EdgeTypesResult {
  if (!isPlainObject(payload)) {
    return { ok: false, problem: `GET ${url}: response is not a JSON object` };
  }
  const raw: unknown = payload.edge_types;
  if (!Array.isArray(raw)) {
    return { ok: false, problem: `GET ${url}: edge_types is not an array` };
  }
  const types = raw
    .map((entry) => (isPlainObject(entry) && typeof entry.type === 'string' ? entry.type : undefined))
    .filter((t): t is string => t !== undefined);
  if (types.length !== raw.length) {
    return { ok: false, problem: `GET ${url}: an edge_types entry carries no type` };
  }
  return { ok: true, types };
}
