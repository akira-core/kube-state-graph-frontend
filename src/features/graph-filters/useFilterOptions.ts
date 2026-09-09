import { useEffect, useState } from 'react';

import { IDENTITY_DIMENSIONS, type IdentityDimension } from '../../shared/types/graphFilters';

import { fetchLabelValues } from './labelValues';

export interface FilterOptions {
  cluster: string[];
  az: string[];
  env: string[];
  namespace: string[];
  /** One line per dimension that could not be enumerated. Empty when everything loaded. */
  problems: string[];
}

const EMPTY: FilterOptions = { cluster: [], az: [], env: [], namespace: [], problems: [] };

/**
 * Enumerate what each control may offer.
 *
 * Loaded once per configured source rather than per graph request: the option list
 * tracks the pod INVENTORY, which does not follow the projection or the current
 * selection. Rebuilding it per request would shrink the namespace list to whatever the
 * pruned graph happened to contain, and a viewer could not then widen the filter back
 * out.
 *
 * The pod inventory is the only source. The backend withdrew its edge-type catalogue
 * along with `?edge_type=`, so there is no second thing to enumerate.
 *
 * A source that fails leaves its control empty and records why. It never rejects: the
 * graph load must not depend on a dropdown.
 */
export function useFilterOptions(labelValuesBase: string | undefined): FilterOptions {
  const [options, setOptions] = useState<FilterOptions>(EMPTY);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load(): Promise<void> {
      const problems: string[] = [];
      const identity: Record<IdentityDimension, string[]> = { cluster: [], az: [], env: [], namespace: [] };

      if (labelValuesBase !== undefined && labelValuesBase !== '') {
        const results = await Promise.all(
          IDENTITY_DIMENSIONS.map(async (dimension) => ({
            dimension,
            result: await fetchLabelValues(labelValuesBase, dimension),
          }))
        );
        for (const { dimension, result } of results) {
          if (result.ok) {
            identity[dimension] = result.values;
          } else {
            problems.push(result.problem);
          }
        }
      }

      if (!cancelled && !controller.signal.aborted) {
        setOptions({ ...identity, problems });
      }
    }

    void load().catch(() => {
      // fetchLabelValues only rejects on abort, which is not a failure.
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [labelValuesBase]);

  return options;
}
