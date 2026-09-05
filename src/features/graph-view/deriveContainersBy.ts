import type cytoscape from 'cytoscape';

import { buildClusterColorIndex } from './clusterColorIndex';

export interface ContainerEntry {
  name: string;
  color: string;
}

export interface ContainerSet {
  containerEntries: ContainerEntry[]; // name-deduped, parent-cluster-coloured swatches
  containerIds: string[]; // every container id (not name-deduped) for the collapse toggle
}

// Shared core of the Nodes/Controllers swatch-section derivation (deriveNodeContainers
// is a thin wrapper differing only in its container predicate): collect the compound
// containers matching `isContainer`, skipping childless candidates (drawn leaves, not
// containers). Entries are name-deduped (first-seen colour wins on a shared name)
// and tinted with the parent cluster's accent colour so each group reads as part
// of that cluster's family. Pure + deterministic.
export function deriveContainersBy(
  elements: readonly cytoscape.ElementDefinition[],
  fallbackColor: string,
  isContainer: (d: cytoscape.NodeDataDefinition) => boolean
): ContainerSet {
  const parentIds = new Set<string>();
  const parentById = new Map<string, string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (typeof d.parent === 'string') {
      parentIds.add(d.parent);
      if (typeof d.id === 'string') {
        parentById.set(d.id, d.parent);
      }
    }
  }
  const clusterColorById = buildClusterColorIndex(elements);

  // Walk the parent chain to the first ancestor carrying a cluster colour, mirroring
  // the canvas (getStylesheet resolveParentClusterColor) so the legend swatch can never
  // disagree with the on-canvas box tint. The immediate parent suffices for a container
  // directly under its cluster; in controller mode a controller sits under the backend
  // namespace / application boxes — which carry namespaceColor / applicationColor, NOT
  // clusterColor — so keep climbing to inherit the enclosing cluster's accent instead of
  // falling back to neutral. Guarded against cycles.
  const clusterColorOfAncestor = (startParentId: string): string | undefined => {
    let cur: string | undefined = startParentId;
    for (let guard = 0; cur !== undefined && guard < 64; guard++) {
      const color = clusterColorById.get(cur);
      if (color !== undefined) {
        return color;
      }
      cur = parentById.get(cur);
    }
    return undefined;
  };

  const containerEntries: ContainerEntry[] = [];
  const containerIds: string[] = [];
  const seenNames = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (!isContainer(d) || typeof d.id !== 'string' || !parentIds.has(d.id)) {
      continue; // not a container, or a childless drawn leaf
    }
    containerIds.push(d.id);
    const name = typeof d.label === 'string' ? d.label : d.id;
    if (seenNames.has(name)) {
      continue;
    }
    seenNames.add(name);
    const parentColor = typeof d.parent === 'string' ? clusterColorOfAncestor(d.parent) : undefined;
    containerEntries.push({ name, color: parentColor ?? fallbackColor });
  }

  return { containerEntries, containerIds };
}
