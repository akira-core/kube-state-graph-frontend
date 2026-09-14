import type { JSX, KeyboardEvent, ReactNode, RefObject } from 'react';

import type { ThemeTokens } from '../../shared/theme/tokens';

import type { Viewport, ZoomPanApi } from './useZoomPan';

/** The set of links and nodes to keep at full opacity while something is hovered. */
export interface HoverLit {
  keys: Set<string>;
  nodeIds: Set<string>;
}

export interface ColumnHeader {
  x: number;
  label: string;
}

export interface SankeyCanvasProps {
  columns: readonly ColumnHeader[];
  tokens: ThemeTokens;
  viewport: Viewport;
  hostRef: RefObject<HTMLDivElement>;
  hostProps: ZoomPanApi['hostProps'];
  dragging: boolean;
  onKeyDown: (evt: KeyboardEvent<HTMLDivElement>) => void;
  /** Gradient / pattern definitions the chart's ribbons reference by id. */
  defs?: ReactNode;
  /** The drawing itself, in content coordinates — placed inside the pan/zoom transform. */
  children: ReactNode;
  /**
   * The zoom control bar — rendered as a DOM descendant of this same focus-scoped
   * container (not a sibling) so clicking one of its buttons (e.g. "Focus mode") leaves
   * focus inside the region the `+`/`-`/`0`/`1`/`F`/`Esc` shortcuts are scoped to. A
   * sibling placement would strand keyboard `Esc` after a mouse click on "Focus mode".
   */
  overlay?: ReactNode;
}

/**
 * The pan/zoom host every Sankey-style chart draws into: one focusable div, one SVG, one
 * transform group, the column headers. What is drawn inside is the caller's (storage flow
 * cards, network trace cards) — this owns only the coordinate space and its chrome.
 */
export function SankeyCanvas({
  columns,
  tokens,
  viewport,
  hostRef,
  hostProps,
  dragging,
  onKeyDown,
  defs,
  children,
  overlay,
}: Readonly<SankeyCanvasProps>): JSX.Element {
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
        {defs !== undefined && <defs>{defs}</defs>}
        <g transform={`translate(${viewport.tx},${viewport.ty}) scale(${viewport.scale})`}>
          {columns.map((col) => (
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
          {children}
        </g>
      </svg>
      {overlay}
    </div>
  );
}
