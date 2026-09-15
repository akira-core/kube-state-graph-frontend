import { useCallback, useMemo, useState } from 'react';

import { matchRecords, type SearchRecord, type SearchResult } from '../graph-search';

import { unionRect, type Rect } from './geometry';
import type { HoverLit } from './SankeyCanvas';
import type { ZoomPanApi } from './useZoomPan';

export interface SankeySearchOptions {
  /** One record per drawn card (the view decides what is searchable). */
  records: readonly SearchRecord[];
  /** Content-space frame per record id — what locate and fit-to-hits aim at. */
  rects: ReadonlyMap<string, Rect>;
  /**
   * The union of the hover path of every id. Must be a stable callback over the derived
   * graph: a fresh identity re-walks every hit on each render, a pan drag included.
   */
  pathLit: (ids: ReadonlySet<string>) => HoverLit;
  fitToRect: ZoomPanApi['fitToRect'];
}

export interface SankeySearch {
  query: string;
  setQuery: (query: string) => void;
  results: readonly SearchResult[];
  fitIds: readonly string[];
  /** What the search keeps lit; `null` while no query is typed. Zero hits light nothing. */
  lit: HoverLit | null;
  onLocate: (result: SearchResult) => void;
  onFitToIds: (ids: readonly string[]) => void;
}

/**
 * The card search every Sankey-style chart shares: the Graph search box's hit rule over the
 * chart's own cards, each hit lit the way hovering it would be. Locate frames the card in
 * this chart — it never leaves for Graph view the way clicking a card does. The query is
 * page-transient and survives a refresh or a layout switch; hits the new drawing has no
 * card for drop out on their own.
 */
export function useSankeySearch({ records, rects, pathLit, fitToRect }: SankeySearchOptions): SankeySearch {
  const [query, setQuery] = useState('');
  const hits = useMemo(() => matchRecords(records, query), [records, query]);
  const active = query.trim().length > 0;
  const lit = useMemo(() => (active ? pathLit(hits.hitIds) : null), [active, hits.hitIds, pathLit]);
  const fitIds = useMemo(() => [...hits.hitIds], [hits.hitIds]);

  const onLocate = useCallback(
    (result: SearchResult) => {
      const rect = rects.get(result.id);
      if (rect !== undefined) {
        fitToRect(rect);
      }
    },
    [fitToRect, rects]
  );

  const onFitToIds = useCallback(
    (ids: readonly string[]) => {
      const box = unionRect(ids.flatMap((id) => rects.get(id) ?? []));
      if (box !== null) {
        fitToRect(box);
      }
    },
    [fitToRect, rects]
  );

  // One object per change of its parts, so the overlay (a memoised component) sits out the
  // renders a pan drag or a hover causes — every part is itself memoised or a stable setter.
  return useMemo(
    () => ({ query, setQuery, results: hits.results, fitIds, lit, onLocate, onFitToIds }),
    [fitIds, hits.results, lit, onFitToIds, onLocate, query]
  );
}
