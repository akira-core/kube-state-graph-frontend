import type { JSX } from 'react';

import type { GraphFilters, IdentityDimension } from '../../shared/types/graphFilters';
import { Button } from '../../shared/ui/Button';
import { FilterIcon } from '../../shared/ui/icons';
import { QueryButton } from '../../shared/ui/QueryButton';
import { ScopeSelect } from '../../shared/ui/ScopeSelect';
import { eyebrowClass } from '../../shared/ui/Section';

import type { FilterOptions } from './useFilterOptions';

export interface FilterBarProps {
  filters: GraphFilters;
  options: FilterOptions;
  onValues: (dimension: IdentityDimension, values: string[]) => void;
  onPrune: (prune: boolean) => void;
  onClear: () => void;
  dirty: boolean;
  inFlight: boolean;
  onQuery: () => void;
  onCancel: () => void;
}

const DIMENSION_LABEL: Record<IdentityDimension, string> = {
  cluster: 'Cluster',
  az: 'AZ',
  env: 'Env',
  namespace: 'Namespace',
};

const LIST_DIMENSIONS: readonly IdentityDimension[] = ['cluster', 'az', 'env', 'namespace'];

function pruneLabel(value: string): string {
  return value === 'true' ? 'Traffic graph' : 'Full inventory';
}

/**
 * Backend-narrowing controls, as Grafana-style dropdowns.
 *
 * Every list dimension accepts custom values: each reaches the upstream PromQL as a raw
 * label matcher, so a typed value is as valid as an enumerated one. Projection is the
 * same component in single-select, and is the one control here naming a closed set of
 * positions rather than a narrowing — hence its `allowCustom={false}`. Applied values
 * live on the trigger as pills, so the chip row is gone.
 */
export function FilterBar({
  filters,
  options,
  onValues,
  onPrune,
  onClear,
  dirty,
  inFlight,
  onQuery,
  onCancel,
}: Readonly<FilterBarProps>): JSX.Element {
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
            allowCustom
            testId={`filter-${dimension}`}
          />
        ))}

        <ScopeSelect
          label="Projection"
          mode="single"
          options={['true', 'false']}
          optionLabel={pruneLabel}
          value={[filters.prune ? 'true' : 'false']}
          // Projection is never empty — it is one of two positions, not a narrowing. An
          // empty commit (the pill's ×) must be a no-op: read as `next[0] !== 'false'` it
          // would silently snap `Full inventory` back to the pruned traffic graph, which
          // draws a fraction of the pods while the control claims nothing was cleared.
          onChange={(next) => {
            if (next.length > 0) {
              onPrune(next[0] !== 'false');
            }
          }}
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

        <QueryButton dirty={dirty} inFlight={inFlight} disabled={false} onQuery={onQuery} onCancel={onCancel} />
      </div>
    </div>
  );
}
