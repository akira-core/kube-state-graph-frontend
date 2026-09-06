/**
 * Returns the parent ids that should be re-collapsed after a diff-patch:
 * the desired collapsed set intersected with the parents that still exist.
 * presentParents is the id set of cy.nodes(':parent') taken AFTER the patch.
 * Example: desired={A,B,C}, presentParents={A,B} (C removed) → ['A','B'].
 * Cluster vs k8s-node is not distinguished — both are :parent, same behaviour.
 */
export function reconcileCollapse(desired: ReadonlySet<string>, presentParents: ReadonlySet<string>): string[] {
  const result: string[] = [];
  for (const id of desired) {
    if (presentParents.has(id)) {
      result.push(id);
    }
  }
  return result;
}
