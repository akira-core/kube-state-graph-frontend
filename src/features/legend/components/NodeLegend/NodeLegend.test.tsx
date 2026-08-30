import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

import { categoryForKind } from '../../../../shared/constants/categoryByKind';
import { ICON_SVG_BY_KIND } from '../../../../shared/constants/iconSvgByKind';

import { NodeLegend, type NodeLegendKindEntry } from './NodeLegend';

function entry(kind: string, overrides: Partial<NodeLegendKindEntry> = {}): NodeLegendKindEntry {
  return { kind, hidden: false, togglable: true, ...overrides };
}

describe('NodeLegend', () => {
  it('renders one entry per kind in ICON_SVG_BY_KIND', () => {
    render(<NodeLegend />);
    const legend = screen.getByTestId('node-legend');
    const kinds = Object.keys(ICON_SVG_BY_KIND);
    const items = within(legend).getAllByRole('listitem');
    expect(items).toHaveLength(kinds.length);
  });

  it('renders a Title-Case "Node Kinds" heading', () => {
    render(<NodeLegend />);
    const legend = screen.getByTestId('node-legend');
    expect(within(legend).getByRole('heading', { name: 'Node Kinds' })).toBeInTheDocument();
  });

  it('shows a label for every kind (display-name overrides applied)', () => {
    render(<NodeLegend />);
    const legend = screen.getByTestId('node-legend');
    for (const kind of Object.keys(ICON_SVG_BY_KIND)) {
      const label = kind === 'network' ? 'physical network' : kind;
      expect(within(legend).getByText(label)).toBeInTheDocument();
    }
  });

  it('draws an icon glyph next to every kind', () => {
    render(<NodeLegend />);
    const legend = screen.getByTestId('node-legend');
    for (const kind of Object.keys(ICON_SVG_BY_KIND)) {
      const row = within(legend).getByTestId(`node-legend-row-${kind}`);
      expect(within(row).getByTestId(`icon-glyph-${kind}`)).toBeInTheDocument();
    }
  });

  it('groups kinds under their super-category, and each kind sits in its category section', () => {
    render(<NodeLegend />);
    const legend = screen.getByTestId('node-legend');
    for (const kind of Object.keys(ICON_SVG_BY_KIND)) {
      const group = within(legend).getByTestId(`node-legend-group-${categoryForKind(kind)}`);
      expect(within(group).getByTestId(`node-legend-row-${kind}`)).toBeInTheDocument();
    }
  });

  it('lists only the entries passed in (present in the graph), grouped by category', () => {
    render(<NodeLegend entries={[entry('pod'), entry('service')]} />);
    const legend = screen.getByTestId('node-legend');
    expect(within(legend).getByTestId('node-legend-row-pod')).toBeInTheDocument();
    expect(within(legend).getByTestId('node-legend-row-service')).toBeInTheDocument();
    // kinds not passed in are absent
    expect(within(legend).queryByTestId('node-legend-row-pvc')).toBeNull();
    expect(within(legend).queryByTestId('node-legend-row-node')).toBeNull();
    // only categories with a present kind render a group
    expect(within(legend).getByTestId('node-legend-group-Workloads')).toBeInTheDocument();
    expect(within(legend).getByTestId('node-legend-group-Networking')).toBeInTheDocument();
    expect(within(legend).queryByTestId('node-legend-group-Storage')).toBeNull();
  });

  it('renders nothing when no entries are present', () => {
    const { container } = render(<NodeLegend entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an eye toggle per togglable row when onToggleKind is given, reporting the clicked kind', () => {
    const onToggleKind = jest.fn();
    render(<NodeLegend entries={[entry('pod'), entry('service')]} onToggleKind={onToggleKind} />);
    fireEvent.click(screen.getByTestId('node-legend-toggle-service'));
    expect(onToggleKind).toHaveBeenCalledTimes(1);
    expect(onToggleKind).toHaveBeenCalledWith('service');
  });

  it('renders no toggle without onToggleKind (read-only legend)', () => {
    render(<NodeLegend entries={[entry('pod')]} />);
    expect(screen.queryByTestId('node-legend-toggle-pod')).toBeNull();
  });

  it('renders no toggle on non-togglable rows (network wrapper / unknown kinds)', () => {
    const onToggleKind = jest.fn();
    render(
      <NodeLegend
        entries={[entry('pod'), entry('network', { togglable: false }), entry('mystery', { togglable: false })]}
        onToggleKind={onToggleKind}
      />
    );
    expect(screen.getByTestId('node-legend-toggle-pod')).toBeInTheDocument();
    expect(screen.queryByTestId('node-legend-toggle-network')).toBeNull();
    expect(screen.queryByTestId('node-legend-toggle-mystery')).toBeNull();
  });

  it('keeps a hidden row listed, flips the toggle to eye-slash/Show and dims glyph + label', () => {
    const onToggleKind = jest.fn();
    render(<NodeLegend entries={[entry('pod'), entry('service', { hidden: true })]} onToggleKind={onToggleKind} />);
    const hiddenRow = screen.getByTestId('node-legend-row-service');
    expect(within(hiddenRow).getByTestId('icon-glyph-service')).toBeInTheDocument();
    expect(within(hiddenRow).getByText('service')).toBeInTheDocument();
    // Toggle affordance flips: a visible row offers Hide, the hidden row offers Show.
    expect(screen.getByRole('button', { name: 'Hide pod' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show service' })).toBeInTheDocument();
    // Glyph and label fade on the hidden row only (emotion class diff).
    const visibleRow = screen.getByTestId('node-legend-row-pod');
    const glyphClass = (row: HTMLElement): string =>
      within(row).getByTestId(/icon-glyph/).parentElement?.className ?? '';
    expect(glyphClass(hiddenRow)).not.toBe(glyphClass(visibleRow));
  });
});
