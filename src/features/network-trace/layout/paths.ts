import { ribbonPath } from '../../sankey-canvas';
import type { TraceEdge } from '../model/types';

import { LATERAL_CROWN_K } from './constants';
import type { BandKind, EdgeGeom } from './types';

export function bandKind(e: TraceEdge, g: Pick<EdgeGeom, 'backNear'>): BandKind {
  if (e.owns) {
    return 'own';
  }
  if (e.backward) {
    return g.backNear ? 'back' : 'back-loop';
  }
  return e.lateral ? 'lateral' : 'flow';
}

/** The path of a finished (fully placed) edge, by band kind. */
export function edgePath(g: EdgeGeom): string {
  switch (g.kind) {
    case 'own':
      return ownLine(g);
    case 'back-loop':
      return backwardRibbon(g);
    case 'lateral':
      return lateralRibbon(g, g.bulge);

    default:
      return ribbonPath(g.x1, g.y1, g.x2, g.y2, g.t);
  }
}

/**
 * A lateral arc always ends on the target's right edge heading -x, so a fixed left-pointing
 * triangle is the arrow.
 */
export function lateralArrow(g: EdgeGeom): string {
  const size = Math.max(5, Math.min(9, g.t2 / 2));
  const n = (v: number): string => String(v);
  return `M${n(g.x2 + 4 + size * 2)},${n(g.y2 - size)} L${n(g.x2 + 4)},${n(g.y2)} L${n(g.x2 + 4 + size * 2)},${n(g.y2 + size)} Z`;
}

/**
 * The direction mark of an amount ribbon: an open chevron just inside the ribbon's target
 * end, pointing the way the traffic goes (`dir` +1 = rightward). Stroked, not filled, so it
 * reads on the gradient's end colour; sized to the ribbon but never below a legible 3 px.
 */
export function endChevron(g: EdgeGeom, dir: 1 | -1): string {
  const s = Math.max(3, Math.min(7, g.t / 2 - 1));
  const n = (v: number): string => String(v);
  const tip = g.x2 - dir * 2;
  const tail = g.x2 - dir * (2 + s * 2);
  return `M${n(tail)},${n(g.y2 - s)} L${n(tip)},${n(g.y2)} L${n(tail)},${n(g.y2 + s)}`;
}

/** Which way a ribbon enters its target: a near backflow comes in from the right, every other ribbon from the left. */
export function chevronDir(g: EdgeGeom): 1 | -1 {
  return g.kind === 'back-loop' || g.x2 >= g.x1 ? 1 : -1;
}

/**
 * Ownership line: the centre line of a ribbon, stroked rather than filled — a filled band
 * cannot be dashed, and the dash IS the "carries no amount" mark.
 */
function ownLine(e: EdgeGeom): string {
  const mx = (e.x1 + e.x2) / 2;
  return `M${String(e.x1)},${String(e.y1)} C${String(mx)},${String(e.y1)} ${String(mx)},${String(e.y2)} ${String(e.x2)},${String(e.y2)}`;
}

/**
 * Same-column interconnect: a horseshoe on the column's right edge bulging `B` to the
 * right. The outer edge joins the two ends' far sides and the inner edge the near sides,
 * so the arc's crown is about as wide as the average ribbon.
 */
function lateralRibbon(e: EdgeGeom, B: number): string {
  const a = e.t1 / 2;
  const b = e.t2 / 2;
  const s = e.y2 >= e.y1 ? 1 : -1;
  const k = (a + b) * LATERAL_CROWN_K;
  const Bo = B + k;
  const Bi = Math.max(8, B - k);
  const n = (v: number): string => String(v);
  return (
    `M${n(e.x1)},${n(e.y1 - s * a)}` +
    ` C${n(e.x1 + Bo)},${n(e.y1 - s * a)} ${n(e.x2 + Bo)},${n(e.y2 + s * b)} ${n(e.x2)},${n(e.y2 + s * b)}` +
    ` L${n(e.x2)},${n(e.y2 - s * b)}` +
    ` C${n(e.x2 + Bi)},${n(e.y2 - s * b)} ${n(e.x1 + Bi)},${n(e.y1 + s * a)} ${n(e.x1)},${n(e.y1 + s * a)} Z`
  );
}

/**
 * Backflow across several columns: out of the source's right edge, down the corridor,
 * along a lane under the chart, up the target's left corridor, into its left edge. A
 * constant-width stroked path with rounded turns.
 */
function backwardRibbon(e: EdgeGeom): string {
  const backT = e.backT ?? e.t;
  const yB = e.backY ?? Math.max(e.y1, e.y2) + 60;
  const xD = e.backXD ?? e.x1 + 40;
  const xU = e.backXU ?? e.x2 - 40;
  const r = Math.min(Math.max(14, backT), (yB - Math.max(e.y1, e.y2)) / 2);
  const n = (v: number): string => String(v);
  return (
    `M${n(e.x1)},${n(e.y1)}` +
    ` L${n(xD - r)},${n(e.y1)}` +
    ` Q${n(xD)},${n(e.y1)} ${n(xD)},${n(e.y1 + r)}` +
    ` L${n(xD)},${n(yB - r)}` +
    ` Q${n(xD)},${n(yB)} ${n(xD - r)},${n(yB)}` +
    ` L${n(xU + r)},${n(yB)}` +
    ` Q${n(xU)},${n(yB)} ${n(xU)},${n(yB - r)}` +
    ` L${n(xU)},${n(e.y2 + r)}` +
    ` Q${n(xU)},${n(e.y2)} ${n(xU + r)},${n(e.y2)}` +
    ` L${n(e.x2)},${n(e.y2)}`
  );
}
