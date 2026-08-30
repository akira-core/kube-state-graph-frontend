import React, { useState } from 'react';

import { CaretDownIcon, CaretRightIcon, MinusCircleIcon, PlusCircleIcon } from '../../../../shared/ui/icons';
import { legendListClass, legendRowClass } from '../../legendStyles';

export interface SwatchLegendEntry {
  name: string;
  color: string;
}

export interface SwatchLegendProps {
  // Section heading (e.g. 'Clusters' / 'Nodes').
  title: string;
  // Wrapper test id (e.g. 'cluster-legend' / 'node-container-legend').
  testId: string;
  // Row test ids are `${rowTestIdPrefix}${name}`.
  rowTestIdPrefix: string;
  entries: readonly SwatchLegendEntry[];
  onToggleCollapseAll?: () => void;
  allCollapsed?: boolean;
  // Collapse toggle test id (e.g. 'cluster-collapse-toggle' / 'node-collapse-toggle').
  collapseToggleTestId?: string;
  // Plural noun for the collapse aria-label / tooltip (e.g. 'clusters' / 'nodes').
  collapseNoun?: string;
}

// A titled list of colour swatches + names, FOLDED BY DEFAULT, with an optional
// collapse-all toggle. Shared by ClusterLegend / NamespaceLegend / ApplicationLegend /
// NodeContainerLegend so the swatch row + accordion header live in one place. The
// header is a WAI-ARIA accordion: an <h4> wrapping a button that toggles the list
// and always shows the entry count `Title (N)`. Colours are translucent fill +
// solid border, matching each on-canvas translucent backplate. Renders nothing
// when there are no entries.
//
// The fold control (this component's local state) is DISTINCT from the collapse-all
// button, which collapses the on-canvas compound nodes via onToggleCollapseAll;
// the two are sibling controls and never affect each other.
export function SwatchLegend({
  title,
  testId,
  rowTestIdPrefix,
  entries,
  onToggleCollapseAll,
  allCollapsed = false,
  collapseToggleTestId,
  collapseNoun = 'items',
}: Readonly<SwatchLegendProps>): React.JSX.Element | null {
  // Folded by default so the legend rail stays compact on large clusters. Ephemeral:
  // a user expand persists while mounted but resets to folded on reload/remount.
  const [folded, setFolded] = useState(true);
  if (entries.length === 0) {
    return null;
  }
  const collapseLabel = allCollapsed ? `Expand all ${collapseNoun}` : `Collapse all ${collapseNoun}`;
  const Caret = folded ? CaretRightIcon : CaretDownIcon;
  return (
    <div data-testid={testId}>
      <div className="flex items-center justify-between">
        <h4 className="m-0">
          <button
            type="button"
            className="m-0 inline-flex cursor-pointer items-center gap-1 whitespace-nowrap border-0 bg-transparent p-0 font-inherit text-inherit"
            aria-expanded={!folded}
            data-testid={`${testId}-fold-toggle`}
            onClick={() => setFolded((f) => !f)}
          >
            <Caret size={16} />
            {`${title}(${entries.length})`}
          </button>
        </h4>
        {onToggleCollapseAll !== undefined && (
          <button
            type="button"
            data-testid={collapseToggleTestId}
            aria-label={collapseLabel}
            title={collapseLabel}
            className="inline-flex items-center justify-center rounded p-1 text-primary hover:bg-[var(--ksg-border-weak)]"
            onClick={onToggleCollapseAll}
          >
            {allCollapsed ? <PlusCircleIcon size={18} /> : <MinusCircleIcon size={18} />}
          </button>
        )}
      </div>
      {!folded && (
        <ul className={legendListClass}>
          {entries.map(({ name, color }) => (
            <li key={name} className={legendRowClass} data-testid={`${rowTestIdPrefix}${name}`}>
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-[3px] border-[1.5px] border-solid"
                style={{ backgroundColor: `${color}22`, borderColor: color }}
              />
              <span style={{ color }}>{name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
