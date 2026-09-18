import {
  EMPTY_STORAGE_GRAPH_ROOTS,
  isValidPodRoot,
  type StorageGraphQuery,
  type StorageGraphRoots,
} from '../graph-data';

import type { SankeyMode, SankeyWeight } from './deriveSankey';

export const SANKEY_ROOT_KINDS: ReadonlyArray<keyof StorageGraphRoots> = [
  'ontap_cluster',
  'node',
  'aggr',
  'svm',
  'pod',
];

export const DEFAULT_TOP_PODS = 10;

export interface SankeyUrlScope {
  query: StorageGraphQuery;
  mode: SankeyMode;
  weight: SankeyWeight;
  topPods: number;
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

function parseWeight(raw: string | null): SankeyWeight {
  if (raw === 'iops') {
    return 'iops';
  }
  return 'throughput';
}

function parseTopPods(raw: string | null): number {
  if (raw === null || raw === '') {
    return DEFAULT_TOP_PODS;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    return DEFAULT_TOP_PODS;
  }
  return n;
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
    weight: parseWeight(params.get('weight')),
    topPods: parseTopPods(params.get('top_pods')),
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
  if (scope.weight === 'iops') {
    out.push(['weight', 'iops']);
  }
  const hasPodRoot = scope.query.roots.pod.length > 0;
  if (!hasPodRoot && scope.topPods !== DEFAULT_TOP_PODS) {
    out.push(['top_pods', String(scope.topPods)]);
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
  weight: 'throughput',
  topPods: DEFAULT_TOP_PODS,
  droppedPods: [],
};
