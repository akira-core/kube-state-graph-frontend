import { STATUS_COLOR } from '../constants/colorByStatus';

export const USAGE_FILL_OPACITY = 0.4;

const VIEWBOX = 24;

// Outer cylinder of the two Storage glyphs. Liquid is an inset rect inside the
// vertical walls (x=5..19) — cytoscape's SVG rasteriser drops clipPath url() and
// nested <svg> windows, but it does paint <rect>. Strokes of the ellipses sit on top.
const CYLINDER: Record<string, { top: number; bottom: number }> = {
  pvc: { top: 3.4, bottom: 20.6 },
  'netapp-aggr': { top: 3.1, bottom: 20.9 },
};

const fmt = (n: number): string => {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
};

export function usageFillColor(ratio: number): string {
  if (ratio >= 0.9) {
    return STATUS_COLOR.critical;
  }
  if (ratio >= 0.8) {
    return STATUS_COLOR.warning;
  }
  return STATUS_COLOR.normal;
}

// cytoscape's SVG rasteriser ignores fill-opacity, so alpha must live in the colour.
export function usageFillPaint(ratio: number): string {
  return hexToRgba(usageFillColor(ratio), USAGE_FILL_OPACITY);
}

function hexToRgba(hex: string, opacity: number): string {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Bottom-up translucent liquid painted INTO the kind SVG (strokes stay after it).
// pvc / netapp-aggr use an inset rect; any other kind gets a viewBox rect.
export function paintUsageLiquid(rawSvg: string, ratio: number, kind?: string): string {
  const clamped = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  const fill = usageFillPaint(clamped);
  const cylinder = kind !== undefined ? CYLINDER[kind] : undefined;

  let liquid: string;
  if (cylinder !== undefined) {
    const height = (cylinder.bottom - cylinder.top) * clamped;
    const y = cylinder.bottom - height;
    liquid = `<rect x="5" y="${fmt(y)}" width="14" height="${fmt(height)}" fill="${fill}" stroke="none"/>`;
  } else {
    const height = VIEWBOX * clamped;
    const y = VIEWBOX - height;
    liquid = `<rect x="0" y="${fmt(y)}" width="${VIEWBOX}" height="${fmt(height)}" fill="${fill}" stroke="none"/>`;
  }

  const open = /<svg\b[^>]*>/.exec(rawSvg);
  if (open === null || open.index === undefined) {
    return rawSvg;
  }
  const at = open.index + open[0].length;
  return `${rawSvg.slice(0, at)}${liquid}${rawSvg.slice(at)}`;
}
