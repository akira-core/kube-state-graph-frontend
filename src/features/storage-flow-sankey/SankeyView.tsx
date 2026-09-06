import type cytoscape from 'cytoscape';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import { formatBytes, formatUsage } from '../../shared/format/measurements';
import { eyebrowClass } from '../../shared/ui/Section';
import { Segmented, type SegmentedOption } from '../../shared/ui/Segmented';
import { EMPTY_STORAGE_GRAPH_ROOTS, type StorageGraphRoots } from '../graph-data';
import { useThemeTokens } from '../theme';

import { deriveSankey, formatBytesPerSec, hoverPathLinks, type SankeyMode, type SankeyNode } from './deriveSankey';
import { layoutSankey, linkKey, TIER_LABEL, type LayoutLink } from './layoutSankey';
import { SankeyChart, type HoverLit } from './SankeyChart';
import { SankeyControlBar } from './SankeyControlBar';
import { SankeySummary, type NamespaceSubtotalRow, type NodeSummaryRow } from './SankeySummary';
import { openingViewport, useZoomPan, type Size } from './useZoomPan';

/**
 * Stands in for the chart box only while it has never been measured. Nothing opens against
 * it — the opening viewport waits for a real measurement — so it is reached solely by the
 * zoom controls in an environment that reports no layout at all, where a zero-sized
 * container would make `fit` a no-op and the controls untestable.
 */
const UNMEASURED_CONTAINER: Size = { w: 800, h: 480 };

const MODE_OPTIONS: ReadonlyArray<SegmentedOption<SankeyMode>> = [
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'both', label: 'Both' },
];

export interface SankeyViewProps {
  elements: cytoscape.ElementDefinition[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | undefined;
  hasPayload: boolean;
  demoMode: boolean;
  focusMode: boolean;
  onFocusModeChange: (next: boolean) => void;
  mode?: SankeyMode;
  onModeChange?: (mode: SankeyMode) => void;
  /** `endpoints.storageGraph` is configured (or demo mode supplies a fixture). */
  endpointConfigured: boolean;
  /** Both halves of the required scope are chosen, so a request has been sent. */
  azEnvReady: boolean;
  /**
   * The root selection the current payload was requested with. Only used to keep a
   * materialised root drawn when its whole path came back unmeasured — the wire carries
   * no root marker, so the request is the only thing that knows.
   */
  roots?: StorageGraphRoots;
  onLocateNode: (id: string) => void;
}

interface Tip {
  x: number;
  y: number;
  text: string[];
}

function emptyCopy(kind: 1 | 2 | 3 | 4, demoMode: boolean, mode: SankeyMode): { testId: string; text: string } {
  if (kind === 1) {
    return {
      testId: 'sankey-empty-unconfigured',
      text: 'Storage graph endpoint is not configured. Graph view is unaffected.',
    };
  }
  if (kind === 2) {
    return {
      testId: 'sankey-empty-scope',
      text: 'Select one az and one env to load storage flow. No request has been sent yet.',
    };
  }
  if (kind === 3) {
    return {
      testId: 'sankey-empty-response',
      text: `No storage flow for this estimate and root in the current time range. The root name may not exist, this estate may have no NetApp-backed claims, or the window may be outside retention.${demoMode ? ' Currently showing demo fixture data.' : ''}`,
    };
  }
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

/**
 * Node tooltip lines for a storage-graph node.
 *
 * The hardware and perf readings are shown RAW and uncoloured on purpose: `cpu_busy_pct`
 * is a reading, not a threshold, and colouring it would invent a health judgement the
 * backend never made. `health` is the only field that carries one.
 */
function nodeTooltip(node: SankeyNode | undefined, id: string, flowLines: readonly string[]): string[] {
  if (node === undefined) {
    return [id, ...flowLines];
  }
  const isNetapp = node.kind === 'netapp-node' || node.kind === 'netapp-aggr' || node.kind === 'netapp-svm';
  const usage =
    node.kind === 'pvc' || node.kind === 'netapp-aggr'
      ? formatUsage(node.usage?.usedBytes, node.usage?.capacityBytes)
      : undefined;
  const raw = (label: string, value: number | undefined, format: (v: number) => string): string[] =>
    value === undefined ? [] : [`${label} ${format(value)} (raw)`];
  return [
    `${node.kind} / ${node.label}`,
    ...((node.kind === 'pod' || node.kind === 'pvc') && node.namespace !== undefined
      ? [`namespace ${node.namespace}`]
      : []),
    ...(isNetapp && node.ontapCluster !== undefined ? [`ontap_cluster: ${node.ontapCluster}`] : []),
    ...flowLines,
    ...(usage !== undefined && usage.length > 0 ? [usage] : []),
    ...(node.health !== undefined ? [`health ${node.health}`] : []),
    ...(node.hardware?.model !== undefined ? [`model ${node.hardware.model}`] : []),
    ...raw('cpu_busy_pct', node.perf?.cpuBusyPct, String),
    ...raw('total_ops', node.perf?.totalOps, String),
    ...raw('total_latency_us', node.perf?.totalLatencyUs, String),
    ...raw('total_bytes_per_sec', node.perf?.totalBytesPerSec, formatBytes),
    // `severity` is optional (a rule may declare none), so the prefix has to drop with it
    // rather than render the string "undefined" in front of the alert name.
    ...(node.alerts ?? []).map((alert) =>
      alert.severity === undefined ? alert.name : `${alert.severity} ${alert.name}`
    ),
    ...(node.noFlow === true ? ['Selected root with no flow in this time range.'] : []),
  ];
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
  roots = EMPTY_STORAGE_GRAPH_ROOTS,
  onLocateNode,
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
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const chartHostRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  /**
   * `null` until the chart box has actually been measured, and deliberately not a
   * plausible-looking placeholder. The opening viewport fits against this and then locks
   * itself, so a placeholder is not a harmless default — it is the size the diagram gets
   * fitted to. Seeded at 800x480 it opened every estate at that ratio and never revisited
   * it: 2096-wide content drew at 38% in a 1600px-wide window instead of 76%, off-centre,
   * looking exactly like a chart too big for its area. Environments with no layout (jsdom)
   * measure nothing and stay `null`, which is what `UNMEASURED_CONTAINER` below is for.
   */
  const [containerSize, setContainerSize] = useState<Size | null>(null);
  const openedRef = useRef(false);

  // See SankeyView.test.tsx: the ref'd box only renders once the loading / fatal-error
  // early returns below have passed, so a first-load effect with a null ref must re-run
  // once the box actually mounts, not just once at first render.
  useEffect(() => {
    const el = boxRef.current;
    if (el === null) {
      return;
    }
    // Measured up front, not only from the observer's callback. The opening viewport is a
    // separate effect that runs in the same commit as this one, so it would otherwise fit
    // and lock against whatever the state held before the observer's first delivery.
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setContainerSize({ w: rect.width, h: rect.height });
    }
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) {
        return;
      }
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setContainerSize({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [status, hasPayload]);

  // `cluster` / `namespace` narrowing is a REQUEST parameter, owned by the scope bar — the
  // projection arrives already scoped. Re-filtering it here would break the backend's
  // weight conservation, which is why this view has no cluster selector of its own.
  const graph = useMemo(() => deriveSankey(elements, mode, roots), [elements, mode, roots]);
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
  const layout = useMemo(() => layoutSankey(graph, namespacePalette), [graph, namespacePalette]);

  const zoom = useZoomPan(chartHostRef, { w: layout.width, h: layout.height }, containerSize ?? UNMEASURED_CONTAINER);
  // A fresh `zoom` object comes back every render; pull out just the one stable setter the
  // opening-viewport effect below needs so its dep array doesn't chase the whole object.
  const { setViewport } = zoom;

  // One-shot opening viewport: fit-but-never-enlarge, computed the first time real content
  // is drawn, then never touched again — mode / cluster / refresh / theme / resize and
  // focus mode all preserve whatever the user set after.
  //
  // The box is measured HERE rather than read from state, because the two are not the same
  // moment. The observer above attaches while the chart is still loading, when the box is
  // the only thing in the column and stretches to 1502px; the summary tables that shrink it
  // to 982 arrive with the chart itself. Fitting against the state written by that earlier
  // measurement parked the diagram low — a 593px gap above it and 80px below — and the lock
  // then refused the corrected size the observer delivered a moment later. Measuring at the
  // instant of the fit means the chart being drawn is what gets measured.
  useEffect(() => {
    const el = boxRef.current;
    if (openedRef.current || layout.nodes.length === 0 || el === null) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const box = rect.width >= 40 && rect.height >= 40 ? { w: rect.width, h: rect.height } : containerSize;
    if (box === null || box.w < 40 || box.h < 40) {
      return;
    }
    setViewport(openingViewport({ w: layout.width, h: layout.height }, box));
    openedRef.current = true;
  }, [layout, containerSize, setViewport]);

  useEffect(() => {
    if (zoom.dragging) {
      setTip(null);
    }
  }, [zoom.dragging]);

  // A refresh may remove the node under the cursor; its mouseleave never fires, so nothing
  // else clears this — the tooltip would describe a gone node and `lit` would fade
  // everything against zero surviving links.
  useEffect(() => {
    if (hoverId !== null && !graph.nodes.some((n) => n.id === hoverId)) {
      setHoverId(null);
      setTip(null);
    }
  }, [graph, hoverId]);

  const lit: HoverLit | null = useMemo(() => {
    if (hoverId === null) {
      return null;
    }
    const pathLinks = hoverPathLinks(graph, hoverId);
    const keys = new Set(pathLinks.map((l) => linkKey(l.source, l.target, l.direction, l.tier)));
    const nodeIds = new Set<string>([hoverId]);
    for (const l of pathLinks) {
      nodeIds.add(l.source);
      nodeIds.add(l.target);
    }
    return { keys, nodeIds };
  }, [graph, hoverId]);

  useLayoutEffect(() => {
    if (tip === null) {
      setTipPos(null);
      return;
    }
    const el = tipRef.current;
    const box = boxRef.current;
    if (el === null || box === null) {
      setTipPos({ left: tip.x + 12, top: tip.y + 12 });
      return;
    }
    const rect = box.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(rect.left + 4, Math.min(tip.x + 12, rect.right - w - 4));
    const top = Math.max(rect.top + 4, Math.min(tip.y + 12, rect.bottom - h - 4));
    setTipPos({ left, top });
  }, [tip]);

  const summary = useMemo(() => {
    const inbound = new Map<string, number>();
    const outbound = new Map<string, number>();
    for (const l of graph.links) {
      inbound.set(l.target, (inbound.get(l.target) ?? 0) + l.value);
      outbound.set(l.source, (outbound.get(l.source) ?? 0) + l.value);
    }
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const nodes: NodeSummaryRow[] = layout.nodes.map((ln) => {
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
        ...(gn?.health !== undefined ? { health: gn.health } : {}),
      };
    });
    const nsAgg = new Map<string, { count: number; total: number }>();
    for (const n of graph.nodes) {
      if (n.kind !== 'pod' || n.namespace === undefined) {
        continue;
      }
      const cur = nsAgg.get(n.namespace) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += outbound.get(n.id) ?? 0;
      nsAgg.set(n.namespace, cur);
    }
    const namespaces: NamespaceSubtotalRow[] = [...nsAgg.entries()]
      .map(([namespace, v]) => ({ namespace, podCount: v.count, total: v.total }))
      .sort((a, b) => b.total - a.total || a.namespace.localeCompare(b.namespace));
    return { nodes, namespaces };
  }, [graph, layout]);

  if (status === 'loading' && !hasPayload) {
    return <div className="flex h-full items-center justify-center text-secondary">Loading…</div>;
  }
  if (status === 'error' && !hasPayload) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-primary" role="alert">
        {error}
      </div>
    );
  }

  // Four causes, four sentences. They are not interchangeable: an unfinished selection that
  // reads as "no storage flow" makes a working pipeline look broken, and vice versa.
  const emptyKind: 1 | 2 | 3 | 4 | null = (() => {
    if (!demoMode && !endpointConfigured) {
      return 1;
    }
    if (!azEnvReady) {
      return 2;
    }
    if (graph.links.length === 0 && graph.hasStorageFlowEdges && !graph.hasCurrentDirectionMeasurement) {
      return 4;
    }
    if (graph.nodes.length === 0) {
      return 3;
    }
    return null;
  })();
  const chartReady = emptyKind === null;

  const onNodeEnter = (id: string, evt: MouseEvent): void => {
    if (zoom.dragging) {
      return;
    }
    setHoverId(id);
    const node = graph.nodes.find((g) => g.id === id);
    const inboundLinks = graph.links.filter((l) => l.target === id);
    const outboundLinks = graph.links.filter((l) => l.source === id);
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
    setTip({ x: evt.clientX, y: evt.clientY, text: nodeTooltip(node, id, flowLines) });
  };

  const onLinkEnter = (link: LayoutLink, evt: MouseEvent): void => {
    if (zoom.dragging) {
      return;
    }
    const src = graph.nodes.find((g) => g.id === link.source);
    const dst = graph.nodes.find((g) => g.id === link.target);
    const ceilingTier = link.tier === 'svm-pvc';
    const lines = [
      `${src?.label ?? link.source} → ${dst?.label ?? link.target}`,
      `tier ${link.tier}`,
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
    setTip({ x: evt.clientX, y: evt.clientY, text: lines });
  };

  const handleKeyDown = (evt: KeyboardEvent<HTMLDivElement>): void => {
    const target = evt.target as HTMLElement;
    // A plain button (the zoom/focus control bar) has no native keydown behavior for any
    // of these keys, so it is deliberately not excluded here — unlike an input, select, or
    // radio, which do, and whose own key handling this must not clobber.
    if (target.closest('input, select, textarea, [role="radio"]') !== null) {
      return;
    }
    switch (evt.key) {
      case '+':
      case '=':
        evt.preventDefault();
        zoom.zoomIn();
        break;
      case '-':
        evt.preventDefault();
        zoom.zoomOut();
        break;
      case '0':
        evt.preventDefault();
        zoom.fit();
        break;
      case '1':
        evt.preventDefault();
        zoom.resetOne();
        break;
      case 'f':
      case 'F':
        evt.preventDefault();
        onFocusModeChange(!focusMode);
        break;
      case 'Escape':
        if (focusMode) {
          evt.preventDefault();
          onFocusModeChange(false);
        }
        break;
      default:
        break;
    }
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
          <div className="ml-auto flex items-center gap-3">
            {(mode === 'both' || mode === 'read') && (
              <span className="flex items-center gap-1.5 text-[11px] text-secondary">
                <svg width="22" height="6" viewBox="0 0 22 6" aria-hidden>
                  <path d="M0 3h22" stroke={tokens.sankey.read} strokeWidth="3" />
                </svg>
                read
              </span>
            )}
            {(mode === 'both' || mode === 'write') && (
              <span className="flex items-center gap-1.5 text-[11px] text-secondary">
                <svg width="22" height="6" viewBox="0 0 22 6" aria-hidden>
                  <path d="M0 3h22" stroke={tokens.sankey.write} strokeWidth="3" strokeDasharray="4 3" />
                </svg>
                write
              </span>
            )}
          </div>
        </div>
      )}

      {/* The chart keeps a floor. Six tiers make the summary tall enough to take the whole
          column otherwise, and a zero-height chart host renders its nodes outside the SVG. */}
      <div className="relative flex min-h-[220px] flex-1 flex-col" ref={boxRef}>
        {emptyKind !== null && (
          <div
            className="flex flex-1 items-center justify-center p-6 text-center text-sm text-secondary"
            data-testid={emptyCopy(emptyKind, demoMode, mode).testId}
          >
            {emptyCopy(emptyKind, demoMode, mode).text}
          </div>
        )}
        {chartReady && (
          <div className="relative min-h-0 flex-1">
            <SankeyChart
              layout={layout}
              tokens={tokens}
              viewport={zoom.viewport}
              hostRef={chartHostRef}
              hostProps={zoom.hostProps}
              dragging={zoom.dragging}
              lit={lit}
              onNodeEnter={onNodeEnter}
              onNodeLeave={() => {
                setHoverId(null);
                setTip(null);
              }}
              onNodeClick={onLocateNode}
              onLinkEnter={onLinkEnter}
              onLinkLeave={() => setTip(null)}
              onKeyDown={handleKeyDown}
            >
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

      {!focusMode && chartReady && <SankeySummary nodes={summary.nodes} namespaces={summary.namespaces} />}

      {tip !== null && tipPos !== null && (
        <div
          ref={tipRef}
          className="pointer-events-none fixed z-[1100] max-w-xs rounded-md border border-hairline bg-elevated px-2.5 py-1.5 font-mono text-[11px] leading-relaxed shadow-panel"
          style={{ left: tipPos.left, top: tipPos.top }}
          role="tooltip"
        >
          {tip.text.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
