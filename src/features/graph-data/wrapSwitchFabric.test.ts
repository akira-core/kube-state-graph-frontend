import type cytoscape from 'cytoscape';

import { wrapSwitchFabric } from './wrapSwitchFabric';

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

const wrapperOf = (result: cytoscape.ElementDefinition[]): cytoscape.ElementDefinition | undefined =>
  result.find((el) => (el.data as { kind?: string }).kind === 'network');

describe('wrapSwitchFabric', () => {
  it('injects one network wrapper and re-parents every top-level switch under it', () => {
    const input = [node('sw/a', 'switch'), node('sw/b', 'switch'), node('p1', 'pod')];
    const result = wrapSwitchFabric(input);

    const wrapper = wrapperOf(result);
    expect(wrapper).toBeDefined();
    expect(wrapper?.data).toMatchObject({ id: 'network/fabric', label: 'physical network', kind: 'network' });
    expect(result).toHaveLength(input.length + 1);
    for (const id of ['sw/a', 'sw/b']) {
      const sw = result.find((el) => el.data.id === id);
      expect(sw?.data.parent).toBe('network/fabric');
    }
  });

  it('leaves non-switch nodes and edges untouched', () => {
    const input = [node('sw/a', 'switch'), node('p1', 'pod'), edge('e1', 'p1', 'sw/a')];
    const result = wrapSwitchFabric(input);
    expect(result.find((el) => el.data.id === 'p1')?.data.parent).toBeUndefined();
    expect(result.find((el) => el.data.id === 'e1')?.data).toEqual({ id: 'e1', source: 'p1', target: 'sw/a' });
  });

  it('keeps an already-parented switch where the backend put it', () => {
    const input = [node('sw/a', 'switch'), node('sw/b', 'switch', 'cluster/prod'), node('cluster/prod')];
    const result = wrapSwitchFabric(input);
    expect(result.find((el) => el.data.id === 'sw/a')?.data.parent).toBe('network/fabric');
    expect(result.find((el) => el.data.id === 'sw/b')?.data.parent).toBe('cluster/prod');
  });

  it('backs off when a network-kind node already exists (data owns the grouping)', () => {
    const input = [node('net/fabric', 'network'), node('sw/a', 'switch', 'net/fabric'), node('sw/b', 'switch')];
    const result = wrapSwitchFabric(input);
    expect(result).toHaveLength(input.length);
    expect(result.find((el) => el.data.id === 'sw/b')?.data.parent).toBeUndefined();
  });

  it('backs off when there is no parent-less switch', () => {
    const noSwitch = wrapSwitchFabric([node('p1', 'pod'), edge('e1', 'p1', 'p1')]);
    expect(wrapperOf(noSwitch)).toBeUndefined();
    const allParented = wrapSwitchFabric([node('sw/a', 'switch', 'cluster/prod')]);
    expect(wrapperOf(allParented)).toBeUndefined();
  });

  it('never mutates the input elements', () => {
    const sw = node('sw/a', 'switch');
    const input = [sw];
    const snapshot = JSON.parse(JSON.stringify(input)) as cytoscape.ElementDefinition[];
    wrapSwitchFabric(input);
    expect(input).toEqual(snapshot);
    expect(sw.data.parent).toBeUndefined();
  });
});
