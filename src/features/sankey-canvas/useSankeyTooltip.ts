import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export interface Tip {
  x: number;
  y: number;
  text: string[];
}

export interface SankeyTooltipApi {
  tip: Tip | null;
  tipPos: { left: number; top: number } | null;
  tipRef: RefObject<HTMLDivElement>;
  show: (x: number, y: number, text: string[]) => void;
  hide: () => void;
}

/**
 * Tooltip state for one chart: where it was requested, and where it can actually be drawn
 * once its own size is known — clamped inside the chart box so a card at the right edge
 * does not push its lines off screen. Hidden while a drag is in progress: a pan eats the
 * pointer events, so the `mouseleave` that would otherwise close it never arrives.
 */
export function useSankeyTooltip(boxRef: RefObject<HTMLDivElement>, dragging: boolean): SankeyTooltipApi {
  const [tip, setTip] = useState<Tip | null>(null);
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dragging) {
      setTip(null);
    }
  }, [dragging]);

  useLayoutEffect(() => {
    if (tip === null) {
      setTipPos(null);
      return;
    }
    const el = tipRef.current;
    const box = boxRef.current;
    if (el === null || box === null) {
      setTipPos({ left: tip.x + 12, top: tip.y + 12 });
      return;
    }
    const rect = box.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(rect.left + 4, Math.min(tip.x + 12, rect.right - w - 4));
    const top = Math.max(rect.top + 4, Math.min(tip.y + 12, rect.bottom - h - 4));
    setTipPos({ left, top });
  }, [boxRef, tip]);

  const show = useCallback((x: number, y: number, text: string[]) => {
    setTip({ x, y, text });
  }, []);
  const hide = useCallback(() => {
    setTip(null);
  }, []);

  return { tip, tipPos, tipRef, show, hide };
}
