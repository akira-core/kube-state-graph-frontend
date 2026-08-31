import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';

import { buildGraphRequestUrl, graphRequestKey, useGraphLoader } from '../graph-data';
import { FilterBar, useFilterOptions, useGraphFilters } from '../graph-filters';
import { GraphView } from '../graph-view';
import type { RuntimeConfig } from '../runtime-config';
import { SankeyView } from '../storage-flow-sankey';

import { NavBar } from './NavBar';
import { useViewTimeRange } from './useViewTimeRange';

export interface AppShellProps {
  config: RuntimeConfig;
}

function pathKey(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

function ViewHost({ config }: Readonly<AppShellProps>): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const path = pathKey(location.pathname);
  const isGraph = path === '/graph';
  const isSankey = path === '/sankey';
  const [graphMounted, setGraphMounted] = useState(isGraph);
  const [sankeyMounted, setSankeyMounted] = useState(isSankey);
  const [sankeyFocusMode, setSankeyFocusMode] = useState(false);
  const time = useViewTimeRange();
  const { filters, setValues, setPrune, clear } = useGraphFilters();
  // Demo mode renders a bundled fixture, so there is no backend to narrow: the option
  // sources are not consulted and the bar is not rendered.
  const filterOptions = useFilterOptions(
    config.demoMode ? undefined : config.endpoints.labelValues,
    config.demoMode ? undefined : config.endpoints.edgeTypes
  );
  const graphEndpoint = config.demoMode ? undefined : config.endpoints.graph;
  // The URL is a function rather than a value: a relative window must re-read the clock
  // on every request, so the loader calls this when it fetches, not when we render.
  const makeUrl = useCallback(
    () => (graphEndpoint === undefined ? undefined : buildGraphRequestUrl(graphEndpoint, time.range, filters)),
    [graphEndpoint, time.range, filters]
  );
  const requestKey = useMemo(
    () => graphRequestKey(graphEndpoint, time.range, filters),
    [graphEndpoint, time.range, filters]
  );
  const { state, reload } = useGraphLoader({
    demoMode: config.demoMode,
    makeUrl,
    requestKey,
    refreshIntervalSeconds: config.refreshIntervalSeconds,
  });
  const [locateId, setLocateId] = useState<string | null>(null);

  useEffect(() => {
    if (isGraph) {
      setGraphMounted(true);
    }
    if (isSankey) {
      setSankeyMounted(true);
    }
  }, [isGraph, isSankey]);

  useEffect(() => {
    document.title = isSankey ? 'Kube State Graph — Sankey' : isGraph ? 'Kube State Graph — Graph' : 'Kube State Graph';
  }, [isGraph, isSankey]);

  // Sankey's focus mode is the one place a view hides the shell chrome — it MUST NOT
  // outlive the view it was entered from (app-shell "頂部導覽列", the Sankey exception).
  useEffect(() => {
    if (!isSankey && sankeyFocusMode) {
      setSankeyFocusMode(false);
    }
  }, [isSankey, sankeyFocusMode]);

  const notFound = !isGraph && !isSankey && path !== '/';

  const graphProps = useMemo(
    () => ({
      config,
      elements: state.elements,
      errors: state.errors,
      error: state.error,
      hasPayload: state.hasPayload,
      status: state.status,
      viewTimeRange: time.resolved,
    }),
    [config, state, time.resolved]
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {!sankeyFocusMode && (
        <NavBar
          demoMode={config.demoMode}
          lastLoadedAt={state.lastLoadedAt}
          refreshing={state.refreshing || (state.status === 'loading' && !state.hasPayload)}
          error={state.error}
          refreshIntervalSeconds={config.refreshIntervalSeconds}
          onReload={reload}
          viewRange={time.range}
          onRelative={time.setRelative}
          onAbsolute={time.setAbsolute}
        />
      )}
      {!config.demoMode && (
        <FilterBar filters={filters} options={filterOptions} onValues={setValues} onPrune={setPrune} onClear={clear} />
      )}
      <main className="relative min-h-0 flex-1">
        {graphMounted && (
          <div className="absolute inset-0" hidden={!isGraph}>
            <GraphView
              {...graphProps}
              onAlertTimeClick={time.setAround}
              locateNodeId={locateId}
              onLocateConsumed={() => setLocateId(null)}
            />
          </div>
        )}
        {sankeyMounted && (
          <div className="absolute inset-0" hidden={!isSankey}>
            <SankeyView
              elements={state.elements}
              status={state.status}
              error={state.error}
              hasPayload={state.hasPayload}
              demoMode={config.demoMode}
              visible={isSankey}
              focusMode={sankeyFocusMode}
              onFocusModeChange={setSankeyFocusMode}
              onLocateNode={(id) => {
                setLocateId(id);
                void navigate('/graph');
              }}
            />
          </div>
        )}
        {notFound && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-primary">
            <p className="text-[13px] text-secondary">Page not found</p>
            <Link
              to="/graph"
              className="inline-flex h-8 items-center rounded-md border border-hairline-strong bg-raised px-3 text-[13px] font-medium text-primary transition-colors duration-100 hover:bg-raised-hover"
            >
              Back to Graph
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

// No ThemeProvider here: App already wraps this in one with the same `config.theme`.
// A second provider means a second useThemeController, and both write
// `documentElement.classList.toggle('dark', …)`. Only the inner one is reachable from
// NavBar, so after a user theme choice the outer controller keeps its own stale
// `effective` and re-adds/removes `.dark` on the next OS theme change — leaving the
// html class contradicting the tokens the app actually rendered with.
export function AppShell({ config }: Readonly<AppShellProps>): JSX.Element {
  return (
    // Routes are relative to the app base URL: deployed under `/ksg/`, the Sankey deep link
    // is `/ksg/sankey`. `import.meta.env.BASE_URL` is the same value runtime-config uses to
    // locate config.json, so both resolve against one build-time base ('/' by default).
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        {/* React Router 7 treats `/graph` and `/graph/` as the same path, so a
            Navigate from `/graph/` → `/graph` loops and never commits. Trailing
            slashes are normalised in ViewHost via pathKey. */}
        <Route path="/" element={<Navigate to="/graph" replace />} />
        <Route path="*" element={<ViewHost config={config} />} />
      </Routes>
    </BrowserRouter>
  );
}
