// Small helpers shared by every derive step.

import type { TraceDirection, TraceEdge, TraceNode } from './types';

/** Separator for composite keys: ids and tier names are free strings, so NUL cannot collide. */
export const SEP = '\0';

/**
 * Plain code-unit string order for sort tie-breaks. `localeCompare` depends on the runtime's
 * locale data, and a golden snapshot must not.
 */
export function cmpString(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

// Edges always run in packet direction (left → right). Which end is nearer the trace start
// depends on the direction: under a destination trace the start is upstream and packets
// flow away from it, under a source trace the start is downstream. The three helpers
// below say "toward / away from the start" once, instead of a `direction === …` at each site.

/** A node's edges on the traced side: what arrives from the start (destination) or leaves toward it (source). */
export function tracedEdges(n: TraceNode, direction: TraceDirection): TraceEdge[] {
  return direction === 'destination' ? n.inEdges : n.outEdges;
}

/** The `[from, to]` of an edge running `up → down` along the trace. */
export function fromTo<T>(direction: TraceDirection, up: T, down: T): [T, T] {
  return direction === 'destination' ? [up, down] : [down, up];
}

/** The end of an edge nearer the trace start. */
export function upstreamOf<T>(direction: TraceDirection, from: T, to: T): T {
  return direction === 'destination' ? from : to;
}

/** The end of an edge farther from the trace start (the trace-stop side). */
export function downstreamOf<T>(direction: TraceDirection, from: T, to: T): T {
  return direction === 'destination' ? to : from;
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function sum(edges: ReadonlyArray<{ bps: number }>): number {
  return edges.reduce((s, e) => s + e.bps, 0);
}

/**
 * A lookup that the derive pipeline guarantees to succeed: every id in `order` is a key of
 * the node map, every edge endpoint was resolved by normalize. Throwing names the broken
 * invariant instead of letting `undefined` travel on as `NaN` coordinates.
 */
export function mustGet<K, V>(map: ReadonlyMap<K, V>, key: K, what: string): V {
  const v = map.get(key);
  if (v === undefined) {
    throw new Error(`network-trace: ${what} "${String(key)}" is missing`);
  }
  return v;
}
