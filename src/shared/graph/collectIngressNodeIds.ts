import type cytoscape from 'cytoscape';

import { INGRESS_LABEL_KEY, INGRESS_LABEL_VALUE } from '../constants/ingressGateway';
import { isPlainObject } from '../guards/isPlainObject';

import { buildChildrenByParent, collectDescendantIds } from './childrenByParent';

// THE ingress-gateway node set — single source of truth shared by the element-filter
// (hides this set when the toggle is off) and the graph-data normalize pass (dashes the
// edges touching it). Both consumers MUST see the same set: a node the toggle can hide but
// whose edges never dash — or vice versa — is a contradiction the user can see on canvas.
//
// Three derivations, in order:
//   1. LABELLED — any node (any kind) whose `data.labels` carries the backend-guaranteed
//      marker. Authoritative: an operator that labels a node has declared it a gateway.
//      The match is on the ONE `ingress-gateway` value, exactly — not a prefix and not a
//      "looks ingress-ish" test. The backend marks a second shape with the same key,
//      `ingress-lb` (the nginx fallback destination), which MUST stay out of this set:
//      nothing is routed behind it, so the caller's edge to it is that caller's only
//      dependency edge. See INGRESS_LB_LABEL_VALUE for the full rationale.
//   2. NESTED — every transitive descendant of a labelled node. The label is not
//      kind-restricted, so it can land on a compound (controller / application group);
//      everything inside such a group is part of the gateway it names.
//   3. SELECTED — the pods a labelled-or-nested service reaches over `service-selects-pod`.
//      One level only, NO transitive closure: a pod added here never seeds further
//      expansion. Unlike (1) this membership is INFERRED, so it yields to the
//      shared-selector exemption below.
export function collectIngressNodeIds(elements: cytoscape.ElementDefinition[]): Set<string> {
  const ids = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    const labels = data.labels;
    if (typeof id === 'string' && isPlainObject(labels) && labels[INGRESS_LABEL_KEY] === INGRESS_LABEL_VALUE) {
      ids.add(id);
    }
  }
  // No label anywhere → done before touching the edges (the overwhelmingly common case:
  // the backend has no generic labels contract, so most graphs never carry the marker).
  if (ids.size === 0) {
    return ids;
  }

  // (2) Fold each labelled compound's subtree in. Done BEFORE the expansion pass so a
  // service nested inside a labelled group also seeds (3) — it is as much a part of the
  // gateway as one carrying the label directly.
  for (const descendantId of collectDescendantIds(buildChildrenByParent(elements), ids)) {
    ids.add(descendantId);
  }

  // Snapshot: expansion reads this, never the growing `ids`, so a pod added by (3) cannot
  // seed further expansion (single level, not a closure).
  const seeds = new Set(ids);

  // A pod that a NON-seed service also selects still serves that other traffic, so
  // inferring gateway membership for it would be wrong twice over: hiding the toggle would
  // remove a pod unrelated to the gateway, and markIngressEdges would dash the unrelated
  // service's edge to it as if that traffic detoured via the gateway. Only (3) yields —
  // an explicitly labelled or nested node stays in the set regardless of who else selects
  // it, because there the membership is declared rather than inferred.
  const alsoSelectedByNonSeed = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'edges') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    if (data.edgeType !== 'service-selects-pod') {
      continue;
    }
    const { source, target } = data;
    if (typeof source === 'string' && typeof target === 'string' && !seeds.has(source)) {
      alsoSelectedByNonSeed.add(target);
    }
  }

  for (const el of elements) {
    if (el.group !== 'edges') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    if (data.edgeType !== 'service-selects-pod') {
      continue;
    }
    const { source, target } = data;
    if (
      typeof source === 'string' &&
      typeof target === 'string' &&
      seeds.has(source) &&
      !alsoSelectedByNonSeed.has(target)
    ) {
      ids.add(target);
    }
  }
  return ids;
}
