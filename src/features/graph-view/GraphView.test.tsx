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

function firstPodId(): string {
  const pod = elements.find((el) => el.group === 'nodes' && (el.data as cytoscape.NodeDataDefinition).kind === 'pod');
  const id = (pod?.data as cytoscape.NodeDataDefinition | undefined)?.id;
  if (typeof id !== 'string') {
    throw new Error('fixture has no pod node');
  }
  return id;
}

function view(props: { locateNodeId?: string | null; onLocateConsumed?: () => void } = {}): JSX.Element {
  return (
    <ThemeProvider>
      <GraphView
        config={CONFIG}
        elements={elements}
        errors={[]}
        error={undefined}
        hasPayload
        status="ready"
        viewTimeRange={{ fromUnixSeconds: 1_700_000_000, toUnixSeconds: 1_700_003_600 }}
        onAlertTimeClick={vi.fn()}
        locateNodeId={props.locateNodeId ?? null}
        onLocateConsumed={props.onLocateConsumed ?? vi.fn()}
      />
    </ThemeProvider>
  );
}

describe('GraphView', () => {
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
