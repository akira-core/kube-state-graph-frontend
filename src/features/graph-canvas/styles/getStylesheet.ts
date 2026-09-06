import type cytoscape from 'cytoscape';

import {
  EDGE_STYLE_BY_TYPE,
  FALLBACK_EDGE_STYLE,
  NETWORK_HOP_DASH_PATTERN,
  type EdgeStyle,
} from '../../../shared/constants/colorByEdgeType';
import { STATUS_COLOR } from '../../../shared/constants/colorByStatus';
import { EDGE_RELATION_TRANSPORT } from '../../../shared/constants/edgeRelation';
import { FOLDER_ICON_SVG, iconSvgForKind } from '../../../shared/constants/iconSvgByKind';
import type { EdgeType, NodeKind } from '../../../shared/constants/types';
import { paintUsageLiquid } from '../../../shared/icon/paintUsageLiquid';
import { tintSvgToDataUri } from '../../../shared/icon/tintSvgToDataUri';
import { themeColors, type ThemeTokens } from '../../../shared/theme/tokens';
import type { CyStylesheet } from '../hooks/useCytoscape';

export interface GetStylesheetInput {
  theme: ThemeTokens;
  colorMap?: Record<string, EdgeStyle>;
}

const NODE_SIZE = 40;

// Dimming class — applied/removed imperatively by useGraphFade; opacity rules live in the
// stylesheet below. One class for both dimming reasons (CONTEXT.md "focus fade" while a
// node is selected, "miss fade" while a search query is active): they are mutually
// exclusive by construction, since a single hook decides which lit set applies.
export const FADED_CLASS = 'ksg-faded';

function resolveIconUri(kind: string | undefined, iconColor: string, usageRatio?: number): string {
  const raw = iconSvgForKind(kind);
  const painted =
    usageRatio !== undefined && Number.isFinite(usageRatio) ? paintUsageLiquid(raw, usageRatio, kind) : raw;
  return tintSvgToDataUri(painted, iconColor);
}

// Title-case each whitespace-separated word ("physical network" → "Physical Network").
// Used ONLY as a render-time label mapper — for the physical-network fabric box and the
// synthesized node group. It never rewrites `data.label`, so a node's identity/query
// value is untouched.
function titleCaseWords(text: string): string {
  return text.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

// Render-only kind prefixes for decorative compound boxes. `data.label` stays the bare
// name (tooltip / identity); only the canvas stylesheet paints `${PREFIX}: ${name}`.
const GROUP_LABEL_PREFIX = {
  cluster: 'Cluster',
  storageCluster: 'Storage',
  namespace: 'Namespace',
  application: 'Release Unit',
} as const;

// Render-only label mapper: prefixes a node's bare `data.label` with a kind word
// (`${prefix}: ${name}`) on the canvas only. `data.label` is never rewritten, so tooltip
// titles, detail-panel headers and the dashboard `name=` query keep the bare identity.
function prefixedLabel(prefix: string): string {
  return ((ele: cytoscape.NodeSingular): string =>
    `${prefix}: ${String(ele.data('label') ?? '')}`) as unknown as string;
}

// Parent cluster's accent for a compound container's box tint + label, so node and
// cluster read as one family. A COLLAPSED node loses :parent (children removed) and
// reverts to base node styling — the intended "white label once collapsed" behaviour.
function resolveParentClusterColor(ele: cytoscape.NodeSingular, fallback: string): string {
  // Walk the parent chain to the first ancestor with a clusterColor: a controller box
  // sits several levels under the cluster (cluster > namespace > application > controller),
  // so don't stop at the immediate parent.
  let cur: cytoscape.NodeCollection = ele.parent();
  for (let guard = 0; cur.nonempty() && guard < 64; guard++) {
    const c = cur.data('clusterColor') as unknown;
    if (typeof c === 'string') {
      return c;
    }
    cur = cur.parent();
  }
  return fallback;
}

function resolveEdgeStyle(edgeType: string | undefined, map: Record<string, EdgeStyle>): EdgeStyle {
  // Object.hasOwn, not `in`: a wire type named after an Object.prototype member must
  // hit the fallback, not an inherited Function.
  if (edgeType !== undefined && Object.hasOwn(map, edgeType)) {
    const style = map[edgeType];
    if (style !== undefined) {
      return style;
    }
  }
  return FALLBACK_EDGE_STYLE;
}

// Selector for every 'taxi'-routed edge type, derived from the single-source map.
// Empty string when none.
function taxiEdgeSelector(map: Record<string, EdgeStyle>): string {
  return Object.entries(map)
    .filter(([, style]) => style.routing === 'taxi')
    .map(([type]) => `edge[edgeType='${type}']`)
    .join(', ');
}

export function getStylesheet({ theme, colorMap = EDGE_STYLE_BY_TYPE }: GetStylesheetInput): CyStylesheet[] {
  const colors = themeColors(theme);
  const textColor = colors.text.primary;
  // Icons tint with primary (not secondary/muted) text colour — muted is too
  // low-contrast against the dark node fill to read the glyph.
  const iconColor = textColor;
  const bgColor = colors.background.secondary;
  const borderColor = colors.border.medium;
  const selectedColor = colors.primary.main;

  // Data-driven status border (no kind whitelist) from STATUS_COLOR. Spread below
  // between the container selectors and node:selected so it overrides the neutral
  // node:parent border yet yields to the selection highlight.
  const statusSelectors: CyStylesheet[] = Object.entries(STATUS_COLOR).map(([status, color]) => ({
    selector: `node[status="${status}"]`,
    style: { 'border-color': color, 'border-width': 3, 'border-opacity': 1 },
  }));

  // Collapsed container borders in the worst status it hides (data.worstStatus,
  // aggregated in normalize). Gated on the collapsed-node class; spread AFTER
  // statusSelectors so worst-child status overrides the node's OWN status border.
  const collapsedContainerStatusSelectors: CyStylesheet[] = Object.entries(STATUS_COLOR).map(([status, color]) => ({
    selector: `node[worstStatus="${status}"].cy-expand-collapse-collapsed-node`,
    style: { 'border-color': color, 'border-width': 3, 'border-opacity': 1 },
  }));

  // Collapsed decorative groups (cluster / namespace / application) have no kind icon to
  // fall back to (unlike kind-ful compounds, which revert to their kind glyph when folded),
  // so a folded one would be a blank coloured box. Paint a folder glyph tinted by the
  // group's accent. These 2-condition selectors out-specify the 1-condition
  // node[?isCluster|isStorageCluster|isNamespace|isApplication] `background-image: 'none'` rules, so the
  // folder shows ONLY when collapsed. See compound-parent-collapse-cue.
  const folderIcon = (color: unknown): string =>
    tintSvgToDataUri(FOLDER_ICON_SVG, typeof color === 'string' ? color : iconColor);
  const collapsedDecorativeFolderSelectors: CyStylesheet[] = (
    [
      ['node[?isCluster].cy-expand-collapse-collapsed-node', 'clusterColor'],
      ['node[?isNamespace].cy-expand-collapse-collapsed-node', 'namespaceColor'],
      ['node[?isApplication].cy-expand-collapse-collapsed-node', 'applicationColor'],
      ['node[?isStorageCluster].cy-expand-collapse-collapsed-node', 'storageClusterColor'],
    ] as const
  ).map(([selector, colorKey]) => ({
    selector,
    style: {
      'background-image': ((ele: cytoscape.NodeSingular): string =>
        folderIcon(ele.data(colorKey))) as unknown as string,
      'background-fit': 'contain',
      'background-clip': 'none',
      'background-image-opacity': 1,
    },
  }));

  // Same folder treatment for the synthesized node group, which is kind-less too but
  // carries no accent FIELD to key on — it borrows its cluster's accent through the same
  // parent-chain walk that tints the expanded box, so the folded and unfolded states agree.
  // A collapsed node drops out of :parent and would otherwise fall through to the base
  // `node` rule's fallback kind glyph.
  const collapsedNodeGroupFolderSelector: CyStylesheet = {
    selector: 'node[?isNodeGroup].cy-expand-collapse-collapsed-node',
    style: {
      'background-image': ((ele: cytoscape.NodeSingular): string =>
        folderIcon(resolveParentClusterColor(ele, iconColor))) as unknown as string,
      'background-fit': 'contain',
      'background-clip': 'none',
      'background-image-opacity': 1,
    },
  };

  const stylesheet: CyStylesheet[] = [
    {
      // Leaf nodes: neutral shape + centered theme-tinted kind icon. The on-canvas
      // glyph renders only once the SVG carries an XML header (see iconSvgByKind.ts) —
      // without it cytoscape shows the icon in the legend <img> but blank on-canvas.
      selector: 'node',
      style: {
        shape: 'round-rectangle',
        'background-color': bgColor,
        'background-image': ((ele: cytoscape.NodeSingular): string => {
          const ratio = ele.data('usageRatio') as unknown;
          return typeof ratio === 'number'
            ? resolveIconUri(ele.data('kind') as NodeKind | undefined, iconColor, ratio)
            : resolveIconUri(ele.data('kind') as NodeKind | undefined, iconColor);
        }) as unknown as string,
        'background-fit': 'contain',
        'background-clip': 'none',
        'background-image-opacity': 1,
        'border-color': borderColor,
        'border-width': 1.5,
        label: 'data(label)',
        color: textColor,
        'font-size': 11,
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 4,
        width: NODE_SIZE,
        height: NODE_SIZE,
      },
    },
    {
      // Compound parents (cytoscape native :parent — no data flag needed) render as
      // neutral labelled containers; childless nodes fall through to their kind shape.
      // Real node containers stay interactive; only clusters opt out below.
      selector: 'node:parent',
      style: {
        shape: 'round-rectangle',
        // Tint with parent cluster's accent (node + cluster read as one family).
        // Cluster containers also match node:parent but have empty parent() → neutral
        // here, then node[?isCluster] below overrides with their own colour.
        'background-color': ((ele: cytoscape.NodeSingular): string =>
          resolveParentClusterColor(ele, borderColor)) as unknown as string,
        'background-opacity': 0.1,
        // No resource icon: a `contain`-fitted glyph would fill the box behind its
        // children. Box stays a labelled backplate.
        'background-image': 'none',
        'border-color': borderColor,
        'border-width': 1,
        'border-opacity': 0.6,
        label: 'data(label)',
        // Label also takes the cluster accent; a collapsed node drops out of :parent
        // and reverts to base node's plain text colour (the expanded-vs-collapsed cue).
        color: ((ele: cytoscape.NodeSingular): string =>
          resolveParentClusterColor(ele, textColor)) as unknown as string,
        'font-size': 13,
        'text-valign': 'top',
        'text-halign': 'center',
        'text-margin-y': -3,
        padding: '14px',
      },
    },
    {
      // Cluster container nodes (see normalize.ts), accent in data(clusterColor).
      // selectable:false in normalize → decorative (no selection ring / detail panel)
      // but still hoverable (tooltip) and draggable by margin/label. Declared
      // after node:parent so its accent wins.
      selector: 'node[?isCluster]',
      style: {
        shape: 'round-rectangle',
        // No resource icon (base mapper would otherwise paint the fallback glyph).
        'background-image': 'none',
        'background-color': 'data(clusterColor)',
        'background-opacity': 0.07,
        'border-color': 'data(clusterColor)',
        'border-width': 1.5,
        'border-opacity': 0.5,
        // Render-only kind prefix — data.label stays bare for tooltip / identity.
        label: prefixedLabel(GROUP_LABEL_PREFIX.cluster),
        color: 'data(clusterColor)',
        'font-size': 18,
        'font-weight': 600,
        'text-valign': 'top',
        'text-halign': 'center',
        'text-margin-y': -4,
        padding: '18px',
      },
    },
    {
      // ONTAP cluster box (`storage-cluster`), accent in data(storageClusterColor). A
      // top-level sibling of the K8s cluster box — same decorative treatment, deliberately
      // its own accent so the two never read as the same kind of thing. Its children are
      // REAL nodes (netapp-node > netapp-aggr), unlike the workload groups.
      selector: 'node[?isStorageCluster]',
      style: {
        shape: 'round-rectangle',
        // No resource icon (base mapper would otherwise paint the fallback glyph).
        'background-image': 'none',
        'background-color': 'data(storageClusterColor)',
        'background-opacity': 0.07,
        'border-color': 'data(storageClusterColor)',
        'border-width': 1.5,
        'border-opacity': 0.5,
        // Render-only kind prefix — data.label stays bare for tooltip / identity.
        label: prefixedLabel(GROUP_LABEL_PREFIX.storageCluster),
        color: 'data(storageClusterColor)',
        'font-size': 18,
        'font-weight': 600,
        'text-valign': 'top',
        'text-halign': 'center',
        'text-margin-y': -4,
        padding: '18px',
      },
    },
    {
      // Backend D6 namespace group, accent in data.namespaceColor. Matches
      // node[?isNamespace] DIRECTLY (not via :parent) so the colour holds in both
      // expanded and collapsed states. Declared after node[?isCluster], before
      // node[?isApplication] / node:selected.
      selector: 'node[?isNamespace]',
      style: {
        shape: 'round-rectangle',
        'background-image': 'none',
        'background-color': 'data(namespaceColor)',
        'background-opacity': 0.1,
        'border-color': 'data(namespaceColor)',
        'border-width': 1.5,
        'border-opacity': 0.7,
        // Render-only kind prefix — data.label stays bare for tooltip / identity.
        label: prefixedLabel(GROUP_LABEL_PREFIX.namespace),
        color: 'data(namespaceColor)',
        'font-size': 17,
        'font-weight': 600,
        'text-valign': 'top',
        'text-halign': 'center',
        'text-margin-y': -3,
        padding: '12px',
      },
    },
    {
      // Backend D6 application group (ArgoCD app), accent in data.applicationColor. The
      // innermost decorative box (cluster > namespace > application > controller > pod);
      // clone of node[?isNamespace] keyed on the application accent. Matches directly so
      // the colour holds expanded or collapsed. Declared after node[?isNamespace].
      selector: 'node[?isApplication]',
      style: {
        shape: 'round-rectangle',
        'background-image': 'none',
        'background-color': 'data(applicationColor)',
        'background-opacity': 0.1,
        'border-color': 'data(applicationColor)',
        'border-width': 1.5,
        'border-opacity': 0.7,
        // Render-only kind prefix ("Release Unit") — data.label stays bare.
        label: prefixedLabel(GROUP_LABEL_PREFIX.application),
        color: 'data(applicationColor)',
        'font-size': 17,
        'font-weight': 600,
        'text-valign': 'top',
        'text-halign': 'center',
        'text-margin-y': -3,
        padding: '12px',
      },
    },
    {
      // Physical-network fabric box (the `network` compound wrapping the switches).
      // Aligns its header with the decorative group boxes: title-cased words + the same
      // enlarged, semibold label. The label is a RENDER-ONLY function mapper (title-case
      // the raw name) — `data.label` itself is left as the backend name, so nothing that
      // reads identity (dashboard `name=` query, detail-panel title) is affected.
      // Declared after node:parent so it wins the label/size for the wrapper.
      selector: "node[kind='network']",
      style: {
        label: ((ele: cytoscape.NodeSingular): string =>
          titleCaseWords(String(ele.data('label') ?? ''))) as unknown as string,
        'font-size': 17,
        'font-weight': 600,
      },
    },
    {
      // Panel-synthesized node group (`cluster > node group > node`) — the box that folds a
      // cluster's K8s machines away. Header only: it deliberately has NO accent field of its
      // own, so the tint and label colour it inherits from node:parent (its cluster's accent,
      // resolved by the parent-chain walk) are exactly right and must not be overridden here.
      // Same title-cased render-only mapper as the fabric box, so `data.label` stays `nodes`.
      // Declared after node:parent so the header wins.
      selector: 'node[?isNodeGroup]',
      style: {
        label: ((ele: cytoscape.NodeSingular): string =>
          titleCaseWords(String(ele.data('label') ?? ''))) as unknown as string,
        'font-size': 17,
        'font-weight': 600,
      },
    },
    // K8s `node` box — aligned with the decorative group headers ONLY WHEN it is an
    // actual compound: a "Node: " kind prefix (mirroring `Cluster: `/`Namespace: `/
    // `Release Unit: `) + the same enlarged, semibold label. RENDER-ONLY function mapper —
    // `data.label` stays the bare resource name the dashboard `name=` query and the
    // detail-panel title depend on. In node-layout the node wraps its pods (`:parent`); in
    // controller-layout it is a plain leaf and MUST fall through to the base `node` title
    // (bare label, base font). Gated on `:parent` for that reason; the `.collapsed`
    // sibling keeps the treatment when a node-layout box is folded (children removed →
    // no longer `:parent`) — a controller-layout leaf is never a compound, so it never
    // carries the collapsed class and is unaffected. Both declared after node:parent.
    ...(["node[kind='node']:parent", "node[kind='node'].cy-expand-collapse-collapsed-node"] as const).map(
      (selector) => ({
        selector,
        style: {
          label: prefixedLabel('Node'),
          'font-size': 18,
          'font-weight': 600,
        },
      })
    ),
    {
      // Collapsed compound node. Heavier border signals it can be expanded; the +/-
      // cue is drawn by the expand-collapse extension independently.
      selector: 'node.cy-expand-collapse-collapsed-node',
      style: {
        'border-width': 3,
        'border-opacity': 0.9,
      },
    },
    ...collapsedDecorativeFolderSelectors,
    collapsedNodeGroupFolderSelector,
    ...statusSelectors,
    ...collapsedContainerStatusSelectors,
    {
      // Selection = outline RING + underlay halo, NOT a border override: a blue border
      // would clobber the status border, hiding the very colour signalling a pod's
      // health. outline-*/underlay-* leave border+background+icon untouched. Declared
      // after the status selectors so it applies to selected leaf nodes AND containers.
      selector: 'node:selected',
      style: {
        'outline-color': selectedColor,
        'outline-width': 3,
        'outline-offset': 3,
        'underlay-color': selectedColor,
        'underlay-opacity': 0.35,
        'underlay-padding': 6,
      },
    },
    {
      // Dimming: nodes outside the selected node's neighbourhood/ancestry (focus fade), or
      // non-hit nodes while a search query is active (miss fade). useGraphFade picks the
      // lit set for whichever reason applies; one declaration serves both.
      selector: `node.${FADED_CLASS}`,
      style: { opacity: 0.2 },
    },
    {
      selector: 'edge',
      style: {
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        // Slightly larger heads so direction reads at dense zoom levels (visual polish only).
        'arrow-scale': 1.4,
        width: 1.5,
        'line-color': ((ele: cytoscape.EdgeSingular): string =>
          resolveEdgeStyle(ele.data('edgeType') as EdgeType | undefined, colorMap).color) as unknown as string,
        'target-arrow-color': ((ele: cytoscape.EdgeSingular): string =>
          resolveEdgeStyle(ele.data('edgeType') as EdgeType | undefined, colorMap).color) as unknown as string,
        'line-style': ((ele: cytoscape.EdgeSingular): cytoscape.Css.LineStyle =>
          resolveEdgeStyle(ele.data('edgeType') as EdgeType | undefined, colorMap)
            .lineStyle) as unknown as cytoscape.Css.LineStyle,
      },
    },
    // Fabric edges (routing: 'taxi' in the edge-style map) route orthogonally so the
    // many edges converging on a switch share clean right-angle channels. Declared
    // after the base `edge` selector so its curve-style wins; sets only routing props.
    ...(taxiEdgeSelector(colorMap) === ''
      ? []
      : [
          {
            selector: taxiEdgeSelector(colorMap),
            style: {
              'curve-style': 'taxi',
              'taxi-direction': 'vertical',
              'taxi-turn': '50%',
              'taxi-turn-min-distance': 5,
            } as unknown as cytoscape.Css.Edge,
          },
        ]),
    {
      // Ingress-gateway path edges (data.ingressPath, set by normalize's markIngressEdges):
      // rendered dashed so the pod → ingress-svc → ingress-pod → backend-svc path reads apart
      // from normal traffic when the ingress toggle is on. Declared after the base `edge` +
      // taxi rules so it overrides their `line-style`; colour/arrow/routing are left intact.
      // Only visible when the toggle is on — otherwise these edges are filtered out entirely.
      // Dash pattern is shared with the transport rule below (NETWORK_HOP_DASH_PATTERN).
      selector: 'edge[?ingressPath]',
      style: {
        'line-style': 'dashed',
        'line-dash-pattern': [...NETWORK_HOP_DASH_PATTERN],
      },
    },
    {
      // The broker counterpart of the rule above: the backend labels a service-graph edge
      // `relation: transport` when it is the pod's actual network connection to a broker,
      // as opposed to `relation: link` (the logical producer → consumer dependency that hop
      // stands in for) which stays solid. Same dashed treatment and the SAME pattern — both
      // say "network hop through a middlebox, not the real dependency" — so an edge that is
      // both ingressPath and transport gets identical values from either rule and the
      // declaration order between them does not matter. Matches on the flat `data.relation`
      // hoisted by normalize: cytoscape selectors cannot read nested `labels.relation`.
      selector: `edge[relation = "${EDGE_RELATION_TRANSPORT}"]`,
      style: {
        'line-style': 'dashed',
        'line-dash-pattern': [...NETWORK_HOP_DASH_PATTERN],
      },
    },
    {
      // Dimming for edges (see node.FADED_CLASS above); lower than nodes so faded
      // connections recede further than faded glyphs.
      selector: `edge.${FADED_CLASS}`,
      style: { opacity: 0.12 },
    },
    {
      // Boundary edge re-pointed to a collapsed container by expand-collapse. The extension
      // MOVES the original edge (same id, same data) rather than synthesising a new one, so
      // colour/arrow/line-style cascade from the base `edge` rule and the edge stays subject
      // to the normal edge-type/ingress filtering under its own id (see useElementFilter —
      // it deliberately has NO meta-edge exemption). This rule only bumps width + forces a
      // straight line (taxi/bezier both look noisy between collapsed boxes).
      selector: 'edge.cy-expand-collapse-meta-edge',
      style: {
        'curve-style': 'straight',
        width: 2.5,
      },
    },
  ];

  return stylesheet;
}
