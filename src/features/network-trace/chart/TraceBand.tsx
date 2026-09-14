import type { JSX, MouseEvent } from 'react';

import { formatDeltaBps } from '../../../shared/format/measurements';
import type { ThemeTokens } from '../../../shared/theme/tokens';
import { LABEL_MIN_THICKNESS, ribbonPath } from '../../sankey-canvas';
import { OWN_T } from '../layout/constants';
import type { EdgeGeom } from '../layout/geometry';
import { backwardRibbon, lateralRibbon, ownLine } from '../layout/paths';
import type { TraceEdge } from '../model/types';

import { BACK_GRADIENT_ID, FLOW_GRADIENT_ID } from './TraceDefs';

export interface TraceBandProps {
  e: TraceEdge;
  g: EdgeGeom;
  tokens: ThemeTokens;
  active: boolean;
  onEnter: (e: TraceEdge, evt: MouseEvent) => void;
  onLeave: () => void;
}

export type BandKind = 'flow' | 'lateral' | 'back' | 'back-loop' | 'own';

export function bandKind(e: TraceEdge, g: EdgeGeom): BandKind {
  if (e.owns) {
    return 'own';
  }
  if (e.backward) {
    return g.backNear ? 'back' : 'back-loop';
  }
  return e.lateral ? 'lateral' : 'flow';
}

/**
 * One ribbon. Opacity follows the storage chart's hover rule (everything off the lit path
 * fades); a zero-value ribbon is dashed and half-opaque so "measured 0" reads apart from
 * "small". A backflow across several columns and an ownership line are stroked paths —
 * a filled band cannot be dashed or run a loop of constant width.
 */
export function TraceBand({ e, g, tokens, active, onEnter, onLeave }: Readonly<TraceBandProps>): JSX.Element {
  const kind = bandKind(e, g);
  const common = {
    'data-testid': 'trace-band',
    'data-band': kind,
    onMouseEnter: (evt: MouseEvent) => onEnter(e, evt),
    onMouseLeave: onLeave,
  } as const;
  if (kind === 'own') {
    return (
      <path
        {...common}
        d={ownLine(g)}
        fill="none"
        stroke={tokens.fg.muted}
        strokeOpacity={active ? 0.7 : 0.15}
        strokeWidth={OWN_T}
        strokeDasharray="5 4"
      />
    );
  }
  if (kind === 'back-loop') {
    return (
      <path
        {...common}
        d={backwardRibbon(g)}
        fill="none"
        stroke={tokens.sankey.traceBackward}
        strokeOpacity={active ? 0.6 : 0.12}
        strokeWidth={g.backT ?? g.t}
        strokeLinejoin="round"
        strokeLinecap="butt"
      />
    );
  }
  const isZero = e.bps === 0;
  const back = kind === 'back';
  const d = kind === 'lateral' ? lateralRibbon(g, g.bulge ?? 56) : ribbonPath(g.x1, g.y1, g.x2, g.y2, g.t);
  const arrowSize = Math.max(5, Math.min(9, g.t2 / 2));
  return (
    <>
      <path
        {...common}
        d={d}
        fill={`url(#${back ? BACK_GRADIENT_ID : FLOW_GRADIENT_ID})`}
        fillOpacity={isZero ? 0.4 : active ? 0.82 : 0.14}
        stroke={back ? tokens.sankey.traceBackward : tokens.sankey.traceFlow}
        strokeOpacity={0.3}
        strokeWidth={1}
        strokeDasharray={isZero ? '4 3' : undefined}
      />
      {kind === 'lateral' && (
        // The arc always ends on the target's right edge heading -x, so a fixed
        // left-pointing triangle is the arrow.
        <path
          d={`M${String(g.x2 + 4 + arrowSize * 2)},${String(g.y2 - arrowSize)} L${String(g.x2 + 4)},${String(g.y2)} L${String(g.x2 + 4 + arrowSize * 2)},${String(g.y2 + arrowSize)} Z`}
          fill={tokens.sankey.traceFlowEnd}
          fillOpacity={active ? 0.9 : 0.2}
          className="pointer-events-none"
        />
      )}
    </>
  );
}

/** The amount on a ribbon: on an arc's crown, on a loop's bottom run, else mid-ribbon. */
export function TraceBandLabel({
  e,
  g,
  tokens,
}: Readonly<{ e: TraceEdge; g: EdgeGeom; tokens: ThemeTokens }>): JSX.Element | null {
  if (e.owns || e.bps === 0 || g.t < LABEL_MIN_THICKNESS) {
    return null;
  }
  const loop = e.backward && !g.backNear;
  const mx = loop
    ? ((g.backXD ?? g.x1) + (g.backXU ?? g.x2)) / 2
    : e.lateral
      ? g.x1 + 0.72 * (g.bulge ?? 56)
      : (g.x1 + g.x2) / 2;
  const my = loop ? (g.backY ?? g.y1) - (g.backT ?? g.t) / 2 - 10 : (g.y1 + g.y2) / 2;
  return (
    <text
      x={mx}
      y={my + 4}
      textAnchor="middle"
      fontSize={10}
      fontWeight={600}
      fill={tokens.fg.primary}
      className="pointer-events-none"
      style={{ paintOrder: 'stroke', stroke: tokens.bg.canvas, strokeWidth: 3.5 }}
      data-testid="trace-band-label"
    >
      {formatDeltaBps(e.bps)}
    </text>
  );
}
