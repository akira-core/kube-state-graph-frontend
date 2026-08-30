import { DARK_TOKENS } from '../theme/tokens';

import type { EdgeType, NodeKind } from './types';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

// How the edge routes on canvas. 'taxi' = orthogonal right-angle channels (the
// physical switch fabric); everything else is a direct bezier. A REQUIRED field
// so a new edge type cannot silently fall back to the wrong routing — the
// stylesheet derives its taxi selector from this map (no hardcoded type lists).
export type EdgeRouting = 'bezier' | 'taxi';

export interface EdgeStyle {
  color: string;
  lineStyle: LineStyle;
  routing: EdgeRouting;
}

// Source → target node kinds for each edge type. The legend renders an edge type
// as `<from> → <to>` (the arrow replacing the verb), so it needs the endpoints
// explicitly rather than parsing the hyphenated wire string. Single source of
// truth, keyed by the same `data.type` enum as `EDGE_STYLE_BY_TYPE`. Every D6 edge
// connects two real NodeKinds (no synthetic controller endpoints).
export interface EdgeEndpoints {
  from: NodeKind;
  to: NodeKind;
}

export const EDGE_ENDPOINTS_BY_TYPE: Record<EdgeType, EdgeEndpoints> = {
  'pod-to-node': { from: 'pod', to: 'node' },
  'pod-mounts-pvc': { from: 'pod', to: 'pvc' },
  'pod-calls-pod': { from: 'pod', to: 'pod' },
  'pod-calls-service': { from: 'pod', to: 'service' },
  'service-selects-pod': { from: 'service', to: 'pod' },
  'pvc-to-netapp-aggr': { from: 'pvc', to: 'netapp-aggr' },
  'switch-to-switch': { from: 'switch', to: 'switch' },
  'node-to-switch': { from: 'node', to: 'switch' },
};

// Which edge types carry REQUEST TRAFFIC (as opposed to placement, storage or
// physical-link relationships). Consumed by normalize's ingress-path dashing: an
// edge is on the ingress traffic path only if it touches an ingress node AND its
// type is traffic — otherwise the ingress pod's own pod-to-node / pod-mounts-pvc
// edges would be dashed too, which claims a traffic detour that does not exist.
// An exhaustive `Record<EdgeType, boolean>` (like EDGE_ENDPOINTS_BY_TYPE) so a new
// edge type cannot silently pick a side — TypeScript demands the key. Unmapped
// backend types resolve to `undefined` and are treated as NON-traffic by the
// consumer (`?? false`): a dash asserts something, and an unknown type cannot be
// asserted. That differs from the filter's unknown-visible rule on purpose —
// withholding a dash hides nothing.
export const EDGE_IS_TRAFFIC_BY_TYPE: Record<EdgeType, boolean> = {
  'pod-calls-pod': true,
  'pod-calls-service': true,
  'service-selects-pod': true,
  'pod-to-node': false,
  'pod-mounts-pvc': false,
  'pvc-to-netapp-aggr': false,
  'switch-to-switch': false,
  'node-to-switch': false,
};

// The safe read of the map above: an unmapped backend type (GraphEdgeType widens to
// string) is reported as non-traffic. Keeping the lookup here means no consumer has to
// reproduce the fallback.
//
// Object.hasOwn, not a bare index + `?? false`: the backend type string is untrusted
// (normalize copies `data.type` verbatim, no allow-list), so a type named after an
// Object.prototype member — `constructor`, `toString`, `valueOf` — would otherwise
// resolve to the INHERITED function, which is truthy and never `undefined`, and get
// dashed as gateway traffic. Same guard as resolveEdgeStyle in getStylesheet.
export function isTrafficEdgeType(type: string | undefined): boolean {
  if (type === undefined || !Object.hasOwn(EDGE_IS_TRAFFIC_BY_TYPE, type)) {
    return false;
  }
  return (EDGE_IS_TRAFFIC_BY_TYPE as Record<string, boolean>)[type] === true;
}

// Single source of truth for edge styling, keyed by upstream edge `data.type`,
// covering ALL wire edge types (D6 — every type is backend-emitted). The stylesheet
// resolves a colour/line-style per edge from this map regardless of mode — styling an
// edge type that has no edges in the current view is harmless. `pod-to-node` only
// appears as a drawn edge in the default `controller` pod-parent mode; in `node`
// (infra) mode the panel expresses it as compound nesting (design D7) so no such edge
// exists. Which types are *drawn* (and shown in the legend) per mode is derived by
// `drawnEdgeTypesForMode`.
// Every TYPE here is SOLID — direction is conveyed by the arrowhead, and same-direction
// distinctions by colour. Same-colour pairs (pod→service / service→pod share orange) differ
// only by arrow direction. EXCEPTION — two per-EDGE dash overlays, both meaning "this is a
// network hop through a middlebox, not the thing the pod actually depends on":
//   * `data.ingressPath` (derived by normalize's markIngressEdges from endpoint membership
//     + traffic type) → `edge[?ingressPath]`
//   * `data.relation === 'transport'` (given by the backend on service-graph edges, hoisted
//     verbatim by normalize) → `edge[relation = "transport"]`
// Both override `line-style` to dashed for those specific edges only, driven by per-edge
// data rather than a per-TYPE property. This map still owns colour/routing/base line-style
// for every type.
export const EDGE_STYLE_BY_TYPE: Record<EdgeType, EdgeStyle> = {
  // Pod → K8s node (backend D6). Blue (#3b82f6), the old node-edge hue.
  'pod-to-node': { color: DARK_TOKENS.edge['pod-to-node'], lineStyle: 'solid', routing: 'bezier' },
  'pod-mounts-pvc': { color: DARK_TOKENS.edge['pod-mounts-pvc'], lineStyle: 'solid', routing: 'bezier' },
  'pod-calls-pod': { color: DARK_TOKENS.edge['pod-calls-pod'], lineStyle: 'solid', routing: 'bezier' },
  // Service edges (pod→service / service→pod) share the SAME orange (#f97316) as
  // pod-calls-pod: a pod→service→pod hop is conceptually still a pod-to-pod
  // relationship, just with the Service as an extra layer. They are also OMITTED from
  // the edge legend (the single `pod ↔ pod/service` row covers them) — see EdgeLegend. (Was
  // green #10b981, which collided with the status-normal green border, then briefly
  // indigo; unified to the pod-calls-pod colour per the "still pod-to-pod" model.)
  'pod-calls-service': { color: DARK_TOKENS.edge['pod-calls-service'], lineStyle: 'solid', routing: 'bezier' },
  'service-selects-pod': { color: DARK_TOKENS.edge['service-selects-pod'], lineStyle: 'solid', routing: 'bezier' },
  // PVC → NetApp aggregate: the claim's physical landing spot. Violet (#8b5cf6),
  // DELIBERATELY distinct from pod-mounts-pvc's #a855f7 so the two storage edges read
  // apart; not the reserved status red, and clear of node-edge blue / service orange.
  // Inherits both the colour and the position of the retired pvc-to-storageclass.
  'pvc-to-netapp-aggr': { color: DARK_TOKENS.edge['pvc-to-netapp-aggr'], lineStyle: 'solid', routing: 'bezier' },
  // Physical network fabric (backend v0.0.18). Both switch↔switch and node→switch
  // share the cyan infra colour + taxi routing — separating them by colour added
  // confusion without benefit now that direction is already conveyed by arrowhead.
  'switch-to-switch': { color: DARK_TOKENS.edge['switch-to-switch'], lineStyle: 'solid', routing: 'taxi' },
  'node-to-switch': { color: DARK_TOKENS.edge['node-to-switch'], lineStyle: 'solid', routing: 'taxi' },
};

export const FALLBACK_EDGE_STYLE: EdgeStyle = {
  color: DARK_TOKENS.edge.fallback,
  lineStyle: 'solid',
  routing: 'bezier',
};

// The network-hop dash overlay, shared by BOTH dashed cases (ingress path and
// `relation: transport`) so they read as one idea rather than two coincidences. One
// shared pattern also means an edge that is both ingress-path AND transport gets
// identical values from either stylesheet rule, so their declaration order is not
// load-bearing. Wider than cytoscape's default 6/3 so the dashing still reads as dashed
// when zoomed out.
export const NETWORK_HOP_DASH_PATTERN: readonly [number, number] = [8, 8];

// The same overlay rendered at LEGEND scale. The canvas rhythm is sized for edges that
// span the viewport; the legend glyph gives it a 14-unit line (the bidirectional row
// starts at x=8 to clear the second arrowhead), which fits one 8-unit dash and nothing
// else — the key read as a solid stub. Scaled to four dashes inside the glyph, since what
// the row has to communicate is "this stroke is dashed", not the on-canvas dash length.
// Deliberately NOT derived from the canvas pattern: the two answer different questions and
// a shared value would re-break one of them the next time the other is tuned.
//
// Only legible because EdgeGlyph draws dashed lines with a BUTT linecap — under the round
// cap it uses elsewhere, every dash grows by the stroke width and a 2-unit gap closes to
// nothing, which is what made the 8/8 rhythm read as one unbroken stub in the first place.
export const NETWORK_HOP_LEGEND_DASH_PATTERN: readonly [number, number] = [2, 2];
