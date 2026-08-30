import { act, renderHook } from '@testing-library/react';
import cytoscape from 'cytoscape';

import { useHoverElement } from './useHoverElement';

function headlessCy(elements: cytoscape.ElementDefinition[]): cytoscape.Core {
  return cytoscape({ headless: true, styleEnabled: true, elements });
}

describe('useHoverElement', () => {
  it('binds only after the instance is ready, then surfaces the hovered node', () => {
    // Reproduces the original bug: the bind effect first runs while cyRef.current
    // is still null (child effect fires before the parent creates the instance).
    const cyRef = { current: null as cytoscape.Core | null };
    const { result, rerender } = renderHook(({ ready }) => useHoverElement({ cyRef, ready }), {
      initialProps: { ready: false },
    });
    expect(result.current).toBeNull();

    // The instance now exists and readiness flips — the effect must re-bind.
    const cy = headlessCy([{ group: 'nodes', data: { id: 'p1', label: 'web', kind: 'pod' } }]);
    cyRef.current = cy;
    rerender({ ready: true });

    act(() => {
      cy.getElementById('p1').emit('mouseover');
    });
    expect(result.current?.id).toBe('p1');

    act(() => {
      cy.getElementById('p1').emit('mouseout');
    });
    expect(result.current).toBeNull();
    cy.destroy();
  });

  it('captures a storageclass leaf via the normal node path (own kind + provisioner, no synthesized context)', () => {
    const cy = headlessCy([
      { group: 'nodes', data: { id: 'cluster/prod', label: 'prod', isCluster: true, cluster: 'prod' } },
      {
        group: 'nodes',
        data: {
          id: 'prod/storageclass/fast-ssd',
          label: 'fast-ssd',
          kind: 'storageclass',
          provisioner: 'rook-ceph.rbd.csi.ceph.com',
          parent: 'cluster/prod',
        },
      },
    ]);
    const cyRef = { current: cy };
    const { result } = renderHook(() => useHoverElement({ cyRef, ready: true }));
    act(() => {
      cy.getElementById('prod/storageclass/fast-ssd').emit('mouseover');
    });
    expect(result.current?.id).toBe('prod/storageclass/fast-ssd');
    // The storageclass leaf carries its own kind + provisioner — no synthesized
    // storageClass field (that path was removed when storageclass became a leaf).
    expect(result.current?.data.kind).toBe('storageclass');
    expect(result.current?.data.provisioner).toBe('rook-ceph.rbd.csi.ceph.com');
    expect(result.current).not.toHaveProperty('storageClass');
    cy.destroy();
  });

  it('snapshots an element whose data carries a live cytoscape collection without overflowing', () => {
    // Reproduces the production hover crash: cytoscape-expand-collapse parks live
    // collections on element data (`collapsedChildren` on collapsed parents,
    // `originalEnds` on rerouted edges). Those collections reference cy, so they are
    // cyclic — a naive deep clone of `target.data()` recursed forever and threw
    // "Maximum call stack size exceeded" on every hover.
    const cy = headlessCy([
      { group: 'nodes', data: { id: 'p1', label: 'web', kind: 'pod' } },
      { group: 'nodes', data: { id: 'p2', label: 'db', kind: 'pod' } },
    ]);
    // Park a live (cyclic) collection on the node, exactly as the extension does.
    cy.getElementById('p1').data('collapsedChildren', cy.nodes());
    const cyRef = { current: cy };
    const { result } = renderHook(() => useHoverElement({ cyRef, ready: true }));

    expect(() => {
      act(() => {
        cy.getElementById('p1').emit('mouseover');
      });
    }).not.toThrow();
    expect(result.current?.id).toBe('p1');
    expect(result.current?.data.label).toBe('web');
    cy.destroy();
  });

  it('surfaces a cluster container node on hover (selectable:false does not block mouseover)', () => {
    const cy = headlessCy([
      { group: 'nodes', data: { id: 'cluster:demo', label: 'demo', isCluster: true, cluster: 'demo' } },
    ]);
    const cyRef = { current: cy };
    const { result } = renderHook(() => useHoverElement({ cyRef, ready: true }));

    act(() => {
      cy.getElementById('cluster:demo').emit('mouseover');
    });
    expect(result.current?.id).toBe('cluster:demo');
    expect(result.current?.data.isCluster).toBe(true);
    expect(result.current?.data.cluster).toBe('demo');
    cy.destroy();
  });
});
