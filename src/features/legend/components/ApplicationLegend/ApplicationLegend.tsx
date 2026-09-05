import React from 'react';

import { SwatchLegend } from '../SwatchLegend';

export interface ApplicationLegendEntry {
  name: string;
  color: string;
}

export interface ApplicationLegendProps {
  applications: readonly ApplicationLegendEntry[];
  onToggleCollapseAll?: () => void;
  allCollapsed?: boolean;
}

// Swatches for the ArgoCD applications present in CONTROLLER mode. Colours come from each
// backend `application` group node (data.applicationColor, assigned in normalize) so they
// always match the translucent on-canvas backplates. A thin wrapper over the shared
// SwatchLegend (sibling of NamespaceLegend); renders nothing when empty — and KsgPanel only
// mounts it in controller mode, so node mode (which strips application groups) shows no
// section. Application boxes are NOT default-collapsed, so the collapse-all toggle's initial
// allCollapsed is always false.
export function ApplicationLegend({
  applications,
  onToggleCollapseAll,
  allCollapsed = false,
}: Readonly<ApplicationLegendProps>): React.JSX.Element | null {
  return (
    <SwatchLegend
      title="Applications"
      testId="application-legend"
      rowTestIdPrefix="application-legend-row-"
      entries={applications}
      collapseToggleTestId="application-collapse-toggle"
      collapseNoun="applications"
      allCollapsed={allCollapsed}
      {...(onToggleCollapseAll !== undefined ? { onToggleCollapseAll } : {})}
    />
  );
}
