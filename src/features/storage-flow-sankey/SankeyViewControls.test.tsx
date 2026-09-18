import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { STATUS_COLOR } from '../../shared/constants/colorByStatus';
import { ThemeProvider } from '../theme';

import { SankeyViewControls, type SankeyViewControlsProps } from './SankeyViewControls';

function renderControls(overrides: Partial<SankeyViewControlsProps> = {}): SankeyViewControlsProps {
  const props: SankeyViewControlsProps = {
    mode: 'both',
    onModeChange: vi.fn(),
    weight: 'throughput',
    onWeightChange: vi.fn(),
    podLayout: 'flat',
    onPodLayoutChange: vi.fn(),
    svmDisplay: 'column',
    onSvmDisplayChange: vi.fn(),
    svmAvailable: true,
    podCut: undefined,
    ...overrides,
  };
  render(
    <ThemeProvider>
      <SankeyViewControls {...props} />
    </ThemeProvider>
  );
  return props;
}

describe('SankeyViewControls', () => {
  it('reports every switch upward and owns none of them', () => {
    const props = renderControls();
    expect(screen.getByRole('radio', { name: 'Both' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Throughput' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Flat' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Column' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Write' }));
    fireEvent.click(screen.getByRole('radio', { name: 'IOPS' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Node' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Group' }));
    expect(props.onModeChange).toHaveBeenCalledWith('write');
    expect(props.onWeightChange).toHaveBeenCalledWith('iops');
    expect(props.onPodLayoutChange).toHaveBeenCalledWith('node');
    expect(props.onSvmDisplayChange).toHaveBeenCalledWith('group');
    expect(screen.getByRole('radio', { name: 'Both' })).toBeChecked();
    expect(screen.getByTestId('sankey-layout')).toBeInTheDocument();
    expect(screen.getByTestId('sankey-svm-display')).toBeInTheDocument();
  });

  it('Group is unavailable when no claim aggregate is reported', () => {
    renderControls({ svmAvailable: false });
    const group = screen.getByRole('radio', { name: 'Group' });
    expect(group).toBeDisabled();
    expect(screen.getByTestId('sankey-svm-display-reason')).toHaveTextContent(
      'The backend reports no claim aggregates'
    );
    expect(group).toHaveAttribute('aria-label', 'Group');
    expect(screen.getByRole('radio', { name: 'Column' })).toBeChecked();
  });

  it('states the cut as 10 of 15 pods while it hides a pod, and nothing otherwise', () => {
    renderControls({ podCut: { shown: 10, total: 15 } });
    expect(screen.getByTestId('sankey-top-pods-label')).toHaveTextContent('10 of 15 pods');
  });

  it('draws no cut statement when nothing is cut', () => {
    renderControls();
    expect(screen.queryByTestId('sankey-top-pods-label')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sankey-svm-display-reason')).not.toBeInTheDocument();
  });

  it('names the three status bands and the read / write swatches the mode draws', () => {
    renderControls({ mode: 'both' });
    const legend = screen.getByTestId('sankey-status-legend');
    for (const status of Object.keys(STATUS_COLOR)) {
      expect(within(legend).getByTestId(`sankey-status-swatch-${status}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('sankey-legend-read')).toHaveTextContent('read');
    expect(screen.getByTestId('sankey-legend-write')).toHaveTextContent('write');
  });

  it.each([
    ['read', true, false],
    ['write', false, true],
  ] as const)('shows only the %s swatch in %s mode', (mode, read, write) => {
    renderControls({ mode });
    expect(screen.queryByTestId('sankey-legend-read') !== null).toBe(read);
    expect(screen.queryByTestId('sankey-legend-write') !== null).toBe(write);
    expect(screen.getByTestId('sankey-status-legend')).toBeInTheDocument();
  });

  it('places the legend after the mode, Layout and SVM controls', () => {
    renderControls({ podCut: { shown: 1, total: 3 } });
    const legend = screen.getByTestId('sankey-legend');
    for (const testId of [
      'sankey-mode',
      'sankey-weight',
      'sankey-layout',
      'sankey-svm-display',
      'sankey-top-pods-label',
    ]) {
      expect(
        screen.getByTestId(testId).compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  });
});
