import type { JSX, MouseEvent } from 'react';

import { formatDeltaBps } from '../../../shared/format/measurements';
import type { ThemeTokens } from '../../../shared/theme/tokens';
import { haloStyle, LABEL_MIN_THICKNESS } from '../../sankey-canvas';
import { OWN_T } from '../layout/constants';
import type { EdgeGeom } from '../layout/types';
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

/**
 * One ribbon. Opacity follows the storage chart's hover rule (everything off the lit path
 * fades); a zero-value ribbon is dashed and half-opaque so "measured 0" reads apart from
 * "small". A backflow across several columns and an ownership line are stroked paths —
 * a filled band cannot be dashed or run a loop of constant width. The kind and the path
 * come with the geometry: the layout built them once. Every amount ribbon ends in a
 * chevron (`Chevron`) saying which way the traffic goes.
 */
export function TraceBand({ e, g, tokens, active, onEnter, onLeave }: Readonly<TraceBandProps>): JSX.Element {
  const { kind } = g;
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
        d={g.d}
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
      <>
        <path
          {...common}
          d={g.d}
          fill="none"
          stroke={tokens.sankey.traceBackward}
          strokeOpacity={active ? 0.6 : 0.12}
          strokeWidth={g.backT ?? g.t}
          strokeLinejoin="round"
          strokeLinecap="butt"
        />
        {g.chevron !== undefined && <Chevron d={g.chevron} tokens={tokens} active={active} />}
      </>
    );
  }
  const isZero = e.bps === 0;
  const back = kind === 'back';
  let fillOpacity = active ? 0.82 : 0.14;
  if (isZero) {
    fillOpacity = 0.4;
  }
  return (
    <>
      <path
        {...common}
        d={g.d}
        fill={`url(#${back ? BACK_GRADIENT_ID : FLOW_GRADIENT_ID})`}
        fillOpacity={fillOpacity}

        stroke={back ? tokens.sankey.traceBackward : tokens.sankey.traceFlow}
        strokeOpacity={0.3}
        strokeWidth={1}
        strokeDasharray={isZero ? '4 3' : undefined}
      />
      {g.arrow !== undefined && (
        <path
          d={g.arrow}
          fill={tokens.sankey.traceFlowEnd}
          fillOpacity={active ? 0.9 : 0.2}
          className="pointer-events-none"
        />
      )}
      {g.chevron !== undefined && <Chevron d={g.chevron} tokens={tokens} active={active} />}
    </>
  );
}

/**
 * The direction mark inside a ribbon's target end. Stroked in the text colour: the ribbon
 * there is its gradient's end colour, which a filled mark of the same family would vanish into.
 */
function Chevron({ d, tokens, active }: Readonly<{ d: string; tokens: ThemeTokens; active: boolean }>): JSX.Element {
  return (
    <path
      d={d}
      fill="none"
      stroke={tokens.fg.primary}
      strokeOpacity={active ? 0.9 : 0.2}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none"
      data-testid="trace-band-chevron"
    />
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
  let mx: number;
  if (loop) {
    mx = ((g.backXD ?? g.x1) + (g.backXU ?? g.x2)) / 2;
  } else if (e.lateral) {
    mx = g.x1 + 0.72 * (g.bulge ?? 56);
  } else {
    mx = (g.x1 + g.x2) / 2;
  }
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
      style={haloStyle(tokens)}
      data-testid="trace-band-label"
    >
      {formatDeltaBps(e.bps)}
    </text>
  );
}
