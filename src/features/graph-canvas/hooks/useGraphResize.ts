import type cytoscape from 'cytoscape';
import { useEffect, useRef } from 'react';

const DEBOUNCE_MS = 100;
const FIT_PADDING = 24;
// A window resize fires before the ResizeObserver callback it causes, and the callback is
// debounced, so the mark has to outlive the debounce. Three times the debounce covers a
// continuous drag-resize (each move refreshes the mark) without keeping the mark alive long
// enough for an unrelated layout change to inherit it.
const WINDOW_RESIZE_GRACE_MS = DEBOUNCE_MS * 3;

export interface UseGraphResizeProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
}

/**
 * Keeps the canvas sized to its container. `resize()` runs on EVERY container size change;
 * `fit()` only when that change came from the browser window resizing.
 *
 * The two are deliberately separate. `fit()` overwrites the user's pan and zoom, so firing it
 * for an app-internal layout change — collapsing the legend, returning to this view from
 * another — would throw away the framing the user built on purpose; collapsing the sidebar
 * asks for more room, not for a new shot. A window resize is the environment changing out
 * from under the graph, where re-framing is what one expects.
 *
 * The first observation is the exception: it is the initial sizing, and the container may
 * have measured zero when the layout ran its own fit.
 */
export function useGraphResize({ cyRef, containerRef }: UseGraphResizeProps): void {
  const lastWindowResizeAtRef = useRef(0);

  useEffect(() => {
    const onWindowResize = (): void => {
      lastWindowResizeAtRef.current = Date.now();
    };
    window.addEventListener('resize', onWindowResize);
    return (): void => {
      window.removeEventListener('resize', onWindowResize);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let isFirstObservation = true;
    // Coalesced callbacks share one timer, so the intent to fit has to accumulate rather
    // than ride on the last closure — three rapid observations starting from mount are
    // still the initial sizing.
    let pendingFit = false;
    const observer = new ResizeObserver(() => {
      if (isFirstObservation) {
        isFirstObservation = false;
        pendingFit = true;
      }
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        const cy = cyRef.current;
        if (cy === null) {
          return;
        }
        const shouldFit = pendingFit || Date.now() - lastWindowResizeAtRef.current <= WINDOW_RESIZE_GRACE_MS;
        pendingFit = false;
        cy.resize();
        if (shouldFit) {
          cy.fit(undefined, FIT_PADDING);
        }
      }, DEBOUNCE_MS);
    });
    observer.observe(container);
    return (): void => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      observer.disconnect();
    };
  }, [cyRef, containerRef]);
}
