import { useCallback, useEffect, useState, type JSX } from 'react';
import { useLocation } from 'react-router';

import { parseTimeQuery } from '../../shared/time/viewTimeRange';
import { DEFAULT_GRAPH_FILTERS, type IdentityDimension } from '../../shared/types/graphFilters';
import { buildGraphRequestUrl, useGraphLoader } from '../graph-data';
import { FilterBar, useFilterOptions } from '../graph-filters';
import { parseGraphScope, serializeGraphScope } from '../graph-filters/graphUrlScope';
import { GraphView } from '../graph-view';

import { IDLE_PAGE_STATUS, phaseOf, useShellFrame } from './ShellFrame';
import { useAppliedScope, useSeedTimeOnMount } from './useAppliedScope';
import { useDraft } from './useDraft';

export function GraphPage(): JSX.Element {
  const { config, time, setStatus } = useShellFrame();
  const serialize = config.demoMode ? () => [] : serializeGraphScope;
  const { applied, commit } = useAppliedScope(parseGraphScope, serialize);
  const { draft, setDraft, dirty } = useDraft(applied);
  useSeedTimeOnMount(applied, commit, time);
  const filterOptions = useFilterOptions(config.demoMode ? undefined : config.endpoints.labelValues);
  const graphEndpoint = config.demoMode ? undefined : config.endpoints.graph;
  const graph = useGraphLoader({
    demoMode: config.demoMode,
    refreshIntervalSeconds: config.refreshIntervalSeconds,
  });
  const [armed, setArmed] = useState(config.demoMode);

  const location = useLocation();
  const [locateNodeId, setLocateNodeId] = useState<string | null>(null);

  const run = graph.run;
  useEffect(() => {
    if (!config.demoMode) {
      return;
    }
    run(() => undefined);
  }, [config.demoMode, run]);

  useEffect(() => {
    const state = location.state as { locate?: unknown } | null;
    if (typeof state?.locate !== 'string' || state.locate.length === 0) {
      return;
    }
    setLocateNodeId(state.locate);
    // Clear the navigation state through `commit`, whose replace carries none. A navigate of
    // its own here would run in the same effect flush as the mount seed with this render's
    // URL, writing the pre-seed query back over the `from` / `to` the seed just wrote. Built
    // from the seed's own inputs, the two writes agree whichever lands last.
    commit(applied, parseTimeQuery(new URLSearchParams(location.search)) ?? time.range);
  }, [applied, commit, location.search, location.state, time.range]);

  const onQuery = useCallback(() => {
    const range = time.range;
    commit(draft, range);
    time.persist(range);
    setArmed(true);
    graph.run(() => (graphEndpoint === undefined ? undefined : buildGraphRequestUrl(graphEndpoint, range, draft)));
  }, [commit, draft, graph, graphEndpoint, time]);

  useEffect(() => {
    setStatus({
      phase: phaseOf(graph.state),
      lastLoadedAt: graph.state.lastLoadedAt,
      refreshing: graph.state.refreshing || (graph.state.status === 'loading' && !graph.state.hasPayload),
      error: graph.state.cancelled ? undefined : graph.state.error,
      reload: graph.reload,
      reloadDisabled: !armed,
    });
  }, [armed, graph.reload, graph.state, setStatus]);

  useEffect(() => {
    return () => setStatus(IDLE_PAGE_STATUS);
  }, [setStatus]);

  const setValues = useCallback(
    (dimension: IdentityDimension, values: string[]) => {
      setDraft((prev) => ({ ...prev, [dimension]: values }));
    },
    [setDraft]
  );
  const setPrune = useCallback(
    (prune: boolean) => {
      setDraft((prev) => ({ ...prev, prune }));
    },
    [setDraft]
  );
  const clear = useCallback(() => {
    setDraft(DEFAULT_GRAPH_FILTERS);
  }, [setDraft]);

  const inFlight = graph.state.status === 'loading' || graph.state.refreshing;

  return (
    <>
      {!config.demoMode && (
        <FilterBar
          filters={draft}
          options={filterOptions}
          onValues={setValues}
          onPrune={setPrune}
          onClear={clear}
          dirty={dirty}
          inFlight={inFlight}
          onQuery={onQuery}
          onCancel={graph.cancel}
        />
      )}
      <main className="relative min-h-0 flex-1">
        <GraphView
          config={config}
          elements={graph.state.elements}
          errors={graph.state.errors}
          error={graph.state.error}
          hasPayload={graph.state.hasPayload}
          cancelled={graph.state.cancelled}
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
