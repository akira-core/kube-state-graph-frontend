import type { JSX, KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react';

import { STATUS_COLOR } from '../../shared/constants/colorByStatus';
import type { ThemeTokens } from '../../shared/theme/tokens';

import { formatBytesPerSec } from './deriveSankey';
import type { LayoutLink, LayoutNode, LayoutWrapper, SankeyLayout } from './layoutSankey';
import type { Viewport, ZoomPanApi } from './useZoomPan';

export interface HoverLit {
  keys: Set<string>;
  nodeIds: Set<string>;
}

export interface SankeyChartProps {
  layout: SankeyLayout;
  tokens: ThemeTokens;
  viewport: Viewport;
  hostRef: RefObject<HTMLDivElement>;
  hostProps: ZoomPanApi['hostProps'];
  dragging: boolean;
  lit: HoverLit | null;
  onNodeEnter: (id: string, evt: MouseEvent) => void;
  onNodeLeave: () => void;
  onNodeClick: (id: string) => void;
  onLinkEnter: (link: LayoutLink, evt: MouseEvent) => void;
  onLinkLeave: () => void;
  onKeyDown: (evt: KeyboardEvent<HTMLDivElement>) => void;
  /**
   * The zoom control bar — rendered as a DOM descendant of this same focus-scoped
   * container (not a sibling) so clicking one of its buttons (e.g. "Focus mode") leaves
   * focus inside the region the `+`/`-`/`0`/`1`/`F`/`Esc` shortcuts are scoped to. A
   * sibling placement would strand keyboard `Esc` after a mouse click on "Focus mode".
   */
  children?: ReactNode;
}

const WRAPPER_TITLE_H = 40;

/**
 * Neutral border weight. A card carrying a status gets STATUS_BORDER_W instead — the same
 * "thicker AND coloured" pairing cytoscape draws in Graph view, so the two views read as
 * one estate rather than two opinions of it.
 */
const NEUTRAL_BORDER_W = 1.2;
const STATUS_BORDER_W = 2.4;

function wrapperBox(
  wrapper: LayoutWrapper,
  tokens: ThemeTokens,
  faded: boolean,
  onEnter: SankeyChartProps['onNodeEnter'],
  onLeave: () => void,
  onClick: (id: string) => void
): JSX.Element {
  const statusStroke = wrapper.status === undefined ? undefined : STATUS_COLOR[wrapper.status];
  return (
    <g
      key={wrapper.id}
      data-testid={`sankey-wrapper-${wrapper.label}`}
      data-kind="node"
      data-status={wrapper.status}
      style={{ opacity: faded ? 0.3 : 1 }}
    >
      <rect
        x={wrapper.x}
        y={wrapper.y}
        width={wrapper.width}
        height={wrapper.height}
        rx={12}
        fill={tokens.sankey.nodeFill}
        fillOpacity={0.35}
        stroke={statusStroke === undefined ? tokens.sankey.nodeStroke : statusStroke}
        strokeWidth={statusStroke === undefined ? NEUTRAL_BORDER_W : STATUS_BORDER_W}
        className="pointer-events-none"
      />
      <g
        data-testid={`sankey-wrapper-title-${wrapper.label}`}
        data-locatable="true"
        onMouseEnter={(evt) => onEnter(wrapper.id, evt)}
        onMouseLeave={onLeave}
        onClick={() => onClick(wrapper.id)}
        className="cursor-pointer"
      >
        <rect x={wrapper.x} y={wrapper.y} width={wrapper.width} height={WRAPPER_TITLE_H} fill="transparent" />
        <text
          x={wrapper.x + 10}
          y={wrapper.y + 15}
          fill={tokens.fg.primary}
          fontSize={11.5}
          fontWeight={600}
          className="pointer-events-none"
        >
          {wrapper.label}
        </text>
        <text
          x={wrapper.x + 10}
          y={wrapper.y + 32}
          fill={tokens.fg.secondary}
          fontSize={10}
          className="pointer-events-none"
        >
          {wrapper.subtitle}
        </text>
      </g>
    </g>
  );
}

function nodeCard(
  node: LayoutNode,
  tokens: ThemeTokens,
  faded: boolean,
  onEnter: SankeyChartProps['onNodeEnter'],
  onLeave: () => void,
  onClick: (id: string) => void
): JSX.Element {
  const statusStroke = node.status === undefined ? undefined : STATUS_COLOR[node.status];
  return (
    <g
      key={node.id}
      data-testid={`sankey-node-${node.label}`}
      data-kind={node.kind}
      data-status={node.status}
      data-locatable={node.locatable ? 'true' : 'false'}
      onMouseEnter={(evt) => onEnter(node.id, evt)}
      onMouseLeave={onLeave}
      onClick={node.locatable ? () => onClick(node.id) : undefined}
      className={node.locatable ? 'cursor-pointer' : 'cursor-default'}
      style={{ opacity: faded ? 0.3 : 1 }}
    >
      {node.namespaceColor !== undefined && (
        <rect
          x={node.x + 1.5}
          y={node.y + 5}
          width={4}
          height={node.height - 10}
          rx={2}
          fill={node.namespaceColor}
          data-testid="sankey-ns-stripe"
        />
      )}
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={9}
        fill={tokens.sankey.nodeFill}
        stroke={statusStroke === undefined ? tokens.sankey.nodeStroke : statusStroke}
        strokeWidth={statusStroke === undefined ? NEUTRAL_BORDER_W : STATUS_BORDER_W}
        strokeDasharray={node.dashed ? '6 4' : undefined}
      />
      <line x1={node.x} y1={node.y + 22} x2={node.x + node.width} y2={node.y + 22} stroke={tokens.border.weak} />
      <text
        x={node.x + 10}
        y={node.y + 15}
        fill={tokens.fg.primary}
        fontSize={11.5}
        fontWeight={600}
        className="pointer-events-none"
      >
        {node.label}
      </text>
      <text x={node.x + 10} y={node.y + 34} fill={tokens.fg.secondary} fontSize={10} className="pointer-events-none">
        {node.subtitle}
      </text>
    </g>
  );
}

export function SankeyChart({
  layout,
  tokens,
  viewport,
  hostRef,
  hostProps,
  dragging,
  lit,
  onNodeEnter,
  onNodeLeave,
  onNodeClick,
  onLinkEnter,
  onLinkLeave,
  onKeyDown,
  children,
}: Readonly<SankeyChartProps>): JSX.Element {
  const halo = { paintOrder: 'stroke', stroke: tokens.bg.canvas, strokeWidth: 3.5 } as const;
  return (
    <div
      ref={hostRef}
      className={
        dragging
          ? 'relative h-full w-full cursor-grabbing outline-none'
          : 'relative h-full w-full cursor-grab outline-none'
      }
      data-testid="sankey-chart-host"
      tabIndex={0}
      aria-label="Sankey diagram: scroll to zoom, drag to pan"
      onKeyDown={onKeyDown}
      {...hostProps}
    >
      {/*
        Deliberately NO `viewBox`, and nothing else may add one. Without it an SVG user
        unit is one CSS pixel, which is the coordinate space `useZoomPan` is written in
        throughout: `fitViewport` centres with pixel offsets against the ResizeObserver's
        measurement, the wheel anchor is `clientX - rect.left`, a drag adds raw
        `clientX`/`clientY` deltas to `tx`/`ty`, and `percent` reports `scale * 100` as a
        1:1 zoom level. A `viewBox` of the layout's own size (which this had) maps content
        onto the element a SECOND time, so `<g transform=scale(s)>` draws at s x the
        viewBox factor: `fit` squared its own scale — 2096x442 content in a 756px-wide
        box drew at 13%, not the 36% the control bar claimed — while pans moved short and
        the wheel drifted away from the cursor. Fitting belongs to the transform alone.
      */}
      <svg className="h-full w-full" data-testid="sankey-svg">
        <defs>
          <linearGradient id="ksg-sankey-grad-read" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={tokens.sankey.read} />
            <stop offset="1" stopColor={tokens.sankey.readGradientEnd} />
          </linearGradient>
          <linearGradient id="ksg-sankey-grad-write" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={tokens.sankey.write} />
            <stop offset="1" stopColor={tokens.sankey.writeGradientEnd} />
          </linearGradient>
        </defs>
        <g transform={`translate(${viewport.tx},${viewport.ty}) scale(${viewport.scale})`}>
          {layout.columns.map((col) => (
            <text
              key={col.label}
              x={col.x}
              y={24}
              fill={tokens.fg.muted}
              fontSize={10}
              fontWeight={600}
              className="pointer-events-none uppercase tracking-eyebrow"
              data-testid="sankey-column-header"
            >
              {col.label}
            </text>
          ))}

          {layout.links.map((l) => {
            const active = lit === null || lit.keys.has(l.key);
            return (
              <path
                key={l.key}
                d={l.path}
                fill={l.direction === 'read' ? 'url(#ksg-sankey-grad-read)' : 'url(#ksg-sankey-grad-write)'}
                fillOpacity={l.value === 0 ? 0.4 : active ? 0.82 : 0.14}
                stroke={l.direction === 'read' ? tokens.sankey.read : tokens.sankey.write}
                strokeOpacity={0.3}
                strokeWidth={1}
                strokeDasharray={l.value === 0 ? '4 3' : undefined}
                data-testid={`sankey-link-${l.direction}`}
                onMouseEnter={(evt) => onLinkEnter(l, evt)}
                onMouseLeave={onLinkLeave}
              />
            );
          })}

          {layout.links
            .filter((l) => l.showLabel)
            .map((l) => (
              <text
                key={`label-${l.key}`}
                x={l.labelX}
                y={l.labelY + 4}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill={tokens.fg.primary}
                className="pointer-events-none"
                style={halo}
              >
                {formatBytesPerSec(l.value)}
              </text>
            ))}

          {layout.wrappers.map((w) =>
            wrapperBox(
              w,
              tokens,
              lit !== null && !w.podIds.some((id) => lit.nodeIds.has(id)) && !lit.nodeIds.has(w.id),
              onNodeEnter,
              onNodeLeave,
              onNodeClick
            )
          )}

          {layout.nodes.map((n) =>
            nodeCard(n, tokens, lit !== null && !lit.nodeIds.has(n.id), onNodeEnter, onNodeLeave, onNodeClick)
          )}
        </g>
      </svg>
      {children}
    </div>
  );
}
