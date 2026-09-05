import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { DashboardButton } from './DashboardButton';

function openMenu(trigger: HTMLElement): void {
  fireEvent.click(trigger);
}

describe('DashboardButton', () => {
  it('renders a new-tab link to the URL when ready with one link', () => {
    render(<DashboardButton state={{ status: 'ready', urls: [{ label: 'Dashboard', url: 'https://dash/n1' }] }} />);
    const btn = screen.getByTestId('node-detail-dashboard-button');
    expect(btn).toHaveAttribute('href', 'https://dash/n1');
    expect(btn).toHaveAttribute('target', '_blank');
    expect(btn).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders a Dashboards menu when ready with multiple links', () => {
    render(
      <DashboardButton
        state={{
          status: 'ready',
          urls: [
            { label: 'Metrics', url: 'https://dash/metrics' },
            { label: 'Logs', url: 'https://dash/logs' },
          ],
        }}
      />
    );
    expect(screen.queryByTestId('node-detail-dashboard-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('node-detail-dashboards-menu')).toBeInTheDocument();
    openMenu(screen.getByRole('button', { name: /Dashboards/i }));
    const metrics = screen.getByTestId('node-detail-dashboard-link-0');
    const logs = screen.getByTestId('node-detail-dashboard-link-1');
    expect(metrics).toHaveAttribute('href', 'https://dash/metrics');
    expect(logs).toHaveAttribute('href', 'https://dash/logs');
    expect(metrics).toHaveAttribute('target', '_blank');
    expect(logs).toHaveAttribute('target', '_blank');
  });

  it('exposes menu semantics on the multi-link trigger', () => {
    render(
      <DashboardButton
        state={{
          status: 'ready',
          urls: [
            { label: 'Metrics', url: 'https://dash/metrics' },
            { label: 'Logs', url: 'https://dash/logs' },
          ],
        }}
      />
    );
    const trigger = screen.getByRole('button', { name: /Dashboards/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    openMenu(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders the open menu outside the trigger container so it can escape an overflow:hidden ancestor', () => {
    const { container } = render(
      <DashboardButton
        state={{
          status: 'ready',
          urls: [
            { label: 'Metrics', url: 'https://dash/metrics' },
            { label: 'Logs', url: 'https://dash/logs' },
          ],
        }}
      />
    );
    openMenu(screen.getByRole('button', { name: /Dashboards/i }));
    const link = screen.getByTestId('node-detail-dashboard-link-0');
    // The menu is portaled to document.body so it can escape overflow:hidden ancestors.
    expect(container).not.toContainElement(link);
  });

  it('renders nothing when ready with zero links', () => {
    const { container } = render(<DashboardButton state={{ status: 'ready', urls: [] }} />);
    expect(screen.queryByTestId('node-detail-dashboard-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('node-detail-dashboards-menu')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while loading', () => {
    const { container } = render(<DashboardButton state={{ status: 'loading' }} />);
    expect(screen.queryByTestId('node-detail-dashboard-button')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when unavailable', () => {
    const { container } = render(<DashboardButton state={{ status: 'unavailable' }} />);
    expect(screen.queryByTestId('node-detail-dashboard-button')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
