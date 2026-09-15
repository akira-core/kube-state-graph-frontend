import { worstStatus } from '../../../shared/constants/colorByStatus';

import { infoOf, statusOf, usageOf } from './classify';
import type { BuildCtx } from './ctx';
import type { TraceWrapper } from './types';

/**
 * Step 6b: the k8s node frames under the `node` layout. Members are the leaf pods placed
 * on the node that survived filtering; a node with no member is not drawn. The frame's
 * status folds the node's own with its members' — it is the only thing drawn for the
 * node. A frame is not a graph node: no edges, no column, no residual.
 */
export function buildWrappers(ctx: BuildCtx): void {
  const { nodes } = ctx;
  const alive = new Set(ctx.order);
  for (const d of ctx.k8sRaw) {
    if (typeof d.id !== 'string') {
      continue;
    }
    const id = d.id;
    const members = (ctx.k8sPods.get(id) ?? []).filter((pid) => {
      const p = nodes.get(pid);
      return alive.has(pid) && p !== undefined && p.kind === 'leaf' && p.role === 'pod';
    });
    if (members.length === 0) {
      continue;
    }
    const w: TraceWrapper = {
      id,
      label: ctx.index.labelOf(d),
      kind: 'wrapper',
      status: worstStatus([statusOf(d.status), ...members.map((pid) => nodes.get(pid)?.status ?? null)]),
      podIds: members,
      noFlow: false,
      info: infoOf(d),
      usage: usageOf(d),
    };
    for (const pid of members) {
      const p = nodes.get(pid);
      if (p !== undefined) {
        p.k8sNode = id;
      }
    }
    ctx.wrappers.push(w);
  }
}
