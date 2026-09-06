// Single fixed accent colour for ALL `storage-cluster` decorative group nodes (one ONTAP
// cluster each). Used by:
//   * normalize.ts — assigned to every backend `type: "storage-cluster"` container as
//     data.storageClusterColor (the grouping STRUCTURE comes from the backend's `parent`
//     field untouched; only the colour is a frontend/presentation concern).
//   * getStylesheet — the group backplate, border and label.
//
// One colour per KIND, not per instance, exactly like CLUSTER_COLOR. It is deliberately a
// SEPARATE constant rather than a reuse of CLUSTER_COLOR: an ONTAP cluster is not a
// Kubernetes cluster, and the two boxes can sit side by side at the top level, so they
// must be told apart at a glance. Constraints (mechanically enforced by
// storageClusterPalette.test.ts):
//   (1) MUST NOT equal any STATUS colour (green/yellow/red) — never read as node health.
//   (2) MUST NOT equal any edge colour (EDGE_STYLE_BY_TYPE) — a low-saturation,
//       translucent backplate keeps the vivid edges legible where they cross it, and the
//       violet pvc-to-netapp-aggr edge lands right on this box.
//   (3) MUST differ from CLUSTER_COLOR / NAMESPACE_COLOR / APPLICATION_COLOR so every
//       decorative box kind stays distinguishable.
export const STORAGE_CLUSTER_COLOR = '#4a6a63';
