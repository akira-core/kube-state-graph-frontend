import { useEffect, useState } from 'react';

import { IDENTITY_DIMENSIONS, type IdentityDimension } from '../../shared/types/graphFilters';

import { fetchEdgeTypes } from './edgeTypes';
import { fetchLabelValues } from './labelValues';

export interface FilterOptions {
  cluster: string[];
  az: string[];
  env: string[];
  namespace: string[];
  edgeType: string[];
  /** One line per dimension that could not be enumerated. Empty when everything loaded. */
  problems: string[];
}

const EMPTY: FilterOptions = { cluster: [], az: [], env: [], namespace: [], edgeType: [], problems: [] };

/**
 * Enumerate what each control may offer.
 *
 * Loaded once per configured source rather than per graph request: the option lists
 * track the pod INVENTORY and the backend's registry, neither of which follows the
 * projection or the current selection. Rebuilding them per request would shrink the
 * namespace list to whatever the pruned graph happened to contain, and a viewer could
 * not then widen the filter back out.
 *
 * A source that fails leaves its control empty and records why. It never rejects: the
 * graph load must not depend on a dropdown.
 */
export function useFilterOptions(labelValuesBase: string | undefined, edgeTypesUrl: string | undefined): FilterOptions {
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

      let edgeType: string[] = [];
      if (edgeTypesUrl !== undefined && edgeTypesUrl !== '') {
        const result = await fetchEdgeTypes(edgeTypesUrl);
        if (result.ok) {
          edgeType = result.types;
        } else {
          problems.push(result.problem);
        }
      }

      if (!cancelled && !controller.signal.aborted) {
        setOptions({ ...identity, edgeType, problems });
      }
    }

    void load().catch(() => {
      // fetchLabelValues / fetchEdgeTypes only reject on abort, which is not a failure.
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [labelValuesBase, edgeTypesUrl]);

  return options;
}
