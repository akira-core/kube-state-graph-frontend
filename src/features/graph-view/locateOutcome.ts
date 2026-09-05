import type cytoscape from 'cytoscape';

export type LocateOutcome = 'ok' | 'filter-hidden' | 'missing';

export function locateOutcome(
  id: string,
  elements: readonly cytoscape.ElementDefinition[],
  visibleNodeIds: ReadonlySet<string>
): LocateOutcome {
  const exists = elements.some((el) => el.group === 'nodes' && (el.data as cytoscape.NodeDataDefinition).id === id);
  if (!exists) {
    return 'missing';
  }
  if (!visibleNodeIds.has(id)) {
    return 'filter-hidden';
  }
  return 'ok';
}
