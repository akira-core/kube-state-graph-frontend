import { memo, type JSX, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

import type { ThemeTokens } from '../../../shared/theme/tokens';
import { SankeyCanvas, type HoverLit, type Viewport, type ZoomPanApi } from '../../sankey-canvas';
import type { ClusterGeom, TraceGeometry } from '../layout/types';
import type { TraceEdge, TraceModelOk, TraceNode } from '../model/types';
import { mustGet } from '../model/util';

import { TraceBand, TraceBandLabel } from './TraceBand';
import { Residual, TraceCard, TraceClusterBox } from './TraceCards';
import { TraceDefs } from './TraceDefs';

export interface TraceDrawingProps {
  model: TraceModelOk;
  geo: TraceGeometry;
  tokens: ThemeTokens;
  /** `keys` are edge ids. */
  lit: HoverLit | null;
  onNodeEnter: (id: string, evt: MouseEvent) => void;
  onNodeLeave: () => void;
  onNodeClick: (id: string) => void;
  onBandEnter: (e: TraceEdge, evt: MouseEvent) => void;
  onBandLeave: () => void;
  onResidualEnter: (n: TraceNode, side: 'in' | 'out', evt: MouseEvent) => void;
  onResidualLeave: () => void;
}

export interface TraceChartProps extends TraceDrawingProps {
  viewport: Viewport;
  hostProps: ZoomPanApi['hostProps'];
  dragging: boolean;
  onKeyDown: (evt: KeyboardEvent<HTMLDivElement>) => void;
  /** The chart's overlays (card search, zoom control bar) — see `SankeyCanvas`'s `overlay`. */
  children?: ReactNode;
}

/**
 * The trace drawing inside the shared canvas. z-order: the cluster frames' boxes first
 * (they span columns, and would tint every ribbon between them), then ribbons, their
 * amounts, cards, the frames' titles (a ribbon must not cover them), residuals last (they
 * hang outside the cards and must not be covered).
 *
 * Memoised: a pan drag changes only the canvas's transform, and the view keeps every
 * prop here stable across those frames (the handlers are `useCallback`s, `lit` is memoised
 * in the stage), so the hundreds of cards and ribbons sit out each pointer move.
 */
export const TraceDrawing = memo(function TraceDrawing({
  model,
  geo,
  tokens,
  lit,
  onNodeEnter,
  onNodeLeave,
  onNodeClick,
  onBandEnter,
  onBandLeave,
  onResidualEnter,
  onResidualLeave,
}: Readonly<TraceDrawingProps>): JSX.Element {
  const E = (e: TraceEdge) => mustGet(geo.edges, e.id, 'edge geometry');
  const N = (id: string) => mustGet(geo.nodes, id, 'node geometry');
  const nodeFaded = (id: string): boolean => lit !== null && !lit.nodeIds.has(id);
  const clusterFaded = (cg: ClusterGeom): boolean =>
    lit !== null && !lit.nodeIds.has(cg.cluster.id) && !cg.cluster.memberIds.some((id) => lit.nodeIds.has(id));
  return (
    <>
      {geo.clusters.map((cg) => (
        <TraceClusterBox
          key={cg.cluster.id}
          cg={cg}
          tokens={tokens}
          faded={clusterFaded(cg)}
          layer="frame"
          onEnter={onNodeEnter}
          onLeave={onNodeLeave}
        />
      ))}
      {model.edges.map((e) => (
        <TraceBand
          key={e.id}
          e={e}
          g={E(e)}
          tokens={tokens}
          active={lit === null || lit.keys.has(e.id)}
          onEnter={onBandEnter}
          onLeave={onBandLeave}
        />
      ))}
      {model.edges.map((e) => (
        <TraceBandLabel key={`label-${e.id}`} e={e} g={E(e)} tokens={tokens} />
      ))}
      {model.nodes.map((n) => (
        <TraceCard
          key={n.id}
          n={n}
          g={N(n.id)}
          tokens={tokens}
          faded={nodeFaded(n.id)}
          onEnter={onNodeEnter}
          onLeave={onNodeLeave}
          onClick={onNodeClick}
        />
      ))}
      {geo.clusters.map((cg) => (
        <TraceClusterBox
          key={`title-${cg.cluster.id}`}
          cg={cg}
          tokens={tokens}
          faded={clusterFaded(cg)}
          layer="title"
          onEnter={onNodeEnter}
          onLeave={onNodeLeave}
        />
      ))}
      {model.nodes.flatMap((n) =>
        n.kind !== 'node'
          ? []
          : [...N(n.id).leftSlots, ...N(n.id).rightSlots]
              .filter((s) => s.res !== undefined)
              .map((s) => (
                <Residual
                  key={`${n.id}:${s.res ?? ''}`}
                  n={n}
                  g={N(n.id)}
                  slot={s}
                  tokens={tokens}
                  faded={nodeFaded(n.id)}
                  onEnter={onResidualEnter}
                  onLeave={onResidualLeave}
                />
              ))
      )}
    </>
  );
});

/** The shared canvas (pan/zoom host, headers, defs, overlays) around the memoised drawing. */
export function TraceChart({
  model,
  geo,
  tokens,
  viewport,
  hostProps,
  dragging,
  lit,
  onNodeEnter,
  onNodeLeave,
  onNodeClick,
  onBandEnter,
  onBandLeave,
  onResidualEnter,
  onResidualLeave,
  onKeyDown,
  children,
}: Readonly<TraceChartProps>): JSX.Element {
  return (
    <SankeyCanvas
      columns={geo.columns}
      tokens={tokens}
      viewport={viewport}
      hostProps={hostProps}
      dragging={dragging}
      onKeyDown={onKeyDown}
      defs={<TraceDefs tokens={tokens} />}
      overlay={children}
    >
      <TraceDrawing
        model={model}
        geo={geo}
        tokens={tokens}
        lit={lit}
        onNodeEnter={onNodeEnter}
        onNodeLeave={onNodeLeave}
        onNodeClick={onNodeClick}
        onBandEnter={onBandEnter}
        onBandLeave={onBandLeave}
        onResidualEnter={onResidualEnter}
        onResidualLeave={onResidualLeave}
      />
    </SankeyCanvas>
  );
}
