import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { NamespaceLegend } from './NamespaceLegend';

describe('NamespaceLegend', () => {
  const entries = [
    { name: 'shop', color: '#e8833a' },
    { name: 'payments', color: '#c2407a' },
  ];

  it('renders a Namespaces swatch section with the entry count', () => {
    render(<NamespaceLegend namespaces={entries} />);
    expect(screen.getByTestId('namespace-legend')).toBeInTheDocument();
    expect(screen.getByTestId('namespace-legend-fold-toggle')).toHaveTextContent('Namespaces(2)');
  });

  it('reveals the namespace rows when expanded', () => {
    render(<NamespaceLegend namespaces={entries} />);
    fireEvent.click(screen.getByTestId('namespace-legend-fold-toggle'));
    expect(screen.getByTestId('namespace-legend-row-shop')).toBeInTheDocument();
    expect(screen.getByTestId('namespace-legend-row-payments')).toBeInTheDocument();
  });

  it('renders nothing when there are no namespaces (node mode passes none)', () => {
    const { container } = render(<NamespaceLegend namespaces={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('wires the collapse-all toggle (default allCollapsed false)', () => {
    const onToggleCollapseAll = jest.fn();
    render(<NamespaceLegend namespaces={entries} onToggleCollapseAll={onToggleCollapseAll} />);
    const toggle = screen.getByTestId('namespace-collapse-toggle');
    expect(toggle).toHaveAttribute('aria-label', 'Collapse all namespaces');
    fireEvent.click(toggle);
    expect(onToggleCollapseAll).toHaveBeenCalledTimes(1);
  });
});
