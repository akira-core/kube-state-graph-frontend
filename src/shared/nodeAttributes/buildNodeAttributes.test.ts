import { buildNodeAttributes } from './buildNodeAttributes';

// Minimal raw-data builder; the helper only reads promoted fields off the data bag.
function data(d: Record<string, unknown>): Record<string, unknown> {
  return { id: 'n1', ...d };
}

describe('buildNodeAttributes', () => {
  it('promotes a real data.kind', () => {
    expect(buildNodeAttributes(data({ kind: 'pod' }))).toEqual([{ key: 'kind', value: 'pod' }]);
  });

  it('synthesizes kind "application" for a kind-less application group', () => {
    expect(buildNodeAttributes(data({ isApplication: true }))).toEqual([{ key: 'kind', value: 'application' }]);
  });

  it('synthesizes kind "namespace" for a kind-less namespace group', () => {
    expect(buildNodeAttributes(data({ isNamespace: true }))).toEqual([{ key: 'kind', value: 'namespace' }]);
  });

  it('synthesizes kind "cluster" for a kind-less cluster group', () => {
    expect(buildNodeAttributes(data({ isCluster: true, cluster: 'prod' }))).toEqual([
      { key: 'kind', value: 'cluster' },
    ]);
  });

  it('promotes namespace, application and ipAddress (array joined)', () => {
    const attrs = buildNodeAttributes(
      data({ kind: 'pod', namespace: 'prod', application: 'mongodb', ipAddress: ['10.0.0.1', '10.0.0.2'] })
    );
    expect(attrs).toEqual([
      { key: 'kind', value: 'pod' },
      { key: 'namespace', value: 'prod' },
      { key: 'application', value: 'mongodb' },
      { key: 'ipAddress', value: '10.0.0.1, 10.0.0.2' },
    ]);
  });

  it('skips the application row on the application GROUP node itself', () => {
    const attrs = buildNodeAttributes(data({ isApplication: true, application: 'mongodb' }));
    expect(attrs).toEqual([{ key: 'kind', value: 'application' }]);
  });

  it('skips an empty-string application', () => {
    expect(buildNodeAttributes(data({ kind: 'service', application: '' }))).toEqual([
      { key: 'kind', value: 'service' },
    ]);
  });

  it("promotes an aggregate's health and formatted usage", () => {
    const attrs = buildNodeAttributes(
      data({ kind: 'netapp-aggr', health: 'online', usage: { usedBytes: 7e11, capacityBytes: 1e12 } })
    );
    expect(attrs).toEqual([
      { key: 'kind', value: 'netapp-aggr' },
      { key: 'health', value: 'online' },
      { key: 'usage', value: '700 GB / 1 TB (70%)' },
    ]);
  });

  it("promotes a PVC's storageclass name alongside its usage", () => {
    const attrs = buildNodeAttributes(
      data({ kind: 'pvc', storageclass: 'netapp-nas', usage: { usedBytes: 5e9, capacityBytes: 1e10 } })
    );
    expect(attrs).toEqual([
      { key: 'kind', value: 'pvc' },
      { key: 'storageclass', value: 'netapp-nas' },
      { key: 'usage', value: '5 GB / 10 GB (50%)' },
    ]);
  });

  it('renders a partial usage reading without inventing the missing half', () => {
    expect(buildNodeAttributes(data({ kind: 'pvc', usage: { capacityBytes: 1e10 } }))).toEqual([
      { key: 'kind', value: 'pvc' },
      { key: 'usage', value: '10 GB capacity' },
    ]);
  });

  it('emits no health row when the backend sent none (absence is not degraded)', () => {
    expect(buildNodeAttributes(data({ kind: 'netapp-node' }))).toEqual([{ key: 'kind', value: 'netapp-node' }]);
  });

  it.each(['ingress-gateway', 'ingress-lb'])('promotes the %s role so the two ingress shapes read apart', (role) => {
    // Both ingress shapes are ordinary `type="service"` nodes carrying only this label to
    // tell them apart, and they behave differently under the ingress toggle — so the value
    // has to be legible without expanding the raw label list.
    expect(buildNodeAttributes(data({ kind: 'service', labels: { role } }))).toEqual([
      { key: 'kind', value: 'service' },
      { key: 'role', value: role },
    ]);
  });

  it("promotes a K8s node's Ready condition", () => {
    expect(buildNodeAttributes(data({ kind: 'node', readyStatus: 'NotReady' }))).toEqual([
      { key: 'kind', value: 'node' },
      { key: 'ready', value: 'NotReady' },
    ]);
  });

  it('emits no ready row when the Ready condition was never scraped (absence is not Unknown)', () => {
    expect(buildNodeAttributes(data({ kind: 'node' }))).toEqual([{ key: 'kind', value: 'node' }]);
  });

  it("promotes a claim's backing PV name and SVM from its labels", () => {
    // The two keys the NetApp join hinges on: `volumename` is what Harvest's relabel rule
    // matches a FlexVol to, and `svm` scopes the QoS reads. When a claim fails to reach an
    // aggregate these are the first things an operator checks, so they sit beside the
    // storage rows rather than buried in the raw label list.
    expect(
      buildNodeAttributes(
        data({ kind: 'pvc', storageclass: 'netapp-nas', labels: { volumename: 'pvc-9f3a', svm: 'svm-prod' } })
      )
    ).toEqual([
      { key: 'kind', value: 'pvc' },
      { key: 'storageclass', value: 'netapp-nas' },
      { key: 'volumename', value: 'pvc-9f3a' },
      { key: 'svm', value: 'svm-prod' },
    ]);
  });

  it('promotes a bound claim that never joined an aggregate without inventing an svm', () => {
    // The blind-spot case the storage capability documents: the PV is bound but no
    // Harvest label series matched it, so there is no SVM. The absent row IS the signal.
    expect(buildNodeAttributes(data({ kind: 'pvc', labels: { volumename: 'pvc-9f3a' } }))).toEqual([
      { key: 'kind', value: 'pvc' },
      { key: 'volumename', value: 'pvc-9f3a' },
    ]);
  });

  it('ignores non-string label values rather than rendering "[object Object]"', () => {
    expect(buildNodeAttributes(data({ kind: 'pvc', labels: { volumename: 42, svm: '' } }))).toEqual([
      { key: 'kind', value: 'pvc' },
    ]);
  });

  it('returns no rows for data carrying no promoted attrs (no empty rows)', () => {
    expect(buildNodeAttributes(data({}))).toEqual([]);
  });
});
