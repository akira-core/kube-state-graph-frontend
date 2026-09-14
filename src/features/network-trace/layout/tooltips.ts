import { formatBitsPerSec, formatBytes, formatDeltaBps } from '../../../shared/format/measurements';
import { KIND_LABEL } from '../model/classify';
import type { TraceDirection, TraceEdge, TraceModelOk, TraceNode, TraceWrapper } from '../model/types';
import { mustGet, sum } from '../model/util';

import { resIn, resOut, typeWord, usageText } from './text';

/** Clients behind the far (downstream) end of a ribbon, for the ribbon's tooltip. */
function clientsOnRibbon(e: TraceEdge, model: TraceModelOk): string[] | null {
  const from = mustGet(model.nodeMap, e.fromId, 'node');
  const to = mustGet(model.nodeMap, e.toId, 'node');
  const toOwner = to.role === 'owner' || from.role === 'owner';
  const down = model.direction === 'destination' ? to : from;
  const up = model.direction === 'destination' ? from : to;
  const far = toOwner ? up : down;
  if (far.clients === null) {
    return null;
  }
  return far.clients.map((c) => c.hostname ?? c.ip ?? '');
}

export function bandTooltipLines(e: TraceEdge, model: TraceModelOk): string[] {
  const from = mustGet(model.nodeMap, e.fromId, 'node');
  const to = mustGet(model.nodeMap, e.toId, 'node');
  const head = `${from.label}${e.fromIface !== '' ? ` ${e.fromIface}` : ''} → ${to.label}${e.toIface !== '' ? ` ${e.toIface}` : ''}`;
  if (e.owns) {
    return [head, 'ownership only — the port is shared, its amount stays on the port'];
  }
  const lines = [head, e.isAnchor ? `trace start ${formatDeltaBps(e.bps)}` : formatDeltaBps(e.bps)];
  if (e.backward) {
    lines.push('backflow — against the majority direction');
  }
  if (e.lateral) {
    lines.push('same-column interconnect');
  }
  if (e.derived) {
    lines.push('derived — the same measurement regrouped');
  }
  if (e.tier !== null) {
    lines.push(`tier ${e.tier}`);
  }
  if (e.attribution === 'split') {
    lines.push('evenly split estimate');
  }
  if (e.namespace !== null) {
    lines.push(`namespace ${e.namespace}`);
  }
  const clients = clientsOnRibbon(e, model);
  if (clients !== null && clients.length > 1) {
    lines.push(`clients ${clients.join(', ')}`);
  }
  return lines;
}

function wrapperEdges(w: TraceWrapper, model: TraceModelOk): { inb: TraceEdge[]; outb: TraceEdge[] } {
  let inb: TraceEdge[] = [];
  let outb: TraceEdge[] = [];
  for (const id of w.podIds) {
    const p = mustGet(model.nodeMap, id, 'pod');
    inb = inb.concat(p.inEdges);
    outb = outb.concat(p.outEdges);
  }
  return { inb, outb };
}

/**
 * Node tooltip, in the storage Sankey's order: kind / name, namespace, ontap_cluster, the
 * flow lines, usage, status, health, model, perf (raw), alerts, clients, id.
 */
export function nodeTooltipLines(n: TraceNode | TraceWrapper, model: TraceModelOk): string[] {
  if (n.kind === 'anchor') {
    const inv = model.investigation;
    return [
      'trace start',
      `iface ${inv?.iface ?? n.iface}`,
      `${n.dirLabel ?? ''} ${formatDeltaBps(inv?.deltaBps ?? 0)}`,
      ...(n.note !== '' ? [`note ${n.note}`] : []),
    ];
  }
  const isW = n.kind === 'wrapper';
  const lines: string[] = [`${typeWord(n)} / ${n.label}`];
  if (!isW && n.namespace !== null && n.role !== 'ns') {
    lines.push(`namespace ${n.namespace}`);
  }
  if (!isW && n.ontapCluster !== null) {
    lines.push(`ontap_cluster ${n.ontapCluster}`);
  }
  const { inb, outb } = n.kind === 'wrapper' ? wrapperEdges(n, model) : { inb: n.inEdges, outb: n.outEdges };
  if (n.kind !== 'wrapper' && n.noFlow) {
    lines.push('no drawable flow edge (no flow)');
  } else if (n.kind !== 'wrapper' && n.role === 'owner' && !(n.bps > 0)) {
    lines.push('in — (metered at the port: the port also carries other owners)');
  } else {
    lines.push(`in ${formatBitsPerSec(sum(inb))}`);
    lines.push(`out ${formatBitsPerSec(sum(outb))}`);
  }
  if (isW) {
    lines.push('derived from member pods');
    lines.push(`${String(n.podIds.length)} pod${n.podIds.length === 1 ? '' : 's'}`);
  } else if (n.kind === 'node') {
    if (resIn(n) > 0) {
      lines.push(`other in ${formatBitsPerSec(n.otherIn)}`);
    }
    if (resOut(n) > 0) {
      lines.push(`other out ${formatBitsPerSec(n.otherOut)}`);
    }
  } else if (n.role === 'owner') {
    if (n.bps > 0) {
      lines.push(`derived from port cards${n.meteredPorts < n.portCount ? ' (partial ports)' : ''}`);
    }
    lines.push(`${String(n.clientCount)} client${n.clientCount === 1 ? '' : 's'}`);
    lines.push(`${String(n.portCount)} port${n.portCount === 1 ? '' : 's'}`);
  } else if (n.role === 'ns' || n.role === 'app') {
    lines.push('derived from member pods');
    lines.push(`${String(n.podCount)} pod${n.podCount === 1 ? '' : 's'}`);
  }
  if (n.usage !== null) {
    lines.push(`usage ${usageText(n.usage)}`);
  }
  if (n.status !== null) {
    const fold =
      !isW && (n.role === 'ns' || n.role === 'app')
        ? ' (worst of member pods)'
        : isW
          ? ' (worst of node and member pods)'
          : '';
    lines.push(`status ${n.status}${fold}`);
  }
  const info = n.info;
  if (info !== null) {
    if (info.health !== undefined) {
      lines.push(`health ${info.health}`);
    }
    if (info.model !== undefined) {
      lines.push(`model ${info.model}`);
    }
    if (info.perf !== undefined) {
      for (const [k, v] of Object.entries(info.perf)) {
        lines.push(`${k} ${k === 'total_bytes_per_sec' ? `${formatBytes(v)}/s` : String(v)} (raw)`);
      }
    }
    for (const a of info.alerts ?? []) {
      lines.push(`alert ${a}`);
    }
  }
  const clients = isW ? null : n.clients;
  if (clients !== null) {
    clients.forEach((c, i) => {
      lines.push(
        `${clients.length === 1 ? 'client' : `client ${String(i + 1)}`} ${[c.ip, c.hostname, c.owner].filter((v) => v !== null).join(' · ')}`
      );
    });
  }
  const synthetic = !isW && (n.role === 'ns' || n.role === 'app' || n.role === 'owner');
  if (!synthetic && n.id !== n.label) {
    lines.push(`id ${n.id}`);
  }
  return lines;
}

export function residualTooltipLines(n: TraceNode, side: 'in' | 'out'): string[] {
  const amount = side === 'in' ? n.otherIn : n.otherOut;
  return [
    `${n.label} · other ${side} ${formatDeltaBps(amount)}`,
    `traced in ${formatBitsPerSec(n.tracedIn)} / out ${formatBitsPerSec(n.tracedOut)}`,
  ];
}

/** The caption of a column holding only frames (every pod hidden but the root's). */
export function wrapperColCaption(ci: number): string {
  return `Hop ${String(ci)} · node / pod`;
}

export function colCaption(col: readonly TraceNode[], direction: TraceDirection): string {
  const first = col[0];
  if (first === undefined) {
    return '';
  }
  const kinds = new Set(col.map((n) => n.kind));
  // The anchor column holds only the anchor: a no-flow card has no edge, lands in column 0
  // and must not be captioned as the trace start.
  if (kinds.has('anchor') && col.length === 1) {
    return direction === 'destination' ? 'Trace start (in)' : 'Trace start (out)';
  }
  if (kinds.has('node')) {
    const role = first.role;
    const same = role !== 'switch' && col.every((n) => n.kind === 'node' && n.role === role);
    return `Hop ${String(first.col)}${same ? ` · ${KIND_LABEL[role] ?? role}` : ''}`;
  }
  if (col.every((n) => n.role === 'owner')) {
    return 'Trace stop · owner';
  }
  if (col.every((n) => n.kind === 'leaf' && n.role === 'leaf' && n.ownerLinked)) {
    return `Hop ${String(first.col)} · port`;
  }
  if (col.every((n) => n.role === 'ns')) {
    return 'Trace stop · namespace';
  }
  if (col.some((n) => n.k8sNode !== null)) {
    return `Hop ${String(first.col)} · node / pod`;
  }
  if (col.every((n) => n.kind === 'leaf' && n.role === 'pod')) {
    return `Hop ${String(first.col)} · pod`;
  }
  if (col.every((n) => n.kind === 'leaf' && n.role === 'app')) {
    return `Hop ${String(first.col)} · application`;
  }
  if (col.some((n) => n.kind === 'leaf' && (n.role === 'pod' || n.role === 'app'))) {
    return `Hop ${String(first.col)}`;
  }
  return 'Trace stop';
}
