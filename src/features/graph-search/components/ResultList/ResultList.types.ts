import type { SearchResult } from '../../types';

export interface ResultListProps {
  results: readonly SearchResult[];
  // Index into `results` of the keyboard-highlighted row; -1 means none. Disabled
  // (filter-hidden) rows may still appear in the list, but the parent skips them when
  // moving the highlight.
  highlightedIndex: number;
  // Display labels for collapsed-ancestor ids (proxy-hit annotation). Falls back to the
  // raw id when a label is missing.
  labelById: ReadonlyMap<string, string>;
  onLocate: (result: SearchResult) => void;
  // Cap for rendered rows; remaining hits surface as a trailing "N more" line.
  maxVisible?: number;
}
