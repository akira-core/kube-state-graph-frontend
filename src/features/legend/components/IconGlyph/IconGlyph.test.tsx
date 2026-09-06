import { render } from '@testing-library/react';
import React from 'react';

import { IconGlyph } from './IconGlyph';

describe('IconGlyph', () => {
  it('renders an img with a tinted svg data-URI for a known kind', () => {
    const { getByTestId } = render(<IconGlyph kind="deployment" />);
    const img = getByTestId('icon-glyph-deployment') as HTMLImageElement;
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml,/);
    expect(img.getAttribute('src')).not.toContain('currentColor');
  });

  it('renders the fallback glyph for an unknown kind (no throw)', () => {
    const { getByTestId } = render(<IconGlyph kind="customresource" />);
    const img = getByTestId('icon-glyph-customresource');
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml,/);
  });

  it('applies the requested size', () => {
    const { getByTestId } = render(<IconGlyph kind="pod" size={30} />);
    const img = getByTestId('icon-glyph-pod');
    expect(img.getAttribute('width')).toBe('30');
    expect(img.getAttribute('height')).toBe('30');
  });
});
