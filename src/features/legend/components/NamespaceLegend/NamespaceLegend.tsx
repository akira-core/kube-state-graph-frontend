import React from 'react';

import { SwatchLegend } from '../SwatchLegend';

export interface NamespaceLegendEntry {
  name: string;
  color: string;
}

export interface NamespaceLegendProps {
  namespaces: readonly NamespaceLegendEntry[];
  onToggleCollapseAll?: () => void;
  allCollapsed?: boolean;
}

// Swatches for the namespaces present in CONTROLLER mode. Colours come from each
// synthesized namespace box (data.namespaceColor, assigned in applyNamespaceGrouping)
// so they always match the translucent on-canvas backplates. A thin wrapper over the
// shared SwatchLegend; renders nothing when empty — and KsgPanel only mounts it in
// controller mode, so node mode (which draws no namespace) shows no section. Because
// namespace boxes are NOT default-collapsed (namespace-grouping spec), the collapse-all
// toggle's initial allCollapsed is always false.
export function NamespaceLegend({
  namespaces,
  onToggleCollapseAll,
  allCollapsed = false,
}: Readonly<NamespaceLegendProps>): React.JSX.Element | null {
  return (
    <SwatchLegend
      title="Namespaces"
      testId="namespace-legend"
      rowTestIdPrefix="namespace-legend-row-"
      entries={namespaces}
      collapseToggleTestId="namespace-collapse-toggle"
      collapseNoun="namespaces"
      allCollapsed={allCollapsed}
      {...(onToggleCollapseAll !== undefined ? { onToggleCollapseAll } : {})}
    />
  );
}
