import type cytoscape from 'cytoscape';

import type { NodeKind } from '../../shared/constants/types';
import { isFilterableKind } from '../element-filter';
import type { NodeLegendKindEntry } from '../legend';

import { deriveLegendKindSets } from './deriveLegendKinds';

// Glyph kinds UNIONED with filtered-out kinds present in the elements: the
// union keeps a hidden kind's eye-slash row on screen so it stays restorable
// after its nodes leave the canvas. Visible-but-collapsed kinds keep glyph
// swap semantics (e.g. netapp-aggr → collapsed netapp-node); only filtered-out kinds
// re-enter. Non-filterable kinds list as plain untoggleable rows.
export function deriveLegendEntries(
  elements: readonly cytoscape.ElementDefinition[],
  collapsedIds: ReadonlySet<string>,
  visibleKinds: readonly NodeKind[]
): NodeLegendKindEntry[] {
  const visible = new Set<string>(visibleKinds);
  const { glyphKinds, presentKinds } = deriveLegendKindSets(elements, collapsedIds);
  const kinds = [...glyphKinds];
  const seen = new Set<string>(glyphKinds);
  for (const kind of presentKinds) {
    if (!seen.has(kind) && isFilterableKind(kind) && !visible.has(kind)) {
      seen.add(kind);
      kinds.push(kind);
    }
  }
  return kinds.map((kind) => {
    const togglable = isFilterableKind(kind);
    return { kind, togglable, hidden: togglable && !visible.has(kind) };
  });
}
