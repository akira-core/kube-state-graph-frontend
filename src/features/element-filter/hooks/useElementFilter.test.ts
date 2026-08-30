import { renderHook } from '@testing-library/react';
import cytoscape from 'cytoscape';
import type { MutableRefObject } from 'react';

import { computeVisibility } from '../computeVisibility';

import { useElementFilter } from './useElementFilter';

describe('useElementFilter', () => {
  it('applies visibility hidden to filtered nodes without calling layout', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: [
        { group: 'nodes', data: { id: 'a', kind: 'pod' } },
        { group: 'nodes', data: { id: 'b', kind: 'pod' } },
        { group: 'nodes', data: { id: 'c', kind: 'service' } },
        // a↔b keeps both pods connected (so they survive the orphan pass); a→c is
        // hidden because endpoint c (a filtered service kind) is hidden.
        { group: 'edges', data: { id: 'ab', source: 'a', target: 'b', edgeType: 'pod-calls-pod' } },
        { group: 'edges', data: { id: 'ac', source: 'a', target: 'c', edgeType: 'service-selects-pod' } },
      ],
    });
    const layoutSpy = jest.spyOn(cy, 'layout');
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

    renderHook(() =>
      useElementFilter({
        cyRef,
        sets: computeVisibility(
          cy.elements().jsons() as cytoscape.ElementDefinition[],
          ['pod'],
          ['pod-calls-pod', 'service-selects-pod']
        ),
      })
    );

    expect(cy.getElementById('a').style('visibility')).toBe('visible');
    expect(cy.getElementById('b').style('visibility')).toBe('visible');
    expect(cy.getElementById('c').style('visibility')).toBe('hidden');
    // Edge auto-hides because endpoint 'c' is hidden
    expect(cy.getElementById('ac').style('visibility')).toBe('hidden');
    expect(cy.getElementById('ab').style('visibility')).toBe('visible');
    expect(layoutSpy).not.toHaveBeenCalled();
  });

  it('keeps a filtered-out edge hidden after expand-collapse re-points it onto a visible container (no meta-edge exemption)', () => {
    // cytoscape-expand-collapse's barrowEdgesOfcollapsedChildren never creates a new
    // synthetic edge for a boundary edge — it MOVES the original edge (same id, same
    // data) so its source/target point at the collapsed container instead. Model that
    // directly: 'ac' is the same edge before and after, just re-pointed + reclassed.
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: [
        { group: 'nodes', data: { id: 'a', kind: 'pod' } },
        { group: 'nodes', data: { id: 'b', kind: 'pod' } },
        { group: 'nodes', data: { id: 'c', kind: 'service' } },
        { group: 'edges', data: { id: 'ab', source: 'a', target: 'b', edgeType: 'pod-calls-pod' } },
        { group: 'edges', data: { id: 'ac', source: 'a', target: 'c', edgeType: 'service-selects-pod' } },
      ],
    });
    // Simulate collapse: 'ac' (filtered out below because 'c' is hidden) gets re-pointed
    // onto 'b' (a fully-visible node) and reclassed as a meta-edge — exactly what happens
    // when 'a' folds into a container that also holds 'b'.
    cy.getElementById('ac').move({ target: 'b' });
    cy.getElementById('ac').addClass('cy-expand-collapse-meta-edge');
    const cyRef = { current: cy } as MutableRefObject<cytoscape.Core | null>;

    renderHook(() =>
      useElementFilter({
        cyRef,
        sets: computeVisibility(
          [
            { group: 'nodes', data: { id: 'a', kind: 'pod' } },
            { group: 'nodes', data: { id: 'b', kind: 'pod' } },
            { group: 'nodes', data: { id: 'c', kind: 'service' } },
            { group: 'edges', data: { id: 'ab', source: 'a', target: 'b', edgeType: 'pod-calls-pod' } },
            { group: 'edges', data: { id: 'ac', source: 'a', target: 'c', edgeType: 'service-selects-pod' } },
          ] as cytoscape.ElementDefinition[],
          ['pod'],
          ['pod-calls-pod', 'service-selects-pod']
        ),
      })
    );

    // 'ac' was filtered out because its real endpoint 'c' (a service) is hidden. Even
    // though expand-collapse re-pointed it onto the now-fully-visible 'b', it must STAY
    // hidden — its own id ('ac') is still absent from visibleEdgeIds. Reviving it here
    // would resurrect e.g. a hidden ingress-path edge whenever expand-collapse folds one
    // of its endpoints into a container that still has other visible children.
    expect(cy.getElementById('ac').style('visibility')).toBe('hidden');
    expect(cy.getElementById('ab').style('visibility')).toBe('visible');
  });
});
