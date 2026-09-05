import type cytoscape from 'cytoscape';

import { wrapNodeGroup } from './wrapNodeGroup';

const node = (id: string, kind?: string, parent?: string): cytoscape.ElementDefinition => ({
  group: 'nodes',
  data: {
    id,
    ...(kind !== undefined ? { kind } : {}),
    ...(parent !== undefined ? { parent } : {}),
  },
});

const edge = (id: string, source: string, target: string): cytoscape.ElementDefinition => ({
  group: 'edges',
  data: { id, source, target },
});

const groups = (result: cytoscape.ElementDefinition[]): cytoscape.ElementDefinition[] =>
  result.filter((el) => (el.data as { isNodeGroup?: boolean }).isNodeGroup === true);

const dataOf = (result: cytoscape.ElementDefinition[], id: string): Record<string, unknown> | undefined =>
  result.find((el) => (el.data as { id?: string }).id === id)?.data;

describe('wrapNodeGroup', () => {
  it('boxes the nodes of one cluster into a single group and leaves its siblings alone', () => {
    const input = [
      node('cluster/prod', undefined, undefined),
      node('node/worker-0', 'node', 'cluster/prod'),
      node('node/worker-1', 'node', 'cluster/prod'),
      node('svc/api', 'service', 'cluster/prod'),
      node('pvc/data', 'pvc', 'cluster/prod'),
    ];
    const result = wrapNodeGroup(input);

    const injected = groups(result);
    expect(injected).toHaveLength(1);
    const wrapper = injected[0]?.data as Record<string, unknown>;
    expect(wrapper.parent).toBe('cluster/prod');
    expect(wrapper.label).toBe('nodes');

    const wrapperId = wrapper.id as string;
    expect(dataOf(result, 'node/worker-0')?.parent).toBe(wrapperId);
    expect(dataOf(result, 'node/worker-1')?.parent).toBe(wrapperId);
    // Non-node siblings keep the cluster as their parent.
    expect(dataOf(result, 'svc/api')?.parent).toBe('cluster/prod');
    expect(dataOf(result, 'pvc/data')?.parent).toBe('cluster/prod');
  });

  it('gives every distinct parent its own group', () => {
    const input = [
      node('node/worker-0', 'node', 'cluster/prod'),
      node('node/worker-1', 'node', 'cluster/prod'),
      node('node/worker-2', 'node', 'cluster/dr'),
    ];
    const result = wrapNodeGroup(input);

    const injected = groups(result);
    expect(injected).toHaveLength(2);
    expect(injected.map((el) => (el.data as { parent?: string }).parent).sort()).toEqual([
      'cluster/dr',
      'cluster/prod',
    ]);

    const prodGroup = dataOf(result, 'node/worker-0')?.parent;
    expect(dataOf(result, 'node/worker-1')?.parent).toBe(prodGroup);
    // No group ever spans two clusters.
    expect(dataOf(result, 'node/worker-2')?.parent).not.toBe(prodGroup);
  });

  it('wraps a lone node too — the structure does not depend on cluster size', () => {
    const result = wrapNodeGroup([node('cluster/dr'), node('node/worker-2', 'node', 'cluster/dr')]);

    expect(groups(result)).toHaveLength(1);
    expect(dataOf(result, 'node/worker-2')?.parent).toBe((groups(result)[0]?.data as { id: string }).id);
  });

  it('gives parent-less nodes a top-level group', () => {
    const result = wrapNodeGroup([node('node/lonely', 'node')]);

    const injected = groups(result);
    expect(injected).toHaveLength(1);
    expect((injected[0]?.data as Record<string, unknown>).parent).toBeUndefined();
    expect(dataOf(result, 'node/lonely')?.parent).toBe((injected[0]?.data as { id: string }).id);
  });

  it('carries no kind, status, worstStatus, alert or selectable flag on the group', () => {
    const result = wrapNodeGroup([node('node/worker-0', 'node', 'cluster/prod')]);
    const wrapper = groups(result)[0];

    expect(wrapper?.data).not.toHaveProperty('kind');
    expect(wrapper?.data).not.toHaveProperty('status');
    expect(wrapper?.data).not.toHaveProperty('worstStatus');
    expect(wrapper?.data).not.toHaveProperty('alerts');
    // Selectable by omission — the expand-collapse `+` cue is drawn only on a SELECTED
    // parent, so the group must never opt out the way a cluster does.
    expect(wrapper).not.toHaveProperty('selectable');
  });

  it('never mutates the input elements or array', () => {
    const input = [node('cluster/prod'), node('node/worker-0', 'node', 'cluster/prod')];
    const snapshot = JSON.parse(JSON.stringify(input)) as unknown;

    const result = wrapNodeGroup(input);

    expect(input).toEqual(snapshot);
    expect(input).toHaveLength(2);
    // Every returned element is a fresh object (cytoscape aliases the `data` it is handed).
    for (const el of result) {
      expect(input).not.toContain(el);
    }
    for (const el of input) {
      expect(result.some((r) => r.data === el.data)).toBe(false);
    }
  });

  it('preserves edges untouched', () => {
    const result = wrapNodeGroup([
      node('node/worker-0', 'node', 'cluster/prod'),
      node('pod/a', 'pod', 'cluster/prod'),
      edge('e1', 'pod/a', 'node/worker-0'),
    ]);

    const preserved = result.find((el) => (el.data as { id?: string }).id === 'e1');
    expect(preserved?.data).toEqual({ id: 'e1', source: 'pod/a', target: 'node/worker-0' });
  });

  it('no-ops when the graph holds no node kind', () => {
    const input = [node('pod/a', 'pod', 'cluster/prod'), edge('e1', 'pod/a', 'pod/a')];
    const result = wrapNodeGroup(input);

    expect(groups(result)).toHaveLength(0);
    expect(result.map((el) => el.data)).toEqual(input.map((el) => el.data));
  });

  it('backs the whole pass off when a generated id is already taken', () => {
    const taken = wrapNodeGroup([node('node/worker-0', 'node', 'cluster/prod')]);
    const generatedId = (groups(taken)[0]?.data as { id: string }).id;

    const result = wrapNodeGroup([
      node('node/worker-0', 'node', 'cluster/prod'),
      node('node/worker-1', 'node', 'cluster/dr'),
      node(generatedId, 'service', 'cluster/prod'),
    ]);

    expect(groups(result)).toHaveLength(0);
    // Not even the OTHER, non-colliding cluster gets re-parented.
    expect(dataOf(result, 'node/worker-0')?.parent).toBe('cluster/prod');
    expect(dataOf(result, 'node/worker-1')?.parent).toBe('cluster/dr');
  });

  it('backs off when an element already carries isNodeGroup', () => {
    const input: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'someone-elses-group', isNodeGroup: true, parent: 'cluster/prod' } },
      node('node/worker-0', 'node', 'someone-elses-group'),
    ];
    const result = wrapNodeGroup(input);

    expect(groups(result)).toHaveLength(1);
    expect((groups(result)[0]?.data as { id: string }).id).toBe('someone-elses-group');
    expect(dataOf(result, 'node/worker-0')?.parent).toBe('someone-elses-group');
  });

  it('infers node-vs-edge when the group field is omitted', () => {
    const input: cytoscape.ElementDefinition[] = [
      { data: { id: 'node/worker-0', kind: 'node', parent: 'cluster/prod' } },
      { data: { id: 'e1', source: 'node/worker-0', target: 'node/worker-0', edgeType: 'pod-to-node' } },
    ];
    const result = wrapNodeGroup(input);

    expect(groups(result)).toHaveLength(1);
    expect(dataOf(result, 'node/worker-0')?.parent).toBe((groups(result)[0]?.data as { id: string }).id);
    // The edge is not mistaken for a node and is left exactly as it was.
    expect(dataOf(result, 'e1')?.parent).toBeUndefined();
  });
});
