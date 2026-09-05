import type cytoscape from 'cytoscape';

import { cloneElementDefs } from './cloneElementDefs';

describe('cloneElementDefs', () => {
  it('deep-clones data so mutations on the clone never reach the original', () => {
    const original = [
      {
        group: 'nodes',
        data: { id: 'a', labels: { app: 'web' }, alerts: [{ name: 'HighMem', timeRecords: [1] }] },
        position: { x: 10, y: 20 },
      },
      { group: 'edges', data: { id: 'e', source: 'a', target: 'b' } },
    ] as unknown as cytoscape.ElementDefinition[];
    const cloned = cloneElementDefs(original);

    expect(cloned).toEqual(original);
    expect(cloned[0]?.data).not.toBe(original[0]?.data);
    expect(cloned[0]?.position).not.toBe(original[0]?.position);

    (cloned[0]!.data as Record<string, unknown>).contaminated = true;
    (cloned[0]!.data.labels as Record<string, string>).app = 'mutated';
    (cloned[1]!.data as Record<string, unknown>).target = 'rewired';

    expect((original[0]!.data as Record<string, unknown>).contaminated).toBeUndefined();
    expect((original[0]!.data.labels as Record<string, string>).app).toBe('web');
    expect(original[1]!.data.target).toBe('b');
  });

  it('preserves elements without a position and primitive data values', () => {
    const original: cytoscape.ElementDefinition[] = [{ group: 'nodes', data: { id: 'a', count: 0, label: '' } }];
    const cloned = cloneElementDefs(original);
    expect(cloned[0]).toEqual(original[0]);
    expect('position' in cloned[0]!).toBe(false);
  });
});
