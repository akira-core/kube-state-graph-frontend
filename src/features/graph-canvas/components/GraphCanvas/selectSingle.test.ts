import cytoscape from 'cytoscape';

import { selectSingle } from './selectSingle';

function makeCy(): cytoscape.Core {
  return cytoscape({
    headless: true,
    styleEnabled: false,
    elements: [
      { group: 'nodes', data: { id: 'a' } },
      { group: 'nodes', data: { id: 'b' } },
    ],
  });
}

describe('selectSingle', () => {
  it('selects only the given node', () => {
    const cy = makeCy();
    selectSingle(cy, 'a');
    expect(cy.getElementById('a').selected()).toBe(true);
    expect(cy.getElementById('b').selected()).toBe(false);
    cy.destroy();
  });

  it('switches selection to a different node', () => {
    const cy = makeCy();
    selectSingle(cy, 'a');
    selectSingle(cy, 'b');
    expect(cy.getElementById('a').selected()).toBe(false);
    expect(cy.getElementById('b').selected()).toBe(true);
    cy.destroy();
  });

  it('clears selection when id is null', () => {
    const cy = makeCy();
    selectSingle(cy, 'a');
    selectSingle(cy, null);
    expect(cy.$(':selected').length).toBe(0);
    cy.destroy();
  });
});
