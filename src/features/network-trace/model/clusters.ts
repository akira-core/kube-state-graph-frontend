import { worstStatus } from '../../../shared/constants/colorByStatus';

import { bandOf } from './bands';
import type { BuildCtx } from './ctx';
import { CLUSTER_ID_PREFIX } from './ids';
import type { TraceCluster } from './types';

/**
 * Step 6b: the cluster frames under the `cluster` grouping. Members are the k8s-band cards
 * (k8s node hops, pods, applications, namespaces) that survived filtering and carry a
 * `cluster`, grouped by name in first-seen order; a card without one stays loose. The
 * frame's status folds its members'. A frame is not a graph node: no edges, no column,
 * no residual.
 */
export function buildClusters(ctx: BuildCtx): void {
  if (ctx.grouping !== 'cluster') {
    return;
  }
  const byName = new Map<string, TraceCluster>();
  for (const id of ctx.order) {
    const n = ctx.nodes.get(id);
    if (n === undefined || n.cluster === null || bandOf(n) !== 'k8s') {
      continue;
    }
    let c = byName.get(n.cluster);
    if (c === undefined) {
      c = { id: `${CLUSTER_ID_PREFIX}${n.cluster}`, label: n.cluster, kind: 'cluster', memberIds: [], status: null };
      byName.set(n.cluster, c);
      ctx.clusters.push(c);
    }
    c.memberIds.push(id);
  }
  for (const c of ctx.clusters) {
    c.status = worstStatus(c.memberIds.map((id) => ctx.nodes.get(id)?.status ?? null));
  }
}
