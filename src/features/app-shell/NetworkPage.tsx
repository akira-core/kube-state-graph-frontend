import { useCallback, useMemo, useState, type JSX } from 'react';

import { SHOWCASE_TRACE } from '../../shared/fixtures/showcaseTrace';
import { buildTraceRequestUrl } from '../graph-data';
import {
  buildTraceQuery,
  parseTraceScope,
  serializeTraceScope,
  TraceScopeBar,
  TraceView,
  TraceViewControls,
  useHostnameCandidates,
  useTraceModel,
  type TraceDirection,
  type TraceDraft,
  type TraceGrouping,
  type TraceNodeOrder,
} from '../network-trace';

import { useShellFrame } from './ShellFrame';
import { useAppliedScope, useCommitField, useSeedTimeOnMount } from './useAppliedScope';
import { useDraft } from './useDraft';
import { usePageLoader } from './usePageLoader';

/**
 * The Network Sankey: a standalone page at `/network/sankey`. Everything follows the
 * Storage pages — the URL is the applied scope, the draft is local, Query commits and
 * fetches — and the page owns the derived model, so the chart and the view controls in its
 * scope bar read the same one.
 */
export function NetworkPage(): JSX.Element {
  const { config, time, focusMode, setFocusMode } = useShellFrame();
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
  const [grouping, setGrouping] = useState<TraceGrouping>('none');
  const [order, setOrder] = useState<TraceNodeOrder>('flow');
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

  const onMinBpsChange = useCommitField('minBps', {
    applied,
    commit,
    fallbackRange: time.range,
    demoMode: config.demoMode,
    onDemo: setDemoMinBps,
  });

  const onDraftChange = useCallback(
    (patch: Partial<TraceDraft>) => {
      setDraft((prev) => ({ ...prev, ...patch }));
    },
    [setDraft]
  );

  // The view only knows the direction once a query has been sent (the fixture is always a
  // destination trace); before that it has nothing to orient the columns by.
  let trackDir: TraceDirection | undefined;
  if (config.demoMode) {
    trackDir = 'destination';
  } else if (trace.armed) {
    trackDir = applied.query.trackDir;
  }

  const { elements, errors } = trace.state;
  const { direction, model } = useTraceModel({ elements, trackDir, minBps, grouping });
  const warnings = useMemo(
    () => [
      ...(direction.warning !== undefined ? [direction.warning] : []),
      ...(model.ok ? model.warnings : []),
      ...errors,
    ],
    [direction.warning, errors, model]
  );

  const hostnameOptions = useHostnameCandidates(elements);

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
          trailing={
            <TraceViewControls
              model={model}
              grouping={grouping}
              onGroupingChange={setGrouping}
              order={order}
              onOrderChange={setOrder}
              minBps={minBps}
              onMinBpsChange={onMinBpsChange}
              warnings={warnings}
            />
          }
        />
      )}
      <main className="relative min-h-0 flex-1">
        <TraceView
          elements={elements}
          model={model}
          order={order}
          status={trace.state.status}
          error={trace.state.error}
          hasPayload={trace.state.hasPayload}
          cancelled={trace.state.cancelled}
          demoMode={config.demoMode}
          focusMode={focusMode}
          onFocusModeChange={setFocusMode}
          endpointConfigured={endpointConfigured}
          scopeReady={problems.length === 0}
        />
      </main>
    </>
  );
}
