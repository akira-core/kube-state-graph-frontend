/**
 * The one table every route-shaped fact derives from: the shell's route elements, the
 * document title, the nav bar's categories and views, the not-found predicate, the
 * Network page's `:view` guard and the not-found page's way home. Adding a route means
 * adding a row here and one `<Route>` in AppShell — nothing else.
 */
export type Category = 'storage' | 'network';
export type View = 'graph' | 'sankey';

export interface RouteEntry {
  path: string;
  category: Category;
  view: View;
  /** The document-title suffix. */
  title: string;
  /**
   * Whether switching to this view inside its category keeps the query string. The
   * Network category's loader is shared by both of its views, so the controls must keep
   * showing what was drawn; the Storage views each own a loader and start with a fresh scope.
   */
  keepSearch: boolean;
}

export const ROUTES: readonly RouteEntry[] = [
  { path: '/graph', category: 'storage', view: 'graph', title: 'Graph', keepSearch: false },
  { path: '/sankey', category: 'storage', view: 'sankey', title: 'Sankey', keepSearch: false },
  { path: '/network/graph', category: 'network', view: 'graph', title: 'Network Graph', keepSearch: true },
  { path: '/network/sankey', category: 'network', view: 'sankey', title: 'Network Sankey', keepSearch: true },
];

export const CATEGORY_LABEL: Record<Category, string> = { storage: 'Storage', network: 'Network' };
/** The nav's view segments, the same words in every category. */
export const VIEW_LABEL: Record<View, string> = { graph: 'Graph', sankey: 'Sankey' };

/** Category aliases: each redirects (query kept) to that category's Graph. */
export const CATEGORY_ALIAS: Record<Category, string> = { storage: '/', network: '/network' };

const APP_TITLE = 'Kube State Graph';

export function routeFor(path: string): RouteEntry | undefined {
  return ROUTES.find((r) => r.path === path);
}

/** The category a pathname belongs to, aliases included; unknown paths read as Storage. */
export function categoryOf(pathname: string): Category {
  return pathname === CATEGORY_ALIAS.network || pathname.startsWith(`${CATEGORY_ALIAS.network}/`)
    ? 'network'
    : 'storage';
}

/** The category's Graph row; a category without one is a broken table, not a missing route. */
function graphRouteOf(category: Category): RouteEntry {
  const entry = ROUTES.find((r) => r.category === category && r.view === 'graph');
  if (entry === undefined) {
    throw new Error(`ROUTES has no Graph route for the ${category} category`);
  }
  return entry;
}

// Resolved once: the `Record` makes a new category without a home a compile error, and
// the throw above makes a row that went missing a load-time one.
const CATEGORY_HOME: Record<Category, string> = {
  storage: graphRouteOf('storage').path,
  network: graphRouteOf('network').path,
};

/** The route a category lands on when chosen from the nav. */
export function categoryHome(category: Category): string {
  return CATEGORY_HOME[category];
}

export const HOME_PATH = categoryHome('storage');

export function viewsOf(category: Category): readonly RouteEntry[] {
  return ROUTES.filter((r) => r.category === category);
}

export function isKnownPath(path: string): boolean {
  return routeFor(path) !== undefined || Object.values(CATEGORY_ALIAS).includes(path);
}

export function documentTitle(path: string): string {
  const route = routeFor(path);
  return route === undefined ? APP_TITLE : `${APP_TITLE} — ${route.title}`;
}
