import type cytoscape from 'cytoscape';

import { applyPodParentMode } from '../pod-parent-mode';

import { wrapNodeGroup } from './wrapNodeGroup';
import { wrapSwitchFabric } from './wrapSwitchFabric';

type El = cytoscape.ElementDefinition;

const node = (id: string, kind: string, parent?: string, extra?: Record<string, unknown>): El => ({
  group: 'nodes',
  data: { id, kind, ...(parent !== undefined ? { parent } : {}), ...extra },
});
const cluster = (id: string): El => ({ group: 'nodes', data: { id, isCluster: true } });
const group = (id: string, flag: 'isNamespace' | 'isApplication' | 'isController', parent: string): El => ({
  group: 'nodes',
  data: { id, [flag]: true, parent },
});
const edge = (id: string, source: string, target: string, edgeType: string): El => ({
  group: 'edges',
  data: { id, source, target, edgeType },
});

// The panel's real view-transform chain, in KsgPanel's order.
const pipeline = (elements: El[], mode: 'controller' | 'node'): El[] =>
  wrapNodeGroup(wrapSwitchFabric(applyPodParentMode(elements, mode)));

const dataOf = (els: El[], id: string): cytoscape.NodeDataDefinition | undefined =>
  els.find((e) => e.group === 'nodes' && e.data.id === id)?.data;

const groupIds = (els: El[]): string[] =>
  els
    .filter((e) => (e.data as { isNodeGroup?: boolean }).isNodeGroup === true)
    .map((e) => e.data.id)
    .filter((id): id is string => typeof id === 'string');

// A representative backend D6 payload with two clusters and the physical fabric, so the
// composition is exercised against every tier the two wrappers care about.
const d6Graph = (): El[] => [
  cluster('cl'),
  group('ns', 'isNamespace', 'cl'),
  group('app', 'isApplication', 'ns'),
  group('c1', 'isController', 'app'),
  node('n1', 'node', 'cl'),
  node('n2', 'node', 'cl'),
  node('p1', 'pod', 'c1', { labels: { node: 'n1' } }),
  node('svc', 'service', 'ns'),
  cluster('cl2'),
  node('n3', 'node', 'cl2'),
  node('sw/core', 'switch'),
  edge('e-ptn', 'p1', 'n1', 'pod-to-node'),
  edge('e-nts', 'n1', 'sw/core', 'node-to-switch'),
];

describe('wrapNodeGroup in the KsgPanel view-transform chain', () => {
  it('boxes each cluster’s nodes in controller mode: cluster > node group > node', () => {
    const out = pipeline(d6Graph(), 'controller');

    expect(groupIds(out)).toHaveLength(2);
    const prodGroup = dataOf(out, 'n1')?.parent;
    expect(prodGroup).toBeDefined();
    expect(dataOf(out, 'n2')?.parent).toBe(prodGroup);
    expect(dataOf(out, prodGroup as string)?.parent).toBe('cl');
    // The second cluster gets its own group, still under its own cluster.
    const drGroup = dataOf(out, 'n3')?.parent;
    expect(drGroup).not.toBe(prodGroup);
    expect(dataOf(out, drGroup as string)?.parent).toBe('cl2');
    // Controller mode leaves the backend workload tiers alone.
    expect(dataOf(out, 'p1')?.parent).toBe('c1');
  });

  it('wraps the node, not its pods, in node mode: cluster > node group > node > pod', () => {
    const out = pipeline(d6Graph(), 'node');

    const prodGroup = dataOf(out, 'n1')?.parent;
    expect(dataOf(out, prodGroup as string)?.parent).toBe('cl');
    // node mode re-parented the pod under its K8s node; the group sits ABOVE the node.
    expect(dataOf(out, 'p1')?.parent).toBe('n1');
    expect(groupIds(out)).toHaveLength(2);
  });

  it('keeps the group across a mode flip', () => {
    const controllerGroups = groupIds(pipeline(d6Graph(), 'controller')).sort();
    const nodeGroups = groupIds(pipeline(d6Graph(), 'node')).sort();

    expect(controllerGroups).toEqual(nodeGroups);
    expect(controllerGroups).toHaveLength(2);
  });

  it('leaves the switch fabric wrapper untouched', () => {
    const out = pipeline(d6Graph(), 'controller');
    const fabric = out.find((e) => (e.data as { kind?: string }).kind === 'network');

    expect(fabric).toBeDefined();
    expect(dataOf(out, 'sw/core')?.parent).toBe(fabric?.data.id);
  });
});
