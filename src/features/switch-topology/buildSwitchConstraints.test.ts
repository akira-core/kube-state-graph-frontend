import { buildSwitchConstraints } from './buildSwitchConstraints';
import type { SwitchConstraints } from './types';

const levels = (entries: Array<[string, number]>): Map<string, number> => new Map(entries);

const find = (result: SwitchConstraints | null, id: string): { x: number; y: number } | undefined =>
  result?.fixedNodeConstraint?.find((entry) => entry.nodeId === id)?.position;

const yOf = (result: SwitchConstraints | null, id: string): number => find(result, id)?.y ?? Number.NaN;

describe('buildSwitchConstraints', () => {
  it('returns null for an empty level map', () => {
    expect(buildSwitchConstraints(levels([]))).toBeNull();
  });

  it('pins a single levelled switch (not null)', () => {
    const result = buildSwitchConstraints(levels([['only', 0]]));
    expect(result?.fixedNodeConstraint).toHaveLength(1);
    expect(find(result, 'only')).toEqual({ x: 0, y: 0 });
  });

  it('places switches sharing a level on one row (shared y, distinct x, centred on 0)', () => {
    const result = buildSwitchConstraints(
      levels([
        ['a', 0],
        ['b', 0],
      ])
    );
    expect(result?.fixedNodeConstraint).toHaveLength(2);
    // sorted ids → 'a' gets the negative offset, 'b' the positive; both share y=0.
    // Assert the structural property (symmetric around 0, shared y) rather than the
    // exact COL_GAP pixel value, so visual tuning of the gap doesn't break this test.
    const a = find(result, 'a');
    const b = find(result, 'b');
    expect(a?.y).toBe(0);
    expect(b?.y).toBe(0);
    expect(a?.x ?? Number.NaN).toBeLessThan(0);
    expect(b?.x ?? Number.NaN).toBeGreaterThan(0);
    expect(a?.x).toBe(-(b?.x ?? Number.NaN)); // centred on 0
  });

  it('stacks level k+1 above level k (smaller y for the higher level)', () => {
    const result = buildSwitchConstraints(
      levels([
        ['a', 0],
        ['b', 1],
        ['c', 2],
      ])
    );
    expect(yOf(result, 'c')).toBeLessThan(yOf(result, 'b'));
    expect(yOf(result, 'b')).toBeLessThan(yOf(result, 'a'));
  });

  it('sorts ids within a level for deterministic x positions', () => {
    const reversed = buildSwitchConstraints(
      levels([
        ['b', 0],
        ['a', 0],
      ])
    );
    const ordered = buildSwitchConstraints(
      levels([
        ['a', 0],
        ['b', 0],
      ])
    );
    expect(reversed?.fixedNodeConstraint).toEqual(ordered?.fixedNodeConstraint);
    // 'a' sorts first → smaller x than 'b'
    expect(find(reversed, 'a')?.x ?? Number.NaN).toBeLessThan(find(reversed, 'b')?.x ?? Number.NaN);
  });

  it('references only the supplied switch ids', () => {
    const ids = new Set(['a', 'b', 'c']);
    const result = buildSwitchConstraints(
      levels([
        ['a', 0],
        ['b', 1],
        ['c', 1],
      ])
    );
    for (const entry of result?.fixedNodeConstraint ?? []) {
      expect(ids.has(entry.nodeId)).toBe(true);
    }
  });
});
