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

/** A refreshed payload the backend answered without `pod/mongo-0` at all. */
function withoutMongo0(): cytoscape.ElementDefinition[] {
  const isMongo0 = (id: string | undefined): boolean => id === 'pod/mongo-0';
  return elements.filter((el) => {
    if (el.group === 'nodes') {
      return !isMongo0((el.data as cytoscape.NodeDataDefinition).id);
    }
    const d = el.data as cytoscape.EdgeDataDefinition;
    return !isMongo0(d.source) && !isMongo0(d.target);
  });
}

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
    expect(screen.getByTestId('trace-node-et-0/0/48')).toHaveAttribute('data-kind', 'anchor');
  });
});

describe('TraceView chart', () => {
  it('draws ribbons, hop cards, residuals and column headers for the fixture', () => {
    renderTrace();
    expect(screen.getByTestId('sankey-svg')).toBeInTheDocument();
    expect(screen.getAllByTestId('trace-band').length).toBeGreaterThan(0);
    expect(screen.getByTestId('trace-node-dist-a')).toHaveAttribute('data-kind', 'switch');
    expect(screen.getByTestId('trace-node-spine-b')).toHaveAttribute('data-status', 'warning');
    expect(screen.getAllByTestId('trace-residual-out').length).toBeGreaterThan(0);
    const headers = screen.getAllByTestId('sankey-column-header').map((el) => el.textContent);
    expect(headers).toContain('Trace start (in)');
    expect(headers.some((h) => h?.startsWith('Hop 1') === true)).toBe(true);
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
    const { unmount } = renderTrace();
    expect(screen.getByRole('radio', { name: /^flat$/i })).toBeChecked();
    expect(screen.queryByTestId('trace-wrapper-worker-0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    expect(screen.getByTestId('trace-wrapper-worker-0')).toBeInTheDocument();
    expect(screen.getByTestId('trace-wrapper-worker-1')).toHaveAttribute('data-status', 'warning');
    expect(screen.getByTestId('trace-wrapper-title-worker-0')).toHaveAttribute('data-locatable', 'true');
    unmount();
    renderTrace();
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
    expect(screen.getByTestId('trace-filtered-pill')).toHaveTextContent('hidden 6 ribbons (20 Gbps)');
    expect(screen.getByTestId('trace-filtered-pill')).not.toHaveTextContent('hop');
    fireEvent.click(screen.getByTestId('trace-min-bps-clear'));
    expect(first.props.onMinBpsChange).toHaveBeenCalledWith(0);
    first.unmount();
    const second = renderTrace({ minBps: 1e15 });
    expect(screen.getByTestId('trace-filtered-pill')).toHaveTextContent('hidden 10 ribbons / 3 hops');
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
    const mongo0 = screen.getByTestId('trace-node-mongo-0');
    fireEvent.mouseEnter(mongo0);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('pod / mongo-0');
    expect(tip).toHaveTextContent('namespace prod');
    expect(tip).toHaveTextContent('id pod/mongo-0');
    expect(mongo0.style.opacity).toBe('1');
    // Upstream of the pod: its spine and the start.
    expect(screen.getByTestId('trace-node-spine-a').style.opacity).toBe('1');
    expect(screen.getByTestId('trace-node-dist-a').style.opacity).toBe('1');
    // Another branch entirely.
    expect(screen.getByTestId('trace-node-Storage team').style.opacity).toBe('0.3');
    expect(screen.getByTestId('trace-node-mongo-1').style.opacity).toBe('0.3');
    fireEvent.mouseLeave(mongo0);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByTestId('trace-node-Storage team').style.opacity).toBe('1');
  });

  it('names the residual and its hop on hover', () => {
    renderTrace();
    fireEvent.mouseEnter(screen.getAllByTestId('trace-residual-out')[0]!);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('dist-a · other out +5 Gbps');
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
    fireEvent.click(screen.getByTestId('trace-node-spine-a'));
    expect(props.onLocateNode).toHaveBeenCalledWith('sw/spine-a');
    fireEvent.click(screen.getByTestId('trace-node-mongo-0'));
    expect(props.onLocateNode).toHaveBeenCalledWith('pod/mongo-0');
    (props.onLocateNode as ReturnType<typeof vi.fn>).mockClear();
    expect(screen.getByTestId('trace-node-Storage team')).toHaveAttribute('data-locatable', 'false');
    expect(screen.getByTestId('trace-node-prod')).toHaveAttribute('data-locatable', 'false');
    fireEvent.click(screen.getByTestId('trace-node-Storage team'));
    fireEvent.click(screen.getByTestId('trace-node-prod'));
    fireEvent.click(screen.getByTestId('trace-node-et-0/0/48'));
    expect(props.onLocateNode).not.toHaveBeenCalled();
  });

  it('clears the tooltip when a refresh removes the hovered node', () => {
    const { rerender } = renderTrace();
    fireEvent.mouseEnter(screen.getByTestId('trace-node-mongo-0'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    rerender(wrap(baseProps({ elements: withoutMongo0() })));
    expect(screen.queryByTestId('trace-node-mongo-0')).not.toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByTestId('trace-node-Storage team').style.opacity).toBe('1');
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
    expect(warnings).toHaveTextContent('Node "x": skipped, no id');
    expect(within(warnings).getAllByRole('listitem')).toHaveLength(2);
  });

  it('opens folded and draws the hop balance table only once expanded', () => {
    renderTrace();
    const toggle = screen.getByTestId('trace-summary-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('4 hops · 1 namespaces');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    openSummary();
    expect(screen.getByTestId('trace-hop-table')).toHaveTextContent('dist-a');
    expect(screen.getByTestId('trace-namespace-table')).toHaveTextContent('prod');
  });
});
