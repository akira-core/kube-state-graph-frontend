import type { GraphNodeKind, NodeKind } from './types';

// The leaf node kinds the backend resolves an ArgoCD `application` for (design D6):
// `pod` (from kube_pod_owner's argocd_tracking_id) plus `service` / `pvc` (from their
// annotation_argocd_argoproj_io_tracking_id). This is the SINGLE source of that
// membership — `normalizeGraph`'s passthrough gate and the node-detail lightweight
// Application row both derive from it, so the set cannot drift across files (and a
// future application-bearing kind is one edit here, not three).
//
// Typed `ReadonlySet<GraphNodeKind>` (mirroring DETAIL_URL_KINDS) so a caller can
// membership-test a raw graph kind — which may be an unknown backend string — without
// casting; an unknown kind simply isn't a member. Note this set is deliberately NOT a
// CATEGORY_BY_KIND derivation: application-bearing leaves span Workloads (pod),
// Networking (service) and Storage (pvc), so the membership is enumerated, not derived.
export const APPLICATION_BEARING_KINDS: ReadonlySet<GraphNodeKind> = new Set<NodeKind>(['pod', 'service', 'pvc']);
