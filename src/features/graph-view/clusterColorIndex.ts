import type cytoscape from 'cytoscape';

// Index each backend cluster container's accent colour by its node id, so the node /
// controller swatch derivation can tint a contained node from its parent cluster.
// Single source for the `isCluster` → `clusterColor` scan used by deriveContainers.
export function buildClusterColorIndex(elements: readonly cytoscape.ElementDefinition[]): Map<string, string> {
  const byId = new Map<string, string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.isCluster === true && typeof d.id === 'string' && typeof d.clusterColor === 'string') {
      byId.set(d.id, d.clusterColor);
    }
  }
  return byId;
}
