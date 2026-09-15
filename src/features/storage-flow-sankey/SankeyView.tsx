import type cytoscape from 'cytoscape';
import { useCallback, useMemo, useState, type JSX, type MouseEvent } from 'react';

import { countWord } from '../../shared/format/countWord';
import { formatBytes, formatUsage } from '../../shared/format/measurements';
import { eyebrowClass } from '../../shared/ui/Section';
import { Segmented, type SegmentedOption } from '../../shared/ui/Segmented';
import { EMPTY_STORAGE_GRAPH_ROOTS, hasAnyRoot, type StorageGraphRoots } from '../graph-data';
import {
  loadGateScreen,
  SankeyControlBar,
  SankeySearchOverlay,
  SankeyTooltip,
  StatusLegend,
  useSankeyStage,
  nodeTooltipRows,
  rawReading,
  shellEmptyKind,
  Swatch,
  type HoverLit,
  type LoadStatus,
  type ShellEmptyKind,
  type TooltipLine,
} from '../sankey-canvas';
import { useThemeTokens } from '../theme';

import {
  DERIVED_TIER_LABEL,
  deriveSankey,
  formatBytesPerSec,
  isDerivedTier,
  resolveClaimAggregates,
  type SankeyMode,
  type SankeyNode,
  type SankeySvmDisplay,
} from './deriveSankey';
import { layoutSankey, TIER_LABEL, type LayoutLink, type SankeyPodLayout } from './layoutSankey';
import { SankeyChart } from './SankeyChart';
import { sankeyCardRects, sankeyPathLit, sankeySearchRecords } from './sankeySearch';
import {
  SankeySummary,
  type ApplicationSubtotalRow,
  type NamespaceSubtotalRow,
  type NodeSummaryRow,
} from './SankeySummary';
import { DEFAULT_TOP_PODS } from './sankeyUrlScope';
import { cutTopPods } from './topPods';

const MODE_OPTIONS: ReadonlyArray<SegmentedOption<SankeyMode>> = [
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'both', label: 'Both' },
];

const LAYOUT_OPTIONS: ReadonlyArray<SegmentedOption<SankeyPodLayout>> = [
  { value: 'flat', label: 'Flat' },
  { value: 'node', label: 'Node' },
];

const SVM_UNAVAILABLE_REASON = 'The backend reports no claim aggregates';

const svmOptions = (available: boolean): ReadonlyArray<SegmentedOption<SankeySvmDisplay>> => [
  { value: 'column', label: 'Column' },
  {
    value: 'group',
    label: 'Group',
    disabled: !available,
    ...(available ? {} : { title: SVM_UNAVAILABLE_REASON }),
  },
];

export interface SankeyViewProps {
  elements: cytoscape.ElementDefinition[];
  status: LoadStatus;
  error: string | undefined;
  hasPayload: boolean;
  demoMode: boolean;
  focusMode: boolean;
  onFocusModeChange: (next: boolean) => void;
  mode?: SankeyMode;
  onModeChange?: (mode: SankeyMode) => void;
  /** `endpoints.storageGraph` is configured (or demo mode supplies a fixture). */
  endpointConfigured: boolean;
  /** Both halves of the required estate are chosen. */
  azEnvReady: boolean;
  /** At least one root is present in the current (draft or applied) scope. */
  hasRoot?: boolean;
  cancelled?: boolean;
  topPods?: number;
  /**
   * The root selection the current payload was requested with. Only used to keep a
   * materialised root drawn when its whole path came back unmeasured — the wire carries
   * no root marker, so the request is the only thing that knows.
   */
  roots?: StorageGraphRoots;
  onLocateNode: (id: string) => void;
  /** Page-transient. Omitted = local default `flat`, reset on remount. */
  podLayout?: SankeyPodLayout;
  onPodLayoutChange?: (next: SankeyPodLayout) => void;
  /** Page-transient. Omitted = local default `column`, reset on remount. */
  svmDisplay?: SankeySvmDisplay;
  onSvmDisplayChange?: (next: SankeySvmDisplay) => void;
}

type SankeyEmptyKind = ShellEmptyKind | 'mode' | 'response';

function emptyCopy(kind: SankeyEmptyKind, demoMode: boolean, mode: SankeyMode): { testId: string; text: string } {
  switch (kind) {
    case 'unconfigured':
      return {
        testId: 'sankey-empty-unconfigured',
        text: 'Storage graph endpoint is not configured. Graph view is unaffected.',
      };
    case 'scope':
      return {
        testId: 'sankey-empty-scope',
        text: 'Select one az, one env and at least one root. No request has been sent yet.',
      };
    case 'awaiting':
      return {
        testId: 'sankey-empty-awaiting',
        text: 'Nothing has been requested yet. Press Query to load storage flow for the current scope and time range.',
      };
    case 'cancelled':
      return {
        testId: 'sankey-empty-cancelled',
        text: 'The request was cancelled. Press Query to load storage flow.',
      };
    case 'response':
      return {
        testId: 'sankey-empty-response',
        text: `No storage flow for this estimate and root in the current time range. The root name may not exist, this estate may have no NetApp-backed claims, or the window may be outside retention.${demoMode ? ' Currently showing demo fixture data.' : ''}`,
      };
    default:
      return {
        testId: 'sankey-empty-mode',
        text:
          mode === 'read'
            ? 'Read direction has no measurements. Switch to Write or Both.'
            : mode === 'write'
              ? 'Write direction has no measurements. Switch to Read or Both.'
              : 'The current direction has no measurements. Switch to Read, Write, or Both.',
      };
  }
}

/** Node tooltip lines for a storage-graph node, in the shared row order (see `nodeTooltipRows`). */
function nodeTooltip(
  node: SankeyNode | undefined,
  id: string,
  flowLines: readonly string[],
  claimAggregateLabel: string | undefined
): TooltipLine[] {
  if (node === undefined) {
    return [id, ...flowLines];
  }
  const isNetapp = node.kind === 'netapp-node' || node.kind === 'netapp-aggr' || node.kind === 'netapp-svm';
  const usage =
    node.kind === 'pvc' || node.kind === 'netapp-aggr'
      ? formatUsage(node.usage?.usedBytes, node.usage?.capacityBytes)
      : undefined;
  return nodeTooltipRows({
    head: `${node.kind} / ${node.label}`,
    ...((node.kind === 'pod' || node.kind === 'pvc') && node.namespace !== undefined
      ? { namespace: node.namespace }
      : {}),
    ...(isNetapp && node.ontapCluster !== undefined ? { ontapCluster: node.ontapCluster } : {}),
    identity: [
      ...(node.kind === 'pvc' && node.svm !== undefined ? [`SVM ${node.svm}`] : []),
      ...(node.kind === 'pvc' && claimAggregateLabel !== undefined ? [`aggregate ${claimAggregateLabel}`] : []),
    ],
    flow: flowLines,
    ...(usage !== undefined ? { usage } : {}),
    // `status` is the backend's fold; `health` is one of the three signals it folded. Both
    // are shown because they answer different questions — a NetApp node can be
    // `health online` and still `status critical` off a firing alert.
    ...(node.status !== undefined ? { status: node.status } : {}),
    ...(node.health !== undefined ? { health: node.health } : {}),
    ...(node.hardware?.model !== undefined ? { model: node.hardware.model } : {}),
    perf: [
      ...rawReading('cpu_busy_pct', node.perf?.cpuBusyPct, String),
      ...rawReading('total_ops', node.perf?.totalOps, String),
      ...rawReading('total_latency_us', node.perf?.totalLatencyUs, String),
      ...rawReading('total_bytes_per_sec', node.perf?.totalBytesPerSec, formatBytes),
    ],
    // `severity` is optional (a rule may declare none), so the prefix has to drop with it
    // rather than render the string "undefined" in front of the alert name.
    alerts: (node.alerts ?? []).map((alert) =>
      alert.severity === undefined ? alert.name : `${alert.severity} ${alert.name}`
    ),
    trailer: node.noFlow === true ? ['Selected root with no flow in this time range.'] : [],
  });
}

function derivedCardTooltip(node: SankeyNode, flowLines: readonly string[]): TooltipLine[] {
  return nodeTooltipRows({
    head: `${node.kind} / ${node.label}`,
    ...(node.kind === 'application' && node.namespace !== undefined ? { namespace: node.namespace } : {}),
    identity: node.memberPodCount !== undefined ? [countWord(node.memberPodCount, 'pod')] : [],
    // Derived cards carry no status: they are synthesised columns.
    flow: flowLines.map((line) => `${line} (derived from member pods)`),
    trailer: node.noFlow === true ? ['Selected root with no flow in this time range.'] : [],
  });
}

/** A Kubernetes node wrapper's title-row tooltip under the `Node` pod layout: its pod count,
 *  the members' flow, and the status the backend folded over the node and its pods. */
function wrapperTooltip(
  label: string,
  podCount: number,
  flowLines: readonly string[],
  status: string | undefined,
  noFlow: boolean
): TooltipLine[] {
  return nodeTooltipRows({
    head: `node / ${label}`,
    identity: [countWord(podCount, 'pod')],
    flow: flowLines.map((line) => `${line} (derived from member pods)`),
    ...(status !== undefined ? { status: `${status} (worst of node and member pods)` } : {}),
    trailer: noFlow ? ['Selected root with no flow in this time range.'] : [],
  });
}

/** An SVM frame's title-row tooltip under the SVM display's `Group` — shaped like a
 *  wrapper's, but for its PVCs; the backend judges no status for an SVM. */
function frameTooltip(
  label: string,
  ontapCluster: string | undefined,
  pvcCount: number,
  flowLines: readonly string[],
  noFlow: boolean
): TooltipLine[] {
  return nodeTooltipRows({
    head: `netapp-svm / ${label}`,
    ...(ontapCluster !== undefined ? { ontapCluster } : {}),
    identity: [countWord(pvcCount, 'PVC')],
    flow: flowLines.map((line) => `${line} (derived from member PVCs)`),
    trailer: noFlow ? ['Selected root with no flow in this time range.'] : [],
  });
}

export function SankeyView({
  elements,
  status,
  error,
  hasPayload,
  demoMode,
  focusMode,
  onFocusModeChange,
  mode: modeProp,
  onModeChange,
  endpointConfigured,
  azEnvReady,
  hasRoot,
  cancelled = false,
  topPods = DEFAULT_TOP_PODS,
  roots = EMPTY_STORAGE_GRAPH_ROOTS,
  onLocateNode,
  podLayout: podLayoutProp,
  onPodLayoutChange,
  svmDisplay: svmDisplayProp,
  onSvmDisplayChange,
}: Readonly<SankeyViewProps>): JSX.Element {
  const tokens = useThemeTokens();
  const [localMode, setLocalMode] = useState<SankeyMode>(modeProp ?? 'both');
  const mode = modeProp ?? localMode;
  const setMode = (next: SankeyMode): void => {
    if (modeProp === undefined) {
      setLocalMode(next);
    }
    onModeChange?.(next);
  };
  const [localPodLayout, setLocalPodLayout] = useState<SankeyPodLayout>(podLayoutProp ?? 'flat');
  const podLayout = podLayoutProp ?? localPodLayout;
  const setPodLayout = (next: SankeyPodLayout): void => {
    if (podLayoutProp === undefined) {
      setLocalPodLayout(next);
    }
    onPodLayoutChange?.(next);
  };
  const [localSvmDisplay, setLocalSvmDisplay] = useState<SankeySvmDisplay>(svmDisplayProp ?? 'column');
  const svmDisplay = svmDisplayProp ?? localSvmDisplay;
  const setSvmDisplay = (next: SankeySvmDisplay): void => {
    if (svmDisplayProp === undefined) {
      setLocalSvmDisplay(next);
    }
    onSvmDisplayChange?.(next);
  };
  // `cluster` / `namespace` narrowing is a REQUEST parameter, owned by the scope bar — the
  // projection arrives already scoped. Re-filtering it here would break the backend's
  // weight conservation, which is why this view has no cluster selector of its own.
  const podRootPresent = roots.pod.length > 0;
  const cut = useMemo(
    () => (podRootPresent ? { elements, shown: 0, total: 0 } : cutTopPods(elements, mode, topPods)),
    [elements, mode, podRootPresent, topPods]
  );
  // `Group` needs the backend's `expose-claim-aggregate`: available only when the body has
  // at least one svm-pvc-fed pvc that names a claim aggregate. Checked directly off the
  // elements (not off a `group`-derived graph) so an unavailable choice never has to be
  // derived once to find out it draws frames with no inbound ribbon.
  const svmAvailable = useMemo(() => {
    const claimAggregates = resolveClaimAggregates(cut.elements);
    let hasSvmPvc = false;
    for (const el of cut.elements) {
      if (el.group !== 'edges') {
        continue;
      }
      const d = el.data as cytoscape.EdgeDataDefinition;
      if (d.edgeType !== 'storage-flow' || d.labels?.tier !== 'svm-pvc') {
        continue;
      }
      hasSvmPvc = true;
      if (typeof d.target === 'string' && claimAggregates.has(d.target)) {
        return true;
      }
    }
    return !hasSvmPvc;
  }, [cut.elements]);
  const effectiveSvmDisplay: SankeySvmDisplay = svmAvailable ? svmDisplay : 'column';
  const graph = useMemo(
    () => deriveSankey(cut.elements, mode, roots, effectiveSvmDisplay),
    [cut.elements, mode, roots, effectiveSvmDisplay]
  );
  const scopeComplete = azEnvReady && (hasRoot ?? hasAnyRoot(roots));
  // Layout depends only on the derived graph and the theme's namespace palette — never on
  // container size or the pan/zoom viewport, so a resize or a drag can never re-run it
  // (see storage-flow-sankey "尺寸與容器 resize" / "圖區的縮放與平移").
  const namespacePalette = useMemo(
    () => [
      tokens.sankey.namespace1,
      tokens.sankey.namespace2,
      tokens.sankey.namespace3,
      tokens.sankey.namespace4,
      tokens.sankey.namespace5,
    ],
    [tokens]
  );
  const layout = useMemo(
    () => layoutSankey(graph, namespacePalette, podLayout, effectiveSvmDisplay),
    [graph, namespacePalette, podLayout, effectiveSvmDisplay]
  );

  const content = useMemo(() => ({ w: layout.width, h: layout.height }), [layout.width, layout.height]);
  const hoverLit = useCallback((id: string): HoverLit => sankeyPathLit(graph, [id]), [graph]);
  const searchRecords = useMemo(() => sankeySearchRecords(graph, layout), [graph, layout]);
  const cardRects = useMemo(() => sankeyCardRects(layout), [layout]);
  // A gone hovered card would leave the tooltip describing it and `lit` fading everything
  // against zero surviving links; the stage clears the hover when this says the card left.
  // Answered off the LAYOUT, not the derived graph: a wrapper the graph still carries is
  // no card once the pod layout stops drawing it.
  const hasCard = useCallback((id: string) => cardRects.has(id), [cardRects]);
  const searchPathLit = useCallback((ids: ReadonlySet<string>) => sankeyPathLit(graph, ids), [graph]);
  const { boxRef, zoom, tooltip, handleKeyDown, setHoverId, search, lit } = useSankeyStage({
    status,
    hasPayload,
    content,
    hasContent: layout.nodes.length > 0,
    focusMode,
    onFocusModeChange,
    hasCard,
    hoverLit,
    records: searchRecords,
    rects: cardRects,
    pathLit: searchPathLit,
  });
  const setTip = tooltip.show;
  const hideTip = tooltip.hide;

  const summary = useMemo(() => {
    const inbound = new Map<string, number>();
    const outbound = new Map<string, number>();
    for (const l of graph.links) {
      inbound.set(l.target, (inbound.get(l.target) ?? 0) + l.value);
      outbound.set(l.source, (outbound.get(l.source) ?? 0) + l.value);
    }
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const nodes: NodeSummaryRow[] = [
      ...layout.nodes.map((ln) => {
        const gn = byId.get(ln.id);
        const used = gn?.usage?.usedBytes;
        const capacity = gn?.usage?.capacityBytes;
        const usageText = used !== undefined && capacity !== undefined ? formatUsage(used, capacity) : undefined;
        return {
          id: ln.id,
          tier: TIER_LABEL[ln.kind],
          label: ln.label,
          inbound: inbound.get(ln.id) ?? 0,
          outbound: outbound.get(ln.id) ?? 0,
          ...(usageText !== undefined ? { usage: usageText } : {}),
          ...(ln.status !== undefined ? { status: ln.status } : {}),
          ...(gn?.health !== undefined ? { health: gn.health } : {}),
          ...(ln.derived === true || gn?.derived === true ? { derived: true } : {}),
        };
      }),
      ...layout.wrappers.map((w) => ({
        id: w.id,
        tier: w.kind === 'netapp-svm' ? TIER_LABEL['netapp-svm'] : 'Node',
        label: w.label,
        inbound: w.memberIds.reduce((sum, id) => sum + (inbound.get(id) ?? 0), 0),
        outbound: w.memberIds.reduce((sum, id) => sum + (outbound.get(id) ?? 0), 0),
        ...(w.status !== undefined ? { status: w.status } : {}),
        derived: true,
      })),
    ];
    const nsAgg = new Map<string, { count: number; total: number }>();
    for (const n of graph.nodes) {
      if (n.kind !== 'pod' || n.namespace === undefined) {
        continue;
      }
      const cur = nsAgg.get(n.namespace) ?? { count: 0, total: 0 };
      cur.count += 1;
      // The pod's INBOUND `pvc-pod` weight, never its outbound. A pod's only outbound links
      // are the derived `pod → application` / `pod → namespace` ones, which exist solely when
      // the body carries a matching compound ancestor — a pod that carries a `namespace`
      // LABEL but sits under no namespace compound would silently subtotal to 0 B/s while
      // its ribbons are drawn at full weight.
      cur.total += inbound.get(n.id) ?? 0;
      nsAgg.set(n.namespace, cur);
    }
    const namespaces: NamespaceSubtotalRow[] = [...nsAgg.entries()]
      .map(([namespace, v]) => ({ namespace, podCount: v.count, total: v.total }))
      .sort((a, b) => b.total - a.total || a.namespace.localeCompare(b.namespace));
    const applications: ApplicationSubtotalRow[] = graph.nodes
      .filter((n) => n.kind === 'application')
      .map((n) => ({
        application: n.label,
        namespace: n.namespace ?? '',
        podCount: n.memberPodCount ?? 0,
        total: inbound.get(n.id) ?? 0,
      }))
      .sort((a, b) => b.total - a.total || a.application.localeCompare(b.application));
    return { nodes, namespaces, applications };
  }, [graph, layout]);

  const gate = loadGateScreen({ status, hasPayload, error });
  if (gate !== null) {
    return gate;
  }

  // Six causes, six sentences. They are not interchangeable: an unfinished selection that
  // reads as "no storage flow" makes a working pipeline look broken, and vice versa. The
  // four shell-level causes are decided by `shellEmptyKind`, shared with the trace view.
  const emptyKind: SankeyEmptyKind | null = (() => {
    const shell = shellEmptyKind({
      demoMode,
      endpointConfigured,
      scopeReady: scopeComplete,
      status,
      hasPayload,
      cancelled,
    });
    if (shell !== null) {
      return shell;
    }
    if (graph.links.length === 0 && graph.hasStorageFlowEdges && !graph.hasCurrentDirectionMeasurement) {
      return 'mode';
    }
    if (graph.nodes.length === 0 && !(podLayout === 'node' && graph.k8sNodes.length > 0)) {
      return 'response';
    }
    return null;
  })();
  const empty = emptyKind === null ? null : emptyCopy(emptyKind, demoMode, mode);
  const chartReady = emptyKind === null;

  const onNodeEnter = (id: string, evt: MouseEvent): void => {
    if (zoom.dragging) {
      return;
    }
    setHoverId(id);
    const wrapper = graph.k8sNodes.find((n) => n.id === id);
    const frame = graph.svmFrames.find((f) => f.id === id);
    const node = graph.nodes.find((g) => g.id === id);
    const members =
      wrapper !== undefined ? new Set(wrapper.podIds) : frame !== undefined ? new Set(frame.pvcIds) : null;
    const inboundLinks =
      members !== null ? graph.links.filter((l) => members.has(l.target)) : graph.links.filter((l) => l.target === id);
    const outboundLinks =
      members !== null ? graph.links.filter((l) => members.has(l.source)) : graph.links.filter((l) => l.source === id);
    const sum = (list: typeof inboundLinks, dir?: 'read' | 'write'): number =>
      list.filter((l) => dir === undefined || l.direction === dir).reduce((acc, l) => acc + l.value, 0);
    const flowLines =
      mode === 'both'
        ? [
            `in read ${formatBytesPerSec(sum(inboundLinks, 'read'))}`,
            `in write ${formatBytesPerSec(sum(inboundLinks, 'write'))}`,
            `out read ${formatBytesPerSec(sum(outboundLinks, 'read'))}`,
            `out write ${formatBytesPerSec(sum(outboundLinks, 'write'))}`,
          ]
        : [`in ${formatBytesPerSec(sum(inboundLinks))}`, `out ${formatBytesPerSec(sum(outboundLinks))}`];
    if (wrapper !== undefined) {
      setTip(
        evt.clientX,
        evt.clientY,
        wrapperTooltip(wrapper.label, wrapper.podIds.length, flowLines, wrapper.status, wrapper.noFlow === true)
      );
      return;
    }
    if (frame !== undefined) {
      setTip(
        evt.clientX,
        evt.clientY,
        frameTooltip(frame.label, frame.ontapCluster, frame.pvcIds.length, flowLines, frame.noFlow === true)
      );
      return;
    }
    if (node?.kind === 'application' || node?.kind === 'namespace') {
      setTip(evt.clientX, evt.clientY, derivedCardTooltip(node, flowLines));
      return;
    }
    const claimAggregateLabel =
      node?.claimAggregateId !== undefined ? graph.nodes.find((n) => n.id === node.claimAggregateId)?.label : undefined;
    setTip(evt.clientX, evt.clientY, nodeTooltip(node, id, flowLines, claimAggregateLabel));
  };

  const onLinkEnter = (link: LayoutLink, evt: MouseEvent): void => {
    if (zoom.dragging) {
      return;
    }
    const src = graph.nodes.find((g) => g.id === link.source);
    const dst = graph.nodes.find((g) => g.id === link.target);
    const derived = link.derived === true || isDerivedTier(link.tier);
    const ceilingTier = link.tier === 'svm-pvc';
    const lines = derived
      ? [
          `${src?.label ?? link.source} → ${dst?.label ?? link.target}`,
          isDerivedTier(link.tier) ? DERIVED_TIER_LABEL[link.tier] : `tier ${link.tier}`,
          `${link.direction}: ${formatBytesPerSec(link.value)}`,
          'derived from member pods',
        ]
      : [
          `${src?.label ?? link.source} → ${dst?.label ?? link.target}`,
          `tier ${link.tier}`,
          // Under `Group` the ribbon runs straight from the claim aggregate, so this is
          // the only place left naming the SVM the claim belongs to.
          ...(link.tier === 'svm-pvc' && dst?.svm !== undefined ? [`SVM ${dst.svm}`] : []),
          `${link.direction}: ${formatBytesPerSec(link.value)}`,
          // The backend flags a weight it split evenly rather than measured. Saying so is the
          // difference between a reading and an estimate that happens to be a number.
          ...(link.attribution === 'split' ? ['evenly split estimate'] : []),
          // A QoS policy group hangs off the volume, so a ceiling is only meaningful on the
          // svm→pvc hop; showing it on an aggregate hop would attribute it to the wrong thing.
          ...(ceilingTier && link.maxBytesPerSec !== undefined
            ? [`QoS ceiling ${formatBytesPerSec(link.maxBytesPerSec)}`]
            : []),
          ...(ceilingTier && link.maxIops !== undefined ? [`QoS ceiling ${String(link.maxIops)} IOPS`] : []),
          ...(ceilingTier && link.direction === 'read' && link.readLatencyUs !== undefined
            ? [`latency ${String(link.readLatencyUs)} µs`]
            : []),
          ...(ceilingTier && link.direction === 'write' && link.writeLatencyUs !== undefined
            ? [`latency ${String(link.writeLatencyUs)} µs`]
            : []),
        ];
    setTip(evt.clientX, evt.clientY, lines);
  };

  return (
    <div className="flex h-full w-full flex-col bg-canvas text-primary" data-testid="sankey-view">
      {!focusMode && (
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-hairline bg-rail px-3">
          <span className={eyebrowClass}>Storage flow</span>
          <Segmented
            name="sankey-mode"
            aria-label="Sankey mode"
            value={mode}
            options={MODE_OPTIONS}
            onChange={setMode}
          />
          <span className={eyebrowClass}>Layout</span>
          <Segmented
            name="sankey-layout"
            aria-label="Layout"
            value={podLayout}
            options={LAYOUT_OPTIONS}
            onChange={setPodLayout}
            data-testid="sankey-layout"
          />
          <span className={eyebrowClass}>SVM</span>
          <Segmented
            name="sankey-svm-display"
            aria-label="SVM"
            value={effectiveSvmDisplay}
            options={svmOptions(svmAvailable)}
            onChange={setSvmDisplay}
            data-testid="sankey-svm-display"
          />
          {!svmAvailable && (
            <span className="text-[11px] text-secondary" data-testid="sankey-svm-display-reason">
              {SVM_UNAVAILABLE_REASON}
            </span>
          )}
          {cut.shown < cut.total && (
            <span className="text-[11px] text-secondary" data-testid="sankey-top-pods-label">
              Top {cut.shown} pods
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <StatusLegend />
            <span aria-hidden className="h-4 border-l border-medium" />
            {(mode === 'both' || mode === 'read') && (
              <span className="flex items-center gap-1.5 text-[11px] text-secondary">
                <Swatch color={tokens.sankey.read} />
                read
              </span>
            )}
            {(mode === 'both' || mode === 'write') && (
              <span className="flex items-center gap-1.5 text-[11px] text-secondary">
                <Swatch color={tokens.sankey.write} dashed />
                write
              </span>
            )}
          </div>
        </div>
      )}

      {/* The chart keeps a floor. Six tiers make the summary tall enough to take the whole
          column otherwise, and a zero-height chart host renders its nodes outside the SVG. */}
      <div className="relative flex min-h-[220px] flex-1 flex-col" ref={boxRef}>
        {empty !== null && (
          <div
            className="flex flex-1 items-center justify-center p-6 text-center text-sm text-secondary"
            data-testid={empty.testId}
          >
            {empty.text}
          </div>
        )}
        {chartReady && (
          <div className="relative min-h-0 flex-1">
            <SankeyChart
              layout={layout}
              tokens={tokens}
              viewport={zoom.viewport}
              hostProps={zoom.hostProps}
              dragging={zoom.dragging}
              lit={lit}
              onNodeEnter={onNodeEnter}
              onNodeLeave={() => {
                setHoverId(null);
                hideTip();
              }}
              onNodeClick={onLocateNode}
              onLinkEnter={onLinkEnter}
              onLinkLeave={hideTip}
              onKeyDown={handleKeyDown}
            >
              <SankeySearchOverlay search={search} />
              <SankeyControlBar
                percent={zoom.percent}
                focusMode={focusMode}
                onZoomIn={zoom.zoomIn}
                onZoomOut={zoom.zoomOut}
                onFit={zoom.fit}
                onResetOne={zoom.resetOne}
                onToggleFocus={() => onFocusModeChange(!focusMode)}
              />
            </SankeyChart>
          </div>
        )}
      </div>

      {!focusMode && chartReady && (
        <SankeySummary
          nodes={summary.nodes}
          namespaces={summary.namespaces}
          applications={summary.applications}
          {...(cut.shown < cut.total ? { podCut: { shown: cut.shown, total: cut.total } } : {})}
        />
      )}

      <SankeyTooltip tooltip={tooltip} />
    </div>
  );
}
