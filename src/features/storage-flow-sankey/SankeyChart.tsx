import type { JSX, KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react';

import type { ThemeTokens } from '../../shared/theme/tokens';

import { formatBytesPerSec } from './deriveSankey';
import type { LayoutLink, LayoutNode, SankeyLayout } from './layoutSankey';
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

function nodeCard(
  node: LayoutNode,
  tokens: ThemeTokens,
  faded: boolean,
  onEnter: SankeyChartProps['onNodeEnter'],
  onLeave: () => void,
  onClick: (id: string) => void
): JSX.Element {
  return (
    <g
      key={node.id}
      data-testid={`sankey-node-${node.label}`}
      data-kind={node.kind}
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
        stroke={tokens.sankey.nodeStroke}
        strokeWidth={1.2}
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
      <svg
        className="h-full w-full"
        data-testid="sankey-svg"
        preserveAspectRatio="xMidYMid meet"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
      >
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

          {layout.nodes.map((n) =>
            nodeCard(n, tokens, lit !== null && !lit.nodeIds.has(n.id), onNodeEnter, onNodeLeave, onNodeClick)
          )}
        </g>
      </svg>
      {children}
    </div>
  );
}
