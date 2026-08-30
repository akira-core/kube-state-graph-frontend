import type { PinnedTooltip } from '../hover-tooltip';
import type { NodeDetailData } from '../node-detail';

// Maps the already-gated selected node (visible + not collapsed-ancestor +
// detail-eligible, resolved by resolveSelectedNode) into the pinned-tooltip shape.
// The orchestrator is the legitimate bridge between the node-detail and hover-tooltip
// features. null → null, so the tooltip self-clears on deselect/switch/filter/collapse.
// labels uses a conditional spread for exactOptionalPropertyTypes (a flat
// `labels: node.labels` would not type-check when undefined).
export function buildPinnedTooltip(node: NodeDetailData | null): PinnedTooltip | null {
  if (node === null) {
    return null;
  }
  return {
    label: node.label,
    attributes: node.attributes ?? [],
    ...(node.labels !== undefined ? { labels: node.labels } : {}),
  };
}
