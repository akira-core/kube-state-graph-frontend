import type { NodeKind } from './types';

// Single source of truth for node identity: kind → monochrome line-art icon.
// Replaces SHAPE_BY_KIND's identity role — leaf nodes now share one container
// shape (round-rectangle) and are told apart by this icon (drawn as the node's
// background-image). Each SVG is single-colour and uses the `currentColor`
// sentinel so it can be tinted per Grafana theme via tintSvgToDataUri.
//
// Authoring rules (load-bearing — verified against the cytoscape.js style docs):
// - Prefix the XML header `<?xml version="1.0" encoding="UTF-8"?>`. The docs say
//   "Always include this XML header in each SVG image"; without it cytoscape
//   rasterises NOTHING onto the canvas (an <img> is lenient and still shows the
//   glyph, which is why the legend looked fine while the on-canvas node was blank).
// - Include `xmlns` + explicit `width`/`height` (24×24, matching the viewBox).
// - Use stroke-based art (fill="none") so the glyph stays crisp at small sizes
//   and tints cleanly.
// - Keep the sentinel literally `currentColor` (tintSvgToDataUri swaps it).
//
// These are intentionally simple in-house glyphs; the map is the only thing that
// needs to change to swap in a richer set later (e.g. Argo CD's resource icons).

const SVG_OPEN =
  '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">';
const SVG_CLOSE = '</svg>';

const icon = (inner: string): string => `${SVG_OPEN}${inner}${SVG_CLOSE}`;

export const ICON_SVG_BY_KIND: Record<NodeKind, string> = {
  // The iconic Kubernetes 7-sided heptagon. Reads as "a pod".
  pod: icon('<polygon points="12,3 19,6.4 20.8,14 15.9,20.1 8.1,20.1 3.2,14 5,6.4"/>'),
  // Desktop computer: a monitor screen on a stand. Reads as "a machine / host".
  node: icon('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v3M8.5 19h7"/>'),
  pvc: icon('<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6 v12 a7 2.6 0 0 0 14 0 V6"/>'),
  // 1-to-3 fan-out tree: one head endpoint load-balancing onto three backends.
  // Orthogonal (taxi) connectors — stem to a horizontal bus, then vertical
  // drops — matching how switch-incident edges route on the canvas.
  service: icon(
    '<circle cx="12" cy="5" r="2.2"/><circle cx="4.5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19.5" cy="19" r="2"/><path d="M12 7.5 V12.5 M4.5 12.5 H19.5 M4.5 12.5 V16.7 M12 12.5 V16.7 M19.5 12.5 V16.7"/>'
  ),
  // Rack-switch chassis: front-panel port row + status LED. Reads as hardware.
  switch: icon(
    '<rect x="2.5" y="8" width="19" height="8" rx="1.5"/><rect x="5" y="10.4" width="2" height="3.2" rx="0.4"/><rect x="8" y="10.4" width="2" height="3.2" rx="0.4"/><rect x="11" y="10.4" width="2" height="3.2" rx="0.4"/><rect x="14" y="10.4" width="2" height="3.2" rx="0.4"/><circle cx="18.7" cy="12" r="0.9"/>'
  ),
  // Cloud: "outside the cluster / internet". Plump rounded cloud (single stroke).
  external: icon(
    '<path d="M7 18C4.8 18 3 16.2 3 14C3 12.1 4.4 10.5 6.2 10.1C6.8 7.7 9.2 6 12 6C14.8 6 17.2 7.7 17.8 10.1C19.6 10.5 21 12.1 21 14C21 16.2 19.2 18 17 18Z"/>'
  ),
  // Controller glyphs follow the k8s / Argo CD visual LANGUAGE but are ORIGINAL
  // redraws in our monochrome outline style — the raw Argo SVGs are filled
  // silhouettes + multi-colour (and cronjob.svg has a broken clip-path ref), so
  // they were deliberately not vendored (no third-party files → no attribution).
  // Deployment: the rolling-update circular arrow (k8s/Argo deploy motif).
  deployment: icon('<path d="M20 12a8 8 0 1 1-2.34-5.66"/><polyline points="20 3.5 20 7.5 16 7.5"/>'),
  // StatefulSet: a box of ORDERED rows (ordinal dots) — ordered, persistent replicas.
  statefulset: icon(
    '<rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="9.33" x2="20" y2="9.33"/><line x1="4" y1="14.66" x2="20" y2="14.66"/><circle cx="7" cy="6.7" r="0.55"/><circle cx="7" cy="12" r="0.55"/><circle cx="7" cy="17.3" r="0.55"/>'
  ),
  // DaemonSet: one box per node, sitting on a baseline — "a pod on every node".
  daemonset: icon(
    '<rect x="3.3" y="5.5" width="5" height="6" rx="1"/><rect x="9.5" y="5.5" width="5" height="6" rx="1"/><rect x="15.7" y="5.5" width="5" height="6" rx="1"/><line x1="2.5" y1="16.5" x2="21.5" y2="16.5"/>'
  ),
  // Job: a grid of squares (parallel completions, Argo's job motif) + a checkmark.
  job: icon(
    '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><polyline points="14 17.5 16.5 20 20 14.5"/>'
  ),
  // CronJob: a clock — "scheduled job".
  cronjob: icon('<circle cx="12" cy="12" r="8"/><polyline points="12,7.5 12,12 15.5,14"/>'),
  // NetApp aggregate: a database cylinder with two internal layer lines — the pooled
  // disks a FlexVol lands on, distinct from the single-segment pvc cylinder. Always a
  // leaf glyph (an aggregate has no children). Inherits the retired storageclass shape,
  // which occupied the same Storage slot.
  'netapp-aggr': icon(
    '<ellipse cx="12" cy="5.5" rx="7" ry="2.4"/><path d="M5 5.5 v13 a7 2.4 0 0 0 14 0 V5.5"/><path d="M5 9.8 a7 2.4 0 0 0 14 0"/><path d="M5 14.1 a7 2.4 0 0 0 14 0"/>'
  ),
  // NetApp controller: a rack chassis (outer case + two drive bays + status LED) —
  // deliberately rectilinear so it reads apart from the two Storage cylinders (pvc,
  // netapp-aggr) at legend size. It is a REAL node that is also a compound parent, so
  // this glyph is drawn only when COLLAPSED (expanded it is a labelled container with
  // no icon, like a K8s node container — see getStylesheet's node:parent rule).
  'netapp-node': icon(
    '<rect x="3" y="6" width="18" height="12" rx="1.6"/><line x1="6.4" y1="9.6" x2="13" y2="9.6"/><line x1="6.4" y1="14.4" x2="13" y2="14.4"/><circle cx="17.6" cy="9.6" r="1.1"/>'
  ),
  // Virtual switch-fabric group, drawn as a wifi mark (three arcs + dot): reads
  // as "the network". Only ever drawn when the group is COLLAPSED (expanded it
  // is a labelled container with no icon). Legend follows deriveLegendKinds:
  // collapsing the group swaps `switch` → `network` in the node-kinds legend,
  // like netapp-node ⇄ netapp-aggr.
  network: icon(
    '<path d="M3.5 11.5 a12 12 0 0 1 17 0 M6.5 14.5 a7.8 7.8 0 0 1 11 0 M9.4 17.3 a3.7 3.7 0 0 1 5.2 0"/><circle cx="12" cy="19.8" r="1.1"/>'
  ),
};

// Folder glyph for a COLLAPSED decorative group (cluster / namespace / application).
// These synthetic groups are NOT `NodeKind`s, so this lives outside ICON_SVG_BY_KIND;
// getStylesheet paints it (tinted by the group's accent) only on the collapsed-node
// selectors. A folded decorative group is otherwise an icon-less coloured box —
// kind-ful compounds (controller / node / netapp-node) already revert to their kind
// icon when folded. Classic folder: a tabbed body.
export const FOLDER_ICON_SVG = icon(
  '<path d="M3.5 6.8 A1.6 1.6 0 0 1 5.1 5.2 H9 a1.2 1.2 0 0 1 .85 .35 L11.4 7.1 a1.2 1.2 0 0 0 .85 .35 H18.9 A1.6 1.6 0 0 1 20.5 9.05 V17.4 A1.6 1.6 0 0 1 18.9 19 H5.1 A1.6 1.6 0 0 1 3.5 17.4 Z"/>'
);

// Drawn for any kind not in the map, so upstream/backend additions never vanish.
export const FALLBACK_ICON_SVG = icon(
  '<rect x="4.5" y="4.5" width="15" height="15" rx="2.5"/><line x1="4.5" y1="9.5" x2="19.5" y2="9.5"/>'
);

export function iconSvgForKind(kind: string | undefined): string {
  // Object.hasOwn, NOT `in`: `in` walks the prototype chain, so a backend kind
  // named after an Object.prototype member ('toString', 'constructor', …) would
  // return an inherited Function instead of an SVG string and crash the tinter.
  if (kind !== undefined && Object.hasOwn(ICON_SVG_BY_KIND, kind)) {
    const svg = ICON_SVG_BY_KIND[kind as NodeKind];
    if (svg !== undefined) {
      return svg;
    }
  }
  return FALLBACK_ICON_SVG;
}
