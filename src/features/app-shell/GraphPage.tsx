import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { DEFAULT_GRAPH_FILTERS, type ListDimension } from '../../shared/types/graphFilters';
import { buildGraphRequestUrl, graphRequestKey, useGraphLoader } from '../graph-data';
import { FilterBar, useFilterOptions } from '../graph-filters';
import { parseGraphScope, serializeGraphScope } from '../graph-filters/graphUrlScope';
import { GraphView } from '../graph-view';

import { IDLE_PAGE_STATUS, useShellFrame } from './ShellFrame';
import { useUrlScope } from './useUrlScope';

export function GraphPage(): JSX.Element {
  const { config, time, setStatus } = useShellFrame();
  const [filters, setFilters] = useUrlScope(
    parseGraphScope,
    serializeGraphScope,
    time.range,
    !config.demoMode,
    DEFAULT_GRAPH_FILTERS
  );
  const filterOptions = useFilterOptions(
    config.demoMode ? undefined : config.endpoints.labelValues,
    config.demoMode ? undefined : config.endpoints.edgeTypes
  );
  const graphEndpoint = config.demoMode ? undefined : config.endpoints.graph;
  const makeUrl = useCallback(
    () => (graphEndpoint === undefined ? undefined : buildGraphRequestUrl(graphEndpoint, time.range, filters)),
    [filters, graphEndpoint, time.range]
  );
  const requestKey = useMemo(
    () => graphRequestKey(graphEndpoint, time.range, filters),
    [filters, graphEndpoint, time.range]
  );
  const graph = useGraphLoader({
    demoMode: config.demoMode,
    makeUrl,
    requestKey,
    refreshIntervalSeconds: config.refreshIntervalSeconds,
  });

  const location = useLocation();
  const navigate = useNavigate();
  const [locateNodeId, setLocateNodeId] = useState<string | null>(null);

  useEffect(() => {
    const state = location.state as { locate?: unknown } | null;
    if (typeof state?.locate !== 'string' || state.locate.length === 0) {
      return;
    }
    setLocateNodeId(state.locate);
    void navigate('.', { replace: true, state: {} });
  }, [location.state, navigate]);

  useEffect(() => {
    setStatus({
      lastLoadedAt: graph.state.lastLoadedAt,
      refreshing: graph.state.refreshing || (graph.state.status === 'loading' && !graph.state.hasPayload),
      error: graph.state.error,
      reload: graph.reload,
      reloadDisabled: false,
    });
  }, [graph.reload, graph.state, setStatus]);

  useEffect(() => {
    return () => setStatus(IDLE_PAGE_STATUS);
  }, [setStatus]);

  const setValues = useCallback(
    (dimension: ListDimension, values: string[]) => {
      setFilters((prev) => ({ ...prev, [dimension]: values }));
    },
    [setFilters]
  );
  const setPrune = useCallback(
    (prune: boolean) => {
      setFilters((prev) => ({ ...prev, prune }));
    },
    [setFilters]
  );
  const clear = useCallback(() => {
    setFilters(DEFAULT_GRAPH_FILTERS);
  }, [setFilters]);

  return (
    <>
      {!config.demoMode && (
        <FilterBar filters={filters} options={filterOptions} onValues={setValues} onPrune={setPrune} onClear={clear} />
      )}
      <main className="relative min-h-0 flex-1">
        <GraphView
          config={config}
          elements={graph.state.elements}
          errors={graph.state.errors}
          error={graph.state.error}
          hasPayload={graph.state.hasPayload}
          status={graph.state.status}
          viewTimeRange={time.resolved}
          onAlertTimeClick={time.setAround}
          locateNodeId={locateNodeId}
          onLocateConsumed={() => setLocateNodeId(null)}
        />
      </main>
    </>
  );
}
