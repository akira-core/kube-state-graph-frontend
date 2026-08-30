import { formatUsage } from '../format/measurements';
import { isPlainObject } from '../guards/isPlainObject';

// One promoted attribute row for a node. Shared shape between the floating hover tooltip's
// promoted attrs and the pinned (top-right) selection tooltip — same source, two render paths.
export interface NodeAttribute {
  key: string;
  value: string;
  // Wrap instead of clip — for long values like a formatted usage reading.
  wrap?: boolean;
}

// Raw label keys promoted to attribute rows on a claim, in display order. Kept as label
// reads rather than typed fields because the backend carries them inside `labels`.
const PROMOTED_STORAGE_LABELS = ['volumename', 'svm'] as const;

// EVERY label key this module lifts into an attribute row. The tooltip feeds it to
// `toLabelRows` so a promoted key is not also listed verbatim below the divider — one
// source, so adding a promotion here cannot leave a duplicate row behind.
export const PROMOTED_LABEL_KEYS: readonly string[] = ['role', ...PROMOTED_STORAGE_LABELS];

// A label bag is `map[string]string` upstream, but this function's input is an untyped
// data bag, so both the container and the value are guarded before use.
function readLabel(labels: unknown, key: string): string | undefined {
  if (!isPlainObject(labels)) {
    return undefined;
  }
  const value = labels[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// Single source for a node's promoted attributes, consumed by BOTH the floating hover
// tooltip and the pinned selection tooltip so the two never drift. Only emits rows that
// HAVE a value (no empty rows). Backend D6 namespace / application groups are kind-LESS
// in data (invisible to the kind filter + icon legend), so a synthetic kind is surfaced;
// cluster groups likewise. A real data.kind (leaf / k8s node / enriched controller) wins.
// Accepts the raw node `data` bag (cytoscape `NodeDataDefinition` or the hover layer's
// `Record<string, unknown>`); every read is guarded so untyped values narrow safely.
export function buildNodeAttributes(data: Readonly<Record<string, unknown>>): NodeAttribute[] {
  const attrs: NodeAttribute[] = [];

  const kindValue =
    typeof data.kind === 'string'
      ? data.kind
      : data.isApplication === true
        ? 'application'
        : data.isNamespace === true
          ? 'namespace'
          : data.isCluster === true
            ? 'cluster'
            : undefined;
  if (kindValue !== undefined) {
    attrs.push({ key: 'kind', value: kindValue });
  }
  // The backend's `role` marker, verbatim and unrestricted. It qualifies what a node IS,
  // so it reads directly under `kind`. Load-bearing for the two ingress shapes: both are
  // ordinary `type="service"` nodes and this label is the ONLY thing telling them apart,
  // yet they behave differently under the ingress toggle (see collectIngressNodeIds).
  // Promoted for any value, not just the ingress pair — an unknown role must stay legible.
  const role = readLabel(data.labels, 'role');
  if (role !== undefined) {
    attrs.push({ key: 'role', value: role });
  }
  if (typeof data.namespace === 'string') {
    attrs.push({ key: 'namespace', value: data.namespace });
  }
  // ArgoCD application — promoted on any leaf carrying one (pod / service / pvc per
  // backend D6, plus enriched controllers). Skipped on the decorative application GROUP
  // node, whose synthetic `kind: application` + name already convey it.
  if (typeof data.application === 'string' && data.application.length > 0 && data.isApplication !== true) {
    attrs.push({ key: 'application', value: data.application });
  }
  if (Array.isArray(data.ipAddress) && data.ipAddress.length > 0) {
    attrs.push({ key: 'ipAddress', value: data.ipAddress.filter((ip) => typeof ip === 'string').join(', ') });
  }
  // The claim's StorageClass NAME, on the PVC itself (the storageclass node is gone).
  if (typeof data.storageclass === 'string' && data.storageclass.length > 0) {
    attrs.push({ key: 'storageclass', value: data.storageclass });
  }
  // The backing PV name and serving SVM, read out of a claim's raw labels. These are the
  // two keys the NetApp join hinges on — `volumename` is what Harvest's relabel rule
  // matches a FlexVol to, `svm` scopes the QoS reads — so when a claim fails to reach an
  // aggregate they are the first things an operator checks. Promoting them puts them beside
  // storageclass/usage instead of buried in the raw label list. An absent `svm` on a claim
  // that HAS a volumename is itself the signal that no Harvest series matched.
  for (const key of PROMOTED_STORAGE_LABELS) {
    const value = readLabel(data.labels, key);
    if (value !== undefined) {
      attrs.push({ key, value });
    }
  }
  // ONTAP health on a netapp-aggr / netapp-node, verbatim. Absent stays absent — the
  // backend omits it when it has no status data, which is NOT 'degraded'.
  if (typeof data.health === 'string' && data.health.length > 0) {
    attrs.push({ key: 'health', value: data.health });
  }
  // Kubernetes' own Ready condition on a K8s node, verbatim. Absent stays absent — the
  // backend omits it when the node has no Ready series, which is NOT 'Unknown' (that
  // literal is reserved for a kubelet that stopped reporting).
  if (typeof data.readyStatus === 'string' && data.readyStatus.length > 0) {
    attrs.push({ key: 'ready', value: data.readyStatus });
  }
  // Storage usage, formatted here rather than carried pre-formatted so the raw bytes stay
  // available to the on-node fill. Same row for a pvc and a netapp-aggr — one shape, one
  // formatter. A partial reading renders what it has; nothing renders when neither half
  // resolved (formatUsage returns undefined), never a placeholder 0.
  const usage = data.usage;
  if (isPlainObject(usage)) {
    const used = typeof usage.usedBytes === 'number' ? usage.usedBytes : undefined;
    const capacity = typeof usage.capacityBytes === 'number' ? usage.capacityBytes : undefined;
    const formatted = formatUsage(used, capacity);
    if (formatted !== undefined) {
      attrs.push({ key: 'usage', value: formatted });
    }
  }
  return attrs;
}
