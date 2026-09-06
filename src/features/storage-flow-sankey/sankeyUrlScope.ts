import {
  EMPTY_STORAGE_GRAPH_ROOTS,
  isValidPodRoot,
  type StorageGraphQuery,
  type StorageGraphRoots,
} from '../graph-data';

import type { SankeyMode } from './deriveSankey';

export const SANKEY_SCOPE_KEYS = [
  'az',
  'env',
  'ontap_cluster',
  'node',
  'aggr',
  'svm',
  'pod',
  'cluster',
  'namespace',
  'mode',
] as const;

export const SANKEY_ROOT_KINDS: ReadonlyArray<keyof StorageGraphRoots> = [
  'ontap_cluster',
  'node',
  'aggr',
  'svm',
  'pod',
];

export interface SankeyUrlScope {
  query: StorageGraphQuery;
  mode: SankeyMode;
  droppedPods: string[];
}

function firstValue(params: URLSearchParams, key: string): string | undefined {
  const values = params
    .getAll(key)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return values[0];
}

function parseMode(raw: string | null): SankeyMode {
  if (raw === 'read' || raw === 'write') {
    return raw;
  }
  return 'both';
}

export function parseSankeyScope(params: URLSearchParams): SankeyUrlScope {
  const pods = params.getAll('pod');
  const droppedPods = pods.filter((item) => !isValidPodRoot(item));
  const roots: StorageGraphRoots = {
    ontap_cluster: params.getAll('ontap_cluster'),
    node: params.getAll('node'),
    aggr: params.getAll('aggr'),
    svm: params.getAll('svm'),
    pod: pods.filter(isValidPodRoot),
  };
  return {
    query: {
      az: firstValue(params, 'az'),
      env: firstValue(params, 'env'),
      cluster: params.getAll('cluster'),
      namespace: params.getAll('namespace'),
      roots,
    },
    mode: parseMode(params.get('mode')),
    droppedPods,
  };
}

/** Defaults omitted: empty lists and `mode=both` are not written. Invalid pods stay out. */
export function serializeSankeyScope(scope: SankeyUrlScope): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (scope.query.az !== undefined && scope.query.az !== '') {
    out.push(['az', scope.query.az]);
  }
  if (scope.query.env !== undefined && scope.query.env !== '') {
    out.push(['env', scope.query.env]);
  }
  for (const kind of SANKEY_ROOT_KINDS) {
    for (const value of scope.query.roots[kind]) {
      if (kind === 'pod' && !isValidPodRoot(value)) {
        continue;
      }
      out.push([kind, value]);
    }
  }
  for (const value of scope.query.cluster) {
    out.push(['cluster', value]);
  }
  for (const value of scope.query.namespace) {
    out.push(['namespace', value]);
  }
  if (scope.mode === 'read' || scope.mode === 'write') {
    out.push(['mode', scope.mode]);
  }
  return out;
}

export const EMPTY_SANKEY_URL_SCOPE: SankeyUrlScope = {
  query: {
    az: undefined,
    env: undefined,
    cluster: [],
    namespace: [],
    roots: EMPTY_STORAGE_GRAPH_ROOTS,
  },
  mode: 'both',
  droppedPods: [],
};
