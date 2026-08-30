import React, { useCallback, useEffect, useRef, useState } from 'react';

import { SearchIcon } from '../../../../shared/ui/icons';
import { nextNavigableIndex } from '../../keyboardNav';
import type { SearchResult } from '../../types';
import { DEFAULT_RESULT_CAP, ResultList } from '../ResultList';

import type { SearchBarProps } from './SearchBar.types';

// Debounce for fit-to-all-hits after typing pauses (design D5 / graph-search "Viewport fit").
export const SEARCH_FIT_DEBOUNCE_MS = 300;

// Canvas overlay layout (design D7) — keep in sync with HoverTooltip PINNED_STYLE.
// Same right inset as the pinned attributes card; pinned card docks below the bar.
export const SEARCH_BAR_TOP_PX = 8;
export const SEARCH_BAR_RIGHT_PX = 8;
/** Outer height of the search input chrome (Grafana Input + prefix). */
export const SEARCH_BAR_HEIGHT_PX = 36;
export const SEARCH_PINNED_STACK_GAP_PX = 8;
/** `top` for the pinned hover card so it sits under the always-visible SearchBar. */
export const PINNED_TOOLTIP_TOP_BELOW_SEARCH_PX = SEARCH_BAR_TOP_PX + SEARCH_BAR_HEIGHT_PX + SEARCH_PINNED_STACK_GAP_PX;

const ROOT_CLASS = 'pointer-events-auto absolute left-auto top-2 z-[1001] flex w-[min(360px,calc(100%-16px))] flex-col';
const INPUT_WRAP_CLASS = 'flex items-center gap-2 rounded bg-surface px-2 py-1 shadow';

export function SearchBar({
  query,
  onQueryChange,
  results,
  fitNodeIds,
  labelById,
  onLocate,
  onFitToIds,
}: Readonly<SearchBarProps>): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  // List visibility is independent of the query string (design D7 / graph-search "Result list").
  const [listOpen, setListOpen] = useState(false);
  // Track the result list we're highlighting against so a new list (query / data refresh)
  // resets the cursor without a setState-in-effect (React "adjust state when props change").
  const [highlightedForResults, setHighlightedForResults] = useState<readonly SearchResult[]>(results);
  if (results !== highlightedForResults) {
    setHighlightedForResults(results);
    setHighlightedIndex(-1);
  }

  // Latest fit targets / callback for the debounce timer + Enter flush. Updated in an
  // effect (not during render) so react-hooks/refs stays happy.
  const fitNodeIdsRef = useRef(fitNodeIds);
  const onFitToIdsRef = useRef(onFitToIds);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    fitNodeIdsRef.current = fitNodeIds;
    onFitToIdsRef.current = onFitToIds;
  }, [fitNodeIds, onFitToIds]);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const flushFitAll = useCallback(() => {
    clearDebounce();
    const ids = fitNodeIdsRef.current;
    if (ids.length > 0) {
      onFitToIdsRef.current(ids);
    }
  }, [clearDebounce]);

  // Debounced fit-to-all-hits on QUERY change (design D5). Clearing the query cancels any
  // pending fit and leaves the viewport in place — no snapshot/restore. The timer reads
  // the latest hit set through fitNodeIdsRef, so a collapse/visibility flip while a fit is
  // pending still re-aims it. `fitNodeIds` must NOT be a dep: it is a fresh array on every
  // data refresh and on every legend toggle, and this effect arms a NEW timer rather than
  // re-aiming a pending one — so with a query typed, each background poll would yank the
  // viewport back to fit-all-hits 300 ms later, undoing the user's pan/zoom.
  useEffect(() => {
    clearDebounce();
    if (query.trim().length === 0) {
      return;
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const ids = fitNodeIdsRef.current;
      if (ids.length > 0) {
        onFitToIdsRef.current(ids);
      }
    }, SEARCH_FIT_DEBOUNCE_MS);
    return clearDebounce;
  }, [query, clearDebounce]);

  const handleQueryChange = (value: string): void => {
    setHighlightedIndex(-1);
    // User typing opens the list when non-empty; empty query always closes it.
    setListOpen(value.trim().length > 0);
    onQueryChange(value);
  };

  // Locate + clear the query + dismiss the list (locate ends the search state — call
  // onQueryChange directly with '', not handleQueryChange, so clearing never re-opens the
  // list the way a typed-empty query would leave it).
  const activateLocate = (result: SearchResult): void => {
    if (result.filterHidden === true) {
      return;
    }
    onLocate(result);
    setListOpen(false);
    setHighlightedIndex(-1);
    onQueryChange('');
  };

  const handleFocus = (): void => {
    if (query.trim().length > 0) {
      setListOpen(true);
    }
  };

  const handleBlur = (): void => {
    setListOpen(false);
  };

  const handleKeyDown = (evt: React.KeyboardEvent<HTMLInputElement>): void => {
    // Keep Grafana's global Esc / shortcut handling out of the picture while focused.
    evt.stopPropagation();

    if (evt.key === 'ArrowDown') {
      evt.preventDefault();
      if (query.trim().length > 0) {
        setListOpen(true);
      }
      setHighlightedIndex((prev) => {
        const next = nextNavigableIndex(results, prev, 1);
        // Cap highlight to the visible window (result list only renders ≤50 rows).
        if (next >= DEFAULT_RESULT_CAP) {
          return prev;
        }
        return next >= 0 ? next : prev;
      });
      return;
    }
    if (evt.key === 'ArrowUp') {
      evt.preventDefault();
      if (query.trim().length > 0) {
        setListOpen(true);
      }
      setHighlightedIndex((prev) => {
        const next = nextNavigableIndex(results, prev, -1);
        // Same cap as ArrowDown: from -1 this wraps to the LAST result, which for a
        // >50-hit query is a row the list never rendered — nothing highlights, the
        // rowRef is undefined so no scrollIntoView happens, and Enter would locate a
        // node the user never saw.
        if (next >= DEFAULT_RESULT_CAP) {
          return prev;
        }
        return next >= 0 ? next : prev;
      });
      return;
    }
    if (evt.key === 'Enter') {
      evt.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < results.length) {
        const result = results[highlightedIndex];
        if (result !== undefined) {
          activateLocate(result);
        }
        return;
      }
      // No highlighted row → flush fit-to-all immediately (skip remaining debounce).
      flushFitAll();
      return;
    }
    if (evt.key === 'Escape') {
      evt.preventDefault();
      if (query.length > 0) {
        handleQueryChange('');
        // Input keeps focus (two-stage Esc: clear → blur).
        return;
      }
      inputRef.current?.blur();
    }
  };

  const showList = query.trim().length > 0 && listOpen;

  return (
    <div className={`${ROOT_CLASS} right-2`} data-testid="graph-search-bar">
      <div className={INPUT_WRAP_CLASS}>
        <SearchIcon size={16} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => handleQueryChange(e.currentTarget.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Search nodes…"
          aria-label="Search nodes"
          data-testid="graph-search-input"
          className="w-full border-0 bg-transparent text-sm text-primary outline-none"
        />
      </div>
      {showList && (
        <ResultList
          results={results}
          highlightedIndex={highlightedIndex}
          labelById={labelById}
          onLocate={activateLocate}
        />
      )}
    </div>
  );
}
