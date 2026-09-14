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
