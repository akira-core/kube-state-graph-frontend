import type cytoscape from 'cytoscape';

import { diffElements } from './diffElements';

const node = (id: string, extra: Record<string, unknown> = {}): cytoscape.ElementDefinition => ({
  group: 'nodes',
  data: { id, ...extra },
});

const edge = (
  id: string,
  source: string,
  target: string,
  extra: Record<string, unknown> = {}
): cytoscape.ElementDefinition => ({
  group: 'edges',
  data: { id, source, target, ...extra },
});

describe('diffElements', () => {
  it('returns empty diff for identical sets', () => {
    const current = [node('a'), node('b'), edge('a-b', 'a', 'b')];
    const next = [node('a'), node('b'), edge('a-b', 'a', 'b')];
    expect(diffElements(current, next)).toEqual({ toAdd: [], toRemove: [], toUpdate: [] });
  });

  it('detects additions', () => {
    const current = [node('a')];
    const next = [node('a'), node('b')];
    const diff = diffElements(current, next);
    expect(diff.toAdd).toHaveLength(1);
    expect(diff.toAdd[0]?.data.id).toBe('b');
    expect(diff.toRemove).toEqual([]);
    expect(diff.toUpdate).toEqual([]);
  });

  it('detects removals', () => {
    const current = [node('a'), node('b')];
    const next = [node('a')];
    expect(diffElements(current, next).toRemove).toEqual(['b']);
  });

  it('detects updates when data fields differ', () => {
    const current = [node('a', { label: 'one' })];
    const next = [node('a', { label: 'two' })];
    const diff = diffElements(current, next);
    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toUpdate[0]?.data.label).toBe('two');
  });

  it('detects updates for nested labels object', () => {
    const current = [node('a', { labels: { app: 'foo' } })];
    const next = [node('a', { labels: { app: 'bar' } })];
    expect(diffElements(current, next).toUpdate).toHaveLength(1);
  });

  it('handles empty input on both sides', () => {
    expect(diffElements([], [])).toEqual({ toAdd: [], toRemove: [], toUpdate: [] });
  });

  it('treats an undefined-valued key as absent (removeData tombstone ≠ change)', () => {
    // cytoscape's removeData() leaves `{ key: undefined }` on the live element's
    // jsons(); an incoming definition that omits the key must compare equal, or the
    // element would be re-flagged toUpdate on every diff cycle after a removal.
    const current = [node('a', { kind: 'deployment', alerts: undefined })];
    const next = [node('a', { kind: 'deployment' })];
    expect(diffElements(current, next).toUpdate).toEqual([]);
    // The reverse still counts as a real update (a value appearing).
    const gained = [node('a', { kind: 'deployment', alerts: [{ name: 'x' }] })];
    expect(diffElements(current, gained).toUpdate).toHaveLength(1);
  });

  it('ignores elements without an id', () => {
    const noId: cytoscape.ElementDefinition = { group: 'nodes', data: {} };
    const diff = diffElements([noId], [noId, node('a')]);
    expect(diff.toAdd).toHaveLength(1);
    expect(diff.toAdd[0]?.data.id).toBe('a');
    expect(diff.toRemove).toEqual([]);
  });

  it('routes an edge endpoint change through remove+add (data() cannot rewire)', () => {
    // cytoscape ignores writes to source/target via data(); classifying a rewired
    // edge as toUpdate would leave it pointing at the old endpoint forever (e.g. a
    // ppm:pod-runs-on-node edge whose pod rescheduled to another K8s node).
    const current = [node('a'), node('b'), node('c'), edge('e1', 'a', 'b')];
    const next = [node('a'), node('b'), node('c'), edge('e1', 'a', 'c')];
    const diff = diffElements(current, next);
    expect(diff.toRemove).toEqual(['e1']);
    expect(diff.toAdd.map((el) => el.data.id)).toEqual(['e1']);
    expect(diff.toUpdate).toEqual([]);
  });

  it('keeps a data-only edge change on the update path (no endpoint change)', () => {
    const current = [node('a'), node('b'), edge('e1', 'a', 'b', { edgeType: 'pod-calls-pod' })];
    const next = [node('a'), node('b'), edge('e1', 'a', 'b', { edgeType: 'service-selects-pod' })];
    const diff = diffElements(current, next);
    expect(diff.toRemove).toEqual([]);
    expect(diff.toAdd).toEqual([]);
    expect(diff.toUpdate).toHaveLength(1);
  });

  it('ignores expand-collapse bookkeeping keys left on a live element', () => {
    // After expand the extension leaves `collapsedChildren: null` behind and never
    // removes `size-before-collapse`; the incoming definition carries neither — the
    // element must NOT re-enter toUpdate on every diff cycle forever.
    const current = [
      node('ctrl', {
        kind: 'deployment',
        collapsedChildren: null,
        'size-before-collapse': { w: 21, h: 21 },
        expandcollapseRenderedStartX: 3,
        'x-before-fisheye': 10,
      }),
    ];
    const next = [node('ctrl', { kind: 'deployment' })];
    expect(diffElements(current, next).toUpdate).toEqual([]);
    // A real data change on the same element is still detected.
    const changed = [node('ctrl', { kind: 'deployment', worstStatus: 'critical' })];
    expect(diffElements(current, changed).toUpdate).toHaveLength(1);
  });
});
