import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type cytoscape from 'cytoscape';
import type { JSX } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHOWCASE_TRACE } from '../../shared/fixtures/showcaseTrace';
import { normalizeGraph } from '../graph-data';
import { ThemeProvider } from '../theme';

import { TRACE_SAMPLE_CLASSIC } from './testing/samples';
import { TraceView, type TraceViewProps } from './TraceView';

const elements = normalizeGraph(SHOWCASE_TRACE).elements;
const classic = normalizeGraph(TRACE_SAMPLE_CLASSIC.wire).elements;

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

/**
 * Pods placed on k8s nodes by `pod-node` edges — the `Node` layout's frames. None of the
 * merged samples carries placement edges, so the frames get a body of their own.
 */
const placedPods = normalizeGraph({
  elements: {
    nodes: [
      {
        data: {
          id: 'sw-1',
          name: 'SW 1',
          type: 'switch',
          investigation: { iface: 'xe-0/0/1', delta_bps: 3e9, direction: 'in' },
        },
      },
      { data: { id: 'worker-0', name: 'worker-0', type: 'node' } },
      { data: { id: 'worker-1', name: 'worker-1', type: 'node', status: 'warning' } },
      { data: { id: 'ns1', name: 'ns1', type: 'namespace' } },
      { data: { id: 'p-a', name: 'p-a', type: 'pod', parent: 'ns1' } },
      { data: { id: 'p-b', name: 'p-b', type: 'pod', parent: 'ns1' } },
    ],
    edges: [
      { data: { id: 'e1', type: 'network-flow', source: 'sw-1', target: 'p-a', metrics: { delta_bps: 1e9 } } },
      { data: { id: 'e2', type: 'network-flow', source: 'sw-1', target: 'p-b', metrics: { delta_bps: 2e9 } } },
      { data: { id: 'e3', type: 'network-flow', source: 'p-a', target: 'worker-0', labels: { tier: 'pod-node' } } },
      { data: { id: 'e4', type: 'network-flow', source: 'p-b', target: 'worker-1', labels: { tier: 'pod-node' } } },
    ],
  },
}).elements;

/** Two switches; the start reports the delta on its inbound side. */
const twoSwitches = normalizeGraph({
  elements: {
    nodes: [
      {
        data: {
          id: 'sw-a',
          name: 'A',
          type: 'switch',
          investigation: { iface: 'et-0/0/1', delta_bps: 10_000_000_000, direction: 'in' },
        },
      },
      { data: { id: 'sw-b', name: 'B', type: 'switch' } },
    ],
    edges: [
      {
        data: {
          id: 'e0',
          type: 'network-flow',
          source: 'sw-a',
          target: 'sw-b',
          labels: { source_iface: 'et-0/0/2', target_iface: 'et-1/0/1' },
          metrics: { delta_bps: 10_000_000_000 },
        },
      },
    ],
  },
}).elements;

type Overrides = Partial<TraceViewProps>;

function baseProps(overrides: Overrides = {}): TraceViewProps {
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
    onMinBpsChange: vi.fn(),
    onLocateNode: vi.fn(),
    ...overrides,
  };
}

function wrap(props: TraceViewProps): JSX.Element {
  return (
    <ThemeProvider>
      <div style={{ width: 800, height: 480 }}>
        <TraceView {...props} />
      </div>
    </ThemeProvider>
  );
}

function renderTrace(overrides: Overrides = {}): { props: TraceViewProps } & ReturnType<typeof render> {
  const props = baseProps(overrides);
  return { props, ...render(wrap(props)) };
}

/** The summary opens folded; every assertion about its warnings has to open it first. */
function openSummary(): void {
  fireEvent.click(screen.getByTestId('trace-summary-toggle'));
}

/** Empty-state props for the live (non-demo) page before anything was drawn. */
const LIVE_EMPTY: Overrides = { demoMode: false, hasPayload: false, status: 'idle', elements: [] };

describe('TraceView threshold debounce', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once after the pause even when the parent re-renders with a new callback each time', () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const { rerender } = renderTrace({ onMinBpsChange: first });
    fireEvent.change(screen.getByTestId('trace-min-bps'), { target: { value: '5000000000' } });

    // Three parent renders inside the 200 ms window, each with a fresh callback identity —
    // the shape a pan drag produces. None of them may restart the timer.
    const later = [vi.fn(), vi.fn(), vi.fn()];
    for (const cb of later) {
      act(() => {
        vi.advanceTimersByTime(60);
      });
      rerender(wrap(baseProps({ onMinBpsChange: cb })));
    }
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(first).not.toHaveBeenCalled();
    expect(later[0]).not.toHaveBeenCalled();
    expect(later[1]).not.toHaveBeenCalled();
    expect(later[2]).toHaveBeenCalledTimes(1);
    expect(later[2]).toHaveBeenCalledWith(5_000_000_000);
  });
});

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

  it('shows an empty-response message, not a model error, for a successful body with nothing in it', () => {
    renderTrace({ elements: [] });
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

  it('lists a legend row only for the marks actually on the chart', () => {
    const { unmount } = renderTrace();
    expect(screen.getByTestId('trace-legend-flow')).toBeInTheDocument();
    expect(screen.getByTestId('trace-legend-back')).toBeInTheDocument();
    expect(screen.getByTestId('trace-legend-lateral')).toBeInTheDocument();
    expect(screen.getByTestId('trace-legend-own')).toBeInTheDocument();
    expect(screen.getByTestId('trace-status-legend')).toBeInTheDocument();
    unmount();
    renderTrace({ elements: classic });
    expect(screen.getByTestId('trace-legend-flow')).toBeInTheDocument();
    expect(screen.getByTestId('trace-legend-other-out')).toBeInTheDocument();
    expect(screen.queryByTestId('trace-legend-back')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-legend-lateral')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-legend-own')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-status-legend')).not.toBeInTheDocument();
  });

  it('draws k8s node frames under the Node layout and remounts back to Flat', () => {
    const { unmount } = renderTrace({ elements: placedPods });
    expect(screen.getByRole('radio', { name: /^flat$/i })).toBeChecked();
    expect(screen.queryByTestId('trace-wrapper-worker-0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    expect(screen.getByTestId('trace-wrapper-worker-0')).toBeInTheDocument();
    expect(screen.getByTestId('trace-wrapper-worker-1')).toHaveAttribute('data-status', 'warning');
    expect(screen.getByTestId('trace-wrapper-title-worker-0')).toHaveAttribute('data-locatable', 'true');
    unmount();
    renderTrace({ elements: placedPods });
    expect(screen.getByRole('radio', { name: /^flat$/i })).toBeChecked();
    expect(screen.queryByTestId('trace-wrapper-worker-0')).not.toBeInTheDocument();
  });

  it('reports a controlled layout upward without owning it', () => {
    const onLayoutChange = vi.fn();
    renderTrace({ layout: 'flat', onLayoutChange });
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    expect(onLayoutChange).toHaveBeenCalledWith('node');
    expect(screen.getByRole('radio', { name: /^flat$/i })).toBeChecked();
  });

  it('preserves the zoom readout across a layout and an order switch', () => {
    renderTrace();
    fireEvent.keyDown(screen.getByTestId('sankey-chart-host'), { key: '1' });
    expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent('100%');
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent('100%');
    fireEvent.click(screen.getByRole('radio', { name: /^barycenter$/i }));
    expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent('100%');
    expect(screen.getByTestId('sankey-svg')).toBeInTheDocument();
  });
});

describe('TraceView Min Δ', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies a typed threshold after a 200 ms pause, not on every keystroke', () => {
    vi.useFakeTimers();
    const { props } = renderTrace();
    const input = screen.getByTestId('trace-min-bps');
    fireEvent.change(input, { target: { value: '5000000' } });
    fireEvent.change(input, { target: { value: '5000000000' } });
    expect(props.onMinBpsChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('trace-min-bps-hint')).toHaveTextContent('= 5 Gbps');
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(props.onMinBpsChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(props.onMinBpsChange).toHaveBeenCalledTimes(1);
    expect(props.onMinBpsChange).toHaveBeenCalledWith(5_000_000_000);
  });

  it('normalises the text on blur: junk becomes 0 and a fraction is floored', () => {
    vi.useFakeTimers();
    const { props } = renderTrace({ minBps: 100 });
    const input = screen.getByTestId('trace-min-bps');
    expect(input).toHaveValue(100);
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.blur(input);
    expect(props.onMinBpsChange).toHaveBeenCalledWith(0);
    expect(input).toHaveValue(null);
    expect(screen.getByTestId('trace-min-bps-hint')).toHaveTextContent('off');

    (props.onMinBpsChange as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.change(input, { target: { value: '12.7' } });
    fireEvent.blur(input);
    expect(props.onMinBpsChange).toHaveBeenCalledWith(12);
    expect(input).toHaveValue(12);
  });

  it('shows the hidden pill with counts while a threshold is applied, and Clear resets it', () => {
    const first = renderTrace({ minBps: 5e9 });
    expect(screen.getByTestId('trace-filtered-pill')).toHaveTextContent('hidden 84 ribbons / 26 hops (208 Gbps)');
    fireEvent.click(screen.getByTestId('trace-min-bps-clear'));
    expect(first.props.onMinBpsChange).toHaveBeenCalledWith(0);
    first.unmount();
    const second = renderTrace({ minBps: 1e15 });
    expect(screen.getByTestId('trace-filtered-pill')).toHaveTextContent('hidden 120 ribbons / 56 hops');
    second.unmount();
    renderTrace({ minBps: 0 });
    expect(screen.queryByTestId('trace-filtered-pill')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-min-bps-clear')).not.toBeInTheDocument();
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
    expect(screen.queryByRole('radio', { name: /^flat$/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-summary')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('sankey-chart-host'), { key: 'Escape' });
    expect(onExit).toHaveBeenCalledWith(false);
  });
});

describe('TraceView hover and locate', () => {
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

  it('locates a hop or a pod on click but not a synthesised owner / namespace card', () => {
    const { props } = renderTrace();
    fireEvent.click(screen.getByTestId('trace-node-Core 1'));
    expect(props.onLocateNode).toHaveBeenCalledWith('dci-uturn/core-1');
    fireEvent.click(screen.getByTestId('trace-node-kafka-2'));
    expect(props.onLocateNode).toHaveBeenCalledWith('k8s/kafka-2');
    (props.onLocateNode as ReturnType<typeof vi.fn>).mockClear();
    expect(screen.getByTestId('trace-node-網管部 王小明')).toHaveAttribute('data-locatable', 'false');
    expect(screen.getByTestId('trace-node-stream')).toHaveAttribute('data-locatable', 'false');
    fireEvent.click(screen.getByTestId('trace-node-網管部 王小明'));
    fireEvent.click(screen.getByTestId('trace-node-stream'));
    fireEvent.click(screen.getByTestId('trace-node-et-0/0/0'));
    expect(props.onLocateNode).not.toHaveBeenCalled();
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

describe('TraceView summary and warnings', () => {
  it('warns when the start reports the other direction than the query asked for', () => {
    renderTrace({ elements: twoSwitches, trackDir: 'source' });
    expect(screen.getByTestId('sankey-svg')).toBeInTheDocument();
    expect(screen.getByTestId('trace-summary-toggle')).toHaveTextContent('1 warning');
    openSummary();
    expect(screen.getByTestId('trace-warnings')).toHaveTextContent('reports direction "in" (destination)');
    expect(screen.getByTestId('trace-warnings')).toHaveTextContent('asked for source');
  });

  it('lists the model warnings and the loader errors in the warnings drawer', () => {
    renderTrace({ errors: ['Node "x": skipped, no id'] });
    openSummary();
    const warnings = screen.getByTestId('trace-warnings');
    expect(warnings).toHaveTextContent('drawn as backflow');
    // The showcase's `k8s-source` island feeds its ToR from the k8s band: two band-boundary
    // backflows, each with its own warning.
    expect(warnings).toHaveTextContent('across the band boundary');
    expect(warnings).toHaveTextContent('Node "x": skipped, no id');
    expect(within(warnings).getAllByRole('listitem')).toHaveLength(4);
  });

  it('opens folded and draws the hop balance table only once expanded', () => {
    renderTrace();
    const toggle = screen.getByTestId('trace-summary-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('57 hops · 3 namespaces');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    openSummary();
    expect(screen.getByTestId('trace-hop-table')).toHaveTextContent('Core 1');
    expect(screen.getByTestId('trace-namespace-table')).toHaveTextContent('telemetry');
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

  it('frames a located result in the chart, ends the search and never leaves for Graph view', () => {
    const { props } = renderTrace();
    type('kafka-2');
    fireEvent.click(screen.getByTestId('search-result-k8s/kafka-2'));
    expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent('100%');
    expect(screen.getByTestId('sankey-search-input')).toHaveValue('');
    expect(opacityOf('trace-node-網管部 王小明')).toBe('1');
    expect(props.onLocateNode).not.toHaveBeenCalled();
  });

  it('matches k8s node frames under the Node layout and lights their member pods', () => {
    renderTrace({ elements: placedPods });
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    type('worker-0');
    expect(opacityOf('trace-node-p-a')).toBe('1');
    expect(opacityOf('trace-node-p-b')).toBe('0.3');
  });
});
