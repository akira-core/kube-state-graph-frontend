import type cytoscape from 'cytoscape';

import { classOf, FLOW_EDGE_TYPES, isPlacementEdge, recKind } from './classify';
import { ANCHOR_ID } from './investigation';
import type { NodeIndex } from './nodeIndex';
import type { TraceDirection } from './types';

const RESERVED_ID = /^trace:(ns|app|owner):\d+$/;

/**
 * The semantic checks normalize cannot make (it knows nothing about hops). Structural ones
 * — missing ids, unknown endpoints, malformed fields — are normalize's `errors` already.
 */
export function validateTraceSemantics(
  index: NodeIndex,
  elements: readonly cytoscape.ElementDefinition[],
  direction: TraceDirection
): string[] {
  const errors: string[] = [];
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (typeof d.id === 'string' && (RESERVED_ID.test(d.id) || d.id === ANCHOR_ID)) {
      errors.push(`Node id "${d.id}" is reserved for cards the trace synthesises.`);
    }
  }
  for (const el of elements) {
    if (el.group !== 'edges') {
      continue;
    }
    const d = el.data as cytoscape.EdgeDataDefinition;
    if (d.edgeType === undefined || !FLOW_EDGE_TYPES.includes(d.edgeType) || isPlacementEdge(d)) {
      continue;
    }
    if (typeof d.source !== 'string' || typeof d.target !== 'string') {
      continue;
    }
    const s = index.get(d.source);
    const t = index.get(d.target);
    for (const [side, n] of [
      ['source', s],
      ['target', t],
    ] as const) {
      if (n !== null && classOf(recKind(n)) === 'group') {
        errors.push(
          `Edge "${String(d.id)}": ${side} "${index.labelOf(n)}" is a ${recKind(n)} group; a flow edge cannot end on a group (groups are reached through parent).`
        );
      }
    }
    // A leaf is a trace stop: it cannot continue. Continuing means being the upstream end
    // in packet direction for a destination trace, the downstream end for a source trace.
    const up = direction === 'destination' ? s : t;
    if (up !== null && classOf(recKind(up)) === 'leaf') {
      errors.push(
        `Edge "${String(d.id)}": "${index.labelOf(up)}" is a ${recKind(up)}, drawn as a trace stop, and cannot have a flow edge onward; use a hop kind (switch / node / pod / netapp-* / pvc) to continue.`
      );
    }
  }
  return errors;
}
