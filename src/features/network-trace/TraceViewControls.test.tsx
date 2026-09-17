import { act, fireEvent, render, screen } from '@testing-library/react';
import type cytoscape from 'cytoscape';
import type { JSX } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHOWCASE_TRACE } from '../../shared/fixtures/showcaseTrace';
import { normalizeGraph } from '../graph-data';
import { ThemeProvider } from '../theme';

import { deriveTrace } from './model/deriveTrace';
import type { TraceModel } from './model/types';
import { TRACE_SAMPLE_CLASSIC } from './testing/samples';
import { TraceViewControls, type TraceViewControlsProps } from './TraceViewControls';

const fixture = normalizeGraph(SHOWCASE_TRACE).elements;
const classic = normalizeGraph(TRACE_SAMPLE_CLASSIC.wire).elements;

function modelOf(elements = fixture, minBps = 0): TraceModel {
  return deriveTrace(elements, { direction: 'destination', minBps });
}

const EMPTY_MODEL = deriveTrace([], { direction: 'destination' });

/** The fixture with its trace start removed — a body from a backend that sent no `investigation`. */
function withoutInvestigation(): cytoscape.ElementDefinition[] {
  return fixture.map((el) => {
    if (el.group !== 'nodes' || !('investigation' in el.data)) {
      return el;
    }
    const data = Object.fromEntries(Object.entries(el.data).filter(([key]) => key !== 'investigation'));
    return { ...el, data };
  });
}

function baseProps(overrides: Partial<TraceViewControlsProps> = {}): TraceViewControlsProps {
  return {
    model: modelOf(),
    grouping: 'none',
    onGroupingChange: vi.fn(),
    order: 'flow',
    onOrderChange: vi.fn(),
    minBps: 0,
    onMinBpsChange: vi.fn(),
    warnings: [],
    ...overrides,
  };
}

function wrap(props: TraceViewControlsProps): JSX.Element {
  return (
    <ThemeProvider>
      <TraceViewControls {...props} />
    </ThemeProvider>
  );
}

function renderControls(
  overrides: Partial<TraceViewControlsProps> = {}
): { props: TraceViewControlsProps } & ReturnType<typeof render> {
  const props = baseProps(overrides);
  return { props, ...render(wrap(props)) };
}

describe('TraceViewControls Group and Order', () => {
  it('reports each switch upward without owning it, and stays operable with nothing drawn', () => {
    const { props } = renderControls({ model: EMPTY_MODEL });
    expect(screen.getByRole('radio', { name: /^none$/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^flow$/i })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /^cluster$/i }));
    fireEvent.click(screen.getByRole('radio', { name: /^barycenter$/i }));
    expect(props.onGroupingChange).toHaveBeenCalledWith('cluster');
    expect(props.onOrderChange).toHaveBeenCalledWith('barycenter');
    expect(screen.getByRole('radio', { name: /^none$/i })).toBeChecked();
    expect(screen.getByTestId('trace-grouping')).toBeInTheDocument();
    expect(screen.getByTestId('trace-order')).toBeInTheDocument();
  });
});

describe('TraceViewControls Min Δ', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once after the pause even when the parent re-renders with a new callback each time', () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const { rerender } = renderControls({ onMinBpsChange: first });
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

  it('applies a typed threshold after a 200 ms pause, not on every keystroke', () => {
    vi.useFakeTimers();
    const { props } = renderControls();
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
    const { props } = renderControls({ minBps: 100 });
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
    const first = renderControls({ minBps: 5e9, model: modelOf(fixture, 5e9) });
    expect(screen.getByTestId('trace-filtered-pill')).toHaveTextContent('hidden 84 ribbons / 26 hops (208 Gbps)');
    fireEvent.click(screen.getByTestId('trace-min-bps-clear'));
    expect(first.props.onMinBpsChange).toHaveBeenCalledWith(0);
    first.unmount();
    const second = renderControls({ minBps: 1e15, model: modelOf(fixture, 1e15) });
    expect(screen.getByTestId('trace-filtered-pill')).toHaveTextContent('hidden 120 ribbons / 57 hops');
    second.unmount();
    renderControls({ minBps: 0 });
    expect(screen.queryByTestId('trace-filtered-pill')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-min-bps-clear')).not.toBeInTheDocument();
  });
});

describe('TraceViewControls Hidden amounts stay in the balance', () => {
  const sw = (id: string, extra: Record<string, unknown> = {}): object => ({
    data: { id, name: id, type: 'switch', ...extra },
  });
  const ribbon = (id: string, source: string, target: string, bps: number): object => ({
    data: {
      id,
      type: 'network-flow',
      source,
      target,
      labels: { source_iface: `${id}-out`, target_iface: `${id}-in` },
      metrics: { delta_bps: bps },
    },
  });
  /** `sw-core-1` feeds three switches; `withFeed` also feeds `sw-c` from `sw-a`. */
  function coreBody(withFeed: boolean): cytoscape.ElementDefinition[] {
    const start = { investigation: { iface: 'et-0/0/1', delta_bps: 19_400_000_000, direction: 'in' } };
    return normalizeGraph({
      elements: {
        nodes: [sw('sw-core-1', start), sw('sw-a'), sw('sw-b'), sw('sw-c')],
        edges: [
          ribbon('e1', 'sw-core-1', 'sw-a', 14e9),
          ribbon('e2', 'sw-core-1', 'sw-b', 5e9),
          ribbon('e3', 'sw-core-1', 'sw-c', 4e8),
          ...(withFeed ? [ribbon('e4', 'sw-a', 'sw-c', 3e9)] : []),
        ],
      },
    }).elements;
  }

  it('folds a hidden ribbon into other out and names no hop when none is hidden whole', () => {
    const before = modelOf(coreBody(true), 0);
    const after = modelOf(coreBody(true), 1e9);
    expect(before.ok && after.ok).toBe(true);
    if (!before.ok || !after.ok) {
      return;
    }
    const otherOut = (m: typeof after): number => m.nodes.find((n) => n.id === 'sw-core-1')?.otherOut ?? NaN;
    expect(otherOut(after) - otherOut(before)).toBe(4e8);
    expect(after.nodes.some((n) => n.id === 'sw-c')).toBe(true);
    renderControls({ model: after, minBps: 1e9, warnings: after.warnings });
    expect(screen.getByTestId('trace-filtered-pill')).toHaveTextContent(/^hidden 1 ribbon \(400 Mbps\)$/);
  });

  it('counts a hop hidden whole when its only ribbon goes', () => {
    const after = modelOf(coreBody(false), 1e9);
    expect(after.ok).toBe(true);
    if (!after.ok) {
      return;
    }
    expect(after.filteredNodes).toEqual(['sw-c']);
    renderControls({ model: after, minBps: 1e9, warnings: after.warnings });
    expect(screen.getByTestId('trace-filtered-pill')).toHaveTextContent(/^hidden 1 ribbon \/ 1 hop \(400 Mbps\)$/);
  });
});

describe('TraceViewControls legend', () => {
  it('lists a legend row only for the marks actually on the chart', () => {
    const { unmount } = renderControls();
    expect(screen.getByTestId('trace-legend-flow')).toBeInTheDocument();
    expect(screen.getByTestId('trace-legend-back')).toBeInTheDocument();
    expect(screen.getByTestId('trace-legend-lateral')).toBeInTheDocument();
    expect(screen.getByTestId('trace-legend-own')).toBeInTheDocument();
    expect(screen.getByTestId('trace-status-legend')).toBeInTheDocument();
    unmount();
    renderControls({ model: modelOf(classic) });
    expect(screen.getByTestId('trace-legend-flow')).toBeInTheDocument();
    // The residual rows are gated like every other row: this body loses traffic on its way
    // through (an "other in" block) but nothing leaves unaccounted, so naming "other out"
    // would send the reader hunting for a block that is not drawn.
    expect(screen.getByTestId('trace-legend-other-in')).toBeInTheDocument();
    expect(screen.queryByTestId('trace-legend-other-out')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-legend-back')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-legend-lateral')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-legend-own')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trace-status-legend')).not.toBeInTheDocument();
  });

  it('sits after the Group, Order and Min Δ controls', () => {
    renderControls();
    const legend = screen.getByTestId('trace-legend');
    for (const testId of ['trace-grouping', 'trace-order', 'trace-min-bps']) {
      expect(
        screen.getByTestId(testId).compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  });

  it('draws no legend row while there is no chart to explain', () => {
    const { unmount } = renderControls({ model: EMPTY_MODEL });
    expect(screen.queryByTestId('trace-legend')).not.toBeInTheDocument();
    unmount();
    // Everything below the threshold and no start to keep: the view shows the filtered state.
    renderControls({ model: modelOf(withoutInvestigation(), 1e15), minBps: 1e15 });
    expect(screen.queryByTestId('trace-legend')).not.toBeInTheDocument();
  });
});

describe('TraceViewControls warnings', () => {
  it('Warnings are a pill, not a drawer', () => {
    const model = modelOf(fixture, 1e9);
    const warnings = model.ok ? model.warnings : [];
    const hidden = warnings.find((w) => w.startsWith('Display threshold > 1 Gbps'));
    expect(hidden).toBeDefined();
    renderControls({ model, minBps: 1e9, warnings });
    const pill = screen.getByTestId('trace-warnings-pill');
    expect(pill).toHaveTextContent(`${String(warnings.length)} warnings`);
    expect(pill).toHaveAttribute('tabindex', '0');
    expect(pill.getAttribute('title')).toContain(hidden);
    expect(pill.getAttribute('aria-label')).toContain(hidden);
    expect(screen.queryByTestId('trace-warnings')).not.toBeInTheDocument();
  });

  it('drops the threshold warning after Clear, and the pill once no warning remains', () => {
    const cleared = modelOf(fixture, 0);
    const warnings = cleared.ok ? cleared.warnings : [];
    const { unmount } = renderControls({ model: cleared, minBps: 0, warnings });
    const pill = screen.getByTestId('trace-warnings-pill');
    expect(pill).toHaveTextContent(`${String(warnings.length)} warnings`);
    expect(pill.getAttribute('title')).not.toContain('Display threshold');
    unmount();
    const classicModel = modelOf(classic, 0);
    renderControls({ model: classicModel, minBps: 0, warnings: classicModel.ok ? classicModel.warnings : [] });
    expect(screen.queryByTestId('trace-warnings-pill')).not.toBeInTheDocument();
  });

  it('carries the loader errors among the messages and is absent when there are none', () => {
    const { unmount } = renderControls({ warnings: ['Node "x": skipped, no id'] });
    expect(screen.getByTestId('trace-warnings-pill')).toHaveTextContent('1 warning');
    expect(screen.getByTestId('trace-warnings-pill').getAttribute('title')).toBe('Node "x": skipped, no id');
    unmount();
    renderControls({ model: modelOf(classic), warnings: [] });
    expect(screen.queryByTestId('trace-warnings-pill')).not.toBeInTheDocument();
  });
});
