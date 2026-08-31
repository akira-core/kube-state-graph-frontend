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

import { formatUsage } from '../../shared/format/measurements';
import { eyebrowClass } from '../../shared/ui/Section';
import { Segmented, type SegmentedOption } from '../../shared/ui/Segmented';
import { Select } from '../../shared/ui/Select';
import { useThemeTokens } from '../theme';

import { deriveSankey, formatBytesPerSec, hoverPathLinks, type SankeyMode } from './deriveSankey';
import { layoutSankey, TIER_LABEL, type LayoutLink } from './layoutSankey';
import { SankeyChart, type HoverLit } from './SankeyChart';
import { SankeyControlBar } from './SankeyControlBar';
import { SankeySummary, type NamespaceSubtotalRow, type NodeSummaryRow } from './SankeySummary';
import { openingViewport, useZoomPan } from './useZoomPan';

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
  visible: boolean;
  focusMode: boolean;
  onFocusModeChange: (next: boolean) => void;
  onLocateNode: (id: string) => void;
}

interface Tip {
  x: number;
  y: number;
  text: string[];
}

export function SankeyView({
  elements,
  status,
  error,
  hasPayload,
  demoMode,
  visible,
  focusMode,
  onFocusModeChange,
  onLocateNode,
}: Readonly<SankeyViewProps>): JSX.Element {
  const tokens = useThemeTokens();
  const [mode, setMode] = useState<SankeyMode>('both');
  const [cluster, setCluster] = useState<string | undefined>(undefined);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const chartHostRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 480 });
  const openedRef = useRef(false);

  // See SankeyView.test.tsx: the ref'd box only renders once the loading / fatal-error
  // early returns below have passed, so a first-load effect with a null ref must re-run
  // once the box actually mounts, not just once at first render.
  useEffect(() => {
    if (!visible) {
      return;
    }
    const el = boxRef.current;
    if (el === null) {
      return;
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
  }, [visible, status, hasPayload]);

  const clusters = useMemo(() => {
    const names = new Set<string>();
    for (const el of elements) {
      if (el.group !== 'nodes') {
        continue;
      }
      const d = el.data as cytoscape.NodeDataDefinition;
      if (d.isCluster === true && typeof d.cluster === 'string') {
        names.add(d.cluster);
      }
    }
    return [...names].sort();
  }, [elements]);

  const graph = useMemo(() => deriveSankey(elements, mode, cluster), [elements, mode, cluster]);
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

  const zoom = useZoomPan(chartHostRef, { w: layout.width, h: layout.height }, containerSize);
  // A fresh `zoom` object comes back every render; pull out just the one stable setter the
  // opening-viewport effect below needs so its dep array doesn't chase the whole object.
  const { setViewport } = zoom;

  // One-shot opening viewport: fit-but-never-enlarge, computed the first time real content
  // and a real container measurement are both available, then never touched again by data
  // changes — mode/cluster/refresh/theme/resize all preserve whatever the user set after.
  useEffect(() => {
    if (openedRef.current || layout.nodes.length === 0 || containerSize.w < 40 || containerSize.h < 40) {
      return;
    }
    setViewport(openingViewport({ w: layout.width, h: layout.height }, containerSize));
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
    const keys = new Set(pathLinks.map((l) => `${l.source}|${l.target}|${l.direction}`));
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
        ...((ln.kind === 'netapp-aggr' || ln.kind === 'netapp-node') && gn?.health !== undefined
          ? { health: gn.health }
          : {}),
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

  const emptyAll = !graph.hasAnyMeasurement;
  const emptyCluster = cluster !== undefined && graph.hasAnyMeasurement && graph.nodes.length === 0;
  const emptyMode = graph.hasAnyMeasurement && graph.links.length === 0 && !emptyCluster;
  const chartReady = !emptyAll && !emptyMode && !emptyCluster;

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
    const usage =
      node !== undefined && (node.kind === 'pvc' || node.kind === 'netapp-aggr')
        ? formatUsage(node.usage?.usedBytes, node.usage?.capacityBytes)
        : undefined;
    const lines = [
      `${node?.kind ?? ''} / ${node?.label ?? id}`,
      ...(node?.kind === 'pod' && node.namespace !== undefined ? [`namespace ${node.namespace}`] : []),
      ...flowLines,
      ...(usage !== undefined && usage.length > 0 ? [usage] : []),
      ...(node !== undefined &&
      (node.kind === 'netapp-aggr' || node.kind === 'netapp-node') &&
      node.health !== undefined
        ? [`health ${node.health}`]
        : []),
    ];
    setTip({ x: evt.clientX, y: evt.clientY, text: lines });
  };

  const onLinkEnter = (link: LayoutLink, evt: MouseEvent): void => {
    if (zoom.dragging) {
      return;
    }
    const src = graph.nodes.find((g) => g.id === link.source);
    const dst = graph.nodes.find((g) => g.id === link.target);
    const lines = [
      `${src?.label ?? link.source} → ${dst?.label ?? link.target}`,
      `${link.direction}: ${formatBytesPerSec(link.value)}`,
      ...(link.splitAmong !== undefined ? [`evenly split estimate across ${String(link.splitAmong)} pods`] : []),
      ...(link.maxBytesPerSec !== undefined ? [`QoS ceiling ${formatBytesPerSec(link.maxBytesPerSec)}`] : []),
      ...(link.maxIops !== undefined ? [`QoS ceiling ${String(link.maxIops)} IOPS`] : []),
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
          {clusters.length >= 2 && (
            <label className="flex items-center gap-1.5">
              <span className={eyebrowClass}>Cluster</span>
              <Select
                value={cluster ?? ''}
                onChange={(e) => setCluster(e.target.value === '' ? undefined : e.target.value)}
              >
                <option value="">All</option>
                {clusters.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </label>
          )}
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

      <div className="relative flex min-h-0 flex-1 flex-col" ref={boxRef}>
        {emptyAll && (
          <div
            className="flex flex-1 items-center justify-center p-6 text-center text-sm text-secondary"
            data-testid="sankey-empty"
          >
            This graph contains no storage I/O metrics.
            {demoMode ? ' Currently showing demo fixture data.' : ''}
          </div>
        )}
        {emptyCluster && (
          <div
            className="flex flex-1 items-center justify-center p-6 text-center text-sm text-secondary"
            data-testid="sankey-empty-cluster"
          >
            The selected cluster has no storage flow.
          </div>
        )}
        {emptyMode && (
          <div
            className="flex flex-1 items-center justify-center p-6 text-center text-sm text-secondary"
            data-testid="sankey-empty-mode"
          >
            {mode === 'read'
              ? 'Read direction has no measurements. Switch to Write or Both.'
              : mode === 'write'
                ? 'Write direction has no measurements. Switch to Read or Both.'
                : 'No measurements for the current direction. Try switching Read / Write / Both.'}
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
