import type cytoscape from 'cytoscape';

import { assembleDashboardParams } from './assembleDashboardParams';

describe('assembleDashboardParams', () => {
  it('leaf: keeps kind + name (from label) + namespace, drops labels / rendering / structural fields', () => {
    const elements: cytoscape.ElementDefinition[] = [
      {
        group: 'nodes',
        data: {
          id: 'demo/p1',
          label: 'mongo-0',
          kind: 'pod',
          namespace: 'shop',
          parent: 'node1',
          status: 'critical',
          worstStatus: 'critical',
          clusterColor: '#fff',
          labels: { app: 'mongo' },
        },
      },
    ];
    // parent 'node1' is absent from elements and labels carries no cluster → no cluster param.
    expect(assembleDashboardParams(elements, 'demo/p1')).toEqual({ kind: 'pod', name: 'mongo-0', namespace: 'shop' });
  });

  it('leaf: drops alerts/containers/raw owner, but emits ipaddress (from ipAddress) + controller (from owner.name)', () => {
    const elements: cytoscape.ElementDefinition[] = [
      {
        group: 'nodes',
        data: {
          id: 'demo/p1',
          label: 'mongo-0',
          kind: 'pod',
          alerts: [{ name: 'HighMem', severity: 'critical', timeRecords: [1] }],
          containers: [{ name: 'app', image: 'repo/app:1' }],
          owner: { kind: 'StatefulSet', name: 'mongo' },
          ipAddress: ['10.0.0.1'],
        },
      },
    ];
    // alerts/containers dropped; raw `owner` object never sent, but it seeds `controller`
    // (no isController ancestor here → owner.name fallback); ipAddress → ipaddress array.
    expect(assembleDashboardParams(elements, 'demo/p1')).toEqual({
      kind: 'pod',
      name: 'mongo-0',
      controller: 'mongo',
      ipaddress: ['10.0.0.1'],
    });
  });

  describe('ipaddress', () => {
    it('emits ipaddress carrying the string[] verbatim (repeated params)', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', ipAddress: ['10.0.0.1', '10.0.0.2'] } },
      ];
      expect(assembleDashboardParams(elements, 'p1')).toEqual({
        kind: 'pod',
        name: 'mongo-0',
        ipaddress: ['10.0.0.1', '10.0.0.2'],
      });
    });

    it('omits ipaddress when ipAddress is absent or an empty array', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', ipAddress: [] } },
      ];
      const params = assembleDashboardParams(elements, 'p1');
      expect(params).toEqual({ kind: 'pod', name: 'mongo-0' });
      expect(params && 'ipaddress' in params).toBe(false);
    });
  });

  describe('controller resolution', () => {
    it('resolves controller from the nearest isController ancestor (controller mode pod)', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'cl', label: 'prod', isCluster: true, cluster: 'prod' } },
        { group: 'nodes', data: { id: 'ctrl', kind: 'statefulset', label: 'mongo', isController: true, parent: 'cl' } },
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', parent: 'ctrl' } },
      ];
      expect(assembleDashboardParams(elements, 'p1')).toEqual({
        kind: 'pod',
        name: 'mongo-0',
        cluster: 'prod',
        controller: 'mongo',
      });
    });

    it('falls back to owner.name when no isController ancestor is present (node mode pod)', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'node1', kind: 'node', label: 'ip-10-0-0-1' } },
        {
          group: 'nodes',
          data: {
            id: 'p1',
            kind: 'pod',
            label: 'mongo-0',
            parent: 'node1',
            owner: { kind: 'StatefulSet', name: 'mongo' },
          },
        },
      ];
      expect(assembleDashboardParams(elements, 'p1')).toEqual({ kind: 'pod', name: 'mongo-0', controller: 'mongo' });
    });

    it('prefers the ancestor controller over owner.name (ancestor is authoritative)', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'ctrl', kind: 'deployment', label: 'web', isController: true } },
        {
          group: 'nodes',
          data: {
            id: 'p1',
            kind: 'pod',
            label: 'web-0',
            parent: 'ctrl',
            owner: { kind: 'ReplicaSet', name: 'web-rs' },
          },
        },
      ];
      expect(assembleDashboardParams(elements, 'p1')).toEqual({ kind: 'pod', name: 'web-0', controller: 'web' });
    });

    it('omits controller for a controller compound itself (no parent controller, no owner)', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'ctrl', kind: 'deployment', label: 'web', isController: true } },
      ];
      const params = assembleDashboardParams(elements, 'ctrl');
      expect(params).toEqual({ kind: 'deployment', name: 'web' });
      expect(params && 'controller' in params).toBe(false);
    });

    it('omits controller for a bare leaf with no ancestor controller and no owner', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'svc', kind: 'service', label: 'mongo-svc' } },
      ];
      const params = assembleDashboardParams(elements, 'svc');
      expect(params).toEqual({ kind: 'service', name: 'mongo-svc' });
      expect(params && 'controller' in params).toBe(false);
    });

    it('carries a service/pvc leaf ArgoCD application through as a scope param (backend D6)', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'svc', kind: 'service', label: 'mongo-svc', application: 'mongodb' } },
      ];
      const params = assembleDashboardParams(elements, 'svc');
      expect(params).toEqual({ kind: 'service', name: 'mongo-svc', application: 'mongodb' });
    });
  });

  describe('from_time / to_time', () => {
    it('emits from_time/to_time as Unix-seconds strings when a timeRange is passed', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0' } },
      ];
      const timeRange = { fromUnixSeconds: 1700000000, toUnixSeconds: 1700003600 };
      expect(assembleDashboardParams(elements, 'p1', timeRange)).toEqual({
        kind: 'pod',
        name: 'mongo-0',
        from_time: '1700000000',
        to_time: '1700003600',
      });
    });

    it('omits from_time/to_time when no timeRange is passed', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0' } },
      ];
      const params = assembleDashboardParams(elements, 'p1');
      expect(params && 'from_time' in params).toBe(false);
      expect(params && 'to_time' in params).toBe(false);
    });

    it('never carries time for an ineligible node (returns undefined before the time block)', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'cl', label: 'prod', isCluster: true } },
      ];
      const timeRange = { fromUnixSeconds: 1700000000, toUnixSeconds: 1700003600 };
      expect(assembleDashboardParams(elements, 'cl', timeRange)).toBeUndefined();
    });
  });

  it('compound (k8s-node): merges an attribute identical across ALL children that the node itself lacks', () => {
    const elements: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'node1', kind: 'node', label: 'ip-10-0-0-1' } },
      { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', namespace: 'shop', parent: 'node1' } },
      { group: 'nodes', data: { id: 'p2', kind: 'pod', label: 'mongo-1', namespace: 'shop', parent: 'node1' } },
    ];
    // own: kind=node, name=ip-10-0-0-1. children share namespace=shop (merged); children
    // kind=pod is identical but own already has kind (own-wins → stays node); name differs.
    expect(assembleDashboardParams(elements, 'node1')).toEqual({
      kind: 'node',
      name: 'ip-10-0-0-1',
      namespace: 'shop',
    });
  });

  it('compound: skips an attribute that differs across children', () => {
    const elements: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'node1', kind: 'node', label: 'ip-10-0-0-1' } },
      { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', namespace: 'shop', parent: 'node1' } },
      { group: 'nodes', data: { id: 'p2', kind: 'pod', label: 'web-0', namespace: 'web', parent: 'node1' } },
    ];
    // namespace differs (shop vs web) → not merged.
    expect(assembleDashboardParams(elements, 'node1')).toEqual({ kind: 'node', name: 'ip-10-0-0-1' });
  });

  it('compound: own value wins over a child-identical value on the same key', () => {
    const elements: cytoscape.ElementDefinition[] = [
      {
        group: 'nodes',
        data: { id: 'ctrl', kind: 'statefulset', label: 'mongo', isController: true, namespace: 'own' },
      },
      { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', namespace: 'child', parent: 'ctrl' } },
      { group: 'nodes', data: { id: 'p2', kind: 'pod', label: 'mongo-1', namespace: 'child', parent: 'ctrl' } },
    ];
    expect(assembleDashboardParams(elements, 'ctrl')).toEqual({
      kind: 'statefulset',
      name: 'mongo',
      namespace: 'own',
    });
  });

  it('compound: drops the synthesized controller id and never sends it', () => {
    const elements: cytoscape.ElementDefinition[] = [
      {
        group: 'nodes',
        data: { id: 'ctrl/demo/shop/statefulset/mongo', kind: 'statefulset', label: 'mongo', isController: true },
      },
    ];
    const params = assembleDashboardParams(elements, 'ctrl/demo/shop/statefulset/mongo');
    expect(params).toEqual({ kind: 'statefulset', name: 'mongo' });
    expect(params && 'id' in params).toBe(false);
  });

  it('childless compound → own attributes only', () => {
    const elements: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'node1', kind: 'node', label: 'ip-10-0-0-1', namespace: 'infra' } },
    ];
    expect(assembleDashboardParams(elements, 'node1')).toEqual({
      kind: 'node',
      name: 'ip-10-0-0-1',
      namespace: 'infra',
    });
  });

  it.each([
    ['cluster', { isCluster: true }],
    ['namespace', { isNamespace: true }],
    ['application', { isApplication: true }],
  ])('returns undefined for the ineligible %s decorative group', (_label, extra) => {
    const elements: cytoscape.ElementDefinition[] = [{ group: 'nodes', data: { id: 'g1', label: 'g1', ...extra } }];
    expect(assembleDashboardParams(elements, 'g1')).toBeUndefined();
  });

  it('treats a netapp-aggr as eligible but never sends its storage facts as params', () => {
    const elements: cytoscape.ElementDefinition[] = [
      {
        group: 'nodes',
        data: {
          id: 'sc',
          kind: 'netapp-aggr',
          label: 'aggr1',
          health: 'online',
          usage: { usedBytes: 7e11, capacityBytes: 1e12 },
          usageRatio: 0.7,
          labels: { cluster: 'prod' },
        },
      },
    ];
    const params = assembleDashboardParams(elements, 'sc');
    expect(params).toEqual({ kind: 'netapp-aggr', name: 'aggr1', cluster: 'prod' });
    expect(params).not.toHaveProperty('health');
    expect(params).not.toHaveProperty('usage');
    expect(params).not.toHaveProperty('usageRatio');
  });

  it('never sends a PVC storageclass name as a query param', () => {
    const elements: cytoscape.ElementDefinition[] = [
      {
        group: 'nodes',
        data: { id: 'pvc', kind: 'pvc', label: 'data-0', storageclass: 'netapp-nas', labels: { cluster: 'prod' } },
      },
    ];
    expect(assembleDashboardParams(elements, 'pvc')).not.toHaveProperty('storageclass');
  });

  it('excludes the storage-cluster decorative group entirely', () => {
    const elements: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'sc-grp', label: 'ontap-prod', isStorageCluster: true } },
    ];
    expect(assembleDashboardParams(elements, 'sc-grp')).toBeUndefined();
  });

  describe('cluster resolution', () => {
    it('resolves cluster from the nearest isCluster ancestor (direct parent)', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'cl', label: 'prod', isCluster: true, cluster: 'prod' } },
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', namespace: 'shop', parent: 'cl' } },
      ];
      expect(assembleDashboardParams(elements, 'p1')).toEqual({
        kind: 'pod',
        name: 'mongo-0',
        namespace: 'shop',
        cluster: 'prod',
      });
    });

    it('walks through a namespace box to the isCluster ancestor (controller nesting)', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'cl', label: 'prod', isCluster: true, cluster: 'prod' } },
        { group: 'nodes', data: { id: 'ns', label: 'shop', isNamespace: true, parent: 'cl' } },
        { group: 'nodes', data: { id: 'ctrl', kind: 'deployment', label: 'web', isController: true, parent: 'ns' } },
      ];
      expect(assembleDashboardParams(elements, 'ctrl')).toEqual({ kind: 'deployment', name: 'web', cluster: 'prod' });
    });

    it('falls back to labels.cluster when no isCluster ancestor is present', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', labels: { cluster: 'dr' } } },
      ];
      expect(assembleDashboardParams(elements, 'p1')).toEqual({ kind: 'pod', name: 'mongo-0', cluster: 'dr' });
    });

    it('prefers the ancestor cluster over labels.cluster (ancestor is authoritative)', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'cl', label: 'prod', isCluster: true, cluster: 'prod' } },
        { group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'mongo-0', parent: 'cl', labels: { cluster: 'dr' } } },
      ];
      expect(assembleDashboardParams(elements, 'p1')).toEqual({ kind: 'pod', name: 'mongo-0', cluster: 'prod' });
    });

    it('emits no cluster when neither an ancestor nor labels.cluster exists', () => {
      const elements: cytoscape.ElementDefinition[] = [
        { group: 'nodes', data: { id: 'ext', kind: 'external', label: 'api.example' } },
      ];
      expect(assembleDashboardParams(elements, 'ext')).toEqual({ kind: 'external', name: 'api.example' });
    });
  });

  it('returns undefined for a missing node id or a null selection', () => {
    const elements: cytoscape.ElementDefinition[] = [{ group: 'nodes', data: { id: 'p1', kind: 'pod', label: 'm' } }];
    expect(assembleDashboardParams(elements, 'nope')).toBeUndefined();
    expect(assembleDashboardParams(elements, null)).toBeUndefined();
  });
});
