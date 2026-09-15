import { useEffect, useRef, type RefObject } from 'react';

import { openingViewport, type Size, type Viewport } from './useZoomPan';

/**
 * Stands in for the chart box only while it has never been measured. Nothing opens against
 * it — the opening viewport waits for a real measurement — so it is reached solely by the
 * zoom controls in an environment that reports no layout at all, where a zero-sized
 * container would make `fit` a no-op and the controls untestable.
 */
export const UNMEASURED_CONTAINER: Size = { w: 800, h: 480 };

export interface OpeningViewportOptions {
  boxRef: RefObject<HTMLDivElement>;
  /** Intrinsic content size of the current layout. */
  content: Size;
  containerSize: Size | null;
  /** False while the layout has nothing to draw; the opening waits for real content. */
  hasContent: boolean;
  setViewport: (v: Viewport) => void;
}

/**
 * One-shot opening viewport: fit-but-never-enlarge, computed the first time real content
 * is drawn, then never touched again — mode / cluster / refresh / theme / resize and
 * focus mode all preserve whatever the user set after.
 *
 * The box is measured HERE rather than read from state, because the two are not the same
 * moment. The observer attaches while the chart is still loading, when the box is the only
 * thing in the column and stretches to 1502px; the summary tables that shrink it to 982
 * arrive with the chart itself. Fitting against the state written by that earlier
 * measurement parked the diagram low — a 593px gap above it and 80px below — and the lock
 * then refused the corrected size the observer delivered a moment later. Measuring at the
 * instant of the fit means the chart being drawn is what gets measured.
 */
export function useOpeningViewport({
  boxRef,
  content,
  containerSize,
  hasContent,
  setViewport,
}: OpeningViewportOptions): void {
  const openedRef = useRef(false);
  useEffect(() => {
    const el = boxRef.current;
    if (openedRef.current || !hasContent || el === null) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const box = rect.width >= 40 && rect.height >= 40 ? { w: rect.width, h: rect.height } : containerSize;
    if (box === null || box.w < 40 || box.h < 40) {
      return;
    }
    setViewport(openingViewport(content, box));
    openedRef.current = true;
  }, [boxRef, content, containerSize, hasContent, setViewport]);
}
