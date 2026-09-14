/**
 * The one row order for a card's tooltip, so the storage and trace Sankeys describe a
 * node the same way: kind / name, namespace, ontap_cluster, the feature's own identity
 * rows, the flow lines, membership / derivation notes, usage, status, health, model, raw
 * perf readings, alerts, clients, id, and any trailing remark.
 *
 * Every field is optional; an absent one emits no row rather than an empty line.
 */
export interface NodeTooltipRows {
  /** `${kind} / ${label}` — the only mandatory row. */
  head: string;
  namespace?: string;
  ontapCluster?: string;
  /** Feature-specific identity rows shown before the flow (an SVM, a claim aggregate). */
  identity?: readonly string[];
  flow?: readonly string[];
  /** Membership counts and "derived from …" notes, shown right after the flow. */
  membership?: readonly string[];
  usage?: string;
  /** The full status row text after the `status ` prefix, fold note included. */
  status?: string;
  health?: string;
  model?: string;
  /** Raw readings already formatted as `label value (raw)` — see `rawReading`. */
  perf?: readonly string[];
  alerts?: readonly string[];
  clients?: readonly string[];
  id?: string;
  trailer?: readonly string[];
}

/**
 * A hardware / perf reading, shown RAW and uncoloured on purpose: `cpu_busy_pct` is a
 * reading, not a threshold, and colouring it would invent a health judgement the backend
 * never made. `health` is the only field that carries one.
 */
export function rawReading(label: string, value: number | undefined, format: (v: number) => string): string[] {
  return value === undefined ? [] : [`${label} ${format(value)} (raw)`];
}

export function nodeTooltipRows(r: NodeTooltipRows): string[] {
  return [
    r.head,
    ...(r.namespace !== undefined ? [`namespace ${r.namespace}`] : []),
    ...(r.ontapCluster !== undefined ? [`ontap_cluster ${r.ontapCluster}`] : []),
    ...(r.identity ?? []),
    ...(r.flow ?? []),
    ...(r.membership ?? []),
    ...(r.usage !== undefined && r.usage.length > 0 ? [r.usage] : []),
    ...(r.status !== undefined ? [`status ${r.status}`] : []),
    ...(r.health !== undefined ? [`health ${r.health}`] : []),
    ...(r.model !== undefined ? [`model ${r.model}`] : []),
    ...(r.perf ?? []),
    ...(r.alerts ?? []),
    ...(r.clients ?? []),
    ...(r.id !== undefined ? [`id ${r.id}`] : []),
    ...(r.trailer ?? []),
  ];
}
