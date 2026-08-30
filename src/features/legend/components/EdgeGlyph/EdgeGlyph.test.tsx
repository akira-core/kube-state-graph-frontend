import { render } from '@testing-library/react';
import React from 'react';

import { EdgeGlyph } from './EdgeGlyph';

describe('EdgeGlyph', () => {
  it('renders a line and arrowhead in the given colour', () => {
    const { getByTestId } = render(<EdgeGlyph color="#f97316" lineStyle="solid" />);
    const svg = getByTestId('edge-glyph');
    expect(svg.querySelector('line')?.getAttribute('stroke')).toBe('#f97316');
    expect(svg.querySelector('polygon')?.getAttribute('fill')).toBe('#f97316');
  });

  it('applies a dash pattern for dashed/dotted but not solid', () => {
    const { getByTestId, rerender } = render(<EdgeGlyph color="#10b981" lineStyle="dashed" />);
    expect(getByTestId('edge-glyph').querySelector('line')?.getAttribute('stroke-dasharray')).not.toBeNull();
    rerender(<EdgeGlyph color="#10b981" lineStyle="dotted" />);
    expect(getByTestId('edge-glyph').querySelector('line')?.getAttribute('stroke-dasharray')).not.toBeNull();
    rerender(<EdgeGlyph color="#10b981" lineStyle="solid" />);
    expect(getByTestId('edge-glyph').querySelector('line')?.getAttribute('stroke-dasharray')).toBeNull();
  });

  it('honours an explicit dashPattern for dashed, and ignores it for solid', () => {
    const { getByTestId, rerender } = render(<EdgeGlyph color="#f97316" lineStyle="dashed" dashPattern="8 8" />);
    expect(getByTestId('edge-glyph').querySelector('line')?.getAttribute('stroke-dasharray')).toBe('8 8');
    // A solid line has no dash rhythm to override.
    rerender(<EdgeGlyph color="#f97316" lineStyle="solid" dashPattern="8 8" />);
    expect(getByTestId('edge-glyph').querySelector('line')?.getAttribute('stroke-dasharray')).toBeNull();
  });

  it('caps dashed lines butt so the gaps survive, and everything else round', () => {
    const cap = (el: HTMLElement): string | null | undefined =>
      el.querySelector('line')?.getAttribute('stroke-linecap');
    // A round cap grows each dash by the full stroke width and shrinks each gap by the
    // same, which on this ~14-unit glyph closes the gaps entirely.
    const { getByTestId, rerender } = render(<EdgeGlyph color="#f97316" lineStyle="dashed" />);
    expect(cap(getByTestId('edge-glyph'))).toBe('butt');
    // `dotted` needs the round cap — it is what turns its 1.5-unit dashes into dots.
    rerender(<EdgeGlyph color="#f97316" lineStyle="dotted" />);
    expect(cap(getByTestId('edge-glyph'))).toBe('round');
    rerender(<EdgeGlyph color="#f97316" lineStyle="solid" />);
    expect(cap(getByTestId('edge-glyph'))).toBe('round');
  });

  it('draws a single arrowhead (one polygon)', () => {
    const { getByTestId } = render(<EdgeGlyph color="#10b981" lineStyle="solid" />);
    expect(getByTestId('edge-glyph').querySelectorAll('polygon')).toHaveLength(1);
  });

  it('draws a second (left-pointing) arrowhead when bidirectional, both in the edge colour', () => {
    const { getByTestId } = render(<EdgeGlyph color="#f97316" lineStyle="solid" bidirectional />);
    const svg = getByTestId('edge-glyph');
    const polygons = svg.querySelectorAll('polygon');
    expect(polygons).toHaveLength(2);
    for (const poly of Array.from(polygons)) {
      expect(poly.getAttribute('fill')).toBe('#f97316');
    }
  });
});
