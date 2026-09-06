import { APPLICATION_COLOR } from './applicationPalette';
import { CLUSTER_COLOR } from './clusterPalette';
import { EDGE_STYLE_BY_TYPE } from './colorByEdgeType';
import { STATUS_COLOR } from './colorByStatus';
import { NAMESPACE_COLOR } from './namespacePalette';

const edgeColors = new Set(Object.values(EDGE_STYLE_BY_TYPE).map((s) => s.color.toLowerCase()));
const statusColors = new Set(Object.values(STATUS_COLOR).map((c) => c.toLowerCase()));

describe('NAMESPACE_COLOR', () => {
  it('is a single fixed hex constant (one colour for every namespace, no per-name hashing)', () => {
    expect(NAMESPACE_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('never reuses a status colour (a namespace tint must never read as node health)', () => {
    expect(statusColors.has(NAMESPACE_COLOR.toLowerCase())).toBe(false);
  });

  it('never reuses an edge colour (edges must stay legible crossing the backplate)', () => {
    expect(edgeColors.has(NAMESPACE_COLOR.toLowerCase())).toBe(false);
  });

  it('differs from the cluster and application kind colours (nested boxes stay apart)', () => {
    expect(NAMESPACE_COLOR.toLowerCase()).not.toBe(CLUSTER_COLOR.toLowerCase());
    expect(NAMESPACE_COLOR.toLowerCase()).not.toBe(APPLICATION_COLOR.toLowerCase());
  });
});
