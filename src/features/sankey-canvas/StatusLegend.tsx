import type { JSX } from 'react';

import { STATUS_COLOR } from '../../shared/constants/colorByStatus';

/**
 * Border colours are the backend's folded `data.status`, the same three bands Graph view
 * borders by. Without this strip a green card and a red one are two unexplained decorations.
 */
export function StatusLegend({ testIdPrefix = 'sankey' }: Readonly<{ testIdPrefix?: string }>): JSX.Element {
  return (
    <span className="flex items-center gap-2" data-testid={`${testIdPrefix}-status-legend`}>
      {Object.entries(STATUS_COLOR).map(([status, color]) => (
        <span key={status} className="flex items-center gap-1 text-[11px] text-secondary">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            data-testid={`${testIdPrefix}-status-swatch-${status}`}
          />
          {status}
        </span>
      ))}
    </span>
  );
}
