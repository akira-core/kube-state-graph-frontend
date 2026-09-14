import type cytoscape from 'cytoscape';

import { assemble, normalizeColumns } from './assemble';
import { assignColumns } from './columns';
import type { BuildCtx } from './ctx';
import { buildEdges } from './edges';
import { addAnchor, resolveInvestigation, resolveTraceDirection } from './investigation';
import { indexNodes } from './nodeIndex';
import { attachAndPrune } from './prune';
import { computeResiduals } from './residuals';
import { scanEdges, scanNodes } from './scan';
import type { DeriveTraceOptions, TraceDirection, TraceModel } from './types';
import { validateTraceSemantics } from './validate';
import { buildWrappers } from './wrappers';

export { resolveInvestigation, resolveTraceDirection } from './investigation';

/**
 * The direction a body should be drawn in, before deriving it: the requested `track_dir`
 * wins; a body whose start states the opposite side yields a warning to show beside the
 * chart. Cheap enough to run on every render — it only indexes the nodes.
 */
export function directionFor(
  elements: readonly cytoscape.ElementDefinition[],
  trackDir: TraceDirection | undefined
): { direction: TraceDirection; warning?: string } {
  const index = indexNodes(elements);
  return resolveTraceDirection(trackDir, resolveInvestigation(index, elements).inv);
}

/**
 * Normalized elements → the trace model. Every value on the chart is a measurement; nothing
 * is estimated or split. Seven steps, one file each, in this order (do not reorder):
 *   0  nodeIndex      id index + parent chain
 *   1a scan           edges: aggregate same-key ribbons, count directions
 *   1b scan           nodes: hop boxes
 *   2  edges          edges (★ threshold filter here); leaf / ns / app / owner cards lazily
 *   3  investigation  anchor card (after filtering, so the start is always kept)
 *   4  prune          attach edges; 4b ★ drop hops left with no edge
 *   5  columns        tier super-nodes, majority vote, SCC, longest path, backward / lateral
 *   6  residuals      ★ hidden amounts fold into residuals; every hop balances
 *   6b wrappers       k8s node frames under the `node` layout
 *   7  assemble       columns from 0, the result object
 * The input is never mutated.
 */
export function deriveTrace(elements: readonly cytoscape.ElementDefinition[], opts: DeriveTraceOptions): TraceModel {
  const index = indexNodes(elements);
  const resolved = resolveInvestigation(index, elements);
  const errors = [...resolved.errors, ...validateTraceSemantics(index, elements, opts.direction)];
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const ctx: BuildCtx = {
    elements,
    direction: opts.direction,
    inv: resolved.inv,
    minBps: Math.max(0, opts.minBps ?? 0),
    layout: opts.layout ?? 'flat',
    warnings: [],
    index,
    flowTouch: new Set(),
    placementTouch: new Set(),
    drawTouch: new Set(),
    contOut: new Map(),
    contIn: new Map(),
    agg: new Map(),
    k8sPods: new Map(),
    nodes: new Map(),
    order: [],
    edges: [],
    dropIn: new Map(),
    dropOut: new Map(),
    k8sRaw: [],
    filteredCount: 0,
    filteredBps: 0,
    root: null,
    anchorEdge: null,
    filteredNodes: [],
    wrappers: [],
  };
  scanEdges(ctx);
  const e1 = scanNodes(ctx);
  if (e1 !== null) {
    return { ok: false, errors: [e1] };
  }
  buildEdges(ctx);
  const e2 = addAnchor(ctx);
  if (e2 !== null) {
    return { ok: false, errors: [e2] };
  }
  attachAndPrune(ctx);
  assignColumns(ctx);
  computeResiduals(ctx);
  buildWrappers(ctx);
  normalizeColumns(ctx);
  return assemble(ctx);
}
