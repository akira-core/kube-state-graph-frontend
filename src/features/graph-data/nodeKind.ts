import type cytoscape from 'cytoscape';

/**
 * The kind a normalized node records as, with the container flags folded back in. The
 * backend marks namespace / application / controller / cluster containers by flag rather
 * than `kind` (normalize keeps them kind-less "decorative" groups, and a controller's
 * `kind` is its workload icon), so every consumer that needs "what is this node" reads it
 * through here — the storage Sankey, its Top pods cut and the network trace agree by
 * construction. `isController` wins over the workload kind.
 */
export function recKind(d: cytoscape.NodeDataDefinition): string {
  if (d.isController === true) {
    return 'controller';
  }
  if (d.isApplication === true) {
    return 'application';
  }
  if (d.isNamespace === true) {
    return 'namespace';
  }
  if (d.isCluster === true) {
    return 'cluster';
  }
  if (d.isStorageCluster === true) {
    return 'storage-cluster';
  }
  return typeof d.kind === 'string' ? d.kind : '';
}
