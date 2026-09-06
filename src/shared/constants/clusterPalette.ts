// Single fixed accent colour for ALL `cluster` decorative group nodes. Used by:
//   * normalize.ts — assigned to every backend `type: "cluster"` container as
//     data.clusterColor (the grouping STRUCTURE comes from the backend's `parent`
//     field untouched; only the colour is a frontend/presentation concern).
//   * the legend's ClusterLegend — the swatch must match the on-canvas backplate.
//
// One colour per KIND, not per instance: every cluster renders the SAME muted slate
// so the graph reads by nesting + the canvas `Cluster: ` label prefix (render-only in
// the stylesheet; data.label stays bare), not by a rainbow of per-name hues. Constraints
// (mechanically enforced by clusterPalette.test.ts):
//   (1) MUST NOT equal any STATUS colour (green/yellow/red) — never read as node health.
//   (2) MUST NOT equal any edge colour (EDGE_STYLE_BY_TYPE) — a low-saturation,
//       translucent backplate keeps the vivid edges legible where they cross it.
//   (3) MUST differ from NAMESPACE_COLOR / APPLICATION_COLOR so the nested cluster >
//       namespace > application boxes stay distinguishable.
export const CLUSTER_COLOR = '#5b6b7a';
