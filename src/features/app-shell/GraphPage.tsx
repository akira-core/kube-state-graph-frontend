import { useCallback, type JSX } from 'react';

import { DEFAULT_GRAPH_FILTERS, type IdentityDimension } from '../../shared/types/graphFilters';
import { buildGraphRequestUrl } from '../graph-data';
import { FilterBar, useFilterOptions } from '../graph-filters';
import { parseGraphScope, serializeGraphScope } from '../graph-filters/graphUrlScope';
import { GraphView } from '../graph-view';

import { useShellFrame } from './ShellFrame';
import { useAppliedScope, useSeedTimeOnMount } from './useAppliedScope';
import { useDraft } from './useDraft';
import { useLocateFromNavigation, usePageLoader } from './usePageLoader';

export function GraphPage(): JSX.Element {
  const { config, time } = useShellFrame();
  const serialize = config.demoMode ? () => [] : serializeGraphScope;
  const { applied, commit } = useAppliedScope(parseGraphScope, serialize);
  const { draft, setDraft, dirty } = useDraft(applied);
  useSeedTimeOnMount(applied, commit, time);
  const filterOptions = useFilterOptions(config.demoMode ? undefined : config.endpoints.labelValues);
  const graphEndpoint = config.demoMode ? undefined : config.endpoints.graph;
  const graph = usePageLoader({
    demoMode: config.demoMode,
    refreshIntervalSeconds: config.refreshIntervalSeconds,
  });
  const { locateNodeId, onLocateConsumed } = useLocateFromNavigation(applied, commit, time.range);

  const onQuery = useCallback(() => {
    const range = time.range;
    commit(draft, range);
    time.persist(range);
    graph.onQuery(() => (graphEndpoint === undefined ? undefined : buildGraphRequestUrl(graphEndpoint, range, draft)));
  }, [commit, draft, graph, graphEndpoint, time]);

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
          inFlight={graph.inFlight}
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
          onLocateConsumed={onLocateConsumed}
        />
      </main>
    </>
  );
}
