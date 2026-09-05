import type cytoscape from 'cytoscape';

import type { PodParentMode } from '../../shared/constants/types';

// Fresh `data` per element: cytoscape ALIASES the `data` we hand `cy.add` (no
// deep-copy) and expand-collapse mutates `data.source`/`target` in place when a
// controller collapses — passing baseElements by reference would corrupt them.
// See pod-parent-mode spec ("每個 元素 MUST 為全新且彼此獨立的物件").
function cloneElement(el: cytoscape.ElementDefinition): cytoscape.ElementDefinition {
  return { ...el, data: { ...el.data } };
}

/**
 * Re-shape the backend D6 hierarchy for the given pod-parent mode (pure, immutable —
 * every returned element is a fresh object, see cloneElement). The hierarchy is
 * backend-owned, so:
 *
 *  - `controller` (default): identity clone of the payload — pods stay nested under
 *    their backend `controller` group (cluster > namespace > application > controller >
 *    pod) and `pod-to-node` stays a drawn edge. No re-parenting, no edge synthesis.
 *  - `node` (infra view): re-parent each pod under its K8s node (`labels.node`, only
 *    when that id is a present `node`-kind node; otherwise leave it under its cluster),
 *    DROP the `namespace` / `application` / `controller` group tiers and re-parent their
 *    non-pod members (`pvc` / `service`) directly under the cluster, and
 *    DROP every `pod-to-node` edge (the relationship is now nesting). Result =
 *    `cluster > node > pod`. Service / storage edges are preserved.
 *
 *  The physical storage chain (`storage-cluster > netapp-node > netapp-aggr`) survives BOTH
 *  modes untouched: `storage-cluster` is not one of the dropped workload tiers, and the two
 *  NetApp kinds are real nodes rather than groups. In `node` mode the pvc re-homes under its
 *  cluster while its aggregate stays put, so the `pvc-to-netapp-aggr` edge crosses two
 *  top-level boxes — correct, since the storage genuinely lives outside the K8s cluster.
 *
 * Full rules in pod-parent-mode spec.
 */
export function applyPodParentMode(
  elements: cytoscape.ElementDefinition[],
  mode: PodParentMode
): cytoscape.ElementDefinition[] {
  if (mode === 'controller') {
    return elements.map(cloneElement);
  }

  // node mode — index the graph for re-parenting + group teardown.
  const dataById = new Map<string, Record<string, unknown>>();
  const nodeKindIds = new Set<string>();
  const clusterIds = new Set<string>();
  const droppedGroupIds = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as Record<string, unknown>;
    if (typeof d.id !== 'string') {
      continue;
    }
    dataById.set(d.id, d);
    if (d.kind === 'node') {
      nodeKindIds.add(d.id);
    }
    if (d.isCluster === true) {
      clusterIds.add(d.id);
    }
    if (d.isNamespace === true || d.isApplication === true || d.isController === true) {
      droppedGroupIds.add(d.id);
    }
  }

  // Nearest `isCluster` ancestor via the ORIGINAL parent chain (intact even though the
  // workload group tiers are about to be dropped). undefined → no cluster (top-level).
  const clusterAncestor = (startId: string): string | undefined => {
    let parent =
      typeof dataById.get(startId)?.parent === 'string' ? (dataById.get(startId)?.parent as string) : undefined;
    for (let guard = 0; parent !== undefined && guard <= dataById.size; guard++) {
      if (clusterIds.has(parent)) {
        return parent;
      }
      const pd = dataById.get(parent);
      parent = typeof pd?.parent === 'string' ? pd.parent : undefined;
    }
    return undefined;
  };

  const result: cytoscape.ElementDefinition[] = [];
  for (const el of elements) {
    if (el.group === 'edges') {
      const ed = el.data as Record<string, unknown>;
      // pod-to-node is expressed as nesting in node mode — drop it; keep all other edges.
      if (ed.edgeType === 'pod-to-node') {
        continue;
      }
      // Any edge anchored on a group tier this mode just deleted would reach cy.add with a
      // nonexistent endpoint, and cytoscape THROWS ("Can not create edge with nonexistant
      // source/target"), taking the whole canvas down. `edgeType` is free-form on the wire,
      // so filtering by type alone is not enough — check the endpoints that actually survive.
      if (
        (typeof ed.source === 'string' && droppedGroupIds.has(ed.source)) ||
        (typeof ed.target === 'string' && droppedGroupIds.has(ed.target))
      ) {
        continue;
      }
      result.push(cloneElement(el));
      continue;
    }
    const d = el.data as Record<string, unknown>;
    const id = typeof d.id === 'string' ? d.id : undefined;
    if (id !== undefined && droppedGroupIds.has(id)) {
      continue; // drop namespace / application / controller group tiers
    }

    let nextParent: string | undefined = typeof d.parent === 'string' ? d.parent : undefined;
    if (d.kind === 'pod') {
      const labels = d.labels as Record<string, unknown> | undefined;
      const labelNode = labels !== undefined && typeof labels.node === 'string' ? labels.node : undefined;
      // Re-parent to the K8s node only when it actually exists; else fall back to cluster.
      nextParent =
        labelNode !== undefined && nodeKindIds.has(labelNode)
          ? labelNode
          : id !== undefined
            ? clusterAncestor(id)
            : undefined;
    } else if (nextParent !== undefined && droppedGroupIds.has(nextParent) && id !== undefined) {
      // pvc / service orphaned by a dropped group → re-home under cluster.
      nextParent = clusterAncestor(id);
    }

    const nextData: Record<string, unknown> = { ...d };
    if (nextParent === undefined) {
      delete nextData.parent;
    } else {
      nextData.parent = nextParent;
    }
    result.push({ ...el, data: nextData });
  }

  return result;
}
