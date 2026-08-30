import type cytoscape from 'cytoscape';
import { sankey as d3Sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';

import { formatUsage } from '../../shared/format/measurements';
import { useThemeTokens } from '../theme';

import { deriveSankey, formatBytesPerSec, hoverPathLinks, type SankeyMode } from './deriveSankey';

export interface SankeyViewProps {
  elements: cytoscape.ElementDefinition[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | undefined;
  hasPayload: boolean;
  demoMode: boolean;
  visible: boolean;
  onLocateNode: (id: string) => void;
}

interface LaidNode {
  id: string;
  label: string;
  kind: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface LaidLink {
  source: string;
  target: string;
  direction: 'read' | 'write';
  value: number;
  width: number;
  path: string;
  splitAmong?: number;
  maxBytesPerSec?: number;
  maxIops?: number;
}

export function SankeyView({
  elements,
  status,
  error,
  hasPayload,
  demoMode,
  visible,
  onLocateNode,
}: Readonly<SankeyViewProps>): JSX.Element {
  const tokens = useThemeTokens();
  const [mode, setMode] = useState<SankeyMode>('both');
  const [cluster, setCluster] = useState<string | undefined>(undefined);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string[] } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 480 });

  // `status`/`hasPayload` are deps, not decoration: the ref'd container is rendered only
  // AFTER the loading / fatal-error early returns below, so on a first load the effect
  // would otherwise run once with a null ref, bail, and never re-run — leaving `size`
  // pinned at the 800x480 seed for the life of the view.
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
        setSize({ w: width, h: height });
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

  const layout = useMemo(() => {
    if (graph.nodes.length === 0 || size.w < 40 || size.h < 40) {
      return { nodes: [] as LaidNode[], links: [] as LaidLink[] };
    }
    const layoutGen = d3Sankey<
      { id: string },
      { source: string; target: string; value: number; direction: 'read' | 'write' }
    >()
      .nodeId((d) => d.id)
      .nodeWidth(16)
      .nodePadding(12)
      .extent([
        [24, 24],
        [size.w - 24, size.h - 24],
      ]);
    const inputNodes = graph.nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind }));
    const inputLinks = graph.links.map((l) => ({
      source: l.source,
      target: l.target,
      value: l.value === 0 ? 0.0001 : l.value,
      direction: l.direction,
    }));
    const sankeyed = layoutGen({
      nodes: inputNodes.map((n) => ({ ...n })),
      links: inputLinks.map((l) => ({ ...l })),
    });
    const path = sankeyLinkHorizontal();
    const nodes: LaidNode[] = (
      sankeyed.nodes as Array<{
        id: string;
        label: string;
        kind: string;
        x0?: number;
        x1?: number;
        y0?: number;
        y1?: number;
      }>
    ).map((n) => ({
      id: n.id,
      label: n.label,
      kind: n.kind,
      x0: n.x0 ?? 0,
      x1: n.x1 ?? 0,
      y0: n.y0 ?? 0,
      y1: n.y1 ?? 0,
    }));
    const links: LaidLink[] = (
      sankeyed.links as Array<{
        source: { id: string };
        target: { id: string };
        value: number;
        width?: number;
        direction: 'read' | 'write';
      }>
    ).map((l, i) => {
      const original = graph.links[i];
      return {
        source: l.source.id,
        target: l.target.id,
        direction: l.direction,
        value: original?.value ?? l.value,
        width: Math.max(l.width ?? 1, original?.value === 0 ? 1.5 : 1),
        path: path(l as never) ?? '',
        ...(original?.splitAmong !== undefined ? { splitAmong: original.splitAmong } : {}),
        ...(original?.maxBytesPerSec !== undefined ? { maxBytesPerSec: original.maxBytesPerSec } : {}),
        ...(original?.maxIops !== undefined ? { maxIops: original.maxIops } : {}),
      };
    });
    return { nodes, links };
  }, [graph, size]);

  // A refresh may remove the node under the cursor. Its `mouseleave` will then never fire,
  // so nothing else would clear this: the tooltip stays open describing a node that is gone,
  // and `lit` — lighting a path of zero links — fades every remaining link and node.
  useEffect(() => {
    if (hoverId !== null && !graph.nodes.some((n) => n.id === hoverId)) {
      setHoverId(null);
      setTip(null);
    }
  }, [graph, hoverId]);

  const lit = useMemo(() => {
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

  if (status === 'loading' && !hasPayload) {
    return <div className="flex h-full items-center justify-center text-secondary">Loading…</div>;
  }
  if (status === 'error' && !hasPayload) {
    return (
      <div className="flex h-full items-center justify-center text-primary" role="alert">
        {error}
      </div>
    );
  }

  const emptyAll = !graph.hasAnyMeasurement;
  const emptyCluster = cluster !== undefined && graph.hasAnyMeasurement && graph.nodes.length === 0;
  const emptyMode = graph.hasAnyMeasurement && graph.links.length === 0 && !emptyCluster;

  return (
    <div className="flex h-full w-full flex-col bg-canvas text-primary" data-testid="sankey-view" ref={boxRef}>
      <div className="flex items-center gap-4 px-3 py-2">
        <div role="group" aria-label="Sankey mode">
          {(['read', 'write', 'both'] as const).map((m) => (
            <label key={m} className="mr-3 text-sm">
              <input type="radio" name="sankey-mode" value={m} checked={mode === m} onChange={() => setMode(m)} /> {m}
            </label>
          ))}
        </div>
        {clusters.length >= 2 && (
          <label className="text-sm">
            Cluster
            <select
              className="ml-2 rounded border border-medium bg-surface px-2 py-1"
              value={cluster ?? ''}
              onChange={(e) => setCluster(e.target.value === '' ? undefined : e.target.value)}
            >
              <option value="">All</option>
              {clusters.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="ml-auto flex items-center gap-3 text-xs">
          {(mode === 'both' || mode === 'read') && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded" style={{ background: tokens.sankey.read }} /> read
            </span>
          )}
          {(mode === 'both' || mode === 'write') && (
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-4 rounded"
                style={{
                  background: tokens.sankey.write,
                  backgroundImage:
                    'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255,255,255,0.35) 2px, rgba(255,255,255,0.35) 4px)',
                }}
              />{' '}
              write
            </span>
          )}
        </div>
      </div>
      {emptyAll && (
        <div className="flex flex-1 items-center justify-center p-6 text-secondary" data-testid="sankey-empty">
          This graph contains no storage I/O metrics.
          {demoMode ? ' Currently showing demo fixture data.' : ''}
        </div>
      )}
      {emptyCluster && (
        <div className="flex flex-1 items-center justify-center p-6 text-secondary" data-testid="sankey-empty-cluster">
          The selected cluster has no storage flow.
        </div>
      )}
      {emptyMode && (
        <div className="flex flex-1 items-center justify-center p-6 text-secondary" data-testid="sankey-empty-mode">
          {mode === 'read'
            ? 'Read direction has no measurements. Switch to Write or Both.'
            : mode === 'write'
              ? 'Write direction has no measurements. Switch to Read or Both.'
              : 'No measurements for the current direction. Try switching Read / Write / Both.'}
        </div>
      )}
      {!emptyAll && !emptyMode && !emptyCluster && (
        <svg className="min-h-0 flex-1" width={size.w} height={size.h} data-testid="sankey-svg">
          {layout.links.map((l) => {
            const key = `${l.source}|${l.target}|${l.direction}`;
            const active = lit === null || lit.keys.has(key);
            const color = l.direction === 'read' ? tokens.sankey.read : tokens.sankey.write;
            const dashed = l.value === 0 || l.direction === 'write';
            return (
              <path
                key={key}
                d={l.path}
                fill="none"
                stroke={color}
                strokeWidth={Math.max(l.width, 1.5)}
                strokeOpacity={active ? 0.7 : 0.12}
                strokeDasharray={dashed ? '4 3' : undefined}
                data-testid={`sankey-link-${l.direction}`}
                onMouseEnter={(ev) => {
                  const src = graph.nodes.find((g) => g.id === l.source);
                  const dst = graph.nodes.find((g) => g.id === l.target);
                  const lines = [
                    `${src?.label ?? l.source} → ${dst?.label ?? l.target}`,
                    `${l.direction}: ${formatBytesPerSec(l.value)}`,
                    ...(l.splitAmong !== undefined
                      ? [`evenly split estimate across ${String(l.splitAmong)} pods`]
                      : []),
                    ...(l.maxBytesPerSec !== undefined ? [`QoS ceiling ${formatBytesPerSec(l.maxBytesPerSec)}`] : []),
                    ...(l.maxIops !== undefined ? [`QoS ceiling ${String(l.maxIops)} IOPS`] : []),
                  ];
                  setTip({ x: ev.clientX, y: ev.clientY, text: lines });
                }}
                onMouseLeave={() => setTip(null)}
              />
            );
          })}
          {layout.nodes.map((n) => {
            const node = graph.nodes.find((g) => g.id === n.id);
            const faded = lit !== null && !lit.nodeIds.has(n.id);
            return (
              <g
                key={n.id}
                data-testid={`sankey-node-${n.label}`}
                onMouseEnter={(ev) => {
                  setHoverId(n.id);
                  const inbound = graph.links.filter((l) => l.target === n.id);
                  const outbound = graph.links.filter((l) => l.source === n.id);
                  const sum = (list: typeof inbound, dir?: 'read' | 'write'): number =>
                    list.filter((l) => dir === undefined || l.direction === dir).reduce((acc, l) => acc + l.value, 0);
                  const flowLines =
                    mode === 'both'
                      ? [
                          `in read ${formatBytesPerSec(sum(inbound, 'read'))}`,
                          `in write ${formatBytesPerSec(sum(inbound, 'write'))}`,
                          `out read ${formatBytesPerSec(sum(outbound, 'read'))}`,
                          `out write ${formatBytesPerSec(sum(outbound, 'write'))}`,
                        ]
                      : [`in ${formatBytesPerSec(sum(inbound))}`, `out ${formatBytesPerSec(sum(outbound))}`];
                  const usage =
                    node !== undefined && (node.kind === 'pvc' || node.kind === 'netapp-aggr')
                      ? formatUsage(node.usage?.usedBytes, node.usage?.capacityBytes)
                      : undefined;
                  const lines = [
                    `${n.kind} / ${n.label}`,
                    ...(node?.kind === 'pod' && node.namespace !== undefined ? [`namespace ${node.namespace}`] : []),
                    ...flowLines,
                    ...(usage !== undefined && usage.length > 0 ? [usage] : []),
                    ...(node !== undefined &&
                    (node.kind === 'netapp-aggr' || node.kind === 'netapp-node') &&
                    node.health !== undefined
                      ? [`health ${node.health}`]
                      : []),
                  ];
                  setTip({ x: ev.clientX, y: ev.clientY, text: lines });
                }}
                onMouseLeave={() => {
                  setHoverId(null);
                  setTip(null);
                }}
                onClick={() => onLocateNode(n.id)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={n.x0}
                  y={n.y0}
                  width={Math.max(n.x1 - n.x0, 1)}
                  height={Math.max(n.y1 - n.y0, 1)}
                  fill={tokens.sankey.nodeFill}
                  stroke={tokens.sankey.nodeStroke}
                  opacity={faded ? 0.25 : 1}
                />
                <text x={n.x1 + 6} y={(n.y0 + n.y1) / 2} fill="currentColor" fontSize={11} dominantBaseline="middle">
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {tip !== null && (
        <div
          className="pointer-events-none fixed z-[1100] max-w-xs rounded bg-elevated px-2 py-1 text-xs shadow"
          style={{ left: tip.x + 12, top: tip.y + 12 }}
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
