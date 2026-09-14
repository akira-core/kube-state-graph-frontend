import { describe, expect, it } from 'vitest';

import { categoryHome, categoryOf, documentTitle, HOME_PATH, isKnownPath, routeFor, viewsOf } from './routes';

describe('routes', () => {
  it('titles known routes and falls back to the bare app name', () => {
    expect(documentTitle('/graph')).toBe('Kube State Graph — Graph');
    expect(documentTitle('/network/sankey')).toBe('Kube State Graph — Network Sankey');
    expect(documentTitle('/nope')).toBe('Kube State Graph');
  });

  it('knows the four routes and the two aliases, nothing else', () => {
    for (const p of ['/graph', '/sankey', '/network/graph', '/network/sankey', '/', '/network']) {
      expect(isKnownPath(p)).toBe(true);
    }
    expect(isKnownPath('/network/bogus')).toBe(false);
    expect(routeFor('/network/bogus')).toBeUndefined();
  });

  it('derives the nav from the table', () => {
    expect(categoryOf('/network')).toBe('network');
    expect(categoryOf('/network/sankey')).toBe('network');
    expect(categoryOf('/networking')).toBe('storage');
    expect(categoryHome('network')).toBe('/network/graph');
    expect(HOME_PATH).toBe('/graph');
    expect(viewsOf('storage').map((r) => r.path)).toEqual(['/graph', '/sankey']);
    expect(viewsOf('network').every((r) => r.keepSearch)).toBe(true);
  });
});
