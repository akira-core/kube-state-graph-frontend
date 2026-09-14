import type { JSX } from 'react';

import { SearchBar } from '../graph-search';

import type { SankeySearch } from './useSankeySearch';
import { ZOOM_PAN_IGNORE_ATTR } from './useZoomPan';

export interface SankeySearchOverlayProps {
  search: SankeySearch;
}

/**
 * The card search box, top-right over the chart. It renders inside the pan/zoom host (the
 * chart's `overlay` slot), so it opts out of the host's wheel zoom and drag pan — otherwise
 * the result list could never scroll and pressing in the input would start a pan. Typing
 * never reaches the chart shortcuts: the search box stops its own key events.
 */
export function SankeySearchOverlay({ search }: Readonly<SankeySearchOverlayProps>): JSX.Element {
  return (
    <div {...{ [ZOOM_PAN_IGNORE_ATTR]: '' }} className="cursor-auto">
      <SearchBar
        query={search.query}
        onQueryChange={search.setQuery}
        results={search.results}
        fitNodeIds={search.fitIds}
        onLocate={search.onLocate}
        onFitToIds={search.onFitToIds}
        testIdPrefix="sankey-search"
        placeholder="Search cards…"
        ariaLabel="Search cards"
      />
    </div>
  );
}
