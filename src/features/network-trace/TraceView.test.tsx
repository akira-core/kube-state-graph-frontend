import { fireEvent, render, screen, within } from '@testing-library/react';
import type cytoscape from 'cytoscape';
import type { JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SHOWCASE_TRACE } from '../../shared/fixtures/showcaseTrace';
import { normalizeGraph } from '../graph-data';
import { ThemeProvider } from '../theme';

import type { TraceNodeOrder } from './layout/layoutTrace';
import type { TraceDirection, TraceGrouping } from './model/types';
import { TraceView, type TraceViewProps } from './TraceView';
import { useTraceModel } from './useTraceModel';

const elements = normalizeGraph(SHOWCASE_TRACE).elements;

/** The fixture with its trace start removed — a body from a backend that sent no `investigation`. */
function withoutInvestigation(): cytoscape.ElementDefinition[] {
  return elements.map((el) => {
    if (el.group !== 'nodes' || !('investigation' in el.data)) {
      return el;
    }
    const data = Object.fromEntries(Object.entries(el.data).filter(([key]) => key !== 'investigation'));
    return { ...el, data };
  });
}

/** A refreshed payload the backend answered without `k8s/kafka-2` at all. */
function withoutKafka2(): cytoscape.ElementDefinition[] {
  const isKafka2 = (id: string | undefined): boolean => id === 'k8s/kafka-2';
  return elements.filter((el) => {
    if (el.group === 'nodes') {
      return !isKafka2((el.data as cytoscape.NodeDataDefinition).id);
    }
    const d = el.data as cytoscape.EdgeDataDefinition;
    return !isKafka2(d.source) && !isKafka2(d.target);
  });
}

/** The page's inputs to the derivation, beside the view's own props. */
interface HarnessProps extends Omit<TraceViewProps, 'model' | 'order'> {
  trackDir: TraceDirection | undefined;
  minBps: number;
  grouping: TraceGrouping;
  order: TraceNodeOrder;
}

type Overrides = Partial<HarnessProps>;

function baseProps(overrides: Overrides = {}): HarnessProps {
  return {
    elements,
    status: 'ready',
    error: undefined,
    hasPayload: true,
    demoMode: true,
    focusMode: false,
    onFocusModeChange: vi.fn(),
    endpointConfigured: true,
    scopeReady: true,
    trackDir: 'destination',
    minBps: 0,
    grouping: 'none',
    order: 'flow',
    ...overrides,
  };
}

/** The view fed a model the way the Network page feeds it: derived by `useTraceModel`. */
function Harness({ trackDir, minBps, grouping, ...view }: Readonly<HarnessProps>): JSX.Element {
  const { model } = useTraceModel({ elements: view.elements, trackDir, minBps, grouping });
  return <TraceView {...view} model={model} />;
}

function wrap(props: HarnessProps): JSX.Element {
  return (
    <ThemeProvider>
      <div style={{ width: 800, height: 480 }}>
        <Harness {...props} />
      </div>
    </ThemeProvider>
  );
}

function renderTrace(overrides: Overrides = {}): { props: HarnessProps } & ReturnType<typeof render> {
  const props = baseProps(overrides);
  return { props, ...render(wrap(props)) };
}

/** Empty-state props for the live (non-demo) page before anything was drawn. */
const LIVE_EMPTY: Overrides = { demoMode: false, hasPayload: false, status: 'idle', elements: [] };

describe('TraceView chart host lifecycle', () => {
  it('wheel-zooms a chart that mounted after the loading gate', () => {
    // Same shape as the storage Sankey: live mode first commits `loading` with no host in
    // the tree, and the wheel listener has to attach when the host arrives.
    const { rerender } = renderTrace({ demoMode: false, status: 'loading', hasPayload: false, elements: [] });
    expect(screen.queryByTestId('sankey-chart-host')).not.toBeInTheDocument();

    rerender(wrap(baseProps({ demoMode: false })));
    const host = screen.getByTestId('sankey-chart-host');
    const before = screen.getByTestId('sankey-zoom-controls').textContent;
    fireEvent.wheel(host, { deltaY: -600, clientX: 100, clientY: 100 });
    expect(screen.getByTestId('sankey-zoom-controls').textContent).not.toBe(before);
  });
});

describe('TraceView empty states', () => {
  it('shows unconfigured when there is no trace endpoint, without drawing', () => {
    renderTrace({ ...LIVE_EMPTY, endpointConfigured: false, scopeReady: false });
    expect(screen.getByTestId('trace-empty-unconfigured')).toHaveTextContent('not configured');
    expect(screen.queryByTestId('sankey-svg')).not.toBeInTheDocument();
  });

  it('shows the scope prompt when the draft cannot be queried', () => {
    renderTrace({ ...LIVE_EMPTY, scopeReady: false });
    expect(screen.getByTestId('trace-empty-scope')).toHaveTextContent('No request has been sent');
    expect(screen.queryByTestId('trace-empty-awaiting')).not.toBeInTheDocument();
  });

  it('shows awaiting Query when the draft is complete but nothing has been committed', () => {
    renderTrace(LIVE_EMPTY);
    expect(screen.getByTestId('trace-empty-awaiting')).toHaveTextContent('Query');
  });

  it('shows cancelled when the only request was cancelled', () => {
    renderTrace({ ...LIVE_EMPTY, cancelled: true });
    expect(screen.getByTestId('trace-empty-cancelled')).toHaveTextContent('cancelled');
    expect(screen.queryByTestId('trace-empty-awaiting')).not.toBeInTheDocument();
  });

  it('Empty body is an answer, not a blank', () => {
    renderTrace({ elements: [], status: 'ready' });
    expect(screen.getByTestId('trace-empty-response')).toHaveTextContent('No traffic was recorded');
    expect(screen.queryByTestId('trace-empty-model-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sankey-svg')).not.toBeInTheDocument();
  });

  it('shows the model errors when the body cannot be drawn in the requested direction', () => {
    // The fixture's leaves are hosts with clients; followed as `source` they would have to
    // carry a flow edge onward, which the model refuses.
    renderTrace({ trackDir: 'source' });
    expect(screen.getByTestId('trace-empty-model-error')).toHaveTextContent('cannot be drawn');
    const items = within(screen.getByTestId('trace-model-errors')).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toHaveTextContent('trace stop');
    expect(screen.queryByTestId('sankey-svg')).not.toBeInTheDocument();
  });

  it('shows filtered when the threshold hides everything and no start keeps a card', () => {
    renderTrace({ elements: withoutInvestigation(), minBps: 1e15 });
    expect(screen.getByTestId('trace-empty-filtered')).toHaveTextContent('display threshold');
    expect(screen.getByTestId('trace-empty-filtered')).toHaveTextContent('demo fixture');
    expect(screen.queryByTestId('sankey-svg')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-empty-model-error')).not.toBeInTheDocument();
  });

  it('keeps the anchor card when the threshold hides every ribbon of a body with a start', () => {
    renderTrace({ minBps: 1e15 });
    expect(screen.queryByTestId('trace-empty-filtered')).not.toBeInTheDocument();
    expect(screen.getByTestId('sankey-svg')).toBeInTheDocument();
    expect(screen.getByTestId('trace-node-et-0/0/0')).toHaveAttribute('data-kind', 'anchor');
  });
});

describe('TraceView chart', () => {
  it('draws ribbons, hop cards, residuals and column headers for the fixture', () => {
    renderTrace();
    expect(screen.getByTestId('sankey-svg')).toBeInTheDocument();
    expect(screen.getAllByTestId('trace-band').length).toBeGreaterThan(0);
    expect(screen.getByTestId('trace-node-Core 1')).toHaveAttribute('data-kind', 'switch');
    expect(screen.getAllByTestId(/^trace-node-/).some((el) => el.getAttribute('data-status') === 'warning')).toBe(true);
    expect(screen.getAllByTestId('trace-residual-in').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('trace-residual-out').length).toBeGreaterThan(0);
    const headers = screen.getAllByTestId('sankey-column-header').map((el) => el.textContent);
    expect(headers.some((h) => h?.startsWith('Hop 1') === true)).toBe(true);
    expect(headers.some((h) => h?.startsWith('namespace') === true)).toBe(true);
    expect(headers).toContain('owner');
  });

  it('draws no chart chrome of its own: no title bar, no controls, no summary', () => {
    renderTrace();
    expect(screen.queryByText('Network trace')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-min-bps')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-legend')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-warnings')).not.toBeInTheDocument();
  });

  it('draws cluster frames under a Cluster grouping and none under None', () => {
    const { rerender } = renderTrace();
    expect(screen.queryByTestId('trace-cluster-east')).not.toBeInTheDocument();
    rerender(wrap(baseProps({ grouping: 'cluster' })));
    expect(screen.getByTestId('trace-cluster-east')).toBeInTheDocument();
    expect(screen.getByTestId('trace-cluster-west')).toBeInTheDocument();
    expect(screen.getByTestId('trace-cluster-title-east')).toHaveAttribute('data-locatable', 'false');
    // The frame's title hovers like a card: a tooltip naming the cluster and its cards.
    fireEvent.mouseEnter(screen.getByTestId('trace-cluster-title-east'), { clientX: 10, clientY: 10 });
    expect(screen.getByRole('tooltip')).toHaveTextContent('cluster / east');
    expect(screen.getByRole('tooltip')).toHaveTextContent('5 cards');
    rerender(wrap(baseProps({ grouping: 'none' })));
    expect(screen.queryByTestId('trace-cluster-east')).not.toBeInTheDocument();
  });

  it('preserves the zoom readout across a grouping and an order switch', () => {
    const { rerender } = renderTrace();
    fireEvent.keyDown(screen.getByTestId('sankey-chart-host'), { key: '1' });
    expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent('100%');
    rerender(wrap(baseProps({ grouping: 'cluster' })));
    expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent('100%');
    rerender(wrap(baseProps({ grouping: 'cluster', order: 'barycenter' })));
    expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent('100%');
    expect(screen.getByTestId('sankey-svg')).toBeInTheDocument();
  });

  it('preserves the zoom readout across a threshold change', () => {
    const { rerender } = renderTrace();
    fireEvent.keyDown(screen.getByTestId('sankey-chart-host'), { key: '1' });
    rerender(wrap(baseProps({ minBps: 1e9 })));
    expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent('100%');
    expect(screen.getByTestId('sankey-svg')).toBeInTheDocument();
  });
});

describe('TraceView keyboard', () => {
  it('fits on "0", resets to 1:1 on "1" and reports the level in the control bar', () => {
    renderTrace();
    const host = screen.getByTestId('sankey-chart-host');
    fireEvent.keyDown(host, { key: '1' });
    expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent('100%');
    fireEvent.keyDown(host, { key: '0' });
    const transform = screen.getByTestId('sankey-svg').querySelector('g')?.getAttribute('transform') ?? '';
    const fitted = Number(/scale\(([-\d.e+]+)\)/.exec(transform)?.[1]);
    expect(fitted).toBeGreaterThan(0);
    expect(fitted).toBeLessThan(1);
    expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent(`${Math.round(fitted * 100)}%`);
  });

  it('toggles focus mode on "f"; Esc leaves it only while it is on', () => {
    const onFocusModeChange = vi.fn();
    const { unmount } = renderTrace({ onFocusModeChange });
    const host = screen.getByTestId('sankey-chart-host');
    fireEvent.keyDown(host, { key: 'Escape' });
    expect(onFocusModeChange).not.toHaveBeenCalled();
    fireEvent.keyDown(host, { key: 'f' });
    expect(onFocusModeChange).toHaveBeenCalledWith(true);
    unmount();

    const onExit = vi.fn();
    renderTrace({ focusMode: true, onFocusModeChange: onExit });
    fireEvent.keyDown(screen.getByTestId('sankey-chart-host'), { key: 'Escape' });
    expect(onExit).toHaveBeenCalledWith(false);
  });
});

describe('TraceView hover', () => {
  it('shows a node tooltip on hover and fades the cards off the hovered path', () => {
    renderTrace();
    const kafka2 = screen.getByTestId('trace-node-kafka-2');
    fireEvent.mouseEnter(kafka2);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('pod / kafka-2');
    expect(tip).toHaveTextContent('namespace stream');
    expect(tip).toHaveTextContent('id k8s/kafka-2');
    expect(kafka2.style.opacity).toBe('1');
    // Upstream of the pod: its k8s node, the stitched ToR and the start.
    expect(screen.getByTestId('trace-node-node-w-11').style.opacity).toBe('1');
    expect(screen.getByTestId('trace-node-ToR k8s (k8s)').style.opacity).toBe('1');
    expect(screen.getByTestId('trace-node-Core 1').style.opacity).toBe('1');
    // Another branch entirely.
    expect(screen.getByTestId('trace-node-網管部 王小明').style.opacity).toBe('0.3');
    expect(screen.getByTestId('trace-node-ingest-4f11').style.opacity).toBe('0.3');
    fireEvent.mouseLeave(kafka2);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByTestId('trace-node-網管部 王小明').style.opacity).toBe('1');
  });

  it('names the residual and its hop on hover', () => {
    renderTrace();
    fireEvent.mouseEnter(screen.getAllByTestId('trace-residual-out')[0]!);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('node-w-11 · other out +2.5 Gbps');
    expect(tip).toHaveTextContent('traced in');
  });

  it('describes a ribbon on hover', () => {
    renderTrace();
    const back = screen.getAllByTestId('trace-band').find((el) => el.getAttribute('data-band')?.startsWith('back'));
    expect(back).toBeDefined();
    fireEvent.mouseEnter(back!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('backflow');
  });

  it('offers no card as locatable: a hop, a pod and a leaf carry no pointer and a click changes nothing', () => {
    renderTrace();
    for (const testId of ['trace-node-Core 1', 'trace-node-kafka-2', 'trace-node-網管部 王小明', 'trace-node-stream']) {
      const card = screen.getByTestId(testId);
      expect(card).toHaveAttribute('data-locatable', 'false');
      expect(card).not.toHaveClass('cursor-pointer');
      fireEvent.click(card);
    }
    expect(screen.getByTestId('sankey-svg')).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('clears the tooltip when a refresh removes the hovered node', () => {
    const { rerender } = renderTrace();
    fireEvent.mouseEnter(screen.getByTestId('trace-node-kafka-2'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    rerender(wrap(baseProps({ elements: withoutKafka2() })));
    expect(screen.queryByTestId('trace-node-kafka-2')).not.toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByTestId('trace-node-網管部 王小明').style.opacity).toBe('1');
  });
});

describe('TraceView card search', () => {
  const type = (query: string): void => {
    fireEvent.change(screen.getByTestId('sankey-search-input'), { target: { value: query } });
  };
  const opacityOf = (testId: string): string => screen.getByTestId(testId).style.opacity;

  it('lights a hit card’s whole path, like hovering it, and fades the rest', () => {
    renderTrace();
    type('kafka-2');
    expect(opacityOf('trace-node-kafka-2')).toBe('1');
    expect(opacityOf('trace-node-node-w-11')).toBe('1');
    expect(opacityOf('trace-node-ToR k8s (k8s)')).toBe('1');
    expect(opacityOf('trace-node-Core 1')).toBe('1');
    expect(opacityOf('trace-node-網管部 王小明')).toBe('0.3');
    expect(opacityOf('trace-node-ingest-4f11')).toBe('0.3');
    type('');
    expect(opacityOf('trace-node-網管部 王小明')).toBe('1');
  });

  it('finds a leaf by a client address and names the address that matched', () => {
    renderTrace();
    type('10.42.7.31');
    expect(screen.getByTestId('search-result-list')).toHaveTextContent('ip: 10.42.7.31');
    expect(opacityOf('trace-node-網管部 王小明')).toBe('1');
    expect(opacityOf('trace-node-kafka-2')).toBe('0.3');
  });

  it('fades everything for a query with no hits', () => {
    renderTrace();
    type('no-such-card');
    expect(opacityOf('trace-node-Core 1')).toBe('0.3');
    expect(opacityOf('trace-node-kafka-2')).toBe('0.3');
  });

  it('lets a hover take over while searching and hands back on leave', () => {
    renderTrace();
    type('kafka-2');
    const owner = screen.getByTestId('trace-node-網管部 王小明');
    fireEvent.mouseEnter(owner);
    expect(opacityOf('trace-node-網管部 王小明')).toBe('1');
    expect(opacityOf('trace-node-kafka-2')).toBe('0.3');
    fireEvent.mouseLeave(owner);
    expect(opacityOf('trace-node-kafka-2')).toBe('1');
    expect(opacityOf('trace-node-網管部 王小明')).toBe('0.3');
  });

  it('frames a located result in the chart and ends the search', () => {
    renderTrace();
    type('kafka-2');
    fireEvent.click(screen.getByTestId('search-result-k8s/kafka-2'));
    expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent('100%');
    expect(screen.getByTestId('sankey-search-input')).toHaveValue('');
    expect(opacityOf('trace-node-網管部 王小明')).toBe('1');
  });

  it('matches a cluster frame and lights its member pods, not the other cluster’s', () => {
    renderTrace({ grouping: 'cluster' });
    type('east');
    expect(screen.getByTestId('search-result-list')).toHaveTextContent('east');
    expect(opacityOf('trace-node-ingest-7d9c')).toBe('1');
    expect(opacityOf('trace-node-kafka-2')).toBe('1');
    expect(opacityOf('trace-cluster-east')).toBe('1');
    expect(opacityOf('trace-node-ingest-4f11')).toBe('0.3');
    expect(opacityOf('trace-cluster-west')).toBe('0.3');
  });
});
