import { Fragment, type JSX, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

import type { ThemeTokens } from '../../shared/theme/tokens';
import {
  haloStyle,
  RibbonChevron,
  SankeyCanvas,
  SankeyCard,
  SankeyWrapperBox,
  type HoverLit,
  type Viewport,
  type ZoomPanApi,
} from '../sankey-canvas';

import { formatBytesPerSec } from './deriveSankey';
import type { LayoutLink, SankeyLayout } from './layoutSankey';

export interface SankeyChartProps {
  layout: SankeyLayout;
  tokens: ThemeTokens;
  viewport: Viewport;
  hostProps: ZoomPanApi['hostProps'];
  dragging: boolean;
  lit: HoverLit | null;
  onNodeEnter: (id: string, evt: MouseEvent) => void;
  onNodeLeave: () => void;
  onNodeClick: (id: string) => void;
  onLinkEnter: (link: LayoutLink, evt: MouseEvent) => void;
  onLinkLeave: () => void;
  onKeyDown: (evt: KeyboardEvent<HTMLDivElement>) => void;
  /** The chart's overlays (card search, zoom control bar) — see `SankeyCanvas`'s `overlay`. */
  children?: ReactNode;
}

/**
 * The storage-flow drawing: read / write ribbons, each ending in the shared direction
 * chevron, between the cards the shared canvas primitives draw. Everything about pan / zoom, the host, the column headers and the
 * card look lives in `sankey-canvas`; only what a storage ribbon IS is decided here.
 */
export function SankeyChart({
  layout,
  tokens,
  viewport,
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
  const halo = haloStyle(tokens);
  return (
    <SankeyCanvas
      columns={layout.columns}
      tokens={tokens}
      viewport={viewport}
      hostProps={hostProps}
      dragging={dragging}
      onKeyDown={onKeyDown}
      defs={
        <>
          <linearGradient id="ksg-sankey-grad-read" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={tokens.sankey.read} />
            <stop offset="1" stopColor={tokens.sankey.readGradientEnd} />
          </linearGradient>
          <linearGradient id="ksg-sankey-grad-write" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={tokens.sankey.write} />
            <stop offset="1" stopColor={tokens.sankey.writeGradientEnd} />
          </linearGradient>
        </>
      }
      overlay={children}
    >
      {layout.links.map((l) => {
        const active = lit === null || lit.keys.has(l.key);
        return (
          <Fragment key={l.key}>
            <path
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
            <RibbonChevron d={l.chevron} tokens={tokens} active={active} testId="sankey-link-chevron" />
          </Fragment>
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

      {layout.wrappers.map((w) => (
        <SankeyWrapperBox
          key={w.id}
          id={w.id}
          label={w.label}
          subtitle={w.subtitle}
          kind={w.kind}
          x={w.x}
          y={w.y}
          width={w.width}
          height={w.height}
          tokens={tokens}
          {...(w.status !== undefined ? { status: w.status } : {})}
          locatable={w.locatable}
          faded={lit !== null && !w.memberIds.some((id) => lit.nodeIds.has(id)) && !lit.nodeIds.has(w.id)}
          onEnter={onNodeEnter}
          onLeave={onNodeLeave}
          onClick={onNodeClick}
        />
      ))}

      {layout.nodes.map((n) => (
        <SankeyCard
          key={n.id}
          id={n.id}
          label={n.label}
          subtitle={n.subtitle}
          extraLines={n.extraLines}
          kind={n.kind}
          x={n.x}
          y={n.y}
          width={n.width}
          height={n.height}
          tokens={tokens}
          {...(n.status !== undefined ? { status: n.status } : {})}
          dashed={n.dashed}
          locatable={n.locatable}
          faded={lit !== null && !lit.nodeIds.has(n.id)}
          {...(n.namespaceColor !== undefined ? { namespaceColor: n.namespaceColor } : {})}
          onEnter={onNodeEnter}
          onLeave={onNodeLeave}
          onClick={onNodeClick}
        />
      ))}
    </SankeyCanvas>
  );
}
