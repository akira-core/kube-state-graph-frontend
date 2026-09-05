import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';

import { DEMO_IDENTITY_OPTIONS, SHOWCASE_STORAGE_GRAPH } from '../../shared/fixtures/showcaseStorageGraph';
import {
  buildGraphRequestUrl,
  buildStorageGraphRequestUrl,
  graphRequestKey,
  storageGraphRequestKey,
  useGraphLoader,
} from '../graph-data';
import { FilterBar, useFilterOptions, useGraphFilters } from '../graph-filters';
import { GraphView } from '../graph-view';
import type { RuntimeConfig } from '../runtime-config';
import { SankeyScopeBar, SankeyView, useSankeyQuery } from '../storage-flow-sankey';

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
  const [sankeyVisited, setSankeyVisited] = useState(isSankey);
  const time = useViewTimeRange();
  const { filters, setValues, setPrune, clear } = useGraphFilters();
  const filterOptions = useFilterOptions(
    config.demoMode ? undefined : config.endpoints.labelValues,
    config.demoMode ? undefined : config.endpoints.edgeTypes
  );
  const sankeyIdentity = config.demoMode
    ? DEMO_IDENTITY_OPTIONS
    : {
        az: filterOptions.az,
        env: filterOptions.env,
        cluster: filterOptions.cluster,
        namespace: filterOptions.namespace,
      };
  const sankeyQuery = useSankeyQuery(sankeyIdentity);

  const graphEndpoint = config.demoMode ? undefined : config.endpoints.graph;
  const storageEndpoint = config.demoMode ? undefined : config.endpoints.storageGraph;
  const storageConfigured = config.demoMode || storageEndpoint !== undefined;

  const makeGraphUrl = useCallback(
    () => (graphEndpoint === undefined ? undefined : buildGraphRequestUrl(graphEndpoint, time.range, filters)),
    [graphEndpoint, time.range, filters]
  );
  const graphKey = useMemo(
    () => graphRequestKey(graphEndpoint, time.range, filters),
    [graphEndpoint, time.range, filters]
  );
  const graph = useGraphLoader({
    demoMode: config.demoMode,
    makeUrl: makeGraphUrl,
    requestKey: graphKey,
    refreshIntervalSeconds: isGraph ? config.refreshIntervalSeconds : 0,
  });

  const makeStorageUrl = useCallback(
    () =>
      storageEndpoint === undefined
        ? undefined
        : buildStorageGraphRequestUrl(storageEndpoint, time.range, sankeyQuery.query),
    [storageEndpoint, time.range, sankeyQuery.query]
  );
  const storageKey = useMemo(
    () => storageGraphRequestKey(storageEndpoint, time.range, sankeyQuery.query),
    [storageEndpoint, time.range, sankeyQuery.query]
  );
  const storageEnabled = sankeyVisited && sankeyQuery.azEnvReady && storageConfigured;
  const storage = useGraphLoader({
    demoMode: config.demoMode,
    demoPayload: SHOWCASE_STORAGE_GRAPH,
    enabled: storageEnabled,
    makeUrl: makeStorageUrl,
    requestKey: storageKey,
    refreshIntervalSeconds: isSankey ? config.refreshIntervalSeconds : 0,
  });

  const [locateId, setLocateId] = useState<string | null>(null);

  useEffect(() => {
    if (isGraph) {
      setGraphMounted(true);
    }
    if (isSankey) {
      setSankeyMounted(true);
      setSankeyVisited(true);
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
  const active = isSankey ? storage.state : graph.state;
  const reloadDisabled =
    notFound || (isSankey && (!sankeyQuery.azEnvReady || (!config.demoMode && storageEndpoint === undefined)));

  const graphProps = useMemo(
    () => ({
      config,
      elements: graph.state.elements,
      errors: graph.state.errors,
      error: graph.state.error,
      hasPayload: graph.state.hasPayload,
      status: graph.state.status,
      viewTimeRange: time.resolved,
    }),
    [config, graph.state, time.resolved]
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {!sankeyFocusMode && (
        <NavBar
          demoMode={config.demoMode}
          lastLoadedAt={active.lastLoadedAt}
          refreshing={active.refreshing || (active.status === 'loading' && !active.hasPayload)}
          error={active.error}
          refreshIntervalSeconds={isGraph || isSankey ? config.refreshIntervalSeconds : 0}
          onReload={isSankey ? storage.reload : graph.reload}
          reloadDisabled={reloadDisabled}
          viewRange={time.range}
          onRelative={time.setRelative}
          onAbsolute={time.setAbsolute}
        />
      )}
      {isGraph && !config.demoMode && (
        <FilterBar filters={filters} options={filterOptions} onValues={setValues} onPrune={setPrune} onClear={clear} />
      )}
      {isSankey && !sankeyFocusMode && <SankeyScopeBar options={sankeyIdentity} controller={sankeyQuery} />}
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
              elements={storage.state.elements}
              status={storage.state.status}
              error={storage.state.error}
              hasPayload={storage.state.hasPayload}
              demoMode={config.demoMode}
              visible={isSankey}
              focusMode={sankeyFocusMode}
              onFocusModeChange={setSankeyFocusMode}
              endpointConfigured={storageConfigured}
              azEnvReady={sankeyQuery.azEnvReady}
              roots={sankeyQuery.query.roots}
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
