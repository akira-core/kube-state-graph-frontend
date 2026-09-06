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
  edgeType: ['pod-calls-pod', 'pvc-to-netapp-aggr'],
  problems: [],
};

function renderBar(filters: GraphFilters = DEFAULT_GRAPH_FILTERS) {
  const onValues = vi.fn();
  const onPrune = vi.fn();
  const onClear = vi.fn();
  render(<FilterBar filters={filters} options={OPTIONS} onValues={onValues} onPrune={onPrune} onClear={onClear} />);
  return { onValues, onPrune, onClear };
}

describe('FilterBar', () => {
  it('defaults the projection to the traffic graph', () => {
    renderBar();
    expect(screen.getByRole('button', { name: 'Projection' })).toHaveTextContent('Traffic graph');
  });

  it('offers a control for every dimension the backend narrows on', () => {
    renderBar();
    for (const label of ['Cluster', 'AZ', 'Env', 'Namespace', 'Edge type', 'Projection']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
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
      />
    );
    expect(screen.getByTestId('filter-problems').textContent).toContain('1 filter source');
  });

  it('accepts a custom identity value and refuses one on edge type', () => {
    const { onValues } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Cluster' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search Cluster' }), { target: { value: 'staging' } });
    fireEvent.click(screen.getByRole('option', { name: 'Use "staging"' }));
    expect(onValues).toHaveBeenCalledWith('cluster', ['staging']);

    onValues.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Edge type' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search Edge type' }), { target: { value: 'bogus-edge' } });
    expect(screen.queryByRole('option', { name: /Use "/ })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search Edge type' }), { key: 'Enter' });
    expect(onValues).not.toHaveBeenCalled();
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

  it('a selection made here reaches the backend request', () => {
    const filters: GraphFilters = { ...DEFAULT_GRAPH_FILTERS, namespace: ['shop'], prune: false };
    const url = buildGraphRequestUrl('/api/v1/graph', { kind: 'relative', window: '1h' }, filters);
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(params.get('namespace')).toBe('shop');
    expect(params.get('prune')).toBe('false');
  });
});
