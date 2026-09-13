import { useEffect, useMemo, useRef, useState } from 'react';

import { fetchLabelValues, podInventorySelector } from '../graph-filters/labelValues';

import { type SankeyRootOptions } from './deriveSankey';
import type { SankeyRootKind } from './useSankeyQuery';

export interface UseRootCandidatesArgs {
  labelValuesBase: string | undefined;
  kind: SankeyRootKind;
  namespaces: readonly string[];
  drawn: SankeyRootOptions;
}

function unionSorted(a: readonly string[], b: readonly string[]): string[] {
  const set = new Set<string>();
  for (const item of a) {
    set.add(item);
  }
  for (const item of b) {
    set.add(item);
  }
  return [...set].sort((x, y) => x.localeCompare(y));
}

/**
 * Workload-side root candidates, fetched on demand and unioned with the drawn body.
 *
 * `node` is requested once per mount; `pod` once per namespace. Storage-side kinds
 * (`ontap_cluster` / `aggr` / `svm`) have no store enumeration — they come from `drawn`.
 */
export function useRootCandidates({ labelValuesBase, kind, namespaces, drawn }: UseRootCandidatesArgs): {
  options: SankeyRootOptions;
  problems: string[];
} {
  const cache = useRef(new Map<string, string[]>());
  const [remote, setRemote] = useState<{ node: string[]; pod: string[]; problems: string[] }>({
    node: [],
    pod: [],
    problems: [],
  });

  const nsKey = namespaces.join('\0');

  useEffect(() => {
    if (labelValuesBase === undefined || labelValuesBase === '') {
      return;
    }
    if (kind !== 'node' && kind !== 'pod') {
      return;
    }
    const nsList = nsKey.length === 0 ? [] : nsKey.split('\0');

    let cancelled = false;

    async function load(): Promise<void> {
      const problems: string[] = [];
      const nodeValues: string[] = [];
      const podValues: string[] = [];

      if (kind === 'node') {
        const cached = cache.current.get('node');
        if (cached !== undefined) {
          nodeValues.push(...cached);
        } else {
          const result = await fetchLabelValues(labelValuesBase as string, 'node');
          if (cancelled) {
            return;
          }
          if (result.ok) {
            cache.current.set('node', result.values);
            nodeValues.push(...result.values);
          } else {
            // Not cached: a transient failure must be retried on the next kind switch.
            problems.push(result.problem);
          }
        }
      }

      if (kind === 'pod') {
        for (const ns of nsList) {
          const key = `pod:${ns}`;
          const cached = cache.current.get(key);
          if (cached !== undefined) {
            for (const name of cached) {
              podValues.push(`${ns}/${name}`);
            }
            continue;
          }
          const result = await fetchLabelValues(labelValuesBase as string, 'pod', podInventorySelector(ns));
          if (cancelled) {
            return;
          }
          if (result.ok) {
            cache.current.set(key, result.values);
            for (const name of result.values) {
              podValues.push(`${ns}/${name}`);
            }
          } else {
            problems.push(result.problem);
          }
        }
      }

      if (!cancelled) {
        setRemote({ node: nodeValues, pod: podValues, problems });
      }
    }

    void load().catch(() => {
      // fetchLabelValues only rejects on abort.
    });

    return () => {
      cancelled = true;
    };
  }, [kind, labelValuesBase, nsKey]);

  const options = useMemo<SankeyRootOptions>(() => {
    return {
      ontap_cluster: drawn.ontap_cluster,
      node: unionSorted(remote.node, drawn.node),
      aggr: drawn.aggr,
      svm: drawn.svm,
      pod: unionSorted(remote.pod, drawn.pod),
    };
  }, [drawn, remote.node, remote.pod]);

  return { options, problems: remote.problems };
}
