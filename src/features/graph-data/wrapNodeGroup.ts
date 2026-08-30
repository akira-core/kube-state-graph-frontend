import type cytoscape from 'cytoscape';

// Stable synthetic id prefix + label for the panel-synthesized node group. The prefix is
// namespaced so it cannot collide with backend node ids in practice; on the off chance it
// does, synthesis backs off entirely (see below).
const ID_PREFIX = 'node-group/';
const GROUP_LABEL = 'nodes';

// The kind whose elements get boxed. Only the K8s machine — `netapp-node` is a storage
// resource that merely shares the word, and lives under its ONTAP cluster.
const GROUPED_KIND = 'node';

interface NodeDataView {
  id?: string;
  kind?: string;
  parent?: string;
  isNodeGroup?: boolean;
  source?: string;
  target?: string;
}

function isNodeElement(element: cytoscape.ElementDefinition, data: NodeDataView): boolean {
  if (element.group === 'nodes') {
    return true;
  }
  if (element.group === 'edges') {
    return false;
  }
  // group omitted: infer — an edge always carries source + target.
  return data.source === undefined && data.target === undefined;
}

// Fresh `data` per element: cytoscape ALIASES the `data` handed to `cy.add` (no deep-copy)
// and expand-collapse mutates it in place, so a view transform must never hand back an
// object the caller still holds. Same rule as applyPodParentMode's cloneElement.
function cloneElement(element: cytoscape.ElementDefinition): cytoscape.ElementDefinition {
  return { ...element, data: { ...element.data } };
}

// One group per bucket; the parent-less bucket keyed on '' so the Map needs no undefined key.
function groupIdFor(parentId: string): string {
  return `${ID_PREFIX}${parentId}`;
}

/**
 * Insert a panel-synthesized compound between each K8s `node` and the parent it currently
 * has, so the rendered hierarchy reads `cluster > node group > node` (and, in `node`
 * pod-parent mode, `cluster > node group > node > pod`).
 *
 * Grouping is keyed on the node's CURRENT parent — the parent chain is what cytoscape
 * renders and the only key correct in both pod-parent modes. Nodes sharing a parent share a
 * group; each distinct parent gets its own; a parent-less node gets a top-level group. There
 * is deliberately NO size threshold: a lone node is grouped too, so a cluster does not change
 * shape (and lose the user's collapse state for that box) the moment its second node appears.
 *
 * The group is kind-less, carries no status / worstStatus / alerts, and never opts out of
 * selection — the expand-collapse `+`/`-` cue is drawn only on a SELECTED parent, and folding
 * the group is the point of it. It has no accent field either: the stylesheet's parent-chain
 * walk gives it its cluster's colour.
 *
 * Backs off — returning a clone of the input, nothing re-parented — when:
 * - no `node`-kind element is present (nothing to group), or
 * - an element already occupies an id this pass would generate, or already carries
 *   `isNodeGroup` (something else owns the grouping).
 *
 * The back-off is wholesale rather than per-bucket: a half-synthesized hierarchy would be
 * harder to reason about than none at all.
 *
 * MUST run after applyPodParentMode — that pass walks the ORIGINAL parent chain to find each
 * element's cluster ancestor, and would trip over a tier inserted ahead of it. Pure; never
 * mutates the input.
 */
export function wrapNodeGroup(elements: readonly cytoscape.ElementDefinition[]): cytoscape.ElementDefinition[] {
  // Bucket key: the node's parent id, or '' for the parent-less bucket.
  const nodeIdsByBucket = new Map<string, string[]>();
  const takenIds = new Set<string>();
  let hasForeignGroup = false;

  for (const element of elements) {
    const data = element.data as NodeDataView;
    if (!isNodeElement(element, data)) {
      continue;
    }
    if (data.isNodeGroup === true) {
      hasForeignGroup = true;
      break;
    }
    if (typeof data.id === 'string') {
      takenIds.add(data.id);
    }
    if (data.kind !== GROUPED_KIND || typeof data.id !== 'string') {
      continue;
    }
    const bucket = typeof data.parent === 'string' ? data.parent : '';
    const members = nodeIdsByBucket.get(bucket);
    if (members === undefined) {
      nodeIdsByBucket.set(bucket, [data.id]);
    } else {
      members.push(data.id);
    }
  }

  if (hasForeignGroup || nodeIdsByBucket.size === 0) {
    return elements.map(cloneElement);
  }
  if ([...nodeIdsByBucket.keys()].some((bucket) => takenIds.has(groupIdFor(bucket)))) {
    return elements.map(cloneElement);
  }

  // id of the group each grouped node moves into.
  const groupIdByNodeId = new Map<string, string>();
  const wrappers: cytoscape.ElementDefinition[] = [];
  for (const [bucket, memberIds] of nodeIdsByBucket) {
    const groupId = groupIdFor(bucket);
    for (const memberId of memberIds) {
      groupIdByNodeId.set(memberId, groupId);
    }
    wrappers.push({
      group: 'nodes',
      data: {
        id: groupId,
        label: GROUP_LABEL,
        isNodeGroup: true,
        ...(bucket === '' ? {} : { parent: bucket }),
      },
    });
  }

  const wrapped = elements.map((element) => {
    const data = element.data as NodeDataView;
    const groupId = typeof data.id === 'string' ? groupIdByNodeId.get(data.id) : undefined;
    if (groupId === undefined) {
      return cloneElement(element);
    }
    return { ...element, data: { ...element.data, parent: groupId } };
  });

  return [...wrappers, ...wrapped];
}
