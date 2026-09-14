import type { EdgeGeom } from './geometry';

/**
 * Ownership line: the centre line of a ribbon, stroked rather than filled — a filled band
 * cannot be dashed, and the dash IS the "carries no amount" mark.
 */
export function ownLine(e: EdgeGeom): string {
  const mx = (e.x1 + e.x2) / 2;
  return `M${String(e.x1)},${String(e.y1)} C${String(mx)},${String(e.y1)} ${String(mx)},${String(e.y2)} ${String(e.x2)},${String(e.y2)}`;
}

/**
 * Same-column interconnect: a horseshoe on the column's right edge bulging `B` to the
 * right. The outer edge joins the two ends' far sides and the inner edge the near sides,
 * so the arc's crown is about as wide as the average ribbon.
 */
export function lateralRibbon(e: EdgeGeom, B: number): string {
  const a = e.t1 / 2;
  const b = e.t2 / 2;
  const s = e.y2 >= e.y1 ? 1 : -1;
  const k = (a + b) * 0.67;
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
export function backwardRibbon(e: EdgeGeom): string {
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
