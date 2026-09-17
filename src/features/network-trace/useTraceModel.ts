import type cytoscape from 'cytoscape';
import { useMemo } from 'react';

import { deriveTrace, directionFor, type TraceIndexed } from './model/deriveTrace';
import type { TraceDirection, TraceGrouping, TraceModel } from './model/types';

export interface TraceModelInputs {
  elements: cytoscape.ElementDefinition[];
  /** The requested direction; undefined before any query. */
  trackDir: TraceDirection | undefined;
  minBps: number;
  grouping: TraceGrouping;
}

export interface TraceDirectionResult {
  direction: TraceDirection;
  /** The start reports the other side than the query asked for. */
  warning?: string;
  indexed: TraceIndexed;
}

/**
 * The Network page's projection of its body: the direction to draw it in, then the derived
 * model. Held by the page, not the view, so the scope bar's view controls (the hidden and
 * warnings pills, the legend) and the chart read one model.
 */
export function useTraceModel({ elements, trackDir, minBps, grouping }: Readonly<TraceModelInputs>): {
  direction: TraceDirectionResult;
  model: TraceModel;
} {
  const direction = useMemo(() => directionFor(elements, trackDir), [elements, trackDir]);
  const model = useMemo(
    () => deriveTrace(elements, { direction: direction.direction, minBps, grouping }, direction.indexed),
    [direction.direction, direction.indexed, elements, grouping, minBps]
  );
  return { direction, model };
}
