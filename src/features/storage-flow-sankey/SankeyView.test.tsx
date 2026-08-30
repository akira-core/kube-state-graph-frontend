import { fireEvent, render, screen } from '@testing-library/react';
import type cytoscape from 'cytoscape';
import { describe, expect, it, vi } from 'vitest';

import { SHOWCASE_GRAPH } from '../../shared/fixtures/showcaseGraph';
import { normalizeGraph } from '../graph-data';
import { ThemeProvider } from '../theme';

import { SankeyView } from './SankeyView';

const { elements } = normalizeGraph(SHOWCASE_GRAPH);

/** A refreshed payload in which `aggr1` no longer carries any measured flow. */
function withoutAggr1(): cytoscape.ElementDefinition[] {
  return elements.filter(
    (el) => el.group !== 'edges' || !((el.data as cytoscape.EdgeDataDefinition).target ?? '').endsWith('/aggr1')
  );
}

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

  it('clears the tooltip and highlight when a refresh removes the hovered node', () => {
    // The node is gone, so its mouseleave will never fire: without an explicit clear the
    // tooltip stays open and every remaining link is faded against a node that is not there.
    const { rerender } = render(
      <ThemeProvider>
        <div style={{ width: 800, height: 480 }}>
          <SankeyView
            elements={elements}
            status="ready"
            error={undefined}
            hasPayload
            demoMode
            visible
            onLocateNode={vi.fn()}
          />
        </div>
      </ThemeProvider>
    );
    fireEvent.mouseEnter(screen.getByTestId('sankey-node-aggr1'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    rerender(
      <ThemeProvider>
        <div style={{ width: 800, height: 480 }}>
          <SankeyView
            elements={withoutAggr1()}
            status="ready"
            error={undefined}
            hasPayload
            demoMode
            visible
            onLocateNode={vi.fn()}
          />
        </div>
      </ThemeProvider>
    );

    expect(screen.queryByTestId('sankey-node-aggr1')).not.toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^sankey-link-/).every((el) => el.getAttribute('stroke-opacity') === '0.7')).toBe(
      true
    );
  });

  it('keeps the highlight for a node that survives the refresh', () => {
    const { rerender } = render(
      <ThemeProvider>
        <div style={{ width: 800, height: 480 }}>
          <SankeyView
            elements={elements}
            status="ready"
            error={undefined}
            hasPayload
            demoMode
            visible
            onLocateNode={vi.fn()}
          />
        </div>
      </ThemeProvider>
    );
    fireEvent.mouseEnter(screen.getByTestId('sankey-node-aggr2'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    rerender(
      <ThemeProvider>
        <div style={{ width: 800, height: 480 }}>
          <SankeyView
            elements={withoutAggr1()}
            status="ready"
            error={undefined}
            hasPayload
            demoMode
            visible
            onLocateNode={vi.fn()}
          />
        </div>
      </ThemeProvider>
    );

    expect(screen.getByTestId('sankey-node-aggr2')).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });
});
