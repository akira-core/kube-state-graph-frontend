import { nextNavigableIndex } from './keyboardNav';
import type { SearchResult } from './types';

const r = (id: string, filterHidden?: boolean): SearchResult => ({
  id,
  label: id,
  ...(filterHidden === true ? { filterHidden: true } : {}),
});

describe('nextNavigableIndex', () => {
  it('moves down skipping filter-hidden rows', () => {
    const results = [r('a'), r('b', true), r('c')];
    expect(nextNavigableIndex(results, 0, 1)).toBe(2);
  });

  it('moves up skipping filter-hidden rows', () => {
    const results = [r('a'), r('b', true), r('c')];
    expect(nextNavigableIndex(results, 2, -1)).toBe(0);
  });

  it('starts from the first navigable row when nothing is highlighted', () => {
    const results = [r('a', true), r('b'), r('c')];
    expect(nextNavigableIndex(results, -1, 1)).toBe(1);
  });

  it('returns -1 when every remaining row in that direction is disabled', () => {
    const results = [r('a'), r('b', true), r('c', true)];
    expect(nextNavigableIndex(results, 0, 1)).toBe(-1);
  });

  it('returns -1 for an empty list', () => {
    expect(nextNavigableIndex([], -1, 1)).toBe(-1);
  });
});
