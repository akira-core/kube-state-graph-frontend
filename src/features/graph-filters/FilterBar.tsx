import type { JSX } from 'react';

import type { GraphFilters } from '../../shared/types/graphFilters';

import type { FilterOptions } from './useFilterOptions';
import type { ListDimension } from './useGraphFilters';

export interface FilterBarProps {
  filters: GraphFilters;
  options: FilterOptions;
  onValues: (dimension: ListDimension, values: string[]) => void;
  onPrune: (prune: boolean) => void;
  onClear: () => void;
}

interface ListControlProps {
  label: string;
  dimension: ListDimension;
  selected: string[];
  available: string[];
  onValues: (dimension: ListDimension, values: string[]) => void;
}

function selectedValues(select: HTMLSelectElement): string[] {
  return Array.from(select.selectedOptions, (option) => option.value);
}

function ListControl({ label, dimension, selected, available, onValues }: Readonly<ListControlProps>): JSX.Element {
  // The selection is unioned into the option list rather than assumed present. A value
  // can be selected and then vanish from the inventory (a namespace drained, a cluster
  // gone); dropping it from the list would silently widen the filter while the control
  // still claims it is applied.
  const shown = [...new Set([...available, ...selected])];
  return (
    <label className="flex flex-col text-xs text-secondary">
      <span>
        {label}
        {selected.length > 0 ? ` (${selected.length})` : ''}
      </span>
      <select
        multiple
        aria-label={label}
        data-testid={`filter-${dimension}`}
        className="mt-0.5 h-16 min-w-28 rounded border border-medium bg-canvas px-1 py-0.5 text-primary"
        value={selected}
        onChange={(e) => onValues(dimension, selectedValues(e.currentTarget))}
      >
        {shown.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The dimensions the backend narrows on, as controls.
 *
 * Every control here sends a parameter the pinned backend honours, and every option it
 * offers came from the backend or from the store the backend filters against — a control
 * that populated from somewhere else would accept a selection, redraw identically, and
 * report nothing.
 */
export function FilterBar({ filters, options, onValues, onPrune, onClear }: Readonly<FilterBarProps>): JSX.Element {
  const active =
    filters.cluster.length +
    filters.az.length +
    filters.env.length +
    filters.namespace.length +
    filters.edgeType.length;
  return (
    <div
      aria-label="Graph filters"
      data-testid="filter-bar"
      className="flex shrink-0 flex-wrap items-end gap-3 border-b border-weak bg-surface px-3 py-2"
    >
      <ListControl
        label="Cluster"
        dimension="cluster"
        selected={filters.cluster}
        available={options.cluster}
        onValues={onValues}
      />
      <ListControl label="AZ" dimension="az" selected={filters.az} available={options.az} onValues={onValues} />
      <ListControl label="Env" dimension="env" selected={filters.env} available={options.env} onValues={onValues} />
      <ListControl
        label="Namespace"
        dimension="namespace"
        selected={filters.namespace}
        available={options.namespace}
        onValues={onValues}
      />
      <ListControl
        label="Edge type"
        dimension="edgeType"
        selected={filters.edgeType}
        available={options.edgeType}
        onValues={onValues}
      />
      <label className="flex flex-col text-xs text-secondary">
        <span>Projection</span>
        <select
          aria-label="Projection"
          data-testid="filter-prune"
          className="mt-0.5 rounded border border-medium bg-canvas px-1 py-1 text-primary"
          value={filters.prune ? 'traffic' : 'inventory'}
          onChange={(e) => onPrune(e.currentTarget.value === 'traffic')}
        >
          {/* The backend's own default is the pruned traffic graph; `Full inventory` is
              ?prune=false, which is also what this demo's harness counts. */}
          <option value="traffic">Traffic graph</option>
          <option value="inventory">Full inventory</option>
        </select>
      </label>
      <button
        type="button"
        className="rounded border border-medium px-2 py-1 text-xs text-primary"
        aria-label="Clear filters"
        disabled={active === 0 && filters.prune}
        onClick={onClear}
      >
        Clear
      </button>
      {options.problems.length > 0 && (
        <span className="text-xs text-secondary" title={options.problems.join('\n')} data-testid="filter-problems">
          {options.problems.length} filter source(s) unavailable
        </span>
      )}
    </div>
  );
}
