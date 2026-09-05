import type cytoscape from 'cytoscape';

import { clonePlain } from '../../../shared/clone/clonePlain';

// cytoscape's Element constructor ALIASES the `data` object it is given
// (`data: params.data || {}` — no copy), and cytoscape-expand-collapse mutates
// element data in place on collapse (boundary-edge source/target rewires plus
// collapse bookkeeping). Handing the React-side `elements` array to cytoscape
// directly therefore lets the extension corrupt the memoized model that
// KsgPanel/GraphCanvas still read for visibility, selection and legend derivation.
// Every cytoscape({ elements }) / cy.add() call must pass throwaway copies.
export function cloneElementDefs(defs: cytoscape.ElementDefinition[]): cytoscape.ElementDefinition[] {
  return defs.map((el) => ({
    ...el,
    data: clonePlain(el.data),
    ...(el.position !== undefined ? { position: { ...el.position } } : {}),
  }));
}
