import { formatBytes } from '../../shared/format/measurements';

import {
  formatBytesPerSec,
  SANKEY_KIND_ORDER,
  type SankeyDirection,
  type SankeyGraph,
  type SankeyKind,
  type SankeyNode,
  type StorageFlowTier,
} from './deriveSankey';

// Intrinsic content-space geometry. These are independent of the container's pixel size —
// resize re-fits the viewBox, it never re-runs this layout (see `storage-flow-sankey`
// "尺寸與容器 resize").
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

// Column order is the flow's own direction, storage -> workload, and it is the backend's
// tier list rather than a layout preference (see `storage-flow-sankey` "流向鏈與 tier 結構").
const TIERS: readonly SankeyKind[] = SANKEY_KIND_ORDER;
// The rightmost column. Flow ends here, so its cards carry no right-edge slots.
const LEAF_KIND: SankeyKind = TIERS[TIERS.length - 1] as SankeyKind;
export const TIER_LABEL: Record<SankeyKind, string> = {
  'netapp-node': 'NetApp node',
  'netapp-aggr': 'NetApp aggregate',
  'netapp-svm': 'SVM',
  pvc: 'PVC',
  pod: 'Pod',
  node: 'Node',
};

/**
 * Identity of one drawn ribbon.
 *
 * The tier is part of it, not decoration: two `storage-flow` edges can join the same pair
 * of nodes on different tiers, and a key without the tier collides — React drops one path
 * and the slot stacks disagree about how many ribbons a card carries.
 */
export function linkKey(source: string, target: string, direction: SankeyDirection, tier: StorageFlowTier): string {
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
   * Whether clicking this card can locate the node in Graph view. An SVM exists only in the
   * storage graph, so a locate for one could only ever report "not in the current graph
   * result" — a dead control rather than a degraded one.
   */
  locatable: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  leftSlots: LayoutSlot[];
  rightSlots: LayoutSlot[];
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
  tier: StorageFlowTier;
  attribution?: string;
  maxBytesPerSec?: number;
  maxIops?: number;
  readLatencyUs?: number;
  writeLatencyUs?: number;
}

export interface ColumnHeader {
  x: number;
  label: string;
}

export interface SankeyLayout {
  nodes: LayoutNode[];
  links: LayoutLink[];
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

/**
 * Total flow per node for the *current* mode: the max of its drawn-link inbound and
 * outbound sums (not their sum — that would double-count pure pass-through).
 */
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

/**
 * Pod tier only: same-namespace pods stay adjacent (grouped before sorting), grouped by
 * each group's peak flow descending, namespace name breaking ties; group-less pods sort
 * last. Namespace color is assigned by that same group order — group order and stripe
 * order are the same sequence by construction, not two things that could drift apart.
 */
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

function subtitleFor(node: SankeyNode, flow: Map<string, number>): string {
  // A materialised root the backend answered with but that carries no drawn flow. Saying so
  // on the card is the whole point of drawing it — silently showing `0 B/s` would read as a
  // measurement rather than as the absence of one.
  if (node.noFlow === true) {
    return `${node.kind} · no flow`;
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
  // The last column is a terminal leaf card: its one line of content is its total inflow
  // for the current mode, since it has no right-edge slots to carry that information.
  if (node.kind === LEAF_KIND) {
    return `${node.kind} · ${formatBytesPerSec(flow.get(node.id) ?? 0)}`;
  }
  return node.kind;
}

function stackHeight(slots: ReadonlyArray<{ thickness: number }>): number {
  if (slots.length === 0) {
    return 0;
  }
  return slots.reduce((sum, s) => sum + Math.max(s.thickness, ROW_MIN_H), 0) + (slots.length - 1) * ROW_GAP;
}

/** Centers a slot stack within `containerH`, returning each slot's y offset from the node top. */
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

/** A filled ribbon: two mirrored cubic Bézier curves between the source and target slot centers. */
function ribbonPath(x1: number, y1: number, x2: number, y2: number, thickness: number): string {
  const mx = (x1 + x2) / 2;
  const half = thickness / 2;
  return (
    `M${x1},${y1 - half} C${mx},${y1 - half} ${mx},${y2 - half} ${x2},${y2 - half} ` +
    `L${x2},${y2 + half} C${mx},${y2 + half} ${mx},${y1 + half} ${x1},${y1 + half} Z`
  );
}

export function layoutSankey(graph: SankeyGraph, namespacePalette: readonly string[]): SankeyLayout {
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
    node: [...(byTier.get('node') ?? [])].sort(byFlowThenLabel(flow)),
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

  const columnX: number[] = [];
  {
    let x = PAD_X;
    for (let c = 0; c < TIERS.length; c += 1) {
      columnX.push(x);
      x += (c === TIERS.length - 1 ? LEAF_W : CARD_W) + COL_GAP;
    }
  }

  TIERS.forEach((kind, tierIndex) => {
    const isLeaf = kind === LEAF_KIND;
    const width = isLeaf ? LEAF_W : CARD_W;
    let y = PAD_TOP;

    for (const node of orderedByTier[kind]) {
      const incoming = (incomingByNode.get(node.id) ?? [])
        .map((l) => ({ link: l, oppositeLabel: graph.nodes.find((n) => n.id === l.source)?.label ?? l.source }))
        .sort((a, b) => b.link.value - a.link.value || a.oppositeLabel.localeCompare(b.oppositeLabel))
        .map((e) => ({
          linkKey: linkKey(e.link.source, e.link.target, e.link.direction, e.link.tier),
          thickness: thickness(e.link.value),
        }));
      const outgoing = isLeaf
        ? []
        : (outgoingByNode.get(node.id) ?? [])
            .map((l) => ({ link: l, oppositeLabel: graph.nodes.find((n) => n.id === l.target)?.label ?? l.target }))
            .sort((a, b) => b.link.value - a.link.value || a.oppositeLabel.localeCompare(b.oppositeLabel))
            .map((e) => ({
              linkKey: linkKey(e.link.source, e.link.target, e.link.direction, e.link.tier),
              thickness: thickness(e.link.value),
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
        leftSlotCy.set(s.linkKey, s.cy);
      }
      for (const s of rightSlots) {
        rightSlotCy.set(s.linkKey, s.cy);
      }

      const layoutNode: LayoutNode = {
        id: node.id,
        label: node.label,
        kind: node.kind,
        subtitle: subtitleFor(node, flow),
        dashed: node.kind === 'netapp-node' || node.kind === 'netapp-aggr' || node.kind === 'netapp-svm',
        locatable: node.kind !== 'netapp-svm',
        isLeaf,
        x: columnX[tierIndex] ?? PAD_X,
        y,
        width,
        height,
        leftSlots,
        rightSlots,
        // The namespace stripe is a pod-tier device (see "pod tier 的 namespace 分組色條");
        // a pvc/aggr node can carry the same `namespace` field without qualifying for one.
        ...(kind === 'pod' && node.namespace !== undefined ? { namespace: node.namespace } : {}),
        ...(kind === 'pod' && node.namespace !== undefined && podOrder.namespaceColor.has(node.namespace)
          ? { namespaceColor: podOrder.namespaceColor.get(node.namespace) as string }
          : {}),
      };
      nodesById.set(node.id, layoutNode);
      y += height + V_GAP;
    }
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
    };
  });

  const nodes = [...nodesById.values()];
  const columns: ColumnHeader[] = TIERS.map((kind, i) => ({ x: columnX[i] ?? PAD_X, label: TIER_LABEL[kind] })).filter(
    (_, i) => (orderedByTier[TIERS[i] as SankeyKind]?.length ?? 0) > 0
  );

  const lastColumnX = columnX[TIERS.length - 1] ?? PAD_X;
  const width = nodes.length === 0 ? lastColumnX + LEAF_W + PAD_X : lastColumnX + LEAF_W + PAD_X;
  const bottoms = TIERS.map((kind) => {
    const tierNodes = orderedByTier[kind];
    if (tierNodes.length === 0) {
      return PAD_TOP;
    }
    const last = nodesById.get(tierNodes[tierNodes.length - 1]?.id ?? '');
    return last === undefined ? PAD_TOP : last.y + last.height;
  });
  const height = clamp(Math.max(...bottoms) + PAD_BOTTOM, PAD_TOP + BODY_MIN + PAD_BOTTOM, Number.POSITIVE_INFINITY);

  return { nodes, links, columns, width, height };
}
