import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SHOWCASE_GRAPH } from '../../shared/fixtures/showcaseGraph';
import { normalizeGraph } from '../graph-data';
import { ThemeProvider } from '../theme';

import { SankeyView } from './SankeyView';

const { elements } = normalizeGraph(SHOWCASE_GRAPH);

function renderSankey(
  overrides: {
    onLocateNode?: ReturnType<typeof vi.fn>;
    demoMode?: boolean;
  } = {}
): { onLocateNode: ReturnType<typeof vi.fn> } {
  const onLocateNode: ReturnType<typeof vi.fn> = overrides.onLocateNode ?? vi.fn();
  render(
    <ThemeProvider>
      <div style={{ width: 800, height: 480 }}>
        <SankeyView
          elements={elements}
          status="ready"
          error={undefined}
          hasPayload
          demoMode={overrides.demoMode ?? true}
          visible
          onLocateNode={onLocateNode}
        />
      </div>
    </ThemeProvider>
  );
  return { onLocateNode };
}

describe('SankeyView', () => {
  it('defaults to Both and draws distinct read and write links', () => {
    renderSankey();
    expect(screen.getByRole('radio', { name: /both/i })).toBeChecked();
    expect(screen.getAllByTestId('sankey-link-read').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('sankey-link-write').length).toBeGreaterThan(0);
  });

  it('shows a cluster selector for the fixture and an empty state for dr', () => {
    renderSankey();
    const select = screen.getByLabelText('Cluster');
    fireEvent.change(select, { target: { value: 'dr' } });
    expect(screen.getByTestId('sankey-empty-cluster')).toHaveTextContent('The selected cluster has no storage flow');
    expect(screen.queryByTestId('sankey-empty-mode')).not.toBeInTheDocument();
  });

  it('locates a node on click', () => {
    const { onLocateNode } = renderSankey();
    fireEvent.click(screen.getByTestId('sankey-node-aggr1'));
    expect(onLocateNode).toHaveBeenCalled();
  });

  it('shows a node tooltip with kind and label', () => {
    renderSankey();
    fireEvent.mouseEnter(screen.getByTestId('sankey-node-aggr1'));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('netapp-aggr');
    expect(tip).toHaveTextContent('aggr1');
  });
});
