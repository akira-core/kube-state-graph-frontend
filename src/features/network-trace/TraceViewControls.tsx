import { useEffect, useRef, useState, type JSX } from 'react';

import { countWord } from '../../shared/format/countWord';
import { formatBitsPerSec } from '../../shared/format/measurements';
import { ControlField } from '../../shared/ui/ControlField';
import { Segmented, type SegmentedOption } from '../../shared/ui/Segmented';
import { useThemeTokens } from '../theme';

import type { TraceNodeOrder } from './layout/layoutTrace';
import type { TraceGrouping, TraceModel } from './model/types';
import { TraceLegend } from './TraceLegend';
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

const PILL_CLASS =
  'flex h-8 items-center whitespace-nowrap rounded-md border border-hairline px-2 text-[11px] text-secondary';

export interface TraceViewControlsProps {
  model: TraceModel;
  grouping: TraceGrouping;
  onGroupingChange: (next: TraceGrouping) => void;
  order: TraceNodeOrder;
  onOrderChange: (next: TraceNodeOrder) => void;
  minBps: number;
  onMinBpsChange: (next: number) => void;
  /** Everything the drawn body warns about: the direction, the model and the normalize boundary. */
  warnings: readonly string[];
}

/**
 * The Network Sankey's view controls, after the Query action in the trace scope bar. Every
 * one of them changes the drawing only: none edits the draft, none issues a request, and
 * all stay operable in every empty state. The legend and the pills follow the drawn chart.
 */
export function TraceViewControls({
  model,
  grouping,
  onGroupingChange,
  order,
  onOrderChange,
  minBps,
  onMinBpsChange,
  warnings,
}: Readonly<TraceViewControlsProps>): JSX.Element {
  const tokens = useThemeTokens();
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

  const cleaned = cleanMinBps(minText);
  const warningText = warnings.join('\n');

  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2" data-testid="trace-view-controls">
      <ControlField label="Group">
        <Segmented
          name="trace-grouping"
          aria-label="Group"
          size="md"
          value={grouping}
          options={GROUPING_OPTIONS}
          onChange={onGroupingChange}
          data-testid="trace-grouping"
        />
      </ControlField>
      <ControlField label="Order">
        <Segmented
          name="trace-order"
          aria-label="Order"
          size="md"
          value={order}
          options={ORDER_OPTIONS}
          onChange={onOrderChange}
          data-testid="trace-order"
        />
      </ControlField>
      <ControlField label="Min Δ">
        <div className="flex h-8 items-center gap-1.5">
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
            className="h-8 w-[8rem] rounded-md border border-hairline-strong bg-raised px-2 font-mono text-xs text-primary"
          />
          <span className="whitespace-nowrap text-[11px] text-secondary" data-testid="trace-min-bps-hint">
            {cleaned > 0 ? `= ${formatBitsPerSec(cleaned)}` : 'bps · off'}
          </span>
          {minBps > 0 && (
            <button
              type="button"
              className="h-8 rounded-md border border-hairline-strong bg-raised px-2 text-xs text-primary hover:bg-raised-hover"
              data-testid="trace-min-bps-clear"
              onClick={() => {
                setMinText('');
                onMinBpsChange(0);
              }}
            >
              Clear
            </button>
          )}
        </div>
      </ControlField>
      {minBps > 0 && model.ok && model.filtered.edges > 0 && (
        <span className={PILL_CLASS} data-testid="trace-filtered-pill">
          hidden {countWord(model.filtered.edges, 'ribbon')}
          {model.filteredNodes.length > 0 ? ` / ${countWord(model.filteredNodes.length, 'hop')}` : ''}
          {` (${formatBitsPerSec(model.filtered.bps)})`}
        </span>
      )}
      {warnings.length > 0 && (
        <span
          tabIndex={0}
          role="note"
          className={`${PILL_CLASS} cursor-help text-[var(--ksg-status-warning)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ksg-accent-primary)]`}
          title={warningText}
          aria-label={`${countWord(warnings.length, 'warning')}:\n${warningText}`}
          data-testid="trace-warnings-pill"
        >
          {countWord(warnings.length, 'warning')}
        </span>
      )}
      {model.ok && model.nodes.length > 0 && (
        <div className="flex min-h-8 items-center">
          <TraceLegend model={model} tokens={tokens} />
        </div>
      )}
    </div>
  );
}
