import type cytoscape from 'cytoscape';
import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent } from 'react';

import { countWord } from '../../shared/format/countWord';
import { formatBitsPerSec } from '../../shared/format/measurements';
import { eyebrowClass } from '../../shared/ui/Section';
import { Segmented, type SegmentedOption } from '../../shared/ui/Segmented';
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
import { hopBalanceRows, namespaceAggs } from './model/aggregates';
import { deriveTrace, directionFor } from './model/deriveTrace';
import { hoverPath, hoverPathMany } from './model/hoverPath';
import type { TraceDirection, TraceEdge, TraceGrouping, TraceNode } from './model/types';
import { TraceLegend } from './TraceLegend';
import { traceCardRects, traceSearchRecords } from './traceSearch';
import { TraceSummary } from './TraceSummary';
import { cleanMinBps } from './traceUrlScope';

const GROUPING_OPTIONS: ReadonlyArray<SegmentedOption<TraceGrouping>> = [
  { value: 'none', label: 'None' },
  { value: 'cluster', label: 'Cluster' },
];

const ORDER_OPTIONS: ReadonlyArray<SegmentedOption<TraceNodeOrder>> = [
  { value: 'flow', label: 'Flow' },
  { value: 'barycenter', label: 'Barycenter' },
];

const MIN_BPS_DEBOUNCE_MS = 200;
/** One identity while there is no geometry, so the search's callbacks do not churn on it. */
const EMPTY_RECTS: ReadonlyMap<string, Rect> = new Map();
const NO_LIT: HoverLit = { keys: new Set(), nodeIds: new Set() };
/** One identity when the parent passes no errors, so the warnings memo does not churn on it. */
const NO_ERRORS: readonly string[] = [];

export interface TraceViewProps {
  elements: cytoscape.ElementDefinition[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | undefined;
  /** normalize's partial-parse messages for the drawn body. */
  errors?: readonly string[];
  hasPayload: boolean;
  cancelled?: boolean;
  demoMode: boolean;
  focusMode: boolean;
  onFocusModeChange: (next: boolean) => void;
  /** `endpoints.trace` is configured (or demo mode supplies a fixture). */
  endpointConfigured: boolean;
  /** The draft can be queried (a hostname, every value valid). */
  scopeReady: boolean;
  /** The requested direction; undefined before any query. */
  trackDir: TraceDirection | undefined;
  minBps: number;
  onMinBpsChange: (next: number) => void;
  onLocateNode: (id: string) => void;
  /** Page-transient. Omitted = local default `none`, reset on remount. */
  grouping?: TraceGrouping;
  onGroupingChange?: (next: TraceGrouping) => void;
}

/**
 * Why neither Network view can load: the one page's source is missing. Shared with the
 * Graph view, which the page hands it to, so both views explain the same state in the same
 * words — "Graph" alone would be ambiguous in a category that has its own Graph view.
 */
export const TRACE_UNCONFIGURED_MESSAGE = 'Trace endpoint is not configured. The Storage views are unaffected.';

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
  status,
  error,
  errors = NO_ERRORS,
  hasPayload,
  cancelled = false,
  demoMode,
  focusMode,
  onFocusModeChange,
  endpointConfigured,
  scopeReady,
  trackDir,
  minBps,
  onMinBpsChange,
  onLocateNode,
  grouping: groupingProp,
  onGroupingChange,
}: Readonly<TraceViewProps>): JSX.Element {
  const tokens = useThemeTokens();
  const [localGrouping, setLocalGrouping] = useState<TraceGrouping>(groupingProp ?? 'none');
  const grouping = groupingProp ?? localGrouping;
  const setGrouping = (next: TraceGrouping): void => {
    if (groupingProp === undefined) {
      setLocalGrouping(next);
    }
    onGroupingChange?.(next);
  };
  const [order, setOrder] = useState<TraceNodeOrder>('flow');
  // The threshold box holds raw text; the applied value follows after a short pause so
  // typing "500000000" does not redraw nine times. Blur normalises the text to the value.
  const [minText, setMinText] = useState(minBps > 0 ? String(minBps) : '');
  useEffect(() => {
    setMinText(minBps > 0 ? String(minBps) : '');
  }, [minBps]);
  // The callback lives in a ref so the timer depends only on the text and the applied
  // value: a parent that hands down a new `onMinBpsChange` identity on each render (any
  // render faster than the debounce — a pan drag, say) must not keep restarting it.
  const onMinBpsChangeRef = useRef(onMinBpsChange);
  onMinBpsChangeRef.current = onMinBpsChange;
  useEffect(() => {
    const next = cleanMinBps(minText);
    if (next === minBps) {
      return;
    }
    const t = window.setTimeout(() => onMinBpsChangeRef.current(next), MIN_BPS_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [minBps, minText]);

  const direction = useMemo(() => directionFor(elements, trackDir), [elements, trackDir]);
  const model = useMemo(
    () => deriveTrace(elements, { direction: direction.direction, minBps, grouping }, direction.indexed),
    [direction.direction, direction.indexed, elements, grouping, minBps]
  );
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
  const summary = useMemo(
    () => (model.ok ? { hops: hopBalanceRows(model), namespaces: namespaceAggs(model) } : { hops: [], namespaces: [] }),
    [model]
  );
  const warnings = useMemo(
    () => [
      ...(direction.warning !== undefined ? [direction.warning] : []),
      ...(model.ok ? model.warnings : []),
      ...errors,
    ],
    [direction.warning, errors, model]
  );

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
  const cleaned = cleanMinBps(minText);

  return (
    <div className="flex h-full w-full flex-col bg-canvas text-primary" data-testid="trace-view">
      {!focusMode && (
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-3 border-b border-hairline bg-rail px-3 py-1.5">
          <span className={eyebrowClass}>Network trace</span>
          <span className={eyebrowClass}>Group</span>
          <Segmented
            name="trace-grouping"
            aria-label="Group"
            value={grouping}
            options={GROUPING_OPTIONS}
            onChange={setGrouping}
            data-testid="trace-grouping"
          />
          <span className={eyebrowClass}>Order</span>
          <Segmented
            name="trace-order"
            aria-label="Order"
            value={order}
            options={ORDER_OPTIONS}
            onChange={setOrder}
            data-testid="trace-order"
          />
          <label className="flex items-center gap-1.5">
            <span className={eyebrowClass}>Min Δ</span>
            <input
              type="number"
              min={0}
              step={1_000_000}
              aria-label="Minimum delta"
              data-testid="trace-min-bps"
              placeholder="0"
              value={minText}
              onChange={(e) => setMinText(e.currentTarget.value)}
              onBlur={() => {
                const v = cleanMinBps(minText);
                setMinText(v > 0 ? String(v) : '');
                if (v !== minBps) {
                  onMinBpsChange(v);
                }
              }}
              className="h-7 w-[8rem] rounded-md border border-hairline-strong bg-raised px-2 font-mono text-xs text-primary"
            />
            <span className="text-[11px] text-secondary" data-testid="trace-min-bps-hint">
              {cleaned > 0 ? `= ${formatBitsPerSec(cleaned)}` : 'bps · off'}
            </span>
          </label>
          {minBps > 0 && (
            <button
              type="button"
              className="h-7 rounded-md border border-hairline-strong bg-raised px-2 text-xs text-primary hover:bg-raised-hover"
              data-testid="trace-min-bps-clear"
              onClick={() => {
                setMinText('');
                onMinBpsChange(0);
              }}
            >
              Clear
            </button>
          )}
          {minBps > 0 && model.ok && model.filtered.edges > 0 && (
            <span className="text-[11px] text-secondary" data-testid="trace-filtered-pill">
              hidden {countWord(model.filtered.edges, 'ribbon')}
              {model.filteredNodes.length > 0 ? ` / ${countWord(model.filteredNodes.length, 'hop')}` : ''}
              {` (${formatBitsPerSec(model.filtered.bps)})`}
            </span>
          )}
          {model.ok && (
            <div className="ml-auto">
              <TraceLegend model={model} tokens={tokens} />
            </div>
          )}
        </div>
      )}

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
              onNodeClick={onLocateNode}
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

      {!focusMode && chartReady && (
        <TraceSummary hops={summary.hops} namespaces={summary.namespaces} warnings={warnings} />
      )}

      <SankeyTooltip tooltip={tooltip} />
    </div>
  );
}
