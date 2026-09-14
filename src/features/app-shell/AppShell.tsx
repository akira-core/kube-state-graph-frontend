import { useEffect, useState, type JSX } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';

import type { RuntimeConfig } from '../runtime-config';

import { GraphPage } from './GraphPage';
import { NavBar } from './NavBar';
import { NetworkPage } from './NetworkPage';
import { NotFoundPage } from './NotFoundPage';
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
 * `/` is an alias for `/graph`, so it must carry the query across. A bare
 * `<Navigate to="/graph" />` would drop it, and a root link written with `from`/`to` (or
 * with a scope) would land on a graph that silently ignored both.
 */
function RootRedirect(): JSX.Element {
  const location = useLocation();
  return <Navigate to={{ pathname: '/graph', search: location.search }} replace />;
}

/** `/network` is an alias for `/network/graph`, carrying the query for the same reason. */
function NetworkRedirect(): JSX.Element {
  const location = useLocation();
  return <Navigate to={{ pathname: '/network/graph', search: location.search }} replace />;
}

function titleFor(path: string): string {
  switch (path) {
    case '/graph':
      return 'Kube State Graph — Graph';
    case '/sankey':
      return 'Kube State Graph — Sankey';
    case '/network/graph':
      return 'Kube State Graph — Network Graph';
    case '/network/sankey':
      return 'Kube State Graph — Network Sankey';
    default:
      return 'Kube State Graph';
  }
}

function AppLayout({ config }: Readonly<AppShellProps>): JSX.Element {
  const location = useLocation();
  const path = pathKey(location.pathname);
  const isGraph = path === '/graph';
  const isSankey = path === '/sankey';
  const isNetwork = path === '/network/graph' || path === '/network/sankey';
  const isAnySankey = isSankey || path === '/network/sankey';
  const time = useViewTimeRange();
  const [status, setStatus] = useState<PageStatus>(IDLE_PAGE_STATUS);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    document.title = titleFor(path);
  }, [path]);

  useEffect(() => {
    if (!isAnySankey && focusMode) {
      setFocusMode(false);
    }
  }, [focusMode, isAnySankey]);

  const notFound = !isGraph && !isSankey && !isNetwork && path !== '/' && path !== '/network';
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
            refreshIntervalSeconds={isGraph || isSankey || isNetwork ? config.refreshIntervalSeconds : 0}
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
        <Route path="/" element={<RootRedirect />} />
        <Route element={<AppLayout config={config} />}>
          <Route path="graph" element={<GraphPage />} />
          <Route path="sankey" element={<SankeyPage />} />
          <Route path="network" element={<NetworkRedirect />} />
          <Route path="network/:view" element={<NetworkPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
