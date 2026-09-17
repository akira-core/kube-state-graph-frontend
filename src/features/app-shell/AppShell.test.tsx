import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { startTransition } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SHOWCASE_TRACE } from '../../shared/fixtures/showcaseTrace';
import type { RuntimeConfig } from '../runtime-config';
import { ThemeProvider } from '../theme';

import { AppShell } from './AppShell';

vi.mock('../graph-view', () => ({
  GraphView: (props: { locateNodeId?: string | null; onLocateConsumed?: () => void; unconfiguredMessage?: string }) => (
    <div
      data-testid="graph-view"
      data-locate={props.locateNodeId ?? ''}
      data-unconfigured={props.unconfiguredMessage ?? ''}
    >
      <button onClick={() => props.onLocateConsumed?.()}>consume-locate</button>
    </div>
  ),
}));

// Only the chart is stubbed. The scope bar stays real, because the shell tests
// below assert on what actually reaches the storage-graph URL.
vi.mock('../storage-flow-sankey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../storage-flow-sankey')>();
  return {
    ...actual,
    SankeyView: (props: {
      focusMode: boolean;
      onFocusModeChange: (next: boolean) => void;
      onLocateNode: (id: string) => void;
      onPodLayoutChange?: (next: 'flat' | 'node') => void;
    }) => (
      <div data-testid="sankey-view" data-focus-mode={props.focusMode}>
        <button onClick={() => props.onFocusModeChange(!props.focusMode)}>toggle-sankey-focus</button>
        <button onClick={() => props.onLocateNode('netapp/ontap-prod/aggr/aggr1')}>locate-aggr1</button>
        <button onClick={() => props.onPodLayoutChange?.('node')}>layout-node</button>
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

async function chooseSankey(testId: string, option: string): Promise<void> {
  fireEvent.click(screen.getByTestId(testId));
  fireEvent.click(await screen.findByRole('option', { name: option }));
  await waitFor(() => {
    expect(screen.getByTestId(testId)).toHaveTextContent(option);
  });
}

function pressQuery(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Query' }));
}

async function addTypedRoot(value: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Root value' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Search Root value' }), { target: { value } });
  fireEvent.click(screen.getByRole('option', { name: `Use "${value}"` }));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Root value' })).toHaveTextContent(value);
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: new RegExp(`aggr:${value}`) })).toBeInTheDocument();
  });
}

function mount(config: RuntimeConfig): ReturnType<typeof render> {
  return render(
    <ThemeProvider configTheme={config.theme}>
      <AppShell config={config} />
    </ThemeProvider>
  );
}

function renderAt(path: string, config: RuntimeConfig = DEMO): ReturnType<typeof render> {
  window.history.pushState({}, '', path);
  return mount(config);
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

  it('ignores Sankey scope parameters in demo mode', async () => {
    // Demo mode draws a bundled fixture: there is no backend for a scope to narrow, and a
    // query parameter that changed nothing would claim a scope the drawing does not honour.
    // The time range still belongs to the shell, so `from` / `to` survive.
    const fetchMock = vi.fn(() => Promise.reject(new Error('demo mode must not fetch')));
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/sankey?az=zone-a&env=prod&mode=write&aggr=aggr1', DEMO);
    await waitFor(() => {
      expect(screen.getByTestId('sankey-view')).toBeInTheDocument();
    });
    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get('from')).not.toBeNull();
      expect(params.get('to')).not.toBeNull();
      expect(params.get('az')).toBeNull();
      expect(params.get('env')).toBeNull();
      expect(params.get('mode')).toBeNull();
      expect(params.get('aggr')).toBeNull();
    });
    expect(fetchMock).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole('button', { name: 'AZ' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search AZ' }), { target: { value: 'zone-a' } });
    fireEvent.click(screen.getByRole('option', { name: 'Use "zone-a"' }));
    fireEvent.click(screen.getByRole('button', { name: 'Env' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search Env' }), { target: { value: 'prod' } });
    fireEvent.click(screen.getByRole('option', { name: 'Use "prod"' }));
    await addTypedRoot('aggr1');
    pressQuery();
    await waitFor(() => {
      const storage = fetchMock.mock.calls.map((call) => urlOf(call[0])).filter((u) => u.includes('/storage-graph'));
      expect(storage.at(-1)).toContain('az=zone-a');
      expect(storage.at(-1)).toContain('env=prod');
      expect(storage.at(-1)).toContain('aggr=aggr1');
    });
    expect(fetchMock.mock.calls.some((call) => urlOf(call[0]).includes('/label/'))).toBe(false);
  }, 15_000);

  it('seeds a sole az / env once and lets the operator clear it again', async () => {
    // A one-az, one-env estate is the demo's own shape. Seeding is a convenience; a seed that
    // re-applies itself makes the pill's remove button look broken, because every later scope
    // write would put the only candidate straight back.
    const single: RuntimeConfig = {
      ...DEMO,
      demoMode: false,
      endpoints: { graph: '/api/v1/graph', storageGraph: '/api/v1/storage-graph', labelValues: '/prom' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = urlOf(input);
        if (url.includes('/label/az/')) {
          return Promise.resolve(jsonResponse({ status: 'success', data: ['zone-a'] }));
        }
        if (url.includes('/label/env/')) {
          return Promise.resolve(jsonResponse({ status: 'success', data: ['prod'] }));
        }
        if (url.includes('/label/')) {
          return Promise.resolve(jsonResponse({ status: 'success', data: [] }));
        }
        return Promise.resolve(jsonResponse({ elements: { nodes: [], edges: [] } }));
      })
    );
    renderAt('/sankey', single);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'AZ' })).toHaveTextContent('zone-a');
    });
    expect(screen.getByRole('button', { name: 'Env' })).toHaveTextContent('prod');
    expect(new URLSearchParams(window.location.search).get('az')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('env')).toBeNull();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Remove AZ zone-a' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'AZ' })).toHaveTextContent('All');
    });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Remove Env prod' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Env' })).toHaveTextContent('All');
    });
    expect(new URLSearchParams(window.location.search).get('az')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('env')).toBeNull();
  }, 15_000);
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
      return /\/v1\/graph(\?|$)/.test(url) && !url.includes('storage-graph');
    }).length;
  }

  it('does not fetch storage-graph while staying on Graph', async () => {
    const fetchMock = stubFetch();
    renderAt('/graph', live);
    expect(graphCalls(fetchMock)).toBe(0);
    pressQuery();
    await waitFor(() => {
      expect(graphCalls(fetchMock)).toBe(1);
    });
    expect(storageCalls(fetchMock)).toBe(0);
  });

  it('unmounts the other page on switch and awaits Query on return', async () => {
    const fetchMock = stubFetch();
    renderAt('/graph', live);
    pressQuery();
    await waitFor(() => {
      expect(graphCalls(fetchMock)).toBe(1);
    });
    expect(screen.queryByTestId('sankey-view')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Sankey' }));
    await waitFor(() => {
      expect(screen.getByTestId('sankey-controls')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('graph-view')).not.toBeInTheDocument();
    expect(storageCalls(fetchMock)).toBe(0);
    await chooseSankey('sankey-az', 'zone-a');
    await chooseSankey('sankey-env', 'prod');
    await addTypedRoot('aggr1');
    pressQuery();
    await waitFor(() => {
      expect(storageCalls(fetchMock)).toBeGreaterThanOrEqual(1);
    });
    const graphsBeforeReturn = graphCalls(fetchMock);
    await userEvent.click(screen.getByRole('link', { name: 'Graph' }));
    await waitFor(() => {
      expect(screen.getByTestId('graph-view')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('sankey-view')).not.toBeInTheDocument();
    expect(graphCalls(fetchMock)).toBe(graphsBeforeReturn);
    pressQuery();
    await waitFor(() => {
      expect(graphCalls(fetchMock)).toBeGreaterThan(graphsBeforeReturn);
    });
  }, 15_000);

  it('reloads only the current view source', async () => {
    const fetchMock = stubFetch();
    renderAt('/graph', live);
    pressQuery();
    await waitFor(() => {
      expect(graphCalls(fetchMock)).toBe(1);
    });
    await userEvent.click(screen.getByRole('link', { name: 'Sankey' }));
    await chooseSankey('sankey-az', 'zone-a');
    await chooseSankey('sankey-env', 'prod');
    await addTypedRoot('aggr1');
    pressQuery();
    await waitFor(() => {
      expect(storageCalls(fetchMock)).toBeGreaterThanOrEqual(1);
    });
    const graphsOnSankey = graphCalls(fetchMock);
    const storageBeforeReload = storageCalls(fetchMock);
    await userEvent.click(screen.getByRole('button', { name: 'Reload data' }));
    await waitFor(() => {
      expect(storageCalls(fetchMock)).toBeGreaterThan(storageBeforeReload);
    });
    expect(graphCalls(fetchMock)).toBe(graphsOnSankey);
  }, 15_000);

  it('disables reload on Sankey when az/env are not ready', async () => {
    stubFetch();
    renderAt('/sankey', live);
    await waitFor(() => {
      expect(screen.getByTestId('sankey-controls')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Reload data' })).toBeDisabled();
  });

  it('does not refetch storage-graph when switching the Sankey layout', async () => {
    const fetchMock = stubFetch();
    renderAt('/sankey?az=zone-a&env=prod&aggr=aggr1', live);
    await waitFor(() => {
      expect(screen.getByTestId('sankey-view')).toBeInTheDocument();
    });
    pressQuery();
    await waitFor(() => {
      expect(storageCalls(fetchMock)).toBeGreaterThanOrEqual(1);
    });
    const before = storageCalls(fetchMock);
    fireEvent.click(screen.getByRole('button', { name: 'layout-node' }));
    expect(storageCalls(fetchMock)).toBe(before);
  });

  it('does not fetch storage-graph on a time-range change before Sankey is visited', async () => {
    const fetchMock = stubFetch();
    renderAt('/graph', live);
    pressQuery();
    await waitFor(() => {
      expect(graphCalls(fetchMock)).toBeGreaterThanOrEqual(1);
    });
    const graphsBefore = graphCalls(fetchMock);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'View time range' }), '1h');
    expect(graphCalls(fetchMock)).toBe(graphsBefore);
    expect(storageCalls(fetchMock)).toBe(0);
  });

  it('refetches only the mounted page when the time range is committed', async () => {
    const fetchMock = stubFetch();
    renderAt('/graph', live);
    pressQuery();
    await waitFor(() => {
      expect(graphCalls(fetchMock)).toBeGreaterThanOrEqual(1);
    });
    const graphsBeforeTime = graphCalls(fetchMock);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'View time range' }), '1h');
    expect(graphCalls(fetchMock)).toBe(graphsBeforeTime);
    pressQuery();
    await waitFor(() => {
      expect(graphCalls(fetchMock)).toBeGreaterThan(graphsBeforeTime);
    });
    expect(storageCalls(fetchMock)).toBe(0);
    await userEvent.click(screen.getByRole('link', { name: 'Sankey' }));
    await chooseSankey('sankey-az', 'zone-a');
    await chooseSankey('sankey-env', 'prod');
    await addTypedRoot('aggr1');
    pressQuery();
    await waitFor(() => {
      expect(storageCalls(fetchMock)).toBeGreaterThanOrEqual(1);
    });
    const graphsAtSankey = graphCalls(fetchMock);
    const storageBefore = storageCalls(fetchMock);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'View time range' }), '6h');
    expect(storageCalls(fetchMock)).toBe(storageBefore);
    pressQuery();
    await waitFor(() => {
      expect(storageCalls(fetchMock)).toBeGreaterThan(storageBefore);
    });
    expect(graphCalls(fetchMock)).toBe(graphsAtSankey);
  }, 15_000);

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
      expect(screen.getByTestId('sankey-controls')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'AZ' })).toHaveTextContent('x');
    });
    await addTypedRoot('aggr1');
    pressQuery();
    await waitFor(() => {
      expect(storageCalls(fetchMock)).toBe(1);
    });
    await userEvent.click(screen.getByRole('link', { name: 'Graph' }));
    expect(screen.getByTestId('graph-view')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces in-page filter changes so history length is unchanged', async () => {
    stubFetch();
    renderAt('/graph', live);
    const length = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: 'Namespace' }));
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'prod' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('option', { name: 'prod' }));
    expect(window.location.search).not.toContain('namespace=prod');
    pressQuery();
    await waitFor(() => {
      expect(window.location.search).toContain('namespace=prod');
    });
    expect(window.history.length).toBe(length);
  });

  it('locates from Sankey via navigation state and does not repeat after the state is consumed', async () => {
    stubFetch();
    const { unmount } = renderAt('/sankey?az=zone-a&env=prod', live);
    await waitFor(() => {
      expect(screen.getByTestId('sankey-view')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'locate-aggr1' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/graph');
    });
    await waitFor(() => {
      expect(screen.getByTestId('graph-view')).toHaveAttribute('data-locate', 'netapp/ontap-prod/aggr/aggr1');
    });
    // The target rode in on the navigation state, never the URL.
    expect(window.location.search).not.toContain('locate');

    // Locate is a one-off. Once the view has taken it the page must drop it AND clear the
    // navigation state behind it — otherwise the next query write re-reads that state and
    // silently locates again, yanking the viewport away from wherever the user had moved.
    fireEvent.click(screen.getByRole('button', { name: 'consume-locate' }));
    await waitFor(() => {
      expect(screen.getByTestId('graph-view')).toHaveAttribute('data-locate', '');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Namespace' }));
    fireEvent.click(await screen.findByRole('option', { name: 'prod' }));
    pressQuery();
    await waitFor(() => {
      expect(window.location.search).toContain('namespace=prod');
    });
    expect(screen.getByTestId('graph-view')).toHaveAttribute('data-locate', '');
    unmount();

    // A refresh lands on the same URL and the same history entry, and finds nothing to run.
    mount(live);
    await waitFor(() => {
      expect(screen.getByTestId('graph-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('graph-view')).toHaveAttribute('data-locate', '');
  });

  it('keeps the seeded from/to when the Graph page is entered by a Sankey locate', async () => {
    stubFetch();
    const { unmount } = renderAt('/sankey?az=zone-a&env=prod', live);
    await waitFor(() => {
      expect(screen.getByTestId('sankey-view')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'locate-aggr1' }));
    await waitFor(() => {
      expect(screen.getByTestId('graph-view')).toHaveAttribute('data-locate', 'netapp/ontap-prod/aggr/aggr1');
    });
    // The locate navigation carries no query, so the mount seed writes from/to. Clearing the
    // locate state runs in the same effect flush and must not write the pre-seed query back.
    expect(window.location.pathname).toBe('/graph');
    expect(window.location.search).toMatch(/from=.*to=/);
    unmount();

    // The state is still cleared: a refresh on this entry finds nothing to locate.
    mount(live);
    await waitFor(() => {
      expect(screen.getByTestId('graph-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('graph-view')).toHaveAttribute('data-locate', '');
  });

  it('issues 0 requests on mount and Reload is inert until Query', async () => {
    const fetchMock = stubFetch();
    renderAt('/graph', live);
    expect(graphCalls(fetchMock)).toBe(0);
    expect(screen.getByRole('button', { name: 'Reload data' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload data' }));
    expect(graphCalls(fetchMock)).toBe(0);
    pressQuery();
    await waitFor(() => {
      expect(graphCalls(fetchMock)).toBe(1);
    });
  });

  it('a selected window sticks without rewriting the URL or issuing a request', async () => {
    const fetchMock = stubFetch();
    renderAt('/graph?from=now-24h&to=now', live);
    const range = screen.getByRole('combobox', { name: 'View time range' });
    act(() => {
      startTransition(() => {
        fireEvent.change(range, { target: { value: '1h' } });
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'View time range' })).toHaveValue('1h');
    });
    expect(window.location.search).toContain('from=now-24h');
    expect(graphCalls(fetchMock)).toBe(0);
    pressQuery();
    await waitFor(() => {
      expect(graphCalls(fetchMock)).toBe(1);
    });
    expect(window.location.search).toContain('from=now-1h');
    expect(callUrl(fetchMock.mock.calls.find((call) => callUrl(call).includes('/v1/graph')) ?? [])).toMatch(/start=/);
  });

  it('writes from/to once on a bare path and never on a path that already has a pair', async () => {
    const fetchMock = stubFetch();
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const first = renderAt('/graph', live);
    await waitFor(() => {
      expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(window.location.search).toContain('from=');
    });
    expect(graphCalls(fetchMock)).toBe(0);
    const writes = replaceState.mock.calls.length;
    expect(writes).toBeGreaterThanOrEqual(1);
    replaceState.mockRestore();
    first.unmount();

    renderAt('/graph?from=now-6h&to=now', live);
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'View time range' })).toHaveValue('6h');
    });
    expect(window.location.search).toContain('from=now-6h');
    expect(window.location.search).toContain('to=now');
    expect(graphCalls(fetchMock)).toBe(0);
  });

  it('a complete Sankey deep link issues 0 requests until Query', async () => {
    const fetchMock = stubFetch();
    renderAt('/sankey?az=zone-a&env=prod&aggr=aggr1', live);
    await waitFor(() => {
      expect(screen.getByTestId('sankey-view')).toBeInTheDocument();
    });
    expect(storageCalls(fetchMock)).toBe(0);
    pressQuery();
    await waitFor(() => {
      expect(storageCalls(fetchMock)).toBe(1);
    });
    expect(
      urlOf(fetchMock.mock.calls.find((call) => callUrl(call).includes('storage-graph'))?.[0] as RequestInfo)
    ).toContain('aggr=aggr1');
  });
});

// The Network category renders the REAL TraceView: what the shell tests assert on — the
// request actually issued, the retained payload across a view switch, the fixture in
// demo mode — is exactly what a stub would fake.
describe('AppShell network category', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
    vi.unstubAllGlobals();
  });

  const liveNetwork: RuntimeConfig = {
    ...DEMO,
    demoMode: false,
    endpoints: { graph: '/api/v1/graph', trace: '/demo/trace.json' },
  };

  function stubTraceFetch(): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      void input;
      return Promise.resolve(jsonResponse(SHOWCASE_TRACE));
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function traceCalls(fetchMock: ReturnType<typeof vi.fn>): string[] {
    return fetchMock.mock.calls
      .map((call) => urlOf(call[0] as RequestInfo | URL))
      .filter((u) => u.includes('/demo/trace.json'));
  }

  it('replaces /network with /network/graph keeping the query', async () => {
    stubTraceFetch();
    renderAt('/network?hostname=sw%2Fdist-a&from=now-1h&to=now', liveNetwork);
    await waitFor(() => {
      expect(window.location.pathname).toBe('/network/graph');
    });
    expect(window.location.search).toContain('hostname=sw%2Fdist-a');
    expect(window.location.search).toContain('from=now-1h');
    expect(screen.getByTestId('graph-view')).toBeInTheDocument();
    expect(screen.getByTestId('trace-controls')).toBeInTheDocument();
    expect(document.title).toBe('Kube State Graph — Network Graph');
  });

  it('issues 0 requests on mount and exactly one, with the seven parameters, on Query', async () => {
    const fetchMock = stubTraceFetch();
    renderAt('/network/sankey?hostname=sw%2Fdist-a&from=now-1h&to=now', liveNetwork);
    expect(screen.getByTestId('trace-empty-awaiting')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload data' })).toBeDisabled();
    expect(screen.getByTestId('trace-hostname')).toHaveTextContent('sw/dist-a');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.title).toBe('Kube State Graph — Network Sankey');

    pressQuery();
    await waitFor(() => {
      expect(traceCalls(fetchMock)).toHaveLength(1);
    });
    const url = traceCalls(fetchMock)[0] ?? '';
    expect(url).toContain('/demo/trace.json?');
    expect(url).toContain('hostname=sw%2Fdist-a');
    expect(url).toContain('max_hops=7');
    expect(url).toContain('top_n=3');
    expect(url).toContain('threshold=10');
    expect(url).toContain('track_dir=source');
    expect(url).toMatch(/[?&]from_ts=\d{13}(&|$)/);
    expect(url).toMatch(/[?&]to_ts=\d{13}(&|$)/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reload data' })).toBeEnabled();
    });
    // The query is committed to the URL; defaults are not written.
    expect(window.location.search).toContain('hostname=sw%2Fdist-a');
    expect(window.location.search).not.toContain('max_hops');
  });

  it('switching view issues no request and keeps the drawn body', async () => {
    const fetchMock = stubTraceFetch();
    renderAt('/network/graph?hostname=sw%2Fdist-a&track_dir=destination&from=now-1h&to=now', liveNetwork);
    expect(screen.getByTestId('graph-view')).toBeInTheDocument();
    pressQuery();
    await waitFor(() => {
      expect(traceCalls(fetchMock)).toHaveLength(1);
    });
    await userEvent.click(screen.getByRole('link', { name: 'Sankey' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/network/sankey');
    });
    expect(window.location.search).toContain('hostname=sw%2Fdist-a');
    expect(window.location.search).toContain('track_dir=destination');
    await waitFor(() => {
      expect(screen.getByTestId('sankey-svg')).toBeInTheDocument();
    });
    expect(screen.getByTestId('trace-node-Core 1')).toBeInTheDocument();
    expect(screen.queryByTestId('graph-view')).not.toBeInTheDocument();
    expect(traceCalls(fetchMock)).toHaveLength(1);

    await userEvent.click(screen.getByRole('link', { name: 'Graph' }));
    await waitFor(() => {
      expect(screen.getByTestId('graph-view')).toBeInTheDocument();
    });
    expect(traceCalls(fetchMock)).toHaveLength(1);
  });

  it('renders Page not found for an unknown network view, with Reload disabled', async () => {
    const fetchMock = stubTraceFetch();
    renderAt('/network/foo?hostname=sw%2Fdist-a', liveNetwork);
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Application' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload data' })).toBeDisabled();
    expect(screen.queryByTestId('trace-controls')).not.toBeInTheDocument();
    // The guard runs before any page hook: the 404 neither seeds `from` / `to` into its URL
    // nor primes a loader.
    await act(async () => {
      await Promise.resolve();
    });
    expect(window.location.search).toBe('?hostname=sw%2Fdist-a');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('locates from the trace Sankey into the Network Graph, keeping the scope and the drawn body', async () => {
    const fetchMock = stubTraceFetch();
    renderAt('/network/sankey?hostname=sw%2Fdist-a&track_dir=destination&from=now-1h&to=now', liveNetwork);
    pressQuery();
    await waitFor(() => {
      expect(screen.getByTestId('trace-node-Core 1')).toBeInTheDocument();
    });
    const search = window.location.search;

    fireEvent.click(screen.getByTestId('trace-node-Core 1'));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/network/graph');
    });
    await waitFor(() => {
      expect(screen.getByTestId('graph-view')).toHaveAttribute('data-locate', 'dci-uturn/core-1');
    });
    // Unlike the Storage locate, the Network views share one loader: the query string rides
    // along unchanged (no re-seeded `from` / `to`), the target is navigation state only,
    // and nothing is refetched.
    expect(window.location.search).toBe(search);
    expect(window.location.search).not.toContain('locate');
    expect(traceCalls(fetchMock)).toHaveLength(1);
    expect(screen.queryByTestId('sankey-svg')).not.toBeInTheDocument();

    // Locate is a one-off: consumed once, and gone from the state behind the entry.
    fireEvent.click(screen.getByRole('button', { name: 'consume-locate' }));
    await waitFor(() => {
      expect(screen.getByTestId('graph-view')).toHaveAttribute('data-locate', '');
    });
    await userEvent.click(screen.getByRole('link', { name: 'Sankey' }));
    await waitFor(() => {
      expect(screen.getByTestId('trace-node-Core 1')).toBeInTheDocument();
    });
    expect(traceCalls(fetchMock)).toHaveLength(1);
    await userEvent.click(screen.getByRole('link', { name: 'Graph' }));
    await waitFor(() => {
      expect(screen.getByTestId('graph-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('graph-view')).toHaveAttribute('data-locate', '');
  });

  it('draws the fixture on mount in demo mode, with no Query button', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('demo mode must not fetch')));
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/network/sankey', DEMO);
    await waitFor(() => {
      expect(screen.getByTestId('sankey-svg')).toBeInTheDocument();
    });
    expect(screen.getByTestId('trace-node-Core 1')).toBeInTheDocument();
    expect(screen.getByTestId('trace-legend-back')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Query' })).not.toBeInTheDocument();
    expect(screen.getByTestId('trace-controls')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reload data' })).toBeEnabled();
    });
  });

  it('shows an invalid URL value as a problem and disables Query', () => {
    stubTraceFetch();
    renderAt('/network/sankey?hostname=sw%2Fdist-a&max_hops=abc&from=now-1h&to=now', liveNetwork);
    expect(screen.getByRole('button', { name: 'Query' })).toBeDisabled();
    expect(screen.getByTestId('query-disabled-reason')).toHaveTextContent('Max hops must be a positive integer');
    // The offending value stays visible beside its message, never blanked or rewritten.
    expect(screen.getByTestId('trace-max-hops')).toHaveValue('abc');
    expect(screen.getByTestId('trace-empty-scope')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload data' })).toBeDisabled();

    // Editing the draft into something valid lifts the complaint: the Query button and the
    // chart's empty state consult the same list, so they change together.
    fireEvent.change(screen.getByTestId('trace-max-hops'), { target: { value: '3' } });
    expect(screen.getByRole('button', { name: 'Query' })).toBeEnabled();
    expect(screen.queryByTestId('trace-empty-scope')).not.toBeInTheDocument();
    expect(screen.getByTestId('trace-empty-awaiting')).toBeInTheDocument();
  });

  it('shows unconfigured and keeps Reload disabled when endpoints.trace is absent', () => {
    stubTraceFetch();
    renderAt('/network/sankey?hostname=sw%2Fdist-a&from=now-1h&to=now', { ...DEMO, demoMode: false });
    expect(screen.getByTestId('trace-empty-unconfigured')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload data' })).toBeDisabled();
  });

  it('tells the Graph view the trace endpoint is absent, before and after Query', async () => {
    const fetchMock = stubTraceFetch();
    renderAt('/network/graph?hostname=sw%2Fdist-a&from=now-1h&to=now', { ...DEMO, demoMode: false });
    // The same words as the Sankey view's state: both views explain one page's missing source.
    const message = screen.getByTestId('graph-view').getAttribute('data-unconfigured') ?? '';
    expect(message).toContain('not configured');
    await userEvent.click(screen.getByRole('link', { name: 'Sankey' }));
    expect(await screen.findByTestId('trace-empty-unconfigured')).toHaveTextContent(message);
    await userEvent.click(screen.getByRole('link', { name: 'Graph' }));

    // Query stays operable and commits, but there is nowhere to send it: the view must keep
    // naming why, not fall back to "nothing has been requested yet".
    pressQuery();
    expect(await screen.findByTestId('graph-view')).toHaveAttribute('data-unconfigured', message);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reload data' })).toBeDisabled();
  });

  it('gives the Graph view no unconfigured message when a trace endpoint is set', () => {
    stubTraceFetch();
    renderAt('/network/graph?hostname=sw%2Fdist-a&from=now-1h&to=now', liveNetwork);
    expect(screen.getByTestId('graph-view')).toHaveAttribute('data-unconfigured', '');
  });
});
