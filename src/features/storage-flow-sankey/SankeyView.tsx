import type cytoscape from 'cytoscape';
import { useCallback, useMemo, type JSX, type MouseEvent } from 'react';

import { countWord } from '../../shared/format/countWord';
import { formatBytes, formatUsage } from '../../shared/format/measurements';
import type { ThemeTokens } from '../../shared/theme/tokens';
import { EMPTY_STORAGE_GRAPH_ROOTS, hasAnyRoot, type StorageGraphRoots } from '../graph-data';
import {
  loadGateScreen,
  SankeyControlBar,
  SankeySearchOverlay,
  SankeyTooltip,
  useSankeyStage,
  nodeTooltipRows,
  rawReading,
  shellEmptyKind,
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
  type SankeyDirection,
  type SankeyMode,
  type SankeyNode,
  type SankeySvmDisplay,
} from './deriveSankey';
import { layoutSankey, type LayoutLink, type SankeyPodLayout } from './layoutSankey';
import { SankeyChart } from './SankeyChart';
import { sankeyCardRects, sankeyPathLit, sankeySearchRecords } from './sankeySearch';

export interface SankeyViewProps {
  /** The body after the page's Top pods cut (see `useSankeyProjection`). */
  elements: cytoscape.ElementDefinition[];
  status: LoadStatus;
  error: string | undefined;
  hasPayload: boolean;
  demoMode: boolean;
  focusMode: boolean;
  onFocusModeChange: (next: boolean) => void;
  mode: SankeyMode;
  /** `endpoints.storageGraph` is configured (or demo mode supplies a fixture). */
  endpointConfigured: boolean;
  /** Both halves of the required estate are chosen. */
  azEnvReady: boolean;
  /** At least one root is present in the current (draft or applied) scope. */
  hasRoot?: boolean;
  cancelled?: boolean;
  /**
   * The root selection the current payload was requested with. Only used to keep a
   * materialised root drawn when its whole path came back unmeasured — the wire carries
   * no root marker, so the request is the only thing that knows.
   */
  roots?: StorageGraphRoots;
  onLocateNode: (id: string) => void;
  /** Page-transient pod layout. */
  podLayout: SankeyPodLayout;
  /** Page-transient SVM display, already `column` when `Group` is unavailable. */
  svmDisplay: SankeySvmDisplay;
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

/** A tooltip row painted the colour of the ribbons it sums. */
interface FlowLine {
  text: string;
  color: string;
}

function flowColor(direction: SankeyDirection, tokens: ThemeTokens): string {
  return direction === 'read' ? tokens.sankey.read : tokens.sankey.write;
}

function flowLine(text: string, direction: SankeyDirection, tokens: ThemeTokens): FlowLine {
  return { text, color: flowColor(direction, tokens) };
}

/** A derived row keeps its paint: it sums ribbons of the same colour. */
function markDerived(lines: readonly FlowLine[], members: string): FlowLine[] {
  return lines.map((line) => ({ ...line, text: `${line.text} (derived from member ${members})` }));
}

/** Node tooltip lines for a storage-graph node, in the shared row order (see `nodeTooltipRows`). */
function nodeTooltip(
  node: SankeyNode | undefined,
  id: string,
  flowLines: readonly FlowLine[],
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

function derivedCardTooltip(node: SankeyNode, flowLines: readonly FlowLine[]): TooltipLine[] {
  return nodeTooltipRows({
    head: `${node.kind} / ${node.label}`,
    ...(node.kind === 'application' && node.namespace !== undefined ? { namespace: node.namespace } : {}),
    identity: node.memberPodCount !== undefined ? [countWord(node.memberPodCount, 'pod')] : [],
    // Derived cards carry no status: they are synthesised columns.
    flow: markDerived(flowLines, 'pods'),
    trailer: node.noFlow === true ? ['Selected root with no flow in this time range.'] : [],
  });
}

/** A Kubernetes node wrapper's title-row tooltip under the `Node` pod layout: its pod count,
 *  the members' flow, and the status the backend folded over the node and its pods. */
function wrapperTooltip(
  label: string,
  podCount: number,
  flowLines: readonly FlowLine[],
  status: string | undefined,
  noFlow: boolean
): TooltipLine[] {
  return nodeTooltipRows({
    head: `node / ${label}`,
    identity: [countWord(podCount, 'pod')],
    flow: markDerived(flowLines, 'pods'),
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
  flowLines: readonly FlowLine[],
  noFlow: boolean
): TooltipLine[] {
  return nodeTooltipRows({
    head: `netapp-svm / ${label}`,
    ...(ontapCluster !== undefined ? { ontapCluster } : {}),
    identity: [countWord(pvcCount, 'PVC')],
    flow: markDerived(flowLines, 'PVCs'),
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
  mode,
  endpointConfigured,
  azEnvReady,
  hasRoot,
  cancelled = false,
  roots = EMPTY_STORAGE_GRAPH_ROOTS,
  onLocateNode,
  podLayout,
  svmDisplay,
}: Readonly<SankeyViewProps>): JSX.Element {
  const tokens = useThemeTokens();
  // `cluster` / `namespace` narrowing is a REQUEST parameter, owned by the scope bar — the
  // projection arrives already scoped. Re-filtering it here would break the backend's
  // weight conservation, which is why this view has no cluster selector of its own.
  const graph = useMemo(() => deriveSankey(elements, mode, roots, svmDisplay), [elements, mode, roots, svmDisplay]);
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
    () => layoutSankey(graph, namespacePalette, podLayout, svmDisplay),
    [graph, namespacePalette, podLayout, svmDisplay]
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
    // Every flow row is painted like the ribbons it sums, the way the trace paints its own.
    const flowLines: FlowLine[] =
      mode === 'both'
        ? [
            flowLine(`in read ${formatBytesPerSec(sum(inboundLinks, 'read'))}`, 'read', tokens),
            flowLine(`in write ${formatBytesPerSec(sum(inboundLinks, 'write'))}`, 'write', tokens),
            flowLine(`out read ${formatBytesPerSec(sum(outboundLinks, 'read'))}`, 'read', tokens),
            flowLine(`out write ${formatBytesPerSec(sum(outboundLinks, 'write'))}`, 'write', tokens),
          ]
        : [
            flowLine(`in ${formatBytesPerSec(sum(inboundLinks))}`, mode, tokens),
            flowLine(`out ${formatBytesPerSec(sum(outboundLinks))}`, mode, tokens),
          ];
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
    const value = flowLine(`${link.direction}: ${formatBytesPerSec(link.value)}`, link.direction, tokens);
    const lines: TooltipLine[] = derived
      ? [
          `${src?.label ?? link.source} → ${dst?.label ?? link.target}`,
          isDerivedTier(link.tier) ? DERIVED_TIER_LABEL[link.tier] : `tier ${link.tier}`,
          value,
          'derived from member pods',
        ]
      : [
          `${src?.label ?? link.source} → ${dst?.label ?? link.target}`,
          `tier ${link.tier}`,
          // Under `Group` the ribbon runs straight from the claim aggregate, so this is
          // the only place left naming the SVM the claim belongs to.
          ...(link.tier === 'svm-pvc' && dst?.svm !== undefined ? [`SVM ${dst.svm}`] : []),
          value,
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
      {/* The chart keeps a floor: a zero-height chart host renders its nodes outside the SVG. */}
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

      <SankeyTooltip tooltip={tooltip} />
    </div>
  );
}
