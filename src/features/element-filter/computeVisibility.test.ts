import type cytoscape from 'cytoscape';

import { collectEdgeBearingNodeIds, computeVisibility, isFilterableKind } from './computeVisibility';

const node = (id: string, kind: string, extra: Record<string, unknown> = {}): cytoscape.ElementDefinition =>
  ({ group: 'nodes', data: { id, kind, ...extra } }) as unknown as cytoscape.ElementDefinition;
const cluster = (id: string): cytoscape.ElementDefinition =>
  ({ group: 'nodes', data: { id, isCluster: true } }) as unknown as cytoscape.ElementDefinition;
const nodeGroup = (id: string, parent?: string): cytoscape.ElementDefinition =>
  ({
    group: 'nodes',
    data: { id, isNodeGroup: true, label: 'nodes', ...(parent !== undefined ? { parent } : {}) },
  }) as unknown as cytoscape.ElementDefinition;
const edge = (id: string, source: string, target: string, edgeType: string): cytoscape.ElementDefinition =>
  ({ group: 'edges', data: { id, source, target, edgeType } }) as unknown as cytoscape.ElementDefinition;

describe('isFilterableKind', () => {
  it('accepts known resource kinds', () => {
    expect(isFilterableKind('pod')).toBe(true);
    expect(isFilterableKind('netapp-aggr')).toBe(true);
    expect(isFilterableKind('netapp-node')).toBe(true);
  });

  it('rejects the network wrapper and unknown kinds (never kind-filtered)', () => {
    expect(isFilterableKind('network')).toBe(false);
    expect(isFilterableKind('crd-from-the-future')).toBe(false);
  });
});

describe('computeVisibility', () => {
  it('marks everything visible when all kinds + edgeTypes are enabled', () => {
    const elements = [node('a', 'pod'), node('b', 'service'), edge('e', 'a', 'b', 'service-selects-pod')];
    const { visibleNodeIds, visibleEdgeIds } = computeVisibility(elements, ['pod', 'service'], ['service-selects-pod']);
    expect([...visibleNodeIds]).toEqual(['a', 'b']);
    expect([...visibleEdgeIds]).toEqual(['e']);
  });

  it('hides nodes whose kind is filtered out', () => {
    // Survivors stay connected so the assertion isolates kind filtering, not orphan cascade.
    const elements = [node('a', 'pod'), node('b', 'pod'), node('s', 'service'), edge('e', 'a', 'b', 'pod-calls-pod')];
    const { visibleNodeIds } = computeVisibility(elements, ['pod'], ['pod-calls-pod']);
    expect([...visibleNodeIds]).toEqual(['a', 'b']);
  });

  it('never kind-filters the network fabric wrapper (stale saved visibleKinds)', () => {
    // visibleKinds saved before the `network` kind existed: the wrapper must stay
    // visible, or every switch nested inside it disappears with it.
    const elements = [
      node('net', 'network'),
      node('sw1', 'switch', { parent: 'net' }),
      node('sw2', 'switch', { parent: 'net' }),
      edge('e', 'sw1', 'sw2', 'switch-to-switch'),
    ];
    const { visibleNodeIds } = computeVisibility(elements, ['switch'], ['switch-to-switch']);
    expect([...visibleNodeIds].sort()).toEqual(['net', 'sw1', 'sw2']);
  });

  it('orphan-cascades the network wrapper away when its switches are filtered out', () => {
    const elements = [
      node('net', 'network'),
      node('sw1', 'switch', { parent: 'net' }),
      node('p', 'pod', {}),
      node('p2', 'pod', {}),
      edge('e', 'p', 'p2', 'pod-calls-pod'),
    ];
    const { visibleNodeIds } = computeVisibility(elements, ['pod'], ['pod-calls-pod']);
    expect(visibleNodeIds.has('net')).toBe(false);
    expect(visibleNodeIds.has('sw1')).toBe(false);
  });

  it('never kind-filters the synthesized node group, and keeps its nodes reachable', () => {
    // The group is kind-less, so no visibleKinds list — however stale — can hide it.
    // Hiding it would hide every K8s node inside it (visibility is the AND over ancestors).
    const elements = [
      cluster('cl'),
      nodeGroup('ng', 'cl'),
      node('n1', 'node', { parent: 'ng' }),
      node('p', 'pod', { parent: 'n1' }),
      edge('e', 'p', 'n1', 'pod-to-node'),
    ];
    const { visibleNodeIds } = computeVisibility(elements, ['node', 'pod'], ['pod-to-node']);
    expect(visibleNodeIds.has('ng')).toBe(true);
    expect(visibleNodeIds.has('n1')).toBe(true);
  });

  it('orphan-cascades the node group away when its nodes are filtered out', () => {
    const elements = [
      cluster('cl'),
      nodeGroup('ng', 'cl'),
      node('n1', 'node', { parent: 'ng' }),
      node('p', 'pod', { parent: 'cl' }),
      node('p2', 'pod', { parent: 'cl' }),
      edge('e', 'p', 'p2', 'pod-calls-pod'),
    ];
    // `node` hidden → the group has no visible child and no visible incident edge.
    const { visibleNodeIds } = computeVisibility(elements, ['pod'], ['pod-calls-pod']);
    expect(visibleNodeIds.has('n1')).toBe(false);
    expect(visibleNodeIds.has('ng')).toBe(false);
    // The cluster survives on its still-visible pods.
    expect(visibleNodeIds.has('cl')).toBe(true);
  });

  it('hides edges whose edgeType is filtered out', () => {
    const elements = [node('a', 'pod'), node('b', 'service'), edge('e', 'a', 'b', 'service-selects-pod')];
    const { visibleEdgeIds } = computeVisibility(elements, ['pod', 'service'], []);
    expect([...visibleEdgeIds]).toEqual([]);
  });

  it('auto-hides edges when an endpoint becomes hidden', () => {
    const elements = [node('a', 'pod'), node('b', 'service'), edge('e', 'a', 'b', 'service-selects-pod')];
    const { visibleEdgeIds } = computeVisibility(elements, ['pod'], ['service-selects-pod']);
    expect([...visibleEdgeIds]).toEqual([]);
  });

  it('returns empty sets for empty elements', () => {
    const { visibleNodeIds, visibleEdgeIds } = computeVisibility([], ['pod'], ['service-selects-pod']);
    expect(visibleNodeIds.size).toBe(0);
    expect(visibleEdgeIds.size).toBe(0);
  });

  it('keeps unknown kinds visible by default when connected', () => {
    // Unknown kind is not subject to kind filtering (forward-compat); it stays because it has a visible edge.
    const elements = [node('cr', 'CustomResource'), node('b', 'pod'), edge('e', 'cr', 'b', 'pod-calls-pod')];
    const { visibleNodeIds } = computeVisibility(elements, ['pod'], ['pod-calls-pod']);
    expect([...visibleNodeIds]).toEqual(['cr', 'b']);
  });

  it('keeps unknown edge TYPES visible by default (forward-compat, mirrors unknown kinds)', () => {
    // A backend-added edge type is outside the filter universe (the MultiSelect
    // only lists known types) — it must render in fallback style, not vanish, and
    // its endpoints must not be orphan-cascaded away.
    const elements = [node('a', 'pod'), node('b', 'pod'), edge('e', 'a', 'b', 'pod-uses-configmap')];
    const { visibleNodeIds, visibleEdgeIds } = computeVisibility(elements, ['pod'], ['pod-calls-pod']);
    expect([...visibleEdgeIds]).toEqual(['e']);
    expect([...visibleNodeIds]).toEqual(['a', 'b']);
  });

  describe('orphan cascade-hide', () => {
    it('keeps a leaf that loses its only edge to edge-type filtering', () => {
      const elements = [
        node('a', 'pod'),
        node('b', 'pod'),
        node('v', 'pvc'),
        edge('e1', 'a', 'b', 'pod-calls-pod'),
        edge('e2', 'a', 'v', 'pod-mounts-pvc'),
      ];
      // Hide pod-mounts-pvc only. v now has no visible edge, but it HAS one in the
      // baseline — the user hid a connection, not the resource — so it stays.
      const { visibleNodeIds, visibleEdgeIds } = computeVisibility(elements, ['pod', 'pvc'], ['pod-calls-pod']);
      expect([...visibleNodeIds]).toEqual(['a', 'b', 'v']);
      expect([...visibleEdgeIds]).toEqual(['e1']);
    });

    it('separates a UI-hidden edge from a node the backend never connected', () => {
      const elements = [node('a', 'pod'), node('b', 'pod'), node('iso', 'pod'), edge('e1', 'a', 'b', 'pod-calls-pod')];
      // Every edge type hidden: a and b have no visible edge either, yet they differ from
      // iso — the baseline connects them and never connected iso.
      const { visibleNodeIds, visibleEdgeIds } = computeVisibility(elements, ['pod'], []);
      expect([...visibleNodeIds]).toEqual(['a', 'b']);
      expect([...visibleEdgeIds]).toEqual([]);
    });

    it('keeps a leaf whose only baseline edge was dropped by a view transform', () => {
      // What `node` mode does: pod-to-node becomes nesting and the edge leaves `elements`.
      const baseline = [
        cluster('cl'),
        node('n', 'node', { parent: 'cl' }),
        node('p', 'pod'),
        edge('e', 'p', 'n', 'pod-to-node'),
      ];
      const transformed = [cluster('cl'), node('n', 'node', { parent: 'cl' }), node('p', 'pod', { parent: 'n' })];
      const baselineEdgeNodeIds = collectEdgeBearingNodeIds(baseline);
      const { visibleNodeIds } = computeVisibility(
        transformed,
        ['pod', 'node'],
        [],
        true,
        undefined,
        baselineEdgeNodeIds
      );
      expect(visibleNodeIds.has('p')).toBe(true);
      expect(visibleNodeIds.has('n')).toBe(true);
      expect(visibleNodeIds.has('cl')).toBe(true);
    });

    it('hides a standalone node with no edges and no children', () => {
      const elements = [node('a', 'pod')];
      const { visibleNodeIds } = computeVisibility(elements, ['pod'], []);
      expect([...visibleNodeIds]).toEqual([]);
    });

    it('keeps a container visible while it has a visible child', () => {
      // n is a compound parent with no incident edge; it stays because child p1 stays (p1 has a visible edge).
      const elements = [
        cluster('cl'),
        node('n', 'node', { parent: 'cl' }),
        node('p1', 'pod', { parent: 'n' }),
        node('ext', 'external', { parent: 'cl' }),
        edge('e', 'p1', 'ext', 'pod-calls-pod'),
      ];
      const { visibleNodeIds } = computeVisibility(elements, ['pod', 'node', 'external'], ['pod-calls-pod']);
      expect(visibleNodeIds.has('n')).toBe(true);
      expect(visibleNodeIds.has('cl')).toBe(true);
      expect(visibleNodeIds.has('p1')).toBe(true);
    });

    it('cascades a controller box away when the pod kind is filtered out (legend eye on pod, controller mode)', () => {
      // D6: the pod nests under its controller via parent (no owns-edge). Filtering the
      // pod kind out leaves the controller with no visible child and no incident edge,
      // so it follows its pods out via the orphan cascade (D11 interplay scenario).
      const elements = [
        cluster('cl'),
        node('ctrl', 'deployment', { parent: 'cl', isController: true }),
        node('p1', 'pod', { parent: 'ctrl' }),
      ];
      const { visibleNodeIds } = computeVisibility(elements, ['deployment', 'node'], []);
      expect([...visibleNodeIds]).toEqual([]);
    });

    it('recursively hides an emptied node container and its cluster', () => {
      const elements = [
        cluster('cl'),
        node('n', 'node', { parent: 'cl' }),
        node('p1', 'pod', { parent: 'n' }),
        node('p2', 'pod', { parent: 'n' }),
        edge('e', 'p1', 'p2', 'pod-calls-pod'),
      ];
      // Containers empty out through the KIND filter now, not through the cascade:
      // hide `pod` -> n has no visible child and no visible edge -> n goes -> cl goes.
      const { visibleNodeIds } = computeVisibility(elements, ['node'], ['pod-calls-pod']);
      expect([...visibleNodeIds]).toEqual([]);
    });

    it('does not mistake a container whose children are all filtered for a leaf', () => {
      const elements = [
        node('n', 'node'),
        node('p', 'pod', { parent: 'n' }),
        node('other', 'pod'),
        edge('e', 'p', 'other', 'pod-calls-pod'),
      ];
      // n carries a baseline edge on none of its own account and has children in
      // `elements`; with `pod` hidden it has no visible child left, so it is removed as a
      // container. Reading it as a leaf would strand an empty box.
      const { visibleNodeIds } = computeVisibility(elements, ['node'], ['pod-calls-pod']);
      expect(visibleNodeIds.has('n')).toBe(false);
    });

    it('hides every edge type without emptying the canvas', () => {
      const elements = [
        cluster('cl'),
        node('n', 'node', { parent: 'cl' }),
        node('p1', 'pod', { parent: 'n' }),
        node('p2', 'pod', { parent: 'n' }),
        edge('e', 'p1', 'p2', 'pod-calls-pod'),
      ];
      const { visibleNodeIds, visibleEdgeIds } = computeVisibility(elements, ['pod', 'node'], []);
      expect([...visibleNodeIds].sort()).toEqual(['cl', 'n', 'p1', 'p2']);
      expect([...visibleEdgeIds]).toEqual([]);
    });

    it('keeps a cluster visible when at least one descendant stays', () => {
      const elements = [
        cluster('cl'),
        node('n', 'node', { parent: 'cl' }),
        node('p1', 'pod', { parent: 'n' }),
        node('p2', 'pod', { parent: 'n' }),
        node('v', 'pvc', { parent: 'cl' }),
        edge('e', 'p1', 'v', 'pod-mounts-pvc'),
      ];
      // p1 & v stay (connected); p2 orphans; n stays (has p1); cl stays.
      const { visibleNodeIds } = computeVisibility(elements, ['pod', 'node', 'pvc'], ['pod-mounts-pvc']);
      expect(visibleNodeIds.has('cl')).toBe(true);
      expect(visibleNodeIds.has('n')).toBe(true);
      expect(visibleNodeIds.has('p1')).toBe(true);
      expect(visibleNodeIds.has('v')).toBe(true);
      expect(visibleNodeIds.has('p2')).toBe(false);
    });
  });

  describe('ingress gateway toggle', () => {
    const INGRESS_LABELS = { labels: { role: 'ingress-gateway' } };
    const ALL_KINDS = ['pod', 'service', 'node'] as const;
    const ALL_EDGES = ['pod-calls-service', 'service-selects-pod'] as const;

    // The double-path fixture from the spec: p reaches bsvc both THROUGH the
    // ingress gateway (p → igwSvc → igwPod → bsvc → bpod) and DIRECTLY (p → bsvc).
    const doublePath = () => [
      node('p', 'pod'),
      node('igwSvc', 'service', INGRESS_LABELS),
      node('igwPod', 'pod'),
      node('bsvc', 'service'),
      node('bpod', 'pod'),
      edge('e1', 'p', 'igwSvc', 'pod-calls-service'),
      edge('e2', 'igwSvc', 'igwPod', 'service-selects-pod'),
      edge('e3', 'igwPod', 'bsvc', 'pod-calls-service'),
      edge('e4', 'bsvc', 'bpod', 'service-selects-pod'),
      edge('e5', 'p', 'bsvc', 'pod-calls-service'),
    ];

    it('showIngress=false erases the ingress path entirely and keeps the direct path intact', () => {
      const { visibleNodeIds, visibleEdgeIds } = computeVisibility(doublePath(), [...ALL_KINDS], [...ALL_EDGES], false);
      expect([...visibleNodeIds].sort()).toEqual(['bpod', 'bsvc', 'p']);
      expect([...visibleEdgeIds].sort()).toEqual(['e4', 'e5']);
    });

    it('omitting the parameter changes nothing (back-compat default true)', () => {
      const { visibleNodeIds, visibleEdgeIds } = computeVisibility(doublePath(), [...ALL_KINDS], [...ALL_EDGES]);
      expect(visibleNodeIds.size).toBe(5);
      expect(visibleEdgeIds.size).toBe(5);
    });

    it('hides a labeled non-service node on its own (no service-selects-pod out-edge)', () => {
      const elements = [
        node('igw', 'pod', INGRESS_LABELS),
        node('a', 'pod'),
        node('b', 'pod'),
        edge('e1', 'igw', 'a', 'pod-calls-pod'),
        edge('e2', 'a', 'b', 'pod-calls-pod'),
      ];
      const { visibleNodeIds } = computeVisibility(elements, ['pod'], ['pod-calls-pod'], false);
      expect([...visibleNodeIds].sort()).toEqual(['a', 'b']);
    });

    it('hides the unlabeled pod a labeled service selects', () => {
      const elements = [
        node('igwSvc', 'service', INGRESS_LABELS),
        node('igwPod', 'pod'),
        node('a', 'pod'),
        node('b', 'pod'),
        edge('e1', 'igwSvc', 'igwPod', 'service-selects-pod'),
        edge('e2', 'igwPod', 'a', 'pod-calls-pod'),
        edge('e3', 'a', 'b', 'pod-calls-pod'),
      ];
      const { visibleNodeIds } = computeVisibility(elements, [...ALL_KINDS], [...ALL_EDGES, 'pod-calls-pod'], false);
      expect(visibleNodeIds.has('igwPod')).toBe(false);
      expect(visibleNodeIds.has('a')).toBe(true);
      expect(visibleNodeIds.has('b')).toBe(true);
    });

    it('leaves pods selected by an unlabeled service untouched', () => {
      const elements = [
        node('otherSvc', 'service'),
        node('somePod', 'pod'),
        edge('e1', 'otherSvc', 'somePod', 'service-selects-pod'),
      ];
      const { visibleNodeIds } = computeVisibility(elements, [...ALL_KINDS], [...ALL_EDGES], false);
      expect(visibleNodeIds.has('otherSvc')).toBe(true);
      expect(visibleNodeIds.has('somePod')).toBe(true);
    });

    it('keeps a pod visible when a non-ingress service also selects it (shared selector)', () => {
      const elements = [
        node('igwSvc', 'service', INGRESS_LABELS),
        node('appSvc', 'service'),
        node('sharedPod', 'pod'),
        edge('e1', 'igwSvc', 'sharedPod', 'service-selects-pod'),
        edge('e2', 'appSvc', 'sharedPod', 'service-selects-pod'),
      ];
      const { visibleNodeIds, visibleEdgeIds } = computeVisibility(elements, [...ALL_KINDS], [...ALL_EDGES], false);
      // Only the labeled service itself is hidden; the shared pod and its unrelated
      // service keep serving traffic and must stay visible.
      expect(visibleNodeIds.has('igwSvc')).toBe(false);
      expect(visibleNodeIds.has('sharedPod')).toBe(true);
      expect(visibleNodeIds.has('appSvc')).toBe(true);
      expect(visibleEdgeIds.has('e2')).toBe(true);
    });

    it('hides the descendants of a compound ingress-labeled node (label is not kind-restricted)', () => {
      const elements = [
        node('igwNode', 'node', INGRESS_LABELS),
        node('igwPod', 'pod', { parent: 'igwNode' }),
        node('a', 'pod'),
        node('b', 'pod'),
        edge('e1', 'igwPod', 'a', 'pod-calls-pod'),
        edge('e2', 'a', 'b', 'pod-calls-pod'),
      ];
      const { visibleNodeIds } = computeVisibility(elements, ['pod', 'node'], ['pod-calls-pod'], false);
      // The labeled K8s-node compound and its child pod are both hidden — not just the
      // compound itself — even though only 'igwNode' carries the label directly (the
      // child pod is reached via parent-nesting, not the service-selects-pod expansion).
      expect(visibleNodeIds.has('igwNode')).toBe(false);
      expect(visibleNodeIds.has('igwPod')).toBe(false);
      expect(visibleNodeIds.has('a')).toBe(true);
      expect(visibleNodeIds.has('b')).toBe(true);
    });

    it('uses a precomputed ingress set over self-computation (5th parameter)', () => {
      // The panel derives the set from the PRE-transform baseElements, because the view
      // transform can strip the very group the label sits on. Self-computing from the
      // elements passed here would find nothing — the precomputed set must win.
      const elements = [
        node('strandedPod', 'pod'), // label lives on a group absent from this view
        node('a', 'pod'),
        node('b', 'pod'),
        edge('e1', 'strandedPod', 'a', 'pod-calls-pod'),
        edge('e2', 'a', 'b', 'pod-calls-pod'),
      ];
      // Self-computed: no labels in `elements` at all → nothing hidden.
      expect(computeVisibility(elements, ['pod'], ['pod-calls-pod'], false).visibleNodeIds.has('strandedPod')).toBe(
        true
      );
      // Precomputed set supplied → honoured even though `elements` carries no label.
      const { visibleNodeIds } = computeVisibility(
        elements,
        ['pod'],
        ['pod-calls-pod'],
        false,
        new Set(['strandedPod'])
      );
      expect(visibleNodeIds.has('strandedPod')).toBe(false);
      expect(visibleNodeIds.has('a')).toBe(true);
      expect(visibleNodeIds.has('b')).toBe(true);
    });

    it('ignores a precomputed ingress set while showIngress is on', () => {
      const elements = [node('igw', 'pod', INGRESS_LABELS), node('a', 'pod'), edge('e1', 'igw', 'a', 'pod-calls-pod')];
      const { visibleNodeIds } = computeVisibility(elements, ['pod'], ['pod-calls-pod'], true, new Set(['igw']));
      expect(visibleNodeIds.has('igw')).toBe(true);
    });

    it('cascades an emptied cluster > node compound away with its ingress pod', () => {
      const elements = [
        cluster('cl'),
        node('n', 'node', { parent: 'cl' }),
        node('igwPod', 'pod', { parent: 'n', ...INGRESS_LABELS }),
        node('a', 'pod'),
        node('b', 'pod'),
        edge('e1', 'igwPod', 'a', 'pod-calls-pod'),
        edge('e2', 'a', 'b', 'pod-calls-pod'),
      ];
      const { visibleNodeIds } = computeVisibility(elements, ['pod', 'node'], ['pod-calls-pod'], false);
      expect(visibleNodeIds.has('igwPod')).toBe(false);
      expect(visibleNodeIds.has('n')).toBe(false);
      expect(visibleNodeIds.has('cl')).toBe(false);
      expect(visibleNodeIds.has('a')).toBe(true);
      expect(visibleNodeIds.has('b')).toBe(true);
    });
  });
});
