import { describe, expect, it } from 'vitest';

import { EMPTY_RESPONSE_MESSAGE, describeGraphOutcome, type GraphOutcomeInput } from './describeGraphOutcome';

const DRAWN: GraphOutcomeInput = {
  status: 'ready',
  hasPayload: true,
  firstError: undefined,
  elementCount: 12,
  visibleNodeCount: 8,
  allTogglableKindsHidden: false,
};

describe('describeGraphOutcome', () => {
  it('draws when there is something to draw', () => {
    expect(describeGraphOutcome(DRAWN)).toEqual({ kind: 'drawn' });
  });

  it('shows the loader only before the first payload', () => {
    expect(describeGraphOutcome({ ...DRAWN, status: 'loading', hasPayload: false })).toEqual({ kind: 'loading' });
    expect(describeGraphOutcome({ ...DRAWN, status: 'loading', hasPayload: true })).toEqual({ kind: 'drawn' });
  });

  it('names a failed request, carrying the loader message', () => {
    const outcome = describeGraphOutcome({
      ...DRAWN,
      status: 'error',
      hasPayload: false,
      elementCount: 0,
      visibleNodeCount: 0,
      firstError: 'GET /api/v1/graph failed: 503',
    });
    expect(outcome.kind).toBe('failed');
    expect(outcome.kind === 'failed' && outcome.message).toContain('503');
  });

  it('a successful empty response is NOT the same state as a failure', () => {
    const failed = describeGraphOutcome({
      ...DRAWN,
      status: 'error',
      hasPayload: false,
      elementCount: 0,
      visibleNodeCount: 0,
      firstError: 'GET /api/v1/graph failed: network error',
    });
    const empty = describeGraphOutcome({
      ...DRAWN,
      status: 'ready',
      hasPayload: true,
      elementCount: 0,
      visibleNodeCount: 0,
    });
    expect(failed.kind).toBe('failed');
    expect(empty.kind).toBe('empty');
    expect(empty.kind === 'empty' && empty.message).toBe(EMPTY_RESPONSE_MESSAGE);
    expect(empty.kind === 'empty' && empty.message).toContain('succeeded');
  });

  it('keeps drawing a good payload when a REFRESH fails', () => {
    expect(
      describeGraphOutcome({ ...DRAWN, status: 'ready', hasPayload: true, firstError: 'GET /api/v1/graph failed: 502' })
    ).toEqual({ kind: 'drawn' });
  });

  it('separates "nothing came back" from "everything is hidden"', () => {
    const filtered = describeGraphOutcome({ ...DRAWN, visibleNodeCount: 0 });
    expect(filtered).toEqual({ kind: 'filtered', message: 'All elements filtered out' });
    expect(describeGraphOutcome({ ...DRAWN, visibleNodeCount: 0, allTogglableKindsHidden: true })).toEqual({
      kind: 'filtered',
      message: 'All node types filtered',
    });
  });
});
