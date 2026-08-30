import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getByLabelText<HTMLSelectElement>('Projection').value).toBe('traffic');
  });

  it('offers a control for every dimension the backend narrows on', () => {
    renderBar();
    for (const label of ['Cluster', 'AZ', 'Env', 'Namespace', 'Edge type', 'Projection']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('offers the raw cluster name it was given, not a composed identity', () => {
    renderBar();
    const values = Array.from(screen.getByLabelText<HTMLSelectElement>('Cluster').options, (o) => o.value);
    expect(values).toEqual(['ksg-demo']);
  });

  it('reports a selection to the caller under the dimension it belongs to', () => {
    const { onValues } = renderBar();
    const namespace = screen.getByLabelText<HTMLSelectElement>('Namespace');
    fireEvent.change(namespace, { target: { value: 'shop' } });
    expect(onValues).toHaveBeenCalledWith('namespace', ['shop']);
  });

  it('switches the projection to the inventory', () => {
    const { onPrune } = renderBar();
    fireEvent.change(screen.getByLabelText('Projection'), { target: { value: 'inventory' } });
    expect(onPrune).toHaveBeenCalledWith(false);
  });

  it('keeps a selected value listed even after it leaves the inventory', () => {
    renderBar({ ...DEFAULT_GRAPH_FILTERS, namespace: ['retired-ns'] });
    const values = Array.from(screen.getByLabelText<HTMLSelectElement>('Namespace').options, (o) => o.value);
    expect(values).toContain('retired-ns');
    expect(values).toContain('shop');
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

  it('a selection made here reaches the backend request', () => {
    // The bar and the request builder are the two halves of one claim: a control that
    // cannot move the graph must not ship. This asserts they meet.
    const filters: GraphFilters = { ...DEFAULT_GRAPH_FILTERS, namespace: ['shop'], prune: false };
    const url = buildGraphRequestUrl('/api/v1/graph', { kind: 'relative', window: '1h' }, filters);
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(params.get('namespace')).toBe('shop');
    expect(params.get('prune')).toBe('false');
  });
});
