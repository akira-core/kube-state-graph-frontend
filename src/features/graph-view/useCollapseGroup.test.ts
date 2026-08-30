import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';

import { useCollapseGroup } from './useCollapseGroup';

// useCollapseGroup takes a React state setter rather than owning state, so we drive it
// from a tiny host holding a real useState<Set<string>> — this keeps the functional
// updater path live (matches how KsgPanel wires it). `initial` seeds the set on mount.
interface HostProps {
  ids: readonly string[];
  initial?: readonly string[];
}

const useHost = ({ ids, initial = [] }: HostProps) => {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set(initial));
  return { collapsedIds, group: useCollapseGroup(ids, collapsedIds, setCollapsedIds) };
};

const setup = (initial: HostProps) => renderHook((props: HostProps) => useHost(props), { initialProps: initial });

describe('useCollapseGroup', () => {
  it('allCollapsed is false on mount when nothing is collapsed and the group is non-empty', () => {
    const { result } = setup({ ids: ['a', 'b'] });
    expect(result.current.group.allCollapsed).toBe(false);
  });

  it('full collapse: toggle from an empty set adds every id and flips allCollapsed to true', () => {
    const { result } = setup({ ids: ['a', 'b', 'c'] });
    act(() => {
      result.current.group.toggle();
    });
    expect([...result.current.collapsedIds].sort()).toEqual(['a', 'b', 'c']);
    expect(result.current.group.allCollapsed).toBe(true);
  });

  it('full expand: toggle from a fully-collapsed set deletes every id and flips allCollapsed to false', () => {
    const { result } = setup({ ids: ['a', 'b'], initial: ['a', 'b'] });
    expect(result.current.group.allCollapsed).toBe(true);
    act(() => {
      result.current.group.toggle();
    });
    expect([...result.current.collapsedIds]).toEqual([]);
    expect(result.current.group.allCollapsed).toBe(false);
  });

  it('partial state: allCollapsed is false even though the set is non-empty', () => {
    const { result } = setup({ ids: ['a', 'b'], initial: ['a'] });
    expect(result.current.group.allCollapsed).toBe(false);
  });

  it('partial state collapses (does NOT expand) on the first press, then expands on the second', () => {
    const { result } = setup({ ids: ['a', 'b'], initial: ['a'] });
    // first press: some-but-not-all present ⇒ collapseThem = true ⇒ adds the rest
    act(() => {
      result.current.group.toggle();
    });
    expect([...result.current.collapsedIds].sort()).toEqual(['a', 'b']);
    expect(result.current.group.allCollapsed).toBe(true);
    // second press: all present ⇒ expands
    act(() => {
      result.current.group.toggle();
    });
    expect([...result.current.collapsedIds]).toEqual([]);
  });

  it('empty ids: allCollapsed is false (the ids.length > 0 guard) even with an empty set', () => {
    const { result } = setup({ ids: [] });
    expect(result.current.group.allCollapsed).toBe(false);
  });

  it('empty ids: toggle is a content no-op and leaves unrelated collapsed ids intact', () => {
    const { result } = setup({ ids: [], initial: ['unrelated'] });
    act(() => {
      result.current.group.toggle();
    });
    expect([...result.current.collapsedIds]).toEqual(['unrelated']);
  });

  it('toggle operates only on its own ids and preserves unrelated collapsed ids', () => {
    const { result } = setup({ ids: ['a', 'b'], initial: ['unrelated'] });
    act(() => {
      result.current.group.toggle();
    });
    expect([...result.current.collapsedIds].sort()).toEqual(['a', 'b', 'unrelated']);
  });

  it('toggle is immutable: it produces a new Set and never mutates the previous one', () => {
    const { result } = setup({ ids: ['a'] });
    const before = result.current.collapsedIds;
    act(() => {
      result.current.group.toggle();
    });
    expect(result.current.collapsedIds).not.toBe(before);
    expect([...before]).toEqual([]); // the captured pre-toggle set is untouched
  });

  it('toggle identity is stable across renders when the same ids reference is passed', () => {
    const ids = ['a', 'b'];
    const { result, rerender } = setup({ ids });
    const first = result.current.group.toggle;
    rerender({ ids });
    expect(result.current.group.toggle).toBe(first);
  });

  it('a new ids array reference yields a new toggle (useCallback dep on ids)', () => {
    const { result, rerender } = setup({ ids: ['a', 'b'] });
    const first = result.current.group.toggle;
    rerender({ ids: ['a', 'b'] }); // same members, new array reference
    expect(result.current.group.toggle).not.toBe(first);
  });
});
