import type cytoscape from 'cytoscape';
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';

import { EDGE_STYLE_BY_TYPE } from '../../shared/constants/colorByEdgeType';
import { EDGE_RELATION_TRANSPORT } from '../../shared/constants/edgeRelation';
import type { EdgeType, NodeKind, PodParentMode } from '../../shared/constants/types';
import { ancestorChain, buildParentIndex, collapsedAncestorChain } from '../../shared/graph/collapsedAncestors';
import { collectIngressNodeIds } from '../../shared/graph/collectIngressNodeIds';
import { themeColors } from '../../shared/theme/tokens';
import type { ResolvedTimeRange } from '../../shared/time/viewTimeRange';
import { Button } from '../../shared/ui/Button';
import { ChevronLeftIcon, ChevronRightIcon } from '../../shared/ui/icons';
import { subEyebrowClass } from '../../shared/ui/Section';
import { Segmented, type SegmentedOption } from '../../shared/ui/Segmented';
import { collectEdgeBearingNodeIds, computeVisibility, isFilterableKind } from '../element-filter';
import { EmptyState, GraphCanvas, LoadingOverlay, type GraphViewportApi, type LayoutName } from '../graph-canvas';
import { wrapNodeGroup, wrapSwitchFabric } from '../graph-data';
import { computeHits, resolveSearchHits, SearchBar, type SearchResult } from '../graph-search';
import {
  ApplicationLegend,
  ClusterLegend,
  EdgeLegend,
  edgeTypesForLegendRow,
  IngressToggle,
  LayoutModeControl,
  NamespaceLegend,
  NodeContainerLegend,
  NodeLegend,
  StatusLegend,
  type ApplicationLegendEntry,
  type ClusterLegendEntry,
  type NamespaceLegendEntry,
} from '../legend';
import {
  assembleDashboardParams,
  NodeDetailPanel,
  useNodeDashboardUrl,
  useNodeDetailUrls,
  type NodeDetailQueryInput,
} from '../node-detail';
import { applyPodParentMode } from '../pod-parent-mode';
import type { RuntimeConfig } from '../runtime-config';
import { useGraphTheme, useThemeTokens } from '../theme';

import { buildPinnedTooltip } from './buildPinnedTooltip';
import { deriveLegendEntries } from './deriveLegendEntries';
import { deriveContainers } from './deriveNodeContainers';
import { describeGraphOutcome } from './describeGraphOutcome';
import { ALL_EDGE_TYPES, ALL_KINDS } from './kinds';
import { locateOutcome } from './locateOutcome';
import { resolveSelectedNode } from './resolveSelectedNode';
import { useCollapseGroup } from './useCollapseGroup';

const LAYOUT_ALGORITHM_OPTIONS: ReadonlyArray<SegmentedOption<LayoutName>> = [
  { value: 'fcose', label: 'fCoSE', ariaLabel: 'fcose', title: 'Force-directed layout' },
  { value: 'dagre', label: 'Dagre', ariaLabel: 'dagre', title: 'Layered layout' },
];

export interface GraphViewProps {
  config: RuntimeConfig;
  elements: cytoscape.ElementDefinition[];
  errors: string[];
  error: string | undefined;
  hasPayload: boolean;
  status: 'idle' | 'loading' | 'ready' | 'error';
  viewTimeRange: ResolvedTimeRange;
  onAlertTimeClick: (timeSec: number) => void;
  locateNodeId?: string | null;
  onLocateConsumed?: () => void;
}

export function GraphView({
  config,
  elements: baseElements,
  errors,
  error,
  hasPayload,
  status,
  viewTimeRange,
  onAlertTimeClick,
  locateNodeId,
  onLocateConsumed,
}: Readonly<GraphViewProps>): JSX.Element {
  const stylesheet = useGraphTheme();
  const tokens = useThemeTokens();
  const [layout, setLayout] = useState<LayoutName>(config.defaultLayout);
  const [podParentMode, setPodParentMode] = useState<PodParentMode>('controller');
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [visibleKinds, setVisibleKinds] = useState<NodeKind[]>(ALL_KINDS);
  const [visibleEdgeTypes, setVisibleEdgeTypes] = useState<EdgeType[]>(ALL_EDGE_TYPES);
  const [showIngress, setShowIngress] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailRequest, setDetailRequest] = useState<{ nodeId: string; time: number } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [filterHiddenNotice, setFilterHiddenNotice] = useState<string | null>(null);
  const [missingNotice, setMissingNotice] = useState<string | null>(null);

  const viewportApiRef = useRef<GraphViewportApi | null>(null);
  const handleViewportApi = useCallback((api: GraphViewportApi | null) => {
    viewportApiRef.current = api;
  }, []);

  // No synthetic window resize on becoming visible again. The container's ResizeObserver
  // already fires when the shell un-hides this view (0×0 → real size), which is what makes
  // the canvas re-measure; announcing a WINDOW resize on top of it told useGraphResize the
  // environment had changed, and it answered with cy.fit() — discarding the pan and zoom
  // the user left behind when they switched to Sankey.

  const elements = useMemo(
    () => wrapNodeGroup(wrapSwitchFabric(applyPodParentMode(baseElements, podParentMode))),
    [baseElements, podParentMode]
  );

  const handleSelect = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    if (id === null) {
      setDetailRequest(null);
      setDetailOpen(false);
      return;
    }
    setDetailOpen(true);
    setDetailRequest((prev) =>
      prev !== null && prev.nodeId === id ? prev : { nodeId: id, time: Math.floor(Date.now() / 1000) }
    );
  }, []);

  const handleCanvasSelect = useCallback(
    (id: string | null) => {
      setSearchQuery((prev) => (prev.trim().length > 0 ? '' : prev));
      handleSelect(id);
    },
    [handleSelect]
  );

  const ingressNodeIds = useMemo(() => collectIngressNodeIds(baseElements), [baseElements]);
  // The orphan cascade's baseline. Derived from `baseElements` — the normalize-boundary
  // output — NOT from the transformed `elements`: `node` mode expresses `pod-to-node` as
  // nesting and drops those edges, so a DaemonSet / Job / CronJob pod would look
  // inherently isolated downstream and vanish. Upstream it is plainly connected, so the
  // cascade must keep it.
  const baselineEdgeNodeIds = useMemo(() => collectEdgeBearingNodeIds(baseElements), [baseElements]);
  const hasNetworkHop = useMemo(
    () =>
      ingressNodeIds.size > 0 ||
      baseElements.some(
        (el) => el.group === 'edges' && (el.data as cytoscape.EdgeDataDefinition).relation === EDGE_RELATION_TRANSPORT
      ),
    [ingressNodeIds, baseElements]
  );

  const visibility = useMemo(
    () => computeVisibility(elements, visibleKinds, visibleEdgeTypes, showIngress, ingressNodeIds, baselineEdgeNodeIds),
    [elements, visibleKinds, visibleEdgeTypes, showIngress, ingressNodeIds, baselineEdgeNodeIds]
  );
  const { visibleNodeIds } = visibility;
  const parentById = useMemo(() => buildParentIndex(elements), [elements]);

  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const el of elements) {
      if (el.group !== 'nodes') {
        continue;
      }
      const d = el.data as cytoscape.NodeDataDefinition;
      if (typeof d.id === 'string') {
        map.set(d.id, typeof d.label === 'string' ? d.label : d.id);
      }
    }
    return map;
  }, [elements]);

  const searchActive = searchQuery.trim().length > 0;
  const resolvedSearch = useMemo(() => {
    const computed = computeHits(elements, searchQuery);
    return resolveSearchHits(computed, parentById, collapsedIds, visibleNodeIds);
  }, [elements, searchQuery, parentById, collapsedIds, visibleNodeIds]);
  const searchFitNodeIds = useMemo(() => [...resolvedSearch.litNodeIds], [resolvedSearch.litNodeIds]);

  const handleLocate = useCallback(
    (result: SearchResult) => {
      if (result.filterHidden === true) {
        return;
      }
      const chain = collapsedAncestorChain(parentById, result.id, collapsedIds);
      if (chain.length > 0) {
        setCollapsedIds((prev) => {
          const next = new Set(prev);
          for (const id of chain) {
            next.delete(id);
          }
          return next;
        });
      }
      handleSelect(result.id);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          viewportApiRef.current?.fitToNeighborhood(result.id);
        });
      });
    },
    [parentById, collapsedIds, handleSelect]
  );

  const handleFitToIds = useCallback((ids: readonly string[]) => {
    viewportApiRef.current?.fitToIds(ids);
  }, []);

  useEffect(() => {
    if (locateNodeId === undefined || locateNodeId === null) {
      return;
    }
    const outcome = locateOutcome(locateNodeId, elements, visibleNodeIds);
    if (outcome === 'missing' && !hasPayload) {
      // No graph body has landed yet (first load still in flight, or the load failed).
      // "Not in the current graph result" would be a claim about a result that does not
      // exist. Leave the request pending — `elements` is a dep, so this re-runs on arrival.
      return;
    }
    if (outcome === 'missing') {
      setFilterHiddenNotice(null);
      setMissingNotice(locateNodeId);
      onLocateConsumed?.();
      return;
    }
    if (outcome === 'filter-hidden') {
      setMissingNotice(null);
      setFilterHiddenNotice(locateNodeId);
      onLocateConsumed?.();
      return;
    }
    // A locate supersedes any earlier rejection; without this the banner sticks around
    // forever (only Dismiss clears it), telling the user their successful locate was refused.
    setFilterHiddenNotice(null);
    setMissingNotice(null);
    // The query the user left in the box before switching views is still there, and its
    // fade would dim the very node this locate brought them here to see. Locating from the
    // in-view result list keeps its query on purpose — that click is a step inside a search.
    setSearchQuery('');
    const hit = { id: locateNodeId, label: locateNodeId } as SearchResult;
    handleLocate(hit);
    onLocateConsumed?.();
  }, [locateNodeId, handleLocate, onLocateConsumed, elements, visibleNodeIds, hasPayload]);

  const selectedNode = useMemo(
    () => resolveSelectedNode(elements, selectedNodeId, visibleNodeIds, collapsedIds),
    [elements, selectedNodeId, visibleNodeIds, collapsedIds]
  );
  const pinnedTooltip = useMemo(() => buildPinnedTooltip(selectedNode), [selectedNode]);

  const detailQueryInput = useMemo<NodeDetailQueryInput | undefined>(
    () =>
      detailRequest !== null &&
      selectedNode !== null &&
      detailRequest.nodeId === selectedNode.id &&
      selectedNode.application !== undefined &&
      selectedNode.queryTarget !== undefined
        ? {
            application: selectedNode.application,
            kind: selectedNode.queryTarget.kind,
            name: selectedNode.queryTarget.name,
            time: detailRequest.time,
          }
        : undefined,
    [detailRequest, selectedNode]
  );
  const detailLookups = useNodeDetailUrls(detailQueryInput, {
    ...(config.endpoints.configChanges !== undefined ? { configChanges: config.endpoints.configChanges } : {}),
    ...(config.endpoints.codeChanges !== undefined ? { codeChanges: config.endpoints.codeChanges } : {}),
  });
  const dashboardParams = useMemo(
    () => assembleDashboardParams(elements, selectedNodeId, viewTimeRange),
    [elements, selectedNodeId, viewTimeRange]
  );
  const dashboardLookup = useNodeDashboardUrl(dashboardParams, config.endpoints.dashboard);

  const clusterEntries = useMemo<ClusterLegendEntry[]>(() => {
    const byName = new Map<string, string>();
    for (const el of elements) {
      if (el.group !== 'nodes') {
        continue;
      }
      const d = el.data as cytoscape.NodeDataDefinition;
      if (d.isCluster === true && typeof d.cluster === 'string' && typeof d.clusterColor === 'string') {
        byName.set(d.cluster, d.clusterColor);
      }
    }
    return [...byName].map(([name, color]) => ({ name, color }));
  }, [elements]);

  const namespaceEntries = useMemo<NamespaceLegendEntry[]>(() => {
    const byName = new Map<string, string>();
    for (const el of elements) {
      if (el.group !== 'nodes') {
        continue;
      }
      const d = el.data as cytoscape.NodeDataDefinition;
      if (d.isNamespace === true && typeof d.namespace === 'string' && typeof d.namespaceColor === 'string') {
        byName.set(d.namespace, d.namespaceColor);
      }
    }
    return [...byName].map(([name, color]) => ({ name, color }));
  }, [elements]);

  const namespaceContainerIds = useMemo<string[]>(() => {
    const ids: string[] = [];
    for (const el of elements) {
      if (el.group !== 'nodes') {
        continue;
      }
      const d = el.data as cytoscape.NodeDataDefinition;
      if (d.isNamespace === true && typeof d.id === 'string') {
        ids.push(d.id);
      }
    }
    return ids;
  }, [elements]);

  const applicationEntries = useMemo<ApplicationLegendEntry[]>(() => {
    const byName = new Map<string, string>();
    for (const el of elements) {
      if (el.group !== 'nodes') {
        continue;
      }
      const d = el.data as cytoscape.NodeDataDefinition;
      if (d.isApplication === true && typeof d.application === 'string' && typeof d.applicationColor === 'string') {
        byName.set(d.application, d.applicationColor);
      }
    }
    return [...byName].map(([name, color]) => ({ name, color }));
  }, [elements]);

  const applicationContainerIds = useMemo<string[]>(() => {
    const ids: string[] = [];
    for (const el of elements) {
      if (el.group !== 'nodes') {
        continue;
      }
      const d = el.data as cytoscape.NodeDataDefinition;
      if (d.isApplication === true && typeof d.id === 'string') {
        ids.push(d.id);
      }
    }
    return ids;
  }, [elements]);

  const presentEdgeTypes = useMemo<EdgeType[]>(() => {
    const present = new Set<string>();
    for (const el of elements) {
      if (el.group !== 'edges') {
        continue;
      }
      const t = (el.data as cytoscape.EdgeDataDefinition).edgeType;
      if (typeof t === 'string') {
        present.add(t);
      }
    }
    return (Object.keys(EDGE_STYLE_BY_TYPE) as EdgeType[]).filter((t) => present.has(t));
  }, [elements]);

  const collapsedForEntryRef = useRef(false);
  useEffect(() => {
    if (podParentMode !== 'controller') {
      collapsedForEntryRef.current = false;
      return;
    }
    if (collapsedForEntryRef.current) {
      return;
    }
    // A pending locate arrives in the SAME first commit as this entry collapse (e.g. the
    // user opened the app on /sankey and clicked "locate in graph", so GraphView mounts
    // with locateNodeId already set). The locate effect runs first and finds nothing
    // collapsed to expand, so folding this node's ancestors afterwards would hide it again
    // — a silent no-op locate. Leave the target's ancestor chain expanded.
    const locateAncestors = typeof locateNodeId === 'string' ? new Set(ancestorChain(parentById, locateNodeId)) : null;
    const controllerIds = elements
      .filter((el) => el.group === 'nodes' && (el.data as cytoscape.NodeDataDefinition).isController === true)
      .map((el) => (el.data as cytoscape.NodeDataDefinition).id)
      .filter((id): id is string => typeof id === 'string')
      .filter((id) => locateAncestors === null || !locateAncestors.has(id));
    if (controllerIds.length === 0) {
      return;
    }
    collapsedForEntryRef.current = true;
    setCollapsedIds((prev) => new Set([...prev, ...controllerIds]));
  }, [podParentMode, elements, locateNodeId, parentById]);

  const {
    containerEntries,
    containerIds,
    title: containerTitle,
    collapseNoun,
  } = useMemo(
    () => deriveContainers(elements, themeColors(tokens).border.weak, podParentMode),
    [elements, tokens, podParentMode]
  );

  const nodeLegendEntries = useMemo(
    () => deriveLegendEntries(elements, collapsedIds, visibleKinds),
    [elements, collapsedIds, visibleKinds]
  );

  const handleToggleKind = useCallback((kind: string) => {
    if (!isFilterableKind(kind)) {
      return;
    }
    setVisibleKinds((prev) => {
      const hide = prev.includes(kind);
      return ALL_KINDS.filter((k) => (k === kind ? !hide : prev.includes(k)));
    });
  }, []);

  const hiddenEdgeRowKeys = useMemo(() => {
    const visible = new Set(visibleEdgeTypes);
    const hidden = new Set<string>();
    for (const edgeType of presentEdgeTypes) {
      const rowKey =
        edgeType === 'pod-calls-service' || edgeType === 'service-selects-pod'
          ? 'pod-calls-pod'
          : edgeType === 'node-to-switch'
            ? 'switch-to-switch'
            : edgeType;
      const group = edgeTypesForLegendRow(rowKey);
      if (group.some((t) => !visible.has(t))) {
        hidden.add(rowKey);
      }
    }
    return hidden;
  }, [presentEdgeTypes, visibleEdgeTypes]);

  const handleToggleEdgeRow = useCallback((rowKey: string) => {
    const group = edgeTypesForLegendRow(rowKey);
    setVisibleEdgeTypes((prev) => {
      const hiding = group.some((t) => prev.includes(t));
      if (hiding) {
        return prev.filter((t) => !group.includes(t));
      }
      const next = new Set(prev);
      for (const t of group) {
        next.add(t);
      }
      return ALL_EDGE_TYPES.filter((t) => next.has(t));
    });
  }, []);

  const clusterContainerIds = useMemo<string[]>(() => {
    const ids: string[] = [];
    for (const el of elements) {
      if (el.group !== 'nodes') {
        continue;
      }
      const d = el.data as cytoscape.NodeDataDefinition;
      if (d.isCluster === true && typeof d.id === 'string') {
        ids.push(d.id);
      }
    }
    return ids;
  }, [elements]);

  const { allCollapsed: allClustersCollapsed, toggle: toggleClusters } = useCollapseGroup(
    clusterContainerIds,
    collapsedIds,
    setCollapsedIds
  );
  const { allCollapsed: allNodesCollapsed, toggle: toggleNodes } = useCollapseGroup(
    containerIds,
    collapsedIds,
    setCollapsedIds
  );
  const { allCollapsed: allNamespacesCollapsed, toggle: toggleNamespaces } = useCollapseGroup(
    namespaceContainerIds,
    collapsedIds,
    setCollapsedIds
  );
  const { allCollapsed: allApplicationsCollapsed, toggle: toggleApplications } = useCollapseGroup(
    applicationContainerIds,
    collapsedIds,
    setCollapsedIds
  );

  const firstError = error ?? errors[0];
  const allTogglableKindsHidden =
    nodeLegendEntries.some((e) => e.togglable) && nodeLegendEntries.every((e) => !e.togglable || e.hidden);
  const outcome = describeGraphOutcome({
    status,
    hasPayload,
    firstError,
    elementCount: elements.length,
    visibleNodeCount: visibleNodeIds.size,
    allTogglableKindsHidden,
  });
  const emptyMessage = outcome.kind === 'empty' || outcome.kind === 'filtered' ? outcome.message : null;

  if (outcome.kind === 'loading') {
    return <LoadingOverlay />;
  }
  if (outcome.kind === 'failed') {
    return (
      <div className="flex h-full items-center justify-center p-6" role="alert" data-testid="graph-request-failed">
        <div className="max-w-md rounded-lg border border-hairline bg-surface px-5 py-4 text-center text-[13px] leading-relaxed text-primary shadow-panel">
          {outcome.message}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full" data-testid="graph-view">
      {!legendCollapsed && (
        <aside className="ksg-scroll w-[240px] shrink-0 overflow-y-auto border-r border-hairline bg-rail text-primary shadow-rail">
          <LayoutModeControl
            mode={podParentMode}
            onChange={setPodParentMode}
            action={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Collapse legend"
                title="Collapse legend"
                data-testid="legend-collapse"
                onClick={() => setLegendCollapsed(true)}
              >
                <ChevronLeftIcon size={14} />
              </Button>
            }
          >
            <div className="flex items-center gap-2">
              <span className={`${subEyebrowClass} w-14 shrink-0`}>Engine</span>
              <Segmented
                name="layout-algorithm"
                aria-label="Layout algorithm"
                value={layout}
                options={LAYOUT_ALGORITHM_OPTIONS}
                onChange={setLayout}
                className="min-w-0 flex-1"
              />
            </div>
          </LayoutModeControl>
          <NodeLegend entries={nodeLegendEntries} onToggleKind={handleToggleKind} />
          {ingressNodeIds.size > 0 && (
            <IngressToggle visible={showIngress} onToggle={() => setShowIngress((v) => !v)} />
          )}
          <EdgeLegend
            edgeTypes={presentEdgeTypes}
            hasNetworkHop={hasNetworkHop}
            hiddenTypes={hiddenEdgeRowKeys}
            onToggleType={handleToggleEdgeRow}
          />
          <StatusLegend />
          <ClusterLegend
            clusters={clusterEntries}
            onToggleCollapseAll={toggleClusters}
            allCollapsed={allClustersCollapsed}
          />
          {podParentMode === 'controller' && (
            <NamespaceLegend
              namespaces={namespaceEntries}
              onToggleCollapseAll={toggleNamespaces}
              allCollapsed={allNamespacesCollapsed}
            />
          )}
          {podParentMode === 'controller' && (
            <ApplicationLegend
              applications={applicationEntries}
              onToggleCollapseAll={toggleApplications}
              allCollapsed={allApplicationsCollapsed}
            />
          )}
          <NodeContainerLegend
            nodes={containerEntries}
            onToggleCollapseAll={toggleNodes}
            allCollapsed={allNodesCollapsed}
            title={containerTitle}
            collapseNoun={collapseNoun}
          />
        </aside>
      )}
      <div className="relative min-w-0 flex-1">
        {legendCollapsed && (
          <Button
            size="icon"
            aria-label="Show legend"
            title="Show legend"
            data-testid="legend-expand"
            className="absolute left-2 top-2 z-[1000] shadow-panel"
            onClick={() => setLegendCollapsed(false)}
          >
            <ChevronRightIcon size={14} />
          </Button>
        )}
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          results={resolvedSearch.results}
          fitNodeIds={searchFitNodeIds}
          labelById={labelById}
          onLocate={handleLocate}
          onFitToIds={handleFitToIds}
        />
        {hasPayload && errors.length > 0 && (
          <div className="pointer-events-none absolute left-2 right-[380px] top-2 z-[3] flex">
            <span className="truncate rounded-md border border-[color-mix(in_srgb,var(--ksg-status-warning)_45%,transparent)] bg-overlay px-2.5 py-1.5 text-[11px] text-primary shadow-panel backdrop-blur-sm">
              Some graph entries were skipped: <span className="font-mono text-secondary">{errors[0]}</span>
            </span>
          </div>
        )}
        {filterHiddenNotice !== null && (
          <div
            className="absolute left-2 top-11 z-[4] flex max-w-md items-center gap-3 rounded-md border border-hairline bg-overlay px-3 py-2 text-[12px] text-primary shadow-panel backdrop-blur-sm"
            data-testid="locate-filter-hidden"
            role="status"
          >
            Node is hidden by the current filters and was not selected.
            <Button variant="ghost" size="sm" className="-mr-1 ml-auto" onClick={() => setFilterHiddenNotice(null)}>
              Dismiss
            </Button>
          </div>
        )}
        {missingNotice !== null && (
          <div
            className="absolute left-2 right-[380px] top-8 z-[4] rounded border border-medium bg-surface px-2 py-1 text-sm text-primary"
            data-testid="locate-missing"
            role="status"
          >
            Node is not in the current graph result. Filters or Projection may differ; they were not changed.
            <button type="button" className="ml-2 underline" onClick={() => setMissingNotice(null)}>
              Dismiss
            </button>
          </div>
        )}
        {emptyMessage !== null && (
          <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center">
            <EmptyState message={emptyMessage} />
          </div>
        )}
        <GraphCanvas
          elements={elements}
          stylesheet={stylesheet}
          layout={layout}
          visibility={visibility}
          onSelect={handleCanvasSelect}
          selectedId={selectedNodeId}
          collapsedIds={collapsedIds}
          onCollapsedChange={setCollapsedIds}
          podParentMode={podParentMode}
          pinned={pinnedTooltip}
          searchActive={searchActive}
          searchLitNodeIds={resolvedSearch.litNodeIds}
          onViewportApi={handleViewportApi}
        />
        <NodeDetailPanel
          node={detailOpen ? selectedNode : null}
          onClose={() => setDetailOpen(false)}
          onAlertTimeClick={onAlertTimeClick}
          lookups={detailLookups}
          dashboard={dashboardLookup}
        />
      </div>
    </div>
  );
}
