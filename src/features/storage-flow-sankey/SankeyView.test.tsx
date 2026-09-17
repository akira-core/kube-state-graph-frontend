import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type cytoscape from 'cytoscape';
import { useState, type JSX } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { STATUS_COLOR } from '../../shared/constants/colorByStatus';
import { SHOWCASE_STORAGE_GRAPH } from '../../shared/fixtures/showcaseStorageGraph';
import { DARK_TOKENS } from '../../shared/theme/tokens';
import { EMPTY_STORAGE_GRAPH_ROOTS, normalizeGraph } from '../graph-data';
import { SankeyCard } from '../sankey-canvas';
import { ThemeProvider } from '../theme';

import { deriveSankey, type SankeyMode, type SankeySvmDisplay } from './deriveSankey';
import { layoutSankey, type SankeyPodLayout } from './layoutSankey';
import { SankeyChart } from './SankeyChart';
import { DEFAULT_TOP_PODS } from './sankeyUrlScope';
import { SankeyView, type SankeyViewProps } from './SankeyView';
import { SankeyViewControls } from './SankeyViewControls';
import { useSankeyProjection } from './useSankeyProjection';

const { elements } = normalizeGraph(SHOWCASE_STORAGE_GRAPH);

/**
 * A refreshed payload the backend answered without `aggr1` at all.
 *
 * Dropping only its edges would not do it: a node the backend returns with no flow is a
 * materialised root and stays drawn on purpose, so the node itself has to go for this to
 * be the "hovered node disappeared" case.
 */
function withoutAggr1(): cytoscape.ElementDefinition[] {
  const isAggr1 = (id: string | undefined): boolean => (id ?? '').endsWith('/aggr1');
  return elements.filter((el) => {
    if (el.group === 'nodes') {
      return !isAggr1((el.data as cytoscape.NodeDataDefinition).id);
    }
    const d = el.data as cytoscape.EdgeDataDefinition;
    return !isAggr1(d.source) && !isAggr1(d.target);
  });
}

/** The fixture's PVCs stripped of `labels.aggr` — a body from a backend without `expose-claim-aggregate`. */
function withoutClaimAggregates(): cytoscape.ElementDefinition[] {
  return elements.map((el) => {
    if (el.group !== 'nodes') {
      return el;
    }
    const data = el.data as cytoscape.NodeDataDefinition;
    const labels = data.labels;
    if (labels?.aggr === undefined) {
      return el;
    }
    const rest = Object.fromEntries(Object.entries(labels).filter(([key]) => key !== 'aggr'));
    return { ...el, data: { ...data, labels: rest } };
  });
}

/**
 * The Storage Sankey page's composition around the view: the projection hook, the view
 * controls the scope bar carries, and the transient state they switch. The view itself is
 * prop-driven; these tests exercise it the way the page drives it.
 */
interface HarnessProps extends Omit<SankeyViewProps, 'mode' | 'podLayout' | 'svmDisplay'> {
  topPods?: number;
  mode?: SankeyMode;
  onModeChange?: (next: SankeyMode) => void;
  onPodLayoutChange?: (next: SankeyPodLayout) => void;
  onSvmDisplayChange?: (next: SankeySvmDisplay) => void;
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
    azEnvReady: true,
    onLocateNode: vi.fn(),
    ...overrides,
  };
}

function Harness({
  topPods = DEFAULT_TOP_PODS,
  mode: initialMode = 'both',
  onModeChange,
  onPodLayoutChange,
  onSvmDisplayChange,
  ...view
}: Readonly<HarnessProps>): JSX.Element {
  const [mode, setMode] = useState<SankeyMode>(initialMode);
  const [podLayout, setPodLayout] = useState<SankeyPodLayout>('flat');
  const [svmDisplay, setSvmDisplay] = useState<SankeySvmDisplay>('column');
  const roots = view.roots ?? EMPTY_STORAGE_GRAPH_ROOTS;
  const projection = useSankeyProjection({ elements: view.elements, mode, topPods, roots });
  const effectiveSvmDisplay = projection.svmAvailable ? svmDisplay : 'column';
  return (
    <>
      {!view.focusMode && (
        <SankeyViewControls
          mode={mode}
          onModeChange={(next) => {
            setMode(next);
            onModeChange?.(next);
          }}
          podLayout={podLayout}
          onPodLayoutChange={(next) => {
            setPodLayout(next);
            onPodLayoutChange?.(next);
          }}
          svmDisplay={effectiveSvmDisplay}
          onSvmDisplayChange={(next) => {
            setSvmDisplay(next);
            onSvmDisplayChange?.(next);
          }}
          svmAvailable={projection.svmAvailable}
          podCut={projection.podCut}
        />
      )}
      <SankeyView
        {...view}
        elements={projection.elements}
        mode={mode}
        podLayout={podLayout}
        svmDisplay={effectiveSvmDisplay}
      />
    </>
  );
}

function wrap(props: HarnessProps, theme?: 'dark' | 'light'): JSX.Element {
  return (
    <ThemeProvider {...(theme !== undefined ? { configTheme: theme } : {})}>
      <div style={{ width: 800, height: 480 }}>
        <Harness {...props} />
      </div>
    </ThemeProvider>
  );
}

/** The colour a CSS color value normalises to, so a token and an inline style compare. */
function cssColor(value: string): string {
  const probe = document.createElement('div');
  probe.style.color = value;
  return probe.style.color;
}

/** The tooltip's rows, each with the colour it is painted in ('' when plain). */
function tooltipRows(): Array<{ text: string; color: string }> {
  return [...screen.getByRole('tooltip').children].map((row) => ({
    text: row.textContent ?? '',
    color: (row as HTMLElement).style.color,
  }));
}

function rowStarting(prefix: string): { text: string; color: string } {
  const row = tooltipRows().find((r) => r.text.startsWith(prefix));
  expect(row, `tooltip row starting "${prefix}"`).toBeDefined();
  return row!;
}

/** Mirrors `UNMEASURED_CONTAINER` — what the zoom controls fall back to with no layout. */
const UNMEASURED = { w: 800, h: 480 };

/** The `scale(...)` factor the viewport transform is actually drawing at. */
function scaleOf(svg: HTMLElement): number {
  const transform = svg.querySelector('g')?.getAttribute('transform') ?? '';
  return Number(/scale\(([-\d.e+]+)\)/.exec(transform)?.[1]);
}

/** The `translate(x,Y)` the viewport transform is drawing at. */
function translateYOf(svg: HTMLElement): number {
  const transform = svg.querySelector('g')?.getAttribute('transform') ?? '';
  return Number(/translate\([-\d.e+]+,([-\d.e+]+)\)/.exec(transform)?.[1]);
}

/** The layout's own size, in the same units the transform is applied in. */
function layoutSize(): { w: number; h: number } {
  const { width, height } = layoutSankey(deriveSankey(elements, 'both'), ['#000', '#111', '#222', '#333', '#444']);
  return { w: width, h: height };
}

function renderSankey(overrides: Overrides = {}): { props: HarnessProps; unmount: () => void } {
  const props = baseProps(overrides);
  const { unmount } = render(wrap(props));
  return { props, unmount };
}

function renderSankeyWithProps(props: HarnessProps): ReturnType<typeof render> {
  return render(wrap(props));
}

describe('SankeyView', () => {
  it('defaults to Both and draws distinct read and write links', () => {
    renderSankey();
    expect(screen.getByRole('radio', { name: /both/i })).toBeChecked();
    expect(screen.getAllByTestId('sankey-link-read').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('sankey-link-write').length).toBeGreaterThan(0);
  });

  it('wheel-zooms a chart that mounted after the loading gate — the live page never renders the host first', () => {
    // Live mode: the first commit is `loading` with no payload, so the chart host (and the
    // ref the wheel listener attaches to) does not exist yet. The listener must attach once
    // the host actually mounts, not only if it happened to be there on the first render.
    const { rerender } = renderSankeyWithProps(
      baseProps({ demoMode: false, hasRoot: true, status: 'loading', hasPayload: false, elements: [] })
    );
    expect(screen.queryByTestId('sankey-chart-host')).not.toBeInTheDocument();

    rerender(wrap(baseProps({ demoMode: false, hasRoot: true })));
    const host = screen.getByTestId('sankey-chart-host');
    const before = screen.getByTestId('sankey-zoom-controls').textContent;
    fireEvent.wheel(host, { deltaY: -600, clientX: 100, clientY: 100 });
    expect(screen.getByTestId('sankey-zoom-controls').textContent).not.toBe(before);
  });

  it('keeps the drawn chart when the draft is edited into an incomplete scope (explicit-query: drafts never alter drawn data)', () => {
    const { rerender } = renderSankeyWithProps(baseProps({ demoMode: false, hasRoot: true }));
    expect(screen.getByTestId('sankey-svg')).toBeInTheDocument();

    // The operator unchecks the last root pill. The APPLIED selection (what was drawn) has
    // not changed; only the draft has, and the Query button says "Changes not applied".
    rerender(wrap(baseProps({ demoMode: false, hasRoot: false })));
    expect(screen.getByTestId('sankey-svg')).toBeInTheDocument();
    expect(screen.queryByTestId('sankey-empty-scope')).not.toBeInTheDocument();
  });

  it('shows an unconfigured empty state without drawing', () => {
    renderSankey({ demoMode: false, endpointConfigured: false, azEnvReady: false, hasPayload: false, status: 'idle' });
    expect(screen.getByTestId('sankey-empty-unconfigured')).toHaveTextContent('not configured');
    expect(screen.queryByTestId('sankey-svg')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /both/i })).toBeEnabled();
  });

  it('shows a distinct az/env prompt that is not the empty-response copy', () => {
    renderSankey({ azEnvReady: false, hasPayload: false, status: 'idle', demoMode: false });
    expect(screen.getByTestId('sankey-empty-scope')).toHaveTextContent('No request has been sent');
    expect(screen.getByTestId('sankey-empty-scope')).toHaveTextContent('root');
    expect(screen.queryByTestId('sankey-empty-response')).not.toBeInTheDocument();
  });

  it('draws 10 pod cards on a body larger than K and names the cut', () => {
    const large: cytoscape.ElementDefinition[] = [];
    large.push({ group: 'nodes', data: { id: 'nn/0', label: 'nn-0', kind: 'netapp-node' } });
    large.push({ group: 'nodes', data: { id: 'ag/0', label: 'ag-0', kind: 'netapp-aggr' } });
    large.push({ group: 'nodes', data: { id: 'sv/0', label: 'sv-0', kind: 'netapp-svm' } });
    large.push({
      group: 'edges',
      data: {
        id: 'na',
        source: 'nn/0',
        target: 'ag/0',
        edgeType: 'storage-flow',
        labels: { tier: 'node-aggr' },
        metrics: { readBytesPerSec: 1, writeBytesPerSec: 1 },
      },
    });
    large.push({
      group: 'edges',
      data: {
        id: 'as',
        source: 'ag/0',
        target: 'sv/0',
        edgeType: 'storage-flow',
        labels: { tier: 'aggr-svm' },
        metrics: { readBytesPerSec: 1, writeBytesPerSec: 1 },
      },
    });
    for (let i = 0; i < 15; i += 1) {
      large.push({ group: 'nodes', data: { id: `pvc/${String(i)}`, label: `pvc-${String(i)}`, kind: 'pvc' } });
      large.push({
        group: 'nodes',
        data: { id: `pod/${String(i)}`, label: `pod-${String(i)}`, kind: 'pod', namespace: 'ns' },
      });
      large.push({
        group: 'edges',
        data: {
          id: `sp-${String(i)}`,
          source: 'sv/0',
          target: `pvc/${String(i)}`,
          edgeType: 'storage-flow',
          labels: { tier: 'svm-pvc' },
          metrics: { readBytesPerSec: 100 - i, writeBytesPerSec: 1 },
        },
      });
      large.push({
        group: 'edges',
        data: {
          id: `pp-${String(i)}`,
          source: `pvc/${String(i)}`,
          target: `pod/${String(i)}`,
          edgeType: 'storage-flow',
          labels: { tier: 'pvc-pod' },
          metrics: { readBytesPerSec: 100 - i, writeBytesPerSec: 1 },
        },
      });
    }
    renderSankey({ elements: large, topPods: 10, hasRoot: true, demoMode: true });
    expect(screen.getAllByTestId(/^sankey-node-/).filter((el) => el.getAttribute('data-kind') === 'pod')).toHaveLength(
      10
    );
    expect(screen.getByTestId('sankey-top-pods-label')).toHaveTextContent('10 of 15 pods');
  });

  it('does not cut when a pod root is present, and drops wrappers with no kept pods', () => {
    const { unmount } = renderSankey({
      topPods: 1,
      roots: { ...EMPTY_STORAGE_GRAPH_ROOTS, pod: ['shop/mongo-0'] },
      hasRoot: true,
      demoMode: true,
    });
    expect(
      screen.getAllByTestId(/^sankey-node-/).filter((el) => el.getAttribute('data-kind') === 'pod').length
    ).toBeGreaterThan(1);
    expect(screen.queryByTestId('sankey-top-pods-label')).not.toBeInTheDocument();
    unmount();
    renderSankey({ topPods: 1, hasRoot: true, demoMode: true });
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    expect(screen.getAllByTestId(/^sankey-wrapper-[^t]/).length).toBe(1);
  });

  it('shows awaiting Query when the draft is complete but nothing has been committed, controls operable', () => {
    renderSankey({
      demoMode: false,
      azEnvReady: true,
      hasRoot: true,
      hasPayload: false,
      status: 'idle',
      elements: [],
    });
    expect(screen.getByTestId('sankey-empty-awaiting')).toHaveTextContent('Query');
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    fireEvent.click(screen.getByRole('radio', { name: /^write$/i }));
    expect(screen.getByRole('radio', { name: /^node$/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^write$/i })).toBeChecked();
    expect(screen.getByTestId('sankey-empty-awaiting')).toBeInTheDocument();
  });

  it('shows cancelled when the only request was cancelled', () => {
    renderSankey({
      demoMode: false,
      azEnvReady: true,
      hasRoot: true,
      hasPayload: false,
      status: 'idle',
      cancelled: true,
      elements: [],
    });
    expect(screen.getByTestId('sankey-empty-cancelled')).toHaveTextContent('cancelled');
  });

  it('shows a distinct empty-response copy, extra in demo mode', () => {
    renderSankey({ elements: [], demoMode: true });
    expect(screen.getByTestId('sankey-empty-response')).toHaveTextContent('demo fixture');
    expect(screen.getByTestId('sankey-empty-response')).toHaveTextContent('root name may not exist');
  });

  it('prompts to switch mode when the current direction has no measurements', () => {
    const writeOnly = normalizeGraph({
      elements: {
        nodes: [
          { data: { id: 'a', name: 'a', type: 'netapp-aggr' } },
          { data: { id: 's', name: 's', type: 'netapp-svm' } },
        ],
        edges: [
          {
            data: {
              id: 'e',
              type: 'storage-flow',
              source: 'a',
              target: 's',
              labels: { tier: 'aggr-svm' },
              metrics: { write_bytes_per_sec: 100 },
            },
          },
        ],
      },
    }).elements;
    renderSankey({ elements: writeOnly });
    fireEvent.click(screen.getByRole('radio', { name: /read/i }));
    expect(screen.getByTestId('sankey-empty-mode')).toHaveTextContent('Read direction has no measurements');
    fireEvent.click(screen.getByRole('radio', { name: /write/i }));
    expect(screen.queryByTestId('sankey-empty-mode')).not.toBeInTheDocument();
    expect(screen.getByTestId('sankey-svg')).toBeInTheDocument();

    // The host was unmounted by the empty state and mounted again by the mode switch, with
    // nothing about the view's status changing: the wheel listener must follow the element,
    // not the status, or zoom is dead for the rest of the session.
    const host = screen.getByTestId('sankey-chart-host');
    const before = screen.getByTestId('sankey-zoom-controls').textContent;
    fireEvent.wheel(host, { deltaY: -600, clientX: 100, clientY: 100 });
    expect(screen.getByTestId('sankey-zoom-controls').textContent).not.toBe(before);
  });

  it('locates a storage node on click but not an SVM', () => {
    const { props } = renderSankey();
    fireEvent.click(screen.getByTestId('sankey-node-aggr1'));
    expect(props.onLocateNode).toHaveBeenCalled();
    (props.onLocateNode as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.click(screen.getByTestId('sankey-node-svm_shop'));
    expect(props.onLocateNode).not.toHaveBeenCalled();
    expect(screen.getByTestId('sankey-node-svm_shop')).toHaveAttribute('data-locatable', 'false');
  });

  it('shows ontap_cluster, hardware, and raw perf on a netapp-node tooltip', () => {
    renderSankey();
    fireEvent.mouseEnter(screen.getByTestId('sankey-node-ontap-prod-02'));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('netapp-node');
    expect(tip).toHaveTextContent('ontap_cluster ontap-prod');
    expect(tip).toHaveTextContent('AFF-A400');
    expect(tip).toHaveTextContent('cpu_busy_pct');
    expect(tip).toHaveTextContent('(raw)');
    expect(tip).toHaveTextContent('health degraded');
  });

  it('shows tier on a link tooltip and QoS only on svm-pvc', () => {
    renderSankey();
    fireEvent.mouseEnter(screen.getAllByTestId('sankey-link-read')[0]!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('tier');
  });

  it('marks a split pvc-pod as an estimate', () => {
    renderSankey();
    const splitLink = screen.getAllByTestId('sankey-link-read').find((el) => {
      fireEvent.mouseEnter(el);
      return screen.queryByRole('tooltip')?.textContent?.includes('split estimate') === true;
    });
    expect(splitLink).toBeDefined();
  });

  it('clears the tooltip and highlight when a refresh removes the hovered node', () => {
    // The node is gone, so its mouseleave will never fire: without an explicit clear the
    // tooltip stays open and every remaining link is faded against a node that is not there.
    const { rerender } = renderSankeyWithProps(baseProps());
    fireEvent.mouseEnter(screen.getByTestId('sankey-node-aggr1'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    rerender(wrap(baseProps({ elements: withoutAggr1() })));

    expect(screen.queryByTestId('sankey-node-aggr1')).not.toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    // "not faded by hover" — the fixed low opacity a zero-weight link always carries is a
    // different thing (absent-vs-zero, not highlight state), so this only rules out 0.14.
    expect(screen.getAllByTestId(/^sankey-link-/).every((el) => el.getAttribute('fill-opacity') !== '0.14')).toBe(true);
  });

  it('keeps the highlight for a node that survives the refresh', () => {
    const { rerender } = renderSankeyWithProps(baseProps());
    fireEvent.mouseEnter(screen.getByTestId('sankey-node-aggr2'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    rerender(wrap(baseProps({ elements: withoutAggr1() })));

    expect(screen.getByTestId('sankey-node-aggr2')).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('clears the tooltip and highlight when the layout stops drawing the hovered wrapper', () => {
    // The derived graph keeps every Kubernetes node whichever pod layout is on; only the
    // layout decides whether a wrapper is a card. Switching back to Flat removes the hovered
    // wrapper with no mouseleave, exactly like a refresh removing a node.
    renderSankey();
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    fireEvent.mouseEnter(screen.getByTestId('sankey-wrapper-title-worker-0'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('sankey-node-mongo-1').style.opacity).toBe('0.3');

    fireEvent.click(screen.getByRole('radio', { name: /^flat$/i }));

    expect(screen.queryByTestId('sankey-wrapper-title-worker-0')).not.toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByTestId('sankey-node-mongo-1').style.opacity).toBe('1');
  });

  it('renders nodes as box cards: a title, the kind on the subtitle and one attribute per line', () => {
    renderSankey();
    const card = screen.getByTestId('sankey-node-aggr1');
    expect(within(card).getByText('aggr1')).toBeInTheDocument();
    expect(within(card).getByText('netapp-aggr · ontap-prod')).toBeInTheDocument();
    expect(
      within(card)
        .getAllByTestId('sankey-card-line')
        .map((el) => el.textContent)
    ).toEqual(['usage 700 GB / 1 TB (70%)']);
  });

  it('The shared card draws the same SVG', () => {
    const layout = layoutSankey(deriveSankey(elements, 'both'), ['#000', '#111', '#222', '#333', '#444']);
    const pod = layout.nodes.find((n) => n.label === 'mongo-0');
    expect(pod?.subtitle).toBe('pod');
    expect(pod?.extraLines).toEqual(['ns/prod']);
    const noop = (): void => undefined;
    const chart = renderToStaticMarkup(
      <SankeyChart
        layout={layout}
        tokens={DARK_TOKENS}
        viewport={{ scale: 1, tx: 0, ty: 0 }}
        hostProps={{ ref: noop, onPointerDown: noop, onPointerMove: noop, onPointerUp: noop, onPointerCancel: noop }}
        dragging={false}
        lit={null}
        onNodeEnter={noop}
        onNodeLeave={noop}
        onNodeClick={noop}
        onLinkEnter={noop}
        onLinkLeave={noop}
        onKeyDown={noop}
      />
    );
    const doc = new DOMParser().parseFromString(chart, 'text/html');
    const storageCard = doc.querySelector('[data-testid="sankey-node-mongo-0"]');
    storageCard?.querySelector('[data-testid="sankey-ns-stripe"]')?.remove();
    // A trace card handed the same title, subtitle and attribute line.
    const traceCard = renderToStaticMarkup(
      <svg>
        <SankeyCard
          id={pod!.id}
          label="mongo-0"
          subtitle="pod"
          extraLines={['ns/prod']}
          kind="pod"
          x={pod!.x}
          y={pod!.y}
          width={pod!.width}
          height={pod!.height}
          tokens={DARK_TOKENS}
          dashed={false}
          locatable={pod!.locatable}
          faded={false}
          {...(pod!.status !== undefined ? { status: pod!.status } : {})}
          onEnter={noop}
          onLeave={noop}
          onClick={noop}
        />
      </svg>
    );
    const traceDoc = new DOMParser().parseFromString(traceCard, 'text/html');
    expect(storageCard?.outerHTML).toBe(traceDoc.querySelector('[data-testid="sankey-node-mongo-0"]')?.outerHTML);
  });

  it('Every ribbon ends in a chevron', () => {
    renderSankey();
    const ribbons = screen.getAllByTestId(/^sankey-link-(read|write)$/);
    const chevrons = screen.getAllByTestId('sankey-link-chevron');
    expect(chevrons).toHaveLength(ribbons.length);
    for (const chevron of chevrons) {
      expect(chevron.getAttribute('fill')).toBe('none');
      expect(chevron.getAttribute('stroke-opacity')).toBe('0.9');
    }
    fireEvent.mouseEnter(screen.getByTestId('sankey-node-aggr2'));
    const opacities = screen.getAllByTestId('sankey-link-chevron').map((el) => el.getAttribute('stroke-opacity'));
    expect(opacities).toContain('0.9');
    expect(opacities).toContain('0.2');
    // Each chevron fades with the ribbon drawn just before it.
    for (const chevron of screen.getAllByTestId('sankey-link-chevron')) {
      const ribbon = chevron.previousElementSibling;
      expect(ribbon?.getAttribute('data-testid')).toMatch(/^sankey-link-(read|write)$/);
      if (ribbon?.getAttribute('fill-opacity') === '0.14') {
        expect(chevron.getAttribute('stroke-opacity')).toBe('0.2');
      }
      if (ribbon?.getAttribute('fill-opacity') === '0.82') {
        expect(chevron.getAttribute('stroke-opacity')).toBe('0.9');
      }
    }
    fireEvent.mouseLeave(screen.getByTestId('sankey-node-aggr2'));
    expect(
      screen.getAllByTestId('sankey-link-chevron').every((el) => el.getAttribute('stroke-opacity') === '0.9')
    ).toBe(true);
  });

  describe('Flow rows are painted like their ribbons', () => {
    function ribbonColor(direction: 'read' | 'write'): string {
      return cssColor(screen.getAllByTestId(`sankey-link-${direction}`)[0]?.getAttribute('stroke') ?? '');
    }

    it('paints a card’s read and write rows in Both mode and leaves the rest plain', () => {
      renderSankey();
      const read = ribbonColor('read');
      const write = ribbonColor('write');
      expect(read).not.toBe(write);
      fireEvent.mouseEnter(screen.getByTestId('sankey-node-data-mongo-0'));
      expect(rowStarting('in read').color).toBe(read);
      expect(rowStarting('out read').color).toBe(read);
      expect(rowStarting('in write').color).toBe(write);
      expect(rowStarting('out write').color).toBe(write);
      for (const prefix of ['pvc / data-mongo-0', 'namespace', 'SVM', 'aggregate', 'status']) {
        expect(rowStarting(prefix).color).toBe('');
      }
      expect(tooltipRows().find((r) => r.text.includes(' / ') && r.text.includes('GB'))?.color ?? '').toBe('');
      fireEvent.mouseLeave(screen.getByTestId('sankey-node-data-mongo-0'));
      // Raw perf readings and health are never painted: they are not flow.
      fireEvent.mouseEnter(screen.getByTestId('sankey-node-ontap-prod-02'));
      expect(rowStarting('cpu_busy_pct').color).toBe('');
      expect(rowStarting('health').color).toBe('');
      expect(rowStarting('in read').color).toBe(read);
    });

    it('paints a write link’s value row and leaves tier and ceiling plain', () => {
      renderSankey();
      const write = ribbonColor('write');
      const link = screen.getAllByTestId('sankey-link-write').find((el) => {
        fireEvent.mouseEnter(el);
        const text = screen.queryByRole('tooltip')?.textContent ?? '';
        fireEvent.mouseLeave(el);
        return text.includes('svm_shop → data-mongo-0');
      });
      expect(link).toBeDefined();
      fireEvent.mouseEnter(link!);
      expect(rowStarting('write:').color).toBe(write);
      expect(rowStarting('tier').color).toBe('');
      for (const row of tooltipRows().filter((r) => r.text.startsWith('QoS ceiling'))) {
        expect(row.color).toBe('');
      }
    });

    it('paints a derived card’s rows and a wrapper’s rows the same way', () => {
      renderSankey({ mode: 'read' });
      const read = ribbonColor('read');
      fireEvent.mouseEnter(screen.getByTestId('sankey-node-mongodb'));
      expect(rowStarting('in ').text).toContain('derived from member pods');
      expect(rowStarting('in ').color).toBe(read);
      expect(rowStarting('application / mongodb').color).toBe('');
      fireEvent.mouseLeave(screen.getByTestId('sankey-node-mongodb'));
      fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
      fireEvent.mouseEnter(screen.getByTestId('sankey-wrapper-title-worker-0'));
      expect(rowStarting('in ').color).toBe(read);
      expect(rowStarting('out ').color).toBe(read);
      expect(rowStarting('status').color).toBe('');
    });

    it('takes the new theme’s token after a theme switch', () => {
      const colors: string[] = [];
      for (const theme of ['dark', 'light'] as const) {
        const { unmount } = render(wrap(baseProps(), theme));
        fireEvent.mouseEnter(screen.getByTestId('sankey-node-data-mongo-0'));
        const row = rowStarting('in read');
        expect(row.color).toBe(ribbonColor('read'));
        colors.push(row.color);
        unmount();
      }
      expect(colors[0]).not.toBe(colors[1]);
    });
  });

  it('lists a column header for every tier that has drawn nodes', () => {
    renderSankey();
    const headers = screen.getAllByTestId('sankey-column-header').map((el) => el.textContent);
    expect(headers).toEqual(expect.arrayContaining(['Pod', 'PVC', 'NetApp aggregate', 'NetApp node']));
  });

  it('gives same-namespace pods a stripe, one per namespaced pod', () => {
    renderSankey();
    const podCards = screen.getAllByTestId(/^sankey-node-/).filter((el) => el.getAttribute('data-kind') === 'pod');
    const nsCards = screen.getAllByTestId(/^sankey-node-/).filter((el) => el.getAttribute('data-kind') === 'namespace');
    const stripes = screen.getAllByTestId('sankey-ns-stripe');
    expect(stripes.length).toBeGreaterThan(0);
    expect(stripes.length).toBeLessThanOrEqual(podCards.length + nsCards.length);
  });

  it('borders a card in its status colour and leaves an unjudged card neutral', () => {
    renderSankey();
    const aggr1 = screen.getByTestId('sankey-node-aggr1');
    expect(aggr1).toHaveAttribute('data-status', 'warning');
    expect(aggr1.querySelector('rect[stroke]')?.getAttribute('stroke')).toBe(STATUS_COLOR.warning);

    const critical = screen.getByTestId('sankey-node-ontap-prod-02');
    expect(critical.querySelector('rect[stroke]')?.getAttribute('stroke')).toBe(STATUS_COLOR.critical);

    // The backend judges no SVM. Its card must NOT borrow a status colour — a green border
    // there would be a verdict nobody made, and the three bands would stop meaning anything.
    const svm = screen.getByTestId('sankey-node-svm_shop');
    expect(svm).not.toHaveAttribute('data-status');
    const svmStroke = svm.querySelector('rect[stroke]')?.getAttribute('stroke');
    expect(Object.values(STATUS_COLOR)).not.toContain(svmStroke);
  });

  it('names the three status bands in the scope bar legend so a coloured border is readable', () => {
    renderSankey();
    const legend = screen.getByTestId('sankey-status-legend');
    for (const status of Object.keys(STATUS_COLOR)) {
      expect(legend).toHaveTextContent(status);
      expect(within(legend).getByTestId(`sankey-status-swatch-${status}`)).toBeInTheDocument();
    }
  });

  it('reports status beside health in a node tooltip, since one folds the other', () => {
    renderSankey();
    fireEvent.mouseEnter(screen.getByTestId('sankey-node-aggr1'));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('status warning');
    expect(tip).toHaveTextContent('health online');
  });

  it('draws no title bar and no summary: the chart is all the view draws around its canvas', () => {
    render(
      <ThemeProvider>
        <div style={{ width: 800, height: 480 }}>
          <SankeyView {...baseProps()} mode="both" podLayout="flat" svmDisplay="column" />
        </div>
      </ThemeProvider>
    );
    expect(screen.getByTestId('sankey-svg')).toBeInTheDocument();
    expect(screen.queryByText('Storage flow')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sankey-status-legend')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sankey-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sankey-summary-toggle')).not.toBeInTheDocument();
  });

  it('shows the zoom control bar only while a chart is actually drawn', () => {
    const { unmount } = renderSankey();
    expect(screen.getByTestId('sankey-zoom-controls')).toBeInTheDocument();
    unmount();
    renderSankey({ elements: [] });
    expect(screen.queryByTestId('sankey-zoom-controls')).not.toBeInTheDocument();
    // mode selector stays operable during the empty state
    expect(screen.getByRole('radio', { name: /both/i })).not.toBeDisabled();
  });

  it('carries no viewBox, so the transform is the only thing scaling the diagram', () => {
    renderSankey();
    const svg = screen.getByTestId('sankey-svg');

    // The whole invariant in one attribute. `useZoomPan` is written in CSS pixels
    // end to end — fit centres against the ResizeObserver's measurement, the wheel
    // anchors on `clientX - rect.left`, a drag adds raw client deltas, and `percent`
    // reports `scale * 100` as a 1:1 level. A viewBox maps the layout onto the element
    // a second time, so `<g scale(s)>` would draw at s x that factor: fit squared its
    // own scale (13% drawn while the bar read 36%), pans moved short, and the wheel
    // drifted off the cursor. jsdom does no layout, so the second mapping is not
    // measurable here — its presence is, and that is what must never come back.
    expect(svg).not.toHaveAttribute('viewBox');

    // And the numbers the transform carries are container pixels: fit scales the
    // layout to sit inside the box, not past it, and the readout matches what is drawn.
    const host = screen.getByTestId('sankey-chart-host');
    fireEvent.keyDown(host, { key: '0' });
    const fitted = scaleOf(svg);
    expect(fitted).toBeGreaterThan(0);
    expect(layoutSize().w * fitted).toBeLessThanOrEqual(UNMEASURED.w + 0.5);
    expect(layoutSize().h * fitted).toBeLessThanOrEqual(UNMEASURED.h + 0.5);
    expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent(`${Math.round(fitted * 100)}%`);
  });

  it('opens fitted to the container it measured, never to a placeholder size', () => {
    // The opening viewport fits once and then locks, so the size it reads is the size the
    // diagram is stuck at. Seeded with a plausible placeholder it opened every estate at
    // that ratio and never revisited it — 38% in a window that had room for 76%.
    const measured = { w: 1600, h: 982 };
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly cb: ResizeObserverCallback) {}
        observe(): void {
          this.cb(
            [{ contentRect: { width: measured.w, height: measured.h } }] as unknown as ResizeObserverEntry[],
            this
          );
        }
        unobserve(): void {}
        disconnect(): void {}
      }
    );
    try {
      renderSankey();
      const { w, h } = layoutSize();
      const expected = Math.min(measured.w / w, measured.h / h);
      expect(scaleOf(screen.getByTestId('sankey-svg'))).toBeCloseTo(expected, 6);
      // Explicitly not the placeholder's answer, which is what the bug drew.
      expect(expected).not.toBeCloseTo(Math.min(UNMEASURED.w / w, UNMEASURED.h / h), 2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('opens once and holds that viewport when the container changes', () => {
    // Focus mode and a window resize both change the container. The opening fit must not
    // chase either: entering focus mode and leaving it again has to return the same zoom
    // readout it started with, which is what `demo.spec.ts` asserts end to end.
    let deliver: ((size: { w: number; h: number }) => void) | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly cb: ResizeObserverCallback) {}
        observe(): void {
          const emit = (size: { w: number; h: number }): void => {
            this.cb([{ contentRect: { width: size.w, height: size.h } }] as unknown as ResizeObserverEntry[], this);
          };
          // The mount delivery runs inside React's own effect flush, so it must NOT be
          // wrapped in a nested act(); later ones are driven from the test body and must.
          emit({ w: 1600, h: 982 });
          deliver = (size) => act(() => emit(size));
        }
        unobserve(): void {}
        disconnect(): void {}
      }
    );
    try {
      renderSankey();
      const svg = screen.getByTestId('sankey-svg');
      const opened = { scale: scaleOf(svg), ty: translateYOf(svg) };
      const { w, h } = layoutSize();
      expect(opened.scale).toBeCloseTo(Math.min(1600 / w, 982 / h), 6);

      deliver?.({ w: 1600, h: 1400 });
      expect(scaleOf(svg)).toBe(opened.scale);
      expect(translateYOf(svg)).toBe(opened.ty);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('resets to 1:1 on the "1" key and does not intercept it when a form control has focus', () => {
    renderSankey();
    const host = screen.getByTestId('sankey-chart-host');
    fireEvent.keyDown(host, { key: '1' });
    expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent('100%');

    // A previous zoom, then the same key fired at a control outside the chart: no bubbling
    // path into the chart's listener exists, so the readout must not move.
    fireEvent.wheel(host, { deltaY: -600, clientX: 100, clientY: 100 });
    const zoomedText = screen.getByTestId('sankey-zoom-controls').textContent;
    fireEvent.keyDown(screen.getByRole('radio', { name: /both/i }), { key: '1' });
    expect(screen.getByTestId('sankey-zoom-controls').textContent).toBe(zoomedText);
  });

  it('toggles focus mode on "f" and reports it upward; Esc is a no-op outside focus mode', () => {
    const onFocusModeChange = vi.fn();
    renderSankey({ onFocusModeChange });
    const host = screen.getByTestId('sankey-chart-host');

    fireEvent.keyDown(host, { key: 'Escape' });
    expect(onFocusModeChange).not.toHaveBeenCalled();

    fireEvent.keyDown(host, { key: 'f' });
    expect(onFocusModeChange).toHaveBeenCalledWith(true);
  });

  it('keeps the zoom control bar reachable while focusMode is true', () => {
    renderSankey({ focusMode: true });
    expect(screen.queryByRole('radio', { name: /both/i })).not.toBeInTheDocument();
    // The exit affordance stays reachable.
    expect(screen.getByTestId('sankey-zoom-controls')).toBeInTheDocument();
  });

  it('does not recompute node layout when the chart is only zoomed or panned', () => {
    renderSankey();
    const card = screen.getByTestId('sankey-node-aggr1');
    const rectBefore = card.querySelector('rect')?.getAttribute('x');
    fireEvent.wheel(screen.getByTestId('sankey-chart-host'), { deltaY: -400, clientX: 50, clientY: 50 });
    fireEvent.keyDown(screen.getByTestId('sankey-chart-host'), { key: '+' });
    const rectAfter = card.querySelector('rect')?.getAttribute('x');
    expect(rectAfter).toBe(rectBefore);
  });

  it('does not start a pan (or capture the pointer) below the drag threshold — a plain click must reach the node', () => {
    const { props } = renderSankey();
    const host = screen.getByTestId('sankey-chart-host');
    fireEvent.pointerDown(host, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(host, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByTestId('sankey-node-aggr1'));
    expect(props.onLocateNode).toHaveBeenCalled();
  });

  it('does not open a tooltip while actively dragging to pan (past the threshold)', () => {
    renderSankey();
    const host = screen.getByTestId('sankey-chart-host');
    fireEvent.pointerDown(host, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(host, { pointerId: 1, clientX: 40, clientY: 40 });
    fireEvent.mouseEnter(screen.getByTestId('sankey-node-aggr1'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.pointerUp(host, { pointerId: 1, clientX: 40, clientY: 40 });
    fireEvent.mouseEnter(screen.getByTestId('sankey-node-aggr1'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it("shows the pod's namespace on an attribute line", () => {
    renderSankey();
    const pod = screen.getByTestId('sankey-node-mongo-0');
    expect(
      within(pod)
        .getAllByTestId('sankey-card-line')
        .map((el) => el.textContent)
    ).toEqual(['ns/prod']);
  });

  describe('box card usage line: requires both fields, never a bare zero', () => {
    function node(id: string, kind: string, extra: Record<string, unknown> = {}): cytoscape.ElementDefinition {
      return { group: 'nodes', data: { id, label: id, kind, ...extra } };
    }
    function flow(source: string, target: string, tier: string): cytoscape.ElementDefinition {
      return {
        group: 'edges',
        data: {
          id: `${source}->${target}`,
          source,
          target,
          edgeType: 'storage-flow',
          labels: { tier },
          metrics: { readBytesPerSec: 1048576, writeBytesPerSec: 0 },
        },
      };
    }
    const usageFixture: cytoscape.ElementDefinition[] = [
      node('svm-shared', 'netapp-svm'),
      node('pvc-full', 'pvc', { usage: { usedBytes: 700_000_000_000, capacityBytes: 1_000_000_000_000 } }),
      node('pod-full', 'pod'),
      node('pvc-partial', 'pvc', { usage: { usedBytes: 500_000_000 } }),
      node('pod-partial', 'pod'),
      flow('svm-shared', 'pvc-full', 'svm-pvc'),
      flow('svm-shared', 'pvc-partial', 'svm-pvc'),
      flow('pvc-full', 'pod-full', 'pvc-pod'),
      flow('pvc-partial', 'pod-partial', 'pvc-pod'),
    ];

    it('shows used / capacity when both fields are present', () => {
      renderSankey({ elements: usageFixture });
      expect(screen.getByTestId('sankey-node-pvc-full').textContent).toContain('/');
    });

    it('omits the usage item entirely when only one field is present — never shows a bare 0', () => {
      renderSankey({ elements: usageFixture });
      const card = screen.getByTestId('sankey-node-pvc-partial');
      expect(card.textContent).not.toContain('/');
      expect(card.textContent).not.toContain('0 B');
    });
  });

  it('marks every card label pointer-events-none so it never intercepts the ribbon underneath', () => {
    renderSankey();
    const card = screen.getByTestId('sankey-node-aggr1');
    const texts = card.querySelectorAll('text');
    expect(texts.length).toBeGreaterThan(0);
    texts.forEach((t) => expect(t.getAttribute('class')).toContain('pointer-events-none'));
  });

  it('draws the read/write legend swatches from theme tokens, not a hardcoded color, in both themes', () => {
    const readByTheme: Record<'dark' | 'light', string | null> = { dark: null, light: null };
    for (const theme of ['dark', 'light'] as const) {
      const { unmount } = render(wrap(baseProps(), theme));
      readByTheme[theme] = screen.getAllByTestId('sankey-link-read')[0]?.getAttribute('stroke') ?? null;
      unmount();
    }
    expect(readByTheme.dark).not.toBeNull();
    expect(readByTheme.light).not.toBeNull();
    expect(readByTheme.dark).not.toBe(readByTheme.light);
  });

  it('draws a wrapper as a solid frame titled with its pod count', () => {
    renderSankey();
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    const frame = screen.getByTestId('sankey-wrapper-worker-0').querySelector('rect');
    expect(frame?.getAttribute('stroke-dasharray')).toBeNull();
    expect(screen.getByTestId('sankey-wrapper-title-worker-0')).toHaveTextContent('node · 2 pods');
  });

  it('Switching mode recomputes immediately', () => {
    renderSankey();
    expect(screen.getAllByTestId('sankey-link-read').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('radio', { name: /^write$/i }));
    expect(screen.queryAllByTestId('sankey-link-read')).toHaveLength(0);
    expect(screen.getAllByTestId('sankey-link-write').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('sankey-legend-read')).not.toBeInTheDocument();
    expect(screen.getByTestId('sankey-legend-write')).toBeInTheDocument();
  });

  it('defaults the layout control to Flat and remounts back to Flat', () => {
    const { unmount } = renderSankey();
    expect(screen.getByRole('radio', { name: /^flat$/i })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    expect(screen.getByRole('radio', { name: /^node$/i })).toBeChecked();
    expect(screen.getByTestId('sankey-wrapper-title-worker-0')).toHaveAttribute('data-locatable', 'true');
    unmount();
    renderSankey();
    expect(screen.getByRole('radio', { name: /^flat$/i })).toBeChecked();
    expect(screen.queryByTestId('sankey-wrapper-title-worker-0')).not.toBeInTheDocument();
  });

  it('preserves the zoom readout across a layout switch', () => {
    renderSankey();
    const host = screen.getByTestId('sankey-chart-host');
    fireEvent.keyDown(host, { key: '1' });
    expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent('100%');
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent('100%');
    expect(screen.getByRole('radio', { name: /both/i })).toBeChecked();
  });

  it('does not offer Locate on application or namespace cards', () => {
    const { props } = renderSankey();
    expect(screen.getByTestId('sankey-node-mongodb')).toHaveAttribute('data-locatable', 'false');
    expect(screen.getByTestId('sankey-node-prod')).toHaveAttribute('data-locatable', 'false');
    fireEvent.click(screen.getByTestId('sankey-node-mongodb'));
    fireEvent.click(screen.getByTestId('sankey-node-prod'));
    expect(props.onLocateNode).not.toHaveBeenCalled();
  });

  it('locates the Kubernetes node from a wrapper title and the pod from the card inside', () => {
    const { props } = renderSankey();
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    fireEvent.click(screen.getByTestId('sankey-wrapper-title-worker-0'));
    expect(props.onLocateNode).toHaveBeenCalledWith('node/worker-0');
    (props.onLocateNode as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.click(screen.getByTestId('sankey-node-mongo-0'));
    expect(props.onLocateNode).toHaveBeenCalledWith('pod/mongo-0');
  });

  it('keeps a derived card’s border neutral and omits status from its tooltip', () => {
    renderSankey();
    const app = screen.getByTestId('sankey-node-mongodb');
    expect(app).not.toHaveAttribute('data-status');
    fireEvent.mouseEnter(app);
    expect(screen.getByRole('tooltip')).not.toHaveTextContent('status');
    fireEvent.mouseLeave(app);
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    expect(screen.getByTestId('sankey-wrapper-worker-1')).toHaveAttribute('data-status', 'warning');
  });

  it('marks derived cards and links as derived from member pods', () => {
    renderSankey();
    fireEvent.mouseEnter(screen.getByTestId('sankey-node-mongodb'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('application');
    expect(screen.getByRole('tooltip')).toHaveTextContent('derived from member pods');
    expect(screen.getByRole('tooltip')).not.toHaveTextContent('status');
    fireEvent.mouseLeave(screen.getByTestId('sankey-node-mongodb'));
    const derivedLink = screen.getAllByTestId('sankey-link-read').find((el) => {
      fireEvent.mouseEnter(el);
      const text = screen.queryByRole('tooltip')?.textContent ?? '';
      fireEvent.mouseLeave(el);
      return text.includes('derived from member pods') && text.includes('application');
    });
    expect(derivedLink).toBeDefined();
  });

  it('hides the layout control in focus mode', () => {
    renderSankey({ focusMode: true });
    expect(screen.queryByRole('radio', { name: /^flat$/i })).not.toBeInTheDocument();
  });

  it('draws an empty no-flow wrapper for an undrawn Kubernetes node root under Node layout', () => {
    renderSankey({
      elements: [{ group: 'nodes', data: { id: 'node/worker-0', label: 'worker-0', kind: 'node' } }],
      roots: { ...EMPTY_STORAGE_GRAPH_ROOTS, node: ['worker-0'] },
    });
    expect(screen.queryByTestId('sankey-wrapper-title-worker-0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    const title = screen.getByTestId('sankey-wrapper-title-worker-0');
    expect(title).toHaveAttribute('data-locatable', 'true');
    expect(title.textContent).toContain('no flow');
  });

  it("hovering a wrapper highlights its pods' paths and does not recompute layout", () => {
    renderSankey();
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    const mongo0 = screen.getByTestId('sankey-node-mongo-0');
    const orphan0 = screen.getByTestId('sankey-node-orphan-0');
    const rectXBefore = mongo0.querySelector('rect')?.getAttribute('x');
    fireEvent.mouseEnter(screen.getByTestId('sankey-wrapper-title-worker-0'));
    // worker-0 wraps mongo-0 and orphan-0 — both members' paths light up.
    expect(mongo0.style.opacity).toBe('1');
    expect(orphan0.style.opacity).toBe('1');
    // mongo-1 sits on worker-1, not a member of this wrapper — faded.
    expect(screen.getByTestId('sankey-node-mongo-1').style.opacity).toBe('0.3');
    expect(mongo0.querySelector('rect')?.getAttribute('x')).toBe(rectXBefore);
  });

  it("describes a wrapper in the shared row order: count, the members' flow, then its status", () => {
    renderSankey();
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    fireEvent.mouseEnter(screen.getByTestId('sankey-wrapper-title-worker-0'));
    const text = screen.getByRole('tooltip').textContent ?? '';
    expect(text).toContain('node / worker-0');
    expect(text).toContain('2 pods');
    // Flow before status, as on every other card (see `nodeTooltipRows`).
    const flowAt = text.indexOf('(derived from member pods)');
    const statusAt = text.indexOf('status ');
    expect(flowAt).toBeGreaterThan(text.indexOf('2 pods'));
    expect(statusAt).toBeGreaterThan(flowAt);
    expect(text).toContain('(worst of node and member pods)');
  });

  it('reverts to normal display, with layout coordinates unchanged, after the mouse leaves', () => {
    renderSankey();
    const node = screen.getByTestId('sankey-node-aggr1');
    const rectBefore = {
      x: node.querySelector('rect')?.getAttribute('x'),
      y: node.querySelector('rect')?.getAttribute('y'),
    };
    fireEvent.mouseEnter(node);
    expect(screen.getByTestId('sankey-node-aggr2').style.opacity).toBe('0.3');
    fireEvent.mouseLeave(node);
    expect(screen.getByTestId('sankey-node-aggr2').style.opacity).toBe('1');
    expect(node.style.opacity).toBe('1');
    const rectAfter = {
      x: node.querySelector('rect')?.getAttribute('x'),
      y: node.querySelector('rect')?.getAttribute('y'),
    };
    expect(rectAfter).toEqual(rectBefore);
  });

  it('does not highlight a sibling aggregate under the same controller', () => {
    const { elements: sideBranch } = normalizeGraph({
      elements: {
        nodes: [
          { data: { id: 'n', name: 'ontap-node', type: 'netapp-node' } },
          { data: { id: 'aggrA', name: 'aggrA', type: 'netapp-aggr' } },
          { data: { id: 'aggrB', name: 'aggrB', type: 'netapp-aggr' } },
          { data: { id: 'svmA', name: 'svmA', type: 'netapp-svm' } },
          { data: { id: 'svmB', name: 'svmB', type: 'netapp-svm' } },
          { data: { id: 'pvcA', name: 'pvcA', type: 'pvc' } },
          { data: { id: 'pvcB', name: 'pvcB', type: 'pvc' } },
          { data: { id: 'podA', name: 'podA', type: 'pod' } },
          { data: { id: 'podB', name: 'podB', type: 'pod' } },
        ],
        edges: [
          {
            data: {
              id: 'e1',
              type: 'storage-flow',
              source: 'n',
              target: 'aggrA',
              labels: { tier: 'node-aggr' },
              metrics: { read_bytes_per_sec: 100 },
            },
          },
          {
            data: {
              id: 'e2',
              type: 'storage-flow',
              source: 'n',
              target: 'aggrB',
              labels: { tier: 'node-aggr' },
              metrics: { read_bytes_per_sec: 100 },
            },
          },
          {
            data: {
              id: 'e3',
              type: 'storage-flow',
              source: 'aggrA',
              target: 'svmA',
              labels: { tier: 'aggr-svm' },
              metrics: { read_bytes_per_sec: 100 },
            },
          },
          {
            data: {
              id: 'e4',
              type: 'storage-flow',
              source: 'aggrB',
              target: 'svmB',
              labels: { tier: 'aggr-svm' },
              metrics: { read_bytes_per_sec: 100 },
            },
          },
          {
            data: {
              id: 'e5',
              type: 'storage-flow',
              source: 'svmA',
              target: 'pvcA',
              labels: { tier: 'svm-pvc' },
              metrics: { read_bytes_per_sec: 100 },
            },
          },
          {
            data: {
              id: 'e6',
              type: 'storage-flow',
              source: 'svmB',
              target: 'pvcB',
              labels: { tier: 'svm-pvc' },
              metrics: { read_bytes_per_sec: 100 },
            },
          },
          {
            data: {
              id: 'e7',
              type: 'storage-flow',
              source: 'pvcA',
              target: 'podA',
              labels: { tier: 'pvc-pod' },
              metrics: { read_bytes_per_sec: 100 },
            },
          },
          {
            data: {
              id: 'e8',
              type: 'storage-flow',
              source: 'pvcB',
              target: 'podB',
              labels: { tier: 'pvc-pod' },
              metrics: { read_bytes_per_sec: 100 },
            },
          },
        ],
      },
    });
    renderSankey({ elements: sideBranch });
    fireEvent.mouseEnter(screen.getByTestId('sankey-node-aggrA'));
    expect(screen.getByTestId('sankey-node-aggrA').style.opacity).toBe('1');
    expect(screen.getByTestId('sankey-node-svmA').style.opacity).toBe('1');
    expect(screen.getByTestId('sankey-node-aggrB').style.opacity).toBe('0.3');
    expect(screen.getByTestId('sankey-node-svmB').style.opacity).toBe('0.3');
  });

  describe('SVM display', () => {
    it('defaults to Column and remounts back to Column', () => {
      const { unmount } = renderSankey();
      expect(screen.getByRole('radio', { name: /^column$/i })).toBeChecked();
      fireEvent.click(screen.getByRole('radio', { name: /^group$/i }));
      expect(screen.getByRole('radio', { name: /^group$/i })).toBeChecked();
      expect(screen.getByTestId('sankey-wrapper-title-svm_shop')).toBeInTheDocument();
      unmount();
      renderSankey();
      expect(screen.getByRole('radio', { name: /^column$/i })).toBeChecked();
      expect(screen.queryByTestId('sankey-wrapper-title-svm_shop')).not.toBeInTheDocument();
    });

    it('draws frames in the PVC column, and no SVM cards, under Group', () => {
      renderSankey();
      expect(screen.getByTestId('sankey-node-svm_shop')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('radio', { name: /^group$/i }));
      expect(screen.queryByTestId('sankey-node-svm_shop')).not.toBeInTheDocument();
      const frame = screen.getByTestId('sankey-wrapper-title-svm_shop');
      expect(frame).toHaveAttribute('data-locatable', 'false');
      expect(screen.getByTestId('sankey-node-data-mongo-0')).toBeInTheDocument();
      expect(screen.getAllByTestId('sankey-column-header').map((el) => el.textContent)).toEqual(
        expect.arrayContaining(['SVM / PVC'])
      );
      expect(screen.queryByText('SVM', { selector: '[data-testid="sankey-column-header"]' })).not.toBeInTheDocument();
    });

    it('is unavailable when the body reports no claim aggregates, and draws as Column', () => {
      renderSankey({ elements: withoutClaimAggregates() });
      const group = screen.getByRole('radio', { name: /^group$/i });
      expect(group).toBeDisabled();
      expect(screen.getByTestId('sankey-svm-display-reason')).toHaveTextContent('no claim aggregates');
      fireEvent.click(group);
      expect(screen.getByRole('radio', { name: /^column$/i })).toBeChecked();
      expect(screen.getByTestId('sankey-node-svm_shop')).toBeInTheDocument();
      expect(screen.queryByTestId('sankey-wrapper-title-svm_shop')).not.toBeInTheDocument();
    });

    it('switching writes nothing to the URL and issues no request', () => {
      const onModeChange = vi.fn();
      const onPodLayoutChange = vi.fn();
      const onFocusModeChange = vi.fn();
      const onSvmDisplayChange = vi.fn();
      const before = window.location.href;
      renderSankey({ onModeChange, onPodLayoutChange, onFocusModeChange, onSvmDisplayChange });
      fireEvent.click(screen.getByRole('radio', { name: /^group$/i }));
      expect(onSvmDisplayChange).toHaveBeenCalledWith('group');
      expect(onModeChange).not.toHaveBeenCalled();
      expect(onPodLayoutChange).not.toHaveBeenCalled();
      expect(onFocusModeChange).not.toHaveBeenCalled();
      expect(window.location.href).toBe(before);
    });

    it('preserves the viewport and hover highlight across a switch', () => {
      renderSankey();
      const host = screen.getByTestId('sankey-chart-host');
      fireEvent.keyDown(host, { key: '1' });
      expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent('100%');
      fireEvent.mouseEnter(screen.getByTestId('sankey-node-data-mongo-0'));
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('radio', { name: /^group$/i }));
      expect(screen.getByTestId('sankey-zoom-controls')).toHaveTextContent('100%');
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    it('names a PVC’s SVM and claim aggregate in its tooltip', () => {
      renderSankey();
      fireEvent.mouseEnter(screen.getByTestId('sankey-node-data-mongo-1'));
      const tip = screen.getByRole('tooltip');
      expect(tip).toHaveTextContent('SVM svm_shop');
      expect(tip).toHaveTextContent('aggregate aggr2');
      fireEvent.mouseLeave(screen.getByTestId('sankey-node-data-mongo-1'));
      fireEvent.mouseEnter(screen.getByTestId('sankey-node-data-scratch'));
      const scratchTip = screen.getByRole('tooltip');
      expect(scratchTip).toHaveTextContent('SVM svm_shop');
      expect(scratchTip).not.toHaveTextContent('aggregate');
    });

    it('shows a frame’s title-row tooltip: kind, ONTAP cluster, PVC count, derived inflow', () => {
      renderSankey();
      fireEvent.click(screen.getByRole('radio', { name: /^group$/i }));
      fireEvent.mouseEnter(screen.getByTestId('sankey-wrapper-title-svm_shop'));
      const tip = screen.getByRole('tooltip');
      expect(tip).toHaveTextContent('netapp-svm');
      expect(tip).toHaveTextContent('svm_shop');
      expect(tip).toHaveTextContent('ontap-prod');
      expect(tip).toHaveTextContent('3 PVCs');
      expect(tip).toHaveTextContent('derived from member PVCs');
      expect(tip).not.toHaveTextContent('status');
    });

    it('names the SVM on a Group ribbon’s tooltip', () => {
      renderSankey();
      fireEvent.click(screen.getByRole('radio', { name: /^group$/i }));
      const ribbon = screen.getAllByTestId('sankey-link-read').find((el) => {
        fireEvent.mouseEnter(el);
        const text = screen.queryByRole('tooltip')?.textContent ?? '';
        fireEvent.mouseLeave(el);
        return text.includes('aggr1 → data-mongo-0');
      });
      expect(ribbon).toBeDefined();
      fireEvent.mouseEnter(ribbon!);
      expect(screen.getByRole('tooltip')).toHaveTextContent('SVM svm_shop');
    });

    it('is transient and independent of the Layout switch', () => {
      const { unmount } = renderSankey();
      fireEvent.click(screen.getByRole('radio', { name: /^group$/i }));
      fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
      // Before "refresh": PVCs framed by SVM AND pods wrapped by Kubernetes node, at once.
      expect(screen.getByTestId('sankey-wrapper-title-svm_shop')).toBeInTheDocument();
      expect(screen.getByTestId('sankey-wrapper-title-worker-0')).toBeInTheDocument();
      unmount();
      // After "refresh" (a fresh mount): both controls read their defaults again.
      renderSankey();
      expect(screen.getByRole('radio', { name: /^column$/i })).toBeChecked();
      expect(screen.getByRole('radio', { name: /^flat$/i })).toBeChecked();
      expect(screen.queryByTestId('sankey-wrapper-title-svm_shop')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sankey-wrapper-title-worker-0')).not.toBeInTheDocument();
    });
  });
});

describe('SankeyView card search', () => {
  const type = (query: string): void => {
    fireEvent.change(screen.getByTestId('sankey-search-input'), { target: { value: query } });
  };
  const opacityOf = (testId: string): string => screen.getByTestId(testId).style.opacity;

  it('lights every hit card’s whole path, like hovering it, and fades the rest', () => {
    renderSankey();
    type('aggr1');
    expect(opacityOf('sankey-node-aggr1')).toBe('1');
    // aggr1's claim runs down to data-mongo-0 → mongo-0 → mongodb → prod.
    expect(opacityOf('sankey-node-ontap-prod-01')).toBe('1');
    expect(opacityOf('sankey-node-data-mongo-0')).toBe('1');
    expect(opacityOf('sankey-node-mongo-0')).toBe('1');
    expect(opacityOf('sankey-node-aggr2')).toBe('0.3');
    expect(opacityOf('sankey-node-mongo-1')).toBe('0.3');
    expect(screen.getAllByTestId(/^sankey-link-/).some((el) => el.getAttribute('fill-opacity') === '0.14')).toBe(true);

    // Every hit contributes its path: both aggregates light both claims.
    type('aggr');
    expect(opacityOf('sankey-node-aggr2')).toBe('1');
    expect(opacityOf('sankey-node-mongo-1')).toBe('1');

    type('');
    expect(opacityOf('sankey-node-aggr2')).toBe('1');
    expect(screen.getAllByTestId(/^sankey-link-/).every((el) => el.getAttribute('fill-opacity') !== '0.14')).toBe(true);
  });

  it('fades everything for a query with no hits', () => {
    renderSankey();
    type('no-such-card');
    expect(screen.getByTestId('search-no-results')).toBeInTheDocument();
    expect(opacityOf('sankey-node-aggr1')).toBe('0.3');
    expect(opacityOf('sankey-node-mongo-0')).toBe('0.3');
  });

  it('matches wrappers under the Node layout and lights their member pods', () => {
    renderSankey();
    fireEvent.click(screen.getByRole('radio', { name: /^node$/i }));
    type('worker-0');
    expect(opacityOf('sankey-node-mongo-0')).toBe('1');
    expect(opacityOf('sankey-node-orphan-0')).toBe('1');
    expect(opacityOf('sankey-node-mongo-1')).toBe('0.3');
  });

  it('lets a hover take over while searching and hands back on leave', () => {
    renderSankey();
    type('aggr1');
    const aggr2 = screen.getByTestId('sankey-node-aggr2');
    fireEvent.mouseEnter(aggr2);
    expect(opacityOf('sankey-node-aggr2')).toBe('1');
    expect(opacityOf('sankey-node-aggr1')).toBe('0.3');
    fireEvent.mouseLeave(aggr2);
    expect(opacityOf('sankey-node-aggr1')).toBe('1');
    expect(opacityOf('sankey-node-aggr2')).toBe('0.3');
  });

  it('frames a located result in the chart, ends the search and never leaves for Graph view', () => {
    const { props } = renderSankey();
    const svg = screen.getByTestId('sankey-svg');
    type('ontap-prod-02');
    fireEvent.click(screen.getByTestId('search-result-netapp/ontap-prod/ontap-prod-02'));
    // A single card is framed at its own size, never enlarged.
    expect(scaleOf(svg)).toBe(1);
    expect(screen.getByTestId('sankey-search-input')).toHaveValue('');
    expect(opacityOf('sankey-node-aggr1')).toBe('1');
    expect(props.onLocateNode).not.toHaveBeenCalled();
  });

  it('fits the chart to every hit once typing pauses', () => {
    vi.useFakeTimers();
    try {
      renderSankey();
      const svg = screen.getByTestId('sankey-svg');
      fireEvent.keyDown(screen.getByTestId('sankey-chart-host'), { key: '0' });
      const fitted = svg.querySelector('g')?.getAttribute('transform');
      type('mongo');
      expect(svg.querySelector('g')?.getAttribute('transform')).toBe(fitted);
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(svg.querySelector('g')?.getAttribute('transform')).not.toBe(fitted);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps chart shortcuts, wheel zoom and drag pan out of the search box', () => {
    const onFocusModeChange = vi.fn();
    renderSankey({ onFocusModeChange });
    const input = screen.getByTestId('sankey-search-input');
    const readout = (): string | null => screen.getByTestId('sankey-zoom-controls').textContent;
    const before = readout();
    fireEvent.keyDown(input, { key: 'f' });
    fireEvent.keyDown(input, { key: '+' });
    fireEvent.wheel(screen.getByTestId('sankey-search-bar'), { deltaY: -600, clientX: 700, clientY: 20 });
    expect(onFocusModeChange).not.toHaveBeenCalled();
    expect(readout()).toBe(before);

    const svg = screen.getByTestId('sankey-svg');
    const transform = svg.querySelector('g')?.getAttribute('transform');
    fireEvent.pointerDown(input, { pointerId: 1, clientX: 700, clientY: 20 });
    fireEvent.pointerMove(input, { pointerId: 1, clientX: 600, clientY: 120 });
    expect(svg.querySelector('g')?.getAttribute('transform')).toBe(transform);
  });

  it('keeps the query across a refresh and drops hits the new body has no card for', () => {
    const { rerender } = renderSankeyWithProps(baseProps());
    type('aggr');
    rerender(wrap(baseProps({ elements: withoutAggr1() })));
    expect(screen.getByTestId('sankey-search-input')).toHaveValue('aggr');
    expect(opacityOf('sankey-node-aggr2')).toBe('1');
    expect(opacityOf('sankey-node-mongo-1')).toBe('1');
  });
});
