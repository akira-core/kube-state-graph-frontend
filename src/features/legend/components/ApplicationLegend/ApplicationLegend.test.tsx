import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { ApplicationLegend } from './ApplicationLegend';

describe('ApplicationLegend', () => {
  const entries = [
    { name: 'checkout', color: '#0ea5e9' },
    { name: 'mongo', color: '#14b8a6' },
  ];

  it('renders an Applications swatch section with the entry count', () => {
    render(<ApplicationLegend applications={entries} />);
    expect(screen.getByTestId('application-legend')).toBeInTheDocument();
    expect(screen.getByTestId('application-legend-fold-toggle')).toHaveTextContent('Applications(2)');
  });

  it('reveals the application rows when expanded', () => {
    render(<ApplicationLegend applications={entries} />);
    fireEvent.click(screen.getByTestId('application-legend-fold-toggle'));
    expect(screen.getByTestId('application-legend-row-checkout')).toBeInTheDocument();
    expect(screen.getByTestId('application-legend-row-mongo')).toBeInTheDocument();
  });

  it('renders nothing when there are no applications (node mode passes none)', () => {
    const { container } = render(<ApplicationLegend applications={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('wires the collapse-all toggle (default allCollapsed false)', () => {
    const onToggleCollapseAll = jest.fn();
    render(<ApplicationLegend applications={entries} onToggleCollapseAll={onToggleCollapseAll} />);
    const toggle = screen.getByTestId('application-collapse-toggle');
    expect(toggle).toHaveAttribute('aria-label', 'Collapse all applications');
    fireEvent.click(toggle);
    expect(onToggleCollapseAll).toHaveBeenCalledTimes(1);
  });
});
