import { describe, expect, it } from 'vitest';

import { ALIASES, documentTitle, HOME_PATH, isKnownPath, routeFor, ROUTES } from './routes';

describe('routes', () => {
  it('titles the three pages and falls back to the bare app name', () => {
    expect(documentTitle('/graph')).toBe('Kube State Graph — Graph');
    expect(documentTitle('/sankey')).toBe('Kube State Graph — Sankey');
    expect(documentTitle('/network/sankey')).toBe('Kube State Graph — Network Sankey');
    expect(documentTitle('/network/graph')).toBe('Kube State Graph');
    expect(documentTitle('/nope')).toBe('Kube State Graph');
  });

  it('knows the three routes and the two aliases, nothing else', () => {
    expect(ROUTES.map((r) => r.path)).toEqual(['/graph', '/sankey', '/network/sankey']);
    for (const p of ['/graph', '/sankey', '/network/sankey', '/', '/network']) {
      expect(isKnownPath(p)).toBe(true);
    }
    for (const p of ['/network/graph', '/network/bogus', '/networking', '/foo/bar']) {
      expect(isKnownPath(p)).toBe(false);
    }
    expect(routeFor('/network/graph')).toBeUndefined();
  });

  it('redirects each alias to a page and names the kind of each page', () => {
    expect(ALIASES).toEqual({ '/': '/graph', '/network': '/network/sankey' });
    expect(HOME_PATH).toBe('/graph');
    for (const target of Object.values(ALIASES)) {
      expect(routeFor(target)).toBeDefined();
    }
    expect(ROUTES.map((r) => r.kind)).toEqual(['graph', 'sankey', 'sankey']);
  });
});
