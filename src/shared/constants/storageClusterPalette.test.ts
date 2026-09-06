import { APPLICATION_COLOR } from './applicationPalette';
import { CLUSTER_COLOR } from './clusterPalette';
import { EDGE_STYLE_BY_TYPE } from './colorByEdgeType';
import { STATUS_COLOR } from './colorByStatus';
import { NAMESPACE_COLOR } from './namespacePalette';
import { STORAGE_CLUSTER_COLOR } from './storageClusterPalette';

const edgeColors = new Set(Object.values(EDGE_STYLE_BY_TYPE).map((s) => s.color.toLowerCase()));
const statusColors = new Set(Object.values(STATUS_COLOR).map((c) => c.toLowerCase()));

describe('STORAGE_CLUSTER_COLOR', () => {
  it('is a single fixed hex constant (one colour for every ONTAP cluster, no per-name hashing)', () => {
    expect(STORAGE_CLUSTER_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('never reuses a status colour (a storage tint must never read as node health)', () => {
    expect(statusColors.has(STORAGE_CLUSTER_COLOR.toLowerCase())).toBe(false);
  });

  it('never reuses an edge colour (the violet storage edge crosses this backplate)', () => {
    expect(edgeColors.has(STORAGE_CLUSTER_COLOR.toLowerCase())).toBe(false);
  });

  it('differs from every other decorative group colour (an ONTAP cluster is not a K8s cluster)', () => {
    expect(STORAGE_CLUSTER_COLOR.toLowerCase()).not.toBe(CLUSTER_COLOR.toLowerCase());
    expect(STORAGE_CLUSTER_COLOR.toLowerCase()).not.toBe(NAMESPACE_COLOR.toLowerCase());
    expect(STORAGE_CLUSTER_COLOR.toLowerCase()).not.toBe(APPLICATION_COLOR.toLowerCase());
  });
});
