import type cytoscape from 'cytoscape';

import { APPLICATION_BEARING_KINDS } from '../../shared/constants/applicationBearingKinds';
import { APPLICATION_COLOR } from '../../shared/constants/applicationPalette';
import { CLUSTER_COLOR } from '../../shared/constants/clusterPalette';
import { isTrafficEdgeType } from '../../shared/constants/colorByEdgeType';
import { FALLBACK_STATUS } from '../../shared/constants/colorByStatus';
import { RELATION_LABEL_KEY } from '../../shared/constants/edgeRelation';
import { NAMESPACE_COLOR } from '../../shared/constants/namespacePalette';
import { STORAGE_CLUSTER_COLOR } from '../../shared/constants/storageClusterPalette';
import type { GraphNodeKind, NodeAlert, NodeStatus } from '../../shared/constants/types';
import { collectIngressNodeIds } from '../../shared/graph/collectIngressNodeIds';
import { isPlainObject } from '../../shared/guards/isPlainObject';
import type { ContainerSpec } from '../../shared/types/containerSpec';

export interface NormalizeResult {
  elements: cytoscape.ElementDefinition[];
  errors: string[];
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

// Re-exported so existing intra-feature importers (useGraphData) keep working after
// the guard moved to shared/.
export { isPlainObject };

// Anti-corruption: keeps only the string-valued entries (partial-parse contract, like
// parseAlerts/parseContainers below) instead of dropping the WHOLE map when one value is
// non-string — a single stray non-string label (e.g. a numeric `replicas` key) must not
// make every other label (incl. the ingress-gateway marker) silently disappear.
function parseStringRecord(v: unknown): Record<string, string> | undefined {
  if (!isPlainObject(v)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(v)) {
    if (typeof val === 'string') {
      result[key] = val;
    }
  }
  // An originally-empty object stays an empty object (the prior all-or-nothing guard was
  // vacuously true for it); a non-empty object that loses every entry to filtering is
  // reported as absent, not as a spurious empty object.
  return Object.keys(v).length === 0 || Object.keys(result).length > 0 ? result : undefined;
}

function isNonEmptyStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string');
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

// Backend RED measurements (`data.metrics`) → the panel's camelCase `EdgeMetrics`.
// Validation only: no unit conversion, no rounding, no defaults — magnitudes reach the
// tooltip untouched so the formatter alone decides how a value reads (design D1).
//
// Degradation is per-field, and the edge NEVER pays for a bad metric (D2): an unusable
// `errorRate` / `p90ServerMs` drops just that field, while an unusable `rate` drops the
// whole object — `rate` is guaranteed present whenever the backend sends `metrics`, so
// without it this is not a metrics object we understand, and the remaining fields have no
// denominator to be read against.
//
// Failures are deliberately NOT reported through normalizeGraph's `errors` (D3): that
// channel drives a "topology may be incomplete" banner, and RED is decorative — an
// upstream regression would fire it on every edge at once and drown the real warnings.
// `metrics` is a union of two families the backend never mixes: RED on a trace-derived
// call edge, storage I/O on a `pvc-to-netapp-aggr` edge. `rate` discriminates them — it is
// required within RED and absent from I/O.
//
// The ordering is load-bearing. A PRESENT-but-invalid `rate` still discards the whole
// object (RED without a usable rate is meaningless), preserving the pre-union behaviour
// byte-for-byte; only a wholly ABSENT `rate` falls through to the I/O parser. So no
// existing RED case changes, and a storage edge is no longer silently dropped.
function parseEdgeMetrics(v: unknown): cytoscape.EdgeMetrics | undefined {
  if (!isPlainObject(v)) {
    return undefined;
  }
  if (v.rate === undefined) {
    return parseIoMetrics(v);
  }
  if (!isFiniteNumber(v.rate)) {
    return undefined;
  }
  const { error_rate: errorRate, p90_server_ms: p90ServerMs } = v;
  return {
    rate: v.rate,
    // Absent stays absent: an omitted `errorRate` means the failure counter was
    // unreadable, which is NOT the same as the measured `0` the backend also emits.
    ...(isFiniteNumber(errorRate) ? { errorRate } : {}),
    ...(isFiniteNumber(p90ServerMs) ? { p90ServerMs } : {}),
  };
}

// The storage half. Every field rides its own upstream Harvest series family, so each is
// kept or dropped independently and absence is never padded to 0. Values are verbatim —
// Harvest has already resolved ONTAP's base counters, so these are not rates to derive.
// Returns undefined when nothing survives, so the edge simply carries no `metrics`.
function parseIoMetrics(v: Record<string, unknown>): cytoscape.EdgeIoMetrics | undefined {
  const {
    read_ops: readOps,
    write_ops: writeOps,
    read_latency_us: readLatencyUs,
    write_latency_us: writeLatencyUs,
    read_bytes_per_sec: readBytesPerSec,
    write_bytes_per_sec: writeBytesPerSec,
    max_iops: maxIops,
    max_bytes_per_sec: maxBytesPerSec,
  } = v;
  const io: cytoscape.EdgeIoMetrics = {
    ...(isFiniteNumber(readOps) ? { readOps } : {}),
    ...(isFiniteNumber(writeOps) ? { writeOps } : {}),
    ...(isFiniteNumber(readLatencyUs) ? { readLatencyUs } : {}),
    ...(isFiniteNumber(writeLatencyUs) ? { writeLatencyUs } : {}),
    ...(isFiniteNumber(readBytesPerSec) ? { readBytesPerSec } : {}),
    ...(isFiniteNumber(writeBytesPerSec) ? { writeBytesPerSec } : {}),
    // The ceilings ride the policy-group families, so a volume in no group carries
    // measurements and no ceiling. Either one alone still keeps the family alive: "a
    // ceiling never appears alone" is the BACKEND's invariant, and re-enforcing a
    // contract this layer does not own would let an upstream change silently drop data.
    ...(isFiniteNumber(maxIops) ? { maxIops } : {}),
    ...(isFiniteNumber(maxBytesPerSec) ? { maxBytesPerSec } : {}),
  };
  return Object.keys(io).length > 0 ? io : undefined;
}

function isNodeStatus(v: unknown): v is NodeStatus {
  return v === 'normal' || v === 'warning' || v === 'critical';
}

// Backend D6 compound group `data.type` literals — all are kind-less at parse time and
// carry no own alerts (a controller's alerts come from enrichControllers). `controller` is
// later ENRICHED with a real `kind` from its child pods so its detail panel keeps working.
function isGroupType(type: string): boolean {
  return (
    type === 'cluster' ||
    type === 'storage-cluster' ||
    type === 'namespace' ||
    type === 'application' ||
    type === 'controller'
  );
}

// The PURELY-decorative group kinds — excludes `controller`, which is a real workload kind
// (kind-ful, own detail panel). Their on-canvas kind prefix (`Cluster: ` / `Storage: ` /
// `Namespace: ` / `Release Unit: `) is render-only in the stylesheet; `data.label` stays the
// bare upstream name (also on data.cluster/storageCluster/namespace/application) so tooltip
// titles and other identity consumers never see the prefix. `cluster` and `storage-cluster`
// are additionally rendered non-selectable (see parseNodes).

// Panel-side identity keyed off upstream `type` (backend D6):
//   `cluster` / `storage-cluster` / `namespace` / `application` → kind-less decorative group;
//   `controller` → kind-less group flagged isController (kind added in enrichControllers);
//   everything else → leaf carrying its kind plus `status` ONLY when the backend sent one
//   (data-driven — stylesheet borders `node[status]`, not a hardcoded kind list). The NetApp
//   kinds fall through this last branch: `netapp-aggr` is an ordinary leaf, and `netapp-node`
//   is a kind-ful node that merely HAPPENS to be someone's `parent` — nesting is the
//   backend's `data.parent`, not an identity the panel assigns.
type NodeIdentity =
  | { isCluster: true; cluster: string; clusterColor: string }
  | { isStorageCluster: true; storageCluster: string; storageClusterColor: string }
  | { isNamespace: true; namespace: string; namespaceColor: string }
  | { isApplication: true; application: string; applicationColor: string }
  | { isController: true }
  | { kind: GraphNodeKind; status?: NodeStatus };

function resolveNodeIdentity(type: string, label: string, status: NodeStatus | undefined): NodeIdentity {
  if (type === 'cluster') {
    return { isCluster: true, cluster: label, clusterColor: CLUSTER_COLOR };
  }
  // An ONTAP cluster, NOT a Kubernetes one — kept a distinct flag (rather than reusing
  // isCluster) because isCluster drives the K8s Clusters legend and swatch palette, and an
  // ONTAP name has no business there. Same shape otherwise: kind-less, non-selectable.
  if (type === 'storage-cluster') {
    return { isStorageCluster: true, storageCluster: label, storageClusterColor: STORAGE_CLUSTER_COLOR };
  }
  if (type === 'namespace') {
    return { isNamespace: true, namespace: label, namespaceColor: NAMESPACE_COLOR };
  }
  if (type === 'application') {
    return { isApplication: true, application: label, applicationColor: APPLICATION_COLOR };
  }
  if (type === 'controller') {
    return { isController: true };
  }
  return { kind: type, ...(status !== undefined ? { status } : {}) };
}

// Unix seconds: must be finite and non-negative — NaN/±Infinity → "Invalid date" +
// {from:NaN,to:NaN} rewind; a negative epoch → bogus pre-1970 window.
function isValidEpochSeconds(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

// Ascending `timeRecords` from upstream `time_records` (valid epoch seconds, sorted);
// falls back to the legacy single `time` scalar. undefined = no valid occurrence time.
function parseTimeRecords(entry: Record<string, unknown>): number[] | undefined {
  if (Array.isArray(entry.time_records)) {
    const valid = entry.time_records.filter(isValidEpochSeconds);
    if (valid.length > 0) {
      return valid.sort((a, b) => a - b);
    }
  }
  return isValidEpochSeconds(entry.time) ? [entry.time] : undefined;
}

// Project upstream `alerts` onto typed NodeAlert[]. Anti-corruption: malformed entries
// dropped, not thrown (partial-parse contract). `severity` kept as free-form string —
// custom labels survive and are colour-mapped downstream. undefined = no alerts field.
function parseAlerts(v: unknown): NodeAlert[] | undefined {
  if (!Array.isArray(v)) {
    return undefined;
  }
  const alerts: NodeAlert[] = [];
  for (const entry of v) {
    if (!isPlainObject(entry)) {
      continue;
    }
    if (!isString(entry.name) || !isString(entry.severity)) {
      continue;
    }
    const timeRecords = parseTimeRecords(entry);
    if (timeRecords === undefined) {
      continue;
    }
    alerts.push({
      name: entry.name,
      severity: entry.severity,
      timeRecords,
      ...(isString(entry.pod) ? { pod: entry.pod } : {}),
      ...(isString(entry.service) ? { service: entry.service } : {}),
      ...(isString(entry.id) ? { id: entry.id } : {}),
    });
  }
  return alerts.length > 0 ? alerts : undefined;
}

// A byte count the backend actually measured: finite and non-negative. `0` is a real
// reading (an empty volume), so it passes — only nonsense is rejected.
function parseByteCount(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

// Project upstream `usage` onto the panel's camelCase shape. The two halves ride separate
// upstream series families (kubelet used vs capacity; Harvest aggr space used vs total), so
// each is kept or dropped on its own and a partial reading survives. The object itself is
// dropped only when NEITHER half is usable — never emitted empty, and never padded with a
// placeholder 0, since "unread" and "zero bytes" are different facts.
function parseUsage(v: unknown): { usedBytes?: number; capacityBytes?: number } | undefined {
  if (!isPlainObject(v)) {
    return undefined;
  }
  const usedBytes = parseByteCount(v.used_bytes);
  const capacityBytes = parseByteCount(v.capacity_bytes);
  if (usedBytes === undefined && capacityBytes === undefined) {
    return undefined;
  }
  return {
    ...(usedBytes !== undefined ? { usedBytes } : {}),
    ...(capacityBytes !== undefined ? { capacityBytes } : {}),
  };
}

// Flatten usage to a single [0,1] ratio for the icon mapper, which can read neither nested
// data nor arithmetic. Deliberately KIND-AGNOSTIC: any node with a complete usage reading
// gets one, so pvc and netapp-aggr share one liquid painter and a future usage-bearing
// kind joins for free.
//
// Returns undefined unless BOTH halves are present and capacity is non-zero — an absent
// ratio paints no liquid at all, which is how "no data" stays structurally distinct from
// a 0% fill. Clamped because a volume can legitimately report used > capacity (filesystem
// overhead, thin provisioning) and a >100% fill would just render as a rendering bug.
function deriveUsageRatio(usage: { usedBytes?: number; capacityBytes?: number } | undefined): number | undefined {
  if (usage === undefined) {
    return undefined;
  }
  const { usedBytes, capacityBytes } = usage;
  if (usedBytes === undefined || capacityBytes === undefined || capacityBytes === 0) {
    return undefined;
  }
  return Math.min(1, Math.max(0, usedBytes / capacityBytes));
}

// Project upstream pod `containers` onto typed ContainerSpec[]. Anti-corruption:
// entries with missing/empty/non-string name or image dropped, not thrown.
// undefined = no containers field (exactOptionalPropertyTypes).
function parseContainers(v: unknown): ContainerSpec[] | undefined {
  if (!Array.isArray(v)) {
    return undefined;
  }
  const containers: ContainerSpec[] = [];
  for (const entry of v) {
    if (isPlainObject(entry) && isString(entry.name) && isString(entry.image)) {
      containers.push({ name: entry.name, image: entry.image });
    }
  }
  return containers.length > 0 ? containers : undefined;
}

// Node-STATUS rank for the collapsed-container tint (higher = worse): a collapsed
// container borders by the worst status it HIDES. STATUS, not alert severity, is the
// signal — every node has a status (default normal) on a uniform scale, and a pod can
// be warning/critical without any alert.
const STATUS_RANK: Record<NodeStatus, number> = { normal: 0, warning: 1, critical: 2 };
function rankToStatus(rank: number): NodeStatus {
  return rank >= 2 ? 'critical' : rank === 1 ? 'warning' : 'normal';
}

// Pod controller owner from typed `data.owner` or legacy `labels.owner_kind/_name`
// (pre-f050092). undefined = none. Passed through on pod nodes; enrichControllers reads
// it from a controller's child pods to derive the controller's Workloads `kind`.
function parseOwner(
  d: Record<string, unknown>,
  labels: Record<string, string> | undefined
): { kind: string; name: string } | undefined {
  const owner = d.owner;
  if (isPlainObject(owner) && isString(owner.kind) && isString(owner.name)) {
    return { kind: owner.kind.trim(), name: owner.name.trim() };
  }
  if (labels !== undefined && isString(labels.owner_kind) && isString(labels.owner_name)) {
    return { kind: labels.owner_kind.trim(), name: labels.owner_name.trim() };
  }
  return undefined;
}

// Upstream entries are cytoscape-shaped ({ data: {...} }); tolerate flat objects too.
function unwrapData(entry: Record<string, unknown>): Record<string, unknown> {
  return isPlainObject(entry.data) ? entry.data : entry;
}

// Locate the { nodes, edges } container: full response ({ elements: {...} }) or already-unwrapped.
function resolveContainer(raw: Record<string, unknown>): Record<string, unknown> {
  if (isPlainObject(raw.elements)) {
    return raw.elements;
  }
  return raw;
}

// Pre-pass (D8): worst pod STATUS rank reachable from each k8s `node` via `pod-to-node`
// edges — pods no longer nest under their node in the backend D6 (controller) payload, so
// a collapsed node can no longer border from its children. Every node with ≥1 incident
// `pod-to-node` edge records an entry (incl. rank 0) so map membership doubles as "has a
// reachable pod" (write worstStatus only when there is status info at all). The `node`
// pod-parent view re-nests pods under their node, where the same set of pods yields the
// same worst — so this single normalize-time computation holds in both views.
function computeNodeWorstViaPodToNode(rawNodes: unknown[], rawEdges: unknown[]): Map<string, number> {
  const podStatusRank = new Map<string, number>();
  for (const entry of rawNodes) {
    if (!isPlainObject(entry)) {
      continue;
    }
    const d = unwrapData(entry);
    if (d.type !== 'pod' || !isString(d.id)) {
      continue;
    }
    const status: NodeStatus = isNodeStatus(d.status) ? d.status : FALLBACK_STATUS;
    podStatusRank.set(d.id, STATUS_RANK[status]);
  }
  const nodeWorst = new Map<string, number>();
  for (const entry of rawEdges) {
    if (!isPlainObject(entry)) {
      continue;
    }
    const d = unwrapData(entry);
    if (d.type !== 'pod-to-node' || !isString(d.source) || !isString(d.target)) {
      continue;
    }
    const r = podStatusRank.get(d.source);
    if (r === undefined) {
      continue; // source is not a known pod
    }
    const prev = nodeWorst.get(d.target);
    if (prev === undefined || r > prev) {
      nodeWorst.set(d.target, r);
    }
  }
  return nodeWorst;
}

interface ParsedNodes {
  elements: cytoscape.ElementDefinition[];
  nodeIds: Set<string>; // the edge-endpoint dedup set
  errors: string[];
}

interface ParsedEdges {
  elements: cytoscape.ElementDefinition[];
  errors: string[];
}

// Stage 1 — project raw nodes onto cytoscape node elements (payload order). Compound
// grouping STRUCTURE is the backend's: `parent` is passed through untouched (panel is
// structure-agnostic). The frontend concerns kept here are the accent COLOUR for the
// cluster / namespace / application decorative groups (single source: data.*Color, read by
// legend swatches) and per-node `worstStatus` for the collapsed-container border tint.
function parseNodes(rawNodes: unknown[], nodeWorstFromPods: ReadonlyMap<string, number>): ParsedNodes {
  const elements: cytoscape.ElementDefinition[] = [];
  const errors: string[] = [];
  const nodeIds = new Set<string>();
  for (const [index, entry] of rawNodes.entries()) {
    if (!isPlainObject(entry)) {
      errors.push(`nodes[${String(index)}] is not an object`);
      continue;
    }
    const d = unwrapData(entry);
    if (!isString(d.id)) {
      errors.push(`nodes[${String(index)}] missing id`);
      continue;
    }
    if (!isString(d.type)) {
      errors.push(`nodes[${String(index)}] missing type`);
      continue;
    }
    // Duplicate ids → partial-parse channel: cytoscape silently first-wins-dedupes the
    // copy, and differing copies would flip-flop into toUpdate on every refresh.
    if (nodeIds.has(d.id)) {
      errors.push(`nodes[${String(index)}] duplicate id "${d.id}"`);
      continue;
    }
    const labels = parseStringRecord(d.labels);
    const namespace = labels?.namespace;
    // Bare upstream name for every node — decorative-group kind prefixes are render-only
    // in the stylesheet (tooltip / identity consumers must not see them).
    const label = isString(d.name) ? d.name : d.id;
    const isGroup = isGroupType(d.type);
    // Data-driven status: keep only a valid backend status on the element (absent → no
    // `status` field → no border via `node[status]`). For worstStatus aggregation, an
    // absent status counts as FALLBACK_STATUS (normal).
    const rawStatus: NodeStatus | undefined = isNodeStatus(d.status) ? d.status : undefined;
    const ownStatusRank = STATUS_RANK[rawStatus ?? FALLBACK_STATUS];
    const identity = resolveNodeIdentity(d.type, label, rawStatus);
    // Alerts ride on leaf nodes only; group nodes never carry their own (a backend
    // controller's alerts are aggregated from its child pods in enrichControllers).
    const alerts = isGroup ? undefined : parseAlerts(d.alerts);
    // A collapsed k8s `node` borders by the worst of its own + reachable-pod statuses,
    // incl. normal (D8/D10). Set only when status info exists (own status or ≥1 reachable
    // pod) — a bare node with neither must not pass "no data" off as normal.
    const nodeChildRank = d.type === 'node' ? nodeWorstFromPods.get(d.id) : undefined;
    const nodeHasStatusInfo = d.type === 'node' && (rawStatus !== undefined || nodeChildRank !== undefined);
    const nodeWorstRank = Math.max(ownStatusRank, nodeChildRank ?? 0);
    // ArgoCD application rides on the APPLICATION_BEARING_KINDS leaves (pod / service / pvc
    // per backend D6 — service & pvc resolve it from their annotation tracking-id and nest
    // under the application group, like pods); containers + typed owner stay POD-only.
    // enrichControllers aggregates the pod application onto the backend controller group.
    const isPod = d.type === 'pod';
    const carriesApplication = isString(d.type) && APPLICATION_BEARING_KINDS.has(d.type);
    const application = carriesApplication && isString(d.application) ? d.application : undefined;
    const containers = isPod ? parseContainers(d.containers) : undefined;
    const owner = isPod ? parseOwner(d, labels) : undefined;
    // Storage fields, all omitempty and all independently guarded. `storageclass` is the
    // claim's StorageClass NAME on the PVC itself (the storageclass NODE is gone); `health`
    // is ONTAP's own word, passed through verbatim so an unknown backend value survives —
    // its ABSENCE is not 'degraded' and is never defaulted. `usage` is the same shape on a
    // pvc (kubelet) and a netapp-aggr (Harvest), so one parser serves both.
    const storageclass = isString(d.storageclass) ? d.storageclass : undefined;
    const health = isString(d.health) ? d.health : undefined;
    // Kubernetes' Ready condition on a K8s node. Guarded for non-empty like `health` and
    // passed through verbatim, so an upstream that grows a fourth condition value surfaces
    // it instead of vanishing. Absence stays absence — never defaulted to 'Unknown'.
    const readyStatus = isString(d.ready_status) && d.ready_status.length > 0 ? d.ready_status : undefined;
    const usage = parseUsage(d.usage);
    const usageRatio = deriveUsageRatio(usage);
    nodeIds.add(d.id);
    elements.push({
      group: 'nodes',
      // The decorative `cluster` group is NON-selectable: a tap on it deselects like a
      // background tap (never opens a detail panel), and its expand-collapse `+/-` cue —
      // which is selection-driven — therefore never surfaces; collapse/expand is instead
      // a dbltap gesture (see GraphCanvas.clusterCollapseToggle). The `namespace` /
      // `application` groups stay selectable so their cue still surfaces; selecting them
      // opens NO detail panel EXCEPT `application` (resolveSelectedNode returns null for
      // isNamespace, resolves isApplication). Leaf + controller compounds stay selectable.
      ...('isCluster' in identity || 'isStorageCluster' in identity ? { selectable: false } : {}),
      data: {
        id: d.id,
        ...identity,
        label,
        ...(isString(d.parent) ? { parent: d.parent } : {}),
        ...(isString(namespace) ? { namespace } : {}),
        ...(isNonEmptyStringArray(d.ipaddress) ? { ipAddress: d.ipaddress } : {}),
        ...(alerts !== undefined ? { alerts } : {}),
        ...(application !== undefined ? { application } : {}),
        ...(containers !== undefined ? { containers } : {}),
        ...(owner !== undefined ? { owner } : {}),
        ...(storageclass !== undefined ? { storageclass } : {}),
        ...(health !== undefined ? { health } : {}),
        ...(readyStatus !== undefined ? { readyStatus } : {}),
        ...(usage !== undefined ? { usage } : {}),
        ...(usageRatio !== undefined ? { usageRatio } : {}),
        ...(nodeHasStatusInfo ? { worstStatus: rankToStatus(nodeWorstRank) } : {}),
        ...(labels !== undefined ? { labels } : {}),
      },
    });
  }
  return { elements, nodeIds, errors };
}

// Stage 2 — project raw edges onto cytoscape edge elements (payload order). An edge whose
// endpoints aren't both known node ids → partial-parse channel (cytoscape throws otherwise).
function parseEdges(rawEdges: unknown[], nodeIds: ReadonlySet<string>): ParsedEdges {
  const elements: cytoscape.ElementDefinition[] = [];
  const errors: string[] = [];
  const edgeIds = new Set<string>();
  for (const [index, entry] of rawEdges.entries()) {
    if (!isPlainObject(entry)) {
      errors.push(`edges[${String(index)}] is not an object`);
      continue;
    }
    const d = unwrapData(entry);
    if (!isString(d.id) || !isString(d.source) || !isString(d.target) || !isString(d.type)) {
      errors.push(`edges[${String(index)}] missing required fields`);
      continue;
    }
    if (!nodeIds.has(d.source) || !nodeIds.has(d.target)) {
      errors.push(`edges[${String(index)}] references unknown node id`);
      continue;
    }
    if (edgeIds.has(d.id)) {
      errors.push(`edges[${String(index)}] duplicate id "${d.id}"`);
      continue;
    }
    edgeIds.add(d.id);
    const labels = parseStringRecord(d.labels);
    // Hoist `labels.relation` to a flat field: cytoscape selectors cannot reach nested
    // data, so `edge[relation = "transport"]` needs it at the top level. Copied verbatim
    // (unlike the derived `ingressPath`) — the backend owns the value, and an unknown
    // one passes through to the solid default. `labels.relation` stays in place for the
    // hover tooltip; the duplication is deliberate.
    const relation = labels?.[RELATION_LABEL_KEY];
    const metrics = parseEdgeMetrics(d.metrics);
    elements.push({
      group: 'edges',
      data: {
        id: d.id,
        source: d.source,
        target: d.target,
        edgeType: d.type,
        ...(labels !== undefined ? { labels } : {}),
        ...(relation !== undefined ? { relation } : {}),
        ...(metrics !== undefined ? { metrics } : {}),
      },
    });
  }
  return { elements, errors };
}

// Stage 3 (D5) — enrich the backend's `controller` group nodes from their child pods so the
// (left-click selection) detail panel (ApplicationTable / ContainerTable / dashboard URL) and
// the collapsed-border tint keep working. The backend emits the controller group + its parent
// chain directly (D1, no client synthesis); the panel only decorates it. Deterministic,
// immutable: a NEW element is produced for each controller; child pod elements and the input
// array are never mutated (alert pod-backfill copies the alert). Children = pods whose
// `data.parent` is the controller id, taken in stable podId order.
function enrichControllers(nodeElements: cytoscape.ElementDefinition[]): cytoscape.ElementDefinition[] {
  const podsByParent = new Map<string, cytoscape.ElementDefinition[]>();
  for (const el of nodeElements) {
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.kind === 'pod' && typeof d.parent === 'string') {
      const arr = podsByParent.get(d.parent) ?? [];
      arr.push(el);
      podsByParent.set(d.parent, arr);
    }
  }
  return nodeElements.map((el) => {
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.isController !== true || typeof d.id !== 'string') {
      return el;
    }
    const children = [...(podsByParent.get(d.id) ?? [])].sort((a, b) =>
      String((a.data as cytoscape.NodeDataDefinition).id ?? '').localeCompare(
        String((b.data as cytoscape.NodeDataDefinition).id ?? '')
      )
    );

    let kind: string | undefined;
    let worstRank: number | undefined; // undefined = no child pods (omit worstStatus)
    let application: string | undefined;
    const containersByKey = new Map<string, ContainerSpec>();
    const alerts: NodeAlert[] = [];
    const seenAlertIds = new Set<string>();

    for (const child of children) {
      const cd = child.data as cytoscape.NodeDataDefinition;
      // kind: lowercased owner.kind of the first child pod that has one (stable order).
      if (kind === undefined && cd.owner !== undefined && cd.owner.kind.length > 0) {
        kind = cd.owner.kind.toLowerCase();
      }
      // worstStatus: worst child-pod status (always written once there is ≥1 child).
      const r = STATUS_RANK[cd.status ?? FALLBACK_STATUS];
      worstRank = worstRank === undefined ? r : Math.max(worstRank, r);
      // application: first valued child pod in stable order.
      if (application === undefined && cd.application !== undefined) {
        application = cd.application;
      }
      // containers: union across child pods, deduped by (name, image).
      if (cd.containers !== undefined) {
        for (const c of cd.containers) {
          containersByKey.set(`${c.name}/${c.image}`, c);
        }
      }
      // alerts: concat in stable order; backfill missing pod from the source pod's label
      // on a COPY (the pod element stays untouched); dedupe by id across pods (first wins).
      if (cd.alerts !== undefined) {
        const podLabel = typeof cd.label === 'string' ? cd.label : typeof cd.id === 'string' ? cd.id : '';
        for (const alert of cd.alerts) {
          if (alert.id !== undefined) {
            if (seenAlertIds.has(alert.id)) {
              continue;
            }
            seenAlertIds.add(alert.id);
          }
          alerts.push(alert.pod === undefined ? { ...alert, pod: podLabel } : alert);
        }
      }
    }

    const containers =
      containersByKey.size > 0
        ? [...containersByKey.values()].sort((a, b) => a.name.localeCompare(b.name) || a.image.localeCompare(b.image))
        : undefined;

    return {
      ...el,
      data: {
        ...d,
        ...(kind !== undefined ? { kind } : {}),
        ...(worstRank !== undefined ? { worstStatus: rankToStatus(worstRank) } : {}),
        ...(application !== undefined ? { application } : {}),
        ...(containers !== undefined ? { containers } : {}),
        ...(alerts.length > 0 ? { alerts } : {}),
      },
    };
  });
}

// Flag every edge on the ingress-gateway TRAFFIC path so the stylesheet can dash it
// (`edge[?ingressPath]`). Two conditions, both required:
//   1. an endpoint is an ingress node (the same set the showIngress toggle hides), and
//   2. the edge type carries traffic (EDGE_IS_TRAFFIC_BY_TYPE; unmapped ⇒ NOT traffic).
// Together they cover exactly the three hops — pod → ingress-svc (target ∈ set),
// ingress-svc → ingress-pod (both ∈ set), ingress-pod → backend-svc (source ∈ set) —
// while leaving the ingress pod's own scheduling (`pod-to-node`) and storage
// (`pod-mounts-pvc`) edges solid: those touch an ingress node but are not traffic
// routed through the gateway, and dashing them would assert a detour that does not
// exist. No new edge type needed: the traffic hops reuse the shared
// `pod-calls-service` / `service-selects-pod` types, so the distinction is per-edge
// (endpoint membership), not per-type. Immutable: only qualifying edges are cloned
// with `ingressPath: true`; every other element passes through.
function markIngressEdges(elements: cytoscape.ElementDefinition[]): cytoscape.ElementDefinition[] {
  const ingressIds = collectIngressNodeIds(elements);
  if (ingressIds.size === 0) {
    return elements;
  }
  return elements.map((el) => {
    if (el.group !== 'edges') {
      return el;
    }
    const data = el.data as cytoscape.EdgeDataDefinition;
    const { source, target, edgeType } = data;
    const touchesIngress =
      (typeof source === 'string' && ingressIds.has(source)) || (typeof target === 'string' && ingressIds.has(target));
    if (touchesIngress && isTrafficEdgeType(edgeType)) {
      return { ...el, data: { ...data, ingressPath: true } };
    }
    return el;
  });
}

export function normalizeGraph(raw: unknown): NormalizeResult {
  if (!isPlainObject(raw)) {
    return { elements: [], errors: ['payload is not an object'] };
  }

  const errors: string[] = [];
  const container = resolveContainer(raw);
  const rawNodes = Array.isArray(container.nodes) ? (container.nodes as unknown[]) : [];
  const rawEdges = Array.isArray(container.edges) ? (container.edges as unknown[]) : [];

  if (!Array.isArray(container.nodes)) {
    errors.push('payload.nodes is missing or not an array');
  }
  if (!Array.isArray(container.edges)) {
    errors.push('payload.edges is missing or not an array');
  }

  // Pure-function pipeline (D2): node-worst pre-pass (pod-to-node edges) → nodes → edges
  // (validated against node ids) → controller enrichment (decorate backend controllers from
  // child pods). Element order = backend payload order (nodes then edges); error order
  // (container-shape, node-parse, edge-parse) preserved.
  const nodeWorstFromPods = computeNodeWorstViaPodToNode(rawNodes, rawEdges);
  const nodes = parseNodes(rawNodes, nodeWorstFromPods);
  const edges = parseEdges(rawEdges, nodes.nodeIds);
  const enrichedNodes = enrichControllers(nodes.elements);

  // Post-pass: dash-flag the ingress-gateway path edges (see markIngressEdges).
  const elements = markIngressEdges([...enrichedNodes, ...edges.elements]);

  return {
    elements,
    errors: [...errors, ...nodes.errors, ...edges.errors],
  };
}
