import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeConfig } from '../runtime-config';
import { ThemeProvider } from '../theme';

import { AppShell } from './AppShell';

vi.mock('../graph-view', () => ({
  GraphView: () => <div data-testid="graph-view" />,
}));

vi.mock('../storage-flow-sankey', () => ({
  SankeyView: () => <div data-testid="sankey-view" />,
}));

const DEMO: RuntimeConfig = {
  endpoints: {},
  demoMode: true,
  refreshIntervalSeconds: 0,
  defaultLayout: 'fcose',
  theme: 'system',
};

// AppShell no longer supplies its own ThemeProvider — App owns the single one, so a
// second nested provider would give the app two theme controllers both writing
// `html.dark`. Mirror the real composition here.
function renderAt(path: string, config: RuntimeConfig = DEMO): ReturnType<typeof render> {
  window.history.pushState({}, '', path);
  return render(
    <ThemeProvider configTheme={config.theme}>
      <AppShell config={config} />
    </ThemeProvider>
  );
}

describe('AppShell routing', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('replaces / with /graph', async () => {
    renderAt('/');
    await waitFor(() => {
      expect(window.location.pathname).toBe('/graph');
    });
    expect(screen.getByTestId('graph-view')).toBeInTheDocument();
  });

  it('treats a trailing slash as /graph', () => {
    renderAt('/graph/');
    expect(screen.getByTestId('graph-view')).toBeInTheDocument();
    expect(screen.queryByText('Page not found')).not.toBeInTheDocument();
  });

  it('renders Sankey at /sankey', () => {
    renderAt('/sankey');
    expect(screen.getByTestId('sankey-view')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sankey' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows not-found for unknown paths and keeps the nav', async () => {
    renderAt('/foo/bar');
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Application' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Back to Graph' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/graph');
    });
    expect(screen.getByTestId('graph-view')).toBeInTheDocument();
  });

  it('shows the demo badge only in demo mode', () => {
    const { unmount } = renderAt('/graph', DEMO);
    expect(screen.getByTestId('demo-badge')).toBeInTheDocument();
    unmount();
    renderAt('/graph', { ...DEMO, demoMode: false });
    expect(screen.queryByTestId('demo-badge')).not.toBeInTheDocument();
  });
});
