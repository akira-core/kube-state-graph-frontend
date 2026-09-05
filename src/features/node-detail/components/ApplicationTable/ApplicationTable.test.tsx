import { render, screen } from '@testing-library/react';
import React from 'react';

import type { DetailLookup } from '../../hooks/useNodeDetailUrls';

import { ApplicationTable } from './ApplicationTable';

describe('ApplicationTable (eager-prefetch Change Report)', () => {
  it('renders a headered table (Name / Current / Previous / Deployment Changes) with the application name', () => {
    const state: DetailLookup = { status: 'ready', url: 'https://x' };
    render(<ApplicationTable application="checkout" state={state} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Name', 'Current Version Time', 'Previous Version Time', 'Deployment Changes']);
    expect(screen.queryByRole('columnheader', { name: 'Change Report' })).not.toBeInTheDocument();
    expect(screen.getByText('checkout')).toBeInTheDocument();
  });

  it('renders a real anchor (href / target / rel) on a ready URL — never a button', () => {
    const state: DetailLookup = { status: 'ready', url: 'https://x' };
    render(<ApplicationTable application="checkout" state={state} />);
    // Assert anchor ATTRIBUTES — do NOT click it (jsdom does not navigate).
    const link = screen.getByTestId('application-url-link');
    expect(link).toHaveAttribute('href', 'https://x');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // Exactly one of the three states renders — no pending, no unavailable.
    expect(screen.queryByTestId('application-url-pending')).not.toBeInTheDocument();
    expect(screen.queryByTestId('application-url-unavailable')).not.toBeInTheDocument();
  });

  it('shows the muted "Not found" hint when unavailable (no link)', () => {
    const state: DetailLookup = { status: 'unavailable' };
    render(<ApplicationTable application="checkout" state={state} />);
    const unavailable = screen.getByTestId('application-url-unavailable');
    expect(unavailable).toHaveTextContent('Not found');
    expect(screen.queryByTestId('application-url-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('application-url-pending')).not.toBeInTheDocument();
  });

  it('shows a spinner hint while the lookup is in flight (no link, no unavailable)', () => {
    const state: DetailLookup = { status: 'loading' };
    render(<ApplicationTable application="checkout" state={state} />);
    expect(screen.getByTestId('application-url-pending')).toHaveTextContent('Looking up…');
    expect(screen.queryByTestId('application-url-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('application-url-unavailable')).not.toBeInTheDocument();
  });

  it('carries the full error message in title on an unavailable lookup (no link)', () => {
    const state: DetailLookup = { status: 'unavailable', error: 'Not Found' };
    render(<ApplicationTable application="checkout" state={state} />);
    const unavailable = screen.getByTestId('application-url-unavailable');
    expect(unavailable).toHaveAttribute('title', 'Not Found');
    expect(screen.queryByTestId('application-url-link')).not.toBeInTheDocument();
  });

  it('renders the Current / Previous diff timestamps (localized, ISO in title) on a ready lookup', () => {
    const state: DetailLookup = {
      status: 'ready',
      url: 'https://x',
      currentTime: '2026-06-16T10:30:00Z',
      previousTime: '2026-06-10T08:00:00Z',
    };
    render(<ApplicationTable application="checkout" state={state} timeZone="utc" />);
    const cur = screen.getByTestId('application-current');
    const prev = screen.getByTestId('application-previous');
    expect(cur.textContent).toContain('2026-06-16');
    expect(cur.getAttribute('title')).toBe('2026-06-16T10:30:00Z');
    expect(prev.textContent).toContain('2026-06-10');
    expect(prev.getAttribute('title')).toBe('2026-06-10T08:00:00Z');
    // the diff timestamps do not affect the link
    expect(screen.getByTestId('application-url-link')).toHaveAttribute('href', 'https://x');
  });

  it('shows muted "n/a" in Current / Previous when the ready lookup has no timestamps (link unaffected)', () => {
    const state: DetailLookup = { status: 'ready', url: 'https://x' };
    render(<ApplicationTable application="checkout" state={state} timeZone="utc" />);
    expect(screen.getByTestId('application-current').textContent).toBe('n/a');
    expect(screen.getByTestId('application-previous').textContent).toBe('n/a');
    expect(screen.getByTestId('application-current').getAttribute('title')).toBeNull();
    expect(screen.getByTestId('application-url-link')).toBeInTheDocument();
  });
});
