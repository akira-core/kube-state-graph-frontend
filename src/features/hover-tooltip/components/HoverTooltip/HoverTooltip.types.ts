import type cytoscape from 'cytoscape';

import type { NodeAttribute } from '../../../../shared/nodeAttributes/buildNodeAttributes';

// A node pinned for the persistent top-right tooltip (left-click selection). Built
// by KsgPanel from the already-gated selectedNode. `attributes` reuses the shared
// promoted-attribute shape (single source with hover), so no node-detail coupling
// leaks into this feature.
export interface PinnedTooltip {
  label: string;
  attributes: NodeAttribute[];
  // Raw backend labels — rendered below the divider (toLabelRows filters promoted keys).
  labels?: Record<string, string>;
}

export interface HoverTooltipProps {
  cyRef: React.MutableRefObject<cytoscape.Core | null>;
  // Gates listener binding until the cytoscape instance exists — see useCytoscape.
  // Without it the hover listeners are attached while cyRef is still null and
  // never re-attach, so the tooltip silently never appears.
  ready?: boolean;
  // Pinned mode: when set, the tooltip docks at the canvas top-right (persistent,
  // scrollable) showing this selected node, and the floating hover is suppressed.
  // null/undefined → normal floating-hover behavior.
  pinned?: PinnedTooltip | null;
}
