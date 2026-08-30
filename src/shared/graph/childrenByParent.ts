import type cytoscape from 'cytoscape';

/**
 * `data.parent` → child ids index for a set of cytoscape elements, in payload order.
 *
 * Single source for the compound-nesting walk: `computeVisibility`'s orphan cascade (does
 * this container still have a visible child?), its ingress descendant fold, and
 * `collectIngressNodeIds`' own fold all need the same index, so it is built here rather
 * than re-derived per call site.
 */
export function buildChildrenByParent(elements: cytoscape.ElementDefinition[]): Map<string, string[]> {
  const childrenByParent = new Map<string, string[]>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    const parent = data.parent;
    if (typeof id === 'string' && typeof parent === 'string') {
      const siblings = childrenByParent.get(parent);
      if (siblings) {
        siblings.push(id);
      } else {
        childrenByParent.set(parent, [id]);
      }
    }
  }
  return childrenByParent;
}

/**
 * All transitive descendants of `seedIds` via the compound-nesting chain. The seeds
 * themselves are NOT included, so the caller decides whether to union them in.
 *
 * Note this IS transitive, unlike the deliberately single-level `service-selects-pod`
 * expansion in `collectIngressNodeIds` — a different axis: nesting a group inside a group
 * genuinely puts the whole subtree inside it, whereas chaining service selection would
 * walk the graph indefinitely.
 */
export function collectDescendantIds(
  childrenByParent: ReadonlyMap<string, string[]>,
  seedIds: Iterable<string>
): Set<string> {
  const descendants = new Set<string>();
  const stack = [...seedIds];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    for (const childId of childrenByParent.get(id) ?? []) {
      if (!descendants.has(childId)) {
        descendants.add(childId);
        stack.push(childId);
      }
    }
  }
  return descendants;
}
