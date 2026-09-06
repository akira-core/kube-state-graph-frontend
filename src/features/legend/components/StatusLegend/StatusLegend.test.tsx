import { render, screen } from '@testing-library/react';
import React from 'react';

import { STATUS_COLOR } from '../../../../shared/constants/colorByStatus';

import { StatusLegend } from './StatusLegend';

describe('StatusLegend', () => {
  it('renders one row per status', () => {
    render(<StatusLegend />);
    expect(screen.getByTestId('status-legend')).toBeInTheDocument();
    for (const status of Object.keys(STATUS_COLOR)) {
      expect(screen.getByTestId(`status-legend-row-${status}`)).toBeInTheDocument();
    }
    expect(screen.getByText('normal')).toBeInTheDocument();
    expect(screen.getByText('warning')).toBeInTheDocument();
    expect(screen.getByText('critical')).toBeInTheDocument();
  });

  it('colours each swatch from STATUS_COLOR', () => {
    render(<StatusLegend />);
    expect(screen.getByTestId('status-legend-swatch-critical')).toHaveStyle({
      backgroundColor: STATUS_COLOR.critical,
    });
  });
});
