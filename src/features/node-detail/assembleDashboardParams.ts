import type cytoscape from 'cytoscape';

import type { ResolvedTimeRange } from '../../shared/time/viewTimeRange';

// `/dashboard` query params. A `string[]` value serializes to repeated params
// (`ipaddress=a&ipaddress=b`) — node-dashboard-url-button spec D9.
export type DashboardParams = Record<string, string | string[]>;

// Rendering/structural `data` keys that are not backend attributes — never sent as params.
// `status` is also excluded as volatile: it would refire the prefetch key on a refresh
// (node-dashboard-url-button spec D4/Q1).
const DENYLIST: ReadonlySet<string> = new Set([
  'id',
  'parent',
  'worstStatus',
  'isCluster',
  'isController',
  'isNamespace',
  'isApplication',
  'clusterColor',
  'namespaceColor',
  'applicationColor',
  'isStorageCluster',
  'storageClusterColor',
  // Storage facts (the claim's class name, ONTAP health, byte usage) — node info for the
  // pinned tooltip, NOT query params. usageRatio is derived presentation state and is
  // likewise never a query param.
  'storageclass',
  'health',
  'usage',
  'usageRatio',
  'labels',
  'status',
]);

// Eligible = any node except the decorative groups (cluster / storage-cluster / namespace /
// application). The NetApp nodes ARE eligible: netapp-aggr is a leaf and netapp-node, while
// a compound parent, is a real kind-ful selectable node. Shared with resolveSelectedNode
// (KsgPanel) so the two scopes cannot drift.
export function isDashboardEligible(d: cytoscape.NodeDataDefinition): boolean {
  return d.isCluster !== true && d.isStorageCluster !== true && d.isNamespace !== true && d.isApplication !== true;
}

// `cluster` param: nearest `isCluster` ancestor's `data.cluster` (walked via `data.parent` —
// the only uniform source, since synthesized controllers carry no cluster/labels), else the
// node's own `labels.cluster`, else `undefined`.
function resolveCluster(
  elements: readonly cytoscape.ElementDefinition[],
  selfData: cytoscape.NodeDataDefinition
): string | undefined {
  const byId = new Map<string, cytoscape.NodeDataDefinition>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (typeof d.id === 'string') {
      byId.set(d.id, d);
    }
  }
  let cur: cytoscape.NodeDataDefinition | undefined = selfData;
  let hops = 0;
  while (cur?.parent !== undefined && hops <= byId.size) {
    const parent = byId.get(cur.parent);
    if (parent === undefined) {
      break;
    }
    if (parent.isCluster === true && typeof parent.cluster === 'string' && parent.cluster.length > 0) {
      return parent.cluster;
    }
    cur = parent;
    hops += 1;
  }
  const labelCluster = selfData.labels?.cluster;
  return typeof labelCluster === 'string' && labelCluster.length > 0 ? labelCluster : undefined;
}

// Project one node's `data` onto params: drop denylist + non-scalars, rename `label` →
// `name` (backend keys on `name`). `ipAddress` (`string[]`) → repeated `ipaddress=` (D9).
function paramsFromData(d: cytoscape.NodeDataDefinition): DashboardParams {
  const out: DashboardParams = {};
  for (const [key, value] of Object.entries(d)) {
    if (DENYLIST.has(key)) {
      continue;
    }
    if (key === 'ipAddress') {
      if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string')) {
        out.ipaddress = value;
      }
      continue;
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      continue; // non-scalar: not query identity
    }
    const paramKey = key === 'label' ? 'name' : key;
    out[paramKey] = String(value);
  }
  return out;
}

// `controller` param, symmetric with resolveCluster: nearest `isController` ancestor's
// name (`data.label`), else the node's own `data.owner.name`, else `undefined`. Ancestors
// only — self is not counted (node-dashboard-url-button spec D8).
function resolveController(
  elements: readonly cytoscape.ElementDefinition[],
  selfData: cytoscape.NodeDataDefinition
): string | undefined {
  const byId = new Map<string, cytoscape.NodeDataDefinition>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (typeof d.id === 'string') {
      byId.set(d.id, d);
    }
  }
  let cur: cytoscape.NodeDataDefinition | undefined = selfData;
  let hops = 0;
  while (cur?.parent !== undefined && hops <= byId.size) {
    const parent = byId.get(cur.parent);
    if (parent === undefined) {
      break;
    }
    if (parent.isController === true && typeof parent.label === 'string' && parent.label.length > 0) {
      return parent.label;
    }
    cur = parent;
    hops += 1;
  }
  const ownerName = selfData.owner?.name;
  return typeof ownerName === 'string' && ownerName.length > 0 ? ownerName : undefined;
}

/**
 * `/dashboard` query params for the selected node, or `undefined` when it is missing or
 * not dashboard-eligible (the gate that idles useNodeDashboardUrl). A compound node also
 * merges in attributes shared identically across all direct children (own-wins). `cluster`
 * / `controller` come from the ancestor walks above; `from_time` / `to_time` carry the range
 * as Unix seconds. Full rules: node-dashboard-url-button spec (D4/D8/D9/D10).
 */
export function assembleDashboardParams(
  elements: readonly cytoscape.ElementDefinition[],
  nodeId: string | null,
  timeRange?: ResolvedTimeRange
): DashboardParams | undefined {
  if (nodeId === null) {
    return undefined;
  }
  let selfData: cytoscape.NodeDataDefinition | undefined;
  const childData: cytoscape.NodeDataDefinition[] = [];
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.id === nodeId) {
      selfData = d;
    } else if (d.parent === nodeId) {
      childData.push(d);
    }
  }
  if (selfData === undefined || !isDashboardEligible(selfData)) {
    return undefined;
  }

  const params = paramsFromData(selfData);

  // Compound merge: add child-shared attributes the compound itself lacks.
  if (childData.length > 0) {
    const childParams = childData.map(paramsFromData);
    const [first, ...rest] = childParams;
    if (first !== undefined) {
      for (const [key, value] of Object.entries(first)) {
        if (key in params) {
          continue; // own-wins
        }
        if (rest.every((m) => m[key] === value)) {
          params[key] = value; // identical across ALL children
        }
      }
    }
  }

  // cluster: from ancestor nesting (own-wins).
  if (!('cluster' in params)) {
    const cluster = resolveCluster(elements, selfData);
    if (cluster !== undefined) {
      params.cluster = cluster;
    }
  }

  // controller: from ancestor walk (own-wins).
  if (!('controller' in params)) {
    const controller = resolveController(elements, selfData);
    if (controller !== undefined) {
      params.controller = controller;
    }
  }

  // from_time / to_time: current range as Unix seconds (eligible branch only).
  if (timeRange !== undefined) {
    params.from_time = String(timeRange.fromUnixSeconds);
    params.to_time = String(timeRange.toUnixSeconds);
  }

  return params;
}
