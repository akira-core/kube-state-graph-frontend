import type cytoscape from 'cytoscape';

import { assemble, normalizeColumns } from './assemble';
import { buildClusters } from './clusters';
import { assignColumns } from './columns';
import type { BuildCtx } from './ctx';
import { buildEdges } from './edges';
import { addAnchor, resolveInvestigation, resolveTraceDirection } from './investigation';
import { indexNodes, type NodeIndex } from './nodeIndex';
import { attachAndPrune } from './prune';
import { computeResiduals } from './residuals';
import { scanEdges, scanNodes } from './scan';
import type { DeriveTraceOptions, TraceDirection, TraceInvestigation, TraceModel } from './types';
import { validateTraceSemantics } from './validate';

export { resolveInvestigation, resolveTraceDirection } from './investigation';

/**
 * Step 0 of a derive, kept apart so the direction can be resolved from the same pass:
 * the id index and the trace start. Tied to the `elements` it was built from — `deriveTrace`
 * only reuses it for that exact array.
 */
export interface TraceIndexed {
  elements: readonly cytoscape.ElementDefinition[];
  index: NodeIndex;
  resolved: { inv: TraceInvestigation | null; errors: string[] };
}

export function indexTrace(elements: readonly cytoscape.ElementDefinition[]): TraceIndexed {
  const index = indexNodes(elements);
  return { elements, index, resolved: resolveInvestigation(index, elements) };
}

/**
 * The direction a body should be drawn in, before deriving it: the requested `track_dir`
 * wins; a body whose start states the opposite side yields a warning to show beside the
 * chart. Hands back the index it built so the derive that follows does not build it again.
 */
export function directionFor(
  elements: readonly cytoscape.ElementDefinition[],
  trackDir: TraceDirection | undefined
): { direction: TraceDirection; warning?: string; indexed: TraceIndexed } {
  const indexed = indexTrace(elements);
  return { ...resolveTraceDirection(trackDir, indexed.resolved.inv), indexed };
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
 *   6b clusters       cluster frames under the `cluster` grouping
 *   7  assemble       columns from 0, the result object
 * The input is never mutated.
 */
export function deriveTrace(
  elements: readonly cytoscape.ElementDefinition[],
  opts: DeriveTraceOptions,
  indexed?: TraceIndexed
): TraceModel {
  // The steps throw on a broken invariant (see `mustGet`). The view derives inside a memo
  // with no error boundary above it, so a throw here is the "model-error" empty state,
  // not a blank page.
  try {
    return derive(elements, opts, indexed);
  } catch (err: unknown) {
    return { ok: false, errors: [err instanceof Error ? err.message : String(err)] };
  }
}

function derive(
  elements: readonly cytoscape.ElementDefinition[],
  opts: DeriveTraceOptions,
  indexed: TraceIndexed | undefined
): TraceModel {
  // An index handed in for a different array is stale, never a shortcut.
  const { index, resolved } = indexed !== undefined && indexed.elements === elements ? indexed : indexTrace(elements);
  const errors = [...resolved.errors, ...validateTraceSemantics(index, elements, opts.direction)];
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const ctx: BuildCtx = {
    elements,
    direction: opts.direction,
    inv: resolved.inv,
    minBps: Math.max(0, opts.minBps ?? 0),
    grouping: opts.grouping ?? 'none',
    warnings: [],
    index,
    flowTouch: new Set(),
    placementTouch: new Set(),
    drawTouch: new Set(),
    contOut: new Map(),
    contIn: new Map(),
    agg: new Map(),
    nodes: new Map(),
    order: [],
    edges: [],
    dropIn: new Map(),
    dropOut: new Map(),
    filteredCount: 0,
    filteredBps: 0,
    root: null,
    anchorEdge: null,
    filteredNodes: [],
    clusters: [],
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
  buildClusters(ctx);
  normalizeColumns(ctx);
  return assemble(ctx);
}
