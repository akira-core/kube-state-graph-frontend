import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

import { ClusterLegend } from './ClusterLegend';

describe('ClusterLegend', () => {
  it('renders nothing when there are no clusters', () => {
    const { container } = render(<ClusterLegend clusters={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a swatch and name per cluster', () => {
    render(
      <ClusterLegend
        clusters={[
          { name: 'demo', color: '#14b8a6' },
          { name: 'edge', color: '#ec4899' },
        ]}
      />
    );
    const legend = screen.getByTestId('cluster-legend');
    fireEvent.click(within(legend).getByTestId('cluster-legend-fold-toggle'));
    expect(within(legend).getAllByRole('listitem')).toHaveLength(2);
    expect(within(legend).getByText('demo')).toBeInTheDocument();
    expect(within(legend).getByText('edge')).toBeInTheDocument();
  });

  it('renders a collapse toggle and fires onToggleCollapseAll', () => {
    const onToggle = jest.fn();
    render(
      <ClusterLegend
        clusters={[{ name: 'demo', color: '#14b8a6' }]}
        onToggleCollapseAll={onToggle}
        allCollapsed={false}
      />
    );
    fireEvent.click(screen.getByTestId('cluster-collapse-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders no toggle when onToggleCollapseAll is absent', () => {
    render(<ClusterLegend clusters={[{ name: 'demo', color: '#14b8a6' }]} />);
    expect(screen.queryByTestId('cluster-collapse-toggle')).not.toBeInTheDocument();
  });
});
