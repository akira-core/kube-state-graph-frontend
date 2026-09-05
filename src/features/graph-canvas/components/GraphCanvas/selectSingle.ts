import type cytoscape from 'cytoscape';

// Drive cytoscape's selection imperatively from a controlled id so the blue
// selection highlight stays in sync with the detail panel (open = selected,
// closed = nothing selected). Unselects everything first to enforce single.
export function selectSingle(cy: cytoscape.Core, id: string | null): void {
  cy.$(':selected').unselect();
  if (id !== null) {
    cy.getElementById(id).select();
  }
}
