// Data keys cytoscape-expand-collapse parks on element data. normalize /
// applyPodParentMode never emit them, so the sync layer must treat them as
// invisible bookkeeping:
// - diffElements ignores them when comparing live elements against incoming
//   definitions — the extension leaves `collapsedChildren: null` and
//   `size-before-collapse` behind after expand, so without the ignore-list every
//   ever-collapsed parent would re-enter toUpdate on every diff cycle forever.
// - useCytoscape's patch writer never deletes them (a key absent from the
//   incoming definition is normalize's absence, not a request to drop the
//   extension's state).
const EXTENSION_DATA_KEYS = new Set([
  'collapsedChildren',
  'collapsedEdges',
  'originalEnds',
  'position-before-collapse',
  'size-before-collapse',
  'x-before-fisheye',
  'y-before-fisheye',
]);

export function isExtensionDataKey(key: string): boolean {
  return EXTENSION_DATA_KEYS.has(key) || key.startsWith('expandcollapse');
}
