import { formatBitsPerSec, formatBytes, formatDeltaBps } from '../../../shared/format/measurements';
import { nodeTooltipRows } from '../../sankey-canvas';
import { bandOf, isClientPartition, k8sSubcol } from '../model/bands';
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

/** Node tooltip in the shared row order (see `nodeTooltipRows`), from the trace model's fields. */
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
  const { inb, outb } = n.kind === 'wrapper' ? wrapperEdges(n, model) : { inb: n.inEdges, outb: n.outEdges };
  const flow: string[] = [];
  if (n.kind !== 'wrapper' && n.noFlow) {
    flow.push('no drawable flow edge (no flow)');
  } else if (n.kind !== 'wrapper' && n.role === 'owner' && !(n.bps > 0)) {
    flow.push('in — (metered at the port: the port also carries other owners)');
  } else {
    flow.push(`in ${formatBitsPerSec(sum(inb))}`);
    flow.push(`out ${formatBitsPerSec(sum(outb))}`);
  }
  const membership: string[] = [];
  if (isW) {
    membership.push('derived from member pods');
    membership.push(`${String(n.podIds.length)} pod${n.podIds.length === 1 ? '' : 's'}`);
  } else if (n.kind === 'node') {
    if (resIn(n) > 0) {
      membership.push(`other in ${formatBitsPerSec(n.otherIn)}`);
    }
    if (resOut(n) > 0) {
      membership.push(`other out ${formatBitsPerSec(n.otherOut)}`);
    }
  } else if (n.role === 'owner') {
    if (n.bps > 0) {
      membership.push(`derived from port cards${n.meteredPorts < n.portCount ? ' (partial ports)' : ''}`);
    }
    membership.push(`${String(n.clientCount)} client${n.clientCount === 1 ? '' : 's'}`);
    membership.push(`${String(n.portCount)} port${n.portCount === 1 ? '' : 's'}`);
  } else if (n.role === 'ns' || n.role === 'app') {
    membership.push('derived from member pods');
    membership.push(`${String(n.podCount)} pod${n.podCount === 1 ? '' : 's'}`);
  }
  const fold =
    !isW && (n.role === 'ns' || n.role === 'app')
      ? ' (worst of member pods)'
      : isW
        ? ' (worst of node and member pods)'
        : '';
  const info = n.info;
  const perf =
    info?.perf === undefined
      ? []
      : Object.entries(info.perf).map(
          ([k, v]) => `${k} ${k === 'total_bytes_per_sec' ? `${formatBytes(v)}/s` : String(v)} (raw)`
        );
  const clients = isW ? null : n.clients;
  const synthetic = !isW && (n.role === 'ns' || n.role === 'app' || n.role === 'owner');
  return nodeTooltipRows({
    head: `${typeWord(n)} / ${n.label}`,
    ...(!isW && n.namespace !== null && n.role !== 'ns' ? { namespace: n.namespace } : {}),
    ...(!isW && n.ontapCluster !== null ? { ontapCluster: n.ontapCluster } : {}),
    flow,
    membership,
    ...(n.usage !== null ? { usage: `usage ${usageText(n.usage)}` } : {}),
    ...(n.status !== null ? { status: `${n.status}${fold}` } : {}),
    ...(info?.health !== undefined ? { health: info.health } : {}),
    ...(info?.model !== undefined ? { model: info.model } : {}),
    perf,
    alerts: (info?.alerts ?? []).map((a) => `alert ${a}`),
    clients:
      clients === null
        ? []
        : clients.map(
            (c, i) =>
              `${clients.length === 1 ? 'client' : `client ${String(i + 1)}`} ${[c.ip, c.hostname, c.owner].filter((v) => v !== null).join(' · ')}`
          ),
    ...(!synthetic && n.id !== n.label ? { id: n.id } : {}),
  });
}

export function residualTooltipLines(n: TraceNode, side: 'in' | 'out'): string[] {
  const amount = side === 'in' ? n.otherIn : n.otherOut;
  return [
    `${n.label} · other ${side} ${formatDeltaBps(amount)}`,
    `traced in ${formatBitsPerSec(n.tracedIn)} / out ${formatBitsPerSec(n.tracedOut)}`,
  ];
}

/** The caption of a column holding only frames (every pod hidden but the root's). */
export function wrapperColCaption(): string {
  return 'node / pod';
}

/**
 * Column captions by band: the switch band counts hops (`Trace start`, `Hop 1`, …); the
 * k8s band names its sub-column (`k8s node`, `pod`, `application`, `namespace`), with
 * ` / client` appended when the lower partition holds trace stops and plain `client` when
 * nothing in the column is k8s; the owner band is `owner`.
 */
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
  const band = bandOf(first);
  if (band === 'switch') {
    const role = first.role;
    const same = role !== 'switch' && col.every((n) => n.kind === 'node' && n.role === role);
    return `Hop ${String(first.col)}${same ? ` · ${KIND_LABEL[role] ?? role}` : ''}`;
  }
  if (band === 'owner') {
    return 'owner';
  }
  const k8s = col.find((n) => !isClientPartition(n));
  const hasClient = col.some(isClientPartition);
  if (k8s === undefined) {
    return 'client';
  }
  const sub = k8sSubcol(k8s);
  const word =
    sub === 'node'
      ? 'k8s node'
      : sub === 'pod'
        ? col.some((n) => n.k8sNode !== null)
          ? 'node / pod'
          : 'pod'
        : sub === 'app'
          ? 'application'
          : 'namespace';
  return hasClient ? `${word} / client` : word;
}
