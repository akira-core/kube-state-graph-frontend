import type { CSSProperties } from 'react';

import type { ThemeTokens } from '../../shared/theme/tokens';

/**
 * The stroke that keeps an SVG label legible where it crosses a ribbon: painted under the
 * glyphs in the canvas colour. One definition for every Sankey-style chart's amounts and
 * captions, so the two charts cannot drift on the halo's width or colour.
 */
export function haloStyle(tokens: ThemeTokens): CSSProperties {
  return { paintOrder: 'stroke', stroke: tokens.bg.canvas, strokeWidth: 3.5 };
}
