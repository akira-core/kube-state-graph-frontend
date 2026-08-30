import type { NodeKind } from './types';

// Super-category for legend grouping. Panel-owned (NOT derived from backend
// `categories`, which are non-standard). Colour never encodes category — colour
// is reserved for status; this map only controls how the node legend is grouped.
export type NodeCategory = 'Workloads' | 'Networking' | 'Storage' | 'Cluster' | 'Other';

// Section order in the legend.
export const CATEGORY_ORDER: readonly NodeCategory[] = ['Workloads', 'Networking', 'Storage', 'Cluster', 'Other'];

export const CATEGORY_BY_KIND: Record<NodeKind, NodeCategory> = {
  pod: 'Workloads',
  deployment: 'Workloads',
  statefulset: 'Workloads',
  daemonset: 'Workloads',
  job: 'Workloads',
  cronjob: 'Workloads',
  service: 'Networking',
  switch: 'Networking',
  network: 'Networking',
  pvc: 'Storage',
  'netapp-aggr': 'Storage',
  'netapp-node': 'Storage',
  node: 'Cluster',
  external: 'Other',
};

const FALLBACK_CATEGORY: NodeCategory = 'Other';

// Unknown kinds land in 'Other' so the legend never drops a kind it doesn't map.
export function categoryForKind(kind: string): NodeCategory {
  return (CATEGORY_BY_KIND as Record<string, NodeCategory | undefined>)[kind] ?? FALLBACK_CATEGORY;
}
