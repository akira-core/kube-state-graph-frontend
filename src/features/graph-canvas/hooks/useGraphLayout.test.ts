import { renderHook } from '@testing-library/react';
import cytoscape from 'cytoscape';
import type { MutableRefObject } from 'react';

import type { SwitchConstraints } from '../../switch-topology';

import { useGraphLayout, type LayoutName } from './useGraphLayout';

function makeCy(): cytoscape.Core {
  return cytoscape({
    headless: true,
    styleEnabled: true,
    elements: [
      { group: 'nodes', data: { id: 'a' } },
      { group: 'nodes', data: { id: 'b' } },
    ],
  });
}

function stubLayout(cy: cytoscape.Core): { layoutSpy: jest.SpyInstance; runMock: jest.Mock; stopMock: jest.Mock } {
  const runMock = jest.fn();
  const stopMock = jest.fn();
  const fakeLayout = { run: runMock, stop: stopMock } as unknown as cytoscape.Layouts;
  const layoutSpy = jest.spyOn(cy, 'layout').mockReturnValue(fakeLayout);
  return { layoutSpy, runMock, stopMock };
}

describe('useGraphLayout', () => {
  it('calls cy.stop() then cy.layout(options).run() on mount', () => {
    const cy = makeCy();
    const stopSpy = jest.spyOn(cy, 'stop');
    const { layoutSpy, runMock } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

    renderHook(() => useGraphLayout({ cyRef, name: 'fcose' }));

    expect(stopSpy).toHaveBeenCalled();
    expect(layoutSpy).toHaveBeenCalledTimes(1);
    expect(runMock).toHaveBeenCalledTimes(1);
    const [arg] = layoutSpy.mock.calls[0] as [{ name: string }];
    expect(arg.name).toBe('fcose');
  });

  it('reruns layout when name changes', () => {
    const cy = makeCy();
    const { layoutSpy, runMock } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

    const { rerender } = renderHook(({ name }: { name: LayoutName }) => useGraphLayout({ cyRef, name }), {
      initialProps: { name: 'fcose' as LayoutName },
    });
    expect(layoutSpy).toHaveBeenCalledTimes(1);

    rerender({ name: 'dagre' as LayoutName });
    expect(layoutSpy).toHaveBeenCalledTimes(2);
    expect(runMock).toHaveBeenCalledTimes(2);
    const [secondArg] = layoutSpy.mock.calls[1] as [{ name: string }];
    expect(secondArg.name).toBe('dagre');
  });

  it('does not rerun layout when name is unchanged across renders', () => {
    const cy = makeCy();
    const { layoutSpy } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

    const { rerender } = renderHook(({ name }: { name: LayoutName }) => useGraphLayout({ cyRef, name }), {
      initialProps: { name: 'fcose' as LayoutName },
    });
    expect(layoutSpy).toHaveBeenCalledTimes(1);

    rerender({ name: 'fcose' as LayoutName });
    expect(layoutSpy).toHaveBeenCalledTimes(1); // memoized options keep effect from re-firing
  });

  it('is a no-op when cyRef is null', () => {
    const cyRef = { current: null } as MutableRefObject<cytoscape.Core | null>;
    expect(() => {
      renderHook(() => useGraphLayout({ cyRef, name: 'fcose' }));
    }).not.toThrow();
  });

  it('reruns layout when runToken changes', () => {
    const cy = makeCy();
    const { layoutSpy } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;
    const { rerender } = renderHook(
      ({ runToken }: { runToken: number }) => useGraphLayout({ cyRef, name: 'fcose', runToken }),
      { initialProps: { runToken: 0 } }
    );
    expect(layoutSpy).toHaveBeenCalledTimes(1);
    rerender({ runToken: 1 });
    expect(layoutSpy).toHaveBeenCalledTimes(2);
  });

  it('does not rerun layout when runToken is unchanged across renders', () => {
    const cy = makeCy();
    const { layoutSpy } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;
    const { rerender } = renderHook(
      ({ runToken }: { runToken: number }) => useGraphLayout({ cyRef, name: 'fcose', runToken }),
      { initialProps: { runToken: 0 } }
    );
    expect(layoutSpy).toHaveBeenCalledTimes(1);
    rerender({ runToken: 0 });
    expect(layoutSpy).toHaveBeenCalledTimes(1);
  });

  it('defaults runToken to 0 so existing mount-only callers run layout exactly once', () => {
    const cy = makeCy();
    const { layoutSpy } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;
    renderHook(() => useGraphLayout({ cyRef, name: 'fcose' })); // no runToken passed
    expect(layoutSpy).toHaveBeenCalledTimes(1);
  });

  const sampleConstraints: SwitchConstraints = {
    fixedNodeConstraint: [
      { nodeId: 'a', position: { x: -90, y: 0 } },
      { nodeId: 'b', position: { x: 90, y: 0 } },
    ],
  };

  it('merges switchConstraints into the fcose layout options when provided', () => {
    const cy = makeCy();
    const { layoutSpy } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

    renderHook(() => useGraphLayout({ cyRef, name: 'fcose', switchConstraints: sampleConstraints }));

    const [arg] = layoutSpy.mock.calls[0] as [Record<string, unknown>];
    expect(arg.name).toBe('fcose');
    expect(arg.fixedNodeConstraint).toEqual(sampleConstraints.fixedNodeConstraint);
  });

  it('ignores switchConstraints in dagre mode', () => {
    const cy = makeCy();
    const { layoutSpy } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

    renderHook(() => useGraphLayout({ cyRef, name: 'dagre', switchConstraints: sampleConstraints }));

    const [arg] = layoutSpy.mock.calls[0] as [Record<string, unknown>];
    expect(arg.name).toBe('dagre');
    expect(arg.fixedNodeConstraint).toBeUndefined();
  });

  it('omits constraint keys from fcose options when no switchConstraints are given', () => {
    const cy = makeCy();
    const { layoutSpy } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

    renderHook(() => useGraphLayout({ cyRef, name: 'fcose' }));

    const [arg] = layoutSpy.mock.calls[0] as [Record<string, unknown>];
    expect(arg.name).toBe('fcose');
    expect(arg.fixedNodeConstraint).toBeUndefined();
  });

  it('drops fixedNodeConstraint entries whose nodes are not in the live graph', () => {
    // Constraints come from the full React-side model; a pinned switch collapsed
    // away (inside the network/cluster compound) must not reach fcose — a missing
    // constrained node NaN-poisons every position in cose-base.
    const cy = makeCy(); // has 'a' and 'b' only
    const { layoutSpy } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;
    const withMissing: SwitchConstraints = {
      fixedNodeConstraint: [
        { nodeId: 'a', position: { x: -90, y: 0 } },
        { nodeId: 'collapsed-away-switch', position: { x: 90, y: 0 } },
      ],
    };

    renderHook(() => useGraphLayout({ cyRef, name: 'fcose', switchConstraints: withMissing }));

    const [arg] = layoutSpy.mock.calls[0] as [Record<string, unknown>];
    expect(arg.fixedNodeConstraint).toEqual([{ nodeId: 'a', position: { x: -90, y: 0 } }]);
  });

  it('omits fixedNodeConstraint entirely when every constrained node is missing', () => {
    const cy = makeCy();
    const { layoutSpy } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;
    const allMissing: SwitchConstraints = {
      fixedNodeConstraint: [{ nodeId: 'ghost', position: { x: 0, y: 0 } }],
    };

    renderHook(() => useGraphLayout({ cyRef, name: 'fcose', switchConstraints: allMissing }));

    const [arg] = layoutSpy.mock.calls[0] as [Record<string, unknown>];
    expect(arg.fixedNodeConstraint).toBeUndefined();
  });

  it('stops the previous layout run before starting the next (cy.stop() alone does not)', () => {
    const cy = makeCy();
    const { layoutSpy, stopMock } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;
    const { rerender } = renderHook(
      ({ runToken }: { runToken: number }) => useGraphLayout({ cyRef, name: 'fcose', runToken }),
      { initialProps: { runToken: 0 } }
    );
    expect(stopMock).not.toHaveBeenCalled(); // nothing to stop on the first run

    rerender({ runToken: 1 });
    expect(layoutSpy).toHaveBeenCalledTimes(2);
    expect(stopMock).toHaveBeenCalledTimes(1); // previous run halted before the new one
  });

  it('does not rerun layout when only switchConstraints change (applied via ref at run time)', () => {
    const cy = makeCy();
    const { layoutSpy } = stubLayout(cy);
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

    const { rerender } = renderHook(
      ({ sc }: { sc: SwitchConstraints | null }) => useGraphLayout({ cyRef, name: 'fcose', switchConstraints: sc }),
      { initialProps: { sc: null as SwitchConstraints | null } }
    );
    expect(layoutSpy).toHaveBeenCalledTimes(1);

    rerender({ sc: sampleConstraints });
    expect(layoutSpy).toHaveBeenCalledTimes(1); // constraint change alone is not a relayout trigger
  });
});
