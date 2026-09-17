/**
 * The one table every route-shaped fact derives from: the shell's route elements, the
 * document title, the not-found predicate and the not-found page's way home. Each row is a
 * standalone page, reached by its URL and by nothing in the shell. Adding a route means
 * adding a row here and one `<Route>` in AppShell — nothing else.
 */
export type RouteKind = 'graph' | 'sankey';

export interface RouteEntry {
  path: string;
  /** The document-title suffix. */
  title: string;
  /** What the page draws; focus mode exists only on a Sankey. */
  kind: RouteKind;
}

export const ROUTES: readonly RouteEntry[] = [
  { path: '/graph', title: 'Graph', kind: 'graph' },
  { path: '/sankey', title: 'Sankey', kind: 'sankey' },
  { path: '/network/sankey', title: 'Network Sankey', kind: 'sankey' },
];

export type AliasPath = '/' | '/network';

/** Paths that are not pages: each redirects (query kept) to the page it names. */
export const ALIASES: Readonly<Record<AliasPath, string>> = { '/': '/graph', '/network': '/network/sankey' };

export const HOME_PATH = ALIASES['/'];

const APP_TITLE = 'Kube State Graph';

export function routeFor(path: string): RouteEntry | undefined {
  return ROUTES.find((r) => r.path === path);
}

export function isKnownPath(path: string): boolean {
  return routeFor(path) !== undefined || Object.hasOwn(ALIASES, path);
}

export function documentTitle(path: string): string {
  const route = routeFor(path);
  return route === undefined ? APP_TITLE : `${APP_TITLE} — ${route.title}`;
}
