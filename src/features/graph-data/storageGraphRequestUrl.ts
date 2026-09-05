import { withQuery } from '../../shared/http/fetchJson';
import { resolveViewTimeRange, type ViewTimeRange } from '../../shared/time/viewTimeRange';

export interface StorageGraphRoots {
  ontap_cluster: string[];
  node: string[];
  aggr: string[];
  svm: string[];
  pod: string[];
}

export interface StorageGraphQuery {
  az: string | undefined;
  env: string | undefined;
  cluster: string[];
  namespace: string[];
  roots: StorageGraphRoots;
}

export const EMPTY_STORAGE_GRAPH_ROOTS: StorageGraphRoots = {
  ontap_cluster: [],
  node: [],
  aggr: [],
  svm: [],
  pod: [],
};

export const EMPTY_STORAGE_GRAPH_QUERY: StorageGraphQuery = {
  az: undefined,
  env: undefined,
  cluster: [],
  namespace: [],
  roots: EMPTY_STORAGE_GRAPH_ROOTS,
};

/**
 * A pod root the backend will accept: exactly one `/`, both sides non-empty.
 *
 * Anything else is a 400 `invalid_scope` for the WHOLE request, so the control must
 * refuse it locally rather than send it alongside otherwise-valid roots.
 */
export function isValidPodRoot(value: string): boolean {
  const slash = value.indexOf('/');
  return slash > 0 && slash === value.lastIndexOf('/') && slash < value.length - 1;
}

/**
 * Compose a storage-graph request. Returns `undefined` when `az` or `env` is missing —
 * the backend 400s those as `missing_az` / `missing_env`, so the loader must not fire.
 *
 * `start` / `end` are resolved at call time (a relative window re-reads the clock).
 * `edge_type` and `prune` are never sent. Invalid pod roots are dropped, not encoded.
 */
export function buildStorageGraphRequestUrl(
  storageGraphEndpoint: string,
  range: ViewTimeRange,
  query: StorageGraphQuery,
  nowMs: number = Date.now()
): string | undefined {
  if (query.az === undefined || query.az === '' || query.env === undefined || query.env === '') {
    return undefined;
  }
  const { fromUnixSeconds, toUnixSeconds } = resolveViewTimeRange(range, nowMs);
  const pods = query.roots.pod.filter(isValidPodRoot);
  const params: Record<string, string | string[] | number> = {
    start: fromUnixSeconds,
    end: toUnixSeconds,
    az: query.az,
    env: query.env,
    ...(query.cluster.length > 0 ? { cluster: query.cluster } : {}),
    ...(query.namespace.length > 0 ? { namespace: query.namespace } : {}),
    ...(query.roots.ontap_cluster.length > 0 ? { ontap_cluster: query.roots.ontap_cluster } : {}),
    ...(query.roots.node.length > 0 ? { node: query.roots.node } : {}),
    ...(query.roots.aggr.length > 0 ? { aggr: query.roots.aggr } : {}),
    ...(query.roots.svm.length > 0 ? { svm: query.roots.svm } : {}),
    ...(pods.length > 0 ? { pod: pods } : {}),
  };
  return withQuery(storageGraphEndpoint, params);
}

/**
 * Changes when the SELECTION changes, not when the clock moves. Same contract as
 * `graphRequestKey`: a relative window's URL is different every millisecond, so the
 * loader keys on this instead.
 */
export function storageGraphRequestKey(
  storageGraphEndpoint: string | undefined,
  range: ViewTimeRange,
  query: StorageGraphQuery
): string {
  return JSON.stringify([storageGraphEndpoint ?? null, range, query]);
}
