import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type cytoscape from 'cytoscape';
import type { JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SHOWCASE_GRAPH } from '../../shared/fixtures/showcaseGraph';
import { normalizeGraph } from '../graph-data';
import type { RuntimeConfig } from '../runtime-config';
import { ThemeProvider } from '../theme';

import { GraphView } from './GraphView';

// The canvas itself is not under test here, and mounting cytoscape in jsdom measures
// nothing useful. Everything below is about the view state GraphView owns.
vi.mock('../graph-canvas', async () => {
  const actual = await vi.importActual<typeof import('../graph-canvas')>('../graph-canvas');
  return {
    ...actual,
    GraphCanvas: (): JSX.Element => <div data-testid="graph-canvas" />,
  };
});

const { elements } = normalizeGraph(SHOWCASE_GRAPH);

const CONFIG: RuntimeConfig = {
  endpoints: {},
  demoMode: true,
  refreshIntervalSeconds: 0,
  defaultLayout: 'fcose',
  theme: 'system',
};

function firstIdOfKind(kind: string): string {
  const node = elements.find((el) => el.group === 'nodes' && (el.data as cytoscape.NodeDataDefinition).kind === kind);
  const id = (node?.data as cytoscape.NodeDataDefinition | undefined)?.id;
  if (typeof id !== 'string') {
    throw new Error(`fixture has no ${kind} node`);
  }
  return id;
}

function firstPodId(): string {
  return firstIdOfKind('pod');
}

function view(
  props: {
    locateNodeId?: string | null;
    onLocateConsumed?: () => void;
    hasPayload?: boolean;
    status?: 'idle' | 'loading' | 'ready' | 'error';
    cancelled?: boolean;
    unconfiguredMessage?: string;
  } = {}
): JSX.Element {
  return (
    <ThemeProvider>
      <GraphView
        config={CONFIG}
        elements={props.status === 'idle' ? [] : elements}
        errors={[]}
        error={undefined}
        hasPayload={props.hasPayload ?? true}
        cancelled={props.cancelled ?? false}
        status={props.status ?? 'ready'}
        viewTimeRange={{ fromUnixSeconds: 1_700_000_000, toUnixSeconds: 1_700_003_600 }}
        onAlertTimeClick={vi.fn()}
        locateNodeId={props.locateNodeId ?? null}
        onLocateConsumed={props.onLocateConsumed ?? vi.fn()}
        {...(props.unconfiguredMessage === undefined ? {} : { unconfiguredMessage: props.unconfiguredMessage })}
      />
    </ThemeProvider>
  );
}

describe('GraphView', () => {
  it('explains awaiting Query instead of showing the loading overlay', () => {
    render(view({ status: 'idle', hasPayload: false }));
    expect(screen.getByTestId('graph-awaiting-query')).toHaveTextContent('Query');
    expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument();
  });

  it('explains an unconfigured endpoint instead of awaiting Query, and draws nothing', () => {
    render(view({ status: 'idle', hasPayload: false, unconfiguredMessage: 'Trace endpoint is not configured.' }));
    expect(screen.getByTestId('graph-unconfigured')).toHaveTextContent('Trace endpoint is not configured.');
    expect(screen.queryByTestId('graph-awaiting-query')).not.toBeInTheDocument();
    expect(screen.queryByTestId('graph-canvas')).not.toBeInTheDocument();
  });

  it('explains a cancelled first request instead of showing the loading overlay', () => {
    render(view({ status: 'idle', hasPayload: false, cancelled: true }));
    expect(screen.getByTestId('graph-cancelled')).toHaveTextContent('cancelled');
    expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument();
  });

  it('does not announce a window resize when it becomes visible again', () => {
    // The resize hook reads a window resize as "the environment changed, re-frame", and
    // answers it with cy.fit() — which would throw away the pan/zoom the user left behind
    // when they switched to Sankey. Returning to this view must resize, never fit.
    const onResize = vi.fn();
    window.addEventListener('resize', onResize);
    try {
      const { rerender } = render(view());
      onResize.mockClear();
      rerender(view());
      expect(onResize).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('resize', onResize);
    }
  });

  it('clears the search input when a cross-view locate arrives', async () => {
    // A stale query keeps the search fade on, which can dim the very node the locate just
    // brought the user here to look at.
    const { rerender } = render(view());
    const input = screen.getByTestId('graph-search-input');
    await userEvent.type(input, 'zzz-no-such-node');
    expect(input).toHaveValue('zzz-no-such-node');

    rerender(view({ locateNodeId: firstPodId() }));
    expect(screen.getByTestId('graph-search-input')).toHaveValue('');
  });

  it('reports a locate target that is not in the current graph result', () => {
    // The banner is the only thing telling the user why nothing was selected. Without it
    // a cross-view locate for a node the current filters or prune left out is silence.
    const onLocateConsumed = vi.fn();
    render(view({ locateNodeId: 'pod/nowhere/ghost', onLocateConsumed }));

    const notice = screen.getByTestId('locate-missing');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent('not in the current graph result');
    expect(screen.queryByTestId('locate-filter-hidden')).not.toBeInTheDocument();
    expect(onLocateConsumed).toHaveBeenCalled();
  });

  it('holds a locate target while no graph body has landed yet', () => {
    // A failed or still-flying first load has no result to be absent from. Claiming the
    // node "is not in the current result" would be a statement about a result that does
    // not exist, and consuming the target here would lose it before the retry lands.
    const onLocateConsumed = vi.fn();
    render(view({ locateNodeId: 'pod/nowhere/ghost', hasPayload: false, onLocateConsumed }));

    expect(screen.queryByTestId('locate-missing')).not.toBeInTheDocument();
    expect(onLocateConsumed).not.toHaveBeenCalled();
  });

  it('reports a locate target the current filters are hiding, and dismisses', async () => {
    // A node the kind filter is hiding is a different answer from one the query never
    // returned: the estate has it, this view is not drawing it. The two notices must not
    // be interchangeable — one points at the filter rail, the other at the backend query.
    // Driven through `service`, which the legend draws its own eye for; pods sit inside
    // collapsed containers and get no toggle row.
    const onLocateConsumed = vi.fn();
    const { rerender } = render(view());
    await userEvent.click(screen.getByTestId('node-legend-toggle-service'));

    rerender(view({ locateNodeId: firstIdOfKind('service'), onLocateConsumed }));
    const notice = screen.getByTestId('locate-filter-hidden');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent('hidden by the current filters');
    expect(screen.queryByTestId('locate-missing')).not.toBeInTheDocument();
    expect(onLocateConsumed).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('locate-filter-hidden')).not.toBeInTheDocument();
  });

  it('also ends the search when locating from the in-view result list', async () => {
    // Locate ends the search whichever door it came through (graph-search spec: "Locate
    // (activating a result row) ends the search"). The in-view path clears the query inside
    // SearchBar, so GraphView must not clear it a second time from handleLocate — that would
    // be the one place both paths meet, and the cross-view clear belongs to the locate
    // effect instead.
    render(view());
    const input = screen.getByTestId('graph-search-input');
    await userEvent.type(input, 'mongo');
    const results = await screen.findAllByRole('option');
    await userEvent.click(results[0]!);
    expect(screen.getByTestId('graph-search-input')).toHaveValue('');
  });
});
