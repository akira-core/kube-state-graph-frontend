import cytoscape from 'cytoscape';

import { createViewportApi } from './useViewportApi';

// Two close-together nodes (small bounding box) plus a far switch, so a "big viewport,
// small bbox" setup naturally produces a fit zoom that exceeds the 1.5 clamp — headless
// cytoscape defaults width()/height() to 1x1, so tests override them to a realistic size.
function makeCy(): cytoscape.Core {
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    elements: [
      { group: 'nodes', data: { id: 'a' }, position: { x: 0, y: 0 } },
      { group: 'nodes', data: { id: 'b' }, position: { x: 40, y: 40 } },
      { group: 'nodes', data: { id: 'far' }, position: { x: 5000, y: 5000 } },
      { group: 'edges', data: { id: 'e-ab', source: 'a', target: 'b' } },
    ],
  });
  cy.width = (): number => 800;
  cy.height = (): number => 600;
  return cy;
}

describe('createViewportApi', () => {
  describe('fitToIds', () => {
    it('animates to the natural fit target when it stays within the zoom clamp', () => {
      const cy = makeCy();
      // A big viewport around the WHOLE graph (including the far node) keeps zoom modest.
      const animateSpy = jest.spyOn(cy, 'animate').mockReturnValue(cy);
      createViewportApi(cy).fitToIds(['a', 'b', 'far']);
      expect(animateSpy).toHaveBeenCalledTimes(1);
      const [target, opts] = animateSpy.mock.calls[0] as [{ zoom: number; pan: unknown }, { duration: number }];
      expect(opts.duration).toBe(250);
      expect(target.zoom).toBeLessThanOrEqual(1.5);
      cy.destroy();
    });

    it('clamps zoom to 1.5, re-centered on the fitted elements, when the natural fit would exceed it', () => {
      const cy = makeCy();
      const animateSpy = jest.spyOn(cy, 'animate').mockReturnValue(cy);
      // a+b alone: a small (40x40) bounding box in an 800x600 viewport — natural fit zoom
      // is huge, so the clamp must kick in.
      createViewportApi(cy).fitToIds(['a', 'b']);
      const [target] = animateSpy.mock.calls[0] as [{ zoom: number; pan: { x: number; y: number } }];
      expect(target.zoom).toBeCloseTo(1.5);
      cy.destroy();
    });

    it('is a no-op (never animates) for an empty id set', () => {
      const cy = makeCy();
      const animateSpy = jest.spyOn(cy, 'animate').mockReturnValue(cy);
      createViewportApi(cy).fitToIds([]);
      expect(animateSpy).not.toHaveBeenCalled();
      cy.destroy();
    });

    it('is a no-op when every given id resolves to nothing on canvas', () => {
      const cy = makeCy();
      const animateSpy = jest.spyOn(cy, 'animate').mockReturnValue(cy);
      createViewportApi(cy).fitToIds(['nope-1', 'nope-2']);
      expect(animateSpy).not.toHaveBeenCalled();
      cy.destroy();
    });

    it('excludes a hidden (filter-hidden) element from the fit', () => {
      const cy = makeCy();
      cy.getElementById('far').style('visibility', 'hidden');
      const fitSpy = jest.spyOn(cy, 'fit');
      const animateSpy = jest.spyOn(cy, 'animate').mockReturnValue(cy);
      createViewportApi(cy).fitToIds(['a', 'far']);
      expect(animateSpy).toHaveBeenCalledTimes(1); // 'a' alone is still visible
      const [fittedEles] = fitSpy.mock.calls[0] as [cytoscape.CollectionReturnValue];
      expect(fittedEles.map((e) => e.id())).toEqual(['a']);
      cy.destroy();
    });

    it('is a no-op when every given id is hidden', () => {
      const cy = makeCy();
      cy.getElementById('a').style('visibility', 'hidden');
      cy.getElementById('b').style('visibility', 'hidden');
      const animateSpy = jest.spyOn(cy, 'animate').mockReturnValue(cy);
      createViewportApi(cy).fitToIds(['a', 'b']);
      expect(animateSpy).not.toHaveBeenCalled();
      cy.destroy();
    });

    it('never mutates pan/zoom synchronously — only cy.animate (stubbed here) may transition the viewport', () => {
      const cy = makeCy();
      jest.spyOn(cy, 'animate').mockReturnValue(cy);
      const zoomBefore = cy.zoom();
      const panBefore = { ...cy.pan() };
      createViewportApi(cy).fitToIds(['a', 'b']);
      expect(cy.zoom()).toBe(zoomBefore);
      expect(cy.pan()).toEqual(panBefore);
      cy.destroy();
    });
  });

  describe('fitToNeighborhood', () => {
    it('fits to the closed neighborhood (node + incident edges + neighbours) of the given node', () => {
      const cy = makeCy();
      const fitSpy = jest.spyOn(cy, 'fit');
      const animateSpy = jest.spyOn(cy, 'animate').mockReturnValue(cy);
      createViewportApi(cy).fitToNeighborhood('a');
      expect(animateSpy).toHaveBeenCalledTimes(1);
      const [fittedEles] = fitSpy.mock.calls[0] as [cytoscape.CollectionReturnValue];
      expect(fittedEles.map((e) => e.id()).sort()).toEqual(['a', 'b', 'e-ab']);
      cy.destroy();
    });

    it('is a no-op for an unknown node id', () => {
      const cy = makeCy();
      const animateSpy = jest.spyOn(cy, 'animate').mockReturnValue(cy);
      createViewportApi(cy).fitToNeighborhood('nope');
      expect(animateSpy).not.toHaveBeenCalled();
      cy.destroy();
    });
  });
});
