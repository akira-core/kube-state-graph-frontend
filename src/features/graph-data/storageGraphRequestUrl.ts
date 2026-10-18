import { withQuery } from '../../shared/http/fetchJson';
import { resolveViewTimeRange, type ViewTimeRange } from '../../shared/time/viewTimeRange';

/**
 * Root values, one list per kind. The backend takes EXACTLY ONE kind per request (two or more
 * is 400 `invalid_scope`, none is 400 `missing_root`), so the draft and the request builder
 * both hold to that: see `withRootValues`, `hasMixedRootKinds` and `buildStorageGraphRequestUrl`.
 *
 * `node` is a Kubernetes node only; an ONTAP controller is `ontap_node` (a controller name sent
 * as `node` is a 200 that draws nothing).
 */
export interface StorageGraphRoots {
  ontap_cluster: string[];
  ontap_node: string[];
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
  ontap_node: [],
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

export const STORAGE_ROOT_KINDS: ReadonlyArray<keyof StorageGraphRoots> = [
  'ontap_cluster',
  'ontap_node',
  'node',
  'aggr',
  'svm',
  'pod',
];

function nonBlank(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

/** The kinds that hold at least one non-blank value. A blank value is not a root: a bare `aggr=` is `missing_root`. */
export function rootKindsInUse(roots: StorageGraphRoots): Array<keyof StorageGraphRoots> {
  return STORAGE_ROOT_KINDS.filter((kind) => nonBlank(roots[kind]).length > 0);
}

export function hasAnyRoot(roots: StorageGraphRoots): boolean {
  return rootKindsInUse(roots).length > 0;
}

/** More than one kind in use — the backend refuses it as `invalid_scope`. */
export function hasMixedRootKinds(roots: StorageGraphRoots): boolean {
  return rootKindsInUse(roots).length > 1;
}

/**
 * Add values to one kind, keeping the one-kind invariant: the roots of every OTHER kind are
 * dropped, the same kind's earlier values stay (OR-combined by the backend). Returns a new object.
 */
export function withRootValues(
  roots: StorageGraphRoots,
  kind: keyof StorageGraphRoots,
  values: readonly string[]
): StorageGraphRoots {
  const next = [...roots[kind]];
  for (const value of nonBlank(values)) {
    if (!next.includes(value)) {
      next.push(value);
    }
  }
  return { ...EMPTY_STORAGE_GRAPH_ROOTS, [kind]: next };
}

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

/** The root parameters a request carries: blanks and malformed pod roots are dropped, empty kinds omitted. */
function sendableRoots(roots: StorageGraphRoots): Partial<Record<keyof StorageGraphRoots, string[]>> {
  const out: Partial<Record<keyof StorageGraphRoots, string[]>> = {};
  for (const kind of STORAGE_ROOT_KINDS) {
    const values = nonBlank(roots[kind]).filter((value) => kind !== 'pod' || isValidPodRoot(value));
    if (values.length > 0) {
      out[kind] = values;
    }
  }
  return out;
}

/**
 * Compose a storage-graph request. Returns `undefined` when `az` or `env` is missing —
 * the backend 400s those as `missing_az` / `missing_env`, so the loader must not fire.
 *
 * `start` / `end` are resolved at call time (a relative window re-reads the clock).
 * `prune` is never sent. Invalid pod roots and blank values are dropped, not encoded. Returns
 * `undefined` for two or more root kinds as well — the backend would answer 400 `invalid_scope`.
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
  if (!hasAnyRoot(query.roots) || hasMixedRootKinds(query.roots)) {
    return undefined;
  }
  const { fromUnixSeconds, toUnixSeconds } = resolveViewTimeRange(range, nowMs);
  const rootParams = sendableRoots(query.roots);
  if (Object.keys(rootParams).length === 0) {
    return undefined;
  }
  const params: Record<string, string | string[] | number> = {
    start: fromUnixSeconds,
    end: toUnixSeconds,
    az: query.az,
    env: query.env,
    ...(query.cluster.length > 0 ? { cluster: query.cluster } : {}),
    ...(query.namespace.length > 0 ? { namespace: query.namespace } : {}),
    ...rootParams,
  };
  return withQuery(storageGraphEndpoint, params);
}
