import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_GRAPH_FILTERS, type GraphFilters } from '../../shared/types/graphFilters';
import { buildGraphRequestUrl } from '../graph-data';

import { FilterBar } from './FilterBar';
import type { FilterOptions } from './useFilterOptions';

const OPTIONS: FilterOptions = {
  cluster: ['ksg-demo'],
  az: ['local-a', 'local-b'],
  env: ['demo'],
  namespace: ['shop', 'platform'],
  problems: [],
};

const QUERY = { dirty: false, inFlight: false, onQuery: vi.fn(), onCancel: vi.fn() };

function renderBar(
  filters: GraphFilters = DEFAULT_GRAPH_FILTERS,
  extra: Partial<Parameters<typeof FilterBar>[0]> = {}
) {
  const onValues = vi.fn();
  const onPrune = vi.fn();
  const onClear = vi.fn();
  const onQuery = extra.onQuery ?? vi.fn();
  const onCancel = extra.onCancel ?? vi.fn();
  render(
    <FilterBar
      filters={filters}
      options={OPTIONS}
      onValues={onValues}
      onPrune={onPrune}
      onClear={onClear}
      dirty={extra.dirty ?? false}
      inFlight={extra.inFlight ?? false}
      onQuery={onQuery}
      onCancel={onCancel}
    />
  );
  return { onValues, onPrune, onClear, onQuery, onCancel };
}

describe('FilterBar', () => {
  it('defaults the projection to the traffic graph', () => {
    renderBar();
    expect(screen.getByRole('button', { name: 'Projection' })).toHaveTextContent('Traffic graph');
  });

  it('offers a control for every dimension the backend narrows on', () => {
    renderBar();
    for (const label of ['Cluster', 'AZ', 'Env', 'Namespace', 'Projection']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('offers no edge-type control, because the backend narrows on no such parameter', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: 'Edge type' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('filter-edgeType')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^(Cluster|AZ|Env|Namespace)$/ })).toHaveLength(4);
  });

  it('offers the raw cluster name it was given, not a composed identity', () => {
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Cluster' }));
    expect(screen.getByRole('option', { name: 'ksg-demo' })).toBeInTheDocument();
  });

  it('reports a selection to the caller under the dimension it belongs to', () => {
    const { onValues } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Namespace' }));
    fireEvent.click(screen.getByRole('option', { name: 'shop' }));
    expect(onValues).toHaveBeenCalledWith('namespace', ['shop']);
  });

  it('offers Clear only once something is narrowed', () => {
    const { onClear } = renderBar();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled();
    expect(onClear).not.toHaveBeenCalled();
  });

  it('clears a narrowed selection back to the defaults', () => {
    const { onClear } = renderBar({ ...DEFAULT_GRAPH_FILTERS, cluster: ['ksg-demo'], prune: false });
    const clear = screen.getByRole('button', { name: 'Clear filters' });
    expect(clear).toBeEnabled();
    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('switches the projection to the inventory', () => {
    const { onPrune } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Projection' }));
    fireEvent.click(screen.getByRole('option', { name: 'Full inventory' }));
    expect(onPrune).toHaveBeenCalledWith(false);
  });

  it('keeps a selected value listed even after it leaves the inventory', () => {
    renderBar({ ...DEFAULT_GRAPH_FILTERS, namespace: ['retired-ns'] });
    fireEvent.click(screen.getByRole('button', { name: 'Namespace' }));
    expect(screen.getByRole('option', { name: 'retired-ns' })).toHaveAttribute('data-unlisted', 'true');
    expect(screen.getByRole('option', { name: 'shop' })).toBeInTheDocument();
  });

  it('names an unavailable option source instead of showing an empty control silently', () => {
    render(
      <FilterBar
        filters={DEFAULT_GRAPH_FILTERS}
        options={{ ...OPTIONS, cluster: [], problems: ['GET /metrics-api/... failed: 502'] }}
        onValues={vi.fn()}
        onPrune={vi.fn()}
        onClear={vi.fn()}
        {...QUERY}
      />
    );
    expect(screen.getByTestId('filter-problems').textContent).toContain('1 filter source');
  });

  it('accepts a custom value on every list dimension', () => {
    const { onValues } = renderBar();
    for (const [label, dimension] of [
      ['Cluster', 'cluster'],
      ['AZ', 'az'],
      ['Env', 'env'],
      ['Namespace', 'namespace'],
    ] as const) {
      onValues.mockClear();
      fireEvent.click(screen.getByRole('button', { name: label }));
      fireEvent.change(screen.getByRole('combobox', { name: `Search ${label}` }), { target: { value: 'typed' } });
      fireEvent.click(screen.getByRole('option', { name: 'Use "typed"' }));
      expect(onValues).toHaveBeenCalledWith(dimension, ['typed']);
    }
  });

  it('refuses a custom value on the projection, which is a closed set of positions', () => {
    const { onPrune } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Projection' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search Projection' }), { target: { value: 'sideways' } });
    expect(screen.queryByRole('option', { name: /Use "/ })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search Projection' }), { key: 'Enter' });
    expect(onPrune).not.toHaveBeenCalled();
  });

  it('summarises pill overflow on the trigger', () => {
    renderBar({
      ...DEFAULT_GRAPH_FILTERS,
      namespace: ['shop', 'platform', 'infra', 'kube-system'],
    });
    const trigger = screen.getByRole('button', { name: 'Namespace' });
    expect(within(trigger).getByText('shop')).toBeInTheDocument();
    expect(within(trigger).getByText('platform')).toBeInTheDocument();
    expect(within(trigger).getByText('+2')).toBeInTheDocument();
  });

  it('renders Query, accents it while dirty, and Cancel while in flight', () => {
    const { onQuery } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Query' }));
    expect(onQuery).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('query-button')).not.toHaveAttribute('data-dirty');
  });

  it('accents Query while the draft is dirty', () => {
    renderBar(DEFAULT_GRAPH_FILTERS, { dirty: true });
    expect(screen.getByTestId('query-button')).toHaveAttribute('data-dirty', 'true');
  });

  it('renders Cancel while in flight', () => {
    const { onCancel } = renderBar(DEFAULT_GRAPH_FILTERS, { inFlight: true });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Clear neither issues a request nor is wired to the URL — it only notifies the caller', () => {
    const { onClear, onQuery } = renderBar({ ...DEFAULT_GRAPH_FILTERS, cluster: ['ksg-demo'] });
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onQuery).not.toHaveBeenCalled();
  });

  it('a selection made here reaches the backend request', () => {
    const filters: GraphFilters = { ...DEFAULT_GRAPH_FILTERS, namespace: ['shop'], prune: false };
    const url = buildGraphRequestUrl('/api/v1/graph', { kind: 'relative', window: '1h' }, filters);
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(params.get('namespace')).toBe('shop');
    expect(params.get('prune')).toBe('false');
  });
});
