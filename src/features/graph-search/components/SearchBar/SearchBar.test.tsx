import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import type { SearchResult } from '../../types';

import { SEARCH_FIT_DEBOUNCE_MS, SearchBar } from './SearchBar';

const labelById = new Map<string, string>([
  ['ctrl', 'mongo'],
  ['app', 'shop-app'],
]);

function result(partial: Partial<SearchResult> & Pick<SearchResult, 'id' | 'label'>): SearchResult {
  return partial;
}

describe('SearchBar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function renderBar(
    overrides: Partial<{
      query: string;
      results: SearchResult[];
      fitNodeIds: string[];
      onQueryChange: jest.Mock;
      onLocate: jest.Mock;
      onFitToIds: jest.Mock;
    }> = {}
  ): {
    onQueryChange: jest.Mock;
    onLocate: jest.Mock;
    onFitToIds: jest.Mock;
  } {
    const onQueryChange = overrides.onQueryChange ?? jest.fn();
    const onLocate = overrides.onLocate ?? jest.fn();
    const onFitToIds = overrides.onFitToIds ?? jest.fn();
    render(
      <SearchBar
        query={overrides.query ?? ''}
        onQueryChange={onQueryChange}
        results={overrides.results ?? []}
        fitNodeIds={overrides.fitNodeIds ?? []}
        labelById={labelById}
        onLocate={onLocate}
        onFitToIds={onFitToIds}
      />
    );
    return { onQueryChange, onLocate, onFitToIds };
  }

  /** Open the result list for a controlled non-empty query (listOpen is focus-driven). */
  function focusInput(): HTMLElement {
    const input = screen.getByTestId('graph-search-input');
    // jsdom only moves document.activeElement via the real focus() API.
    act(() => {
      input.focus();
      fireEvent.focus(input);
    });
    return input;
  }

  it('renders a top-right search input always', () => {
    renderBar();
    expect(screen.getByTestId('graph-search-bar')).toBeInTheDocument();
    expect(screen.getByTestId('graph-search-input')).toBeInTheDocument();
    expect(screen.queryByTestId('search-result-list')).not.toBeInTheDocument();
  });

  it('shows the result list when focused with a non-empty query', () => {
    renderBar({
      query: 'mongo',
      results: [result({ id: 'p1', label: 'mongodb-0', kind: 'pod' })],
      fitNodeIds: ['p1'],
    });
    // Non-empty query alone does not open the list until focus (or typing).
    expect(screen.queryByTestId('search-result-list')).not.toBeInTheDocument();
    focusInput();
    expect(screen.getByTestId('search-result-list')).toBeInTheDocument();
    expect(screen.getByText('mongodb-0')).toBeInTheDocument();
    expect(screen.getByText('pod')).toBeInTheDocument();
  });

  it('opens the list when the user types a non-empty query (controlled re-render)', () => {
    const onQueryChange = jest.fn();
    const { rerender } = render(
      <SearchBar
        query=""
        onQueryChange={onQueryChange}
        results={[]}
        fitNodeIds={[]}
        labelById={labelById}
        onLocate={jest.fn()}
        onFitToIds={jest.fn()}
      />
    );
    fireEvent.change(screen.getByTestId('graph-search-input'), { target: { value: 'mongo' } });
    expect(onQueryChange).toHaveBeenCalledWith('mongo');
    // Parent applies the new query; listOpen was set true by typing.
    rerender(
      <SearchBar
        query="mongo"
        onQueryChange={onQueryChange}
        results={[result({ id: 'p1', label: 'mongodb-0', kind: 'pod' })]}
        fitNodeIds={['p1']}
        labelById={labelById}
        onLocate={jest.fn()}
        onFitToIds={jest.fn()}
      />
    );
    expect(screen.getByTestId('search-result-list')).toBeInTheDocument();
  });

  it('caps visible rows at 50 and shows "N more"', () => {
    const results = Array.from({ length: 120 }, (_, i) =>
      result({ id: `p${i}`, label: `pod-${String(i).padStart(3, '0')}` })
    );
    renderBar({ query: 'pod', results, fitNodeIds: results.map((r) => r.id) });
    focusInput();
    expect(screen.getByTestId('search-result-more')).toHaveTextContent('70 more');
    // First 50 rows render; the 51st label does not.
    expect(screen.getByText('pod-000')).toBeInTheDocument();
    expect(screen.queryByText('pod-050')).not.toBeInTheDocument();
  });

  it('renders a filter-hidden row as disabled with eye-slash; click is a no-op', () => {
    const onLocate = jest.fn();
    renderBar({
      query: 'svc',
      results: [
        result({ id: 's1', label: 'svc-a', kind: 'service', filterHidden: true }),
        result({ id: 's2', label: 'svc-b', kind: 'service' }),
      ],
      fitNodeIds: ['s2'],
      onLocate,
    });
    focusInput();
    const hidden = screen.getByTestId('search-result-s1');
    expect(hidden).toHaveAttribute('data-disabled', 'true');
    // Grafana Icon surfaces the name via data attributes / svg title rather than aria-label.
    expect(hidden.querySelector('svg')).toBeTruthy();
    fireEvent.click(hidden);
    expect(onLocate).not.toHaveBeenCalled();
  });

  it('annotates a collapsed hit with "in <container> (collapsed)"', () => {
    renderBar({
      query: 'mongo',
      results: [
        result({
          id: 'p1',
          label: 'mongodb-0',
          kind: 'pod',
          collapsedUnder: 'ctrl',
          context: { namespace: 'shop', cluster: 'prod' },
        }),
      ],
      fitNodeIds: ['ctrl'],
    });
    focusInput();
    expect(screen.getByText(/in mongo \(collapsed\)/)).toBeInTheDocument();
  });

  it('shows the matched non-label field on the subline', () => {
    renderBar({
      query: '10.0.3',
      results: [
        result({
          id: 'p1',
          label: 'pod-x',
          matchedField: { field: 'ipAddress', value: '10.0.3.17' },
        }),
      ],
      fitNodeIds: ['p1'],
    });
    focusInput();
    expect(screen.getByText(/ipAddress: 10\.0\.3\.17/)).toBeInTheDocument();
  });

  it('debounces fit-to-all-hits by 300ms on query change; zero hits never fit', () => {
    const onFitToIds = jest.fn();
    const { rerender } = render(
      <SearchBar
        query="m"
        onQueryChange={jest.fn()}
        results={[result({ id: 'p1', label: 'mongo' })]}
        fitNodeIds={['p1']}
        labelById={labelById}
        onLocate={jest.fn()}
        onFitToIds={onFitToIds}
      />
    );
    expect(onFitToIds).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(SEARCH_FIT_DEBOUNCE_MS - 1);
    });
    expect(onFitToIds).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onFitToIds).toHaveBeenCalledWith(['p1']);

    onFitToIds.mockClear();
    rerender(
      <SearchBar
        query="zzzz"
        onQueryChange={jest.fn()}
        results={[]}
        fitNodeIds={[]}
        labelById={labelById}
        onLocate={jest.fn()}
        onFitToIds={onFitToIds}
      />
    );
    act(() => {
      jest.advanceTimersByTime(SEARCH_FIT_DEBOUNCE_MS);
    });
    expect(onFitToIds).not.toHaveBeenCalled();
  });

  it('does not fit when the query is cleared (viewport stays put)', () => {
    const onFitToIds = jest.fn();
    const { rerender } = render(
      <SearchBar
        query="mongo"
        onQueryChange={jest.fn()}
        results={[result({ id: 'p1', label: 'mongo' })]}
        fitNodeIds={['p1']}
        labelById={labelById}
        onLocate={jest.fn()}
        onFitToIds={onFitToIds}
      />
    );
    act(() => {
      jest.advanceTimersByTime(SEARCH_FIT_DEBOUNCE_MS);
    });
    onFitToIds.mockClear();
    rerender(
      <SearchBar
        query=""
        onQueryChange={jest.fn()}
        results={[]}
        fitNodeIds={[]}
        labelById={labelById}
        onLocate={jest.fn()}
        onFitToIds={onFitToIds}
      />
    );
    act(() => {
      jest.advanceTimersByTime(SEARCH_FIT_DEBOUNCE_MS);
    });
    expect(onFitToIds).not.toHaveBeenCalled();
  });

  describe('keyboard', () => {
    const results = [
      result({ id: 'a', label: 'alpha' }),
      result({ id: 'b', label: 'beta', filterHidden: true }),
      result({ id: 'c', label: 'gamma' }),
    ];

    it('ArrowDown / ArrowUp skip disabled rows', () => {
      renderBar({ query: 'a', results, fitNodeIds: ['a', 'c'] });
      const input = focusInput();
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(screen.getByTestId('search-result-a')).toHaveAttribute('aria-selected', 'true');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(screen.getByTestId('search-result-c')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('search-result-b')).toHaveAttribute('aria-selected', 'false');
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(screen.getByTestId('search-result-a')).toHaveAttribute('aria-selected', 'true');
    });

    it('Enter locates the highlighted row, clears the query, and closes the list', () => {
      const onLocate = jest.fn();
      const onQueryChange = jest.fn();
      renderBar({ query: 'a', results, fitNodeIds: ['a', 'c'], onLocate, onQueryChange });
      const input = focusInput();
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onLocate).toHaveBeenCalledWith(results[0]);
      expect(onQueryChange).toHaveBeenCalledWith('');
      // Locate must fire before the clear, not after — the callback reads the still-current query.
      expect(onLocate.mock.invocationCallOrder[0]).toBeLessThan(onQueryChange.mock.invocationCallOrder[0]!);
      expect(screen.queryByTestId('search-result-list')).not.toBeInTheDocument();
    });

    it('Enter with no highlight flushes fit-to-all immediately (skips debounce)', () => {
      const onFitToIds = jest.fn();
      renderBar({
        query: 'a',
        results,
        fitNodeIds: ['a', 'c'],
        onFitToIds,
      });
      focusInput();
      // Debounce armed but not yet fired.
      expect(onFitToIds).not.toHaveBeenCalled();
      fireEvent.keyDown(screen.getByTestId('graph-search-input'), { key: 'Enter' });
      expect(onFitToIds).toHaveBeenCalledWith(['a', 'c']);
      // Advancing the original timer must not double-fire.
      act(() => {
        jest.advanceTimersByTime(SEARCH_FIT_DEBOUNCE_MS);
      });
      expect(onFitToIds).toHaveBeenCalledTimes(1);
    });

    it('Esc clears a non-empty query (keeps focus, closes list); second Esc blurs', () => {
      const onQueryChange = jest.fn();
      renderBar({ query: 'mongo', results: [result({ id: 'p1', label: 'mongo' })], onQueryChange });
      const input = focusInput();
      expect(document.activeElement).toBe(input);
      expect(screen.getByTestId('search-result-list')).toBeInTheDocument();

      fireEvent.keyDown(input, { key: 'Escape' });
      expect(onQueryChange).toHaveBeenCalledWith('');
      expect(document.activeElement).toBe(input);
      // List closes immediately via listOpen even before parent clears the query prop.
      expect(screen.queryByTestId('search-result-list')).not.toBeInTheDocument();

      // Simulate parent clearing the query, then second Esc blurs.
      onQueryChange.mockClear();
      const { onQueryChange: onChange2 } = renderBar({ query: '', results: [], onQueryChange: jest.fn() });
      const input2 = screen.getAllByTestId('graph-search-input').at(-1);
      expect(input2).toBeDefined();
      input2!.focus();
      fireEvent.keyDown(input2!, { key: 'Escape' });
      expect(onChange2).not.toHaveBeenCalled();
      expect(document.activeElement).not.toBe(input2);
    });

    it('keydown events stopPropagation so Grafana host shortcuts do not fire', () => {
      renderBar({ query: 'a', results, fitNodeIds: ['a'] });
      const input = screen.getByTestId('graph-search-input');
      const evt = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      const stopSpy = jest.spyOn(evt, 'stopPropagation');
      act(() => {
        input.dispatchEvent(evt);
      });
      expect(stopSpy).toHaveBeenCalled();
    });
  });

  it('clicking a result row locates it, clears the query, and closes the list', () => {
    const onLocate = jest.fn();
    const onQueryChange = jest.fn();
    const r = result({ id: 'p1', label: 'mongodb-0', kind: 'pod' });
    renderBar({ query: 'mongo', results: [r], fitNodeIds: ['p1'], onLocate, onQueryChange });
    focusInput();
    fireEvent.click(screen.getByTestId('search-result-p1'));
    expect(onLocate).toHaveBeenCalledWith(r);
    expect(onQueryChange).toHaveBeenCalledWith('');
    // Locate must fire before the clear, not after — the callback reads the still-current query.
    expect(onLocate.mock.invocationCallOrder[0]).toBeLessThan(onQueryChange.mock.invocationCallOrder[0]!);
    expect(screen.queryByTestId('search-result-list')).not.toBeInTheDocument();
  });

  it('the result list stays closed after locate even once the parent re-renders with an empty query', () => {
    const r = result({ id: 'p1', label: 'mongodb-0', kind: 'pod' });
    const { rerender } = render(
      <SearchBar
        query="mongo"
        onQueryChange={jest.fn()}
        results={[r]}
        fitNodeIds={['p1']}
        labelById={labelById}
        onLocate={jest.fn()}
        onFitToIds={jest.fn()}
      />
    );
    focusInput();
    fireEvent.click(screen.getByTestId('search-result-p1'));
    expect(screen.queryByTestId('search-result-list')).not.toBeInTheDocument();
    // Simulate the parent applying the onQueryChange('') the click just fired.
    rerender(
      <SearchBar
        query=""
        onQueryChange={jest.fn()}
        results={[]}
        fitNodeIds={[]}
        labelById={labelById}
        onLocate={jest.fn()}
        onFitToIds={jest.fn()}
      />
    );
    expect(screen.queryByTestId('search-result-list')).not.toBeInTheDocument();
  });

  it('blur hides the result list without clearing the query; focus reopens it', () => {
    const onQueryChange = jest.fn();
    renderBar({
      query: 'mongo',
      results: [result({ id: 'p1', label: 'mongodb-0', kind: 'pod' })],
      fitNodeIds: ['p1'],
      onQueryChange,
    });
    const input = focusInput();
    expect(screen.getByTestId('search-result-list')).toBeInTheDocument();

    fireEvent.blur(input);
    expect(screen.queryByTestId('search-result-list')).not.toBeInTheDocument();
    expect(onQueryChange).not.toHaveBeenCalled();

    fireEvent.focus(input);
    expect(screen.getByTestId('search-result-list')).toBeInTheDocument();
  });

  it('typing updates the controlled query via onQueryChange', () => {
    const onQueryChange = jest.fn();
    renderBar({ onQueryChange });
    fireEvent.change(screen.getByTestId('graph-search-input'), { target: { value: 'mongo' } });
    expect(onQueryChange).toHaveBeenCalledWith('mongo');
  });
});
