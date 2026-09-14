/**
 * What the canvas is actually showing, as one decision.
 *
 * The distinction this exists for: a request that FAILED and a request that SUCCEEDED
 * and returned nothing both leave the canvas blank, and they mean opposite things. One
 * is a broken pipeline, the other is a correct answer about an estate that holds nothing
 * in this window. Collapsing them into a single blank state is the failure a topology
 * front end is most likely to hide, so the two are named separately here and rendered
 * differently.
 */
export type GraphOutcome =
  | { kind: 'awaiting'; message: string }
  | { kind: 'cancelled'; message: string }
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'empty'; message: string }
  | { kind: 'filtered'; message: string }
  | { kind: 'drawn' };

export interface GraphOutcomeInput {
  status: 'idle' | 'loading' | 'ready' | 'error';
  hasPayload: boolean;
  cancelled?: boolean;
  /** The load error, if any. Already carries the URL and status from the loader. */
  firstError: string | undefined;
  elementCount: number;
  visibleNodeCount: number;
  allTogglableKindsHidden: boolean;
}

export const EMPTY_RESPONSE_MESSAGE =
  'The request succeeded and the backend returned no elements. Widen the time range, or switch Projection to Full inventory.';

export const AWAITING_QUERY_MESSAGE =
  'Nothing has been requested yet. Press Query to load the graph for the current filters and time range.';

export const CANCELLED_QUERY_MESSAGE = 'The request was cancelled. Press Query to load the graph.';

export function describeGraphOutcome({
  status,
  hasPayload,
  cancelled = false,
  firstError,
  elementCount,
  visibleNodeCount,
  allTogglableKindsHidden,
}: GraphOutcomeInput): GraphOutcome {
  if (status === 'idle' && !hasPayload) {
    return cancelled
      ? { kind: 'cancelled', message: CANCELLED_QUERY_MESSAGE }
      : { kind: 'awaiting', message: AWAITING_QUERY_MESSAGE };
  }
  if (status === 'loading' && !hasPayload) {
    return { kind: 'loading' };
  }
  // Only a load that produced nothing at all is fatal. A refresh that failed over a good
  // payload keeps drawing the payload and reports the error in the nav bar instead.
  if (firstError !== undefined && !hasPayload && status === 'error') {
    return { kind: 'failed', message: firstError };
  }
  if (elementCount === 0) {
    return { kind: 'empty', message: EMPTY_RESPONSE_MESSAGE };
  }
  if (visibleNodeCount === 0) {
    return {
      kind: 'filtered',
      message: allTogglableKindsHidden ? 'All node types filtered' : 'All elements filtered out',
    };
  }
  return { kind: 'drawn' };
}
