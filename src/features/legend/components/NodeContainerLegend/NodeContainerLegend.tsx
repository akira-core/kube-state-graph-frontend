import React from 'react';

import { SwatchLegend } from '../SwatchLegend';

export interface NodeContainerLegendEntry {
  name: string;
  color: string;
}

export interface NodeContainerLegendProps {
  nodes: readonly NodeContainerLegendEntry[];
  onToggleCollapseAll?: () => void;
  allCollapsed?: boolean;
  // Section heading + collapse-toggle noun. Defaults to the node-mode wording
  // ('Nodes' / 'nodes'); controller mode passes 'Controllers' / 'controllers'.
  title?: string;
  collapseNoun?: string;
}

// Swatches for the compound containers present in the data. In the default
// `cluster > node > pod` layout a node renders as a labelled container box with
// NO resource icon, so it belongs here (swatched like a cluster) rather than in
// the icon-based Node-kinds legend — see KsgPanel; controller mode swaps the
// containers (and heading) to the synthesized controllers. Each swatch takes its
// parent cluster's accent colour so the container and cluster read as the same
// family. A thin wrapper over the shared SwatchLegend; renders nothing when empty.
export function NodeContainerLegend({
  nodes,
  onToggleCollapseAll,
  allCollapsed = false,
  title,
  collapseNoun,
}: Readonly<NodeContainerLegendProps>): React.JSX.Element | null {
  return (
    <SwatchLegend
      title={title ?? 'Nodes'}
      testId="node-container-legend"
      rowTestIdPrefix="node-container-legend-row-"
      entries={nodes}
      collapseToggleTestId="node-collapse-toggle"
      collapseNoun={collapseNoun ?? 'nodes'}
      allCollapsed={allCollapsed}
      {...(onToggleCollapseAll !== undefined ? { onToggleCollapseAll } : {})}
    />
  );
}
