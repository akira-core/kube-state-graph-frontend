import { recKind } from './nodeKind';

describe('recKind', () => {
  it('folds the container flags back into a kind, isController winning over the workload icon', () => {
    expect(recKind({ id: 'a', kind: 'deployment', isController: true })).toBe('controller');
    expect(recKind({ id: 'a', isApplication: true })).toBe('application');
    expect(recKind({ id: 'a', isNamespace: true })).toBe('namespace');
    expect(recKind({ id: 'a', isCluster: true })).toBe('cluster');
    expect(recKind({ id: 'a', isStorageCluster: true })).toBe('storage-cluster');
  });

  it('reads a plain kind, and an absent one as the empty string', () => {
    expect(recKind({ id: 'a', kind: 'pod' })).toBe('pod');
    expect(recKind({ id: 'a' })).toBe('');
  });
});
