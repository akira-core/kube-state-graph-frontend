import cytoscape from 'cytoscape';

import { registerCytoscapeExtensions } from './registerExtensions';

describe('registerCytoscapeExtensions', () => {
  it('is a guarded no-op after the module-level registration', () => {
    const useSpy = vi.spyOn(cytoscape, 'use');
    registerCytoscapeExtensions();
    registerCytoscapeExtensions();
    expect(useSpy).not.toHaveBeenCalled();
    useSpy.mockRestore();
  });

  it('exposes cy.expandCollapse after registration', () => {
    registerCytoscapeExtensions();
    const cy = cytoscape({ headless: true });
    expect(typeof cy.expandCollapse).toBe('function');
    cy.destroy();
  });
});
