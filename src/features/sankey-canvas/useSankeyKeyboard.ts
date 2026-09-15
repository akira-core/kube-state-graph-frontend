import { useCallback, type KeyboardEvent } from 'react';

import type { ZoomPanApi } from './useZoomPan';

export interface SankeyKeyboardOptions {
  zoom: Pick<ZoomPanApi, 'zoomIn' | 'zoomOut' | 'fit' | 'resetOne'>;
  focusMode: boolean;
  onFocusModeChange: (next: boolean) => void;
}

/**
 * The chart host's keyboard shortcuts — `+`/`=` zoom in, `-` zoom out, `0` fit, `1` actual
 * size, `F` toggles focus mode, `Esc` leaves it. Scoped to the focusable host, and a plain
 * button (the zoom/focus control bar) has no native keydown behavior for any of these keys,
 * so it is deliberately not excluded here — unlike an input, select, or radio, which do,
 * and whose own key handling this must not clobber.
 */
export function useSankeyKeyboard({
  zoom,
  focusMode,
  onFocusModeChange,
}: SankeyKeyboardOptions): (evt: KeyboardEvent<HTMLDivElement>) => void {
  const { zoomIn, zoomOut, fit, resetOne } = zoom;
  return useCallback(
    (evt: KeyboardEvent<HTMLDivElement>): void => {
      const target = evt.target as HTMLElement;
      if (target.closest('input, select, textarea, [role="radio"]') !== null) {
        return;
      }
      switch (evt.key) {
        case '+':
        case '=':
          evt.preventDefault();
          zoomIn();
          break;
        case '-':
          evt.preventDefault();
          zoomOut();
          break;
        case '0':
          evt.preventDefault();
          fit();
          break;
        case '1':
          evt.preventDefault();
          resetOne();
          break;
        case 'f':
        case 'F':
          evt.preventDefault();
          onFocusModeChange(!focusMode);
          break;
        case 'Escape':
          if (focusMode) {
            evt.preventDefault();
            onFocusModeChange(false);
          }
          break;
        default:
          break;
      }
    },
    [fit, focusMode, onFocusModeChange, resetOne, zoomIn, zoomOut]
  );
}
