import { useCallback, useMemo, useState, type JSX } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';

import { SHOWCASE_TRACE } from '../../shared/fixtures/showcaseTrace';
import { parseTimeQuery } from '../../shared/time/viewTimeRange';
import { buildTraceRequestUrl } from '../graph-data';
import { GraphView } from '../graph-view';
import {
  buildTraceQuery,
  parseTraceScope,
  serializeTraceScope,
  TraceScopeBar,
  TraceView,
  useHostnameCandidates,
  type TraceDraft,
  type TraceLayout,
} from '../network-trace';

import { NotFoundPage } from './NotFoundPage';
import { routeFor } from './routes';
import { useShellFrame } from './ShellFrame';
import { useAppliedScope, useSeedTimeOnMount } from './useAppliedScope';
import { useDraft } from './useDraft';
import { useLocateFromNavigation, usePageLoader } from './usePageLoader';

/**
 * The Network category: one page for both of its views. The route's `:view` picks Graph
 * or Sankey, but the loader — and the drawn body — belong to the page, so switching views
 * never refetches. Everything else follows the Storage pages: the URL is the applied
 * scope, the draft is local, Query commits and fetches.
 */
export function NetworkPage(): JSX.Element {
  const { view } = useParams<{ view: string }>();
  const { config, time, focusMode, setFocusMode } = useShellFrame();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const serialize = config.demoMode ? () => [] : serializeTraceScope;
  const { applied, commit } = useAppliedScope(parseTraceScope, serialize);
  const { draft, setDraft, dirty } = useDraft(applied.query);
  useSeedTimeOnMount(applied, commit, time);

  const endpoint = config.demoMode ? undefined : config.endpoints.trace;
  const endpointConfigured = config.demoMode || endpoint !== undefined;
  const built = useMemo(() => buildTraceQuery(draft), [draft]);
  const leaveFocusMode = useCallback(() => setFocusMode(false), [setFocusMode]);
  const trace = usePageLoader({
    demoMode: config.demoMode,
    demoPayload: SHOWCASE_TRACE,
    refreshIntervalSeconds: config.refreshIntervalSeconds,
    reloadDisabled: !config.demoMode && (endpoint === undefined || !built.ok),
    onTeardown: leaveFocusMode,
  });
  // The URL's own complaints show until the draft is edited into something valid; a
  // draft that does not build is refused with its messages instead of being sent.
  const problems = useMemo(
    () => (built.ok ? (dirty ? [] : applied.problems) : built.problems),
    [applied.problems, built, dirty]
  );
  const [demoMinBps, setDemoMinBps] = useState(0);
  const [layout, setLayout] = useState<TraceLayout>('flat');

  // Memoised on the params object: `parseTimeQuery` returns a fresh object per call, and an
  // identity that changed every render would churn every callback below and, through
  // `onMinBpsChange`, restart the view's threshold debounce on each render.
  const appliedRange = useMemo(() => parseTimeQuery(searchParams) ?? time.range, [searchParams, time.range]);
  const minBps = config.demoMode ? demoMinBps : applied.minBps;

  const onQuery = useCallback(() => {
    if (!built.ok) {
      return;
    }
    const range = time.range;
    commit({ query: draft, minBps: applied.minBps, problems: [] }, range);
    time.persist(range);
    trace.onQuery(() => (endpoint === undefined ? undefined : buildTraceRequestUrl(endpoint, range, built.query)));
  }, [applied.minBps, built, commit, draft, endpoint, time, trace]);

  const onMinBpsChange = useCallback(
    (next: number) => {
      if (config.demoMode) {
        setDemoMinBps(next);
        return;
      }
      commit({ ...applied, minBps: next }, appliedRange);
    },
    [applied, appliedRange, commit, config.demoMode]
  );

  const onDraftChange = useCallback(
    (patch: Partial<TraceDraft>) => {
      setDraft((prev) => ({ ...prev, ...patch }));
    },
    [setDraft]
  );

  // Locate from the Sankey lands here with the node id in navigation state.
  const { locateNodeId, onLocateConsumed } = useLocateFromNavigation(applied, commit, time.range);

  const onLocateNode = useCallback(
    (id: string) => {
      void navigate({ pathname: '/network/graph', search: location.search }, { state: { locate: id } });
    },
    [location.search, navigate]
  );

  const hostnameOptions = useHostnameCandidates(trace.state.elements);

  // Same chrome as the shell's `*` route (both render under AppLayout); the table decides
  // which `:view` values exist so this guard cannot drift from the nav.
  const route = routeFor(`/network/${view ?? ''}`);
  if (route === undefined || (view !== 'graph' && view !== 'sankey')) {
    return <NotFoundPage />;
  }

  return (
    <>
      {!focusMode && (
        <TraceScopeBar
          draft={draft}
          onDraftChange={onDraftChange}
          hostnameOptions={hostnameOptions}
          problems={problems}
          dirty={config.demoMode ? false : dirty}
          inFlight={trace.inFlight}
          onQuery={onQuery}
          onCancel={trace.cancel}
          hideQuery={config.demoMode}
        />
      )}
      <main className="relative min-h-0 flex-1">
        {view === 'graph' ? (
          <GraphView
            config={config}
            elements={trace.state.elements}
            errors={trace.state.errors}
            error={trace.state.error}
            hasPayload={trace.state.hasPayload}
            cancelled={trace.state.cancelled}
            status={trace.state.status}
            viewTimeRange={time.resolved}
            onAlertTimeClick={time.setAround}
            locateNodeId={locateNodeId}
            onLocateConsumed={onLocateConsumed}
          />
        ) : (
          <TraceView
            elements={trace.state.elements}
            status={trace.state.status}
            error={trace.state.error}
            errors={trace.state.errors}
            hasPayload={trace.state.hasPayload}
            cancelled={trace.state.cancelled}
            demoMode={config.demoMode}
            focusMode={focusMode}
            onFocusModeChange={setFocusMode}
            endpointConfigured={endpointConfigured}
            scopeReady={built.ok && applied.problems.length === 0}
            trackDir={config.demoMode ? 'destination' : trace.armed ? applied.query.trackDir : undefined}
            minBps={minBps}
            onMinBpsChange={onMinBpsChange}
            onLocateNode={onLocateNode}
            layout={layout}
            onLayoutChange={setLayout}
          />
        )}
      </main>
    </>
  );
}
