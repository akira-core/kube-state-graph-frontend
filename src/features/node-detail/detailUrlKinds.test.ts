import { CATEGORY_BY_KIND } from '../../shared/constants/categoryByKind';

import { DETAIL_URL_KINDS } from './detailUrlKinds';

// DETAIL_URL_KINDS gates the node-detail Application / Containers sections and the
// right-click Change-Report queries. It is DERIVED from the Workloads category, so
// these tests pin both the resulting membership and that derivation invariant —
// catching any silent drift in the Workloads set.
const WORKLOAD_KINDS = ['cronjob', 'daemonset', 'deployment', 'job', 'pod', 'statefulset'];

describe('DETAIL_URL_KINDS', () => {
  it('is exactly pod + the five workload controllers', () => {
    expect([...DETAIL_URL_KINDS].sort()).toEqual(WORKLOAD_KINDS);
  });

  it('contains every Workloads kind and only Workloads kinds (matches the category source)', () => {
    for (const [kind, category] of Object.entries(CATEGORY_BY_KIND)) {
      expect(DETAIL_URL_KINDS.has(kind)).toBe(category === 'Workloads');
    }
  });

  it('excludes networking / storage / cluster / other kinds (no detail-URL gate for them)', () => {
    for (const kind of ['service', 'node', 'pvc', 'external', 'network', 'switch', 'storageclass']) {
      expect(DETAIL_URL_KINDS.has(kind)).toBe(false);
    }
  });

  it('treats an unknown forward-compat kind as a non-member (membership test never throws)', () => {
    expect(DETAIL_URL_KINDS.has('crd-from-the-future')).toBe(false);
  });
});
