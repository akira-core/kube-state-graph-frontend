import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  EMPTY_STORAGE_GRAPH_ROOTS,
  isValidPodRoot,
  type StorageGraphQuery,
  type StorageGraphRoots,
} from '../graph-data';

export type SankeyRootKind = keyof StorageGraphRoots;

export interface SankeyIdentityOptions {
  az: string[];
  env: string[];
  cluster: string[];
  namespace: string[];
}

export interface SankeyQueryController {
  query: StorageGraphQuery;
  azEnvReady: boolean;
  podError: string | undefined;
  setAz: (value: string | undefined) => void;
  setEnv: (value: string | undefined) => void;
  setCluster: (values: string[]) => void;
  setNamespace: (values: string[]) => void;
  addRoot: (kind: SankeyRootKind, value: string) => boolean;
  removeRoot: (kind: SankeyRootKind, value: string) => void;
  clearRoots: () => void;
}

function pickSingleton(current: string | undefined, options: string[]): string | undefined {
  if (current !== undefined && options.length > 0 && !options.includes(current)) {
    return undefined;
  }
  if (current === undefined && options.length === 1) {
    return options[0];
  }
  return current;
}

/**
 * Sankey-owned estimate / root selection. Independent of the Graph filter bar:
 * same dimension names, different cardinality, different endpoint.
 */
export function useSankeyQuery(options: SankeyIdentityOptions): SankeyQueryController {
  const [az, setAz] = useState<string | undefined>(undefined);
  const [env, setEnv] = useState<string | undefined>(undefined);
  const [cluster, setCluster] = useState<string[]>([]);
  const [namespace, setNamespace] = useState<string[]>([]);
  const [roots, setRoots] = useState<StorageGraphRoots>(EMPTY_STORAGE_GRAPH_ROOTS);
  const [podError, setPodError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setAz((current) => pickSingleton(current, options.az));
  }, [options.az]);

  useEffect(() => {
    setEnv((current) => pickSingleton(current, options.env));
  }, [options.env]);

  const addRoot = useCallback((kind: SankeyRootKind, value: string): boolean => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return false;
    }
    if (kind === 'pod' && !isValidPodRoot(trimmed)) {
      setPodError('Pod root must be <namespace>/<pod>');
      return false;
    }
    setPodError(undefined);
    setRoots((prev) => {
      if (prev[kind].includes(trimmed)) {
        return prev;
      }
      return { ...prev, [kind]: [...prev[kind], trimmed] };
    });
    return true;
  }, []);

  const removeRoot = useCallback((kind: SankeyRootKind, value: string) => {
    setRoots((prev) => ({ ...prev, [kind]: prev[kind].filter((item) => item !== value) }));
  }, []);

  const clearRoots = useCallback(() => {
    setRoots(EMPTY_STORAGE_GRAPH_ROOTS);
    setPodError(undefined);
  }, []);

  const query = useMemo<StorageGraphQuery>(
    () => ({ az, env, cluster, namespace, roots }),
    [az, env, cluster, namespace, roots]
  );

  return {
    query,
    azEnvReady: az !== undefined && az !== '' && env !== undefined && env !== '',
    podError,
    setAz,
    setEnv,
    setCluster,
    setNamespace,
    addRoot,
    removeRoot,
    clearRoots,
  };
}
