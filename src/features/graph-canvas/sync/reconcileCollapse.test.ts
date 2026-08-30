import { reconcileCollapse } from './reconcileCollapse';

describe('reconcileCollapse', () => {
  it('returns all desired ids when every parent still exists', () => {
    const result = reconcileCollapse(new Set(['A', 'B', 'C']), new Set(['A', 'B', 'C']));
    expect(result.sort()).toEqual(['A', 'B', 'C']);
  });

  it('drops desired ids whose parent was removed by the update', () => {
    const result = reconcileCollapse(new Set(['A', 'B', 'C']), new Set(['A', 'B']));
    expect(result.sort()).toEqual(['A', 'B']);
  });

  it('returns empty when desired is empty', () => {
    expect(reconcileCollapse(new Set(), new Set(['A', 'B']))).toEqual([]);
  });

  it('returns empty when no desired parent is present', () => {
    expect(reconcileCollapse(new Set(['X']), new Set(['A', 'B']))).toEqual([]);
  });
});
