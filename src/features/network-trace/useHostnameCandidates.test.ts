import { renderHook } from '@testing-library/react';
import type cytoscape from 'cytoscape';
import { describe, expect, it } from 'vitest';

import { SHOWCASE_TRACE } from '../../shared/fixtures/showcaseTrace';
import { normalizeGraph } from '../graph-data';

import { switchHostnames, useHostnameCandidates } from './useHostnameCandidates';

function node(id: string, kind: string, label?: string): cytoscape.ElementDefinition {
  return { group: 'nodes', data: { id, kind, ...(label !== undefined ? { label } : {}) } };
}

describe('switchHostnames', () => {
  it('lists the names and ids of switch nodes only, sorted and deduplicated', () => {
    const elements: cytoscape.ElementDefinition[] = [
      node('sw/tor-2', 'switch', 'tor-2'),
      node('tor-1', 'switch', 'tor-1'),
      node('node/worker-0', 'node', 'worker-0'),
      node('host-9', 'host', 'host-9'),
      node('sw/tor-2', 'switch', 'tor-2'),
      { group: 'edges', data: { id: 'e', source: 'tor-1', target: 'sw/tor-2', edgeType: 'network-flow' } },
    ];
    expect(switchHostnames(elements)).toEqual(['sw/tor-2', 'tor-1', 'tor-2']);
  });

  it('is empty before the first payload', () => {
    expect(switchHostnames([])).toEqual([]);
  });

  it('skips a switch with a blank label but still offers its id', () => {
    expect(switchHostnames([node('sw/x', 'switch', ''), node('sw/y', 'switch')])).toEqual(['sw/x', 'sw/y']);
  });

  it('offers every switch of the fixture and none of its pods or nodes', () => {
    const names = switchHostnames(normalizeGraph(SHOWCASE_TRACE).elements);
    expect(names).toEqual(['core', 'dist-a', 'spine-a', 'spine-b', 'sw/core', 'sw/dist-a', 'sw/spine-a', 'sw/spine-b']);
  });
});

describe('useHostnameCandidates', () => {
  it('memoises on the elements array', () => {
    const elements = [node('sw/a', 'switch', 'a')];
    const { result, rerender } = renderHook(({ els }) => useHostnameCandidates(els), {
      initialProps: { els: elements },
    });
    const first = result.current;
    expect(first).toEqual(['a', 'sw/a']);
    rerender({ els: elements });
    expect(result.current).toBe(first);
    rerender({ els: [...elements, node('sw/b', 'switch', 'b')] });
    expect(result.current).toEqual(['a', 'b', 'sw/a', 'sw/b']);
  });
});
