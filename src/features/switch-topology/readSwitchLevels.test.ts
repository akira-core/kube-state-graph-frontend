import type cytoscape from 'cytoscape';

import { readSwitchLevels } from './readSwitchLevels';

const sw = (id: string, level?: string, extra: Record<string, unknown> = {}): cytoscape.ElementDefinition => ({
  group: 'nodes',
  data: { id, kind: 'switch', ...(level !== undefined ? { labels: { level } } : {}), ...extra },
});

const k8sNode = (id: string, extra: Record<string, unknown> = {}): cytoscape.ElementDefinition => ({
  group: 'nodes',
  data: { id, kind: 'node', ...extra },
});

describe('readSwitchLevels', () => {
  it('reads a valid integer level from labels.level', () => {
    const levels = readSwitchLevels([sw('sw1', '2')]);
    expect(levels.get('sw1')).toBe(2);
  });

  it('keeps level 0', () => {
    const levels = readSwitchLevels([sw('sw1', '0')]);
    expect(levels.get('sw1')).toBe(0);
  });

  it('excludes a switch with no labels.level', () => {
    const levels = readSwitchLevels([sw('sw1')]);
    expect(levels.has('sw1')).toBe(false);
    expect(levels.size).toBe(0);
  });

  it('excludes a switch whose labels.level is blank, non-numeric, or negative', () => {
    const levels = readSwitchLevels([sw('blank', ''), sw('nan', 'abc'), sw('neg', '-1')]);
    expect(levels.size).toBe(0);
  });

  it('ignores a non-switch node that carries labels.level', () => {
    const levels = readSwitchLevels([k8sNode('n1', { labels: { level: '0' } })]);
    expect(levels.has('n1')).toBe(false);
    expect(levels.size).toBe(0);
  });

  it('returns an empty map when there are no switch nodes', () => {
    const levels = readSwitchLevels([k8sNode('n1'), { group: 'nodes', data: { id: 'p1', kind: 'pod' } }]);
    expect(levels.size).toBe(0);
  });

  it('reads multiple switches across levels deterministically', () => {
    const elements = [sw('a', '0'), sw('b', '0'), sw('c', '1'), sw('d', '2')];
    const first = readSwitchLevels(elements);
    const second = readSwitchLevels(elements);
    expect([...first.entries()]).toEqual([
      ['a', 0],
      ['b', 0],
      ['c', 1],
      ['d', 2],
    ]);
    expect([...first.entries()]).toEqual([...second.entries()]);
  });
});
