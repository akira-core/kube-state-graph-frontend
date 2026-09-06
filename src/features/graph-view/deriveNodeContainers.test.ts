import type cytoscape from 'cytoscape';

import { deriveContainers } from './deriveNodeContainers';

const NEUTRAL = '#888888';

function node(data: Record<string, unknown>): cytoscape.ElementDefinition {
  return { group: 'nodes', data };
}
function edge(data: Record<string, unknown>): cytoscape.ElementDefinition {
  return { group: 'edges', data };
}

describe('deriveContainers — node mode', () => {
  it('treats a node that parents pods as a container coloured by its cluster', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true, clusterColor: '#0ea5e9', label: 'prod' }),
      node({ id: 'node/worker-0', kind: 'node', parent: 'cluster/prod', label: 'worker-0' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/worker-0', label: 'a' }),
    ];
    const { containerEntries, containerIds, title, collapseNoun } = deriveContainers(els, NEUTRAL, 'node');
    expect(containerEntries).toEqual([{ name: 'worker-0', color: '#0ea5e9' }]);
    expect(containerIds).toEqual(['node/worker-0']);
    expect(title).toBe('Nodes');
    expect(collapseNoun).toBe('nodes');
  });

  it('never lists the synthesized node group, and still tints the node through it', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true, clusterColor: '#0ea5e9', label: 'prod' }),
      node({ id: 'node-group/cluster/prod', isNodeGroup: true, label: 'nodes', parent: 'cluster/prod' }),
      node({ id: 'node/worker-0', kind: 'node', parent: 'node-group/cluster/prod', label: 'worker-0' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/worker-0', label: 'a' }),
    ];
    for (const mode of ['node', 'controller'] as const) {
      const { containerEntries, containerIds } = deriveContainers(els, NEUTRAL, mode);
      expect(containerIds).not.toContain('node-group/cluster/prod');
      expect(containerEntries.map((e) => e.name)).not.toContain('nodes');
    }
    // The node keeps its cluster tint: the ancestor walk climbs THROUGH the kind-less
    // group (which carries no colour of its own) to the cluster accent.
    expect(deriveContainers(els, NEUTRAL, 'node').containerEntries).toEqual([{ name: 'worker-0', color: '#0ea5e9' }]);
  });

  it('returns every node-container id (not name-deduped) for the collapse toggle', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true, clusterColor: '#0ea5e9', label: 'prod' }),
      node({ id: 'node/w-1', kind: 'node', parent: 'cluster/prod', label: 'worker' }),
      node({ id: 'node/w-2', kind: 'node', parent: 'cluster/prod', label: 'worker' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/w-1', label: 'a' }),
      node({ id: 'pod/b', kind: 'pod', parent: 'node/w-2', label: 'b' }),
    ];
    const { containerEntries, containerIds } = deriveContainers(els, NEUTRAL, 'node');
    // swatches dedupe by name (one "worker") …
    expect(containerEntries).toEqual([{ name: 'worker', color: '#0ea5e9' }]);
    // … but BOTH container ids must collapse/expand together.
    expect(containerIds).toEqual(['node/w-1', 'node/w-2']);
  });

  it('falls back to the neutral colour when a node container has no cluster parent', () => {
    const els = [
      node({ id: 'node/w', kind: 'node', label: 'w' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/w', label: 'a' }),
    ];
    const { containerEntries } = deriveContainers(els, NEUTRAL, 'node');
    expect(containerEntries).toEqual([{ name: 'w', color: NEUTRAL }]);
  });

  it('treats a childless node as a drawn leaf (not a container)', () => {
    const els = [
      node({ id: 'node/w', kind: 'node', label: 'w' }),
      node({ id: 'pod/a', kind: 'pod', label: 'a' }),
      edge({ id: 'e', source: 'pod/a', target: 'node/w', edgeType: 'pod-runs-on-node' }),
    ];
    const { containerEntries, containerIds } = deriveContainers(els, NEUTRAL, 'node');
    expect(containerEntries).toEqual([]);
    expect(containerIds).toEqual([]);
  });

  it('colours each node by its own cluster across multiple clusters', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true, clusterColor: '#0ea5e9', label: 'prod' }),
      node({ id: 'cluster/dr', isCluster: true, clusterColor: '#8b5cf6', label: 'dr' }),
      node({ id: 'node/w0', kind: 'node', parent: 'cluster/prod', label: 'w0' }),
      node({ id: 'node/w2', kind: 'node', parent: 'cluster/dr', label: 'w2' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/w0', label: 'a' }),
      node({ id: 'pod/b', kind: 'pod', parent: 'node/w2', label: 'b' }),
    ];
    const { containerEntries } = deriveContainers(els, NEUTRAL, 'node');
    expect(containerEntries).toEqual([
      { name: 'w0', color: '#0ea5e9' },
      { name: 'w2', color: '#8b5cf6' },
    ]);
  });

  it('dedupes node containers sharing a display name', () => {
    const els = [
      node({ id: 'cluster/prod', isCluster: true, clusterColor: '#0ea5e9', label: 'prod' }),
      node({ id: 'node/w-1', kind: 'node', parent: 'cluster/prod', label: 'worker' }),
      node({ id: 'node/w-2', kind: 'node', parent: 'cluster/prod', label: 'worker' }),
      node({ id: 'pod/a', kind: 'pod', parent: 'node/w-1', label: 'a' }),
      node({ id: 'pod/b', kind: 'pod', parent: 'node/w-2', label: 'b' }),
    ];
    const { containerEntries } = deriveContainers(els, NEUTRAL, 'node');
    expect(containerEntries).toEqual([{ name: 'worker', color: '#0ea5e9' }]);
  });
});

describe('deriveContainers — controller mode', () => {
  it('controller mode derives controller containers, not K8s nodes', () => {
    const els = [
      node({ id: 'cl', isCluster: true, clusterColor: '#abc' }),
      node({ id: 'c1', kind: 'deployment', isController: true, label: 'web', parent: 'cl' }),
      node({ id: 'p1', kind: 'pod', parent: 'c1' }),
    ];
    const out = deriveContainers(els, '#999', 'controller');
    expect(out.containerIds).toEqual(['c1']);
    expect(out.containerEntries.map((e) => e.name)).toEqual(['web']);
    expect(out.title).toBe('Controllers');
    expect(out.collapseNoun).toBe('controllers');
  });

  it('controller mode colours a controller by its cluster parent accent', () => {
    const els = [
      node({ id: 'cl', isCluster: true, clusterColor: '#0ea5e9', label: 'prod' }),
      node({ id: 'c1', kind: 'statefulset', isController: true, label: 'mongo', parent: 'cl' }),
      node({ id: 'p1', kind: 'pod', parent: 'c1' }),
    ];
    const { containerEntries } = deriveContainers(els, NEUTRAL, 'controller');
    expect(containerEntries).toEqual([{ name: 'mongo', color: '#0ea5e9' }]);
  });

  it('controller mode does not treat a K8s node as a container', () => {
    const els = [
      node({ id: 'cl', isCluster: true, clusterColor: '#0ea5e9', label: 'prod' }),
      node({ id: 'n1', kind: 'node', parent: 'cl', label: 'worker' }),
      node({ id: 'c1', kind: 'deployment', isController: true, label: 'web', parent: 'cl' }),
      node({ id: 'p1', kind: 'pod', parent: 'c1' }),
    ];
    const { containerIds } = deriveContainers(els, NEUTRAL, 'controller');
    expect(containerIds).toEqual(['c1']);
  });

  // namespace grouping (controller mode) re-parents controllers under a synthesized
  // namespace box, which carries namespaceColor — NOT clusterColor. The swatch must
  // still read the enclosing cluster's accent by walking the ancestor chain, matching
  // the canvas (getStylesheet resolveParentClusterColor) so legend ≠ canvas can't drift.
  it('controller mode colours a controller nested under a namespace box by its cluster ancestor', () => {
    const els = [
      node({ id: 'cl', isCluster: true, clusterColor: '#0ea5e9', label: 'prod' }),
      node({
        id: 'nsbox/cl/team-a',
        isNamespace: true,
        namespaceColor: '#e8833a',
        namespace: 'team-a',
        parent: 'cl',
        label: 'team-a',
      }),
      node({
        id: 'c1',
        kind: 'statefulset',
        isController: true,
        label: 'mongo',
        parent: 'nsbox/cl/team-a',
        namespace: 'team-a',
      }),
      node({ id: 'p1', kind: 'pod', parent: 'c1' }),
    ];
    const { containerEntries } = deriveContainers(els, NEUTRAL, 'controller');
    expect(containerEntries).toEqual([{ name: 'mongo', color: '#0ea5e9' }]);
  });
});
