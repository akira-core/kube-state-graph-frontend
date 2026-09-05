import { useCallback, useMemo, useState } from 'react';

import { DEFAULT_GRAPH_FILTERS, type GraphFilters, type IdentityDimension } from '../../shared/types/graphFilters';

export type ListDimension = IdentityDimension | 'edgeType';

export interface GraphFiltersController {
  filters: GraphFilters;
  setValues: (dimension: ListDimension, values: string[]) => void;
  setPrune: (prune: boolean) => void;
  clear: () => void;
}

/**
 * Holds the filter selection.
 *
 * Deliberately NOT persisted. A remembered filter is invisible on the next visit and
 * would present a narrowed estate as the whole one — the same confusion between "nothing
 * here" and "nothing shown" the projection control exists to prevent.
 */
export function useGraphFilters(initial: GraphFilters = DEFAULT_GRAPH_FILTERS): GraphFiltersController {
  const [filters, setFilters] = useState<GraphFilters>(initial);

  const setValues = useCallback((dimension: ListDimension, values: string[]) => {
    setFilters((prev) => ({ ...prev, [dimension]: values }));
  }, []);

  const setPrune = useCallback((prune: boolean) => {
    setFilters((prev) => ({ ...prev, prune }));
  }, []);

  const clear = useCallback(() => {
    setFilters(DEFAULT_GRAPH_FILTERS);
  }, []);

  return useMemo(() => ({ filters, setValues, setPrune, clear }), [filters, setValues, setPrune, clear]);
}
