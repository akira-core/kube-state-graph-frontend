import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState, type JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ScopeSelect, type ScopeSelectProps } from './ScopeSelect';

function Harness({
  mode = 'multi',
  options = ['shop', 'infra', 'platform', 'kube-system'],
  initial = [],
  allowCustom = true,
  label = 'Namespace',
  optionLabel,
}: {
  mode?: ScopeSelectProps['mode'];
  options?: readonly string[];
  initial?: string[];
  allowCustom?: boolean;
  label?: string;
  optionLabel?: (value: string) => string;
}): JSX.Element {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <ScopeSelect
      label={label}
      mode={mode}
      options={options}
      value={value}
      onChange={setValue}
      allowCustom={allowCustom}
      {...(optionLabel !== undefined ? { optionLabel } : {})}
      testId="filter-namespace"
    />
  );
}

function open(name = 'Namespace'): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('listbox');
}

describe('ScopeSelect', () => {
  it('opens from click, Enter, Space and ArrowDown, and focuses the search input', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Namespace' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('combobox', { name: 'Search Namespace' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('combobox')).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });

    fireEvent.keyDown(trigger, { key: ' ' });
    expect(screen.getByRole('combobox')).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('combobox')).toHaveFocus();
  }, 15_000);

  it('searches and toggles in a multi-select without closing, keeping the query', () => {
    render(<Harness />);
    open();
    const search = screen.getByRole('combobox');
    fireEvent.change(search, { target: { value: 'sh' } });
    expect(screen.getByRole('option', { name: 'shop' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'infra' })).not.toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Namespace' })).toHaveAttribute('aria-expanded', 'true');
    expect(search).toHaveValue('sh');
    expect(within(screen.getByRole('button', { name: 'Namespace' })).getByText('shop')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'shop' })).toHaveAttribute('aria-selected', 'true');
  });

  it('empties the dimension from the All row', () => {
    render(<Harness initial={['shop', 'infra']} />);
    open();
    fireEvent.click(screen.getByRole('option', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'Namespace' })).toHaveTextContent('All');
    expect(screen.getByRole('option', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'shop' })).toHaveAttribute('aria-selected', 'false');
  });

  it('adds a custom value and marks it unlisted', () => {
    render(<Harness label="Cluster" options={['prod', 'dr']} />);
    open('Cluster');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'staging' } });
    fireEvent.click(screen.getByRole('option', { name: 'Use "staging"' }));
    const trigger = screen.getByRole('button', { name: 'Cluster' });
    expect(within(trigger).getByText('staging')).toBeInTheDocument();
    expect(within(trigger).getByText('staging').closest('[data-unlisted="true"]')).toBeTruthy();
  });

  it('does not offer a custom value when allowCustom is false', () => {
    const onChange = vi.fn();
    render(
      <ScopeSelect
        label="Edge type"
        mode="multi"
        options={['pod-calls-pod']}
        value={[]}
        onChange={onChange}
        allowCustom={false}
        testId="filter-edgeType"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edge type' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bogus-edge' } });
    expect(screen.queryByRole('option', { name: /Use "/ })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes on Escape and returns focus to the trigger without changing the selection', () => {
    render(<Harness initial={['shop']} />);
    const trigger = screen.getByRole('button', { name: 'Namespace' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(within(trigger).getByText('shop')).toBeInTheDocument();
  });

  it('summarises pill overflow and removes a pill immediately', () => {
    render(<Harness initial={['shop', 'infra', 'platform', 'kube-system']} />);
    const trigger = screen.getByRole('button', { name: 'Namespace' });
    expect(within(trigger).getByText('shop')).toBeInTheDocument();
    expect(within(trigger).getByText('infra')).toBeInTheDocument();
    expect(within(trigger).getByText('+2')).toBeInTheDocument();
    expect(within(trigger).queryByText('platform')).not.toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Remove Namespace shop' }));
    expect(within(trigger).queryByText('shop')).not.toBeInTheDocument();
    expect(within(trigger).getByText('+1')).toBeInTheDocument();
  });

  it('selects and closes in single-select', () => {
    render(
      <Harness
        mode="single"
        label="Projection"
        options={['true', 'false']}
        initial={['true']}
        allowCustom={false}
        optionLabel={(v) => (v === 'true' ? 'Traffic graph' : 'Full inventory')}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Projection' }));
    fireEvent.click(screen.getByRole('option', { name: 'Full inventory' }));
    expect(screen.getByRole('button', { name: 'Projection' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Projection' })).toHaveTextContent('Full inventory');
  });

  it('still opens with zero options when custom values are allowed, holding only search and the custom row', () => {
    render(<Harness label="AZ" options={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'AZ' }));
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    // Nothing listed and nothing selected: `All` would have nothing to empty.
    expect(screen.queryByRole('option')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zone-a' } });
    expect(screen.getAllByRole('option').map((el) => el.textContent)).toEqual(['Use "zone-a"']);
  });

  it('brings the All row back once a custom value is the only thing in the list', () => {
    // Otherwise a dimension with no enumerable options becomes a one-way door: the value
    // goes in and the only way out is the pill's own ×.
    render(<Harness label="AZ" options={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'AZ' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zone-a' } });
    fireEvent.click(screen.getByRole('option', { name: 'Use "zone-a"' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });

    expect(screen.getByRole('option', { name: 'All' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'AZ' })).toHaveTextContent('All');
  });

  it('shows an unselectable empty message when custom values are not allowed and there are no options', () => {
    render(<Harness label="Edge type" options={[]} allowCustom={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edge type' }));
    expect(screen.getByText('No options available')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('exposes listbox ARIA on the popover', () => {
    render(<Harness />);
    open();
    const list = screen.getByRole('listbox');
    expect(list).toHaveAttribute('aria-multiselectable', 'true');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-controls', list.id);
    expect(screen.getByRole('option', { name: 'All' })).toBeInTheDocument();
  });
});
