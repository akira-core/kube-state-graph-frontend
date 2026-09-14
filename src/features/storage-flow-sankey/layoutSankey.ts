import type { NodeStatus } from '../../shared/constants/types';
import { formatBytes } from '../../shared/format/measurements';
import {
  BODY_MIN,
  BODY_PAD_BOTTOM,
  CARD_W,
  clamp,
  COL_GAP,
  HEADER_H,
  LABEL_MIN_THICKNESS,
  LEAF_W,
  PAD_BOTTOM,
  PAD_TOP,
  PAD_X,
  placeStack,
  ribbonPath,
  stackHeight,
  thicknessScale,
  V_GAP,
  WRAPPER_HEADER_H,
  WRAPPER_PAD,
  type ColumnHeader,
} from '../sankey-canvas';

import {
  formatBytesPerSec,
  SANKEY_KIND_ORDER,
  type SankeyDirection,
  type SankeyGraph,
  type SankeyK8sNode,
  type SankeyKind,
  type SankeyLinkTier,
  type SankeyNode,
  type SankeySvmDisplay,
  type SankeySvmFrame,
} from './deriveSankey';

// The content-space geometry (card widths, slot rows, ribbon thickness range) is the shared
// `sankey-canvas` set, so a storage card and a network-trace card are the same size. Kept
// re-exported here for the callers and tests that read them as this layout's numbers.
export {
  BODY_MIN,
  CARD_W,
  HEADER_H,
  LABEL_MIN_THICKNESS,
  LEAF_W,
  MAX_THICKNESS,
  MIN_THICKNESS,
  PAD_TOP,
  ROW_GAP,
  ROW_MIN_H,
} from '../sankey-canvas';
export type { ColumnHeader } from '../sankey-canvas';

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
  /** Border colour, from the backend's folded verdict. Absent = neutral border. */
  status?: NodeStatus;
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
  /** `node` (a Kubernetes node wrapping pods) or `netapp-svm` (an SVM frame wrapping PVCs). */
  kind: 'node' | 'netapp-svm';
  label: string;
  subtitle: string;
  /** A Kubernetes node wrapper is locatable; an SVM frame is not — `/v1/graph` has no SVM node. */
  locatable: boolean;
  status?: NodeStatus;
  noFlow?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  memberIds: string[];
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

export interface SankeyLayout {
  nodes: LayoutNode[];
  links: LayoutLink[];
  wrappers: LayoutWrapper[];
  columns: ColumnHeader[];
  width: number;
  height: number;
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

function pvcWord(count: number): string {
  return count === 1 ? '1 PVC' : `${String(count)} PVCs`;
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
    ...(node.status !== undefined ? { status: node.status } : {}),
    ...(node.derived === true ? { derived: true } : {}),
    ...(node.kind === 'pod' && node.namespace !== undefined ? { namespace: node.namespace } : {}),
    ...(node.kind === 'namespace' ? { namespace: node.namespace ?? node.label } : {}),
    ...(stripe !== undefined ? { namespaceColor: stripe } : {}),
  };
}

/** A wrapper or frame to draw, ready for placement — the two kinds' own bookkeeping
 *  (`SankeyK8sNode` / `SankeySvmFrame`) has already been reduced to this shared shape. */
interface ColumnWrapperGroup {
  id: string;
  kind: 'node' | 'netapp-svm';
  label: string;
  memberIds: string[];
  locatable: boolean;
  subtitle: string;
  status?: NodeStatus;
  noFlow?: boolean;
}

/**
 * Places one column's cards, some of them grouped into wrappers — a Kubernetes node
 * wrapping its pods, or an SVM frame wrapping its PVCs (design D3). Groups are drawn first,
 * ordered by label; members not claimed by any group are drawn loose beneath them, in
 * `orderMembers`'s order. Both wrapper kinds share this placement and geometry so neither
 * drifts from the other.
 */
function layoutColumnWrappers(
  members: SankeyNode[],
  groups: readonly ColumnWrapperGroup[],
  columnX: number,
  ctx: PlaceCtx,
  orderMembers: (nodes: SankeyNode[]) => SankeyNode[]
): { nodes: LayoutNode[]; wrappers: LayoutWrapper[]; bottom: number } {
  const membersById = new Map(members.map((m) => [m.id, m]));
  const scheduled = new Set(groups.flatMap((g) => g.memberIds));
  const groupsToDraw = [...groups].sort((a, b) => a.label.localeCompare(b.label));
  const nodes: LayoutNode[] = [];
  const wrappers: LayoutWrapper[] = [];
  let y = PAD_TOP;

  for (const group of groupsToDraw) {
    const inner = orderMembers(
      group.memberIds.map((id) => membersById.get(id)).filter((m): m is SankeyNode => m !== undefined)
    );
    const wrapperY = y;
    const innerX = columnX + WRAPPER_PAD;
    const innerW = CARD_W - WRAPPER_PAD * 2;
    let innerY = wrapperY + WRAPPER_HEADER_H;
    for (const member of inner) {
      const card = placeCard(member, innerX, innerY, innerW, ctx);
      nodes.push(card);
      innerY += card.height + V_GAP;
    }
    const last = nodes.length > 0 && inner.length > 0 ? nodes[nodes.length - 1] : undefined;
    const height = last === undefined ? WRAPPER_HEADER_H + WRAPPER_PAD : last.y + last.height + WRAPPER_PAD - wrapperY;
    wrappers.push({
      id: group.id,
      kind: group.kind,
      label: group.label,
      subtitle: group.subtitle,
      locatable: group.locatable,
      ...(group.status !== undefined ? { status: group.status } : {}),
      x: columnX,
      y: wrapperY,
      width: CARD_W,
      height,
      memberIds: inner.map((m) => m.id),
      ...(group.noFlow === true ? { noFlow: true } : {}),
    });
    y = wrapperY + height + V_GAP;
  }

  const unscheduled = orderMembers(members.filter((m) => !scheduled.has(m.id)));
  for (const member of unscheduled) {
    const card = placeCard(member, columnX, y, CARD_W, ctx);
    nodes.push(card);
    y += card.height + V_GAP;
  }

  return { nodes, wrappers, bottom: y === PAD_TOP ? PAD_TOP : y - V_GAP };
}

function layoutPodWrappers(
  pods: SankeyNode[],
  k8sNodes: SankeyK8sNode[],
  columnX: number,
  ctx: PlaceCtx
): { nodes: LayoutNode[]; wrappers: LayoutWrapper[]; bottom: number } {
  const groups: ColumnWrapperGroup[] = k8sNodes.map((k) => ({
    id: k.id,
    kind: 'node',
    label: k.label,
    memberIds: k.podIds,
    locatable: true,
    subtitle: k.noFlow === true ? 'node · no flow' : `node · ${podWord(k.podIds.length)}`,
    ...(k.status !== undefined ? { status: k.status } : {}),
    ...(k.noFlow === true ? { noFlow: true } : {}),
  }));
  return layoutColumnWrappers(pods, groups, columnX, ctx, (nodes) => orderPods(nodes, ctx.flow));
}

function layoutSvmFrames(
  pvcs: SankeyNode[],
  svmFrames: readonly SankeySvmFrame[],
  columnX: number,
  ctx: PlaceCtx
): { nodes: LayoutNode[]; wrappers: LayoutWrapper[]; bottom: number } {
  const groups: ColumnWrapperGroup[] = svmFrames.map((f) => ({
    id: f.id,
    kind: 'netapp-svm',
    label: f.label,
    memberIds: f.pvcIds,
    locatable: false,
    subtitle: f.noFlow === true ? 'svm · no flow' : `svm · ${pvcWord(f.pvcIds.length)}`,
    ...(f.noFlow === true ? { noFlow: true } : {}),
  }));
  // The PVC column's own order ("Sorting within a tier") — not the pod tier's
  // namespace-grouped order, which does not apply to a PVC.
  return layoutColumnWrappers(pvcs, groups, columnX, ctx, (nodes) => [...nodes].sort(byFlowThenLabel(ctx.flow)));
}

export function layoutSankey(
  graph: SankeyGraph,
  namespacePalette: readonly string[],
  podLayout: SankeyPodLayout = 'flat',
  svmDisplay: SankeySvmDisplay = 'column'
): SankeyLayout {
  const flow = computeFlow(graph.links);

  let maxValue = 0;
  for (const link of graph.links) {
    maxValue = Math.max(maxValue, link.value);
  }
  const thickness = thicknessScale(maxValue);

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
  const occupied = (kind: SankeyKind): boolean => {
    if (kind === 'pod' && podLayout === 'node') {
      return orderedByTier.pod.length > 0 || graph.k8sNodes.length > 0;
    }
    if (kind === 'pvc' && svmDisplay === 'group') {
      return orderedByTier.pvc.length > 0 || graph.svmFrames.length > 0;
    }
    return orderedByTier[kind].length > 0;
  };
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
    if (kind === 'pvc' && svmDisplay === 'group') {
      const placed = layoutSvmFrames(orderedByTier.pvc, graph.svmFrames, x, ctx);
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
    label:
      kind === 'pod' && podLayout === 'node'
        ? 'Node / Pod'
        : kind === 'pvc' && svmDisplay === 'group'
          ? 'SVM / PVC'
          : TIER_LABEL[kind],
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
