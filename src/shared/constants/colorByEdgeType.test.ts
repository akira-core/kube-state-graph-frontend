import {
  EDGE_STYLE_BY_TYPE,
  EDGE_ENDPOINTS_BY_TYPE,
  EDGE_IS_TRAFFIC_BY_TYPE,
  NETWORK_HOP_DASH_PATTERN,
  NETWORK_HOP_LEGEND_DASH_PATTERN,
  isTrafficEdgeType,
} from './colorByEdgeType';
import { STATUS_COLOR } from './colorByStatus';

describe('colorByEdgeType', () => {
  it('keeps every edge colour clear of the reserved status colours (edge colour ≠ status colour)', () => {
    const statusColors = new Set(Object.values(STATUS_COLOR).map((c) => c.toLowerCase()));
    for (const [type, style] of Object.entries(EDGE_STYLE_BY_TYPE)) {
      expect(`${type}:${statusColors.has(style.color.toLowerCase())}`).toBe(`${type}:false`);
    }
  });

  it('gives the service edge pair a single non-green colour (no clash with status-normal green)', () => {
    expect(EDGE_STYLE_BY_TYPE['service-selects-pod'].color).toBe(EDGE_STYLE_BY_TYPE['pod-calls-service'].color);
    expect(EDGE_STYLE_BY_TYPE['service-selects-pod'].color.toLowerCase()).not.toBe(STATUS_COLOR.normal.toLowerCase());
  });

  it('defines a style + endpoints for pod-to-node (blue pod→node)', () => {
    expect(EDGE_STYLE_BY_TYPE['pod-to-node'].color).toBe('#3b82f6');
    expect(EDGE_ENDPOINTS_BY_TYPE['pod-to-node']).toEqual({ from: 'pod', to: 'node' });
  });

  it('defines a style + endpoints for pvc-to-netapp-aggr (violet pvc→netapp-aggr)', () => {
    expect(EDGE_STYLE_BY_TYPE['pvc-to-netapp-aggr'].color).toBe('#8b5cf6');
    expect(EDGE_ENDPOINTS_BY_TYPE['pvc-to-netapp-aggr']).toEqual({ from: 'pvc', to: 'netapp-aggr' });
  });

  it('keeps the two storage edges distinguishable (pvc-to-netapp-aggr ≠ pod-mounts-pvc)', () => {
    expect(EDGE_STYLE_BY_TYPE['pvc-to-netapp-aggr'].color.toLowerCase()).not.toBe(
      EDGE_STYLE_BY_TYPE['pod-mounts-pvc'].color.toLowerCase()
    );
  });

  it('no longer carries the retired storageclass edge type', () => {
    expect('pvc-to-storageclass' in EDGE_STYLE_BY_TYPE).toBe(false);
    expect('pvc-to-storageclass' in EDGE_ENDPOINTS_BY_TYPE).toBe(false);
  });

  it('no longer carries the retired panel-synthetic edge types', () => {
    expect('pod-runs-on-node' in EDGE_STYLE_BY_TYPE).toBe(false);
    expect('controller-owns-pod' in EDGE_STYLE_BY_TYPE).toBe(false);
  });

  it('renders node-to-switch identically to switch-to-switch (shared infra colour + taxi routing)', () => {
    expect(EDGE_STYLE_BY_TYPE['node-to-switch'].color).toBe(EDGE_STYLE_BY_TYPE['switch-to-switch'].color);
    expect(EDGE_STYLE_BY_TYPE['node-to-switch'].lineStyle).toBe('solid');
    expect(EDGE_STYLE_BY_TYPE['node-to-switch'].routing).toBe('taxi');
    expect(EDGE_STYLE_BY_TYPE['switch-to-switch'].routing).toBe('taxi');
  });

  it('routes every non-fabric edge type as bezier', () => {
    for (const [type, style] of Object.entries(EDGE_STYLE_BY_TYPE)) {
      if (type !== 'switch-to-switch' && type !== 'node-to-switch') {
        expect(`${type}:${style.routing}`).toBe(`${type}:bezier`);
      }
    }
  });

  it('classifies only the request-carrying edge types as traffic', () => {
    const traffic = Object.entries(EDGE_IS_TRAFFIC_BY_TYPE)
      .filter(([, isTraffic]) => isTraffic)
      .map(([type]) => type)
      .sort();
    expect(traffic).toEqual(['pod-calls-pod', 'pod-calls-service', 'service-selects-pod']);
  });

  it('covers every styled edge type in the traffic map (no silent default for a new type)', () => {
    expect(Object.keys(EDGE_IS_TRAFFIC_BY_TYPE).sort()).toEqual(Object.keys(EDGE_STYLE_BY_TYPE).sort());
  });

  it('reports an unmapped or missing edge type as non-traffic', () => {
    expect(isTrafficEdgeType('pod-calls-service')).toBe(true);
    expect(isTrafficEdgeType('pod-mounts-pvc')).toBe(false);
    expect(isTrafficEdgeType('pod-calls-configmap')).toBe(false);
    expect(isTrafficEdgeType(undefined)).toBe(false);
  });

  it('reports Object.prototype-named edge types as non-traffic (own-property lookup only)', () => {
    // `data.type` is untrusted backend input copied verbatim by normalize. A bare map
    // index would resolve these to INHERITED prototype members — truthy, never undefined —
    // so the `?? false` unknown-is-not-traffic guarantee would not hold and the edge would
    // be dashed as gateway traffic.
    for (const inherited of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(isTrafficEdgeType(inherited)).toBe(false);
    }
  });

  it('gives the network-hop dash a two-part rhythm cytoscape can consume', () => {
    expect(NETWORK_HOP_DASH_PATTERN).toHaveLength(2);
  });

  it('scales the legend rhythm to several dashes inside the 14-unit bidirectional glyph', () => {
    expect(NETWORK_HOP_LEGEND_DASH_PATTERN).toHaveLength(2);
    const [dash, gap] = NETWORK_HOP_LEGEND_DASH_PATTERN;
    // The network-hop row's line runs x=8 to x=22. Three or more full cycles must fit, or
    // the key degenerates towards the single-dash stub this constant exists to fix — which
    // is exactly what the canvas rhythm does here.
    expect(Math.floor(14 / (dash + gap))).toBeGreaterThanOrEqual(3);
    expect(Math.floor(14 / (NETWORK_HOP_DASH_PATTERN[0] + NETWORK_HOP_DASH_PATTERN[1]))).toBeLessThan(3);
    // Dash and gap stay comparable, so the marks read as dashes rather than as the round
    // dots the `dotted` line style renders.
    expect(dash).toBeGreaterThanOrEqual(gap);
  });

  it('includes the backend edges + switch fabric edges as known wire types', () => {
    expect('pod-to-node' in EDGE_STYLE_BY_TYPE).toBe(true);
    expect('pvc-to-netapp-aggr' in EDGE_STYLE_BY_TYPE).toBe(true);
    expect('switch-to-switch' in EDGE_STYLE_BY_TYPE).toBe(true);
    expect('node-to-switch' in EDGE_STYLE_BY_TYPE).toBe(true);
  });
});
