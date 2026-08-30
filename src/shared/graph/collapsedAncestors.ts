import type cytoscape from 'cytoscape';

/**
 * `data.parent` → parent id index (child id → parent id), the reverse direction of
 * `buildChildrenByParent`. Single source for every child→ancestor walk:
 * `resolveSelectedNode`'s off-canvas guard, the search feature's proxy-hit
 * substitution, and locate's collapsed-chain expansion all need the same index.
 */
export function buildParentIndex(elements: cytoscape.ElementDefinition[]): Map<string, string> {
  const parentById = new Map<string, string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const data = el.data as Record<string, unknown>;
    const id = data.id;
    const parent = data.parent;
    if (typeof id === 'string' && typeof parent === 'string') {
      parentById.set(id, parent);
    }
  }
  return parentById;
}

// Ancestor ids of `id`, immediate parent first. Hop-bounded so a (cytoscape-illegal)
// parent cycle can't hang the walk.
export function ancestorChain(parentById: ReadonlyMap<string, string>, id: string): string[] {
  return walkAncestors(parentById, id);
}

function walkAncestors(parentById: ReadonlyMap<string, string>, id: string): string[] {
  const chain: string[] = [];
  let ancestor = parentById.get(id);
  let hops = 0;
  while (ancestor !== undefined && hops < parentById.size + 1) {
    chain.push(ancestor);
    ancestor = parentById.get(ancestor);
    hops += 1;
  }
  return chain;
}

// True when any ancestor (via data.parent) of `id` is collapsed — such a node is
// folded off the canvas even though it stays in `elements`.
export function hasCollapsedAncestor(
  parentById: ReadonlyMap<string, string>,
  id: string,
  collapsedIds: ReadonlySet<string>
): boolean {
  return walkAncestors(parentById, id).some((ancestorId) => collapsedIds.has(ancestorId));
}

/**
 * The OUTERMOST (topmost) collapsed ancestor of `id` — the container that visually
 * stands in for `id` when it is folded off canvas (search's proxy hit). `null` when
 * no ancestor is collapsed.
 */
export function outermostCollapsedAncestor(
  parentById: ReadonlyMap<string, string>,
  id: string,
  collapsedIds: ReadonlySet<string>
): string | null {
  const collapsed = walkAncestors(parentById, id).filter((ancestorId) => collapsedIds.has(ancestorId));
  return collapsed.length > 0 ? (collapsed.at(-1) as string) : null;
}

/**
 * Every collapsed ancestor of `id`, OUTERMOST first — the exact chain `locate` must
 * expand (remove from the collapsed set) so only that chain unfolds.
 */
export function collapsedAncestorChain(
  parentById: ReadonlyMap<string, string>,
  id: string,
  collapsedIds: ReadonlySet<string>
): string[] {
  return walkAncestors(parentById, id)
    .filter((ancestorId) => collapsedIds.has(ancestorId))
    .reverse();
}
