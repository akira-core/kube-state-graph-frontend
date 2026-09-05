import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { LayoutModeControl } from './LayoutModeControl';

it('renders a Node|Controller segmented control and reports changes', () => {
  const onChange = jest.fn();
  render(<LayoutModeControl mode="node" onChange={onChange} />);
  expect(screen.getByText('Layout')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Controller'));
  expect(onChange).toHaveBeenCalledWith('controller');
});

it('reflects the current mode: the Node radio is checked when mode="node"', () => {
  render(<LayoutModeControl mode="node" onChange={jest.fn()} />);
  // RadioButtonGroup renders native <input type="radio"> elements; the active option
  // has checked=true, matching how @grafana/ui RadioButton works.
  expect(screen.getByLabelText('Node')).toBeChecked();
  expect(screen.getByLabelText('Controller')).not.toBeChecked();
});

it('renders an optional action slot on the Layout label row', () => {
  render(
    <LayoutModeControl mode="node" onChange={jest.fn()} action={<button data-testid="layout-action">x</button>} />
  );
  expect(screen.getByTestId('layout-action')).toBeInTheDocument();
});
