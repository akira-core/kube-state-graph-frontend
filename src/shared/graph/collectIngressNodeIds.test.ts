import type cytoscape from 'cytoscape';

import { collectIngressNodeIds } from './collectIngressNodeIds';

const INGRESS_LABELS = { labels: { role: 'ingress-gateway' } };

const node = (id: string, kind: string, extra: Record<string, unknown> = {}): cytoscape.ElementDefinition =>
  ({ group: 'nodes', data: { id, kind, ...extra } }) as unknown as cytoscape.ElementDefinition;
const edge = (id: string, source: string, target: string, edgeType: string): cytoscape.ElementDefinition =>
  ({ group: 'edges', data: { id, source, target, edgeType } }) as unknown as cytoscape.ElementDefinition;

describe('collectIngressNodeIds', () => {
  it('returns an empty set when no node carries the ingress label', () => {
    const elements = [node('svc', 'service'), node('pod', 'pod'), edge('e', 'svc', 'pod', 'service-selects-pod')];
    expect(collectIngressNodeIds(elements).size).toBe(0);
  });

  it('marks a labeled node of any kind', () => {
    const elements = [node('igw', 'pod', INGRESS_LABELS), node('a', 'pod')];
    expect([...collectIngressNodeIds(elements)]).toEqual(['igw']);
  });

  it('expands one level to the pods a labeled service selects', () => {
    const elements = [
      node('igwSvc', 'service', INGRESS_LABELS),
      node('igwPod', 'pod'),
      edge('e', 'igwSvc', 'igwPod', 'service-selects-pod'),
    ];
    expect([...collectIngressNodeIds(elements)].sort()).toEqual(['igwPod', 'igwSvc']);
  });

  it('does NOT transitively close: a pod added via expansion never seeds further expansion', () => {
    // igwSvc → igwPod (added), then igwPod → a via service-selects-pod must NOT pull in `a`.
    const elements = [
      node('igwSvc', 'service', INGRESS_LABELS),
      node('igwPod', 'pod'),
      node('a', 'pod'),
      edge('e1', 'igwSvc', 'igwPod', 'service-selects-pod'),
      edge('e2', 'igwPod', 'a', 'service-selects-pod'),
    ];
    expect([...collectIngressNodeIds(elements)].sort()).toEqual(['igwPod', 'igwSvc']);
  });

  it('leaves pods selected by an unlabeled service untouched', () => {
    const elements = [
      node('otherSvc', 'service'),
      node('somePod', 'pod'),
      edge('e', 'otherSvc', 'somePod', 'service-selects-pod'),
    ];
    expect(collectIngressNodeIds(elements).size).toBe(0);
  });

  it('only expands via service-selects-pod, not other edge types', () => {
    const elements = [
      node('igwSvc', 'service', INGRESS_LABELS),
      node('caller', 'pod'),
      edge('e', 'caller', 'igwSvc', 'pod-calls-service'),
    ];
    // The pod calling the ingress service is not itself an ingress node.
    expect([...collectIngressNodeIds(elements)]).toEqual(['igwSvc']);
  });

  it('excludes a pod also selected by a non-ingress-labeled service (still serves other traffic)', () => {
    const elements = [
      node('igwSvc', 'service', INGRESS_LABELS),
      node('appSvc', 'service'),
      node('sharedPod', 'pod'),
      edge('e1', 'igwSvc', 'sharedPod', 'service-selects-pod'),
      edge('e2', 'appSvc', 'sharedPod', 'service-selects-pod'),
    ];
    // 'sharedPod' is reachable via BOTH a labeled and an unlabeled service — hiding it
    // would silently remove a pod that has nothing to do with the gateway, so only the
    // labeled service itself is folded into the ingress set.
    expect([...collectIngressNodeIds(elements)]).toEqual(['igwSvc']);
  });

  it('keeps a DIRECTLY LABELLED pod even when a non-ingress service also selects it', () => {
    const elements = [
      node('appSvc', 'service'),
      node('labelledPod', 'pod', INGRESS_LABELS),
      edge('e1', 'appSvc', 'labelledPod', 'service-selects-pod'),
    ];
    // The shared-selector exemption applies only to INFERRED (expansion-derived)
    // membership. An explicit label is a declaration by the operator and stays
    // authoritative regardless of who else selects the pod.
    expect([...collectIngressNodeIds(elements)]).toEqual(['labelledPod']);
  });

  it('folds a labelled compound’s whole subtree in (label is not kind-restricted)', () => {
    const elements = [
      node('ctrl', 'controller', INGRESS_LABELS),
      node('igwPod', 'pod', { parent: 'ctrl' }),
      node('sidecar', 'pod', { parent: 'igwPod' }),
      node('other', 'pod'),
    ];
    // Transitive along the nesting chain: everything inside the labelled group is part
    // of the gateway it names. Unrelated nodes are untouched.
    expect([...collectIngressNodeIds(elements)].sort()).toEqual(['ctrl', 'igwPod', 'sidecar']);
  });

  it('lets a service NESTED in a labelled compound seed the one-level expansion', () => {
    const elements = [
      node('ctrl', 'controller', INGRESS_LABELS),
      node('nestedSvc', 'service', { parent: 'ctrl' }),
      node('backendPod', 'pod'),
      edge('e1', 'nestedSvc', 'backendPod', 'service-selects-pod'),
    ];
    // A service inside the labelled group is as much part of the gateway as one carrying
    // the label directly, so its selected pods expand in too.
    expect([...collectIngressNodeIds(elements)].sort()).toEqual(['backendPod', 'ctrl', 'nestedSvc']);
  });

  it('does not treat an array-valued labels field as a labels map', () => {
    // Guards the shared isPlainObject narrowing — an array would satisfy a bare
    // `typeof === 'object'` check and could index truthy for a numeric-ish key.
    const elements = [node('weird', 'pod', { labels: ['role', 'ingress-gateway'] })];
    expect(collectIngressNodeIds(elements).size).toBe(0);
  });

  // The backend marks TWO ingress shapes with the same `role` key. Only the chain's entry
  // hop belongs to this set — see the exclusion rationale in collectIngressNodeIds.
  describe('the ingress-lb fallback destination is a different shape', () => {
    const LB_LABELS = { labels: { role: 'ingress-lb' } };

    it('never collects an ingress-lb node', () => {
      // An ingress-lb node has NO routed backend behind it, so the caller's edge to it is
      // the caller's ONLY dependency edge. Collecting it would let the toggle hide that
      // edge and erase the dependency outright, and would dash it as if it were a detour
      // around a direct edge that does not exist.
      const elements = [node('nginxSvc', 'service', LB_LABELS), node('caller', 'pod')];
      expect(collectIngressNodeIds(elements).size).toBe(0);
    });

    it('does not expand from an ingress-lb service to the pods it selects', () => {
      const elements = [
        node('nginxSvc', 'service', LB_LABELS),
        node('nginxPod', 'pod'),
        edge('e', 'nginxSvc', 'nginxPod', 'service-selects-pod'),
      ];
      expect(collectIngressNodeIds(elements).size).toBe(0);
    });

    it('keeps the two shapes apart when both are present in one graph', () => {
      const elements = [
        node('igwSvc', 'service', INGRESS_LABELS),
        node('igwPod', 'pod'),
        edge('e1', 'igwSvc', 'igwPod', 'service-selects-pod'),
        node('nginxSvc', 'service', LB_LABELS),
        node('nginxPod', 'pod'),
        edge('e2', 'nginxSvc', 'nginxPod', 'service-selects-pod'),
      ];
      expect([...collectIngressNodeIds(elements)].sort()).toEqual(['igwPod', 'igwSvc']);
    });

    it('does not collect an unrecognised role value either', () => {
      // Membership is an exact match on the one declared value, not a prefix or a
      // "looks ingress-ish" test — a future third role must opt in deliberately.
      const elements = [node('x', 'service', { labels: { role: 'ingress-gateway-canary' } })];
      expect(collectIngressNodeIds(elements).size).toBe(0);
    });
  });
});
