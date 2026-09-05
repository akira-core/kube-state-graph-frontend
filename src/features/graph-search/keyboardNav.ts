import type { SearchResult } from './types';

/**
 * Next/previous navigable (non-filter-hidden) index from `from`, walking `direction`.
 * Returns -1 when no navigable row exists in that direction (or at all).
 */
export function nextNavigableIndex(results: readonly SearchResult[], from: number, direction: 1 | -1): number {
  if (results.length === 0) {
    return -1;
  }
  // Start just past `from` so a re-press moves; when from is -1 and direction is +1,
  // begin at 0; when from is -1 and direction is -1, begin at the end.
  let i = from;
  if (i < 0) {
    i = direction === 1 ? -1 : results.length;
  }
  for (let step = 0; step < results.length; step += 1) {
    i += direction;
    if (i < 0 || i >= results.length) {
      return -1;
    }
    if (results[i]?.filterHidden !== true) {
      return i;
    }
  }
  return -1;
}
