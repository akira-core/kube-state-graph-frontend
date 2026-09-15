/**
 * The caption words for the storage kinds both Sankey-style charts draw as columns. The
 * k8s side (`pod`, `node`, `application`, `namespace`) is deliberately NOT here: the storage
 * chart heads those columns with title-case words while the trace chart writes them as
 * lower-case sentence words, and each keeps its own.
 */
export const STORAGE_KIND_CAPTION = {
  'netapp-node': 'NetApp node',
  'netapp-aggr': 'NetApp aggregate',
  'netapp-svm': 'SVM',
  pvc: 'PVC',
} as const satisfies Record<string, string>;
