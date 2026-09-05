import { fireEvent, render, screen, within } from '@testing-library/react';
import type cytoscape from 'cytoscape';
import { describe, expect, it, vi } from 'vitest';

import { SHOWCASE_STORAGE_GRAPH } from '../../shared/fixtures/showcaseStorageGraph';
import { normalizeGraph } from '../graph-data';
import { ThemeProvider } from '../theme';

import { SankeyView, type SankeyViewProps } from './SankeyView';

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

type Overrides = Partial<SankeyViewProps>;

function baseProps(overrides: Overrides = {}): SankeyViewProps {
  return {
    elements,
    status: 'ready',
    error: undefined,
    hasPayload: true,
    demoMode: true,
    visible: true,
    focusMode: false,
    onFocusModeChange: vi.fn(),
    endpointConfigured: true,
    azEnvReady: true,
    onLocateNode: vi.fn(),
    ...overrides,
  };
}

function renderSankey(overrides: Overrides = {}): { props: SankeyViewProps; unmount: () => void } {
  const props = baseProps(overrides);
  const { unmount } = render(
    <ThemeProvider>
      <div style={{ width: 800, height: 480 }}>
        <SankeyView {...props} />
      </div>
    </ThemeProvider>
  );
  return { props, unmount };
}

function renderSankeyWithProps(props: SankeyViewProps): ReturnType<typeof render> {
  return render(
    <ThemeProvider>
      <div style={{ width: 800, height: 480 }}>
        <SankeyView {...props} />
      </div>
    </ThemeProvider>
  );
}

describe('SankeyView', () => {
  it('defaults to Both and draws distinct read and write links', () => {
    renderSankey();
    expect(screen.getByRole('radio', { name: /both/i })).toBeChecked();
    expect(screen.getAllByTestId('sankey-link-read').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('sankey-link-write').length).toBeGreaterThan(0);
  });

  it('shows an unconfigured empty state without drawing', () => {
    renderSankey({ demoMode: false, endpointConfigured: false, azEnvReady: false, hasPayload: false, status: 'idle' });
    expect(screen.getByTestId('sankey-empty-unconfigured')).toHaveTextContent('not configured');
    expect(screen.queryByTestId('sankey-svg')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /both/i })).toBeEnabled();
  });

  it('shows a distinct az/env prompt that is not the empty-response copy', () => {
    renderSankey({ azEnvReady: false, hasPayload: false, status: 'idle' });
    expect(screen.getByTestId('sankey-empty-scope')).toHaveTextContent('No request has been sent');
    expect(screen.queryByTestId('sankey-empty-response')).not.toBeInTheDocument();
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
    expect(tip).toHaveTextContent('ontap_cluster: ontap-prod');
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

    rerender(
      <ThemeProvider>
        <div style={{ width: 800, height: 480 }}>
          <SankeyView {...baseProps({ elements: withoutAggr1() })} />
        </div>
      </ThemeProvider>
    );

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

    rerender(
      <ThemeProvider>
        <div style={{ width: 800, height: 480 }}>
          <SankeyView {...baseProps({ elements: withoutAggr1() })} />
        </div>
      </ThemeProvider>
    );

    expect(screen.getByTestId('sankey-node-aggr2')).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('renders nodes as box cards with a title and a subtitle line, not a bare thin rect', () => {
    renderSankey();
    const card = screen.getByTestId('sankey-node-aggr1');
    expect(within(card).getByText('aggr1')).toBeInTheDocument();
    // Subtitle carries the kind (and usage, when both used/capacity are present).
    expect(card.textContent).toContain('netapp-aggr');
  });

  it('lists a column header for every tier that has drawn nodes', () => {
    renderSankey();
    const headers = screen.getAllByTestId('sankey-column-header').map((el) => el.textContent);
    expect(headers).toEqual(expect.arrayContaining(['Pod', 'PVC', 'NetApp aggregate', 'NetApp node']));
  });

  it('gives same-namespace pods a stripe, one per namespaced pod', () => {
    renderSankey();
    const podCards = screen.getAllByTestId(/^sankey-node-/).filter((el) => el.getAttribute('data-kind') === 'pod');
    const stripes = screen.getAllByTestId('sankey-ns-stripe');
    expect(stripes.length).toBeGreaterThan(0);
    expect(stripes.length).toBeLessThanOrEqual(podCards.length);
  });

  it('shows the node flow summary table and hides it once the graph is empty', () => {
    const { unmount } = renderSankey();
    expect(screen.getByTestId('sankey-summary')).toBeInTheDocument();
    unmount();
    renderSankey({ elements: [] });
    expect(screen.queryByTestId('sankey-summary')).not.toBeInTheDocument();
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

  it('hides the toolbar and summary tables while focusMode is true', () => {
    renderSankey({ focusMode: true });
    expect(screen.queryByRole('radio', { name: /both/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('sankey-summary')).not.toBeInTheDocument();
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

  it("shows the pod's namespace on its subtitle line", () => {
    renderSankey();
    const pod = screen.getByTestId('sankey-node-mongo-0');
    expect(pod.textContent).toContain('ns/prod');
  });

  describe('box card subtitle: usage requires both fields, never a bare zero', () => {
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
      const { unmount } = render(
        <ThemeProvider configTheme={theme}>
          <div style={{ width: 800, height: 480 }}>
            <SankeyView {...baseProps()} />
          </div>
        </ThemeProvider>
      );
      readByTheme[theme] = screen.getAllByTestId('sankey-link-read')[0]?.getAttribute('stroke') ?? null;
      unmount();
    }
    expect(readByTheme.dark).not.toBeNull();
    expect(readByTheme.light).not.toBeNull();
    expect(readByTheme.dark).not.toBe(readByTheme.light);
  });
});
