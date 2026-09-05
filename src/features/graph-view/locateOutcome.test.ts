import { describe, expect, it } from 'vitest';

import { locateOutcome } from './locateOutcome';

const elements = [
  { group: 'nodes' as const, data: { id: 'pvc/data-mongo-0' } },
  { group: 'nodes' as const, data: { id: 'pod/mongo-0' } },
];

describe('locateOutcome', () => {
  it('reports filter-hidden when the node is in the body but not visible', () => {
    expect(locateOutcome('pvc/data-mongo-0', elements, new Set(['pod/mongo-0']))).toBe('filter-hidden');
  });

  it('reports missing when the node is not in the current graph body', () => {
    expect(locateOutcome('pod/unprojected', elements, new Set(['pod/mongo-0']))).toBe('missing');
  });

  it('reports ok when the node is present and visible', () => {
    expect(locateOutcome('pod/mongo-0', elements, new Set(['pod/mongo-0']))).toBe('ok');
  });
});
