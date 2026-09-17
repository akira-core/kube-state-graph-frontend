// Intrinsic content-space geometry shared by every Sankey-style chart (storage flow, network
// trace). These are independent of the container's pixel size — a resize moves only the
// viewport transform (and only when the user asks it to), it never re-runs a layout (see
// `storage-flow-sankey` "尺寸與容器 resize"). One set of numbers so cards in one view are
// the same size as cards in another and the two views read as one product.
export const CARD_W = 208;
export const LEAF_W = 160;
export const HEADER_H = 40;
export const BODY_MIN = 24;
export const ROW_MIN_H = 22;
export const ROW_GAP = 8;
export const COL_GAP = 168;
export const V_GAP = 22;
export const PAD_X = 28;
export const PAD_TOP = 40;
export const PAD_BOTTOM = 24;
export const BODY_PAD_BOTTOM = 10;
export const MAX_THICKNESS = 72;
export const MIN_THICKNESS = 3;
/** Below this thickness a mid-ribbon value label would overlap its own stroke. */
export const LABEL_MIN_THICKNESS = 11;
export const WRAPPER_PAD = 10;
export const WRAPPER_HEADER_H = 40;
/** Baseline step of one extra text line inside a card body (below the subtitle). */
export const CARD_LINE_H = 13;

/** Height of a card's header: title, subtitle and one CARD_LINE_H step per attribute line. */
export function cardHeaderH(lines: number): number {
  return HEADER_H + CARD_LINE_H * lines;
}

/** An axis-aligned box in content coordinates — a card's or a wrapper's frame. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The smallest box enclosing every rect; `null` for none. */
export function unionRect(rects: Iterable<Rect>): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return minX === Infinity ? null : { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Total height of a slot stack: every slot at least one row tall, rows separated by ROW_GAP. */
export function stackHeight(slots: ReadonlyArray<{ thickness: number }>): number {
  if (slots.length === 0) {
    return 0;
  }
  return slots.reduce((sum, s) => sum + Math.max(s.thickness, ROW_MIN_H), 0) + (slots.length - 1) * ROW_GAP;
}

/** Centre-y of every slot when the stack is centred inside `[containerTop, containerTop + containerH]`. */
export function placeStack(
  slots: ReadonlyArray<{ thickness: number }>,
  containerTop: number,
  containerH: number
): number[] {
  const total = stackHeight(slots);
  let cursor = containerTop + Math.max(0, (containerH - total) / 2);
  const offsets: number[] = [];
  for (const slot of slots) {
    const h = Math.max(slot.thickness, ROW_MIN_H);
    offsets.push(cursor + h / 2);
    cursor += h + ROW_GAP;
  }
  return offsets;
}

/** A closed ribbon between two slot centres, `thickness` wide, cubic-eased across the gap. */
export function ribbonPath(x1: number, y1: number, x2: number, y2: number, thickness: number): string {
  const mx = (x1 + x2) / 2;
  const half = thickness / 2;
  return (
    `M${x1},${y1 - half} C${mx},${y1 - half} ${mx},${y2 - half} ${x2},${y2 - half} ` +
    `L${x2},${y2 + half} C${mx},${y2 + half} ${mx},${y1 + half} ${x1},${y1 + half} Z`
  );
}

/**
 * Linear thickness scale: the largest value on the chart draws at MAX_THICKNESS, everything
 * else proportionally, never thinner than MIN_THICKNESS. A chart with no positive value
 * draws every ribbon at the minimum.
 */
export function thicknessScale(maxValue: number): (value: number) => number {
  const scale = maxValue > 0 ? MAX_THICKNESS / maxValue : 0;
  return (value: number): number => Math.max(MIN_THICKNESS, value * scale);
}

/**
 * The direction mark of an amount ribbon: an open chevron just inside the ribbon's target
 * end (`x2`, `y2`), pointing the way the flow goes (`dir` +1 = rightward). Stroked, not
 * filled, so it reads on the gradient's end colour; sized to the ribbon but never below a
 * legible 3 px.
 */
export function endChevronPath(x2: number, y2: number, thickness: number, dir: 1 | -1): string {
  const s = Math.max(3, Math.min(7, thickness / 2 - 1));
  const n = (v: number): string => String(v);
  const tip = x2 - dir * 2;
  const tail = x2 - dir * (2 + s * 2);
  return `M${n(tail)},${n(y2 - s)} L${n(tip)},${n(y2)} L${n(tail)},${n(y2 + s)}`;
}
