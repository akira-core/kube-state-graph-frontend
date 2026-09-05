import { render, act, renderHook } from '@testing-library/react';
import cytoscape from 'cytoscape';
import React, { type MutableRefObject } from 'react';

import type { PodParentMode } from '../../../shared/constants/types';
import { diffElements } from '../sync/diffElements';

import { useCytoscape, type CyStylesheet } from './useCytoscape';

interface HarnessProps {
  elements: cytoscape.ElementDefinition[];
  stylesheet: CyStylesheet[];
  onReady?: (cy: cytoscape.Core) => void;
}

function Harness(props: Readonly<HarnessProps>): React.JSX.Element {
  const { elements, stylesheet, onReady } = props;
  const { containerRef, cyRef } = useCytoscape({ elements, stylesheet });
  React.useEffect(() => {
    if (cyRef.current !== null && onReady !== undefined) {
      onReady(cyRef.current);
    }
  }, [cyRef, onReady]);
  return <div ref={containerRef} style={{ width: 200, height: 200 }} data-testid="container" />;
}

const baseStylesheet: CyStylesheet[] = [{ selector: 'node', style: { 'background-color': '#000' } }];

describe('useCytoscape', () => {
  it('creates a cytoscape instance on mount and destroys it on unmount', () => {
    let capturedCy: cytoscape.Core | null = null;
    const { unmount } = render(
      <Harness
        elements={[{ group: 'nodes', data: { id: 'a' } }]}
        stylesheet={baseStylesheet}
        onReady={(cy): void => {
          capturedCy = cy;
        }}
      />
    );

    expect(capturedCy).not.toBeNull();
    const cy = capturedCy!;
    // Spies installed post-mount only verify the unmount path; a future
    // regression where useCytoscape calls destroy during mount would not be
    // caught here. Acceptable trade-off vs mocking the cytoscape factory.
    const destroySpy = jest.spyOn(cy, 'destroy');
    const removeAllSpy = jest.spyOn(cy, 'removeAllListeners');

    unmount();

    expect(removeAllSpy).toHaveBeenCalled();
    expect(destroySpy).toHaveBeenCalled();
  });

  it('init does not auto-run a layout extension (proves preset init layout)', () => {
    // If init used { name: 'fcose' }, cytoscape would throw "No such layout `fcose` found"
    // here because the extension is never registered in the jest environment.
    // A clean mount with no extension-missing error is the assertion.
    expect(() => {
      render(<Harness elements={[{ group: 'nodes', data: { id: 'a' } }]} stylesheet={baseStylesheet} />);
    }).not.toThrow();
  });

  it('applies element diffs without rebuilding the instance', () => {
    let capturedCy: cytoscape.Core | null = null;
    const onReady = (cy: cytoscape.Core): void => {
      capturedCy = cy;
    };
    const { rerender } = render(
      <Harness elements={[{ group: 'nodes', data: { id: 'a' } }]} stylesheet={baseStylesheet} onReady={onReady} />
    );

    const cyBefore: cytoscape.Core | null = capturedCy;
    expect(cyBefore!.nodes().length).toBe(1);

    act(() => {
      rerender(
        <Harness
          elements={[
            { group: 'nodes', data: { id: 'a' } },
            { group: 'nodes', data: { id: 'b' } },
          ]}
          stylesheet={baseStylesheet}
          onReady={onReady}
        />
      );
    });

    expect(capturedCy).toBe(cyBefore); // same instance, not rebuilt
    expect(capturedCy!.nodes().length).toBe(2);
  });

  it('swaps stylesheet without rebuilding the instance', () => {
    let capturedCy: cytoscape.Core | null = null;
    const onReady = (cy: cytoscape.Core): void => {
      capturedCy = cy;
    };
    const { rerender } = render(<Harness elements={[]} stylesheet={baseStylesheet} onReady={onReady} />);

    const cyBefore = capturedCy!;
    const styleSpy = jest.spyOn(cyBefore, 'style');

    const nextStylesheet: CyStylesheet[] = [{ selector: 'node', style: { 'background-color': '#fff' } }];
    act(() => {
      rerender(<Harness elements={[]} stylesheet={nextStylesheet} onReady={onReady} />);
    });

    expect(capturedCy).toBe(cyBefore);
    expect(styleSpy).toHaveBeenCalledWith(nextStylesheet);
  });

  it('flips isReady to true once the instance exists (so dependents can re-bind)', () => {
    function ReadyHarness(): React.JSX.Element {
      const { containerRef, isReady } = useCytoscape({ elements: [], stylesheet: baseStylesheet });
      return <div ref={containerRef} data-testid="ready" data-ready={String(isReady)} />;
    }
    const { getByTestId } = render(<ReadyHarness />);
    expect(getByTestId('ready').getAttribute('data-ready')).toBe('true');
  });
});

const baseElements: cytoscape.ElementDefinition[] = [
  { group: 'nodes', data: { id: 'cl', isCluster: true } },
  { group: 'nodes', data: { id: 'p1', parent: 'cl', kind: 'pod' } },
];

describe('useCytoscape compound re-parenting', () => {
  const withParent = (parent: string): cytoscape.ElementDefinition[] => [
    { group: 'nodes', data: { id: 'A', isCluster: true } },
    { group: 'nodes', data: { id: 'B', isCluster: true } },
    { group: 'nodes', data: { id: 'p1', parent, kind: 'pod' } },
  ];

  it('moves a node to its new compound parent when data.parent changes, and back again', () => {
    // cytoscape only re-nests via node.move({parent}); a bare data('parent') update
    // does not relocate the node. This mirrors the pod-parent mode toggle: switching
    // to 'controller' and back must move the pod between containers in both directions.
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: withParent('A') });
    const { result, rerender } = renderHook(
      (props: { elements: cytoscape.ElementDefinition[] }) =>
        useCytoscape({ elements: props.elements, stylesheet: [] }),
      { initialProps: { elements: withParent('A') } }
    );
    result.current.cyRef.current = cy;
    expect(cy.getElementById('p1').parent().first().id()).toBe('A');

    rerender({ elements: withParent('B') });
    expect(cy.getElementById('p1').parent().first().id()).toBe('B');

    rerender({ elements: withParent('A') });
    expect(cy.getElementById('p1').parent().first().id()).toBe('A');

    cy.destroy();
  });
});

describe('useCytoscape stale data-key removal', () => {
  // data(obj) is extend-only: a key the incoming definition omits (a controller whose
  // last alerting pod recovered no longer carries `alerts`) must be REMOVED from the
  // live element, or it lingers forever and re-flags the element as changed on every
  // diff cycle (perpetual no-op churn).
  const withAlerts: cytoscape.ElementDefinition[] = [
    {
      group: 'nodes',
      data: {
        id: 'c1',
        kind: 'deployment',
        isController: true,
        worstStatus: 'warning',
        alerts: [{ name: 'HighMem', severity: 'warning', timeRecords: [1717500000] }],
      },
    },
  ];
  const withoutAlerts: cytoscape.ElementDefinition[] = [
    { group: 'nodes', data: { id: 'c1', kind: 'deployment', isController: true } },
  ];

  it('drops data keys the incoming definition omits (alerts → no-alerts) and stops re-diffing', () => {
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: withAlerts });
    const { result, rerender } = renderHook(
      (props: { elements: cytoscape.ElementDefinition[] }) =>
        useCytoscape({ elements: props.elements, stylesheet: [] }),
      { initialProps: { elements: withAlerts } }
    );
    result.current.cyRef.current = cy;

    rerender({ elements: withoutAlerts });
    const live = cy.getElementById('c1');
    expect(live.data('alerts')).toBeUndefined();
    expect(live.data('worstStatus')).toBeUndefined();
    expect(live.data('kind')).toBe('deployment');
    // The live element now matches the incoming definition exactly — no churn.
    const next = diffElements(cy.elements().jsons() as cytoscape.ElementDefinition[], withoutAlerts);
    expect(next.toUpdate).toHaveLength(0);

    cy.destroy();
  });
});

describe('useCytoscape pod-parent mode rebuild', () => {
  const nodeMode: cytoscape.ElementDefinition[] = [
    { group: 'nodes', data: { id: 'node-a', kind: 'node' } },
    { group: 'nodes', data: { id: 'ctrl', kind: 'deployment' } },
    { group: 'nodes', data: { id: 'p1', parent: 'node-a', kind: 'pod' } },
  ];
  const controllerMode: cytoscape.ElementDefinition[] = [
    { group: 'nodes', data: { id: 'node-a', kind: 'node' } },
    { group: 'nodes', data: { id: 'ctrl', kind: 'deployment' } },
    { group: 'nodes', data: { id: 'p1', parent: 'ctrl', kind: 'pod' } },
    { group: 'edges', data: { id: 'ppm', source: 'p1', target: 'node-a', edgeType: 'pod-runs-on-node' } },
  ];

  it('re-nests pods on mode change in both directions (collapse-aware path)', () => {
    // The live bug: toggling node→controller→node left pods stuck under the
    // controller because dynamic re-parenting is unreliable under the
    // expand-collapse extension. The fix rebuilds the element set on mode change so
    // nesting is applied at add() time. (The real extension is not in the jest env,
    // so this guards the rebuild branch's correctness rather than the live
    // interference.)
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: nodeMode });
    const api = { expandAll: jest.fn(), collapse: jest.fn() } as unknown as cytoscape.ExpandCollapseApi;
    const apiRef = { current: api } as MutableRefObject<cytoscape.ExpandCollapseApi | null>;
    const collapsedIdsRef = { current: new Set<string>() } as MutableRefObject<ReadonlySet<string>>;
    const suppressRef = { current: false };
    const { result, rerender } = renderHook(
      (props: { elements: cytoscape.ElementDefinition[]; collapseKey: number; podParentMode: PodParentMode }) =>
        useCytoscape({
          elements: props.elements,
          stylesheet: [],
          apiRef,
          collapsedIdsRef,
          suppressRef,
          onCollapsedChange: jest.fn(),
          collapseKey: props.collapseKey,
          podParentMode: props.podParentMode,
        }),
      { initialProps: { elements: nodeMode, collapseKey: 0, podParentMode: 'node' } }
    );
    result.current.cyRef.current = cy;
    expect(cy.getElementById('p1').parent().first().id()).toBe('node-a');

    rerender({ elements: controllerMode, collapseKey: 1, podParentMode: 'controller' });
    expect(cy.getElementById('p1').parent().first().id()).toBe('ctrl');
    expect(cy.getElementById('ppm').length).toBe(1);

    rerender({ elements: nodeMode, collapseKey: 2, podParentMode: 'node' });
    expect(cy.getElementById('p1').parent().first().id()).toBe('node-a');
    expect(cy.getElementById('ppm').length).toBe(0);

    cy.destroy();
  });
});

describe('useCytoscape patch application', () => {
  const renderPatchHarness = (initial: cytoscape.ElementDefinition[]) => {
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: initial });
    const hook = renderHook(
      (props: { elements: cytoscape.ElementDefinition[] }) =>
        useCytoscape({ elements: props.elements, stylesheet: [] }),
      { initialProps: { elements: initial } }
    );
    hook.result.current.cyRef.current = cy;
    return { cy, ...hook };
  };

  it('removes elements whose ids contain selector metacharacters ("/" and ":")', () => {
    // Synthesized ids (ctrl/…, ppm:…, syn:…) are invalid in `#id` selector strings —
    // one bad segment used to poison the whole comma-joined removal into a no-op.
    const specials: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'plain' } },
      { group: 'nodes', data: { id: 'ctrl/prod/db/x', isController: true } },
      { group: 'nodes', data: { id: 'p1', parent: 'ctrl/prod/db/x', kind: 'pod' } },
      { group: 'edges', data: { id: 'ppm:pod-runs-on-node:p1', source: 'p1', target: 'plain' } },
    ];
    const { cy, rerender } = renderPatchHarness(specials);

    rerender({ elements: [{ group: 'nodes', data: { id: 'plain' } }] });

    expect(cy.getElementById('ctrl/prod/db/x').length).toBe(0);
    expect(cy.getElementById('p1').length).toBe(0);
    expect(cy.getElementById('ppm:pod-runs-on-node:p1').length).toBe(0);
    expect(cy.getElementById('plain').length).toBe(1);
    cy.destroy();
  });

  it('keeps a child re-homed away from a parent removed in the same refresh', () => {
    // K8s node A drained while its pod reschedules onto node B in one refresh: the
    // pod must survive A's compound-cascade removal and land under B immediately.
    const initial: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'nodeA', kind: 'node' } },
      { group: 'nodes', data: { id: 'nodeB', kind: 'node' } },
      { group: 'nodes', data: { id: 'p1', parent: 'nodeA', kind: 'pod' } },
    ];
    const { cy, rerender } = renderPatchHarness(initial);

    rerender({
      elements: [
        { group: 'nodes', data: { id: 'nodeB', kind: 'node' } },
        { group: 'nodes', data: { id: 'p1', parent: 'nodeB', kind: 'pod' } },
      ],
    });

    expect(cy.getElementById('nodeA').length).toBe(0);
    expect(cy.getElementById('p1').length).toBe(1);
    expect(cy.getElementById('p1').parent().first().id()).toBe('nodeB');
    cy.destroy();
  });

  it('rewires an edge whose target changed while keeping its id', () => {
    const initial: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'a' } },
      { group: 'nodes', data: { id: 'b' } },
      { group: 'nodes', data: { id: 'c' } },
      { group: 'edges', data: { id: 'e1', source: 'a', target: 'b' } },
    ];
    const { cy, rerender } = renderPatchHarness(initial);

    rerender({
      elements: [
        { group: 'nodes', data: { id: 'a' } },
        { group: 'nodes', data: { id: 'b' } },
        { group: 'nodes', data: { id: 'c' } },
        { group: 'edges', data: { id: 'e1', source: 'a', target: 'c' } },
      ],
    });

    const live = cy.getElementById('e1');
    expect(live.length).toBe(1);
    expect(live.data('target')).toBe('c');
    cy.destroy();
  });

  it('never lets cytoscape alias the React-side element data (clone on add)', () => {
    const initial: cytoscape.ElementDefinition[] = [{ group: 'nodes', data: { id: 'a' } }];
    const { cy, rerender } = renderPatchHarness(initial);

    const addedDef: cytoscape.ElementDefinition = { group: 'nodes', data: { id: 'b', kind: 'pod' } };
    rerender({ elements: [initial[0]!, addedDef] });

    // Simulate an in-place mutation by the expand-collapse extension.
    cy.getElementById('b').data('contaminated', true);
    expect((addedDef.data as Record<string, unknown>).contaminated).toBeUndefined();
    cy.destroy();
  });
});

describe('useCytoscape collapse-aware diff-patch', () => {
  it('expands all, patches, then re-collapses present parents and reports prune in order', () => {
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: baseElements });
    const order: string[] = [];
    const states: boolean[] = [];
    const suppressRef = { current: false };
    const api = {
      expandAll: jest.fn(() => {
        states.push(suppressRef.current);
        order.push('expandAll');
      }),
      collapse: jest.fn(() => order.push('collapse')),
    } as unknown as cytoscape.ExpandCollapseApi;
    const apiRef = { current: api } as MutableRefObject<cytoscape.ExpandCollapseApi | null>;
    const collapsedIdsRef = { current: new Set(['cl']) } as MutableRefObject<ReadonlySet<string>>;
    const onCollapsedChange = jest.fn();

    const { result, rerender } = renderHook(
      (props: { elements: cytoscape.ElementDefinition[] }) =>
        useCytoscape({
          elements: props.elements,
          stylesheet: [],
          apiRef,
          collapsedIdsRef,
          suppressRef,
          onCollapsedChange,
        }),
      { initialProps: { elements: baseElements } }
    );
    result.current.cyRef.current = cy;
    rerender({ elements: [...baseElements, { group: 'nodes', data: { id: 'p2', parent: 'cl', kind: 'pod' } }] });

    expect(order[0]).toBe('expandAll');
    expect(order).toContain('collapse');
    expect(order.indexOf('expandAll')).toBeLessThan(order.indexOf('collapse'));
    expect(states[0]).toBe(true);
    expect(suppressRef.current).toBe(false);
    expect(onCollapsedChange).not.toHaveBeenCalled();
    cy.destroy();
  });

  it('seeds a refresh-added child near its parent (not the origin) so a collapsed controller is not dragged to (0,0)', () => {
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: baseElements });
    // Give the existing child a real position so its parent 'cl' is NOT at origin.
    cy.getElementById('p1').position({ x: 400, y: 250 });
    const parentPos = cy.getElementById('cl').position();
    expect(parentPos).not.toEqual({ x: 0, y: 0 });

    const api = { expandAll: jest.fn(), collapse: jest.fn() } as unknown as cytoscape.ExpandCollapseApi;
    const apiRef = { current: api } as MutableRefObject<cytoscape.ExpandCollapseApi | null>;
    const collapsedIdsRef = { current: new Set(['cl']) } as MutableRefObject<ReadonlySet<string>>;
    const { result, rerender } = renderHook(
      (props: { elements: cytoscape.ElementDefinition[] }) =>
        useCytoscape({
          elements: props.elements,
          stylesheet: [],
          apiRef,
          collapsedIdsRef,
          suppressRef: { current: false },
          onCollapsedChange: jest.fn(),
        }),
      { initialProps: { elements: baseElements } }
    );
    result.current.cyRef.current = cy;

    // Data refresh adds a new pod under the (collapsed) parent.
    rerender({ elements: [...baseElements, { group: 'nodes', data: { id: 'p2', parent: 'cl', kind: 'pod' } }] });

    const added = cy.getElementById('p2').position();
    expect(added).toEqual({ x: parentPos.x, y: parentPos.y });
    expect(added).not.toEqual({ x: 0, y: 0 });
    cy.destroy();
  });

  it('requests one relayout when a refresh adds a wholly-new unanchorable family', () => {
    // A brand-new controller + pod (no existing ancestor) cannot be seeded, so they
    // would land at (0,0) and stack — useCytoscape asks GraphCanvas to relayout once.
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: baseElements });
    const api = { expandAll: jest.fn(), collapse: jest.fn() } as unknown as cytoscape.ExpandCollapseApi;
    const apiRef = { current: api } as MutableRefObject<cytoscape.ExpandCollapseApi | null>;
    const collapsedIdsRef = { current: new Set(['cl']) } as MutableRefObject<ReadonlySet<string>>;
    const onStructuralRelayout = jest.fn();
    const { result, rerender } = renderHook(
      (props: { elements: cytoscape.ElementDefinition[] }) =>
        useCytoscape({
          elements: props.elements,
          stylesheet: [],
          apiRef,
          collapsedIdsRef,
          suppressRef: { current: false },
          onCollapsedChange: jest.fn(),
          onStructuralRelayout,
        }),
      { initialProps: { elements: baseElements } }
    );
    result.current.cyRef.current = cy;

    // Refresh introduces a NEW top-level controller and a pod under it.
    rerender({
      elements: [
        ...baseElements,
        { group: 'nodes', data: { id: 'newPod', parent: 'newCtrl', kind: 'pod' } },
        { group: 'nodes', data: { id: 'newCtrl', isController: true } },
      ],
    });
    expect(onStructuralRelayout).toHaveBeenCalledTimes(1);
    cy.destroy();
  });

  it('does NOT request a relayout when a refresh adds a pod under an existing (anchorable) parent', () => {
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: baseElements });
    const api = { expandAll: jest.fn(), collapse: jest.fn() } as unknown as cytoscape.ExpandCollapseApi;
    const apiRef = { current: api } as MutableRefObject<cytoscape.ExpandCollapseApi | null>;
    const collapsedIdsRef = { current: new Set(['cl']) } as MutableRefObject<ReadonlySet<string>>;
    const onStructuralRelayout = jest.fn();
    const { result, rerender } = renderHook(
      (props: { elements: cytoscape.ElementDefinition[] }) =>
        useCytoscape({
          elements: props.elements,
          stylesheet: [],
          apiRef,
          collapsedIdsRef,
          suppressRef: { current: false },
          onCollapsedChange: jest.fn(),
          onStructuralRelayout,
        }),
      { initialProps: { elements: baseElements } }
    );
    result.current.cyRef.current = cy;

    rerender({ elements: [...baseElements, { group: 'nodes', data: { id: 'p2', parent: 'cl', kind: 'pod' } }] });
    expect(onStructuralRelayout).not.toHaveBeenCalled(); // anchored add → D7 preserved
    cy.destroy();
  });

  it('collapses exactly the reconciled parents, even when ids contain CSS-special chars', () => {
    const slashElements: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'cluster/demo', isCluster: true } },
      { group: 'nodes', data: { id: 'demo/p1', parent: 'cluster/demo', kind: 'pod' } },
    ];
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: slashElements });
    const collapseArgIds: string[][] = [];
    const api = {
      expandAll: jest.fn(),
      collapse: jest.fn((eles: cytoscape.NodeCollection) => {
        collapseArgIds.push(eles.map((n) => n.id()));
      }),
    } as unknown as cytoscape.ExpandCollapseApi;
    const apiRef = { current: api } as MutableRefObject<cytoscape.ExpandCollapseApi | null>;
    const collapsedIdsRef = { current: new Set(['cluster/demo']) } as MutableRefObject<ReadonlySet<string>>;
    const { result, rerender } = renderHook(
      (props: { elements: cytoscape.ElementDefinition[] }) =>
        useCytoscape({
          elements: props.elements,
          stylesheet: [],
          apiRef,
          collapsedIdsRef,
          suppressRef: { current: false },
          onCollapsedChange: jest.fn(),
        }),
      { initialProps: { elements: slashElements } }
    );
    result.current.cyRef.current = cy;
    rerender({
      elements: [...slashElements, { group: 'nodes', data: { id: 'demo/p2', parent: 'cluster/demo', kind: 'pod' } }],
    });
    expect(collapseArgIds.at(-1)).toEqual(['cluster/demo']);
    cy.destroy();
  });

  it('prunes removed parents and reports the shrunken Set', () => {
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: baseElements });
    const api = { expandAll: jest.fn(), collapse: jest.fn() } as unknown as cytoscape.ExpandCollapseApi;
    const apiRef = { current: api } as MutableRefObject<cytoscape.ExpandCollapseApi | null>;
    const collapsedIdsRef = { current: new Set(['cl', 'ghost']) } as MutableRefObject<ReadonlySet<string>>;
    const onCollapsedChange = jest.fn();
    const { result, rerender } = renderHook(
      (props: { elements: cytoscape.ElementDefinition[] }) =>
        useCytoscape({
          elements: props.elements,
          stylesheet: [],
          apiRef,
          collapsedIdsRef,
          suppressRef: { current: false },
          onCollapsedChange,
        }),
      { initialProps: { elements: baseElements } }
    );
    result.current.cyRef.current = cy;
    rerender({ elements: [...baseElements, { group: 'nodes', data: { id: 'p2', parent: 'cl', kind: 'pod' } }] });
    expect(onCollapsedChange).toHaveBeenCalledWith(new Set(['cl']));
    cy.destroy();
  });

  it('applies collapse on collapseKey change with UNCHANGED elements (legend toggle fix)', () => {
    // Proves the bug fix: a collapseKey bump (collapsed-set content change) triggers
    // the diff-patch effect even when elements are identical, so legend toggles are
    // applied immediately rather than waiting for the next data refresh.
    const cy = cytoscape({ headless: true, styleEnabled: true, elements: baseElements });
    const collapseArgIds: string[][] = [];
    const expandAllCalls: number[] = [];
    let callIndex = 0;
    const api = {
      expandAll: jest.fn(() => {
        expandAllCalls.push(callIndex++);
      }),
      collapse: jest.fn((eles: cytoscape.NodeCollection) => {
        collapseArgIds.push(eles.map((n) => n.id()));
      }),
    } as unknown as cytoscape.ExpandCollapseApi;
    const apiRef = { current: api } as MutableRefObject<cytoscape.ExpandCollapseApi | null>;
    const collapsedIdsRef = { current: new Set<string>() } as MutableRefObject<ReadonlySet<string>>;
    const suppressRef = { current: false };

    const { result, rerender } = renderHook(
      (props: { elements: cytoscape.ElementDefinition[]; collapseKey: number }) =>
        useCytoscape({
          elements: props.elements,
          stylesheet: [],
          apiRef,
          collapsedIdsRef,
          suppressRef,
          onCollapsedChange: jest.fn(),
          collapseKey: props.collapseKey,
        }),
      { initialProps: { elements: baseElements, collapseKey: 0 } }
    );
    result.current.cyRef.current = cy;

    // --- Collapse case: set desired={"cl"}, bump key (elements unchanged) ---
    collapsedIdsRef.current = new Set(['cl']);
    rerender({ elements: baseElements, collapseKey: 1 });

    // expandAll must have been called (restores graph before diff)
    expect(expandAllCalls.length).toBeGreaterThanOrEqual(1);
    // collapse must have been called and include 'cl'
    expect(collapseArgIds.length).toBeGreaterThanOrEqual(1);
    const lastCollapseIds = collapseArgIds.at(-1) ?? [];
    expect(lastCollapseIds).toContain('cl');

    // --- Expand case: clear desired set, bump key again (elements still unchanged) ---
    const collapseCallsBefore = collapseArgIds.length;
    collapsedIdsRef.current = new Set<string>();
    rerender({ elements: baseElements, collapseKey: 2 });

    // expandAll called again (restores the collapsed graph)
    expect(expandAllCalls.length).toBeGreaterThan(1);
    // collapse should NOT have been called with 'cl' on this rerender
    // (desired set is empty → reconcileCollapse returns [] → api.collapse not invoked)
    const newCalls = collapseArgIds.slice(collapseCallsBefore);
    const recollapseWithCl = newCalls.some((ids) => ids.includes('cl'));
    expect(recollapseWithCl).toBe(false);

    cy.destroy();
  });
});
