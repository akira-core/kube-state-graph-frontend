// The optional edge label the backend puts on service-graph edges:
// `labels.relation`. Three states, all on the SAME edge types (no new edge type):
//
//   'link'      logical dependency — a producer reaches a consumer through a broker,
//               derived from cross-trace span links. Solid: it is the real dependency.
//   'transport' network dependency — the pod's actual connection to the broker.
//               Dashed: the pod connects here, but this is not what it depends on.
//   absent      ordinary RPC edge. Solid, unchanged.
//
// Same shape as ingressGateway.ts: if the backend renames the label or adds a value,
// this file is the only place to touch. `link` is exported for completeness and for
// tests that pin "logical dependency stays solid" — no styling reads it today.
export const RELATION_LABEL_KEY = 'relation';
export const EDGE_RELATION_TRANSPORT = 'transport';
export const EDGE_RELATION_LINK = 'link';
