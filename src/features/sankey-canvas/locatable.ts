/**
 * Whether a card of this wire kind can be located in Graph view. SVMs have no `/v1/graph`
 * node, and application / namespace cards are compounds there (or synthesised here), so a
 * locate for one could only ever report "not in the current graph result" — a dead
 * control. Both Sankey-style charts consult this one rule.
 */
export function locatableKind(kind: string): boolean {
  return kind !== 'netapp-svm' && kind !== 'application' && kind !== 'namespace';
}
