import type { JSX } from 'react';

import { Button } from '../../shared/ui/Button';
import { MinusCircleIcon, PlusCircleIcon } from '../../shared/ui/icons';

export interface SankeyControlBarProps {
  percent: number;
  focusMode: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onResetOne: () => void;
  onToggleFocus: () => void;
}

// Bottom-right pill, present only while a chart is actually drawn (see storage-flow-sankey
// "縮放控制列與圖區鍵盤操作"): loading / error / empty states hide it, mode and cluster
// selectors stay reachable regardless.
export function SankeyControlBar({
  percent,
  focusMode,
  onZoomIn,
  onZoomOut,
  onFit,
  onResetOne,
  onToggleFocus,
}: Readonly<SankeyControlBarProps>): JSX.Element {
  return (
    <div
      className="absolute bottom-2.5 right-2.5 z-[40] flex items-center gap-1 rounded-full border border-hairline bg-overlay px-1.5 py-1 shadow-panel backdrop-blur-sm"
      data-testid="sankey-zoom-controls"
    >
      <Button size="icon-sm" variant="ghost" aria-label="Zoom out" title="Zoom out (−)" onClick={onZoomOut}>
        <MinusCircleIcon size={15} />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Reset zoom to 1:1"
        title="Reset to 1:1"
        className="min-w-[3.2rem] font-mono tabular-nums"
        onClick={onResetOne}
      >
        {percent}%
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label="Zoom in" title="Zoom in (+)" onClick={onZoomIn}>
        <PlusCircleIcon size={15} />
      </Button>
      <Button size="sm" variant="ghost" title="Fit to window (0)" onClick={onFit}>
        Fit
      </Button>
      <Button size="sm" variant="ghost" title="Actual size (1)" onClick={onResetOne}>
        1:1
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-pressed={focusMode}
        title="Focus mode (F, Esc to exit)"
        onClick={onToggleFocus}
      >
        Focus
      </Button>
    </div>
  );
}
