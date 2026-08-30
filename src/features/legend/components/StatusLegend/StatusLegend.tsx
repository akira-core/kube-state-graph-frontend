import type { JSX } from 'react';

import { STATUS_COLOR } from '../../../../shared/constants/colorByStatus';
import { legendListClass, legendRowClass } from '../../legendStyles';

export function StatusLegend(): JSX.Element {
  const entries = Object.entries(STATUS_COLOR);
  return (
    <div data-testid="status-legend">
      <h4>Status</h4>
      <ul className={legendListClass}>
        {entries.map(([status, color]) => (
          <li key={status} className={legendRowClass} data-testid={`status-legend-row-${status}`}>
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-sm border-[1.5px] border-solid"
              data-testid={`status-legend-swatch-${status}`}
              style={{ backgroundColor: color, borderColor: color }}
            />
            <span>{status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
