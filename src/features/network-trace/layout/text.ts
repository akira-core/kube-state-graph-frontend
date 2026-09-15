import { countWord } from '../../../shared/format/countWord';
import { formatDeltaBps, formatUsage } from '../../../shared/format/measurements';
import { BODY_MIN, BODY_PAD_BOTTOM, CARD_LINE_H, CARD_W, HEADER_H, LEAF_W } from '../../sankey-canvas';
import type { NodeUsage, TraceDirection, TraceModelOk, TraceNode } from '../model/types';
import { sum, tracedEdges } from '../model/util';

import { CLIENT_CELL_W, CLIENT_COL_GAP, CLIENT_COLS, CLIENT_PAD, type ClientCol } from './constants';

/** Half-width counts 1, CJK and everything above the CJK radicals 2 — per code point, so a
 * surrogate pair (an emoji, CJK Extension B) is one wide cell, never two half cells. */
function cells(ch: string): number {
  return (ch.codePointAt(0) ?? 0) > 0x2e7f ? 2 : 1;
}

/**
 * SVG has no text-overflow: card text clips itself. A rough width, but the body is
 * monospace and the full value is always in the tooltip. Walks code points, so the cut
 * never splits a surrogate pair.
 */
export function clip(v: string, budget: number): string {
  let w = 0;
  let out = '';
  for (const ch of v) {
    w += cells(ch);
    if (w > budget) {
      return `${out}…`;
    }
    out += ch;
  }
  return v;
}

function cellWidth(v: string): number {
  let w = 0;
  for (const ch of v) {
    w += cells(ch);
  }
  return w;
}

function padCell(v: string, cells: number): string {
  return v + ' '.repeat(Math.max(0, cells - cellWidth(v)));
}

function clientCols(n: TraceNode): ClientCol[] {
  const cs = n.clients;
  if (cs === null || cs.length === 0) {
    return [];
  }
  return CLIENT_COLS.filter((col) => cs.some((c) => c[col.key] !== null));
}

/** The clients table as monospace lines: a header, then one aligned row per client. */
export function clientTableLines(n: TraceNode): string[] {
  const cols = clientCols(n);
  if (cols.length === 0 || n.clients === null) {
    return [];
  }
  const widths = cols.map((col) =>
    Math.min(col.budget + 1, Math.max(col.key.length, ...(n.clients ?? []).map((c) => cellWidth(c[col.key] ?? ''))))
  );
  const row = (cells: string[]): string =>
    cells
      .map((v, i) => padCell(v, widths[i] ?? 0))
      .join(' '.repeat(CLIENT_COL_GAP))
      .trimEnd();
  const header = row(cols.map((col) => col.key));
  const rows = (n.clients ?? []).map((c) => row(cols.map((col) => clip(c[col.key] ?? '', col.budget))));
  return [header, ...rows];
}

/**
 * Card width for a leaf: the clients table's width, never narrower than a leaf card. The
 * layout passes the table it already built for `cardText`; on its own the function builds it.
 */
export function leafCardW(n: TraceNode, table?: readonly string[]): number {
  if (n.role === 'owner') {
    return CARD_W; // owners are free-form strings; a leaf-width card clips them
  }
  const lines = table ?? clientTableLines(n);
  if (lines.length === 0) {
    return LEAF_W;
  }
  const cells = Math.max(...lines.map(cellWidth));
  return Math.max(LEAF_W, CLIENT_PAD * 2 + cells * CLIENT_CELL_W);
}

function hasUsage(n: TraceNode): boolean {
  return n.usage !== null && n.usage.usedBytes !== undefined && n.usage.capacityBytes !== undefined;
}

/** The shared `formatUsage` wording, so a trace card and a storage card describe usage alike. */
export function usageText(u: NodeUsage | null): string {
  if (u === null) {
    return '';
  }
  return formatUsage(u.usedBytes, u.capacityBytes) ?? '';
}

/** The subtitle word for a card: the wire kind, or the role of a synthesised card. */
export function typeWord(n: TraceNode): string {
  if (n.kind === 'anchor') {
    return 'trace start';
  }
  if (n.role === 'ns') {
    return 'namespace';
  }
  if (n.role === 'app') {
    return 'application';
  }
  if (n.role === 'owner') {
    return 'owner';
  }
  if (n.kind === 'leaf') {
    return n.type ?? 'host';
  }
  return n.role;
}

/**
 * What a card prints, one list per card so the height and the drawing can never disagree
 * (the height is this list's length; the chart iterates the same list).
 */
export interface CardText {
  label: string;
  subtitle: string;
  extraLines: string[];
  cornerLabel?: string;
}

function hopLines(n: TraceNode): string[] {
  const out: string[] = [];
  if (n.namespace !== null) {
    out.push(`ns/${n.namespace}`);
  }
  if (n.ontapCluster !== null) {
    out.push(n.ontapCluster);
  }
  if (hasUsage(n)) {
    out.push(`usage ${usageText(n.usage)}`);
  }
  return out;
}

function leafLines(n: TraceNode): string[] {
  const out: string[] = [];
  if (n.namespace !== null) {
    out.push(`ns/${n.namespace}`);
  }
  if (n.noFlow) {
    out.push('no flow');
    return out;
  }
  const ifc = n.iface !== '' ? n.iface : n.localIface;
  out.push(ifc !== '' ? `${ifc} · ${formatDeltaBps(n.bps)}` : formatDeltaBps(n.bps));
  return out;
}

function ownerAmountLine(n: TraceNode): string {
  if (!(n.bps > 0)) {
    return 'metered at port';
  }
  return n.meteredPorts < n.portCount ? `${formatDeltaBps(n.bps)} (partial ports)` : formatDeltaBps(n.bps);
}

/**
 * The text of one card. `table` is the clients table when the caller already built it
 * (the layout needs it for the width too); otherwise it is built here.
 */
export function cardText(n: TraceNode, model: TraceModelOk, table?: readonly string[]): CardText {
  if (n.kind === 'anchor') {
    const inv = model.investigation;
    return {
      label: inv?.iface ?? n.iface,
      subtitle: 'trace start',
      extraLines: [`${n.dirLabel ?? ''} · ${formatDeltaBps(inv?.deltaBps ?? 0)}`],
    };
  }
  if (n.kind === 'node') {
    const tier = n.tier !== null && n.tier !== n.role ? ` · ${n.tier}` : '';
    return { label: n.label, subtitle: `${n.role}${tier}`, extraLines: hopLines(n) };
  }
  if (n.role === 'pod') {
    return { label: n.label, subtitle: 'pod', extraLines: leafLines(n) };
  }
  if (n.role === 'ns' || n.role === 'app') {
    const extra = n.role === 'app' && n.namespace !== null ? [`ns/${n.namespace}`] : [];
    return {
      label: n.label,
      subtitle: typeWord(n),
      extraLines: [...extra, countWord(n.podCount, 'pod'), `total ${formatDeltaBps(n.bps)}`],
    };
  }
  if (n.role === 'owner') {
    return {
      label: clip(n.label, 34),
      subtitle: 'owner',
      extraLines: [ownerAmountLine(n), `${countWord(n.clientCount, 'client')} · ${countWord(n.portCount, 'port')}`],
    };
  }
  // A trace-stop leaf. With clients it is a table; the synthetic `switch:iface` id is not
  // a title (the ribbon leads back to it), only a name the wire gave is. The corner counts
  // the clients whether or not they grew an owner card — the owner band says the rest; a
  // stop with no clients (the end device itself) has no corner.
  const lines = table ?? clientTableLines(n);
  const nc = n.clients?.length ?? 0;
  const corner = nc === 0 ? {} : { cornerLabel: countWord(nc, 'client') };
  if (lines.length > 0) {
    const ns = n.namespace !== null ? [`ns/${n.namespace}`] : [];
    return {
      label: n.named ? n.label : '',
      subtitle: n.type ?? 'host',
      extraLines: [...ns, ...lines, formatDeltaBps(n.bps)],
      ...corner,
    };
  }
  return { label: n.label, subtitle: n.type ?? 'host', extraLines: leafLines(n), ...corner };
}

/** Header height of a hop box: title + subtitle, then one line per attribute (its `cardText` lines). */
export function hopHeaderH(text: CardText): number {
  return HEADER_H + CARD_LINE_H * text.extraLines.length;
}

/** Natural height of a leaf-style card from its text alone (slots may make it taller). */
export function leafCardH(text: CardText): number {
  return HEADER_H + CARD_LINE_H * text.extraLines.length + BODY_PAD_BOTTOM;
}

export const ANCHOR_MIN_H = HEADER_H + CARD_LINE_H + BODY_MIN;

/**
 * A node's flow for in-column ordering: the amount on the traced side — what arrives from
 * the start under a destination trace (sum in), what leaves toward it under a source trace
 * (sum out). Residuals are excluded: the unaccounted amount must not decide who sits on
 * top. The anchor has no edge on its traced side and reads 0; it is alone in its column.
 * O(edges): never call inside a comparator; precompute into a Map.
 */
export function traceFlowOf(n: TraceNode, direction: TraceDirection): number {
  return sum(tracedEdges(n, direction));
}
