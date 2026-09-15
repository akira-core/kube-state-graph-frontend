import type { JSX, MouseEvent } from 'react';

import { countWord } from '../../../shared/format/countWord';
import { formatDeltaBps } from '../../../shared/format/measurements';
import type { ThemeTokens } from '../../../shared/theme/tokens';
import { haloStyle, SankeyCard, SankeyWrapperBox, type SlotLabel } from '../../sankey-canvas';
import { DEVICE_KINDS, RES_GAP, RES_LEN } from '../layout/constants';
import type { NodeGeom, Slot, WrapperGeom } from '../layout/types';
import { locatable } from '../model/locatable';
import type { TraceNode } from '../model/types';

export interface TraceCardProps {
  n: TraceNode;
  g: NodeGeom;
  tokens: ThemeTokens;
  faded: boolean;
  onEnter: (id: string, evt: MouseEvent) => void;
  onLeave: () => void;
  onClick: (id: string) => void;
}

function slotLabels(g: NodeGeom): { left: SlotLabel[]; right: SlotLabel[] } {
  const pick = (slots: readonly Slot[]): SlotLabel[] =>
    slots.flatMap((s) =>
      s.res === undefined && s.iface !== undefined && s.iface !== '' ? [{ cy: s.cy, text: s.iface }] : []
    );
  return { left: pick(g.leftSlots), right: pick(g.rightSlots) };
}

/**
 * Every trace card is the shared `SankeyCard` — the same box, border weights, status
 * colours and text sizes as a storage card — fed different text. What varies per role is
 * only: the dashed "device" border (k8s node / pod / NetApp, and a trace-stop leaf) and
 * the interface names beside a hop's slots. The text comes with the geometry: the layout
 * formatted it once when it sized the card.
 */
export function TraceCard({ n, g, tokens, faded, onEnter, onLeave, onClick }: Readonly<TraceCardProps>): JSX.Element {
  const { text } = g;
  const isHop = n.kind === 'node';
  const dashed =
    (isHop && DEVICE_KINDS.includes(n.role)) ||
    n.kind === 'anchor' ||
    (n.kind === 'leaf' && (n.role === 'pod' || n.role === 'leaf'));
  return (
    <SankeyCard
      id={n.id}
      label={text.label}
      subtitle={text.subtitle}
      kind={n.kind === 'anchor' ? 'anchor' : n.role}

      x={g.x}
      y={g.y}
      width={g.w}
      height={g.h}
      tokens={tokens}
      {...(n.status !== null ? { status: n.status } : {})}
      dashed={dashed}
      locatable={locatable(n)}
      faded={faded}
      extraLines={text.extraLines}
      {...(isHop ? { slotLabels: slotLabels(g) } : {})}
      {...(text.cornerLabel !== undefined ? { cornerLabel: text.cornerLabel } : {})}
      testId={`trace-node-${text.label !== '' ? text.label : n.id}`}
      onEnter={onEnter}
      onLeave={onLeave}
      onClick={onClick}
    />
  );
}

export interface TraceWrapperProps {
  wg: WrapperGeom;
  tokens: ThemeTokens;
  faded: boolean;
  onEnter: (id: string, evt: MouseEvent) => void;
  onLeave: () => void;
  onClick: (id: string) => void;
}

export function TraceWrapperBox({
  wg,
  tokens,
  faded,
  onEnter,
  onLeave,
  onClick,
}: Readonly<TraceWrapperProps>): JSX.Element {
  const w = wg.wrapper;
  const count = w.podIds.length;
  return (
    <SankeyWrapperBox
      id={w.id}
      label={w.label}
      subtitle={w.noFlow ? 'node · no flow' : `node · ${countWord(count, 'pod')}`}
      kind="node"
      x={wg.x}
      y={wg.y}
      width={wg.w}
      height={wg.h}
      tokens={tokens}
      {...(w.status !== null ? { status: w.status } : {})}
      locatable={locatable(w)}
      faded={faded}
      testId={`trace-wrapper-${w.label}`}
      titleTestId={`trace-wrapper-title-${w.label}`}
      onEnter={onEnter}
      onLeave={onLeave}
      onClick={onClick}
    />
  );
}

export interface ResidualProps {
  n: TraceNode;
  g: NodeGeom;
  slot: Slot;
  tokens: ThemeTokens;
  faded: boolean;
  onEnter: (n: TraceNode, side: 'in' | 'out', evt: MouseEvent) => void;
  onLeave: () => void;
}

/**
 * A residual: a dashed block hugging the hop's outer edge, as tall as the ribbon the
 * amount would draw, never in the corridor. It reads straight off the slot, so what is
 * drawn and the space the layout reserved cannot disagree.
 */
export function Residual({ n, g, slot, tokens, faded, onEnter, onLeave }: Readonly<ResidualProps>): JSX.Element | null {
  if (slot.res === undefined) {
    return null;
  }
  const isIn = slot.res === 'in';
  const color = isIn ? tokens.sankey.traceResidualIn : tokens.sankey.traceResidualOut;
  const h = slot.thickness;
  const x = isIn ? g.x - RES_LEN : g.x + g.w;
  const textX = isIn ? x - RES_GAP : x + RES_LEN + RES_GAP;
  const anchor = isIn ? 'end' : 'start';
  const word = isIn ? 'other in' : 'other out';
  const halo = haloStyle(tokens);
  return (
    <g
      data-testid={`trace-residual-${slot.res}`}
      style={{ opacity: faded ? 0.3 : 1 }}
      onMouseEnter={(evt) => onEnter(n, isIn ? 'in' : 'out', evt)}
      onMouseLeave={onLeave}
    >
      <rect
        x={x}
        y={slot.cy - h / 2}
        width={RES_LEN}
        height={h}
        fill={color}
        fillOpacity={0.16}
        stroke={color}
        strokeWidth={1.4}
        strokeDasharray="4 3"
      />
      <text
        x={textX}
        y={slot.cy - 1}
        textAnchor={anchor}
        fontSize={10}
        fontWeight={600}
        fill={color}
        style={halo}
        className="pointer-events-none"
      >
        {word}
      </text>
      <text
        x={textX}
        y={slot.cy + 11}
        textAnchor={anchor}
        fontSize={10}
        fill={color}
        style={halo}
        className="pointer-events-none"
      >
        {formatDeltaBps(slot.bps ?? 0)}
      </text>
    </g>
  );
}
