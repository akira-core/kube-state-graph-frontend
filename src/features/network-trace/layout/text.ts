import { formatBitsPerSec, formatBytes, formatDeltaBps } from '../../../shared/format/measurements';
import { BODY_MIN, BODY_PAD_BOTTOM, CARD_LINE_H, CARD_W, HEADER_H, LEAF_W } from '../../sankey-canvas';
import type { NodeUsage, TraceDirection, TraceModelOk, TraceNode, TraceWrapper } from '../model/types';
import { sum } from '../model/util';

import { CLIENT_CELL_W, CLIENT_COL_GAP, CLIENT_COLS, CLIENT_PAD, type ClientCol } from './constants';

/**
 * SVG has no text-overflow: card text clips itself. Half-width counts 1, CJK 2 — a rough
 * width, but the body is monospace and the full value is always in the tooltip.
 */
export function clip(v: string, budget: number): string {
  let w = 0;
  for (let i = 0; i < v.length; i += 1) {
    w += v.charCodeAt(i) > 0x2e7f ? 2 : 1;
    if (w > budget) {
      return `${v.slice(0, i)}…`;
    }
  }
  return v;
}

function cellWidth(v: string): number {
  let w = 0;
  for (let i = 0; i < v.length; i += 1) {
    w += v.charCodeAt(i) > 0x2e7f ? 2 : 1;
  }
  return w;
}

function padCell(v: string, cells: number): string {
  return v + ' '.repeat(Math.max(0, cells - cellWidth(v)));
}

export function clientCols(n: TraceNode): ClientCol[] {
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

/** Card width for a leaf: the clients table's width, never narrower than a leaf card. */
export function leafCardW(n: TraceNode): number {
  if (n.role === 'owner') {
    return CARD_W; // owners are free-form strings; a leaf-width card clips them
  }
  const lines = clientTableLines(n);
  if (lines.length === 0) {
    return LEAF_W;
  }
  const cells = Math.max(...lines.map(cellWidth));
  return Math.max(LEAF_W, CLIENT_PAD * 2 + cells * CLIENT_CELL_W);
}

export function hasUsage(n: TraceNode | TraceWrapper): boolean {
  return n.usage !== null && n.usage.usedBytes !== undefined && n.usage.capacityBytes !== undefined;
}

export function usageText(u: NodeUsage | null): string {
  if (u === null) {
    return '';
  }
  const used = u.usedBytes;
  const cap = u.capacityBytes;
  if (used !== undefined && cap !== undefined) {
    return `${formatBytes(used)} / ${formatBytes(cap)}${cap > 0 ? ` (${String(Math.round((used / cap) * 100))}%)` : ''}`;
  }
  return used !== undefined ? `used ${formatBytes(used)}` : cap !== undefined ? `capacity ${formatBytes(cap)}` : '';
}

/** The subtitle word for a card: the wire kind, or the role of a synthesised card. */
export function typeWord(n: TraceNode | TraceWrapper): string {
  if (n.kind === 'wrapper') {
    return 'node';
  }
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
  const ifc = n.iface !== '' ? n.iface : n.localIface;
  out.push(n.noFlow ? 'no flow' : `${ifc !== '' ? `${ifc} · ` : ''}${formatDeltaBps(n.bps)}`);
  return out;
}

export function cardText(n: TraceNode, model: TraceModelOk): CardText {
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
      extraLines: [
        ...extra,
        `${String(n.podCount)} pod${n.podCount === 1 ? '' : 's'}`,
        `total ${formatDeltaBps(n.bps)}`,
      ],
    };
  }
  if (n.role === 'owner') {
    return {
      label: clip(n.label, 34),
      subtitle: 'owner',
      extraLines: [
        n.bps > 0
          ? `${formatDeltaBps(n.bps)}${n.meteredPorts < n.portCount ? ' (partial ports)' : ''}`
          : 'metered at port',
        `${String(n.clientCount)} client${n.clientCount === 1 ? '' : 's'} · ${String(n.portCount)} port${n.portCount === 1 ? '' : 's'}`,
      ],
    };
  }
  // A trace-stop leaf. With clients it is a table; the synthetic `switch:iface` id is not
  // a title (the ribbon leads back to it), only a name the wire gave is. The corner counts
  // the clients whether or not they grew an owner card — the owner band says the rest.
  const table = clientTableLines(n);
  const nc = n.clients?.length ?? 0;
  const cornerLabel = nc === 0 ? 'trace stop' : nc === 1 ? 'client' : `${String(nc)} clients`;
  if (table.length > 0) {
    const ns = n.namespace !== null ? [`ns/${n.namespace}`] : [];
    return {
      label: n.named ? n.label : '',
      subtitle: n.type ?? 'host',
      extraLines: [...ns, ...table, formatDeltaBps(n.bps)],
      cornerLabel,
    };
  }
  return { label: n.label, subtitle: n.type ?? 'host', extraLines: leafLines(n), cornerLabel };
}

/** Header height of a hop box: title + subtitle, then one line per attribute. */
export function hopHeaderH(n: TraceNode): number {
  return HEADER_H + CARD_LINE_H * hopLines(n).length;
}

/** Natural height of a leaf-style card from its text alone (slots may make it taller). */
export function leafCardH(text: CardText): number {
  return HEADER_H + CARD_LINE_H * text.extraLines.length + BODY_PAD_BOTTOM;
}

export const ANCHOR_MIN_H = HEADER_H + CARD_LINE_H + BODY_MIN;

/** Residuals below the model's noise epsilon are neither drawn nor given space. */
export function resIn(n: TraceNode): number {
  return n.kind === 'node' && n.otherIn > n.resEps ? n.otherIn : 0;
}
export function resOut(n: TraceNode): number {
  return n.kind === 'node' && n.otherOut > n.resEps ? n.otherOut : 0;
}

/**
 * A node's flow for in-column ordering: the amount on the traced side — what arrives from
 * the start under a destination trace (sum in), what leaves toward it under a source trace
 * (sum out). Residuals are excluded: the unaccounted amount must not decide who sits on
 * top. The anchor has no edge on its traced side and reads 0; it is alone in its column.
 * O(edges): never call inside a comparator; precompute into a Map.
 */
export function traceFlowOf(n: TraceNode, direction: TraceDirection): number {
  return sum(direction === 'destination' ? n.inEdges : n.outEdges);
}

export { formatBitsPerSec };
