import cytoscape from 'cytoscape';

import {
  EDGE_STYLE_BY_TYPE,
  FALLBACK_EDGE_STYLE,
  NETWORK_HOP_DASH_PATTERN,
} from '../../../shared/constants/colorByEdgeType';
import { STATUS_COLOR } from '../../../shared/constants/colorByStatus';
import { EDGE_RELATION_TRANSPORT } from '../../../shared/constants/edgeRelation';
import { FALLBACK_ICON_SVG, FOLDER_ICON_SVG, ICON_SVG_BY_KIND } from '../../../shared/constants/iconSvgByKind';
import { usageFillPaint } from '../../../shared/icon/paintUsageLiquid';
import { tintSvgToDataUri } from '../../../shared/icon/tintSvgToDataUri';
import { DARK_TOKENS, LIGHT_TOKENS } from '../../../shared/theme/tokens';

import { FADED_CLASS, getStylesheet } from './getStylesheet';

type FakeData = Record<string, unknown>;
type StyleRecord = Record<string, unknown>;
type NodeFn = (ele: cytoscape.NodeSingular) => string;
type EdgeFn = (ele: cytoscape.EdgeSingular) => string;

// The background-image / line-color / line-style props are function-valued mappers
// cytoscape evaluates per element. Build a minimal element exposing `.data(key)`
// so we can invoke them directly without a live cytoscape instance.
const fakeEle = (data: FakeData): cytoscape.NodeSingular & cytoscape.EdgeSingular =>
  ({ data: (k: string) => data[k] }) as unknown as cytoscape.NodeSingular & cytoscape.EdgeSingular;

const styleFor = (selector: string): StyleRecord => {
  const sheet = getStylesheet({ theme: DARK_TOKENS }) as unknown as Array<{
    selector: string;
    style?: StyleRecord;
  }>;
  return sheet.find((s) => s.selector === selector)?.style ?? {};
};

// The icon tint colour the factory uses (theme primary text).
const iconColor = DARK_TOKENS.fg.primary;

describe('getStylesheet', () => {
  it('returns the expected number of selectors', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS });
    const selectors = sheet.map((s) => s.selector);
    expect(selectors).toEqual(expect.arrayContaining(['node', 'node:selected', 'edge']));
  });

  it('produces different colors for light vs dark theme', () => {
    const light = getStylesheet({ theme: LIGHT_TOKENS });
    const dark = getStylesheet({ theme: DARK_TOKENS });
    expect(JSON.stringify(light)).not.toBe(JSON.stringify(dark));
  });

  it('matches snapshot for default theme', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS });
    expect(sheet).toMatchSnapshot();
  });

  it('uses a uniform round-rectangle container for all leaf nodes (shape no longer encodes kind)', () => {
    expect(styleFor('node').shape).toBe('round-rectangle');
  });

  it('draws each kind as a theme-tinted svg data-URI background-image', () => {
    const bgFn = styleFor('node')['background-image'] as NodeFn;
    for (const [kind, svg] of Object.entries(ICON_SVG_BY_KIND)) {
      const uri = bgFn(fakeEle({ kind }));
      expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
      expect(uri).toBe(tintSvgToDataUri(svg, iconColor));
    }
    // Distinct kinds yield distinct glyphs.
    expect(bgFn(fakeEle({ kind: 'pod' }))).not.toBe(bgFn(fakeEle({ kind: 'service' })));
  });

  it('falls back to a generic icon for unknown / missing kind (never throws, never blank)', () => {
    const bgFn = styleFor('node')['background-image'] as NodeFn;
    const fallbackUri = tintSvgToDataUri(FALLBACK_ICON_SVG, iconColor);
    expect(bgFn(fakeEle({ kind: 'mystery' }))).toBe(fallbackUri);
    expect(bgFn(fakeEle({}))).toBe(fallbackUri);
  });

  it('fills the node with the icon via background-fit:contain (SVG viewBox margin keeps it off the border)', () => {
    const nodeStyle = styleFor('node');
    expect(nodeStyle['background-fit']).toBe('contain');
  });

  it('maps every backend edge type to its color and line style', () => {
    const edgeStyle = styleFor('edge');
    const colorFn = edgeStyle['line-color'] as EdgeFn;
    const lineFn = edgeStyle['line-style'] as EdgeFn;
    for (const [edgeType, style] of Object.entries(EDGE_STYLE_BY_TYPE)) {
      expect(colorFn(fakeEle({ edgeType }))).toBe(style.color);
      expect(lineFn(fakeEle({ edgeType }))).toBe(style.lineStyle);
    }
  });

  it('derives the taxi-routing selector from the edge-style map (fabric edges only)', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const taxiRule = sheet.find((s) => (s.style as Record<string, unknown> | undefined)?.['curve-style'] === 'taxi');
    expect(taxiRule).toBeDefined();
    const expected = Object.entries(EDGE_STYLE_BY_TYPE)
      .filter(([, style]) => style.routing === 'taxi')
      .map(([type]) => `edge[edgeType='${type}']`)
      .join(', ');
    expect(taxiRule?.selector).toBe(expected);
  });

  it('falls back for unknown/undefined edge type', () => {
    const colorFn = styleFor('edge')['line-color'] as EdgeFn;
    expect(colorFn(fakeEle({ edgeType: 'nope' }))).toBe(FALLBACK_EDGE_STYLE.color);
  });

  it('dashes ingress-path edges via a data-flag selector (overrides the base line-style)', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS }) as unknown as Array<{ selector: string }>;
    const selectors = sheet.map((s) => s.selector);
    // Declared after the base `edge` rule so its static dashed line-style wins.
    expect(selectors.indexOf('edge[?ingressPath]')).toBeGreaterThan(selectors.indexOf('edge'));
    expect(styleFor('edge[?ingressPath]')['line-style']).toBe('dashed');
  });

  it('dashes relation=transport edges via the hoisted flat data field', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS }) as unknown as Array<{ selector: string }>;
    const selectors = sheet.map((s) => s.selector);
    const transportSelector = `edge[relation = "${EDGE_RELATION_TRANSPORT}"]`;
    // Same override requirement as the ingress rule above.
    expect(selectors.indexOf(transportSelector)).toBeGreaterThan(selectors.indexOf('edge'));
    expect(styleFor(transportSelector)['line-style']).toBe('dashed');
  });

  it('gives both dash overlays the same rhythm, so their declaration order cannot matter', () => {
    const ingress = styleFor('edge[?ingressPath]');
    const transport = styleFor(`edge[relation = "${EDGE_RELATION_TRANSPORT}"]`);
    expect(transport).toEqual(ingress);
    expect(ingress['line-dash-pattern']).toEqual([...NETWORK_HOP_DASH_PATTERN]);
  });

  it('enlarges base leaf node to 40x40', () => {
    const nodeStyle = styleFor('node');
    expect(nodeStyle.width).toBe(40);
    expect(nodeStyle.height).toBe(40);
  });

  it('keeps cluster boxes grabbable (no events:no) so the user can drag a cluster around', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const cluster = sheet.find((s) => s.selector === 'node[?isCluster]');
    // events:'no' would make the backplate non-interactive and so non-draggable;
    // it must be absent (cytoscape default 'yes') for cluster drag to work.
    expect(cluster?.style?.events).toBeUndefined();
  });

  it('declares collapsed-node and meta-edge selectors', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const selectors = sheet.map((s) => s.selector);
    expect(selectors).toContain('node.cy-expand-collapse-collapsed-node');
    expect(selectors).toContain('edge.cy-expand-collapse-meta-edge');
    const metaEdge = sheet.find((s) => s.selector === 'edge.cy-expand-collapse-meta-edge');
    // The meta-edge keeps its real edge-type colour (cascades from the base `edge`
    // rule), so this rule must NOT pin a colour — it only bumps the width + forces
    // a straight line as the collapsed-boundary cue.
    expect(metaEdge?.style?.['line-color']).toBeUndefined();
    expect(metaEdge?.style?.width).toBe(2.5);
    expect(metaEdge?.style?.['curve-style']).toBe('straight');
  });

  it('borders ANY node carrying a status (kind-agnostic node[status] selectors, not a kind whitelist)', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const selectors = sheet.map((s) => s.selector);
    for (const [status, color] of Object.entries(STATUS_COLOR)) {
      expect(selectors).toContain(`node[status="${status}"]`);
      const rule = sheet.find((s) => s.selector === `node[status="${status}"]`);
      expect(rule?.style?.['border-color']).toBe(color);
    }
    // No longer keyed on a pod/node/pvc whitelist — data-driven on the status attribute.
    expect(selectors.some((s) => s.includes('node[kind="pod"][status='))).toBe(false);
  });

  it('declares collapsed-container worst-status border selectors, after the per-kind status selectors', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const selectors = sheet.map((s) => s.selector);
    // The per-kind status borders (pod/node/pvc) a collapsed node's worst-status tint
    // must be declared AFTER, so it overrides the node's OWN status border.
    const lastStatusIdx = Math.max(...selectors.map((s, i) => (s.includes('[status="') ? i : -1)));
    for (const [status, color] of Object.entries(STATUS_COLOR)) {
      const sel = `node[worstStatus="${status}"].cy-expand-collapse-collapsed-node`;
      expect(selectors).toContain(sel);
      expect(selectors.indexOf(sel)).toBeGreaterThan(lastStatusIdx);
      const rule = sheet.find((s) => s.selector === sel);
      expect(rule?.style?.['border-color']).toBe(color);
      expect(rule?.style?.['border-width']).toBe(3);
    }
  });

  it('tints a controller border by worst child status ONLY when collapsed (expanded stays neutral)', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: DARK_TOKENS }) as cytoscape.StylesheetStyle[],
      elements: [
        {
          group: 'nodes',
          data: { id: 'ctrl', label: 'api', kind: 'deployment', isController: true, worstStatus: 'critical' },
        },
        { group: 'nodes', data: { id: 'p1', label: 'web', kind: 'pod', parent: 'ctrl', status: 'normal' } },
        // Reference node carrying the critical colour in cytoscape's computed format.
        { group: 'nodes', data: { id: 'crit', label: 'crit', kind: 'pod', status: 'critical' } },
      ],
    });
    const ctrl = cy.getElementById('ctrl');
    const expandedBorder = ctrl.style('border-color') as string;
    const critColor = cy.getElementById('crit').style('border-color') as string;
    // A controller has no status border; expanded (:parent) → neutral, NOT the status colour.
    expect(expandedBorder).not.toBe(critColor);
    // Collapsed (extension marks the node) → border tints to the worst child status colour.
    ctrl.addClass('cy-expand-collapse-collapsed-node');
    expect(ctrl.style('border-color')).toBe(critColor);
    expect(ctrl.style('border-color')).not.toBe(expandedBorder);
    cy.destroy();
  });

  it('a collapsed k8s node borders by its worstStatus, overriding its OWN status; expanded keeps own status', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: DARK_TOKENS }) as cytoscape.StylesheetStyle[],
      elements: [
        // A normal-status k8s node hiding a critical child pod → normalize tags worstStatus 'critical'.
        { group: 'nodes', data: { id: 'n', label: 'w0', kind: 'node', status: 'normal', worstStatus: 'critical' } },
        { group: 'nodes', data: { id: 'p1', label: 'web', kind: 'pod', parent: 'n', status: 'normal' } },
        // Reference leaves carrying the normal / critical status colours.
        { group: 'nodes', data: { id: 'norm', label: 'norm', kind: 'pod', status: 'normal' } },
        { group: 'nodes', data: { id: 'crit', label: 'crit', kind: 'pod', status: 'critical' } },
      ],
    });
    const n = cy.getElementById('n');
    const normalColor = cy.getElementById('norm').style('border-color') as string;
    const critColor = cy.getElementById('crit').style('border-color') as string;
    // Expanded → its OWN status (normal), NOT the hidden child's critical colour.
    expect(n.style('border-color')).toBe(normalColor);
    expect(n.style('border-color')).not.toBe(critColor);
    // Collapsed → worstStatus (critical) overrides the own-status border.
    n.addClass('cy-expand-collapse-collapsed-node');
    expect(n.style('border-color')).toBe(critColor);
    cy.destroy();
  });

  it('styles compound parents as boxes, leaves as icon containers, and clusters without an icon (headless :parent)', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: DARK_TOKENS }) as cytoscape.StylesheetStyle[],
      elements: [
        { group: 'nodes', data: { id: 'cluster:demo', label: 'demo', isCluster: true, clusterColor: '#14b8a6' } },
        { group: 'nodes', data: { id: 'demo/node-a', label: 'node-a', kind: 'node', parent: 'cluster:demo' } },
        { group: 'nodes', data: { id: 'demo/p1', label: 'web', kind: 'pod', parent: 'demo/node-a' } },
        { group: 'nodes', data: { id: 'leaf-node', label: 'solo', kind: 'node' } },
      ],
    });
    // Every node (leaf or container) now uses the round-rectangle container shape.
    expect(cy.getElementById('demo/node-a').style('shape')).toBe('round-rectangle');
    expect(cy.getElementById('demo/p1').style('shape')).toBe('round-rectangle');
    expect(cy.getElementById('leaf-node').style('shape')).toBe('round-rectangle');
    // A leaf node carries a kind icon as background-image.
    expect(cy.getElementById('demo/p1').style('background-image')).toMatch(/^data:image\/svg\+xml,/);
    // A compound parent (K8s node boxing pods) suppresses the icon so it does not
    // fill the box behind its children.
    expect(cy.getElementById('demo/node-a').style('background-image')).toBe('none');
    // The cluster container carries NO resource icon and gets its accent backplate.
    expect(cy.getElementById('cluster:demo').style('background-image')).toBe('none');
    expect(Number(cy.getElementById('cluster:demo').style('background-opacity'))).toBeCloseTo(0.07);
    // A K8s node container is tinted with its parent cluster's accent (same colour
    // as the cluster backplate), so node and cluster read as one family.
    expect(cy.getElementById('demo/node-a').style('background-color')).toBe(
      cy.getElementById('cluster:demo').style('background-color')
    );
    // Its LABEL takes the cluster accent too (matching the box + legend swatch).
    expect(cy.getElementById('demo/node-a').style('color')).toBe(cy.getElementById('cluster:demo').style('color'));
    // A drawn leaf node (no children → not :parent) keeps the base node fill, not
    // the cluster tint, and the plain (white) base label colour.
    expect(cy.getElementById('leaf-node').style('background-color')).not.toBe(
      cy.getElementById('cluster:demo').style('background-color')
    );
    expect(cy.getElementById('leaf-node').style('color')).not.toBe(cy.getElementById('cluster:demo').style('color'));
    cy.destroy();
  });

  it('renders a netapp-aggr leaf with its disk glyph (always — never a compound box)', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: DARK_TOKENS }) as cytoscape.StylesheetStyle[],
      elements: [
        { group: 'nodes', data: { id: 'cluster/prod', label: 'prod', isCluster: true, clusterColor: '#14b8a6' } },
        // A netapp-aggr is a LEAF (its parent is the real netapp-node, or here a cluster
        // box standing in for one), carrying health/usage rather than provisioner/parameters.
        {
          group: 'nodes',
          data: {
            id: 'netapp/ontap-prod/aggr/aggr1',
            label: 'aggr1',
            kind: 'netapp-aggr',
            parent: 'cluster/prod',
            health: 'online',
          },
        },
        // A PVC nests under its namespace (never under the storage chain).
        { group: 'nodes', data: { id: 'pvc/data-0', label: 'data-0', kind: 'pvc', parent: 'cluster/prod' } },
      ],
    });
    const sc = cy.getElementById('netapp/ontap-prod/aggr/aggr1');
    // A leaf (no children → never :parent) ALWAYS shows its aggregate disk glyph, with
    // no expanded-vs-collapsed compound behaviour.
    expect(sc.style('background-image')).toBe(tintSvgToDataUri(ICON_SVG_BY_KIND['netapp-aggr'], iconColor));
    expect(sc.style('shape')).toBe('round-rectangle');
    // The PVC carries its own kind icon.
    expect(cy.getElementById('pvc/data-0').style('background-image')).toMatch(/^data:image\/svg\+xml,/);
    cy.destroy();
  });

  it('highlights a selected node with a crisp outline ring plus an underlay halo, leaving its border untouched', () => {
    const selectedStyle = styleFor('node:selected');
    // A distinct outline ring is drawn OUTSIDE the node (outline-* is separate from
    // border-*), offset off the border so a gap separates the two — the bold,
    // obvious selection cue.
    expect(selectedStyle['outline-color']).toBeDefined();
    expect(Number(selectedStyle['outline-width'])).toBeGreaterThan(0);
    expect(Number(selectedStyle['outline-offset'])).toBeGreaterThan(0);
    // The underlay halo is drawn UNDER the node, so the selection also glows softly
    // from behind without overriding anything painted on the node itself.
    expect(selectedStyle['underlay-color']).toBeDefined();
    expect(Number(selectedStyle['underlay-opacity'])).toBeGreaterThan(0);
    expect(Number(selectedStyle['underlay-padding'])).toBeGreaterThan(0);
    // Neither cue touches the border — that is where pod/node/pvc status colour
    // lives, and the old blue selection border used to clobber it.
    expect(selectedStyle['border-color']).toBeUndefined();
    expect(selectedStyle['border-width']).toBeUndefined();
  });

  it('keeps a critical pod’s status border when it is selected (selection no longer clobbers status)', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: DARK_TOKENS }) as cytoscape.StylesheetStyle[],
      elements: [
        { group: 'nodes', data: { id: 'p1', label: 'web', kind: 'pod', status: 'critical' } },
        { group: 'nodes', data: { id: 'p2', label: 'idle', kind: 'pod', status: 'normal' } },
      ],
    });
    const pod = cy.getElementById('p1');
    const statusBorder = pod.style('border-color') as string;
    // Sanity: the critical pod really does carry a distinct status border to begin
    // with (different from a normal pod's), so the assertion below is meaningful.
    expect(statusBorder).not.toBe(cy.getElementById('p2').style('border-color'));
    pod.select();
    // Selecting the pod leaves its status border colour intact...
    expect(pod.style('border-color')).toBe(statusBorder);
    // ...and adds a visible underlay halo.
    expect(Number(pod.style('underlay-opacity'))).toBeGreaterThan(0);
    cy.destroy();
  });

  const SWITCH_FABRIC_SELECTOR = "edge[edgeType='switch-to-switch'], edge[edgeType='node-to-switch']";

  it('routes switch↔switch and node→switch orthogonally (taxi); other edges stay bezier (direct)', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: DARK_TOKENS }) as cytoscape.StylesheetStyle[],
      elements: [
        { group: 'nodes', data: { id: 'n1', kind: 'node' } },
        { group: 'nodes', data: { id: 'sw1', kind: 'switch' } },
        { group: 'nodes', data: { id: 'sw2', kind: 'switch' } },
        { group: 'nodes', data: { id: 'p1', kind: 'pod' } },
        { group: 'nodes', data: { id: 'p2', kind: 'pod' } },
        { group: 'edges', data: { id: 'e_n2s', source: 'n1', target: 'sw1', edgeType: 'node-to-switch' } },
        { group: 'edges', data: { id: 'e_s2s', source: 'sw1', target: 'sw2', edgeType: 'switch-to-switch' } },
        { group: 'edges', data: { id: 'e_other', source: 'p1', target: 'p2', edgeType: 'pod-calls-pod' } },
      ],
    });
    // node→switch and switch↔switch both route orthogonally (taxi) — K8s nodes are
    // pinned one tier above the fabric in controller mode, so uplinks align with
    // inter-switch wiring.
    expect(cy.getElementById('e_n2s').style('curve-style')).toBe('taxi');
    expect(cy.getElementById('e_s2s').style('curve-style')).toBe('taxi');
    expect(cy.getElementById('e_other').style('curve-style')).toBe('bezier');
    cy.destroy();
  });

  it('keeps the fabric selector to routing only, so colour/line-style are preserved from the base edge rule', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const switchSel = sheet.find((s) => s.selector === SWITCH_FABRIC_SELECTOR);
    expect(switchSel?.style?.['curve-style']).toBe('taxi');
    expect(switchSel?.style?.['taxi-direction']).toBe('vertical');
    // The selector must NOT redefine colour or line-style — those cascade from the
    // base `edge` rule so switch-fabric edges keep their respective styling.
    expect(switchSel?.style?.['line-color']).toBeUndefined();
    expect(switchSel?.style?.['line-style']).toBeUndefined();
    // Declared after the base `edge` rule so its curve-style wins.
    const selectors = sheet.map((s) => s.selector);
    expect(selectors.indexOf(SWITCH_FABRIC_SELECTOR)).toBeGreaterThan(selectors.indexOf('edge'));
  });

  it('declares a namespace-box selector (data(namespaceColor)) after node[?isCluster] and before node:selected', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const selectors = sheet.map((s) => s.selector);
    const nsIdx = selectors.indexOf('node[?isNamespace]');
    expect(nsIdx).toBeGreaterThan(-1);
    const ns = sheet[nsIdx]?.style ?? {};
    expect(ns['background-color']).toBe('data(namespaceColor)');
    expect(ns['border-color']).toBe('data(namespaceColor)');
    expect(ns['background-image']).toBe('none');
    // After the cluster selector (so its accent wins for namespace boxes), before the
    // selection ring (which still wins).
    expect(nsIdx).toBeGreaterThan(selectors.indexOf('node[?isCluster]'));
    expect(nsIdx).toBeLessThan(selectors.indexOf('node:selected'));
  });

  it('declares an application-box selector (data(applicationColor)) after node[?isNamespace], before node:selected', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const selectors = sheet.map((s) => s.selector);
    const appIdx = selectors.indexOf('node[?isApplication]');
    expect(appIdx).toBeGreaterThan(-1);
    const app = sheet[appIdx]?.style ?? {};
    expect(app['background-color']).toBe('data(applicationColor)');
    expect(app['border-color']).toBe('data(applicationColor)');
    expect(app['background-image']).toBe('none');
    expect(appIdx).toBeGreaterThan(selectors.indexOf('node[?isNamespace]'));
    expect(appIdx).toBeLessThan(selectors.indexOf('node:selected'));
  });

  it('paints decorative-group kind prefixes as render-only label mappers (data.label stays bare)', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const cases: Array<{ selector: string; bare: string; painted: string }> = [
      { selector: 'node[?isCluster]', bare: 'prod', painted: 'Cluster: prod' },
      { selector: 'node[?isNamespace]', bare: 'shop', painted: 'Namespace: shop' },
      { selector: 'node[?isApplication]', bare: 'mongo', painted: 'Release Unit: mongo' },
    ];
    for (const { selector, bare, painted } of cases) {
      const rule = sheet.find((s) => s.selector === selector);
      const labelFn = rule?.style?.label as NodeFn;
      expect(typeof labelFn).toBe('function');
      expect(labelFn(fakeEle({ label: bare }))).toBe(painted);
    }
  });

  it('renders decorative-group canvas labels with kind prefixes while data.label stays bare', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: DARK_TOKENS }) as cytoscape.StylesheetStyle[],
      elements: [
        { group: 'nodes', data: { id: 'cl', label: 'prod', isCluster: true, clusterColor: '#5b6b7a' } },
        {
          group: 'nodes',
          data: { id: 'ns', label: 'shop', isNamespace: true, namespaceColor: '#7d6a99', parent: 'cl' },
        },
        {
          group: 'nodes',
          data: { id: 'app', label: 'mongo', isApplication: true, applicationColor: '#8a6a53', parent: 'ns' },
        },
      ],
    });
    expect(cy.getElementById('cl').style('label')).toBe('Cluster: prod');
    expect(cy.getElementById('ns').style('label')).toBe('Namespace: shop');
    expect(cy.getElementById('app').style('label')).toBe('Release Unit: mongo');
    expect(cy.getElementById('cl').data('label')).toBe('prod');
    expect(cy.getElementById('ns').data('label')).toBe('shop');
    expect(cy.getElementById('app').data('label')).toBe('mongo');
    cy.destroy();
  });

  it('aligns the physical-network fabric box header: title-cased render-only label + enlarged semibold font', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const selectors = sheet.map((s) => s.selector);
    const idx = selectors.indexOf("node[kind='network']");
    expect(idx).toBeGreaterThan(-1);
    // Declared after node:parent (so it wins the wrapper's label/size) and before the
    // selection ring.
    expect(idx).toBeGreaterThan(selectors.indexOf('node:parent'));
    expect(idx).toBeLessThan(selectors.indexOf('node:selected'));
    const style = sheet[idx]?.style ?? {};
    expect(style['font-size']).toBe(17);
    expect(style['font-weight']).toBe(600);
    // Render-only label mapper title-cases each word; it NEVER rewrites data.label.
    const labelFn = style.label as NodeFn;
    expect(labelFn(fakeEle({ label: 'physical network' }))).toBe('Physical Network');
    expect(labelFn(fakeEle({ label: 'core-fabric' }))).toBe('Core-fabric');
  });

  it('aligns the k8s node box header ONLY when compound: "Node: " render-only prefix + enlarged semibold font, gated on :parent (+ collapsed sibling)', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const selectors = sheet.map((s) => s.selector);
    const parentIdx = selectors.indexOf("node[kind='node']:parent");
    const collapsedIdx = selectors.indexOf("node[kind='node'].cy-expand-collapse-collapsed-node");
    // A bare `node[kind='node']` selector MUST NOT exist — a leaf k8s node keeps the
    // normal title; only a compound (or a folded compound) is styled.
    expect(selectors).not.toContain("node[kind='node']");
    expect(parentIdx).toBeGreaterThan(-1);
    expect(collapsedIdx).toBeGreaterThan(-1);
    // After node:parent (wins the compound header in node-layout), before selection ring.
    expect(parentIdx).toBeGreaterThan(selectors.indexOf('node:parent'));
    expect(parentIdx).toBeLessThan(selectors.indexOf('node:selected'));
    for (const idx of [parentIdx, collapsedIdx]) {
      const style = sheet[idx]?.style ?? {};
      expect(style['font-size']).toBe(18);
      expect(style['font-weight']).toBe(600);
      // Render-only "Node: " prefix — data.label stays the bare name the dashboard `name=`
      // query and detail-panel title depend on.
      const labelFn = style.label as NodeFn;
      expect(labelFn(fakeEle({ label: 'worker-0' }))).toBe('Node: worker-0');
    }
  });

  it('renders "Node: <name>" enlarged for a COMPOUND k8s node but the bare normal title for a LEAF k8s node', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: DARK_TOKENS }) as cytoscape.StylesheetStyle[],
      elements: [
        // Compound k8s node (node-layout): wraps a pod → is a :parent.
        { group: 'nodes', data: { id: 'node/worker-0', label: 'worker-0', kind: 'node' } },
        { group: 'nodes', data: { id: 'p1', label: 'web', kind: 'pod', parent: 'node/worker-0' } },
        // Leaf k8s node (controller-layout): no children.
        { group: 'nodes', data: { id: 'node/worker-9', label: 'worker-9', kind: 'node' } },
      ],
    });
    const compound = cy.getElementById('node/worker-0');
    const leaf = cy.getElementById('node/worker-9');
    // Compound → aligned header.
    expect(compound.style('label')).toBe('Node: worker-0');
    expect(compound.style('font-size')).toBe('18px');
    // Leaf → normal node title (bare label, base 11px font), identity value intact both ways.
    expect(leaf.style('label')).toBe('worker-9');
    expect(leaf.style('font-size')).toBe('11px');
    expect(compound.data('label')).toBe('worker-0');
    expect(leaf.data('label')).toBe('worker-9');
    // Fold the compound → children removed, no longer :parent, but the .collapsed sibling
    // keeps the aligned header (it was a compound).
    compound.addClass('cy-expand-collapse-collapsed-node');
    expect(compound.style('label')).toBe('Node: worker-0');
    expect(compound.style('font-size')).toBe('18px');
    cy.destroy();
  });

  it('keeps namespace / application accents in both expanded and collapsed states (no :parent dependency)', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: DARK_TOKENS }) as cytoscape.StylesheetStyle[],
      elements: [
        { group: 'nodes', data: { id: 'cluster/prod', label: 'prod', isCluster: true, clusterColor: '#14b8a6' } },
        {
          group: 'nodes',
          data: {
            id: 'nsbox',
            label: 'shop',
            isNamespace: true,
            namespace: 'shop',
            namespaceColor: '#e8833a',
            parent: 'cluster/prod',
          },
        },
        {
          group: 'nodes',
          data: {
            id: 'appbox',
            label: 'checkout',
            isApplication: true,
            application: 'checkout',
            applicationColor: '#0ea5e9',
            parent: 'nsbox',
          },
        },
        { group: 'nodes', data: { id: 'p1', label: 'web', kind: 'pod', parent: 'appbox' } },
      ],
    });
    const nsbox = cy.getElementById('nsbox');
    const appbox = cy.getElementById('appbox');
    // Expanded → each box borders by its own accent (direct flag-selector hit, no icon).
    const nsBorderExpanded = nsbox.style('border-color') as string;
    const appBorderExpanded = appbox.style('border-color') as string;
    expect(appbox.style('background-image')).toBe('none');
    expect(nsBorderExpanded).not.toBe(appBorderExpanded); // distinct accents
    nsbox.addClass('cy-expand-collapse-collapsed-node');
    appbox.addClass('cy-expand-collapse-collapsed-node');
    // Collapsed → STILL their own accents (the selectors do not depend on :parent).
    expect(nsbox.style('border-color')).toBe(nsBorderExpanded);
    expect(appbox.style('border-color')).toBe(appBorderExpanded);
    cy.destroy();
  });

  it('paints a folder icon on a COLLAPSED decorative group (tinted by accent); expanded shows none; kind-ful compounds keep their kind icon', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: DARK_TOKENS }) as cytoscape.StylesheetStyle[],
      elements: [
        { group: 'nodes', data: { id: 'cluster/prod', label: 'prod', isCluster: true, clusterColor: '#14b8a6' } },
        {
          group: 'nodes',
          data: { id: 'nsbox', label: 'shop', isNamespace: true, namespaceColor: '#e8833a', parent: 'cluster/prod' },
        },
        {
          group: 'nodes',
          data: { id: 'appbox', label: 'checkout', isApplication: true, applicationColor: '#0ea5e9', parent: 'nsbox' },
        },
        {
          group: 'nodes',
          data: { id: 'ctrl', label: 'mongo', kind: 'statefulset', isController: true, parent: 'appbox' },
        },
        { group: 'nodes', data: { id: 'p1', label: 'web', kind: 'pod', parent: 'ctrl' } },
      ],
    });
    const cluster = cy.getElementById('cluster/prod');
    const nsbox = cy.getElementById('nsbox');
    const appbox = cy.getElementById('appbox');
    const ctrl = cy.getElementById('ctrl');
    // Expanded decorative groups carry no centre icon.
    expect(nsbox.style('background-image')).toBe('none');
    expect(appbox.style('background-image')).toBe('none');
    // Collapse them → folder glyph tinted by each group's accent.
    [cluster, nsbox, appbox, ctrl].forEach((n) => n.addClass('cy-expand-collapse-collapsed-node'));
    expect(cluster.style('background-image')).toBe(tintSvgToDataUri(FOLDER_ICON_SVG, '#14b8a6'));
    expect(nsbox.style('background-image')).toBe(tintSvgToDataUri(FOLDER_ICON_SVG, '#e8833a'));
    expect(appbox.style('background-image')).toBe(tintSvgToDataUri(FOLDER_ICON_SVG, '#0ea5e9'));
    // Gap-fill: the folder rule targets isCluster/isNamespace/isApplication ONLY, so it
    // never leaks onto a kind-ful compound (controller / node / netapp-node) — those
    // revert to their kind icon on real collapse (children removed → loses :parent).
    expect(ctrl.style('background-image')).not.toBe(tintSvgToDataUri(FOLDER_ICON_SVG, '#14b8a6'));
    cy.destroy();
  });

  it('aligns the synthesized node-group header: title-cased render-only label + enlarged semibold font', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const selectors = sheet.map((s) => s.selector);
    const idx = selectors.indexOf('node[?isNodeGroup]');
    expect(idx).toBeGreaterThan(-1);
    // After node:parent (so the header wins), before the selection ring.
    expect(idx).toBeGreaterThan(selectors.indexOf('node:parent'));
    expect(idx).toBeLessThan(selectors.indexOf('node:selected'));
    const style = sheet[idx]?.style ?? {};
    expect(style['font-size']).toBe(17);
    expect(style['font-weight']).toBe(600);
    // The group deliberately declares no colour of its own — node:parent's cluster-accent
    // tint is what it wants, and overriding it here would break the "one family" reading.
    expect(style).not.toHaveProperty('background-color');
    expect(style).not.toHaveProperty('color');
    // Render-only label mapper; data.label stays the bare `nodes`.
    const labelFn = style.label as NodeFn;
    expect(labelFn(fakeEle({ label: 'nodes' }))).toBe('Nodes');
  });

  it('tints the node group and its collapsed folder glyph with the enclosing cluster accent', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: DARK_TOKENS }) as cytoscape.StylesheetStyle[],
      elements: [
        { group: 'nodes', data: { id: 'cluster/prod', label: 'prod', isCluster: true, clusterColor: '#14b8a6' } },
        {
          group: 'nodes',
          data: { id: 'node-group/cluster/prod', label: 'nodes', isNodeGroup: true, parent: 'cluster/prod' },
        },
        {
          group: 'nodes',
          data: { id: 'node/worker-0', label: 'worker-0', kind: 'node', parent: 'node-group/cluster/prod' },
        },
      ],
    });
    const groupBox = cy.getElementById('node-group/cluster/prod');
    // Expanded: a labelled backplate in the cluster's accent, no centre icon.
    expect(groupBox.style('background-image')).toBe('none');
    expect(groupBox.style('background-color')).toBe('rgb(20,184,166)');
    expect(groupBox.style('label')).toBe('Nodes');
    // Collapsed: the same folder glyph the other kind-less groups get, same accent —
    // never the fallback kind glyph a kind-less leaf would fall through to.
    groupBox.addClass('cy-expand-collapse-collapsed-node');
    expect(groupBox.style('background-image')).toBe(tintSvgToDataUri(FOLDER_ICON_SVG, '#14b8a6'));
    cy.destroy();
  });

  it('dims faded edges further than faded nodes (one class, both fade reasons)', () => {
    const sheet = getStylesheet({ theme: DARK_TOKENS }) as unknown as Array<{
      selector: string;
      style?: StyleRecord;
    }>;
    const nodeRule = sheet.find((s) => s.selector === `node.${FADED_CLASS}`);
    const edgeRule = sheet.find((s) => s.selector === `edge.${FADED_CLASS}`);
    expect(nodeRule?.style?.opacity).toBe(0.2);
    expect(edgeRule?.style?.opacity).toBe(0.12);
  });
});

describe('storage usage fill', () => {
  // Triggered by `data.usageRatio`, NOT kind — pvc and netapp-aggr share the mapper,
  // and a future usage-bearing kind joins for free. The liquid lives in the SVG, not
  // a node-box gradient (that occluded cylinder strokes).
  const build = (nodes: cytoscape.NodeDataDefinition[]): cytoscape.Core =>
    cytoscape({
      headless: true,
      styleEnabled: true,
      style: getStylesheet({ theme: DARK_TOKENS }) as cytoscape.StylesheetStyle[],
      elements: nodes.map((data) => ({ group: 'nodes' as const, data })),
    });

  const decodedIcon = (cy: cytoscape.Core, id: string): string => {
    const uri = String(cy.getElementById(id).style('background-image'));
    return decodeURIComponent(uri.replace(/^data:image\/svg\+xml,/, ''));
  };

  it('does not paint usage as a node-box gradient', () => {
    const cy = build([
      { id: 'pvc-1', label: 'pvc-1', kind: 'pvc', usageRatio: 0.7 },
      { id: 'aggr-1', label: 'aggr-1', kind: 'netapp-aggr', usageRatio: 0.5 },
    ]);
    expect(cy.getElementById('pvc-1').style('background-fill')).toBe('solid');
    expect(cy.getElementById('aggr-1').style('background-fill')).toBe('solid');
    expect(styleFor('node[usageRatio]')).toEqual({});
    cy.destroy();
  });

  it('paints a translucent cylinder liquid into both kinds from the same mapper', () => {
    const cy = build([
      { id: 'pvc-1', label: 'pvc-1', kind: 'pvc', usageRatio: 0.7 },
      { id: 'aggr-1', label: 'aggr-1', kind: 'netapp-aggr', usageRatio: 0.5 },
    ]);
    const pvc = decodedIcon(cy, 'pvc-1');
    const aggr = decodedIcon(cy, 'aggr-1');
    expect(pvc).toContain(usageFillPaint(0.7));
    expect(aggr).toContain(usageFillPaint(0.5));
    expect(aggr).toContain('M5 9.8');
    expect(aggr).toContain('M5 14.1');
    cy.destroy();
  });

  it('leaves a node without a ratio unfilled — absent data is not a 0% reading', () => {
    const cy = build([{ id: 'pvc-2', label: 'pvc-2', kind: 'pvc' }]);
    expect(cy.getElementById('pvc-2').style('background-fill')).toBe('solid');
    expect(decodedIcon(cy, 'pvc-2')).not.toContain('rgba(');
    cy.destroy();
  });

  it('uses STATUS_COLOR thresholds: green / yellow / red', () => {
    const cy = build([
      { id: 'g', label: 'g', kind: 'pvc', usageRatio: 0.7 },
      { id: 'y', label: 'y', kind: 'pvc', usageRatio: 0.8 },
      { id: 'r', label: 'r', kind: 'pvc', usageRatio: 0.9 },
      { id: 'just-green', label: 'just-green', kind: 'pvc', usageRatio: 0.79 },
    ]);
    expect(decodedIcon(cy, 'g')).toContain(usageFillPaint(0.7));
    expect(decodedIcon(cy, 'y')).toContain(usageFillPaint(0.8));
    expect(decodedIcon(cy, 'r')).toContain(usageFillPaint(0.9));
    expect(decodedIcon(cy, 'just-green')).toContain(usageFillPaint(0.79));
    expect(decodedIcon(cy, 'just-green')).not.toContain(usageFillPaint(0.8));
    cy.destroy();
  });

  it('keeps liquid colour theme-independent while strokes follow the theme', () => {
    const svgFor = (mode: 'light' | 'dark'): string => {
      const cy = cytoscape({
        headless: true,
        styleEnabled: true,
        style: getStylesheet({ theme: mode === 'light' ? LIGHT_TOKENS : DARK_TOKENS }) as cytoscape.StylesheetStyle[],
        elements: [{ group: 'nodes', data: { id: 'a', label: 'a', kind: 'pvc', usageRatio: 0.7 } }],
      });
      const svg = decodedIcon(cy, 'a');
      cy.destroy();
      return svg;
    };
    const light = svgFor('light');
    const dark = svgFor('dark');
    expect(light).toContain(usageFillPaint(0.7));
    expect(dark).toContain(usageFillPaint(0.7));
    expect(light).not.toBe(dark);
  });

  it('keeps the kind icon at NODE_SIZE with an unchanged label', () => {
    const cy = build([{ id: 'aggr-3', label: 'aggr-3', kind: 'netapp-aggr', usageRatio: 0.7 }]);
    expect(String(cy.getElementById('aggr-3').style('background-image'))).toMatch(/^data:image\/svg\+xml,/);
    expect(cy.getElementById('aggr-3').style('width')).toBe('40px');
    expect(cy.getElementById('aggr-3').style('height')).toBe('40px');
    expect(styleFor('node').label).toBe('data(label)');
    cy.destroy();
  });
});
