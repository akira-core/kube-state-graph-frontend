import type cytoscape from 'cytoscape';

import { EDGE_STYLE_BY_TYPE } from '../../shared/constants/colorByEdgeType';
import { ICON_SVG_BY_KIND } from '../../shared/constants/iconSvgByKind';
import type { EdgeType, NodeKind } from '../../shared/constants/types';
import { buildChildrenByParent, collectDescendantIds } from '../../shared/graph/childrenByParent';
import { collectIngressNodeIds } from '../../shared/graph/collectIngressNodeIds';

export interface VisibilitySets {
  visibleNodeIds: Set<string>;
  visibleEdgeIds: Set<string>;
}

const KNOWN_KINDS = new Set<string>(Object.keys(ICON_SVG_BY_KIND));
const KNOWN_EDGE_TYPES = new Set<string>(Object.keys(EDGE_STYLE_BY_TYPE));

// THE filterable-kind universe — the single predicate behind the kind filter
// here, the visibleKinds option default (ALL_KINDS) and the legend eye toggles
// (deriveLegendEntries). Two exemptions, both always-visible and untogglable:
//   - the `network` virtual fabric wrapper: cytoscape's effective visibility is
//     the AND of an element and all its ancestors, so hiding the wrapper would
//     hide every switch nested inside it (e.g. via a visibleKinds list saved
//     before the kind existed). An emptied wrapper still disappears through the
//     orphan cascade when its switches are filtered out.
//   - unknown kinds: the filter universe only covers known kinds, so a backend
//     addition must not silently disappear.
// The narrowing excludes `network` so a NodeKind-typed input keeps a sound
// (reachable) false branch.
export function isFilterableKind(kind: string): kind is Exclude<NodeKind, 'network'> {
  return kind !== 'network' && KNOWN_KINDS.has(kind);
}

function nodeIsVisible(kind: unknown, visibleKinds: Set<NodeKind>): boolean {
  if (typeof kind !== 'string') {
    return true;
  }
  return !isFilterableKind(kind) || visibleKinds.has(kind);
}

export function computeVisibility(
  elements: cytoscape.ElementDefinition[],
  visibleKinds: NodeKind[],
  visibleEdgeTypes: EdgeType[],
  showIngress = true,
  // Precomputed ingress-node set. Load-bearing for CORRECTNESS, not just speed: the panel
  // derives it from the PRE-view-transform elements so the set survives a pod-parent mode
  // flip (which strips the very controller / application groups the label may sit on),
  // whereas self-computing here would read the already-transformed `elements` and could
  // come back empty. It also spares a second full-element scan on every unrelated
  // kind/edge-type toggle. Omit to self-compute (tests, isolated use).
  ingressNodeIds?: ReadonlySet<string>,
  // Ids of nodes that carry at least one incident edge in the BASELINE graph — the
  // normalize-boundary output, before any view transform or filter. Load-bearing for
  // CORRECTNESS, same as ingressNodeIds: `node` mode drops every `pod-to-node` edge from
  // `elements`, so a pod whose only link was that edge looks edge-less HERE while it is
  // plainly connected upstream. The cascade keeps such a leaf (its edge was hidden by the
  // UI) and drops a leaf the backend never connected at all — a distinction that cannot be
  // made from the post-transform element set. Omit to self-compute from `elements` (tests,
  // isolated use); that fallback CANNOT see edges a view transform already removed.
  baselineEdgeNodeIds?: ReadonlySet<string>
): VisibilitySets {
  const kindSet = new Set<NodeKind>(visibleKinds);
  const edgeTypeSet = new Set<EdgeType>(visibleEdgeTypes);
  const visibleNodeIds = new Set<string>();
  const visibleEdgeIds = new Set<string>();
  // When the toggle is off, hide the whole ingress-gateway path; edge hiding + the orphan
  // cascade handle the rest. collectIngressNodeIds already folded in the descendants it
  // could see, but it ran against a DIFFERENT nesting than the one on screen: the panel
  // feeds it the backend hierarchy (pods under their controller), while `elements` here is
  // the current view (in node mode, pods re-parented under their K8s node). Re-fold against
  // the view so a labelled container hides what is nested inside it HERE — cytoscape's
  // effective visibility is the AND over ancestors, so those children vanish from canvas
  // either way, and a visibleNodeIds that disagreed would open the detail panel for an
  // off-canvas node and keep an emptied container out of the orphan cascade.
  const ingressHiddenSeed = showIngress ? new Set<string>() : (ingressNodeIds ?? collectIngressNodeIds(elements));
  const childrenByParent = buildChildrenByParent(elements);
  const ingressHiddenIds =
    ingressHiddenSeed.size === 0
      ? ingressHiddenSeed
      : new Set([...ingressHiddenSeed, ...collectDescendantIds(childrenByParent, ingressHiddenSeed)]);

  // Kind-filtered COMPOUND nodes hide their whole subtree, exactly like the ingress pass
  // above and for the same reason: cytoscape's effective visibility is the AND over
  // ancestors, so the children vanish from canvas regardless. A visibleNodeIds that
  // disagreed would let search offer to locate them and the detail panel open for a node
  // that is not on screen, and would keep an emptied container out of the orphan cascade.
  const kindHiddenSeed = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    if (typeof id !== 'string') {
      continue;
    }
    if (!nodeIsVisible(data.kind, kindSet)) {
      kindHiddenSeed.add(id);
    }
  }
  const kindHiddenIds =
    kindHiddenSeed.size === 0
      ? kindHiddenSeed
      : new Set([...kindHiddenSeed, ...collectDescendantIds(childrenByParent, kindHiddenSeed)]);

  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    if (typeof id !== 'string') {
      continue;
    }
    if (ingressHiddenIds.has(id) || kindHiddenIds.has(id)) {
      continue;
    }
    visibleNodeIds.add(id);
  }

  for (const el of elements) {
    if (el.group !== 'edges') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    const source = data.source;
    const target = data.target;
    if (typeof id !== 'string' || typeof source !== 'string' || typeof target !== 'string') {
      continue;
    }
    if (!visibleNodeIds.has(source) || !visibleNodeIds.has(target)) {
      continue;
    }
    const edgeType = data.edgeType;
    // Unknown edge types default VISIBLE (they render in the fallback gray style),
    // mirroring the unknown-kind rule above: the filter universe only covers known
    // types, so a backend addition must not silently disappear — nor drag its
    // endpoint nodes down with it through the orphan cascade.
    if (typeof edgeType !== 'string' || !KNOWN_EDGE_TYPES.has(edgeType) || edgeTypeSet.has(edgeType as EdgeType)) {
      visibleEdgeIds.add(id);
    }
  }

  hideOrphans(
    elements,
    childrenByParent,
    visibleNodeIds,
    visibleEdgeIds,
    baselineEdgeNodeIds ?? collectEdgeBearingNodeIds(elements)
  );

  return { visibleNodeIds, visibleEdgeIds };
}

/**
 * Every node id that is the source or target of at least one edge in `elements`.
 * The self-compute fallback for the baseline — correct only when `elements` has not
 * yet had edges removed by a view transform.
 */
export function collectEdgeBearingNodeIds(elements: cytoscape.ElementDefinition[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'edges') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    if (typeof data.source === 'string') {
      ids.add(data.source);
    }
    if (typeof data.target === 'string') {
      ids.add(data.target);
    }
  }
  return ids;
}

/**
 * Cascade-hide orphans. The rule differs by node shape, and the shape is decided from the
 * ELEMENT SET's parent links — not from what is currently visible, or a container whose
 * children were all filtered away would read as a leaf and survive forever as an empty box.
 *
 *   - Leaf (no children in `elements`): kept iff it has an incident edge in the BASELINE
 *     graph. An edge hidden by the UI (edge-type filter, kind filter, a pod-parent mode
 *     that expresses `pod-to-node` as nesting) must not take the node with it — the user
 *     hid a connection, not a resource. A node the backend never connected is not the
 *     user's doing and stays hidden, exactly as before.
 *   - Container (has children in `elements`): removed when it has neither a visible child
 *     nor a visible incident edge, so no empty boxes are left on the canvas.
 *
 * The container pass iterates to a fixed point (controller -> k8s node -> cluster). The leaf
 * pass needs no iteration: a leaf's fate depends only on the baseline, which nothing here
 * mutates.
 */
function hideOrphans(
  elements: cytoscape.ElementDefinition[],
  childrenByParent: ReadonlyMap<string, string[]>,
  visibleNodeIds: Set<string>,
  visibleEdgeIds: Set<string>,
  baselineEdgeNodeIds: ReadonlySet<string>
): void {
  const incidentEdges = new Map<string, Set<string>>();

  for (const el of elements) {
    if (el.group !== 'edges') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    const source = data.source;
    const target = data.target;
    if (typeof id !== 'string' || !visibleEdgeIds.has(id)) {
      continue;
    }
    if (typeof source === 'string') {
      addIncident(incidentEdges, source, id);
    }
    if (typeof target === 'string') {
      addIncident(incidentEdges, target, id);
    }
  }

  const isContainer = (nodeId: string): boolean => (childrenByParent.get(nodeId)?.length ?? 0) > 0;
  const dropNode = (nodeId: string): void => {
    visibleNodeIds.delete(nodeId);
    const incident = incidentEdges.get(nodeId);
    if (incident) {
      for (const eid of incident) {
        visibleEdgeIds.delete(eid);
      }
    }
  };

  // Leaf pass: single sweep, decided purely by the baseline.
  for (const nodeId of [...visibleNodeIds]) {
    if (isContainer(nodeId) || baselineEdgeNodeIds.has(nodeId)) {
      continue;
    }
    dropNode(nodeId);
  }

  // Container pass: fixed point, so emptying one container can empty its parent.
  let removedAny = true;
  while (removedAny) {
    removedAny = false;
    for (const nodeId of [...visibleNodeIds]) {
      if (!isContainer(nodeId)) {
        continue;
      }
      const incident = incidentEdges.get(nodeId);
      const hasVisibleEdge = incident !== undefined && [...incident].some((eid) => visibleEdgeIds.has(eid));
      if (hasVisibleEdge) {
        continue;
      }
      const children = childrenByParent.get(nodeId);
      const hasVisibleChild = children !== undefined && children.some((cid) => visibleNodeIds.has(cid));
      if (hasVisibleChild) {
        continue;
      }
      dropNode(nodeId);
      removedAny = true;
    }
  }
}

function addIncident(incidentEdges: Map<string, Set<string>>, nodeId: string, edgeId: string): void {
  const existing = incidentEdges.get(nodeId);
  if (existing) {
    existing.add(edgeId);
  } else {
    incidentEdges.set(nodeId, new Set([edgeId]));
  }
}
