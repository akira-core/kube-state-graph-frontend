import type { JSX } from 'react';

import { STATUS_COLOR } from '../../../../shared/constants/colorByStatus';
import { RailGroup } from '../../../../shared/ui/Section';

export function StatusLegend(): JSX.Element {
  const entries = Object.entries(STATUS_COLOR);
  return (
    <RailGroup title="Status" data-testid="status-legend">
      {/* Three states, three words — a list of rows would spend a third of the rail on
          them, so they sit on one line as a strip. */}
      <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0">
        {entries.map(([status, color]) => (
          <li key={status} className="flex items-center gap-1.5" data-testid={`status-legend-row-${status}`}>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              data-testid={`status-legend-swatch-${status}`}
              style={{ backgroundColor: color, boxShadow: `0 0 0 2.5px color-mix(in srgb, ${color} 22%, transparent)` }}
            />
            <span className="text-[11px] text-secondary">{status}</span>
          </li>
        ))}
      </ul>
    </RailGroup>
  );
}
