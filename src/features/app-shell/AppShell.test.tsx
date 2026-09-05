import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeConfig } from '../runtime-config';
import { ThemeProvider } from '../theme';

import { AppShell } from './AppShell';

vi.mock('../graph-view', () => ({
  GraphView: () => <div data-testid="graph-view" />,
}));

// Only the chart is stubbed. The scope bar and `useSankeyQuery` stay real, because the
// shell tests below assert on what actually reaches the storage-graph URL.
vi.mock('../storage-flow-sankey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../storage-flow-sankey')>();
  return {
    ...actual,
    SankeyView: (props: { focusMode: boolean; onFocusModeChange: (next: boolean) => void }) => (
      <div data-testid="sankey-view" data-focus-mode={props.focusMode}>
        <button onClick={() => props.onFocusModeChange(!props.focusMode)}>toggle-sankey-focus</button>
      </div>
    ),
  };
});

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
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

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
    vi.unstubAllGlobals();
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

  it('keeps Graph and Sankey identity controls independent', async () => {
    const live: RuntimeConfig = {
      ...DEMO,
      demoMode: false,
      endpoints: {
        graph: '/api/v1/graph',
        storageGraph: '/api/v1/storage-graph',
        labelValues: '/prom',
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = urlOf(input);
        if (url.includes('/api/v1/label/')) {
          const name = url.includes('/label/az/')
            ? ['zone-a', 'zone-b']
            : url.includes('/label/env/')
              ? ['prod', 'dev']
              : ['prod'];
          return Promise.resolve(jsonResponse({ status: 'success', data: name }));
        }
        return Promise.resolve(jsonResponse({ elements: { nodes: [], edges: [] } }));
      })
    );
    renderAt('/graph', live);
    await waitFor(() => {
      expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('link', { name: 'Sankey' }));
    await waitFor(() => {
      expect(screen.getByTestId('sankey-controls')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('filter-bar')).not.toBeInTheDocument();
    expect(screen.getByLabelText('AZ')).toBeInTheDocument();
  });

  it('keeps Sankey az / env usable when only storageGraph is configured', async () => {
    // `storageGraph` and `labelValues` are independently optional, but the endpoint requires
    // an az and an env — so gating the controls on `labelValues` leaves a view that tells the
    // operator to pick both and offers no way to.
    const noLabels: RuntimeConfig = {
      ...DEMO,
      demoMode: false,
      endpoints: { graph: '/api/v1/graph', storageGraph: '/api/v1/storage-graph' },
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      void input;
      return Promise.resolve(jsonResponse({ elements: { nodes: [], edges: [] } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/sankey', noLabels);
    await waitFor(() => {
      expect(screen.getByTestId('sankey-controls')).toBeInTheDocument();
    });
    await userEvent.type(screen.getByLabelText('AZ'), 'zone-a');
    await userEvent.type(screen.getByLabelText('Env'), 'prod');
    await waitFor(() => {
      const storage = fetchMock.mock.calls.map((call) => urlOf(call[0])).filter((u) => u.includes('/storage-graph'));
      // One request per keystroke once both halves are set — the point is only that the
      // settled selection reaches the endpoint with no label-values source configured.
      expect(storage.at(-1)).toContain('az=zone-a');
      expect(storage.at(-1)).toContain('env=prod');
    });
    expect(fetchMock.mock.calls.some((call) => urlOf(call[0]).includes('/label/'))).toBe(false);
  });
});

describe('AppShell two data sources', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
    vi.unstubAllGlobals();
  });

  const live: RuntimeConfig = {
    endpoints: {
      graph: '/api/v1/graph',
      storageGraph: '/api/v1/storage-graph',
      labelValues: '/prom',
    },
    demoMode: false,
    refreshIntervalSeconds: 0,
    defaultLayout: 'fcose',
    theme: 'system',
  };

  function stubFetch(): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes('/api/v1/label/az/')) {
        return Promise.resolve(jsonResponse({ status: 'success', data: ['zone-a', 'zone-b'] }));
      }
      if (url.includes('/api/v1/label/env/')) {
        return Promise.resolve(jsonResponse({ status: 'success', data: ['prod', 'dev'] }));
      }
      if (url.includes('/api/v1/label/')) {
        return Promise.resolve(jsonResponse({ status: 'success', data: ['prod'] }));
      }
      if (url.includes('/storage-graph')) {
        return Promise.resolve(
          jsonResponse({ elements: { nodes: [{ data: { id: 'a', name: 'a', type: 'netapp-aggr' } }], edges: [] } })
        );
      }
      return Promise.resolve(
        jsonResponse({ elements: { nodes: [{ data: { id: 'p', name: 'p', type: 'pod' } }], edges: [] } })
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function callUrl(call: unknown[]): string {
    const input = call[0];
    if (typeof input === 'string') {
      return input;
    }
    if (input instanceof URL) {
      return input.href;
    }
    return '';
  }

  function storageCalls(fetchMock: ReturnType<typeof vi.fn>): number {
    return fetchMock.mock.calls.filter((call) => callUrl(call).includes('/storage-graph')).length;
  }

  function graphCalls(fetchMock: ReturnType<typeof vi.fn>): number {
    return fetchMock.mock.calls.filter((call) => {
      const url = callUrl(call);
      return url.includes('/api/v1/graph') && !url.includes('storage');
    }).length;
  }

  it('does not fetch storage-graph while staying on Graph', async () => {
    const fetchMock = stubFetch();
    renderAt('/graph', live);
    await waitFor(() => {
      expect(graphCalls(fetchMock)).toBe(1);
    });
    expect(storageCalls(fetchMock)).toBe(0);
  });

  it('fetches storage-graph once after entering Sankey with az/env selected, and not again on round-trip', async () => {
    const fetchMock = stubFetch();
    renderAt('/graph', live);
    await waitFor(() => {
      expect(graphCalls(fetchMock)).toBe(1);
    });
    await userEvent.click(screen.getByRole('link', { name: 'Sankey' }));
    await waitFor(() => {
      expect(screen.getByTestId('sankey-controls')).toBeInTheDocument();
    });
    expect(storageCalls(fetchMock)).toBe(0);
    await userEvent.selectOptions(screen.getByLabelText('AZ'), 'zone-a');
    await userEvent.selectOptions(screen.getByLabelText('Env'), 'prod');
    await waitFor(() => {
      expect(storageCalls(fetchMock)).toBe(1);
    });
    await userEvent.click(screen.getByRole('link', { name: 'Graph' }));
    await userEvent.click(screen.getByRole('link', { name: 'Sankey' }));
    expect(storageCalls(fetchMock)).toBe(1);
  });

  it('reloads only the current view source', async () => {
    const fetchMock = stubFetch();
    renderAt('/graph', live);
    await waitFor(() => {
      expect(graphCalls(fetchMock)).toBe(1);
    });
    await userEvent.click(screen.getByRole('link', { name: 'Sankey' }));
    await userEvent.selectOptions(screen.getByLabelText('AZ'), 'zone-a');
    await userEvent.selectOptions(screen.getByLabelText('Env'), 'prod');
    await waitFor(() => {
      expect(storageCalls(fetchMock)).toBe(1);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Reload data' }));
    await waitFor(() => {
      expect(storageCalls(fetchMock)).toBe(2);
    });
    expect(graphCalls(fetchMock)).toBe(1);
  });

  it('disables reload on Sankey when az/env are not ready', async () => {
    stubFetch();
    renderAt('/sankey', live);
    await waitFor(() => {
      expect(screen.getByTestId('sankey-controls')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Reload data' })).toBeDisabled();
  });

  it('does not fetch storage-graph on a time-range change before Sankey is visited', async () => {
    const fetchMock = stubFetch();
    renderAt('/graph', live);
    await waitFor(() => {
      expect(graphCalls(fetchMock)).toBe(1);
    });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'View time range' }), '1h');
    await waitFor(() => {
      expect(graphCalls(fetchMock)).toBe(2);
    });
    expect(storageCalls(fetchMock)).toBe(0);
  });

  it('refetches both loaded sources with the same start/end when the time range changes', async () => {
    const fetchMock = stubFetch();
    renderAt('/graph', live);
    await waitFor(() => {
      expect(graphCalls(fetchMock)).toBe(1);
    });
    await userEvent.click(screen.getByRole('link', { name: 'Sankey' }));
    await userEvent.selectOptions(screen.getByLabelText('AZ'), 'zone-a');
    await userEvent.selectOptions(screen.getByLabelText('Env'), 'prod');
    await waitFor(() => {
      expect(storageCalls(fetchMock)).toBe(1);
    });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'View time range' }), '1h');
    await waitFor(() => {
      expect(graphCalls(fetchMock)).toBe(2);
      expect(storageCalls(fetchMock)).toBe(2);
    });
    const lastGraph = fetchMock.mock.calls
      .filter((c) => {
        const url = callUrl(c);
        return url.includes('/api/v1/graph') && !url.includes('storage');
      })
      .at(-1);
    const lastStorage = fetchMock.mock.calls.filter((c) => callUrl(c).includes('/storage-graph')).at(-1);
    const graphUrl = new URL(callUrl(lastGraph ?? []), 'http://localhost');
    const storageUrl = new URL(callUrl(lastStorage ?? []), 'http://localhost');
    // Each loader resolves the relative window from its own Date.now(), so the two
    // timestamps are equal but may straddle a second boundary. Assert the WINDOW, not the
    // exact integers, or this fails roughly once per few hundred runs.
    const param = (url: URL, name: string): number => Number(url.searchParams.get(name));
    expect(Math.abs(param(graphUrl, 'start') - param(storageUrl, 'start'))).toBeLessThanOrEqual(1);
    expect(Math.abs(param(graphUrl, 'end') - param(storageUrl, 'end'))).toBeLessThanOrEqual(1);
    expect(param(graphUrl, 'end') - param(graphUrl, 'start')).toBe(
      param(storageUrl, 'end') - param(storageUrl, 'start')
    );
  });

  it('keeps graph data when storage-graph returns 500', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes('/api/v1/label/')) {
        return Promise.resolve(jsonResponse({ status: 'success', data: ['x'] }));
      }
      if (url.includes('/storage-graph')) {
        return Promise.resolve(new Response('nope', { status: 500 }));
      }
      return Promise.resolve(
        jsonResponse({ elements: { nodes: [{ data: { id: 'p', name: 'p', type: 'pod' } }], edges: [] } })
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/graph', live);
    await waitFor(() => {
      expect(screen.getByTestId('graph-view')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('link', { name: 'Sankey' }));
    await waitFor(() => {
      expect(storageCalls(fetchMock)).toBe(1);
    });
    await userEvent.click(screen.getByRole('link', { name: 'Graph' }));
    expect(screen.getByTestId('graph-view')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
