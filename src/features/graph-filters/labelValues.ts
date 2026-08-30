import { isPlainObject } from '../../shared/guards/isPlainObject';
import { fetchJson } from '../../shared/http/fetchJson';
import type { IdentityDimension } from '../../shared/types/graphFilters';

/**
 * The series the identity filters are enumerated from.
 *
 * Fixed rather than configurable on purpose. `kube_pod_info` is what defines the
 * Kubernetes pod inventory, and its label values are exactly what the backend matches on
 * when it pushes `?cluster=` / `?az=` / `?env=` / `?namespace=` into upstream queries.
 * Making the selector configurable would only create a way to point the controls at a
 * family the backend cannot filter by, producing options that select nothing.
 */
export const POD_INVENTORY_SERIES = 'kube_pod_info';

/**
 * Build the Prometheus label-values URL for one dimension.
 *
 * `base` is a Prometheus HTTP API root — the same thing a Prometheus datasource URL is.
 * The `/api/v1/...` suffix belongs to the API, not to the deployment, so the caller
 * configures the root and this owns the path.
 */
export function labelValuesUrl(base: string, dimension: IdentityDimension): string {
  const root = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${root}/api/v1/label/${dimension}/values?match%5B%5D=${POD_INVENTORY_SERIES}`;
}

export type LabelValuesResult = { ok: true; values: string[] } | { ok: false; problem: string };

/**
 * Read one dimension's options.
 *
 * Never throws (an abort aside). A filter control that cannot enumerate must come up
 * empty and say why — throwing here would reach the graph load path and turn a missing
 * dropdown into a missing graph, which is the opposite of what an operator needs to see.
 */
export async function fetchLabelValues(base: string, dimension: IdentityDimension): Promise<LabelValuesResult> {
  const url = labelValuesUrl(base, dimension);
  let payload: unknown;
  try {
    payload = await fetchJson(url);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    return { ok: false, problem: err instanceof Error ? err.message : `GET ${url} failed` };
  }
  return parseLabelValues(url, payload);
}

/**
 * Validate the Prometheus `{"status":"success","data":[…]}` envelope.
 *
 * A `status` other than `success` carries the store's own error and is reported rather
 * than read as an empty list: an empty dropdown and a failing store must not look alike.
 */
export function parseLabelValues(url: string, payload: unknown): LabelValuesResult {
  if (!isPlainObject(payload)) {
    return { ok: false, problem: `GET ${url}: response is not a JSON object` };
  }
  if (payload.status !== 'success') {
    const detail =
      typeof payload.error === 'string'
        ? payload.error
        : `unexpected status ${typeof payload.status === 'string' ? payload.status : 'missing'}`;
    return { ok: false, problem: `GET ${url}: ${detail}` };
  }
  if (!Array.isArray(payload.data)) {
    return { ok: false, problem: `GET ${url}: data is not an array` };
  }
  const values = payload.data.filter((v): v is string => typeof v === 'string');
  if (values.length !== payload.data.length) {
    return { ok: false, problem: `GET ${url}: data holds a non-string value` };
  }
  return { ok: true, values };
}
