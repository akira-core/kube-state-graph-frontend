import type { EdgeType, PodParentMode } from './types';

// The edge types actually drawn (and listed in the legend) for each pod-parent
// mode (backend D6 — all edges are backend-emitted, no synthetics). In the default
// `controller` mode the backend payload is consumed as-is: pods nest under their
// controller and `pod-to-node` is a DRAWN edge. In `node` (infra) mode the pod↔node
// relationship becomes compound nesting, so applyPodParentMode drops every
// `pod-to-node` edge and the drawn-set excludes it. `pvc-to-netapp-aggr` and the
// service edges (`service-selects-pod` / `pod-calls-service`) are drawn in BOTH modes.
//
// `switch-to-switch` / `node-to-switch` are physical network-fabric edges
// (backend v0.0.18) involving neither pods nor controllers, so they are drawn in
// BOTH modes.
const SWITCH_EDGES = ['switch-to-switch', 'node-to-switch'] as const;
const DRAWN_BY_MODE: Record<PodParentMode, readonly EdgeType[]> = {
  node: [
    'pod-mounts-pvc',
    'pod-calls-pod',
    'pod-calls-service',
    'service-selects-pod',
    'pvc-to-netapp-aggr',
    ...SWITCH_EDGES,
  ],
  controller: [
    'pod-mounts-pvc',
    'pod-calls-pod',
    'pod-calls-service',
    'service-selects-pod',
    'pod-to-node',
    'pvc-to-netapp-aggr',
    ...SWITCH_EDGES,
  ],
};

export function drawnEdgeTypesForMode(mode: PodParentMode): EdgeType[] {
  return [...DRAWN_BY_MODE[mode]];
}
