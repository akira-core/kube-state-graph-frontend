import type cytoscape from 'cytoscape';
import { useEffect, useMemo, useRef, useState, type JSX, type MouseEvent } from 'react';

import { formatBitsPerSec } from '../../shared/format/measurements';
import { eyebrowClass } from '../../shared/ui/Section';
import { Segmented, type SegmentedOption } from '../../shared/ui/Segmented';
import {
  SankeyControlBar,
  SankeyTooltip,
  UNMEASURED_CONTAINER,
  useContainerSize,
  useOpeningViewport,
  useSankeyKeyboard,
  useSankeyTooltip,
  useZoomPan,
  type HoverLit,
  shellEmptyKind,
  type ShellEmptyKind,
} from '../sankey-canvas';
import { useThemeTokens } from '../theme';

import { TraceChart } from './chart/TraceChart';
import { layoutTrace, type TraceNodeOrder } from './layout/layoutTrace';
import { bandTooltipLines, nodeTooltipLines, residualTooltipLines } from './layout/tooltips';
import { hopBalanceRows, namespaceAggs } from './model/aggregates';
import { deriveTrace, directionFor } from './model/deriveTrace';
import { hoverPath } from './model/hoverPath';
import type { TraceDirection, TraceEdge, TraceLayout, TraceNode } from './model/types';
import { TraceLegend } from './TraceLegend';
import { TraceSummary } from './TraceSummary';
import { cleanMinBps } from './traceUrlScope';

const LAYOUT_OPTIONS: ReadonlyArray<SegmentedOption<TraceLayout>> = [
  { value: 'flat', label: 'Flat' },
  { value: 'node', label: 'Node' },
];

const ORDER_OPTIONS: ReadonlyArray<SegmentedOption<TraceNodeOrder>> = [
  { value: 'flow', label: 'Flow' },
  { value: 'barycenter', label: 'Barycenter' },
];

const MIN_BPS_DEBOUNCE_MS = 200;

export interface TraceViewProps {
  elements: cytoscape.ElementDefinition[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | undefined;
  /** normalize's partial-parse messages for the drawn body. */
  errors?: string[];
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
  /** Page-transient. Omitted = local default `flat`, reset on remount. */
  layout?: TraceLayout;
  onLayoutChange?: (next: TraceLayout) => void;
}

type EmptyKind = ShellEmptyKind | 'model-error' | 'filtered';

function emptyCopy(kind: EmptyKind, demoMode: boolean): { testId: string; text: string } {
  switch (kind) {
    case 'unconfigured':
      return {
        testId: 'trace-empty-unconfigured',
        text: 'Trace endpoint is not configured. Graph and Storage views are unaffected.',
      };
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
  errors = [],
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
  layout: layoutProp,
  onLayoutChange,
}: Readonly<TraceViewProps>): JSX.Element {
  const tokens = useThemeTokens();
  const [localLayout, setLocalLayout] = useState<TraceLayout>(layoutProp ?? 'flat');
  const layout = layoutProp ?? localLayout;
  const setLayout = (next: TraceLayout): void => {
    if (layoutProp === undefined) {
      setLocalLayout(next);
    }
    onLayoutChange?.(next);
  };
  const [order, setOrder] = useState<TraceNodeOrder>('flow');
  // The threshold box holds raw text; the applied value follows after a short pause so
  // typing "500000000" does not redraw nine times. Blur normalises the text to the value.
  const [minText, setMinText] = useState(minBps > 0 ? String(minBps) : '');
  useEffect(() => {
    setMinText(minBps > 0 ? String(minBps) : '');
  }, [minBps]);
  useEffect(() => {
    const next = cleanMinBps(minText);
    if (next === minBps) {
      return;
    }
    const t = window.setTimeout(() => onMinBpsChange(next), MIN_BPS_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [minBps, minText, onMinBpsChange]);

  const [hoverId, setHoverId] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const chartHostRef = useRef<HTMLDivElement>(null);
  // The ref'd box and chart host only render once the loading / empty early-returns below
  // have passed, so both measurement and the wheel listener re-attach on this key.
  const remountKey = `${status}:${String(hasPayload)}`;
  const containerSize = useContainerSize(boxRef, remountKey);

  const direction = useMemo(() => directionFor(elements, trackDir), [elements, trackDir]);
  const model = useMemo(
    () => deriveTrace(elements, { direction: direction.direction, minBps, layout }),
    [direction.direction, elements, layout, minBps]
  );
  const geo = useMemo(() => (model.ok ? layoutTrace(model, { order }) : null), [model, order]);
  const content = useMemo(() => ({ w: geo?.width ?? 0, h: geo?.height ?? 0 }), [geo]);
  const zoom = useZoomPan(chartHostRef, content, containerSize ?? UNMEASURED_CONTAINER, remountKey);
  useOpeningViewport({
    boxRef,
    content,
    containerSize,
    hasContent: model.ok && (model.nodes.length > 0 || model.wrappers.length > 0),
    setViewport: zoom.setViewport,
  });
  const tooltip = useSankeyTooltip(boxRef, zoom.dragging);
  // `tooltip` is a fresh object every render; `hide` is the stable callback inside it.
  const hideTip = tooltip.hide;
  const handleKeyDown = useSankeyKeyboard({ zoom, focusMode, onFocusModeChange });

  // A refresh may remove the hovered card; its mouseleave never fires.
  useEffect(() => {
    if (hoverId !== null && model.ok && !model.nodeMap.has(hoverId) && !model.wrappers.some((w) => w.id === hoverId)) {
      setHoverId(null);
      hideTip();
    }
  }, [hideTip, hoverId, model]);

  const lit: HoverLit | null = useMemo(() => {
    if (hoverId === null || !model.ok) {
      return null;
    }
    const path = hoverPath(model, hoverId);
    return { keys: path.edgeIds, nodeIds: path.nodeIds };
  }, [hoverId, model]);

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

  if (status === 'loading' && !hasPayload) {
    return <div className="flex h-full items-center justify-center text-secondary">Loading…</div>;
  }
  if (status === 'error' && !hasPayload) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-primary" role="alert">
        {error}
      </div>
    );
  }

  const emptyKind: EmptyKind | null = (() => {
    const shell = shellEmptyKind({ demoMode, endpointConfigured, scopeReady, status, hasPayload, cancelled });
    if (shell !== null) {
      return shell;
    }
    if (!model.ok) {
      return 'model-error';
    }
    if (model.nodes.length === 0 && model.wrappers.length === 0) {
      return 'filtered';
    }
    return null;
  })();
  const empty = emptyKind === null ? null : emptyCopy(emptyKind, demoMode);
  const chartReady = emptyKind === null && model.ok && geo !== null;

  const onNodeEnter = (id: string, evt: MouseEvent): void => {
    if (zoom.dragging || !model.ok) {
      return;
    }
    setHoverId(id);
    const target = model.nodeMap.get(id) ?? model.wrappers.find((w) => w.id === id);
    if (target !== undefined) {
      tooltip.show(evt.clientX, evt.clientY, nodeTooltipLines(target, model));
    }
  };
  const onBandEnter = (e: TraceEdge, evt: MouseEvent): void => {
    if (zoom.dragging || !model.ok) {
      return;
    }
    tooltip.show(evt.clientX, evt.clientY, bandTooltipLines(e, model));
  };
  const onResidualEnter = (n: TraceNode, side: 'in' | 'out', evt: MouseEvent): void => {
    if (zoom.dragging) {
      return;
    }
    tooltip.show(evt.clientX, evt.clientY, residualTooltipLines(n, side));
  };
  const cleaned = cleanMinBps(minText);

  return (
    <div className="flex h-full w-full flex-col bg-canvas text-primary" data-testid="trace-view">
      {!focusMode && (
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-3 border-b border-hairline bg-rail px-3 py-1.5">
          <span className={eyebrowClass}>Network trace</span>
          <span className={eyebrowClass}>Layout</span>
          <Segmented
            name="trace-layout"
            aria-label="Layout"
            value={layout}
            options={LAYOUT_OPTIONS}
            onChange={setLayout}
            data-testid="trace-layout"
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
              hidden {model.filtered.edges} ribbon{model.filtered.edges === 1 ? '' : 's'}
              {model.filteredNodes.length > 0
                ? ` / ${String(model.filteredNodes.length)} hop${model.filteredNodes.length === 1 ? '' : 's'}`
                : ''}
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
              hostRef={chartHostRef}
              hostProps={zoom.hostProps}
              dragging={zoom.dragging}
              lit={lit}
              onNodeEnter={onNodeEnter}
              onNodeLeave={() => {
                setHoverId(null);
                tooltip.hide();
              }}
              onNodeClick={onLocateNode}
              onBandEnter={onBandEnter}
              onBandLeave={tooltip.hide}
              onResidualEnter={onResidualEnter}
              onResidualLeave={tooltip.hide}
              onKeyDown={handleKeyDown}
            >
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
