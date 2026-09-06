import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

export interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

export interface Size {
  w: number;
  h: number;
}

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 4;
const WHEEL_STEP_FACTOR = 1.0018;
const BUTTON_STEP_FACTOR = 1.25;
/**
 * Movement (px) before a pointer-down turns into a pan. Below this it is a click:
 * `setPointerCapture` is what makes panning survive the pointer leaving the SVG mid-drag,
 * but calling it unconditionally on pointer-down retargets the browser's synthesized click
 * to the capturing element — a plain click on a node would never reach that node's own
 * `onClick` and Locate would silently stop working. Capturing only once real movement is
 * seen keeps an un-moved click untouched.
 */
const DRAG_THRESHOLD_PX = 4;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Zooms `v` by `factor`, keeping the content point under `anchor` (same coordinate space
 * as `v.tx`/`v.ty`) fixed on screen. Pure so the anchor invariant is unit-testable without
 * a DOM: `zoomAroundPoint(v, a, f)` then reading back the screen position of the content
 * point that was at `a` must still equal `a`.
 */
export function zoomAroundPoint(
  v: Viewport,
  anchor: { x: number; y: number },
  factor: number,
  minScale: number = MIN_SCALE,
  maxScale: number = MAX_SCALE
): Viewport {
  const nextScale = clamp(v.scale * factor, minScale, maxScale);
  if (nextScale === v.scale) {
    return v;
  }
  const contentX = (anchor.x - v.tx) / v.scale;
  const contentY = (anchor.y - v.ty) / v.scale;
  return { scale: nextScale, tx: anchor.x - contentX * nextScale, ty: anchor.y - contentY * nextScale };
}

/** Full "fit to window": scales content to cover the container, may exceed 1:1. */
export function fitViewport(content: Size, container: Size): Viewport {
  if (content.w <= 0 || content.h <= 0 || container.w <= 0 || container.h <= 0) {
    return { scale: 1, tx: 0, ty: 0 };
  }
  const scale = clamp(Math.min(container.w / content.w, container.h / content.h), MIN_SCALE, MAX_SCALE);
  return { scale, tx: (container.w - content.w * scale) / 2, ty: (container.h - content.h * scale) / 2 };
}

export function oneToOneViewport(content: Size, container: Size): Viewport {
  return { scale: 1, tx: (container.w - content.w) / 2, ty: (container.h - content.h) / 2 };
}

/** Opening viewport: fit, but never enlarge past 1:1 — a small diagram stays at its own size. */
export function openingViewport(content: Size, container: Size): Viewport {
  const fitted = fitViewport(content, container);
  return fitted.scale <= 1 ? fitted : oneToOneViewport(content, container);
}

export interface ZoomPanApi {
  viewport: Viewport;
  dragging: boolean;
  percent: number;
  hostProps: {
    onPointerDown: (e: ReactPointerEvent) => void;
    onPointerMove: (e: ReactPointerEvent) => void;
    onPointerUp: (e: ReactPointerEvent) => void;
    onPointerCancel: (e: ReactPointerEvent) => void;
  };
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  resetOne: () => void;
  setViewport: (v: Viewport) => void;
}

/**
 * Owns pan/zoom state for one Sankey chart. Changing `content` or `container` (a mode
 * switch, a data refresh, a resize) never resets the viewport by itself — only an
 * explicit `setViewport` call (the caller's one-shot opening computation) or a control
 * action does that, per the "resize / mode / refresh preserve the viewport" requirement.
 */
export function useZoomPan(wheelHostRef: RefObject<HTMLElement>, content: Size, container: Size): ZoomPanApi {
  const [viewport, setViewportState] = useState<Viewport>({ scale: 1, tx: 0, ty: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; tx: number; ty: number; captured: boolean } | null>(null);
  const contentRef = useRef(content);
  const containerRef = useRef(container);
  contentRef.current = content;
  containerRef.current = container;

  useEffect(() => {
    const el = wheelHostRef.current;
    if (el === null) {
      return;
    }
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = WHEEL_STEP_FACTOR ** -e.deltaY;
      setViewportState((v) => zoomAroundPoint(v, anchor, factor));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [wheelHostRef]);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    // No capture and no `dragging` yet — see DRAG_THRESHOLD_PX. Only the start point and
    // the viewport it started from are recorded.
    setViewportState((v) => {
      dragStart.current = { x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty, captured: false };
      return v;
    });
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const start = dragStart.current;
    if (start === null) {
      return;
    }
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!start.captured) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) {
        return;
      }
      start.captured = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    setViewportState((v) => ({ ...v, tx: start.tx + dx, ty: start.ty + dy }));
  }, []);

  const endDrag = useCallback((e: ReactPointerEvent) => {
    if (dragStart.current?.captured === true && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragStart.current = null;
    setDragging(false);
  }, []);

  const zoomStep = useCallback((direction: 1 | -1) => {
    const anchor = { x: containerRef.current.w / 2, y: containerRef.current.h / 2 };
    setViewportState((v) => zoomAroundPoint(v, anchor, direction === 1 ? BUTTON_STEP_FACTOR : 1 / BUTTON_STEP_FACTOR));
  }, []);

  return {
    viewport,
    dragging,
    percent: Math.round(viewport.scale * 100),
    hostProps: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag },
    zoomIn: () => zoomStep(1),
    zoomOut: () => zoomStep(-1),
    fit: () => setViewportState(fitViewport(contentRef.current, containerRef.current)),
    resetOne: () => setViewportState(oneToOneViewport(contentRef.current, containerRef.current)),
    setViewport: setViewportState,
  };
}
