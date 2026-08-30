import { tintSvgToDataUri } from './tintSvgToDataUri';

const SVG = '<svg viewBox="0 0 24 24"><path d="M2 2 L4 4" stroke="currentColor" fill="none"/></svg>';

describe('tintSvgToDataUri', () => {
  it('replaces the currentColor sentinel with the given colour', () => {
    const uri = tintSvgToDataUri(SVG, '#abcdef');
    expect(uri).not.toContain('currentColor');
    // the injected colour is present (hash percent-encoded, see below)
    expect(uri).toContain('abcdef');
  });

  it('emits a percent-encoded svg data-URI, not base64 (per cytoscape docs)', () => {
    const uri = tintSvgToDataUri(SVG, '#abcdef');
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    expect(uri).not.toContain(';base64,');
  });

  it('percent-encodes the hash of a hex colour as %23 and the markup angle brackets', () => {
    const uri = tintSvgToDataUri(SVG, '#abcdef');
    expect(uri).toContain('%23abcdef');
    expect(uri).not.toContain('#');
    expect(uri).toContain('%3Csvg');
    expect(uri).not.toContain('<');
  });

  it('returns a referentially stable, memoized result for the same (svg, colour)', () => {
    const a = tintSvgToDataUri(SVG, '#112233');
    const b = tintSvgToDataUri(SVG, '#112233');
    expect(a).toBe(b);
  });

  it('returns different results for different colours', () => {
    expect(tintSvgToDataUri(SVG, '#111111')).not.toBe(tintSvgToDataUri(SVG, '#222222'));
  });
});
