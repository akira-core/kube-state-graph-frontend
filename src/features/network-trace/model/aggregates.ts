import { resIn, resOut } from './residuals';
import type { TraceModelOk } from './types';
import { cmpString } from './util';

export interface NamespaceAgg {
  namespace: string;
  /** Pods with an edge into the namespace card (= the card's podCount, through app cards). */
  pods: number;
  /** Every leaf pod of the namespace on the chart, including no-flow ones. */
  podsTotal: number;
  /** The namespace card's total; 0 when the namespace has no card at all. */
  total: number;
}

/**
 * The one namespace subtotal every table reads. The chart's namespace card is a derived
 * node — its pod count is "pods with an edge in"; a table lists every pod on the chart.
 * Both are right, they answer different questions, so both are given with their names.
 */
export function namespaceAggs(model: TraceModelOk): NamespaceAgg[] {
  const byNs = new Map<string, NamespaceAgg>();
  const touch = (namespace: string): NamespaceAgg => {
    let a = byNs.get(namespace);
    if (a === undefined) {
      a = { namespace, pods: 0, podsTotal: 0, total: 0 };
      byNs.set(namespace, a);
    }
    return a;
  };
  for (const n of model.nodes) {
    if (n.kind === 'leaf' && n.role === 'pod' && n.namespace !== null) {
      touch(n.namespace).podsTotal += 1;
    }
  }
  for (const n of model.nodes) {
    if (n.role === 'ns') {
      // One card per namespace per cluster: the table sums a namespace over its clusters.
      const a = touch(n.label);
      a.pods += n.podCount;
      a.total += n.bps;
    }
  }
  return [...byNs.values()].sort((a, b) => b.total - a.total || cmpString(a.namespace, b.namespace));
}

export interface HopBalanceRow {
  id: string;
  label: string;
  col: number;
  noFlow: boolean;
  tracedIn: number;
  tracedOut: number;
  otherIn: number;
  otherOut: number;
}

/** The per-hop balance sheet: traced in + other in = traced out + other out. */
export function hopBalanceRows(model: TraceModelOk): HopBalanceRow[] {
  return model.nodes
    .filter((n) => n.kind === 'node')
    .sort((a, b) => a.col - b.col)
    .map((n) => ({
      id: n.id,
      label: n.label,
      col: n.col,
      noFlow: n.noFlow,
      tracedIn: n.tracedIn,
      tracedOut: n.tracedOut,
      otherIn: resIn(n),
      otherOut: resOut(n),
    }));
}
