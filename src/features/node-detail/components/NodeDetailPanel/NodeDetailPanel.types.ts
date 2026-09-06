import type { GraphNodeKind, NodeAlert, NodeStatus } from '../../../../shared/constants/types';
import type { NodeAttribute } from '../../../../shared/nodeAttributes/buildNodeAttributes';
import type { ContainerSpec } from '../../../../shared/types/containerSpec';
import type { DashboardLookup } from '../../hooks/useNodeDashboardUrl';
import type { NodeDetailLookups } from '../../hooks/useNodeDetailUrls';

// The slice of a node's data the detail panel needs. Resolved by KsgPanel from
// the selected node id (cluster containers excluded).
export interface NodeDetailData {
  id: string;
  label: string;
  kind?: GraphNodeKind; // known kind or an unknown forward-compat backend string
  status?: NodeStatus;
  // Promoted attributes that feed the pinned hover tooltip (buildNodeAttributes
  // single-source). NOT rendered in this panel anymore — the Properties section was
  // removed; KsgPanel maps these (+ label + labels) into the top-right pinned card.
  attributes?: NodeAttribute[];
  // Raw backend labels, passed through for the pinned tooltip's labels block
  // (toLabelRows filters keys already promoted to attributes, e.g. namespace).
  labels?: Record<string, string>;
  alerts?: NodeAlert[]; // node's alerts; absent/empty → Alerts section not rendered
  application?: string; // ArgoCD application (pod passthrough / controller aggregate)
  containers?: ContainerSpec[]; // pod containers / controller (name,image)-deduped union
  // Storage facts on a pvc / netapp-aggr / netapp-node. Surfaced via `attributes` (they
  // are promoted rows); kept here for resolve-time use.
  storageclass?: string;
  health?: string;
  usage?: { usedBytes?: number; capacityBytes?: number };
  // Controller identity both detail-URL queries use (design D4): a pod resolves
  // it from data.owner, a controller from itself, a standalone pod from its own
  // kind/name. Present only on the DETAIL_URL_KINDS the queries may fire for.
  queryTarget?: { kind: string; name: string };
}

export interface NodeDetailPanelProps {
  node: NodeDetailData | null; // null → panel closed (renders nothing)
  onClose: () => void;
  // Invoked with the clicked alert's time (Unix SECONDS); KsgPanel rewinds the
  // dashboard time range to a fixed ±5m window around it.
  onAlertTimeClick: (timeSec: number) => void;
  timeZone?: string; // for formatting alert times in the table
  // Eager-prefetched Change Report state behind the Application / Containers
  // sections: resolved per-target lookup state (loading / ready anchor /
  // unavailable hint). Omitted → idle/disabled (no endpoint / left-click
  // selection): sections still render their data, every target shows the hint.
  lookups?: NodeDetailLookups;
  // Eager-prefetched per-node Dashboard URL lookup. Rendered as a button beside the
  // node name in the header; shown only when 'ready'. Omitted → no button.
  dashboard?: DashboardLookup;
}
