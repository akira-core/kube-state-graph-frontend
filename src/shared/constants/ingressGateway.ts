// The backend marks an ingress node with `labels.role`. Single source for the
// element-filter's ingress predicate, the normalize dashing pass, and their tests — if
// the backend renames the label, this file is the only place to touch.
export const INGRESS_LABEL_KEY = 'role';

// The RouteHit chain's entry hop: the LB Service in front of the istio ingressgateway.
// Gateway pods and a synthesized hop to the backend service sit behind it, AND the
// backend also emits the direct caller → backend edge, so this whole shape can be hidden
// without losing a dependency. THIS is the value that drives the ingress toggle and the
// dashed traffic path.
export const INGRESS_LABEL_VALUE = 'ingress-gateway';

// The nginx (non-Istio LB) fallback destination. Deliberately NOT part of the ingress set:
// nothing is routed behind it, so the caller's edge to it is the caller's ONLY dependency
// edge. Hiding it would erase that dependency outright, and dashing it would assert a
// detour around a direct edge that does not exist. Declared here so the exclusion is a
// recorded decision rather than an accident of exact string matching.
export const INGRESS_LB_LABEL_VALUE = 'ingress-lb';
