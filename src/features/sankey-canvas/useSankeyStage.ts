import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

import type { SearchRecord } from '../graph-search';

import type { Rect } from './geometry';
import type { LoadStatus } from './loadGate';
import type { HoverLit } from './SankeyCanvas';
import { useContainerSize } from './useContainerSize';
import { UNMEASURED_CONTAINER, useOpeningViewport } from './useOpeningViewport';
import { useSankeyKeyboard } from './useSankeyKeyboard';
import { useSankeySearch, type SankeySearch } from './useSankeySearch';
import { useSankeyTooltip, type SankeyTooltipApi } from './useSankeyTooltip';
import { useZoomPan, type Size, type ZoomPanApi } from './useZoomPan';

export interface SankeyStageOptions {
  status: LoadStatus;
  hasPayload: boolean;
  /** Intrinsic size of the current layout; `{0, 0}` while there is nothing to draw. */
  content: Size;
  /** False while the layout has nothing to draw; the opening viewport waits for content. */
  hasContent: boolean;
  focusMode: boolean;
  onFocusModeChange: (next: boolean) => void;
  /**
   * Whether the drawn body still has a card for this id. A refresh may remove the hovered
   * card, and its mouseleave never fires — this is how the stage notices. Stable over the
   * derived graph.
   */
  hasCard: (id: string) => boolean;
  /** What hovering one card lights. Stable over the derived graph. */
  hoverLit: (id: string) => HoverLit;
  /** The card search's inputs — see `useSankeySearch`. */
  records: readonly SearchRecord[];
  rects: ReadonlyMap<string, Rect>;
  pathLit: (ids: ReadonlySet<string>) => HoverLit;
  /** What the drawing is of; a new value opens fresh. See `useOpeningViewport`. */
  openingKey?: string | undefined;
}

export interface SankeyStage {
  /** The chart box: what the container is measured from and the tooltip is clamped to. */
  boxRef: RefObject<HTMLDivElement>;
  containerSize: Size | null;
  zoom: ZoomPanApi;
  tooltip: SankeyTooltipApi;
  handleKeyDown: (evt: KeyboardEvent<HTMLDivElement>) => void;
  hoverId: string | null;
  setHoverId: (id: string | null) => void;
  search: SankeySearch;
  /**
   * What stays at full opacity: the hovered card's path while a card is hovered, else the
   * search's, else `null` (everything). Hovering while a search is lit shows that card's
   * path alone; leaving it hands the chart back to the search.
   */
  lit: HoverLit | null;
}

/**
 * Everything a Sankey-style view owns besides its own model, layout and tooltip text: the
 * measured box, pan/zoom and its opening viewport, the tooltip, the keyboard shortcuts,
 * the hovered card and the card search — wired the one way both views need. A fix to any
 * of these lands here once.
 */
export function useSankeyStage({
  status,
  hasPayload,
  content,
  hasContent,
  focusMode,
  onFocusModeChange,
  hasCard,
  hoverLit,
  records,
  rects,
  pathLit,
  openingKey,
}: SankeyStageOptions): SankeyStage {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // The box only renders once the view's load gate has passed, so the measurement
  // re-attaches on exactly what decides that.
  const containerSize = useContainerSize(boxRef, `${status}:${String(hasPayload)}`);
  const zoom = useZoomPan(content, containerSize ?? UNMEASURED_CONTAINER);
  useOpeningViewport({ boxRef, content, containerSize, hasContent, setViewport: zoom.setViewport, openingKey });
  const tooltip = useSankeyTooltip(boxRef, zoom.dragging);
  const hideTip = tooltip.hide;
  const handleKeyDown = useSankeyKeyboard({ zoom, focusMode, onFocusModeChange });

  useEffect(() => {
    if (hoverId !== null && !hasCard(hoverId)) {
      setHoverId(null);
      hideTip();
    }
  }, [hasCard, hideTip, hoverId]);

  const hovered = useMemo(() => (hoverId === null ? null : hoverLit(hoverId)), [hoverId, hoverLit]);
  const search = useSankeySearch({ records, rects, pathLit, fitToRect: zoom.fitToRect });

  return {
    boxRef,
    containerSize,
    zoom,
    tooltip,
    handleKeyDown,
    hoverId,
    setHoverId,
    search,
    lit: hovered ?? search.lit,
  };
}
