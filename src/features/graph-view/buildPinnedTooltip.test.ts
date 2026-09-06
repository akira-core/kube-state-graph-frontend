import type { NodeDetailData } from '../node-detail';

import { buildPinnedTooltip } from './buildPinnedTooltip';

describe('buildPinnedTooltip', () => {
  it('maps null to null (no selection → no pinned card)', () => {
    expect(buildPinnedTooltip(null)).toBeNull();
  });

  it('maps a node with attributes and labels to a full PinnedTooltip', () => {
    const node: NodeDetailData = {
      id: 'pod-1',
      label: 'gateway',
      kind: 'pod',
      attributes: [
        { key: 'kind', value: 'pod' },
        { key: 'namespace', value: 'apps' },
      ],
      labels: { cluster: 'prod', namespace: 'apps' },
    };
    expect(buildPinnedTooltip(node)).toEqual({
      label: 'gateway',
      attributes: [
        { key: 'kind', value: 'pod' },
        { key: 'namespace', value: 'apps' },
      ],
      labels: { cluster: 'prod', namespace: 'apps' },
    });
  });

  it('omits the labels key when the node has no labels (exactOptionalPropertyTypes-safe)', () => {
    const node: NodeDetailData = {
      id: 'svc-1',
      label: 'mongo-svc',
      kind: 'service',
      attributes: [{ key: 'kind', value: 'service' }],
    };
    const result = buildPinnedTooltip(node);
    expect(result).toEqual({ label: 'mongo-svc', attributes: [{ key: 'kind', value: 'service' }] });
    expect(result).not.toHaveProperty('labels');
  });

  it('defaults attributes to [] when the node carries none', () => {
    const node: NodeDetailData = { id: 'n', label: 'bare' };
    expect(buildPinnedTooltip(node)).toEqual({ label: 'bare', attributes: [] });
  });

  it('builds a pinned card for a netapp-aggr (health + usage promoted)', () => {
    const node: NodeDetailData = {
      id: 'netapp/ontap-prod/aggr/aggr1',
      label: 'aggr1',
      kind: 'netapp-aggr',
      health: 'online',
      usage: { usedBytes: 7e11, capacityBytes: 1e12 },
      attributes: [
        { key: 'kind', value: 'netapp-aggr' },
        { key: 'health', value: 'online' },
        { key: 'usage', value: '700 GB / 1 TB (70%)' },
      ],
    };
    expect(buildPinnedTooltip(node)).toEqual({
      label: 'aggr1',
      attributes: [
        { key: 'kind', value: 'netapp-aggr' },
        { key: 'health', value: 'online' },
        { key: 'usage', value: '700 GB / 1 TB (70%)' },
      ],
    });
  });
});
