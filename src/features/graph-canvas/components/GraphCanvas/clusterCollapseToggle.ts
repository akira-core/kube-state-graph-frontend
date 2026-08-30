import type cytoscape from 'cytoscape';

// Toggle a NON-SELECTABLE decorative group's collapse/expand through the expand-collapse
// api. `cluster` and `storage-cluster` are both non-selectable, so the selection-driven
// `+/-` cue never surfaces on either; double-tap is their collapse gesture instead. The
// gesture has to cover EVERY non-selectable decorative group: one with neither cue nor
// double-tap could not be collapsed at all, while the folder-glyph rule already defines how
// a collapsed `storage-cluster` looks — a state the user must be able to reach. Selectable
// containers keep the cue and are a no-op here. The guard lives in this function (not the
// event handler) so the whole decision is unit-testable without a live cytoscape instance.
//
// A currently-collapsed parent reports `isExpandable` → expand it; an expanded parent
// reports `isCollapsible` → collapse it. Both paths fire the same
// `expandcollapse.aftercollapse`/`afterexpand` events the cue would, so `collapsedIds`
// updates through the existing useExpandCollapse plumbing (no new state path).
export function clusterCollapseToggle(node: cytoscape.NodeSingular, api: cytoscape.ExpandCollapseApi): void {
  if (node.data('isCluster') !== true && node.data('isStorageCluster') !== true) {
    return;
  }
  if (api.isExpandable(node)) {
    api.expand(node);
    return;
  }
  if (api.isCollapsible(node)) {
    api.collapse(node);
  }
}
