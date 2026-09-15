import type { BuildCtx } from './ctx';
import type { TraceModelOk } from './types';
import { mustGet } from './util';

/** Step 7: normalise columns (leftmost = 0) and assemble the result. */
export function normalizeColumns(ctx: BuildCtx): void {
  const { nodes } = ctx;
  const ids = ctx.order;
  let minCol = ids.length > 0 ? Number.POSITIVE_INFINITY : 0;
  for (const id of ids) {
    minCol = Math.min(minCol, mustGet(nodes, id, 'node').col);
  }
  for (const id of ids) {
    mustGet(nodes, id, 'node').col -= minCol;
  }
}

export function assemble(ctx: BuildCtx): TraceModelOk {
  const list = ctx.order.map((id) => mustGet(ctx.nodes, id, 'node'));
  return {
    ok: true,
    direction: ctx.direction,
    investigation: ctx.inv,
    grouping: ctx.grouping,
    clusters: ctx.clusters,
    minBps: ctx.minBps,
    filtered: { edges: ctx.filteredCount, bps: ctx.filteredBps },
    filteredNodes: ctx.filteredNodes,
    nodes: list,
    nodeMap: ctx.nodes,
    edges: ctx.edges,
    anchorEdge: ctx.anchorEdge,
    root: ctx.root,
    warnings: ctx.warnings,
    maxCol: list.reduce((m, n) => Math.max(m, n.col), 0),
  };
}
