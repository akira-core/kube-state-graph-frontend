import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

import { NodeContainerLegend } from './NodeContainerLegend';

describe('NodeContainerLegend', () => {
  it('renders nothing when there are no node containers', () => {
    const { container } = render(<NodeContainerLegend nodes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a swatch per node container under a "Nodes" heading', () => {
    render(
      <NodeContainerLegend
        nodes={[
          { name: 'worker-0', color: '#0ea5e9' },
          { name: 'worker-2', color: '#8b5cf6' },
        ]}
      />
    );
    const legend = screen.getByTestId('node-container-legend');
    expect(within(legend).getByRole('heading', { name: /Nodes/ })).toBeInTheDocument();
    fireEvent.click(within(legend).getByTestId('node-container-legend-fold-toggle'));
    expect(within(legend).getAllByRole('listitem')).toHaveLength(2);
    expect(within(legend).getByTestId('node-container-legend-row-worker-0')).toBeInTheDocument();
    expect(within(legend).getByText('worker-2')).toBeInTheDocument();
  });

  it('fires the collapse toggle (shared node-collapse-toggle test id)', () => {
    const onToggle = jest.fn();
    render(<NodeContainerLegend nodes={[{ name: 'worker-0', color: '#0ea5e9' }]} onToggleCollapseAll={onToggle} />);
    fireEvent.click(screen.getByTestId('node-collapse-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('uses a custom title heading when provided (controller mode)', () => {
    render(
      <NodeContainerLegend nodes={[{ name: 'web', color: '#0ea5e9' }]} title="Controllers" collapseNoun="controllers" />
    );
    const legend = screen.getByTestId('node-container-legend');
    expect(within(legend).getByRole('heading', { name: /Controllers/ })).toBeInTheDocument();
  });
});
