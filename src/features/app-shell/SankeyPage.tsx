import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useNavigate } from 'react-router';

import { DEMO_IDENTITY_OPTIONS, SHOWCASE_STORAGE_GRAPH } from '../../shared/fixtures/showcaseStorageGraph';
import {
  buildStorageGraphRequestUrl,
  EMPTY_STORAGE_GRAPH_ROOTS,
  isValidPodRoot,
  storageGraphRequestKey,
  useGraphLoader,
  type StorageGraphRoots,
} from '../graph-data';
import { useFilterOptions } from '../graph-filters';
import {
  kubernetesNodeRoots,
  rootValueOptions,
  SankeyScopeBar,
  SankeyView,
  useSankeyQuery,
  type SankeyMode,
  type SankeyPodLayout,
} from '../storage-flow-sankey';
import { EMPTY_SANKEY_URL_SCOPE, parseSankeyScope, serializeSankeyScope } from '../storage-flow-sankey/sankeyUrlScope';
import type { SankeyQueryController } from '../storage-flow-sankey/useSankeyQuery';

import { IDLE_PAGE_STATUS, useShellFrame } from './ShellFrame';
import { useUrlScope } from './useUrlScope';

function liveController(
  scope: ReturnType<typeof parseSankeyScope>,
  setScope: (next: typeof scope | ((prev: typeof scope) => typeof scope)) => void,
  podError: string | undefined,
  setPodError: (next: string | undefined) => void
): SankeyQueryController {
  return {
    query: scope.query,
    azEnvReady:
      scope.query.az !== undefined && scope.query.az !== '' && scope.query.env !== undefined && scope.query.env !== '',
    podError,
    setAz: (value) => setScope((prev) => ({ ...prev, query: { ...prev.query, az: value } })),
    setEnv: (value) => setScope((prev) => ({ ...prev, query: { ...prev.query, env: value } })),
    setCluster: (values) => setScope((prev) => ({ ...prev, query: { ...prev.query, cluster: values } })),
    setNamespace: (values) => setScope((prev) => ({ ...prev, query: { ...prev.query, namespace: values } })),
    addRoot: (kind, value) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return false;
      }
      if (kind === 'pod' && !isValidPodRoot(trimmed)) {
        setPodError('Pod root must be <namespace>/<pod>');
        return false;
      }
      setPodError(undefined);
      setScope((prev) => {
        if (prev.query.roots[kind].includes(trimmed)) {
          return prev;
        }
        const roots: StorageGraphRoots = { ...prev.query.roots, [kind]: [...prev.query.roots[kind], trimmed] };
        return { ...prev, droppedPods: [], query: { ...prev.query, roots } };
      });
      return true;
    },
    removeRoot: (kind, value) => {
      setScope((prev) => ({
        ...prev,
        query: {
          ...prev.query,
          roots: { ...prev.query.roots, [kind]: prev.query.roots[kind].filter((item) => item !== value) },
        },
      }));
    },
    clearRoots: () => {
      setPodError(undefined);
      setScope((prev) => ({
        ...prev,
        droppedPods: [],
        query: { ...prev.query, roots: EMPTY_STORAGE_GRAPH_ROOTS },
      }));
    },
  };
}

export function SankeyPage(): JSX.Element {
  const { config, time, setStatus, focusMode, setFocusMode } = useShellFrame();
  const navigate = useNavigate();
  const filterOptions = useFilterOptions(config.demoMode ? undefined : config.endpoints.labelValues, undefined);
  const identity = config.demoMode
    ? DEMO_IDENTITY_OPTIONS
    : {
        az: filterOptions.az,
        env: filterOptions.env,
        cluster: filterOptions.cluster,
        namespace: filterOptions.namespace,
      };

  const [urlScope, setUrlScope] = useUrlScope(
    parseSankeyScope,
    serializeSankeyScope,
    time.range,
    !config.demoMode,
    EMPTY_SANKEY_URL_SCOPE
  );
  const demoQuery = useSankeyQuery(identity);
  const [podError, setPodError] = useState<string | undefined>(undefined);
  const [podLayout, setPodLayout] = useState<SankeyPodLayout>('flat');
  useEffect(() => {
    if (urlScope.droppedPods.length > 0) {
      setPodError('Pod root must be <namespace>/<pod>');
    }
  }, [urlScope.droppedPods]);
  const controller = config.demoMode ? demoQuery : liveController(urlScope, setUrlScope, podError, setPodError);
  const storageEndpoint = config.demoMode ? undefined : config.endpoints.storageGraph;
  const storageConfigured = config.demoMode || storageEndpoint !== undefined;
  const azEnvReady = controller.azEnvReady;

  // An estate that offers exactly one az (or env) is seeded with it, because the endpoint
  // requires both and making the operator pick the only candidate teaches nothing. It is a
  // seed, not a constraint: clearing the pill must stick. `seeded` records the option this
  // effect has already offered, so a re-run — a new time range, a re-render — cannot put back
  // what the operator just removed, while a genuinely new sole option still seeds.
  const soleAz = identity.az.length === 1 ? identity.az[0] : undefined;
  const soleEnv = identity.env.length === 1 ? identity.env[0] : undefined;
  const seeded = useRef<{ az: string | undefined; env: string | undefined }>({ az: undefined, env: undefined });

  useEffect(() => {
    const azIsNew = soleAz !== undefined && soleAz !== seeded.current.az;
    const envIsNew = soleEnv !== undefined && soleEnv !== seeded.current.env;
    seeded.current = { az: soleAz, env: soleEnv };
    if (config.demoMode || (!azIsNew && !envIsNew)) {
      return;
    }
    setUrlScope((prev) => {
      const az = azIsNew && prev.query.az === undefined ? soleAz : prev.query.az;
      const env = envIsNew && prev.query.env === undefined ? soleEnv : prev.query.env;
      if (az === prev.query.az && env === prev.query.env) {
        return prev;
      }
      return { ...prev, query: { ...prev.query, az, env } };
    });
  }, [config.demoMode, setUrlScope, soleAz, soleEnv]);

  const makeUrl = useCallback(
    () =>
      storageEndpoint === undefined
        ? undefined
        : buildStorageGraphRequestUrl(storageEndpoint, time.range, controller.query),
    [controller.query, storageEndpoint, time.range]
  );
  const requestKey = useMemo(
    () => storageGraphRequestKey(storageEndpoint, time.range, controller.query),
    [controller.query, storageEndpoint, time.range]
  );
  const storage = useGraphLoader({
    demoMode: config.demoMode,
    demoPayload: SHOWCASE_STORAGE_GRAPH,
    enabled: azEnvReady && storageConfigured,
    makeUrl,
    requestKey,
    refreshIntervalSeconds: config.refreshIntervalSeconds,
  });

  useEffect(() => {
    setStatus({
      lastLoadedAt: storage.state.lastLoadedAt,
      refreshing: storage.state.refreshing || (storage.state.status === 'loading' && !storage.state.hasPayload),
      error: storage.state.error,
      reload: storage.reload,
      reloadDisabled: !azEnvReady || (!config.demoMode && storageEndpoint === undefined),
    });
  }, [azEnvReady, config.demoMode, setStatus, storage.reload, storage.state, storageEndpoint]);

  useEffect(() => {
    return () => {
      setStatus(IDLE_PAGE_STATUS);
      setFocusMode(false);
    };
  }, [setFocusMode, setStatus]);

  const onLocateNode = useCallback(
    (id: string) => {
      void navigate('/graph', { state: { locate: id } });
    },
    [navigate]
  );
  const k8sNodeHint = useMemo(
    () => (podLayout === 'flat' ? kubernetesNodeRoots(storage.state.elements, controller.query.roots) : []),
    [controller.query.roots, podLayout, storage.state.elements]
  );
  // Root values are read off the drawn body, not off `endpoints.labelValues`: that endpoint
  // reaches only the store holding `kube_pod_info`, which carries none of the NetApp label
  // names at all. See `rootValueOptions` for what that costs once a root is applied.
  const rootOptions = useMemo(() => rootValueOptions(storage.state.elements), [storage.state.elements]);

  return (
    <>
      {!focusMode && (
        <SankeyScopeBar
          options={identity}
          controller={controller}
          rootOptions={rootOptions}
          k8sNodeHint={k8sNodeHint}
        />
      )}
      <main className="relative min-h-0 flex-1">
        <SankeyView
          elements={storage.state.elements}
          status={storage.state.status}
          error={storage.state.error}
          hasPayload={storage.state.hasPayload}
          demoMode={config.demoMode}
          focusMode={focusMode}
          onFocusModeChange={setFocusMode}
          {...(config.demoMode
            ? {}
            : {
                mode: urlScope.mode,
                onModeChange: (mode: SankeyMode) => setUrlScope((prev) => ({ ...prev, mode })),
              })}
          endpointConfigured={storageConfigured}
          azEnvReady={azEnvReady}
          roots={controller.query.roots}
          onLocateNode={onLocateNode}
          podLayout={podLayout}
          onPodLayoutChange={setPodLayout}
        />
      </main>
    </>
  );
}
