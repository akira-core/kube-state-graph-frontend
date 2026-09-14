import {
  BODY_MIN,
  BODY_PAD_BOTTOM,
  CARD_W,
  COL_GAP,
  PAD_BOTTOM,
  PAD_TOP,
  placeStack,
  stackHeight,
  thicknessScale,
  V_GAP,
  WRAPPER_HEADER_H,
  WRAPPER_PAD,
  type ColumnHeader,
} from '../../sankey-canvas';
import { bandOf, isClientPartition, type TraceBand } from '../model/bands';
import type { TraceEdge, TraceModelOk, TraceNode } from '../model/types';
import { mustGet, SEP } from '../model/util';

import { ANCHOR_W, BAND_COL_GAP, BAND_GAP, OWN_T, PAD_SIDE } from './constants';
import { ANCHOR_MIN_H, cardText, hopHeaderH, leafCardH, leafCardW, resIn, resOut, traceFlowOf } from './text';
import { colCaption, wrapperColCaption } from './tooltips';
import type { EdgeGeom, NodeGeom, Slot, SlotRole, TraceGeometry, WrapperGeom } from './types';

/** In-column order: `flow` (larger flow on top, default) or `barycenter` (fewest crossings). */
export type TraceNodeOrder = 'flow' | 'barycenter';
export const DEFAULT_TRACE_ORDER: TraceNodeOrder = 'flow';

export interface LayoutTraceOptions {
  order?: TraceNodeOrder;
}

interface SortKeys {
  pref: number;
  ord: number;
  hasXParent: boolean;
  nsPref: number | null;
  nsIdx: number;
}
type KeyOf = (n: TraceNode) => SortKeys;

/** Pod and application cards group by namespace so a namespace stays contiguous in its column. */
function nsGroupKey(n: TraceNode): string | null {
  return n.kind === 'leaf' && (n.role === 'pod' || n.role === 'app') && n.namespace !== null ? n.namespace : null;
}

// Barycenter: align to the upstream centre. Pod / application leaves group by namespace on
// the group's mean preference so a namespace stays contiguous; ties break on first appearance.
function sortColBarycenter(col: TraceNode[], K: KeyOf): void {
  const nsAgg = new Map<string, { s: number; c: number; idx: number }>();
  let nsSeq = 0;
  for (const n of col) {
    const ns = nsGroupKey(n);
    if (ns === null) {
      continue;
    }
    let a = nsAgg.get(ns);
    if (a === undefined) {
      nsSeq += 1;
      a = { s: 0, c: 0, idx: nsSeq };
      nsAgg.set(ns, a);
    }
    a.s += K(n).pref;
    a.c += 1;
  }
  for (const n of col) {
    const ns = nsGroupKey(n);
    if (ns === null) {
      continue;
    }
    const a = mustGet(nsAgg, ns, 'namespace');
    K(n).nsPref = a.s / a.c;
    K(n).nsIdx = a.idx;
  }
  col.sort((a, b) => {
    const A = K(a);
    const B = K(b);
    const ka = A.nsPref ?? A.pref;
    const kb = B.nsPref ?? B.pref;
    return ka - kb || A.nsIdx - B.nsIdx || A.pref - B.pref || a.subOrder - b.subOrder || A.ord - B.ord;
  });
}

interface FlowKeys {
  gFlow: number;
  gIdx: number;
  depth: number;
  flow: number;
}

// Flow: larger traced amount on top. The first two keys are GROUP-level so a namespace's
// pods / applications and a same-column lateral chain stay contiguous; inside a chain
// producers sit above consumers (depth); ties fall back to the barycenter preference, then
// subOrder, then appearance.
function sortColByFlow(col: TraceNode[], model: TraceModelOk, K: KeyOf): void {
  const F = new Map<string, FlowKeys>();
  for (const n of col) {
    const f = traceFlowOf(n, model.direction);
    F.set(n.id, { gFlow: f, gIdx: 0, depth: 0, flow: f });
  }
  const lat = (n: TraceNode): TraceEdge[] =>
    n.inEdges.filter((e) => e.lateral).concat(n.outEdges.filter((e) => e.lateral));
  const chain = new Map<string, string>();
  for (const seed of col) {
    if (chain.has(seed.id) || lat(seed).length === 0) {
      continue;
    }
    chain.set(seed.id, seed.id);
    const stack: TraceNode[] = [seed];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === undefined) {
        break;
      }
      for (const e of lat(cur)) {
        for (const id of [e.fromId, e.toId]) {
          if (chain.has(id) || !F.has(id)) {
            continue;
          }
          chain.set(id, seed.id);
          stack.push(mustGet(model.nodeMap, id, 'node'));
        }
      }
    }
  }
  for (const n of [...col].sort((a, b) => a.subOrder - b.subOrder)) {
    let d = 0;
    for (const e of n.inEdges) {
      if (!e.lateral) {
        continue;
      }
      const up = F.get(e.fromId);
      if (up !== undefined) {
        d = Math.max(d, up.depth + 1);
      }
    }
    mustGet(F, n.id, 'flow key').depth = d;
  }
  const NS = `ns${SEP}`;
  const LAT = `lat${SEP}`;
  const gk = (n: TraceNode): string | null => {
    const ns = nsGroupKey(n);
    if (ns !== null) {
      return NS + ns;
    }
    const c = chain.get(n.id);
    return c !== undefined ? LAT + c : null;
  };
  const groups = new Map<string, { flow: number; idx: number; count: number; ns: boolean }>();
  let seq = 0;
  for (const n of col) {
    const k = gk(n);
    if (k === null) {
      continue;
    }
    let g = groups.get(k);
    if (g === undefined) {
      seq += 1;
      g = { flow: 0, idx: seq, count: 0, ns: k.startsWith(NS) };
      groups.set(k, g);
    }
    g.count += 1;
    const f = mustGet(F, n.id, 'flow key').flow;
    g.flow = g.ns ? g.flow + f : Math.max(g.flow, f);
  }
  for (const n of col) {
    const k = gk(n);
    if (k === null) {
      continue;
    }
    const g = mustGet(groups, k, 'group');
    if (g.count < 2) {
      continue; // a group of one is not a group
    }
    const f = mustGet(F, n.id, 'flow key');
    f.gFlow = g.flow;
    f.gIdx = g.idx;
  }
  col.sort((a, b) => {
    const A = mustGet(F, a.id, 'flow key');
    const B = mustGet(F, b.id, 'flow key');
    return (
      B.gFlow - A.gFlow ||
      A.gIdx - B.gIdx ||
      A.depth - B.depth ||
      B.flow - A.flow ||
      K(a).pref - K(b).pref ||
      a.subOrder - b.subOrder ||
      K(a).ord - K(b).ord
    );
  });
}

/**
 * Pure layout: model in, geometry out, the model untouched. Slot stacks, residual slots,
 * column x (with a wider gap between bands), in-column order (the k8s band partitioned
 * k8s-above / clients-below, every part by traced flow), frames, lateral bulges and
 * backflow lanes.
 */
export function layoutTrace(model: TraceModelOk, opts: LayoutTraceOptions = {}): TraceGeometry {
  const order = opts.order ?? DEFAULT_TRACE_ORDER;
  const { nodes, edges } = model;
  const gn = new Map<string, NodeGeom>();
  const ge = new Map<string, EdgeGeom>();
  const N = (id: string): NodeGeom => mustGet(gn, id, 'node geometry');
  const E = (e: TraceEdge): EdgeGeom => mustGet(ge, e.id, 'edge geometry');

  // Residuals share the ribbon scale so proportions read; when the unaccounted amount
  // dominates, the traced ribbons get thin — which is exactly what that means.
  let maxVal = 0;
  for (const e of edges) {
    maxVal = Math.max(maxVal, e.bps);
  }
  for (const n of nodes) {
    maxVal = Math.max(maxVal, resIn(n), resOut(n));
  }
  const thick = thicknessScale(maxVal);

  for (const e of edges) {
    ge.set(e.id, {
      t: e.owns ? OWN_T : thick(e.bps),
      backNear:
        e.backward && mustGet(model.nodeMap, e.fromId, 'node').col - mustGet(model.nodeMap, e.toId, 'node').col === 1,
      x1: 0,
      y1: 0,
      t1: 0,
      x2: 0,
      y2: 0,
      t2: 0,
    });
  }
  const near = (e: TraceEdge): boolean => E(e).backNear;
  const slot = (e: TraceEdge, role: SlotRole, iface: string): Slot => ({
    edge: e,
    role,
    iface,
    thickness: E(e).t,
    cy: 0,
  });

  const texts = new Map(nodes.map((n) => [n.id, cardText(n, model)]));
  for (const n of nodes) {
    // Lateral edges hang both ends on the right edge (the arc lives in the column's right
    // gap). An adjacent-column backflow hangs on the facing edges; a longer one enters on
    // the left and leaves on the right like any ribbon but sorts last, so the loop leaves
    // from the bottom of the stack and does not cross its own other ribbons.
    const leftSlots: Slot[] = n.inEdges
      .filter((e) => !e.lateral && !e.backward)
      .map((e) => slot(e, 'in', e.toIface))
      .concat(n.inEdges.filter((e) => e.backward && !near(e)).map((e) => slot(e, 'in', e.toIface)))
      .concat(n.outEdges.filter((e) => near(e)).map((e) => slot(e, 'back-out', e.fromIface)));
    const rightSlots: Slot[] = n.outEdges
      .filter((e) => !e.lateral && !e.backward)
      .map((e) => slot(e, 'out', e.fromIface))
      .concat(n.outEdges.filter((e) => e.lateral).map((e) => slot(e, 'lat-out', e.fromIface)))
      .concat(n.inEdges.filter((e) => e.lateral).map((e) => slot(e, 'lat-in', e.toIface)))
      .concat(n.inEdges.filter((e) => near(e)).map((e) => slot(e, 'back-in', e.toIface)))
      .concat(n.outEdges.filter((e) => e.backward && !near(e)).map((e) => slot(e, 'out', e.fromIface)));
    // Residuals are real slots, outermost so they are centred with the traced ports.
    const ri = resIn(n);
    const ro = resOut(n);
    if (ri > 0) {
      leftSlots.push({ res: 'in', bps: ri, thickness: thick(ri), cy: 0 });
    }
    if (ro > 0) {
      rightSlots.push({ res: 'out', bps: ro, thickness: thick(ro), cy: 0 });
    }
    const lh = stackHeight(leftSlots);
    const rh = stackHeight(rightSlots);
    const text = mustGet(texts, n.id, 'card text');
    let w: number;
    let h: number;
    if (n.kind === 'node') {
      w = CARD_W;
      h = hopHeaderH(n) + Math.max(lh, rh, BODY_MIN) + BODY_PAD_BOTTOM;
    } else if (n.kind === 'leaf') {
      w = leafCardW(n);
      h = Math.max(leafCardH(text), lh, rh);
    } else {
      w = ANCHOR_W;
      h = Math.max(ANCHOR_MIN_H, lh, rh);
    }
    gn.set(n.id, { x: 0, y: 0, w, h, cy: 0, leftSlots, rightSlots });
  }

  // Column x. Under the `node` layout the frames live in the pod column (the column holding
  // leaf pods); if every pod was filtered away they get a column of their own.
  const cols: TraceNode[][] = [];
  for (const n of nodes) {
    const list = cols[n.col] ?? [];
    list.push(n);
    cols[n.col] = list;
  }
  const wFlow = new Map<string, number>(
    model.wrappers.map((w) => [
      w.id,
      w.podIds.reduce((t, id) => t + traceFlowOf(mustGet(model.nodeMap, id, 'pod'), model.direction), 0),
    ])
  );
  const wrappers: WrapperGeom[] = [...model.wrappers]
    .sort(
      order === 'flow'
        ? (a, b) => (wFlow.get(b.id) ?? 0) - (wFlow.get(a.id) ?? 0) || a.label.localeCompare(b.label)
        : (a, b) => a.label.localeCompare(b.label)
    )
    .map((w) => ({ wrapper: w, x: 0, y: 0, w: 0, h: 0 }));
  let podCol = -1;
  for (const n of nodes) {
    if (n.kind === 'leaf' && n.role === 'pod' && podCol < 0) {
      podCol = n.col;
    }
  }
  if (podCol < 0 && wrappers.length > 0) {
    podCol = cols.length;
    cols[podCol] = [];
  }
  // The band a column belongs to: its first card's (the client partition shares the k8s
  // band's last column); a frames-only column is the pod column, so k8s.
  const colBand = (ci: number): TraceBand => {
    const first = (cols[ci] ?? [])[0];
    if (first === undefined) {
      return 'k8s';
    }
    const b = bandOf(first);
    return b === 'client' ? 'k8s' : b;
  };
  let x = PAD_SIDE;
  const colX: number[] = [];
  const colW: number[] = [];
  for (let c = 0; c < cols.length; c += 1) {
    const list = cols[c] ?? [];
    if (c > 0 && colBand(c) !== colBand(c - 1)) {
      x += BAND_COL_GAP;
    }
    let w = list.reduce((m, n) => Math.max(m, N(n.id).w), CARD_W);
    if (c === podCol && wrappers.length > 0) {
      const iw = list.reduce((m, n) => (n.k8sNode !== null ? Math.max(m, N(n.id).w) : m), 0);
      w = Math.max(w, iw + WRAPPER_PAD * 2, CARD_W);
    }
    colX[c] = x;
    colW[c] = w;
    for (const n of list) {
      N(n.id).x = n.k8sNode !== null ? x + WRAPPER_PAD : x;
    }
    x += w + COL_GAP;
  }
  const totalW = x - COL_GAP + PAD_SIDE;

  // Stack a list of cards from y0 (frames first in the pod column), appending them to `out`
  // in drawing order; returns the y below the last card plus one gap.
  const stack = (list: readonly TraceNode[], y0: number, ci: number, out: TraceNode[]): number => {
    let y = y0;
    if (ci === podCol && wrappers.length > 0) {
      const byW = new Map<string, TraceNode[]>();
      const loose: TraceNode[] = [];
      for (const n of list) {
        if (n.k8sNode !== null) {
          const l = byW.get(n.k8sNode) ?? [];
          l.push(n);
          byW.set(n.k8sNode, l);
        } else {
          loose.push(n);
        }
      }
      for (const wg of wrappers) {
        const pods = byW.get(wg.wrapper.id) ?? [];
        wg.x = colX[ci] ?? PAD_SIDE;
        wg.w = colW[ci] ?? CARD_W;
        wg.y = y;
        let yy = y + WRAPPER_HEADER_H;
        for (const n of pods) {
          N(n.id).y = yy;
          yy += N(n.id).h + V_GAP;
          out.push(n);
        }
        wg.h = pods.length > 0 ? yy - V_GAP + WRAPPER_PAD - y : WRAPPER_HEADER_H + WRAPPER_PAD;
        y += wg.h + V_GAP;
      }
      for (const n of loose) {
        N(n.id).y = y;
        y += N(n.id).h + V_GAP;
        out.push(n);
      }
      return y;
    }
    for (const n of list) {
      N(n.id).y = y;
      y += N(n.id).h + V_GAP;
      out.push(n);
    }
    return y;
  };

  // The k8s band's two partitions share one top line each across all of its columns: the
  // k8s cards start together and the client cards start below the tallest k8s partition.
  let maxK8sH = 0;
  for (let ci = 0; ci < cols.length; ci += 1) {
    if (colBand(ci) === 'k8s') {
      const upper = (cols[ci] ?? []).filter((n) => !isClientPartition(n));
      maxK8sH = Math.max(maxK8sH, stack(upper, 0, ci, []) - V_GAP);
    }
  }

  // Column y: order by upstream centre, then align the column to its upstream barycentre.
  // The k8s band is pinned instead: its top is the top of the switch column it follows.
  const keys = new Map<string, SortKeys>();
  const K: KeyOf = (n) => mustGet(keys, n.id, 'sort key');
  const cyOf = new Map<string, number>();
  let lastSwitchTop = 0;
  for (let ci = 0; ci < cols.length; ci += 1) {
    const col = cols[ci] ?? [];
    col.forEach((n, i) => {
      const parents = n.inEdges.filter((e) => {
        const p = mustGet(model.nodeMap, e.fromId, 'node');
        return p.col < n.col && cyOf.has(p.id);
      });
      keys.set(n.id, {
        hasXParent: parents.length > 0,
        pref:
          parents.length > 0 ? parents.reduce((s, e) => s + (cyOf.get(e.fromId) ?? 0), 0) / parents.length : i * 1e-3,
        ord: i,
        nsPref: null,
        nsIdx: 0,
      });
    });
    // A node fed only from its own column inherits its lateral upstream's preference.
    for (const n of [...col].sort((a, b) => a.subOrder - b.subOrder)) {
      if (K(n).hasXParent) {
        continue;
      }
      const lateral = n.inEdges.filter((e) => e.lateral);
      if (lateral.length > 0) {
        K(n).pref = lateral.reduce((s, e) => s + K(mustGet(model.nodeMap, e.fromId, 'node')).pref, 0) / lateral.length;
      }
    }
    // Partition first — k8s cards above, non-k8s trace stops below — then order each part.
    const upper = col.filter((n) => !isClientPartition(n));
    const lower = col.filter(isClientPartition);
    for (const part of [upper, lower]) {
      if (order === 'barycenter') {
        sortColBarycenter(part, K);
      } else {
        sortColByFlow(part, model, K);
      }
    }
    const band = colBand(ci);
    const top = band === 'k8s' ? lastSwitchTop : 0;
    col.length = 0;
    let y = stack(upper, top, ci, col);
    if (lower.length > 0) {
      if (band === 'k8s') {
        y = top + maxK8sH + (maxK8sH > 0 ? BAND_GAP : 0);
      }
      y = stack(lower, y, ci, col);
    }
    const blockH = Math.max(0, y - V_GAP - top);
    const prefAvg = col.reduce((s, n) => s + K(n).pref, 0) / (col.length || 1);
    const shift = band !== 'k8s' && col.length > 0 && ci > 0 ? prefAvg - blockH / 2 : 0;
    for (const n of col) {
      const g = N(n.id);
      g.y += shift;
      cyOf.set(n.id, g.y + g.h / 2);
    }
    if (ci === podCol) {
      for (const wg of wrappers) {
        wg.y += shift;
      }
    }
    if (band === 'switch' && col.length > 0) {
      lastSwitchTop = Math.min(...col.map((n) => N(n.id).y));
    }
  }

  // Normalise y so the top is PAD_TOP; frames count toward the height.
  const any = nodes.length > 0 || wrappers.length > 0;
  let minY = any ? Number.POSITIVE_INFINITY : 0;
  let maxY = any ? Number.NEGATIVE_INFINITY : 0;
  for (const n of nodes) {
    const g = N(n.id);
    minY = Math.min(minY, g.y);
    maxY = Math.max(maxY, g.y + g.h);
  }
  for (const wg of wrappers) {
    minY = Math.min(minY, wg.y);
    maxY = Math.max(maxY, wg.y + wg.h);
  }
  const dy = PAD_TOP - minY;
  for (const n of nodes) {
    const g = N(n.id);
    g.y += dy;
    g.cy = g.y + g.h / 2;
  }
  for (const wg of wrappers) {
    wg.y += dy;
  }
  let totalH = maxY + dy + PAD_BOTTOM;

  // The band partitions, namespace grouping and owner cards reorder a column away from the
  // order a hop's ports were declared in; re-sort those slots by the far end's y so ribbons
  // do not cross. Only the picked slots move; the rest (residuals included) stay put.
  const farOf = (sl: Slot): TraceNode => {
    const e = sl.edge;
    if (e === undefined) {
      throw new Error('network-trace: residual slot has no far end');
    }
    return mustGet(model.nodeMap, sl.role === 'in' ? e.fromId : e.toId, 'node');
  };
  const reorderSlots = (slots: Slot[], want: (f: TraceNode) => boolean): void => {
    const idxs: number[] = [];
    slots.forEach((sl, i) => {
      if (sl.edge === undefined || sl.edge.lateral || sl.edge.backward) {
        return;
      }
      if (want(farOf(sl))) {
        idxs.push(i);
      }
    });
    if (idxs.length < 2) {
      return;
    }
    const picked = idxs.map((i) => mustGet(new Map(slots.map((s, j) => [j, s])), i, 'slot'));
    picked.sort((a, b) => N(farOf(a).id).y - N(farOf(b).id).y);
    idxs.forEach((i, k) => {
      const s = picked[k];
      if (s !== undefined) {
        slots[i] = s;
      }
    });
  };
  for (const n of nodes) {
    const nb = bandOf(n);
    for (const slots of [N(n.id).leftSlots, N(n.id).rightSlots]) {
      reorderSlots(slots, (f) => bandOf(f) !== nb);
    }
  }
  for (const n of nodes) {
    if (n.kind !== 'node' && n.role !== 'ns' && n.role !== 'app') {
      continue;
    }
    for (const slots of [N(n.id).leftSlots, N(n.id).rightSlots]) {
      reorderSlots(slots, (f) => f.kind === 'leaf' && f.role === 'pod' && f.namespace !== null);
    }
  }
  for (const n of nodes) {
    if (!n.ownerLinked && n.role !== 'owner') {
      continue;
    }
    for (const slots of [N(n.id).leftSlots, N(n.id).rightSlots]) {
      reorderSlots(slots, (f) => n.role === 'owner' || f.role === 'owner');
    }
  }

  // Port centres.
  for (const n of nodes) {
    const g = N(n.id);
    const top = n.kind === 'node' ? g.y + hopHeaderH(n) : g.y;
    const avail = n.kind === 'node' ? g.h - hopHeaderH(n) - BODY_PAD_BOTTOM : g.h;
    const leftCy = placeStack(g.leftSlots, top, avail);
    const rightCy = placeStack(g.rightSlots, top, avail);
    g.leftSlots.forEach((s, i) => {
      s.cy = leftCy[i] ?? top;
      if (s.edge === undefined) {
        return;
      }
      const eg = E(s.edge);
      if (s.role === 'back-out') {
        eg.x1 = g.x;
        eg.y1 = s.cy;
        eg.t1 = s.thickness;
      } else {
        eg.x2 = g.x;
        eg.y2 = s.cy;
        eg.t2 = s.thickness;
      }
    });
    g.rightSlots.forEach((s, i) => {
      s.cy = rightCy[i] ?? top;
      if (s.edge === undefined) {
        return;
      }
      const eg = E(s.edge);
      if (s.role === 'lat-in' || s.role === 'back-in') {
        eg.x2 = g.x + g.w;
        eg.y2 = s.cy;
        eg.t2 = s.thickness;
      } else {
        eg.x1 = g.x + g.w;
        eg.y1 = s.cy;
        eg.t1 = s.thickness;
      }
    });
  }

  // Lateral arc bulge: shorter spans on the inside, longer outside, so arcs do not cross.
  const latByCol = new Map<number, TraceEdge[]>();
  for (const e of edges) {
    if (!e.lateral) {
      continue;
    }
    const c = mustGet(model.nodeMap, e.fromId, 'node').col;
    const list = latByCol.get(c) ?? [];
    list.push(e);
    latByCol.set(c, list);
  }
  for (const list of latByCol.values()) {
    list.sort((a, b) => Math.abs(E(a).y2 - E(a).y1) - Math.abs(E(b).y2 - E(b).y1));
    list.forEach((e, i) => {
      const eg = E(e);
      eg.bulge = Math.min(56 + ((eg.t1 + eg.t2) / 2) * 0.67 + 18 * i, COL_GAP - 26);
    });
  }

  // Backflow loops around the bottom, one lane each, vertical runs staggered.
  const backs = edges.filter((e) => e.backward && !near(e));
  backs.sort(
    (a, b) =>
      mustGet(model.nodeMap, b.fromId, 'node').col - mustGet(model.nodeMap, a.fromId, 'node').col || b.bps - a.bps
  );
  let backY = totalH - PAD_BOTTOM + 40;
  backs.forEach((e, i) => {
    const eg = E(e);
    eg.backT = Math.max(eg.t1, eg.t2);
    eg.backY = backY + eg.backT / 2;
    eg.backXD = eg.x1 + COL_GAP - 30 - i * 14;
    eg.backXU = Math.max(8, eg.x2 - 26 - i * 14);
    backY += eg.backT + 16;
  });
  if (backs.length > 0) {
    totalH = backY - 16 + PAD_BOTTOM;
  }

  const columns: ColumnHeader[] = [];
  cols.forEach((col, ci) => {
    const cx = colX[ci] ?? PAD_SIDE;
    if (col.length > 0) {
      columns.push({ x: cx, label: colCaption(col, model.direction) });
    } else if (ci === podCol && wrappers.length > 0) {
      columns.push({ x: cx, label: wrapperColCaption() });
    }
  });

  return {
    cols,
    colX,
    columns,
    width: totalW,
    height: Math.max(totalH, 220),
    nodes: gn,
    edges: ge,
    wrappers,
    podCol,
  };
}
