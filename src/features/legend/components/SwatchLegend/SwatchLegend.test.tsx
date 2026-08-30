import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

import { SwatchLegend } from './SwatchLegend';

const COMMON = { testId: 'demo-legend', rowTestIdPrefix: 'demo-legend-row-' } as const;
const TWO = [
  { name: 'worker-0', color: '#0ea5e9' },
  { name: 'worker-1', color: '#0ea5e9' },
];

describe('SwatchLegend', () => {
  it('renders nothing when there are no entries', () => {
    const { container } = render(<SwatchLegend title="Demo" entries={[]} {...COMMON} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is folded by default: no rows, count in title, collapsed caret', () => {
    render(<SwatchLegend title="Nodes" entries={TWO} {...COMMON} />);
    const legend = screen.getByTestId('demo-legend');
    expect(within(legend).queryAllByRole('listitem')).toHaveLength(0);
    expect(within(legend).getByRole('heading', { name: /Nodes/ })).toBeInTheDocument();
    const toggle = within(legend).getByTestId('demo-legend-fold-toggle');
    expect(toggle).toHaveTextContent('Nodes(2)');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands on toggle to reveal one row per entry, then re-folds', () => {
    render(<SwatchLegend title="Nodes" entries={TWO} {...COMMON} />);
    const legend = screen.getByTestId('demo-legend');
    const toggle = within(legend).getByTestId('demo-legend-fold-toggle');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(legend).getAllByRole('listitem')).toHaveLength(2);
    expect(within(legend).getByTestId('demo-legend-row-worker-0')).toBeInTheDocument();
    expect(within(legend).getByText('worker-1')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(legend).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('shows the entry count in the title whether folded or expanded', () => {
    render(<SwatchLegend title="Nodes" entries={TWO} {...COMMON} />);
    const toggle = screen.getByTestId('demo-legend-fold-toggle');
    expect(toggle).toHaveTextContent('Nodes(2)');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('Nodes(2)');
  });

  it('fires onToggleCollapseAll without changing fold state', () => {
    const onToggle = jest.fn();
    render(
      <SwatchLegend
        title="Nodes"
        entries={[{ name: 'worker-0', color: '#0ea5e9' }]}
        onToggleCollapseAll={onToggle}
        collapseToggleTestId="node-collapse-toggle"
        collapseNoun="nodes"
        {...COMMON}
      />
    );
    const foldToggle = screen.getByTestId('demo-legend-fold-toggle');
    expect(foldToggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByTestId('node-collapse-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    // Collapse-all is independent of fold: the section stays folded.
    expect(foldToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByLabelText('Collapse all nodes')).toBeInTheDocument();
  });

  it('renders no collapse toggle when onToggleCollapseAll is absent', () => {
    render(<SwatchLegend title="Nodes" entries={[{ name: 'worker-0', color: '#0ea5e9' }]} {...COMMON} />);
    expect(screen.queryByTestId('node-collapse-toggle')).not.toBeInTheDocument();
  });
});
