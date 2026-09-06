import type { JSX } from 'react';

import type { GraphFilters, ListDimension } from '../../shared/types/graphFilters';
import { Button } from '../../shared/ui/Button';
import { FilterIcon } from '../../shared/ui/icons';
import { ScopeSelect } from '../../shared/ui/ScopeSelect';
import { eyebrowClass } from '../../shared/ui/Section';

import type { FilterOptions } from './useFilterOptions';

export interface FilterBarProps {
  filters: GraphFilters;
  options: FilterOptions;
  onValues: (dimension: ListDimension, values: string[]) => void;
  onPrune: (prune: boolean) => void;
  onClear: () => void;
}

const DIMENSION_LABEL: Record<ListDimension, string> = {
  cluster: 'Cluster',
  az: 'AZ',
  env: 'Env',
  namespace: 'Namespace',
  edgeType: 'Edge type',
};

const LIST_DIMENSIONS: readonly ListDimension[] = ['cluster', 'az', 'env', 'namespace', 'edgeType'];

function pruneLabel(value: string): string {
  return value === 'true' ? 'Traffic graph' : 'Full inventory';
}

/**
 * Backend-narrowing controls, as Grafana-style dropdowns.
 *
 * Identity dimensions accept custom values; `edge_type` does not — that catalogue and
 * the backend's validation are the same registry. Projection is the same component in
 * single-select. Applied values live on the trigger as pills, so the chip row is gone.
 */
export function FilterBar({ filters, options, onValues, onPrune, onClear }: Readonly<FilterBarProps>): JSX.Element {
  const nothingNarrowed = LIST_DIMENSIONS.every((dimension) => filters[dimension].length === 0) && filters.prune;
  return (
    <div
      aria-label="Graph filters"
      data-testid="filter-bar"
      className="flex shrink-0 flex-col gap-2 border-b border-hairline bg-rail px-3 py-2.5"
    >
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <span className="flex h-8 items-center gap-1.5 pr-1 text-secondary">
          <FilterIcon size={14} />
          <span className={eyebrowClass}>Filters</span>
        </span>

        {LIST_DIMENSIONS.map((dimension) => (
          <ScopeSelect
            key={dimension}
            label={DIMENSION_LABEL[dimension]}
            mode="multi"
            options={options[dimension]}
            value={filters[dimension]}
            onChange={(next) => onValues(dimension, next)}
            allowCustom={dimension !== 'edgeType'}
            testId={`filter-${dimension}`}
          />
        ))}

        <ScopeSelect
          label="Projection"
          mode="single"
          options={['true', 'false']}
          optionLabel={pruneLabel}
          value={[filters.prune ? 'true' : 'false']}
          onChange={(next) => onPrune(next[0] !== 'false')}
          allowCustom={false}
          testId="filter-prune"
        />

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
    </div>
  );
}
