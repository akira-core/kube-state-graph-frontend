import React from 'react';

import { SwatchLegend } from '../SwatchLegend';

export interface ClusterLegendEntry {
  name: string;
  color: string;
}

export interface ClusterLegendProps {
  clusters: readonly ClusterLegendEntry[];
  onToggleCollapseAll?: () => void;
  allCollapsed?: boolean;
}

// Swatches for the clusters present in the data. Colours come from each backend
// cluster container node (data.clusterColor, assigned in normalize) so they
// always match the translucent on-canvas backplates. A thin wrapper over the
// shared SwatchLegend; renders nothing when empty.
export function ClusterLegend({
  clusters,
  onToggleCollapseAll,
  allCollapsed = false,
}: Readonly<ClusterLegendProps>): React.JSX.Element | null {
  return (
    <SwatchLegend
      title="Clusters"
      testId="cluster-legend"
      rowTestIdPrefix="cluster-legend-row-"
      entries={clusters}
      collapseToggleTestId="cluster-collapse-toggle"
      collapseNoun="clusters"
      allCollapsed={allCollapsed}
      {...(onToggleCollapseAll !== undefined ? { onToggleCollapseAll } : {})}
    />
  );
}
