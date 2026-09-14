import type { TraceNode } from './types';

/**
 * The three horizontal bands of the drawing, in trace order (the start hop's side first):
 *   switch  — the anchor and every switch hop, laid out by longest path with tier locking
 *   k8s     — the fixed chain k8s node → pod → application → namespace (upper partition)
 *   client  — every non-k8s trace stop (`host`, `router`, a neighbourless port …), drawn as
 *             the lower partition of the k8s band's last column
 *   owner   — the owner cards, one column after the k8s band
 * Storage hops (`netapp-*`, `pvc`) have no place in a network trace and fall into the switch
 * band; the spec only promises that a storage body draws as no-flow hops.
 */
export type TraceBand = 'switch' | 'k8s' | 'client' | 'owner';

/** The k8s band's sub-columns, left to right under a destination trace. */
export const K8S_SUBCOLS = ['node', 'pod', 'app', 'ns'] as const;
export type K8sSubcol = (typeof K8S_SUBCOLS)[number];

export function bandOf(n: TraceNode): TraceBand {
  if (n.kind === 'anchor') {
    return 'switch';
  }
  if (n.kind === 'node') {
    return n.role === 'node' || n.role === 'pod' ? 'k8s' : 'switch';
  }
  switch (n.role) {
    case 'pod':
    case 'app':
    case 'ns':
      return 'k8s';
    case 'owner':
      return 'owner';
    default:
      return 'client';
  }
}

/** The k8s sub-column a card takes; `null` outside the k8s band. A proxy pod hop sits with the pods. */
export function k8sSubcol(n: TraceNode): K8sSubcol | null {
  if (bandOf(n) !== 'k8s') {
    return null;
  }
  if (n.kind === 'node') {
    return n.role === 'node' ? 'node' : 'pod';
  }
  return n.role === 'app' ? 'app' : n.role === 'ns' ? 'ns' : 'pod';
}

/** Lower partition of a k8s-band column: the non-k8s trace stops. */
export function isClientPartition(n: TraceNode): boolean {
  return bandOf(n) === 'client';
}
