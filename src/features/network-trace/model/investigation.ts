import type cytoscape from 'cytoscape';

import { classOf, recKind } from './classify';
import type { BuildCtx } from './ctx';
import type { NodeIndex } from './nodeIndex';
import { makeEdge, makeNode, type TraceDirection, type TraceInvestigation } from './types';

export const ANCHOR_ID = 'trace:anchor';
export const ANCHOR_LABEL = 'Trace start';

/**
 * The trace start is the one node carrying `investigation` (normalize already validated its
 * fields). Two of them is an error — the anchor cannot be guessed; a non-hop start cannot
 * carry the anchor ribbon.
 */
export function resolveInvestigation(
  index: NodeIndex,
  elements: readonly cytoscape.ElementDefinition[]
): { inv: TraceInvestigation | null; errors: string[] } {
  const found: cytoscape.NodeDataDefinition[] = [];
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.investigation !== undefined && typeof d.id === 'string') {
      found.push(d);
    }
  }
  if (found.length > 1) {
    return {
      inv: null,
      errors: [
        `${String(found.length)} nodes carry investigation (${found.map((d) => String(d.id)).join(', ')}); a trace has exactly one start.`,
      ],
    };
  }
  const d = found[0];
  if (d === undefined || d.investigation === undefined) {
    return { inv: null, errors: [] };
  }
  if (classOf(recKind(d)) !== 'hop') {
    return {
      inv: null,
      errors: [
        `Trace start "${index.labelOf(d)}" is a ${recKind(d)}; the start must be a hop kind (switch / node / pod / netapp-* / pvc).`,
      ],
    };
  }
  return {
    inv: {
      nodeId: String(d.id),
      iface: d.investigation.iface,
      deltaBps: d.investigation.deltaBps,
      direction: d.investigation.direction ?? null,
      note: d.investigation.note ?? '',
    },
    errors: [],
  };
}

/**
 * The requested `track_dir` decides the drawing direction. When the backend also states
 * which side of the start port the delta was seen on and it disagrees, that is worth a
 * warning, not a silent override of what was asked.
 */
export function resolveTraceDirection(
  trackDir: TraceDirection | undefined,
  inv: TraceInvestigation | null
): { direction: TraceDirection; warning?: string } {
  const stated: TraceDirection | null =
    inv?.direction === 'out' ? 'source' : inv?.direction === 'in' ? 'destination' : null;
  if (trackDir === undefined) {
    return { direction: stated ?? 'destination' };
  }
  if (stated !== null && stated !== trackDir) {
    return {
      direction: trackDir,
      warning: `The trace start reports direction "${inv?.direction ?? ''}" (${stated}) but the query asked for ${trackDir}; drawn as ${trackDir}.`,
    };
  }
  return { direction: trackDir };
}

/**
 * Step 3: the anchor card and its ribbon (after threshold filtering, so the trace start is
 * always kept). Destination traces anchor on the left, source traces on the right.
 */
export function addAnchor(ctx: BuildCtx): string | null {
  const { inv, direction, nodes, order, edges } = ctx;
  if (inv === null) {
    return null;
  }
  const root = nodes.get(inv.nodeId);
  if (root === undefined || root.kind !== 'node') {
    return `Trace start "${inv.nodeId}" is not a drawable hop (a k8s node touched only by placement edges is not drawn).`;
  }
  root.isRoot = true;
  root.noFlow = false; // the anchor ribbon is its flow
  const anchor = makeNode({
    id: ANCHOR_ID,
    label: ANCHOR_LABEL,
    kind: 'anchor',
    role: 'anchor',
    iface: inv.iface,
    note: inv.note,
    dirLabel: direction === 'destination' ? 'in' : 'out',
  });
  nodes.set(anchor.id, anchor);
  order.push(anchor.id);
  const anchorEdge =
    direction === 'destination'
      ? makeEdge(anchor, root, inv.iface, inv.iface, inv.deltaBps, { isAnchor: true })
      : makeEdge(root, anchor, inv.iface, inv.iface, inv.deltaBps, { isAnchor: true });
  edges.push(anchorEdge);
  ctx.root = root;
  ctx.anchorEdge = anchorEdge;
  return null;
}
