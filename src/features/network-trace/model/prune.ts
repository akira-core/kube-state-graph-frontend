import { countWord } from '../../../shared/format/countWord';
import { formatBitsPerSec } from '../../../shared/format/measurements';

import type { BuildCtx } from './ctx';
import { mustGet } from './util';

/**
 * Step 4: attach edges to their nodes and number them. Step 4b: a hop left with no edge
 * at all after filtering is removed whole (no-flow cards are exempt — they never had one).
 * Leaves exist only with an edge and the anchor / root share the anchor ribbon, so one
 * sweep removes every orphan. Must run before column assignment, which reads `order`.
 */
export function attachAndPrune(ctx: BuildCtx): void {
  const { nodes, edges, minBps, filteredNodes } = ctx;
  edges.forEach((e, i) => {
    e.id = `e${String(i)}`;
    mustGet(nodes, e.fromId, 'edge source').outEdges.push(e);
    mustGet(nodes, e.toId, 'edge target').inEdges.push(e);
  });
  if (minBps > 0) {
    ctx.order = ctx.order.filter((id) => {
      const n = mustGet(nodes, id, 'node');
      if (n.noFlow || n.inEdges.length > 0 || n.outEdges.length > 0) {
        return true;
      }
      filteredNodes.push(n.label);
      nodes.delete(id);
      return false;
    });
  }
  if (ctx.filteredCount > 0) {
    ctx.warnings.push(
      `Display threshold > ${formatBitsPerSec(minBps)}: ${countWord(ctx.filteredCount, 'ribbon')} hidden (${formatBitsPerSec(ctx.filteredBps)} in total)` +
        (filteredNodes.length > 0
          ? `, ${countWord(filteredNodes.length, 'hop')} hidden whole (${filteredNodes.join(', ')})`
          : '') +
        '; the amounts are folded into other in / other out, so every hop still balances.'
    );
  }
}
