import type { JSX, MouseEvent } from 'react';

import { STATUS_COLOR } from '../../shared/constants/colorByStatus';
import type { NodeStatus } from '../../shared/constants/types';
import type { ThemeTokens } from '../../shared/theme/tokens';

import { CARD_LINE_H } from './geometry';
import { haloStyle } from './textHalo';

const WRAPPER_TITLE_H = 40;

/**
 * Neutral border weight. A card carrying a status gets STATUS_BORDER_W instead — the same
 * "thicker AND coloured" pairing cytoscape draws in Graph view, so the two views read as
 * one estate rather than two opinions of it.
 */
const NEUTRAL_BORDER_W = 1.2;
const STATUS_BORDER_W = 2.4;

/** A short text placed beside a ribbon slot on the card's edge (an interface name). */
export interface SlotLabel {
  cy: number;
  text: string;
}

export interface SankeyCardProps {
  id: string;
  label: string;
  subtitle: string;
  /** Free-form kind word, exposed as `data-kind` for tests and styling hooks. */
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tokens: ThemeTokens;
  status?: NodeStatus;
  dashed?: boolean;
  locatable: boolean;
  faded: boolean;
  namespaceColor?: string;
  /** Extra body lines under the subtitle, one per CARD_LINE_H. */
  extraLines?: readonly string[];
  /** Interface names beside the ribbon slots on the left / right edge. */
  slotLabels?: { left: readonly SlotLabel[]; right: readonly SlotLabel[] };
  /** Small text in the top-right corner (`3 clients`). */
  cornerLabel?: string;
  testId?: string;
  onEnter: (id: string, evt: MouseEvent) => void;
  onLeave: () => void;
  onClick: (id: string) => void;
}

export function SankeyCard({
  id,
  label,
  subtitle,
  kind,
  x,
  y,
  width,
  height,
  tokens,
  status,
  dashed = false,
  locatable,
  faded,
  namespaceColor,
  extraLines,
  slotLabels,
  cornerLabel,
  testId,
  onEnter,
  onLeave,
  onClick,
}: Readonly<SankeyCardProps>): JSX.Element {
  const statusStroke = status === undefined ? undefined : STATUS_COLOR[status];
  return (
    <g
      data-testid={testId ?? `sankey-node-${label}`}
      data-kind={kind}
      data-status={status}
      data-locatable={locatable ? 'true' : 'false'}
      onMouseEnter={(evt) => onEnter(id, evt)}
      onMouseLeave={onLeave}
      onClick={locatable ? () => onClick(id) : undefined}
      className={locatable ? 'cursor-pointer' : 'cursor-default'}
      style={{ opacity: faded ? 0.3 : 1 }}
    >
      {namespaceColor !== undefined && (
        <rect
          x={x + 1.5}
          y={y + 5}
          width={4}
          height={height - 10}
          rx={2}
          fill={namespaceColor}
          data-testid="sankey-ns-stripe"
        />
      )}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={9}
        fill={tokens.sankey.nodeFill}
        stroke={statusStroke === undefined ? tokens.sankey.nodeStroke : statusStroke}
        strokeWidth={statusStroke === undefined ? NEUTRAL_BORDER_W : STATUS_BORDER_W}
        strokeDasharray={dashed ? '6 4' : undefined}
      />
      <line x1={x} y1={y + 22} x2={x + width} y2={y + 22} stroke={tokens.border.weak} />
      <text
        x={x + 10}
        y={y + 15}
        fill={tokens.fg.primary}
        fontSize={11.5}
        fontWeight={600}
        className="pointer-events-none"
      >
        {label}
      </text>
      {cornerLabel !== undefined && (
        <text
          x={x + width - 10}
          y={y + 15}
          textAnchor="end"
          fill={tokens.fg.muted}
          fontSize={9.5}
          className="pointer-events-none"
          data-testid="sankey-card-corner"
        >
          {cornerLabel}
        </text>
      )}
      <text x={x + 10} y={y + 34} fill={tokens.fg.secondary} fontSize={10} className="pointer-events-none">
        {subtitle}
      </text>
      {extraLines?.map((line, i) => (
        <text
          // Lines are positional content (a table row, an attribute), not identities.
          key={`${String(i)}:${line}`}
          x={x + 10}
          y={y + 34 + CARD_LINE_H * (i + 1)}
          fill={tokens.fg.secondary}
          fontSize={10}
          className="pointer-events-none font-mono"
          data-testid="sankey-card-line"
        >
          {line}
        </text>
      ))}
      {slotLabels?.left.map((s) => (
        <text
          key={`l${String(s.cy)}`}
          x={x + 8}
          y={s.cy + 3.5}
          fill={tokens.fg.muted}
          fontSize={9.5}
          className="pointer-events-none font-mono"
          data-testid="sankey-slot-label"
        >
          {s.text}
        </text>
      ))}
      {slotLabels?.right.map((s) => (
        <text
          key={`r${String(s.cy)}`}
          x={x + width - 8}
          y={s.cy + 3.5}
          textAnchor="end"
          fill={tokens.fg.muted}
          fontSize={9.5}
          className="pointer-events-none font-mono"
          data-testid="sankey-slot-label"
        >
          {s.text}
        </text>
      ))}
    </g>
  );
}

export interface SankeyWrapperBoxProps {
  id: string;
  label: string;
  subtitle: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tokens: ThemeTokens;
  status?: NodeStatus;
  locatable: boolean;
  faded: boolean;
  testId?: string;
  /** Test id of the title row — the only part of the frame that takes pointer events. */
  titleTestId?: string;
  /**
   * Which part to draw: `both` (default) for a frame that sits above the ribbons; a frame
   * that spans columns draws its `frame` (the box) under the ribbons and its `title` above
   * the cards, so neither the ribbons are tinted nor the title covered.
   */
  layer?: 'both' | 'frame' | 'title';
  onEnter: (id: string, evt: MouseEvent) => void;
  onLeave: () => void;
  onClick: (id: string) => void;
}

/** A frame around a group of member cards; only its title row takes pointer events. */
export function SankeyWrapperBox({
  id,
  label,
  subtitle,
  kind,
  x,
  y,
  width,
  height,
  tokens,
  status,
  locatable,
  faded,
  testId,
  titleTestId,
  layer = 'both',
  onEnter,
  onLeave,
  onClick,
}: Readonly<SankeyWrapperBoxProps>): JSX.Element {
  const statusStroke = status === undefined ? undefined : STATUS_COLOR[status];
  // A title drawn above the ribbons (the `title` layer) needs the halo to stay legible.
  const halo = layer === 'title' ? haloStyle(tokens) : undefined;
  const title =
    layer === 'frame' ? null : (
      <g
        data-testid={titleTestId ?? `sankey-wrapper-title-${label}`}
        data-locatable={locatable ? 'true' : 'false'}
        onMouseEnter={(evt) => onEnter(id, evt)}
        onMouseLeave={onLeave}
        onClick={locatable ? () => onClick(id) : undefined}
        className={locatable ? 'cursor-pointer' : 'cursor-default'}
      >
        <rect x={x} y={y} width={width} height={WRAPPER_TITLE_H} fill="transparent" />
        <text
          x={x + 10}
          y={y + 15}
          fill={tokens.fg.primary}
          fontSize={11.5}
          fontWeight={600}
          className="pointer-events-none"
          style={halo}
        >
          {label}
        </text>
        <text
          x={x + 10}
          y={y + 32}
          fill={tokens.fg.secondary}
          fontSize={10}
          className="pointer-events-none"
          style={halo}
        >
          {subtitle}
        </text>
      </g>
    );
  if (layer === 'title') {
    return <g style={{ opacity: faded ? 0.3 : 1 }}>{title}</g>;
  }
  return (
    <g
      data-testid={testId ?? `sankey-wrapper-${label}`}
      data-kind={kind}
      data-status={status}
      style={{ opacity: faded ? 0.3 : 1 }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={12}
        fill={tokens.sankey.nodeFill}
        fillOpacity={0.35}
        stroke={statusStroke === undefined ? tokens.sankey.nodeStroke : statusStroke}
        strokeWidth={statusStroke === undefined ? NEUTRAL_BORDER_W : STATUS_BORDER_W}
        className="pointer-events-none"
      />
      {title}
    </g>
  );
}
