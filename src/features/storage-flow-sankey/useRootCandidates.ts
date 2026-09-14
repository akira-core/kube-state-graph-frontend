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

/** Separator for composite keys: bases, kinds and namespaces are free strings, so NUL cannot collide. */
const SEP = '\0';

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
 * `node` is requested once per mount; `pod` once per namespace, all namespaces at once.
 * Storage-side kinds (`ontap_cluster` / `aggr` / `svm`) have no store enumeration — they
 * come from `drawn`.
 *
 * The cache is keyed by the endpoint as well as the kind / namespace, so a runtime config
 * that points the page at another store cannot serve the previous estate's names. A kind
 * or namespace change aborts the requests it made obsolete rather than letting them run
 * to completion behind the next ones.
 */
export function useRootCandidates({ labelValuesBase, kind, namespaces, drawn }: UseRootCandidatesArgs): {
  options: SankeyRootOptions;
  problems: string[];
} {
  const cache = useRef<Map<string, string[]> | null>(null);
  if (cache.current === null) {
    cache.current = new Map();
  }
  const [remote, setRemote] = useState<{ node: string[]; pod: string[]; problems: string[] }>({
    node: [],
    pod: [],
    problems: [],
  });

  const nsKey = namespaces.join(SEP);

  useEffect(() => {
    if (labelValuesBase === undefined || labelValuesBase === '') {
      return;
    }
    if (kind !== 'node' && kind !== 'pod') {
      return;
    }
    const base = labelValuesBase;
    const store = cache.current as Map<string, string[]>;
    const nsList = nsKey.length === 0 ? [] : nsKey.split(SEP);
    const controller = new AbortController();
    const { signal } = controller;
    const keyOf = (...parts: string[]): string => [base, ...parts].join(SEP);

    async function load(): Promise<void> {
      const problems: string[] = [];
      const nodeValues: string[] = [];
      const podValues: string[] = [];

      if (kind === 'node') {
        const cached = store.get(keyOf('node'));
        if (cached !== undefined) {
          nodeValues.push(...cached);
        } else {
          const result = await fetchLabelValues(base, 'node', undefined, signal);
          if (signal.aborted) {
            return;
          }
          if (result.ok) {
            store.set(keyOf('node'), result.values);
            nodeValues.push(...result.values);
          } else {
            // Not cached: a transient failure must be retried on the next kind switch.
            problems.push(result.problem);
          }
        }
      }

      if (kind === 'pod') {
        // Independent lookups, so they go out together; results are folded in namespace
        // order so the option list is stable whichever answers first.
        const results = await Promise.all(
          nsList.map(async (ns): Promise<{ ns: string; values: string[] } | { ns: string; problem: string }> => {
            const cached = store.get(keyOf('pod', ns));
            if (cached !== undefined) {
              return { ns, values: cached };
            }
            const result = await fetchLabelValues(base, 'pod', podInventorySelector(ns), signal);
            return result.ok ? { ns, values: result.values } : { ns, problem: result.problem };
          })
        );
        if (signal.aborted) {
          return;
        }
        for (const item of results) {
          if (!('values' in item)) {
            problems.push(item.problem);
            continue;
          }
          store.set(keyOf('pod', item.ns), item.values);
          for (const name of item.values) {
            podValues.push(`${item.ns}/${name}`);
          }
        }
      }

      if (!signal.aborted) {
        setRemote({ node: nodeValues, pod: podValues, problems });
      }
    }

    void load().catch(() => {
      // fetchLabelValues only rejects on abort, which is this effect's own cleanup.
    });

    return () => {
      controller.abort();
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
