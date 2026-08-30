import type cytoscape from 'cytoscape';

// Stable synthetic id/label for the panel-synthesized fabric wrapper. The id is
// namespaced so it cannot collide with backend node ids in practice; if the
// backend ever ships its own `network` group node, synthesis backs off entirely.
const WRAPPER_ID = 'network/fabric';
const WRAPPER_LABEL = 'physical network';

interface NodeDataView {
  id?: string;
  kind?: string;
  parent?: string;
  source?: string;
  target?: string;
}

function isNodeElement(element: cytoscape.ElementDefinition, data: NodeDataView): boolean {
  if (element.group === 'nodes') {
    return true;
  }
  if (element.group === 'edges') {
    return false;
  }
  // group omitted: infer — an edge always carries source + target.
  return data.source === undefined && data.target === undefined;
}

/**
 * Synthesize the virtual `network > switch` compound when the data does not
 * provide one: every top-level (parent-less) `switch` node is re-parented under
 * a single injected `network` wrapper (`physical network`), so the fabric is
 * boxed and kept at a distance from cluster compounds (see switch-tier-layout).
 *
 * Backs off — returning the input array unchanged — when:
 * - there is no parent-less `switch` (nothing to wrap), or
 * - a `network`-kind node already exists (the data owns the grouping; the demo
 *   dashboard and a future backend both qualify).
 *
 * A `switch` that already carries a `parent` is left where the backend put it.
 * Pure; never mutates the input elements.
 */
export function wrapSwitchFabric(elements: readonly cytoscape.ElementDefinition[]): cytoscape.ElementDefinition[] {
  let hasNetworkGroup = false;
  // Also back off when the WRAPPER_ID is already taken by an element of any other kind:
  // adding a second element with that id makes cy.add throw ("Can not create second
  // element with id"). Checking only for a `network`-KIND node misses that case, and the
  // scan must not `break` early or a later collision would go unseen.
  let wrapperIdTaken = false;
  const unparentedSwitchIds = new Set<string>();
  for (const element of elements) {
    const data = element.data as NodeDataView;
    if (data.id === WRAPPER_ID) {
      wrapperIdTaken = true;
    }
    if (!isNodeElement(element, data)) {
      continue;
    }
    if (data.kind === 'network') {
      hasNetworkGroup = true;
    }
    if (data.kind === 'switch' && typeof data.id === 'string' && data.parent === undefined) {
      unparentedSwitchIds.add(data.id);
    }
  }
  if (hasNetworkGroup || wrapperIdTaken || unparentedSwitchIds.size === 0) {
    return [...elements];
  }

  const wrapper: cytoscape.ElementDefinition = {
    group: 'nodes',
    data: { id: WRAPPER_ID, label: WRAPPER_LABEL, kind: 'network' },
  };
  const wrapped = elements.map((element) => {
    const data = element.data as NodeDataView;
    if (typeof data.id === 'string' && unparentedSwitchIds.has(data.id)) {
      return { ...element, data: { ...element.data, parent: WRAPPER_ID } };
    }
    return element;
  });
  return [wrapper, ...wrapped];
}
