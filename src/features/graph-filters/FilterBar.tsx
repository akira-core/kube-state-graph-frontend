import { clsx } from 'clsx';
import type { JSX } from 'react';

import type { GraphFilters } from '../../shared/types/graphFilters';
import { Badge } from '../../shared/ui/Badge';
import { Button } from '../../shared/ui/Button';
import { CloseIcon, FilterIcon } from '../../shared/ui/icons';
import { eyebrowClass } from '../../shared/ui/Section';
import { Select } from '../../shared/ui/Select';

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
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <span className={eyebrowClass}>{label}</span>
        {selected.length > 0 && (
          <Badge variant="count" size="xs">
            {selected.length}
          </Badge>
        )}
      </span>
      <select
        multiple
        aria-label={label}
        data-testid={`filter-${dimension}`}
        className="ksg-select ksg-scroll h-[68px] min-w-[8.5rem] max-w-[12rem] rounded-md border border-hairline-strong bg-raised px-1 py-1 font-mono text-[11px] text-primary"
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

const DIMENSION_LABEL: Record<ListDimension, string> = {
  cluster: 'Cluster',
  az: 'AZ',
  env: 'Env',
  namespace: 'Namespace',
  edgeType: 'Edge type',
};

const LIST_DIMENSIONS: readonly ListDimension[] = ['cluster', 'az', 'env', 'namespace', 'edgeType'];

/**
 * The dimensions the backend narrows on, as controls.
 *
 * Every control here sends a parameter the pinned backend honours, and every option it
 * offers came from the backend or from the store the backend filters against — a control
 * that populated from somewhere else would accept a selection, redraw identically, and
 * report nothing.
 *
 * Below the controls, every applied value is repeated as a removable chip. A multi-select
 * scrolls its own selection out of sight, so without the chips "what is currently
 * narrowed" is a question the bar can only answer by being scrolled.
 */
export function FilterBar({ filters, options, onValues, onPrune, onClear }: Readonly<FilterBarProps>): JSX.Element {
  const applied = LIST_DIMENSIONS.flatMap((dimension) => filters[dimension].map((value) => ({ dimension, value })));
  const nothingNarrowed = applied.length === 0 && filters.prune;
  return (
    <div
      aria-label="Graph filters"
      data-testid="filter-bar"
      className="flex shrink-0 flex-col gap-2 border-b border-hairline bg-rail px-3 py-2.5"
    >
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <span className="flex h-[68px] items-center gap-1.5 pr-1 text-secondary">
          <FilterIcon size={14} />
          <span className={eyebrowClass}>Filters</span>
        </span>

        {LIST_DIMENSIONS.map((dimension) => (
          <ListControl
            key={dimension}
            label={DIMENSION_LABEL[dimension]}
            dimension={dimension}
            selected={filters[dimension]}
            available={options[dimension]}
            onValues={onValues}
          />
        ))}

        <label className="flex flex-col gap-1">
          <span className={eyebrowClass}>Projection</span>
          <Select
            aria-label="Projection"
            data-testid="filter-prune"
            value={filters.prune ? 'traffic' : 'inventory'}
            onChange={(e) => onPrune(e.currentTarget.value === 'traffic')}
          >
            {/* The backend's own default is the pruned traffic graph; `Full inventory` is
                ?prune=false, which is also what this demo's harness counts. */}
            <option value="traffic">Traffic graph</option>
            <option value="inventory">Full inventory</option>
          </Select>
        </label>

        <Button size="md" aria-label="Clear filters" disabled={nothingNarrowed} onClick={onClear}>
          Clear
        </Button>

        {options.problems.length > 0 && (
          <span
            className="flex items-center gap-1.5 text-[11px] text-[var(--ksg-status-warning)]"
            title={options.problems.join('\n')}
            data-testid="filter-problems"
          >
            {options.problems.length} filter source(s) unavailable
          </span>
        )}
      </div>

      {applied.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="filter-chips">
          {applied.map(({ dimension, value }) => (
            <span
              key={`${dimension}:${value}`}
              className="inline-flex items-center gap-1 rounded border border-hairline bg-selected py-0.5 pl-1.5 pr-0.5 text-[11px]"
              data-testid={`filter-chip-${dimension}-${value}`}
            >
              <span className={clsx(eyebrowClass, 'text-[9px]')}>{DIMENSION_LABEL[dimension]}</span>
              <span className="max-w-[14rem] truncate font-mono text-primary">{value}</span>
              <button
                type="button"
                className="rounded p-0.5 text-muted transition-colors duration-100 hover:bg-raised-hover hover:text-primary"
                aria-label={`Remove ${DIMENSION_LABEL[dimension]} ${value}`}
                onClick={() =>
                  onValues(
                    dimension,
                    filters[dimension].filter((v) => v !== value)
                  )
                }
              >
                <CloseIcon size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
