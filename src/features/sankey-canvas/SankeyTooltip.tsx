import type { JSX } from 'react';

import type { SankeyTooltipApi } from './useSankeyTooltip';

/** The floating tooltip surface; renders nothing until `useSankeyTooltip` has a position. */
export function SankeyTooltip({ tooltip }: Readonly<{ tooltip: SankeyTooltipApi }>): JSX.Element | null {
  const { tip, tipPos, tipRef } = tooltip;
  if (tip === null || tipPos === null) {
    return null;
  }
  return (
    <div
      ref={tipRef}
      className="pointer-events-none fixed z-[1100] max-w-xs rounded-md border border-hairline bg-elevated px-2.5 py-1.5 font-mono text-[11px] leading-relaxed shadow-panel"
      style={{ left: tipPos.left, top: tipPos.top }}
      role="tooltip"
    >
      {tip.text.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}
