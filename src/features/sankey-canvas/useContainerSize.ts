import { useEffect, useState, type RefObject } from 'react';

import type { Size } from './useZoomPan';

/**
 * The chart box's measured size, or `null` until it has actually been measured — and
 * deliberately not a plausible-looking placeholder. The opening viewport fits against this
 * and then locks itself, so a placeholder is not a harmless default — it is the size the
 * diagram gets fitted to. Seeded at 800x480 it opened every estate at that ratio and never
 * revisited it: 2096-wide content drew at 38% in a 1600px-wide window instead of 76%,
 * off-centre, looking exactly like a chart too big for its area. Environments with no
 * layout (jsdom) measure nothing and stay `null`.
 *
 * `remountKey` re-attaches the observer: the ref'd box only renders once a view's loading /
 * fatal-error early returns have passed, so a first-load effect with a null ref must re-run
 * once the box actually mounts, not just once at first render. Pass whatever decides
 * whether the box is in the tree.
 */
export function useContainerSize(boxRef: RefObject<HTMLDivElement>, remountKey: string): Size | null {
  const [containerSize, setContainerSize] = useState<Size | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (el === null) {
      return;
    }
    // Measured up front, not only from the observer's callback. The opening viewport is a
    // separate effect that runs in the same commit as this one, so it would otherwise fit
    // and lock against whatever the state held before the observer's first delivery.
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setContainerSize({ w: rect.width, h: rect.height });
    }
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) {
        return;
      }
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setContainerSize({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [boxRef, remountKey]);

  return containerSize;
}
