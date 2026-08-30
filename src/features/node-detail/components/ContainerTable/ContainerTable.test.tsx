import { render, screen, within } from '@testing-library/react';
import React from 'react';

import type { DetailLookup } from '../../hooks/useNodeDetailUrls';

import { ContainerTable } from './ContainerTable';

const containers = [
  { name: 'app', image: 'repo/app:1.2' },
  { name: 'sidecar', image: 'repo/sc:0.9' },
];

// The table's data rows (row 0 is the header row).
function dataRows(): HTMLElement[] {
  return screen.getAllByRole('row').slice(1);
}

describe('ContainerTable (eager-prefetch Change Report)', () => {
  it('renders a headered table (Name / Image / Change Type / Current / Previous / Code Changes); a ready container links, a missing one is unavailable', () => {
    const byName: Record<string, DetailLookup> = { app: { status: 'ready', url: 'https://x/app' } };
    render(<ContainerTable containers={containers} lookups={{ phase: 'settled', byName }} />);

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      'Name',
      'Image',
      'Change Type',
      'Current Version Time',
      'Previous Version Time',
      'Code Changes',
    ]);
    expect(screen.queryByRole('columnheader', { name: 'Change Report' })).not.toBeInTheDocument();

    const rows = dataRows();
    expect(rows).toHaveLength(2);

    // Exact matches: substring matching would let a layout that pollutes the Name
    // column with the image (or vice versa) pass.
    const first = within(rows[0]!).getAllByRole('cell');
    expect(first[0]).toHaveTextContent(/^app$/);
    expect(first[1]).toHaveTextContent(/^repo\/app:1\.2$/);

    // app row (present in byName) → a real anchor with the resolved URL.
    const appLink = within(rows[0]!).getByTestId('container-url-link');
    expect(appLink.getAttribute('href')).toBe('https://x/app');
    expect(appLink.getAttribute('target')).toBe('_blank');
    expect(appLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(within(rows[0]!).queryByTestId('container-url-unavailable')).not.toBeInTheDocument();

    // sidecar row (absent from byName) → muted "Not found" hint, no link.
    expect(within(rows[1]!).getByTestId('container-url-unavailable')).toHaveTextContent('Not found');
    expect(within(rows[1]!).queryByTestId('container-url-link')).not.toBeInTheDocument();

    // settled, so nothing is still loading anywhere.
    expect(screen.queryByTestId('container-url-pending')).not.toBeInTheDocument();
  });

  it('marks every row unavailable when the settled map is empty (no links, no spinners)', () => {
    render(<ContainerTable containers={containers} lookups={{ phase: 'settled', byName: {} }} />);

    const rows = dataRows();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(within(row).getByTestId('container-url-unavailable')).toHaveTextContent('Not found');
      expect(within(row).queryByTestId('container-url-link')).not.toBeInTheDocument();
      expect(within(row).queryByTestId('container-url-pending')).not.toBeInTheDocument();
    }
  });

  it('shows a spinner on every row while the map is loading (no links, no unavailable hints)', () => {
    render(<ContainerTable containers={containers} lookups={{ phase: 'loading', byName: {} }} />);

    const rows = dataRows();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(within(row).getByTestId('container-url-pending')).toHaveTextContent('Looking up…');
      expect(within(row).queryByTestId('container-url-link')).not.toBeInTheDocument();
      expect(within(row).queryByTestId('container-url-unavailable')).not.toBeInTheDocument();
    }
  });

  it('resolves each row independently: a ready container links while a missing one stays unavailable', () => {
    const byName: Record<string, DetailLookup> = { app: { status: 'ready', url: 'https://x/app' } };
    render(<ContainerTable containers={containers} lookups={{ phase: 'settled', byName }} />);

    const rows = dataRows();
    // Row 0 (app): a real anchor with the resolved URL — never clicked (jsdom does
    // not navigate); the attributes are the contract.
    const appLink = within(rows[0]!).getByTestId('container-url-link');
    expect(appLink.getAttribute('href')).toBe('https://x/app');
    expect(within(rows[0]!).queryByTestId('container-url-unavailable')).not.toBeInTheDocument();
    expect(within(rows[0]!).queryByTestId('container-url-pending')).not.toBeInTheDocument();

    // Row 1 (sidecar): absent from byName → the muted "Not found" hint, no link.
    expect(within(rows[1]!).getByTestId('container-url-unavailable')).toHaveTextContent('Not found');
    expect(within(rows[1]!).queryByTestId('container-url-link')).not.toBeInTheDocument();
    expect(within(rows[1]!).queryByTestId('container-url-pending')).not.toBeInTheDocument();
  });

  it('renders per-row Current / Previous diff timestamps (localized, ISO in title) on ready rows', () => {
    const byName: Record<string, DetailLookup> = {
      app: {
        status: 'ready',
        url: 'https://x/app',
        currentTime: '2026-06-16T10:30:00Z',
        previousTime: '2026-06-10T08:00:00Z',
      },
    };
    render(<ContainerTable containers={containers} lookups={{ phase: 'settled', byName }} timeZone="utc" />);
    const rows = dataRows();

    // app row carries timestamps (localized value + ISO title); its link is unaffected.
    const appCur = within(rows[0]!).getByTestId('container-current');
    expect(appCur.textContent).toContain('2026-06-16');
    expect(appCur.getAttribute('title')).toBe('2026-06-16T10:30:00Z');
    expect(within(rows[0]!).getByTestId('container-previous').getAttribute('title')).toBe('2026-06-10T08:00:00Z');
    expect(within(rows[0]!).getByTestId('container-url-link').getAttribute('href')).toBe('https://x/app');

    // sidecar row (unavailable) → muted "n/a" in both time columns.
    expect(within(rows[1]!).getByTestId('container-current').textContent).toBe('n/a');
    expect(within(rows[1]!).getByTestId('container-previous').textContent).toBe('n/a');
  });

  it('shows muted "n/a" time cells on loading rows', () => {
    render(<ContainerTable containers={containers} lookups={{ phase: 'loading', byName: {} }} timeZone="utc" />);
    for (const row of dataRows()) {
      expect(within(row).getByTestId('container-current').textContent).toBe('n/a');
      expect(within(row).getByTestId('container-previous').textContent).toBe('n/a');
    }
  });

  it('renders the per-row Change Type off the ready lookup; absent rows show muted "n/a"', () => {
    const byName: Record<string, DetailLookup> = {
      app: { status: 'ready', url: 'https://x/app', resultType: 'UPDATED' },
    };
    render(<ContainerTable containers={containers} lookups={{ phase: 'settled', byName }} />);
    const rows = dataRows();

    // app row carries result_type → its Change Type cell shows the value, and its link is
    // unaffected (independent best-effort columns).
    expect(within(rows[0]!).getByTestId('container-type').textContent).toBe('UPDATED');
    expect(within(rows[0]!).getByTestId('container-url-link').getAttribute('href')).toBe('https://x/app');

    // sidecar row (absent from byName) → muted "n/a".
    expect(within(rows[1]!).getByTestId('container-type').textContent).toBe('n/a');
  });

  it('renders an unknown result_type verbatim through the table (visible-by-default, not silently dropped)', () => {
    const byName: Record<string, DetailLookup> = {
      app: { status: 'ready', url: 'https://x/app', resultType: 'MIGRATED' },
    };
    render(<ContainerTable containers={containers} lookups={{ phase: 'settled', byName }} />);
    expect(within(dataRows()[0]!).getByTestId('container-type').textContent).toBe('MIGRATED');
  });

  it('shows muted "n/a" Change Type on a ready row that carries no result_type', () => {
    const byName: Record<string, DetailLookup> = { app: { status: 'ready', url: 'https://x/app' } };
    render(<ContainerTable containers={containers} lookups={{ phase: 'settled', byName }} />);
    expect(within(dataRows()[0]!).getByTestId('container-type').textContent).toBe('n/a');
  });

  it('shows muted "n/a" Change Type cells on loading rows', () => {
    render(<ContainerTable containers={containers} lookups={{ phase: 'loading', byName: {} }} />);
    for (const row of dataRows()) {
      expect(within(row).getByTestId('container-type').textContent).toBe('n/a');
    }
  });
});
