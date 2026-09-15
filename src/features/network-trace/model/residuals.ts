import { worstStatus } from '../../../shared/constants/colorByStatus';
import { formatBitsPerSec } from '../../../shared/format/measurements';

import type { BuildCtx } from './ctx';
import type { TraceNode } from './types';
import { mustGet, sum } from './util';

/**
 * Step 6: per-hop conservation and residuals; leaf totals; pod counts and status of the
 * application / namespace cards.
 *
 * Balance: traced in + other in = traced out + other out. Explicit `other_*_bps` are
 * honoured (both given and not balancing is a warning, the drawing follows the values);
 * one given derives the other; none given derives both from the difference. A hop with
 * no inbound edge at all (and none hidden by the threshold, and no explicit value) is a
 * source — it gets no "other in".
 */
export function computeResiduals(ctx: BuildCtx): void {
  const { nodes, direction, dropIn, dropOut, warnings } = ctx;
  for (const id of ctx.order) {
    const n = mustGet(nodes, id, 'node');
    if (n.kind !== 'node') {
      continue;
    }
    if (n.noFlow) {
      n.tracedIn = n.tracedOut = n.otherIn = n.otherOut = n.totalIn = n.totalOut = 0;
      n.resEps = 1;
      continue;
    }
    // Amounts hidden by the threshold fold into an explicit residual first. Derived ones
    // need nothing: traced in / out already shrank with the removed edges, so the balance
    // below fills the gap by itself.
    if (n.otherInBps !== null) {
      n.otherInBps += dropIn.get(id) ?? 0;
    }
    if (n.otherOutBps !== null) {
      n.otherOutBps += dropOut.get(id) ?? 0;
    }
    n.tracedIn = sum(n.inEdges);
    n.tracedOut = sum(n.outEdges);
    const left = n.tracedIn;
    const right = n.tracedOut;
    const eps = Math.max(left, right) * 0.005 + 1; // counter read jitter
    let oi = n.otherInBps;
    let oo = n.otherOutBps;
    if (oi !== null && oo !== null) {
      const gap = left + oi - (right + oo);
      if (Math.abs(gap) > eps) {
        warnings.push(
          `${n.label}: other_in_bps and other_out_bps are both given but do not balance — ` +
            `traced in ${formatBitsPerSec(left)} + other in ${formatBitsPerSec(oi)} = ${formatBitsPerSec(left + oi)}, ` +
            `traced out ${formatBitsPerSec(right)} + other out ${formatBitsPerSec(oo)} = ${formatBitsPerSec(right + oo)} ` +
            `(${gap > 0 ? 'left' : 'right'} side larger by ${formatBitsPerSec(Math.abs(gap))}). Drawn as given; drop one value to let the balance fill it.`
        );
      }
    } else if (oo !== null) {
      oi = Math.max(0, right + oo - left);
    } else if (oi !== null) {
      oo = Math.max(0, left + oi - right);
    } else {
      const d = right - left;
      oi = Math.max(0, d);
      oo = Math.max(0, -d);
    }
    if (n.inEdges.length === 0 && (dropIn.get(id) ?? 0) === 0 && n.otherInBps === null) {
      oi = 0; // a source hop
    }
    n.otherIn = oi;
    n.otherOut = oo;
    n.totalIn = n.tracedIn + n.otherIn;
    n.totalOut = n.tracedOut + n.otherOut;
    n.resEps = eps;
  }

  // Leaves total the edges on their traced side. Applications first, then namespaces,
  // whose pod counts pass through the application cards. Members are deduplicated per
  // node so a pod with two edges counts once.
  const memberPods = (n: TraceNode): TraceNode[] => {
    const list = direction === 'destination' ? n.inEdges : n.outEdges;
    const seen = new Set<string>();
    const out: TraceNode[] = [];
    for (const e of list) {
      const m = mustGet(nodes, direction === 'destination' ? e.fromId : e.toId, 'node');
      if (!seen.has(m.id)) {
        seen.add(m.id);
        out.push(m);
      }
    }
    return out;
  };
  for (const id of ctx.order) {
    const n = mustGet(nodes, id, 'node');
    if (n.kind !== 'leaf') {
      continue;
    }
    n.bps = sum(direction === 'destination' ? n.inEdges : n.outEdges);
    if (n.role === 'app') {
      const pods = memberPods(n);
      n.podCount = pods.length;
      n.status = worstStatus(pods.map((p) => p.status));
    }
  }
  for (const id of ctx.order) {
    const n = mustGet(nodes, id, 'node');
    if (n.kind !== 'leaf' || n.role !== 'ns') {
      continue;
    }
    let count = 0;
    const statuses: Array<TraceNode['status']> = [];
    for (const m of memberPods(n)) {
      count += m.role === 'app' ? m.podCount : 1;
      statuses.push(m.status);
    }
    n.podCount = count;
    n.status = worstStatus(statuses);
  }
}
