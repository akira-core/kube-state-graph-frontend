import { CATEGORY_BY_KIND, CATEGORY_ORDER, categoryForKind, type NodeCategory } from './categoryByKind';
import { ICON_SVG_BY_KIND } from './iconSvgByKind';

// The Workloads category is the load-bearing one: it also defines DETAIL_URL_KINDS
// (the kinds whose right-click fires the Change-Report queries). Pin it so a future
// workload kind cannot silently join or leave the set.
const WORKLOAD_KINDS = ['cronjob', 'daemonset', 'deployment', 'job', 'pod', 'statefulset'];

describe('categoryByKind', () => {
  it('maps exactly pod + the five workload controllers to Workloads', () => {
    const workloads = Object.keys(CATEGORY_BY_KIND)
      .filter((k) => CATEGORY_BY_KIND[k as keyof typeof CATEGORY_BY_KIND] === 'Workloads')
      .sort();
    expect(workloads).toEqual(WORKLOAD_KINDS);
  });

  it('places one representative of every category in its expected section', () => {
    expect(CATEGORY_BY_KIND.pod).toBe('Workloads');
    expect(CATEGORY_BY_KIND.service).toBe('Networking');
    expect(CATEGORY_BY_KIND.pvc).toBe('Storage');
    expect(CATEGORY_BY_KIND.node).toBe('Cluster');
    expect(CATEGORY_BY_KIND.external).toBe('Other');
  });

  it('covers the same kind universe as the icon map (no kind mapped in one map but not the other)', () => {
    expect(Object.keys(CATEGORY_BY_KIND).sort()).toEqual(Object.keys(ICON_SVG_BY_KIND).sort());
  });

  it('only ever assigns categories that exist in CATEGORY_ORDER', () => {
    const order = new Set<NodeCategory>(CATEGORY_ORDER);
    for (const category of Object.values(CATEGORY_BY_KIND)) {
      expect(order.has(category)).toBe(true);
    }
  });

  it('lists the legend sections in the fixed Workloads→Networking→Storage→Cluster→Other order', () => {
    expect(CATEGORY_ORDER).toEqual(['Workloads', 'Networking', 'Storage', 'Cluster', 'Other']);
  });

  it('falls back to Other for an unknown kind so the legend never drops a kind it cannot map', () => {
    expect(categoryForKind('crd-from-the-future')).toBe('Other');
    expect(categoryForKind('')).toBe('Other');
  });

  it('returns the mapped category (not the fallback) for a known kind', () => {
    expect(categoryForKind('statefulset')).toBe('Workloads');
    expect(categoryForKind('switch')).toBe('Networking');
  });
});
