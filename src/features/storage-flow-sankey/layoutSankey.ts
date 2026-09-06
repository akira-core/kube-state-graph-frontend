import { formatBytes } from '../../shared/format/measurements';

import {
  formatBytesPerSec,
  SANKEY_KIND_ORDER,
  type SankeyDirection,
  type SankeyGraph,
  type SankeyK8sNode,
  type SankeyKind,
  type SankeyLinkTier,
  type SankeyNode,
} from './deriveSankey';

// Intrinsic content-space geometry. These are independent of the container's pixel size —
// a resize moves only the viewport transform (and only when the user asks it to), it never
// re-runs this layout (see `storage-flow-sankey` "尺寸與容器 resize").
export const CARD_W = 208;
export const LEAF_W = 160;
export const HEADER_H = 40;
export const BODY_MIN = 24;
export const ROW_MIN_H = 22;
export const ROW_GAP = 8;
const COL_GAP = 168;
const V_GAP = 22;
const PAD_X = 28;
export const PAD_TOP = 40;
const PAD_BOTTOM = 24;
const BODY_PAD_BOTTOM = 10;
export const MAX_THICKNESS = 72;
export const MIN_THICKNESS = 3;
/** Below this thickness a mid-ribbon value label would overlap its own stroke. */
export const LABEL_MIN_THICKNESS = 11;
const WRAPPER_PAD = 10;
const WRAPPER_HEADER_H = 40;

export type SankeyPodLayout = 'flat' | 'node';

// Column order is the flow's own direction, storage -> workload.
const TIERS: readonly SankeyKind[] = SANKEY_KIND_ORDER;
const LEAF_KIND: SankeyKind = 'namespace';
export const TIER_LABEL: Record<SankeyKind, string> = {
  'netapp-node': 'NetApp node',
  'netapp-aggr': 'NetApp aggregate',
  'netapp-svm': 'SVM',
  pvc: 'PVC',
  pod: 'Pod',
  application: 'Application',
  namespace: 'Namespace',
};

/**
 * Identity of one drawn ribbon.
 *
 * The tier is part of it, not decoration: two `storage-flow` edges can join the same pair
 * of nodes on different tiers, and a key without the tier collides — React drops one path
 * and the slot stacks disagree about how many ribbons a card carries.
 */
export function linkKey(source: string, target: string, direction: SankeyDirection, tier: SankeyLinkTier): string {
  return `${source}|${target}|${direction}|${tier}`;
}

export interface LayoutSlot {
  linkKey: string;
  cy: number;
  thickness: number;
}

export interface LayoutNode {
  id: string;
  label: string;
  kind: SankeyKind;
  namespace?: string;
  namespaceColor?: string;
  subtitle: string;
  dashed: boolean;
  isLeaf: boolean;
  /**
   * Whether clicking this card can locate the node in Graph view. SVM / application /
   * namespace cards have no leaf counterpart (or are compounds), so a locate for one
   * could only ever report "not in the current graph result" — a dead control.
   */
  locatable: boolean;
  derived?: true;
  x: number;
  y: number;
  width: number;
  height: number;
  leftSlots: LayoutSlot[];
  rightSlots: LayoutSlot[];
}

export interface LayoutWrapper {
  id: string;
  label: string;
  subtitle: string;
  locatable: true;
  noFlow?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  podIds: string[];
}

export interface LayoutLink {
  key: string;
  source: string;
  target: string;
  direction: SankeyDirection;
  value: number;
  thickness: number;
  path: string;
  labelX: number;
  labelY: number;
  showLabel: boolean;
  tier: SankeyLinkTier;
  attribution?: string;
  maxBytesPerSec?: number;
  maxIops?: number;
  readLatencyUs?: number;
  writeLatencyUs?: number;
  derived?: true;
}

export interface ColumnHeader {
  x: number;
  label: string;
}

export interface SankeyLayout {
  nodes: LayoutNode[];
  links: LayoutLink[];
  wrappers: LayoutWrapper[];
  columns: ColumnHeader[];
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function paletteColor(palette: readonly string[], index: number): string {
  return palette.length === 0 ? '#94a3b8' : (palette[index % palette.length] ?? palette[0] ?? '#94a3b8');
}

function byFlowThenLabel(flow: Map<string, number>) {
  return (a: SankeyNode, b: SankeyNode): number => {
    const fa = flow.get(a.id) ?? 0;
    const fb = flow.get(b.id) ?? 0;
    if (fb !== fa) {
      return fb - fa;
    }
    return a.label.localeCompare(b.label);
  };
}

function computeFlow(links: SankeyGraph['links']): Map<string, number> {
  const flow = new Map<string, { in: number; out: number }>();
  for (const link of links) {
    const s = flow.get(link.source) ?? { in: 0, out: 0 };
    s.out += link.value;
    flow.set(link.source, s);
    const t = flow.get(link.target) ?? { in: 0, out: 0 };
    t.in += link.value;
    flow.set(link.target, t);
  }
  const out = new Map<string, number>();
  for (const [id, { in: inbound, out: outbound }] of flow) {
    out.set(id, Math.max(inbound, outbound));
  }
  return out;
}

interface PodOrder {
  nodes: SankeyNode[];
  namespaceColor: Map<string, string>;
}

function orderPodTier(podNodes: SankeyNode[], flow: Map<string, number>, palette: readonly string[]): PodOrder {
  const withNs = podNodes.filter((n) => n.namespace !== undefined);
  const withoutNs = podNodes.filter((n) => n.namespace === undefined);

  const groups = new Map<string, SankeyNode[]>();
  for (const n of withNs) {
    const ns = n.namespace as string;
    const list = groups.get(ns) ?? [];
    list.push(n);
    groups.set(ns, list);
  }

  const groupPeak = (ns: string): number => Math.max(...(groups.get(ns) ?? []).map((n) => flow.get(n.id) ?? 0));
  const nsOrder = [...groups.keys()].sort((a, b) => {
    const fa = groupPeak(a);
    const fb = groupPeak(b);
    if (fb !== fa) {
      return fb - fa;
    }
    return a.localeCompare(b);
  });

  const namespaceColor = new Map<string, string>();
  nsOrder.forEach((ns, i) => namespaceColor.set(ns, paletteColor(palette, i)));

  const ordered = nsOrder.flatMap((ns) => [...(groups.get(ns) ?? [])].sort(byFlowThenLabel(flow)));
  const orderedWithoutNs = [...withoutNs].sort(byFlowThenLabel(flow));

  return { nodes: [...ordered, ...orderedWithoutNs], namespaceColor };
}

/** Same grouping as the pod column, without reassigning namespace colors. */
function orderPods(podNodes: SankeyNode[], flow: Map<string, number>): SankeyNode[] {
  return orderPodTier(podNodes, flow, []).nodes;
}

function podWord(count: number): string {
  return count === 1 ? '1 pod' : `${String(count)} pods`;
}

function subtitleFor(node: SankeyNode, flow: Map<string, number>): string {
  if (node.noFlow === true) {
    return `${node.kind} · no flow`;
  }
  if (node.kind === 'application') {
    const ns = node.namespace !== undefined ? ` · ns/${node.namespace}` : '';
    const members = node.memberPodCount !== undefined ? ` · ${podWord(node.memberPodCount)}` : '';
    return `${node.kind}${ns}${members}`;
  }
  if (node.kind === 'pod' || node.kind === 'pvc') {
    if (node.namespace !== undefined) {
      return `${node.kind} · ns/${node.namespace}`;
    }
  }
  if (node.kind === 'pvc' || node.kind === 'netapp-aggr') {
    const used = node.usage?.usedBytes;
    const capacity = node.usage?.capacityBytes;
    if (used !== undefined && capacity !== undefined) {
      return `${node.kind} · ${formatBytes(used)} / ${formatBytes(capacity)}`;
    }
  }
  if (node.kind === 'netapp-node' || node.kind === 'netapp-aggr' || node.kind === 'netapp-svm') {
    if (node.ontapCluster !== undefined) {
      return `${node.kind} · ${node.ontapCluster}`;
    }
  }
  if (node.kind === LEAF_KIND) {
    const members = node.memberPodCount !== undefined ? `${podWord(node.memberPodCount)} · ` : '';
    return `${node.kind} · ${members}${formatBytesPerSec(flow.get(node.id) ?? 0)}`;
  }
  return node.kind;
}

function stackHeight(slots: ReadonlyArray<{ thickness: number }>): number {
  if (slots.length === 0) {
    return 0;
  }
  return slots.reduce((sum, s) => sum + Math.max(s.thickness, ROW_MIN_H), 0) + (slots.length - 1) * ROW_GAP;
}

function placeStack(slots: ReadonlyArray<{ thickness: number }>, containerTop: number, containerH: number): number[] {
  const total = stackHeight(slots);
  let cursor = containerTop + Math.max(0, (containerH - total) / 2);
  const offsets: number[] = [];
  for (const slot of slots) {
    const h = Math.max(slot.thickness, ROW_MIN_H);
    offsets.push(cursor + h / 2);
    cursor += h + ROW_GAP;
  }
  return offsets;
}

function ribbonPath(x1: number, y1: number, x2: number, y2: number, thickness: number): string {
  const mx = (x1 + x2) / 2;
  const half = thickness / 2;
  return (
    `M${x1},${y1 - half} C${mx},${y1 - half} ${mx},${y2 - half} ${x2},${y2 - half} ` +
    `L${x2},${y2 + half} C${mx},${y2 + half} ${mx},${y1 + half} ${x1},${y1 + half} Z`
  );
}

function locatableFor(kind: SankeyKind): boolean {
  return kind !== 'netapp-svm' && kind !== 'application' && kind !== 'namespace';
}

function sortLinks(
  list: SankeyGraph['links'],
  opposite: (link: SankeyGraph['links'][number]) => string
): SankeyGraph['links'] {
  return [...list].sort((a, b) => b.value - a.value || opposite(a).localeCompare(opposite(b)));
}

interface PlaceCtx {
  flow: Map<string, number>;
  thickness: (v: number) => number;
  incomingByNode: Map<string, SankeyGraph['links']>;
  outgoingByNode: Map<string, SankeyGraph['links']>;
  /** Node id -> label, built once. The slot comparator breaks ties on the OPPOSITE end's
   *  label, and a linear scan of `graph.nodes` inside that comparator is quadratic in the
   *  node count on every layout. */
  labelById: Map<string, string>;
  namespaceColor: Map<string, string>;
  leftSlotCy: Map<string, number>;
  rightSlotCy: Map<string, number>;
}

function placeCard(node: SankeyNode, x: number, y: number, width: number, ctx: PlaceCtx): LayoutNode {
  const isLeaf = node.kind === LEAF_KIND;
  const omitLeft = node.kind === 'netapp-node';
  const incoming = omitLeft
    ? []
    : sortLinks(ctx.incomingByNode.get(node.id) ?? [], (l) => ctx.labelById.get(l.source) ?? l.source).map((l) => ({
        linkKey: linkKey(l.source, l.target, l.direction, l.tier),
        thickness: ctx.thickness(l.value),
      }));
  const outgoing = isLeaf
    ? []
    : sortLinks(ctx.outgoingByNode.get(node.id) ?? [], (l) => ctx.labelById.get(l.target) ?? l.target).map((l) => ({
        linkKey: linkKey(l.source, l.target, l.direction, l.tier),
        thickness: ctx.thickness(l.value),
      }));

  const contentH = Math.max(stackHeight(incoming), stackHeight(outgoing), BODY_MIN);
  const height = HEADER_H + contentH + BODY_PAD_BOTTOM;
  const leftOffsets = placeStack(incoming, HEADER_H, contentH);
  const rightOffsets = placeStack(outgoing, HEADER_H, contentH);
  const leftSlots: LayoutSlot[] = incoming.map((slot, i) => ({
    linkKey: slot.linkKey,
    thickness: slot.thickness,
    cy: y + (leftOffsets[i] ?? HEADER_H),
  }));
  const rightSlots: LayoutSlot[] = outgoing.map((slot, i) => ({
    linkKey: slot.linkKey,
    thickness: slot.thickness,
    cy: y + (rightOffsets[i] ?? HEADER_H),
  }));
  for (const s of leftSlots) {
    ctx.leftSlotCy.set(s.linkKey, s.cy);
  }
  for (const s of rightSlots) {
    ctx.rightSlotCy.set(s.linkKey, s.cy);
  }

  const stripe =
    (node.kind === 'pod' || node.kind === 'namespace') &&
    node.namespace !== undefined &&
    ctx.namespaceColor.has(node.namespace)
      ? ctx.namespaceColor.get(node.namespace)
      : node.kind === 'namespace' && ctx.namespaceColor.has(node.label)
        ? ctx.namespaceColor.get(node.label)
        : undefined;

  return {
    id: node.id,
    label: node.label,
    kind: node.kind,
    subtitle: subtitleFor(node, ctx.flow),
    dashed: node.kind === 'netapp-node' || node.kind === 'netapp-aggr' || node.kind === 'netapp-svm',
    locatable: locatableFor(node.kind),
    isLeaf,
    x,
    y,
    width,
    height,
    leftSlots,
    rightSlots,
    ...(node.derived === true ? { derived: true } : {}),
    ...(node.kind === 'pod' && node.namespace !== undefined ? { namespace: node.namespace } : {}),
    ...(node.kind === 'namespace' ? { namespace: node.namespace ?? node.label } : {}),
    ...(stripe !== undefined ? { namespaceColor: stripe } : {}),
  };
}

function layoutPodWrappers(
  pods: SankeyNode[],
  k8sNodes: SankeyK8sNode[],
  columnX: number,
  ctx: PlaceCtx
): { nodes: LayoutNode[]; wrappers: LayoutWrapper[]; bottom: number } {
  const podsById = new Map(pods.map((p) => [p.id, p]));
  const scheduled = new Set(k8sNodes.flatMap((k) => k.podIds));
  const wrappersToDraw = [...k8sNodes].sort((a, b) => a.label.localeCompare(b.label));
  const nodes: LayoutNode[] = [];
  const wrappers: LayoutWrapper[] = [];
  let y = PAD_TOP;

  for (const k8s of wrappersToDraw) {
    const inner = orderPods(
      k8s.podIds.map((id) => podsById.get(id)).filter((p): p is SankeyNode => p !== undefined),
      ctx.flow
    );
    const wrapperY = y;
    const innerX = columnX + WRAPPER_PAD;
    const innerW = CARD_W - WRAPPER_PAD * 2;
    let innerY = wrapperY + WRAPPER_HEADER_H;
    for (const pod of inner) {
      const card = placeCard(pod, innerX, innerY, innerW, ctx);
      nodes.push(card);
      innerY += card.height + V_GAP;
    }
    const last = nodes.length > 0 && inner.length > 0 ? nodes[nodes.length - 1] : undefined;
    const height = last === undefined ? WRAPPER_HEADER_H + WRAPPER_PAD : last.y + last.height + WRAPPER_PAD - wrapperY;
    wrappers.push({
      id: k8s.id,
      label: k8s.label,
      subtitle: k8s.noFlow === true ? 'node · no flow' : `node · ${podWord(inner.length)}`,
      locatable: true,
      x: columnX,
      y: wrapperY,
      width: CARD_W,
      height,
      podIds: inner.map((p) => p.id),
      ...(k8s.noFlow === true ? { noFlow: true } : {}),
    });
    y = wrapperY + height + V_GAP;
  }

  const unscheduled = orderPods(
    pods.filter((p) => !scheduled.has(p.id)),
    ctx.flow
  );
  for (const pod of unscheduled) {
    const card = placeCard(pod, columnX, y, CARD_W, ctx);
    nodes.push(card);
    y += card.height + V_GAP;
  }

  return { nodes, wrappers, bottom: y === PAD_TOP ? PAD_TOP : y - V_GAP };
}

export function layoutSankey(
  graph: SankeyGraph,
  namespacePalette: readonly string[],
  podLayout: SankeyPodLayout = 'flat'
): SankeyLayout {
  const flow = computeFlow(graph.links);

  let maxValue = 0;
  for (const link of graph.links) {
    maxValue = Math.max(maxValue, link.value);
  }
  const scale = maxValue > 0 ? MAX_THICKNESS / maxValue : 0;
  const thickness = (v: number): number => Math.max(MIN_THICKNESS, v * scale);

  const byTier = new Map<SankeyKind, SankeyNode[]>();
  for (const kind of TIERS) {
    byTier.set(kind, []);
  }
  for (const node of graph.nodes) {
    byTier.get(node.kind)?.push(node);
  }

  const podOrder = orderPodTier(byTier.get('pod') ?? [], flow, namespacePalette);
  const orderedByTier: Record<SankeyKind, SankeyNode[]> = {
    'netapp-node': [...(byTier.get('netapp-node') ?? [])].sort(byFlowThenLabel(flow)),
    'netapp-aggr': [...(byTier.get('netapp-aggr') ?? [])].sort(byFlowThenLabel(flow)),
    'netapp-svm': [...(byTier.get('netapp-svm') ?? [])].sort(byFlowThenLabel(flow)),
    pvc: [...(byTier.get('pvc') ?? [])].sort(byFlowThenLabel(flow)),
    pod: podOrder.nodes,
    application: [...(byTier.get('application') ?? [])].sort(byFlowThenLabel(flow)),
    namespace: [...(byTier.get('namespace') ?? [])].sort(byFlowThenLabel(flow)),
  };

  const incomingByNode = new Map<string, SankeyGraph['links']>();
  const outgoingByNode = new Map<string, SankeyGraph['links']>();
  for (const link of graph.links) {
    const inList = incomingByNode.get(link.target) ?? [];
    inList.push(link);
    incomingByNode.set(link.target, inList);
    const outList = outgoingByNode.get(link.source) ?? [];
    outList.push(link);
    outgoingByNode.set(link.source, outList);
  }

  const rightSlotCy = new Map<string, number>();
  const leftSlotCy = new Map<string, number>();
  const nodesById = new Map<string, LayoutNode>();
  const wrappers: LayoutWrapper[] = [];
  const bottoms: number[] = [];

  // An empty column reserves no width. Not every estate resolves every column — a payload
  // whose pods carry no `application` ancestor has that column empty — and a reserved slot
  // would open the diagram with a CARD_W + COL_GAP gutter through its middle while
  // "fit to window" scaled the whole chart down to enclose the gap.
  const occupied = (kind: SankeyKind): boolean =>
    kind === 'pod' && podLayout === 'node'
      ? orderedByTier.pod.length > 0 || graph.k8sNodes.length > 0
      : orderedByTier[kind].length > 0;
  const columnWidth = (tierIndex: number): number => (tierIndex === TIERS.length - 1 ? LEAF_W : CARD_W);

  const columnX: number[] = [];
  {
    let x = PAD_X;
    for (let c = 0; c < TIERS.length; c += 1) {
      columnX.push(x);
      if (occupied(TIERS[c] as SankeyKind)) {
        x += columnWidth(c) + COL_GAP;
      }
    }
  }

  const ctx: PlaceCtx = {
    flow,
    thickness,
    incomingByNode,
    outgoingByNode,
    labelById: new Map(graph.nodes.map((n) => [n.id, n.label])),
    namespaceColor: podOrder.namespaceColor,
    leftSlotCy,
    rightSlotCy,
  };

  TIERS.forEach((kind, tierIndex) => {
    const x = columnX[tierIndex] ?? PAD_X;
    const width = columnWidth(tierIndex);
    if (kind === 'pod' && podLayout === 'node') {
      const placed = layoutPodWrappers(orderedByTier.pod, graph.k8sNodes, x, ctx);
      for (const n of placed.nodes) {
        nodesById.set(n.id, n);
      }
      wrappers.push(...placed.wrappers);
      bottoms.push(placed.bottom);
      return;
    }
    let y = PAD_TOP;
    for (const node of orderedByTier[kind]) {
      const card = placeCard(node, x, y, width, ctx);
      nodesById.set(node.id, card);
      y += card.height + V_GAP;
    }
    bottoms.push(y === PAD_TOP ? PAD_TOP : y - V_GAP);
  });

  const links: LayoutLink[] = graph.links.map((l) => {
    const key = linkKey(l.source, l.target, l.direction, l.tier);
    const source = nodesById.get(l.source);
    const target = nodesById.get(l.target);
    const x1 = (source?.x ?? 0) + (source?.width ?? 0);
    const y1 = rightSlotCy.get(key) ?? source?.y ?? 0;
    const x2 = target?.x ?? 0;
    const y2 = leftSlotCy.get(key) ?? target?.y ?? 0;
    const t = thickness(l.value);
    return {
      key,
      source: l.source,
      target: l.target,
      direction: l.direction,
      value: l.value,
      thickness: t,
      path: ribbonPath(x1, y1, x2, y2, t),
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2,
      showLabel: t >= LABEL_MIN_THICKNESS,
      tier: l.tier,
      ...(l.attribution !== undefined ? { attribution: l.attribution } : {}),
      ...(l.maxBytesPerSec !== undefined ? { maxBytesPerSec: l.maxBytesPerSec } : {}),
      ...(l.maxIops !== undefined ? { maxIops: l.maxIops } : {}),
      ...(l.readLatencyUs !== undefined ? { readLatencyUs: l.readLatencyUs } : {}),
      ...(l.writeLatencyUs !== undefined ? { writeLatencyUs: l.writeLatencyUs } : {}),
      ...(l.derived === true ? { derived: true } : {}),
    };
  });

  const nodes = [...nodesById.values()];
  const columns: ColumnHeader[] = TIERS.map((kind, i) => ({
    x: columnX[i] ?? PAD_X,
    label: kind === 'pod' && podLayout === 'node' ? 'Node / Pod' : TIER_LABEL[kind],
  })).filter((_, i) => occupied(TIERS[i] as SankeyKind));

  let contentRight = PAD_X;
  TIERS.forEach((kind, i) => {
    if (occupied(kind)) {
      contentRight = (columnX[i] ?? PAD_X) + columnWidth(i);
    }
  });
  const width = contentRight + PAD_X;
  const wrapperBottoms = wrappers.map((w) => w.y + w.height);
  const height = clamp(
    Math.max(PAD_TOP, ...bottoms, ...wrapperBottoms, ...nodes.map((n) => n.y + n.height)) + PAD_BOTTOM,
    PAD_TOP + BODY_MIN + PAD_BOTTOM,
    Number.POSITIVE_INFINITY
  );

  return { nodes, links, wrappers, columns, width, height };
}
