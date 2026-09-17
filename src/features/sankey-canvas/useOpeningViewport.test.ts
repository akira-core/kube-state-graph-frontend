import { renderHook } from '@testing-library/react';
import { createRef, type RefObject } from 'react';

import { useOpeningViewport, type OpeningViewportOptions } from './useOpeningViewport';
import type { Size, Viewport } from './useZoomPan';

const CONTAINER: Size = { w: 800, h: 600 };

/** A box that reports a real measurement, which is what the hook fits against. */
function boxOf(w = CONTAINER.w, h = CONTAINER.h): RefObject<HTMLDivElement> {
  const el = document.createElement('div');
  el.getBoundingClientRect = (): DOMRect => ({
    width: w,
    height: h,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: w,
    bottom: h,
    toJSON: () => ({}),
  });
  const ref = createRef<HTMLDivElement>() as { current: HTMLDivElement | null };
  ref.current = el;
  return ref;
}

function render(overrides: Partial<OpeningViewportOptions> = {}): {
  setViewport: (v: Viewport) => void;
  rerender: (props: Partial<OpeningViewportOptions>) => void;
  calls: Viewport[];
} {
  const calls: Viewport[] = [];
  const setViewport = (v: Viewport): void => {
    calls.push(v);
  };
  const base: OpeningViewportOptions = {
    boxRef: boxOf(),
    content: { w: 1600, h: 1200 },
    containerSize: CONTAINER,
    hasContent: true,
    setViewport,
    ...overrides,
  };
  const hook = renderHook(
    (props: OpeningViewportOptions) => {
      useOpeningViewport(props);
    },
    { initialProps: base }
  );
  return {
    setViewport,
    calls,
    rerender: (props) => {
      hook.rerender({ ...base, ...props });
    },
  };
}

describe('useOpeningViewport', () => {
  it('fits once and then leaves the viewport alone', () => {
    const { calls, rerender } = render();
    expect(calls).toHaveLength(1);
    // A redraw of the same subject — a refresh, a theme switch, a control change — must not
    // pull the chart back from wherever the reader panned it.
    rerender({ content: { w: 1700, h: 1300 } });
    expect(calls).toHaveLength(1);
  });

  it('waits for real content before opening', () => {
    const { calls, rerender } = render({ hasContent: false });
    expect(calls).toHaveLength(0);
    rerender({ hasContent: true });
    expect(calls).toHaveLength(1);
  });

  it('opens fresh when the drawing is of a different subject', () => {
    const { calls, rerender } = render({ openingKey: 'sw-tor-1' });
    expect(calls).toHaveLength(1);
    rerender({ openingKey: 'sw-tor-1', content: { w: 1700, h: 1300 } });
    expect(calls).toHaveLength(1);
    // A trace of another switch is another diagram; inheriting the previous pan would park
    // it off-screen.
    rerender({ openingKey: 'sw-core-2' });
    expect(calls).toHaveLength(2);
  });

  it('does not re-open for a view that names no subject', () => {
    const { calls, rerender } = render();
    rerender({ content: { w: 900, h: 700 } });
    rerender({ containerSize: { w: 1000, h: 700 } });
    expect(calls).toHaveLength(1);
  });
});
