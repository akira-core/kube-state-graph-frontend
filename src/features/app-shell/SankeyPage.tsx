import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useNavigate } from 'react-router';

import { DEMO_IDENTITY_OPTIONS, SHOWCASE_STORAGE_GRAPH } from '../../shared/fixtures/showcaseStorageGraph';
import {
  buildStorageGraphRequestUrl,
  EMPTY_STORAGE_GRAPH_ROOTS,
  hasAnyRoot,
  isValidPodRoot,
  type StorageGraphQuery,
  type StorageGraphRoots,
} from '../graph-data';
import { useFilterOptions } from '../graph-filters';
import {
  DEFAULT_TOP_PODS,
  parseSankeyScope,
  rootValueOptions,
  SankeyScopeBar,
  SankeyView,
  SankeyViewControls,
  serializeSankeyScope,
  useRootCandidates,
  useSankeyProjection,
  useSankeyQuery,
  type SankeyMode,
  type SankeyPodLayout,
  type SankeyQueryController,
  type SankeyRootKind,
  type SankeySvmDisplay,
  type SankeyWeight,
} from '../storage-flow-sankey';

import { HOME_PATH } from './routes';
import { useShellFrame } from './ShellFrame';
import { useAppliedScope, useCommitField, useSeedTimeOnMount } from './useAppliedScope';
import { useDraft } from './useDraft';
import { usePageLoader } from './usePageLoader';

function liveController(
  draft: StorageGraphQuery,
  setDraft: (next: StorageGraphQuery | ((prev: StorageGraphQuery) => StorageGraphQuery)) => void,
  podError: string | undefined,
  setPodError: (next: string | undefined) => void
): SankeyQueryController {
  return {
    query: draft,
    azEnvReady: draft.az !== undefined && draft.az !== '' && draft.env !== undefined && draft.env !== '',
    podError,
    setAz: (value) => setDraft((prev) => ({ ...prev, az: value })),
    setEnv: (value) => setDraft((prev) => ({ ...prev, env: value })),
    setCluster: (values) => setDraft((prev) => ({ ...prev, cluster: values })),
    setNamespace: (values) => setDraft((prev) => ({ ...prev, namespace: values })),
    addRoot: (kind, value) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return false;
      }
      return liveController(draft, setDraft, podError, setPodError).addRoots(kind, [trimmed]);
    },
    addRoots: (kind, values) => {
      const trimmed = values.map((value) => value.trim()).filter((value) => value.length > 0);
      if (trimmed.length === 0) {
        return false;
      }
      if (kind === 'pod' && trimmed.some((value) => !isValidPodRoot(value))) {
        setPodError('Pod root must be <namespace>/<pod>');
        return false;
      }
      setPodError(undefined);
      setDraft((prev) => {
        const nextKind = [...prev.roots[kind]];
        for (const value of trimmed) {
          if (!nextKind.includes(value)) {
            nextKind.push(value);
          }
        }
        const roots: StorageGraphRoots = { ...prev.roots, [kind]: nextKind };
        return { ...prev, roots };
      });
      return true;
    },
    removeRoot: (kind, value) => {
      setDraft((prev) => ({
        ...prev,
        roots: { ...prev.roots, [kind]: prev.roots[kind].filter((item) => item !== value) },
      }));
    },
    clearRoots: () => {
      setPodError(undefined);
      setDraft((prev) => ({ ...prev, roots: EMPTY_STORAGE_GRAPH_ROOTS }));
    },
  };
}

export function SankeyPage(): JSX.Element {
  const { config, time, focusMode, setFocusMode } = useShellFrame();
  const navigate = useNavigate();
  const filterOptions = useFilterOptions(config.demoMode ? undefined : config.endpoints.labelValues);
  const identity = config.demoMode
    ? DEMO_IDENTITY_OPTIONS
    : {
        az: filterOptions.az,
        env: filterOptions.env,
        cluster: filterOptions.cluster,
        namespace: filterOptions.namespace,
      };

  const serialize = config.demoMode ? () => [] : serializeSankeyScope;
  const { applied, commit } = useAppliedScope(parseSankeyScope, serialize);
  const { draft, setDraft, dirty } = useDraft(applied.query);
  useSeedTimeOnMount(applied, commit, time);

  const demoQuery = useSankeyQuery(identity);
  const [podError, setPodError] = useState<string | undefined>(undefined);
  const [podLayout, setPodLayout] = useState<SankeyPodLayout>('flat');
  const [svmDisplay, setSvmDisplay] = useState<SankeySvmDisplay>('column');
  const [demoTopPods, setDemoTopPods] = useState(DEFAULT_TOP_PODS);
  const [demoModeValue, setDemoModeValue] = useState<SankeyMode>('both');
  const [demoWeight, setDemoWeight] = useState<SankeyWeight>('throughput');
  const [rootKind, setRootKind] = useState<SankeyRootKind>('aggr');

  useEffect(() => {
    if (applied.droppedPods.length > 0) {
      setPodError('Pod root must be <namespace>/<pod>');
    }
  }, [applied.droppedPods]);

  const controller = config.demoMode ? demoQuery : liveController(draft, setDraft, podError, setPodError);
  const storageEndpoint = config.demoMode ? undefined : config.endpoints.storageGraph;
  const storageConfigured = config.demoMode || storageEndpoint !== undefined;
  const azEnvReady = controller.azEnvReady;
  const hasRoot = hasAnyRoot(controller.query.roots);

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
    setDraft((prev) => {
      const az = azIsNew && prev.az === undefined ? soleAz : prev.az;
      const env = envIsNew && prev.env === undefined ? soleEnv : prev.env;
      if (az === prev.az && env === prev.env) {
        return prev;
      }
      return { ...prev, az, env };
    });
  }, [config.demoMode, setDraft, soleAz, soleEnv]);

  const leaveFocusMode = useCallback(() => setFocusMode(false), [setFocusMode]);
  const storage = usePageLoader({
    demoMode: config.demoMode,
    demoPayload: SHOWCASE_STORAGE_GRAPH,
    refreshIntervalSeconds: config.refreshIntervalSeconds,
    reloadDisabled: !config.demoMode && (!azEnvReady || !hasRoot || storageEndpoint === undefined),
    onTeardown: leaveFocusMode,
  });

  const topPods = config.demoMode ? demoTopPods : applied.topPods;
  const mode = config.demoMode ? demoModeValue : applied.mode;
  const weight = config.demoMode ? demoWeight : applied.weight;

  const onQuery = useCallback(() => {
    if (!azEnvReady || !hasRoot) {
      return;
    }
    const range = time.range;
    commit(
      {
        query: controller.query,
        mode,
        weight,
        topPods,
        droppedPods: [],
      },
      range
    );
    time.persist(range);
    storage.onQuery(() =>
      storageEndpoint === undefined ? undefined : buildStorageGraphRequestUrl(storageEndpoint, range, controller.query)
    );
  }, [azEnvReady, commit, controller.query, hasRoot, mode, storage, storageEndpoint, time, topPods, weight]);

  const onLocateNode = useCallback(
    (id: string) => {
      void navigate(HOME_PATH, { state: { locate: id } });
    },
    [navigate]
  );
  const drawnOptions = useMemo(() => rootValueOptions(storage.state.elements), [storage.state.elements]);
  const candidates = useRootCandidates({
    labelValuesBase: config.demoMode ? undefined : config.endpoints.labelValues,
    kind: rootKind,
    namespaces: controller.query.namespace,
    drawn: drawnOptions,
  });

  const onTopPods = useCommitField('topPods', {
    applied,
    commit,
    fallbackRange: time.range,
    demoMode: config.demoMode,
    onDemo: setDemoTopPods,
  });
  const onModeChange = useCommitField('mode', {
    applied,
    commit,
    fallbackRange: time.range,
    demoMode: config.demoMode,
    onDemo: setDemoModeValue,
  });
  const onWeightChange = useCommitField('weight', {
    applied,
    commit,
    fallbackRange: time.range,
    demoMode: config.demoMode,
    onDemo: setDemoWeight,
  });

  // The roots the drawn payload was requested with — the APPLIED ones. The draft's roots
  // would re-gate the Top pods cut and root materialisation before Query.
  const drawnRoots = config.demoMode ? controller.query.roots : applied.query.roots;
  const projection = useSankeyProjection({
    elements: storage.state.elements,
    mode,
    weight,
    topPods,
    roots: drawnRoots,
  });
  const effectiveSvmDisplay: SankeySvmDisplay = projection.svmAvailable ? svmDisplay : 'column';

  return (
    <>
      {!focusMode && (
        <SankeyScopeBar
          options={identity}
          controller={controller}
          rootOptions={candidates.options}
          dirty={config.demoMode ? false : dirty}
          inFlight={storage.inFlight}
          onQuery={onQuery}
          onCancel={storage.cancel}
          topPods={topPods}
          onTopPods={onTopPods}
          hideQuery={config.demoMode}
          onRootKindChange={setRootKind}
          trailing={
            <SankeyViewControls
              mode={mode}
              onModeChange={onModeChange}
              weight={weight}
              onWeightChange={onWeightChange}
              podLayout={podLayout}
              onPodLayoutChange={setPodLayout}
              svmDisplay={effectiveSvmDisplay}
              onSvmDisplayChange={setSvmDisplay}
              svmAvailable={projection.svmAvailable}
              podCut={projection.podCut}
            />
          }
        />
      )}
      <main className="relative min-h-0 flex-1">
        <SankeyView
          elements={projection.elements}
          status={storage.state.status}
          error={storage.state.error}
          hasPayload={storage.state.hasPayload}
          cancelled={storage.state.cancelled}
          demoMode={config.demoMode}
          focusMode={focusMode}
          onFocusModeChange={setFocusMode}
          mode={mode}
          weight={weight}
          endpointConfigured={storageConfigured}
          azEnvReady={azEnvReady}
          hasRoot={hasRoot}
          roots={drawnRoots}
          onLocateNode={onLocateNode}
          podLayout={podLayout}
          svmDisplay={effectiveSvmDisplay}
        />
      </main>
    </>
  );
}
