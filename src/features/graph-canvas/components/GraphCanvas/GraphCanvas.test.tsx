import { fireEvent, render, screen } from '@testing-library/react';
import cytoscape from 'cytoscape';
import React from 'react';

// A REAL headless cytoscape instance stands in for the one useCytoscape would
// build, so the tap/dbltap effects bind against genuine event plumbing. The refs
// are dereferenced lazily (inside the arrow bodies), keeping hoisting order safe.
const mockCyRef: { current: cytoscape.Core | null } = { current: null };
const mockContainerRef = React.createRef<HTMLDivElement>();

// Stand-in expand-collapse api. The real useExpandCollapse would only populate
// apiRef when collapse is wired + the extension is registered (not in jsdom); the
// mock just injects this fake so the dbltap → api toggle path is exercisable.
const mockExpandApi = {
  isExpandable: jest.fn(() => false),
  isCollapsible: jest.fn(() => false),
  expand: jest.fn(),
  collapse: jest.fn(),
};

vi.mock('../../hooks/useCytoscape', () => ({
  useCytoscape: (): unknown => ({ containerRef: mockContainerRef, cyRef: mockCyRef, isReady: true }),
}));
// fcose/dagre are not registered in the jest env — layout is not under test here.
vi.mock('../../hooks/useGraphLayout', () => ({ useGraphLayout: (): void => undefined }));
// Inject the fake expand-collapse api into GraphCanvas's apiRef (headless jsdom has
// no real extension); lets the dbltap handler reach a working api under test.
vi.mock('../../hooks/useExpandCollapse', () => ({
  useExpandCollapse: (props: { apiRef: { current: unknown } }): void => {
    props.apiRef.current = mockExpandApi;
  },
}));

import { FADED_CLASS } from '../../styles/getStylesheet';

import { GraphCanvas } from './GraphCanvas';

const elements: cytoscape.ElementDefinition[] = [
  { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0' } },
  // Cluster backplate: decorative + NON-selectable (mirrors normalize) — tap deselects,
  // collapse is dbltap-driven.
  { group: 'nodes', selectable: false, data: { id: 'cl', isCluster: true, label: 'demo' } },
  // Namespace group: decorative but SELECTABLE (mirrors normalize) — its selection
  // surfaces the +/- cue; only cluster carries selectable:false.
  { group: 'nodes', data: { id: 'ns', isNamespace: true, label: 'shop' } },
  // Controller group: detail-eligible, so it stays SELECTABLE (no selectable:false) — its
  // clicks must reach the detail panel (mirrors normalize).
  { group: 'nodes', data: { id: 'ctrl', isController: true, kind: 'statefulset', label: 'mongo' } },
];

function renderCanvas(handlers: { onSelect?: (id: string | null) => void }): ReturnType<typeof render> {
  return render(
    <GraphCanvas
      elements={elements}
      stylesheet={[]}
      layout="fcose"
      visibility={{ visibleNodeIds: new Set(['p1', 'cl', 'ns', 'ctrl']), visibleEdgeIds: new Set() }}
      selectedId={null}
      {...handlers}
    />
  );
}

describe('GraphCanvas selection wiring (left-click only; right-click detail removed)', () => {
  beforeEach(() => {
    mockCyRef.current = cytoscape({ headless: true, elements });
    mockExpandApi.isExpandable.mockReturnValue(false);
    mockExpandApi.isCollapsible.mockReturnValue(false);
    mockExpandApi.expand.mockClear();
    mockExpandApi.collapse.mockClear();
  });

  afterEach(() => {
    mockCyRef.current?.destroy();
    mockCyRef.current = null;
  });

  it('a right-click (cxttap) on a node does NOT trigger selection (detail flow removed)', () => {
    const onSelect = jest.fn();
    renderCanvas({ onSelect });
    mockCyRef.current!.getElementById('p1').emit('cxttap');
    mockCyRef.current!.getElementById('ctrl').emit('cxttap');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('left-tap still selects a selectable node, including a controller group', () => {
    const onSelect = jest.fn();
    renderCanvas({ onSelect });
    mockCyRef.current!.getElementById('p1').emit('tap');
    expect(onSelect).toHaveBeenCalledWith('p1');
    mockCyRef.current!.getElementById('ctrl').emit('tap');
    expect(onSelect).toHaveBeenCalledWith('ctrl');
  });

  it('a left-tap on the non-selectable cluster deselects (background-tap behaviour, no detail)', () => {
    const onSelect = jest.fn();
    renderCanvas({ onSelect });
    mockCyRef.current!.getElementById('cl').emit('tap');
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('double-tapping a cluster toggles its collapse via the expand-collapse api', () => {
    mockExpandApi.isExpandable.mockReturnValue(true);
    renderCanvas({ onSelect: jest.fn() });
    mockCyRef.current!.getElementById('cl').emit('dbltap');
    expect(mockExpandApi.expand).toHaveBeenCalled();
    expect(mockExpandApi.collapse).not.toHaveBeenCalled();
  });

  it('double-tapping a non-cluster node never touches the expand-collapse api', () => {
    mockExpandApi.isExpandable.mockReturnValue(true);
    renderCanvas({ onSelect: jest.fn() });
    mockCyRef.current!.getElementById('p1').emit('dbltap');
    expect(mockExpandApi.expand).not.toHaveBeenCalled();
    expect(mockExpandApi.collapse).not.toHaveBeenCalled();
  });

  it('leaves the native context menu alone (right-click is no longer intercepted)', () => {
    renderCanvas({ onSelect: jest.fn() });
    // fireEvent returns true when preventDefault was NOT called on the event.
    expect(fireEvent.contextMenu(screen.getByTestId('graph-canvas'))).toBe(true);
  });

  it('forwards the pinned tooltip to HoverTooltip (top-right card shows with no hovered element)', () => {
    render(
      <GraphCanvas
        elements={elements}
        stylesheet={[]}
        layout="fcose"
        visibility={{ visibleNodeIds: new Set(['p1', 'cl', 'ns', 'ctrl']), visibleEdgeIds: new Set() }}
        selectedId="ctrl"
        pinned={{ label: 'mongo', attributes: [{ key: 'kind', value: 'statefulset' }] }}
      />
    );
    const tip = screen.getByTestId('hover-tooltip');
    expect(tip).toHaveAttribute('data-pinned', 'true');
    expect(screen.getByText('mongo')).toBeInTheDocument();
  });

  const fadedIds = (): string[] =>
    mockCyRef
      .current!.elements(`.${FADED_CLASS}`)
      .map((e) => e.id())
      .sort();

  it('searchActive hands the fade over to the hit set: a zero-hit query fades even the selection', () => {
    render(
      <GraphCanvas
        elements={elements}
        stylesheet={[]}
        layout="fcose"
        visibility={{ visibleNodeIds: new Set(['p1', 'cl', 'ns', 'ctrl']), visibleEdgeIds: new Set() }}
        selectedId="ctrl"
        searchActive
      />
    );
    // Without a query the selection would keep its own focus lit. While searching the hits
    // own the lit set, and there are none — "no results" must read as no results.
    expect(fadedIds()).toEqual(['cl', 'ctrl', 'ns', 'p1']);
  });

  it('wires searchLitNodeIds into the fade: non-hit elements carry FADED_CLASS while searchActive', () => {
    render(
      <GraphCanvas
        elements={elements}
        stylesheet={[]}
        layout="fcose"
        visibility={{ visibleNodeIds: new Set(['p1', 'cl', 'ns', 'ctrl']), visibleEdgeIds: new Set() }}
        selectedId={null}
        searchActive
        searchLitNodeIds={new Set(['p1'])}
      />
    );
    expect(fadedIds()).toEqual(['cl', 'ctrl', 'ns']);
  });

  it('a selection carried in from before the query does NOT survive as a lit island', () => {
    render(
      <GraphCanvas
        elements={elements}
        stylesheet={[]}
        layout="fcose"
        visibility={{ visibleNodeIds: new Set(['p1', 'cl', 'ns', 'ctrl']), visibleEdgeIds: new Set() }}
        selectedId="ctrl"
        searchActive
        searchLitNodeIds={new Set(['p1'])}
      />
    );
    // ctrl is still selected (the detail panel's × does not deselect) but it is not a hit,
    // so it fades with everything else outside p1.
    expect(fadedIds()).toEqual(['cl', 'ctrl', 'ns']);
  });
});
