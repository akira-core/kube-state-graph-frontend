import { act, renderHook } from '@testing-library/react';

import type { PodParentMode } from '../../../shared/constants/types';

import { useLayoutRunToken } from './useLayoutRunToken';

interface Props {
  collapsedIds?: Set<string>;
  podParentMode?: PodParentMode;
}

const setup = (initial: Props) => renderHook((props: Props) => useLayoutRunToken(props), { initialProps: initial });

describe('useLayoutRunToken', () => {
  it('starts both tokens at 0 on mount', () => {
    const { result } = setup({});
    expect(result.current.collapseApplyToken).toBe(0);
    expect(result.current.layoutToken).toBe(0);
  });

  it('a fold/unfold bumps collapseApplyToken ONLY — NOT layoutToken (no relayout on toggle)', () => {
    const { result, rerender } = setup({ collapsedIds: new Set() });
    const apply = result.current.collapseApplyToken;
    const layout = result.current.layoutToken;
    rerender({ collapsedIds: new Set(['cl']) });
    expect(result.current.collapseApplyToken).toBe(apply + 1); // collapse applied
    expect(result.current.layoutToken).toBe(layout); // but graph NOT relaid out
  });

  it('does not bump when collapsed-id content is unchanged (new Set, same members)', () => {
    const { result, rerender } = setup({ collapsedIds: new Set(['a', 'b']) });
    const apply = result.current.collapseApplyToken;
    const layout = result.current.layoutToken;
    rerender({ collapsedIds: new Set(['b', 'a']) });
    expect(result.current.collapseApplyToken).toBe(apply);
    expect(result.current.layoutToken).toBe(layout);
  });

  it('a pod-parent-mode flip bumps layoutToken (a real structural rebuild relayouts)', () => {
    const { result, rerender } = setup({ podParentMode: 'node' });
    const apply = result.current.collapseApplyToken;
    const layout = result.current.layoutToken;
    rerender({ podParentMode: 'controller' });
    expect(result.current.layoutToken).toBe(layout + 1);
    expect(result.current.collapseApplyToken).toBe(apply); // mode flip alone is not a collapse change
  });

  it('requestRelayout bumps layoutToken ONLY, leaving collapseApplyToken untouched', () => {
    const { result } = setup({ collapsedIds: new Set(['a']) });
    const apply = result.current.collapseApplyToken;
    const layout = result.current.layoutToken;
    act(() => {
      result.current.requestRelayout();
    });
    expect(result.current.layoutToken).toBe(layout + 1);
    expect(result.current.collapseApplyToken).toBe(apply);
  });

  it('does not bump when nothing changes', () => {
    const { result, rerender } = setup({ collapsedIds: new Set(['a']), podParentMode: 'node' });
    const apply = result.current.collapseApplyToken;
    const layout = result.current.layoutToken;
    rerender({ collapsedIds: new Set(['a']), podParentMode: 'node' });
    expect(result.current.collapseApplyToken).toBe(apply);
    expect(result.current.layoutToken).toBe(layout);
  });

  it('requestRelayout has a stable identity across renders', () => {
    const { result, rerender } = setup({ collapsedIds: new Set(['a']) });
    const first = result.current.requestRelayout;
    rerender({ collapsedIds: new Set(['a', 'b']) });
    expect(result.current.requestRelayout).toBe(first);
  });
});
