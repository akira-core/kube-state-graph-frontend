import { countWord } from '../../../shared/format/countWord';
import { formatBitsPerSec, formatBytes, formatDeltaBps } from '../../../shared/format/measurements';
import type { ThemeTokens } from '../../../shared/theme/tokens';
import { nodeTooltipRows, type TooltipLine } from '../../sankey-canvas';
import { bandOf, isClientPartition, k8sSubcol, type K8sSubcol } from '../model/bands';
import { KIND_LABEL } from '../model/classify';
import type { TraceCluster, TraceDirection, TraceEdge, TraceModelOk, TraceNode } from '../model/types';
import { mustGet, sum } from '../model/util';

import { typeWord, usageText } from './text';

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

/**
 * Node tooltip in the shared row order (see `nodeTooltipRows`), from the trace model's
 * fields. A hop splits what the trace followed from what it did not, each row painted like
 * its mark: `traced in / out` in the ribbon colour, `other in / out` in the residual colours.
 */
export function nodeTooltipLines(n: TraceNode, model: TraceModelOk, tokens: ThemeTokens): TooltipLine[] {
  if (n.kind === 'anchor') {
    const inv = model.investigation;
    return [
      'trace start',
      `iface ${inv?.iface ?? n.iface}`,
      `${n.dirLabel ?? ''} ${formatDeltaBps(inv?.deltaBps ?? 0)}`,
      ...(n.note !== '' ? [`note ${n.note}`] : []),
    ];
  }
  const flow: TooltipLine[] = [];
  if (n.noFlow) {
    flow.push('no drawable flow edge (no flow)');
  } else if (n.role === 'owner' && !(n.bps > 0)) {
    flow.push('in — (metered at the port: the port also carries other owners)');
  } else if (n.kind === 'node') {
    flow.push({ text: `traced in ${formatBitsPerSec(n.tracedIn)}`, color: tokens.sankey.traceFlow });
    flow.push({ text: `traced out ${formatBitsPerSec(n.tracedOut)}`, color: tokens.sankey.traceFlow });
  } else {
    flow.push(`in ${formatBitsPerSec(sum(n.inEdges))}`);
    flow.push(`out ${formatBitsPerSec(sum(n.outEdges))}`);
  }
  const membership: TooltipLine[] = [];
  if (n.kind === 'node') {
    if (!n.noFlow) {
      membership.push({ text: `other in ${formatBitsPerSec(n.otherIn)}`, color: tokens.sankey.traceResidualIn });
      membership.push({ text: `other out ${formatBitsPerSec(n.otherOut)}`, color: tokens.sankey.traceResidualOut });
    }
  } else if (n.role === 'owner') {
    if (n.bps > 0) {
      membership.push(`derived from port cards${n.meteredPorts < n.portCount ? ' (partial ports)' : ''}`);
    }
    membership.push(countWord(n.clientCount, 'client'));
    membership.push(countWord(n.portCount, 'port'));
  } else if (n.role === 'ns' || n.role === 'app') {
    membership.push('derived from member pods');
    membership.push(countWord(n.podCount, 'pod'));
  }
  const fold = n.role === 'ns' || n.role === 'app' ? ' (worst of member pods)' : '';
  const info = n.info;
  const perf =
    info?.perf === undefined
      ? []
      : Object.entries(info.perf).map(
          ([k, v]) => `${k} ${k === 'total_bytes_per_sec' ? `${formatBytes(v)}/s` : String(v)} (raw)`
        );
  const clients = n.clients;
  const synthetic = n.role === 'ns' || n.role === 'app' || n.role === 'owner';
  return nodeTooltipRows({
    head: `${typeWord(n)} / ${n.label}`,
    ...(n.namespace !== null && n.role !== 'ns' ? { namespace: n.namespace } : {}),
    ...(n.ontapCluster !== null ? { ontapCluster: n.ontapCluster } : {}),
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

/** A cluster frame's tooltip: the cluster, how many cards it frames, the folded status. */
export function clusterTooltipLines(c: TraceCluster): string[] {
  return [
    `cluster / ${c.label}`,
    countWord(c.memberIds.length, 'card'),
    ...(c.status !== null ? [`status ${c.status} (worst of member cards)`] : []),
  ];
}

export function residualTooltipLines(n: TraceNode, side: 'in' | 'out', tokens: ThemeTokens): TooltipLine[] {
  const amount = side === 'in' ? n.otherIn : n.otherOut;
  return [
    {
      text: `${n.label} · other ${side} ${formatDeltaBps(amount)}`,
      color: side === 'in' ? tokens.sankey.traceResidualIn : tokens.sankey.traceResidualOut,
    },
    {
      text: `traced in ${formatBitsPerSec(n.tracedIn)} / out ${formatBitsPerSec(n.tracedOut)}`,
      color: tokens.sankey.traceFlow,
    },
  ];
}

/** The k8s sub-column word. */
const K8S_SUBCOL_WORD: Record<K8sSubcol, string> = {
  node: 'k8s node',
  pod: 'pod',
  app: 'application',
  ns: 'namespace',
};

/**
 * Column captions by band: the switch band counts hops away from the trace start
 * (`Trace start`, `Hop 1`, …, `startCol` being the anchor's column); the k8s band names its
 * sub-column (`k8s node`, `pod`, `application`, `namespace`), with ` / client` appended
 * when the lower partition holds trace stops and plain `client` when nothing in the column
 * is k8s; the owner band is `owner`.
 */
export function colCaption(col: readonly TraceNode[], direction: TraceDirection, startCol: number): string {
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
    return `Hop ${String(Math.abs(first.col - startCol))}${same ? ` · ${KIND_LABEL[role] ?? role}` : ''}`;
  }
  if (band === 'owner') {
    return 'owner';
  }
  const k8s = col.find((n) => !isClientPartition(n));
  const hasClient = col.some(isClientPartition);
  if (k8s === undefined) {
    return 'client';
  }
  const word = K8S_SUBCOL_WORD[k8sSubcol(k8s) ?? 'ns'];
  return hasClient ? `${word} / client` : word;
}
