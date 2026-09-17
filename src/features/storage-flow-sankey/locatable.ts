/**
 * Whether a card of this wire kind can be located in Graph view. SVMs have no `/v1/graph`
 * node, and application / namespace cards are compounds there (or synthesised here), so a
 * locate for one could only ever report "not in the current graph result" — a dead
 * control. The Storage Sankey is the only chart with a Locate; the Network trace offers none, so this rule lives with the view that asks it.
 */
export function locatableKind(kind: string): boolean {
  return kind !== 'netapp-svm' && kind !== 'application' && kind !== 'namespace';
}
