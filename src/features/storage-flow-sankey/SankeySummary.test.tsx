import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SankeySummary } from './SankeySummary';

const NODES = [
  { id: 'a', tier: 'pod', label: 'p', inbound: 1, outbound: 0, status: 'warning' as const },
  { id: 'b', tier: 'application', label: 'app', inbound: 1, outbound: 1, derived: true },
];

describe('SankeySummary', () => {
  it('states the cut only when shown is less than total', () => {
    const { rerender } = render(
      <SankeySummary nodes={NODES} namespaces={[]} applications={[]} podCut={{ shown: 10, total: 1000 }} />
    );
    expect(screen.getByTestId('sankey-summary')).toHaveTextContent('10 of 1000 pods');
    rerender(<SankeySummary nodes={NODES} namespaces={[]} applications={[]} podCut={{ shown: 10, total: 10 }} />);
    expect(screen.getByTestId('sankey-summary')).not.toHaveTextContent('of');
    rerender(<SankeySummary nodes={NODES} namespaces={[]} applications={[]} />);
    expect(screen.getByTestId('sankey-summary')).not.toHaveTextContent('of');
  });

  it('shows the missing-value placeholder for a derived row with no status', () => {
    render(<SankeySummary nodes={NODES} namespaces={[]} applications={[]} />);
    fireEvent.click(screen.getByTestId('sankey-summary-toggle'));
    const appRow = screen.getAllByRole('row').find((row) => row.textContent?.includes('app'));
    expect(appRow?.textContent).toContain('n/a');
  });

  it('a frame replaces its SVM’s row', () => {
    // The SVM display's `Group` emits one row per frame (tier `netapp-svm`, derived
    // inflow, no status) in place of the plain SVM card row — SankeySummary itself has no
    // SVM-specific code, so this is the same derived-row rendering any wrapper kind gets.
    const withFrame = [
      ...NODES,
      { id: 'svm_shop', tier: 'SVM', label: 'svm_shop', inbound: 5505024, outbound: 0, derived: true },
    ];
    render(<SankeySummary nodes={withFrame} namespaces={[]} applications={[]} />);
    fireEvent.click(screen.getByTestId('sankey-summary-toggle'));
    const svmRow = screen.getAllByRole('row').find((row) => row.textContent?.includes('svm_shop'));
    expect(svmRow).toBeDefined();
    expect(svmRow?.textContent).toContain('SVM');
    expect(svmRow?.textContent).toContain('n/a');
    expect(svmRow?.textContent).toContain('derived');
    expect(svmRow?.textContent).toContain('5.51 MB/s');
  });
});
