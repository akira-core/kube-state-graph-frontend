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
});
