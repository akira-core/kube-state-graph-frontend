import type cytoscape from 'cytoscape';

import type { GraphNodeKind } from '../../shared/constants/types';
import { buildParentIndex, hasCollapsedAncestor } from '../../shared/graph/collapsedAncestors';
import { buildNodeAttributes } from '../../shared/nodeAttributes/buildNodeAttributes';
import { DETAIL_URL_KINDS, isDashboardEligible, type NodeDetailData } from '../node-detail';

export function resolveSelectedNode(
  elements: cytoscape.ElementDefinition[],
  selectedNodeId: string | null,
  visibleNodeIds: ReadonlySet<string>,
  collapsedIds: ReadonlySet<string> = new Set()
): NodeDetailData | null {
  if (selectedNodeId === null || !visibleNodeIds.has(selectedNodeId)) {
    return null;
  }
  if (collapsedIds.size > 0 && hasCollapsedAncestor(buildParentIndex(elements), selectedNodeId, collapsedIds)) {
    return null;
  }
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.id === selectedNodeId && (isDashboardEligible(d) || d.isApplication === true)) {
      const label = typeof d.label === 'string' ? d.label : selectedNodeId;
      let queryTarget: { kind: string; name: string } | undefined;
      if (d.kind !== undefined && DETAIL_URL_KINDS.has(d.kind)) {
        if (d.kind === 'pod') {
          const ownerKind = d.owner !== undefined ? d.owner.kind.toLowerCase() : undefined;
          queryTarget =
            d.owner !== undefined && ownerKind !== undefined && DETAIL_URL_KINDS.has(ownerKind)
              ? { kind: ownerKind, name: d.owner.name }
              : { kind: 'pod', name: label };
        } else {
          queryTarget = { kind: d.kind, name: label };
        }
      } else if (d.kind !== undefined && typeof d.application === 'string' && d.application.length > 0) {
        queryTarget = { kind: d.kind, name: label };
      } else if (d.isApplication === true && typeof d.application === 'string' && d.application.length > 0) {
        queryTarget = { kind: 'application', name: d.application };
      }
      const kind: GraphNodeKind | undefined = d.kind ?? (d.isApplication === true ? 'application' : undefined);
      return {
        id: selectedNodeId,
        label,
        attributes: buildNodeAttributes(d),
        ...(d.labels !== undefined ? { labels: d.labels } : {}),
        ...(kind !== undefined ? { kind } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.alerts !== undefined ? { alerts: d.alerts } : {}),
        ...(d.application !== undefined ? { application: d.application } : {}),
        ...(d.containers !== undefined ? { containers: d.containers } : {}),
        ...(d.storageclass !== undefined ? { storageclass: d.storageclass } : {}),
        ...(d.health !== undefined ? { health: d.health } : {}),
        ...(d.usage !== undefined ? { usage: d.usage } : {}),
        ...(queryTarget !== undefined ? { queryTarget } : {}),
      };
    }
  }
  return null;
}
