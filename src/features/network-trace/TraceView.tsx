import type cytoscape from 'cytoscape';
import { useCallback, useMemo, useRef, type JSX, type MouseEvent } from 'react';

import {
  loadGateScreen,
  SankeyControlBar,
  SankeySearchOverlay,
  SankeyTooltip,
  useSankeyStage,
  type HoverLit,
  type Rect,
  shellEmptyKind,
  type ShellEmptyKind,
} from '../sankey-canvas';
import { useThemeTokens } from '../theme';

import { TraceChart } from './chart/TraceChart';
import { layoutTrace, type TraceNodeOrder } from './layout/layoutTrace';
import { bandTooltipLines, clusterTooltipLines, nodeTooltipLines, residualTooltipLines } from './layout/tooltips';
import { hoverPath, hoverPathMany } from './model/hoverPath';
import type { TraceEdge, TraceModel, TraceNode } from './model/types';
import { traceCardRects, traceSearchRecords } from './traceSearch';

/** One identity while there is no geometry, so the search's callbacks do not churn on it. */
const EMPTY_RECTS: ReadonlyMap<string, Rect> = new Map();
const NO_LIT: HoverLit = { keys: new Set(), nodeIds: new Set() };

export interface TraceViewProps {
  /** The body as loaded; only asked whether it is empty (an answer, not a malformed body). */
  elements: cytoscape.ElementDefinition[];
  /** The page's derivation of `elements` (see `useTraceModel`). */
  model: TraceModel;
  /** Page-transient column order. */
  order: TraceNodeOrder;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | undefined;
  hasPayload: boolean;
  cancelled?: boolean;
  demoMode: boolean;
  focusMode: boolean;
  onFocusModeChange: (next: boolean) => void;
  /** `endpoints.trace` is configured (or demo mode supplies a fixture). */
  endpointConfigured: boolean;
  /** The draft can be queried (a hostname, every value valid). */
  scopeReady: boolean;
}

/** Why the Network Sankey cannot load: the page's source is missing. */
const TRACE_UNCONFIGURED_MESSAGE = 'Trace endpoint is not configured. The Storage pages are unaffected.';

type EmptyKind = ShellEmptyKind | 'response' | 'model-error' | 'filtered';

function emptyCopy(kind: EmptyKind, demoMode: boolean): { testId: string; text: string } {
  switch (kind) {
    case 'unconfigured':
      return { testId: 'trace-empty-unconfigured', text: TRACE_UNCONFIGURED_MESSAGE };
    case 'scope':
      return {
        testId: 'trace-empty-scope',
        text: 'Name the start switch (and fix any flagged value). No request has been sent yet.',
      };
    case 'awaiting':
      return {
        testId: 'trace-empty-awaiting',
        text: 'Nothing has been requested yet. Press Query to trace the switch for the current time range.',
      };
    case 'cancelled':
      return { testId: 'trace-empty-cancelled', text: 'The request was cancelled. Press Query to trace again.' };
    case 'response':
      return {
        testId: 'trace-empty-response',
        text: `No traffic was recorded for this switch in the current time range. The hostname may not exist, or the window may be outside retention.${demoMode ? ' Currently showing demo fixture data.' : ''}`,
      };
    case 'model-error':
      return { testId: 'trace-empty-model-error', text: 'The response cannot be drawn as a trace.' };
    default:
      return {
        testId: 'trace-empty-filtered',
        text: `Nothing on the chart is above the display threshold.${demoMode ? ' Currently showing demo fixture data.' : ''}`,
      };
  }
}

export function TraceView({
  elements,
  model,
  order,
  status,
  error,
  hasPayload,
  cancelled = false,
  demoMode,
  focusMode,
  onFocusModeChange,
  endpointConfigured,
  scopeReady,
}: Readonly<TraceViewProps>): JSX.Element {
  const tokens = useThemeTokens();
  const geo = useMemo(() => (model.ok ? layoutTrace(model, { order }) : null), [model, order]);
  const content = useMemo(() => ({ w: geo?.width ?? 0, h: geo?.height ?? 0 }), [geo]);
  const clusterIds = useMemo(() => new Set(model.ok ? model.clusters.map((c) => c.id) : []), [model]);
  const hasCard = useCallback(
    (id: string) => model.ok && (model.nodeMap.has(id) || clusterIds.has(id)),
    [clusterIds, model]
  );
  const hoverLit = useCallback(
    (id: string): HoverLit => {
      if (!model.ok) {
        return NO_LIT;
      }
      const path = hoverPath(model, id);
      return { keys: path.edgeIds, nodeIds: path.nodeIds };
    },
    [model]
  );
  const searchRecords = useMemo(() => (model.ok && geo !== null ? traceSearchRecords(model, geo) : []), [geo, model]);
  const cardRects = useMemo(() => (geo !== null ? traceCardRects(geo) : EMPTY_RECTS), [geo]);
  const searchPathLit = useCallback(
    (ids: ReadonlySet<string>): HoverLit => {
      if (!model.ok) {
        return NO_LIT;
      }
      const path = hoverPathMany(model, ids);
      return { keys: path.edgeIds, nodeIds: path.nodeIds };
    },
    [model]
  );
  const { boxRef, zoom, tooltip, handleKeyDown, setHoverId, search, lit } = useSankeyStage({
    status,
    hasPayload,
    content,
    hasContent: model.ok && model.nodes.length > 0,
    focusMode,
    onFocusModeChange,
    hasCard,
    hoverLit,
    records: searchRecords,
    rects: cardRects,
    pathLit: searchPathLit,
  });
  // The hover handlers reach the drawing, which is memoised so a pan drag does not
  // reconcile every card and ribbon; they must therefore keep their identity across pan
  // frames. `dragging` flips on every drag, so they read it through a ref instead of
  // depending on it. `tooltip` itself is a fresh object per render — only its `show` and
  // `hide` are stable, so those are the dependencies.
  const draggingRef = useRef(zoom.dragging);
  draggingRef.current = zoom.dragging;
  const showTip = tooltip.show;
  const hideTip = tooltip.hide;
  const onNodeEnter = useCallback(
    (id: string, evt: MouseEvent): void => {
      if (draggingRef.current || !model.ok) {
        return;
      }
      setHoverId(id);
      const target = model.nodeMap.get(id);
      if (target !== undefined) {
        showTip(evt.clientX, evt.clientY, nodeTooltipLines(target, model, tokens));
        return;
      }
      const cluster = model.clusters.find((c) => c.id === id);
      if (cluster !== undefined) {
        showTip(evt.clientX, evt.clientY, clusterTooltipLines(cluster));
      }
    },
    [model, setHoverId, showTip, tokens]
  );
  const onNodeLeave = useCallback((): void => {
    setHoverId(null);
    hideTip();
  }, [hideTip, setHoverId]);
  const onBandEnter = useCallback(
    (e: TraceEdge, evt: MouseEvent): void => {
      if (draggingRef.current || !model.ok) {
        return;
      }
      showTip(evt.clientX, evt.clientY, bandTooltipLines(e, model));
    },
    [model, showTip]
  );
  const onResidualEnter = useCallback(
    (n: TraceNode, side: 'in' | 'out', evt: MouseEvent): void => {
      if (draggingRef.current) {
        return;
      }
      showTip(evt.clientX, evt.clientY, residualTooltipLines(n, side, tokens));
    },
    [showTip, tokens]
  );

  const gate = loadGateScreen({ status, hasPayload, error });
  if (gate !== null) {
    return gate;
  }

  const emptyKind: EmptyKind | null = (() => {
    const shell = shellEmptyKind({ demoMode, endpointConfigured, scopeReady, status, hasPayload, cancelled });
    if (shell !== null) {
      return shell;
    }
    // A successful body with nothing in it is an answer, not a malformed one: the model
    // would refuse it for having no drawable node, which reads as a broken response.
    if (elements.length === 0) {
      return 'response';
    }
    if (!model.ok) {
      return 'model-error';
    }
    if (model.nodes.length === 0) {
      return 'filtered';
    }
    return null;
  })();
  const empty = emptyKind === null ? null : emptyCopy(emptyKind, demoMode);
  const chartReady = emptyKind === null && model.ok && geo !== null;

  return (
    <div className="flex h-full w-full flex-col bg-canvas text-primary" data-testid="trace-view">
      <div className="relative flex min-h-[220px] flex-1 flex-col" ref={boxRef}>
        {empty !== null && (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-secondary"
            data-testid={empty.testId}
          >
            <span>{empty.text}</span>
            {emptyKind === 'model-error' && !model.ok && (
              <ul className="max-w-2xl space-y-1 text-left text-[12px] text-primary" data-testid="trace-model-errors">
                {model.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {chartReady && (
          <div className="relative min-h-0 flex-1">
            <TraceChart
              model={model}
              geo={geo}
              tokens={tokens}
              viewport={zoom.viewport}
              hostProps={zoom.hostProps}
              dragging={zoom.dragging}
              lit={lit}
              onNodeEnter={onNodeEnter}
              onNodeLeave={onNodeLeave}
              onBandEnter={onBandEnter}
              onBandLeave={hideTip}
              onResidualEnter={onResidualEnter}
              onResidualLeave={hideTip}
              onKeyDown={handleKeyDown}
            >
              <SankeySearchOverlay search={search} />
              <SankeyControlBar
                percent={zoom.percent}
                focusMode={focusMode}
                onZoomIn={zoom.zoomIn}
                onZoomOut={zoom.zoomOut}
                onFit={zoom.fit}
                onResetOne={zoom.resetOne}
                onToggleFocus={() => onFocusModeChange(!focusMode)}
              />
            </TraceChart>
          </div>
        )}
      </div>

      <SankeyTooltip tooltip={tooltip} />
    </div>
  );
}
