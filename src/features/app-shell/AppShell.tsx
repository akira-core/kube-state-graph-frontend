import { useEffect, useState, type JSX } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';

import type { RuntimeConfig } from '../runtime-config';

import { GraphPage } from './GraphPage';
import { NavBar } from './NavBar';
import { NetworkPage } from './NetworkPage';
import { NotFoundPage } from './NotFoundPage';
import { categoryHome, documentTitle, isKnownPath, routeFor, type Category } from './routes';
import { SankeyPage } from './SankeyPage';
import { IDLE_PAGE_STATUS, ShellFrameProvider, type PageStatus } from './ShellFrame';
import { useViewTimeRange } from './useViewTimeRange';

export interface AppShellProps {
  config: RuntimeConfig;
}

function pathKey(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

/**
 * A category alias (`/`, `/network`) lands on that category's Graph and must carry the
 * query across. A bare `<Navigate to="/graph" />` would drop it, and a root link written
 * with `from`/`to` (or with a scope) would land on a graph that silently ignored both.
 */
function CategoryRedirect({ category }: Readonly<{ category: Category }>): JSX.Element {
  const location = useLocation();
  return <Navigate to={{ pathname: categoryHome(category), search: location.search }} replace />;
}

function AppLayout({ config }: Readonly<AppShellProps>): JSX.Element {
  const location = useLocation();
  const path = pathKey(location.pathname);
  const route = routeFor(path);
  const isAnySankey = route?.view === 'sankey';
  const time = useViewTimeRange();
  const [status, setStatus] = useState<PageStatus>(IDLE_PAGE_STATUS);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    document.title = documentTitle(path);
  }, [path]);

  useEffect(() => {
    if (!isAnySankey && focusMode) {
      setFocusMode(false);
    }
  }, [focusMode, isAnySankey]);

  const notFound = !isKnownPath(path);
  const reloadDisabled = notFound || status.reloadDisabled;

  return (
    <ShellFrameProvider value={{ config, time, status, setStatus, focusMode, setFocusMode }}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {!focusMode && (
          <NavBar
            demoMode={config.demoMode}
            phase={status.phase}
            lastLoadedAt={status.lastLoadedAt}
            refreshing={status.refreshing}
            error={status.error}
            refreshIntervalSeconds={route !== undefined ? config.refreshIntervalSeconds : 0}
            onReload={status.reload}
            reloadDisabled={reloadDisabled}
            viewRange={time.range}
            onRelative={time.setRelative}
            onAbsolute={time.setAbsolute}
          />
        )}
        <Outlet />
      </div>
    </ShellFrameProvider>
  );
}

export function AppShell({ config }: Readonly<AppShellProps>): JSX.Element {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<CategoryRedirect category="storage" />} />
        <Route element={<AppLayout config={config} />}>
          <Route path="graph" element={<GraphPage />} />
          <Route path="sankey" element={<SankeyPage />} />
          <Route path="network" element={<CategoryRedirect category="network" />} />
          <Route path="network/:view" element={<NetworkPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
