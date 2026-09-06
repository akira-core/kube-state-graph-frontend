import { useEffect, useState, type JSX } from 'react';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';

import type { RuntimeConfig } from '../runtime-config';

import { GraphPage } from './GraphPage';
import { NavBar } from './NavBar';
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

function NotFoundPage(): JSX.Element {
  return (
    <main className="relative min-h-0 flex-1">
      <div className="flex h-full flex-col items-center justify-center gap-3 text-primary">
        <p className="text-[13px] text-secondary">Page not found</p>
        <Link
          to="/graph"
          className="inline-flex h-8 items-center rounded-md border border-hairline-strong bg-raised px-3 text-[13px] font-medium text-primary transition-colors duration-100 hover:bg-raised-hover"
        >
          Back to Graph
        </Link>
      </div>
    </main>
  );
}

function AppLayout({ config }: Readonly<AppShellProps>): JSX.Element {
  const location = useLocation();
  const path = pathKey(location.pathname);
  const isGraph = path === '/graph';
  const isSankey = path === '/sankey';
  const time = useViewTimeRange();
  const [status, setStatus] = useState<PageStatus>(IDLE_PAGE_STATUS);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    document.title = isSankey ? 'Kube State Graph — Sankey' : isGraph ? 'Kube State Graph — Graph' : 'Kube State Graph';
  }, [isGraph, isSankey]);

  useEffect(() => {
    if (!isSankey && focusMode) {
      setFocusMode(false);
    }
  }, [focusMode, isSankey]);

  const notFound = !isGraph && !isSankey && path !== '/';
  const reloadDisabled = notFound || status.reloadDisabled;

  return (
    <ShellFrameProvider value={{ config, time, status, setStatus, focusMode, setFocusMode }}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {!focusMode && (
          <NavBar
            demoMode={config.demoMode}
            lastLoadedAt={status.lastLoadedAt}
            refreshing={status.refreshing}
            error={status.error}
            refreshIntervalSeconds={isGraph || isSankey ? config.refreshIntervalSeconds : 0}
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
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
