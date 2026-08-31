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
  SankeyView: (props: { focusMode: boolean; onFocusModeChange: (next: boolean) => void }) => (
    <div data-testid="sankey-view" data-focus-mode={props.focusMode}>
      <button onClick={() => props.onFocusModeChange(!props.focusMode)}>toggle-sankey-focus</button>
    </div>
  ),
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

  it('routes relative to the app base url on a sub-path deployment', async () => {
    // `import.meta.env.BASE_URL` is what runtime-config already uses to find config.json.
    // Without it in the router, `/ksg/sankey` matches no route and the deep link the spec
    // requires lands on Page not found.
    vi.stubEnv('BASE_URL', '/ksg/');
    try {
      renderAt('/ksg/sankey');
      expect(screen.getByTestId('sankey-view')).toBeInTheDocument();
      expect(screen.queryByText('Page not found')).not.toBeInTheDocument();

      window.history.pushState({}, '', '/ksg/');
      const { unmount } = render(
        <ThemeProvider configTheme={DEMO.theme}>
          <AppShell config={DEMO} />
        </ThemeProvider>
      );
      await waitFor(() => {
        expect(window.location.pathname).toBe('/ksg/graph');
      });
      unmount();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('offers the filter bar only when there is a backend to narrow', () => {
    // Demo mode renders a bundled fixture: a filter that reaches no backend would accept a
    // selection and redraw identically.
    const { unmount } = renderAt('/graph', DEMO);
    expect(screen.queryByTestId('filter-bar')).not.toBeInTheDocument();
    unmount();
    // The graph request is left in flight on purpose: this test is about what the shell
    // offers, and a settling load would land its state update after the test.
    const fetchStub = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => undefined));
    try {
      renderAt('/graph', { ...DEMO, demoMode: false, endpoints: { graph: '/api/v1/graph' } });
      expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
    } finally {
      fetchStub.mockRestore();
    }
  });

  it('shows the demo badge only in demo mode', () => {
    const { unmount } = renderAt('/graph', DEMO);
    expect(screen.getByTestId('demo-badge')).toBeInTheDocument();
    unmount();
    renderAt('/graph', { ...DEMO, demoMode: false });
    expect(screen.queryByTestId('demo-badge')).not.toBeInTheDocument();
  });

  it('hides the top nav while Sankey is in focus mode, and restores it on exit', async () => {
    const user = userEvent.setup();
    renderAt('/sankey', DEMO);
    expect(screen.getByRole('navigation')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'toggle-sankey-focus' }));
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByTestId('sankey-view')).toHaveAttribute('data-focus-mode', 'true');

    await user.click(screen.getByRole('button', { name: 'toggle-sankey-focus' }));
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('drops focus mode when the user navigates away from Sankey by other means (browser back)', async () => {
    const user = userEvent.setup();
    renderAt('/graph', DEMO);
    await user.click(screen.getByRole('link', { name: 'Sankey' }));
    await waitFor(() => expect(window.location.pathname).toBe('/sankey'));

    await user.click(screen.getByRole('button', { name: 'toggle-sankey-focus' }));
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();

    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe('/graph'));
    await waitFor(() => {
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });
});
