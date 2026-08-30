import cytoscape from 'cytoscape';

import { seedAddedNodePositions } from './seedAddedNodePositions';

function cyWithPositionedParent(): cytoscape.Core {
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    elements: [
      { group: 'nodes', data: { id: 'ctrl', isController: true } },
      { group: 'nodes', data: { id: 'p1', parent: 'ctrl', kind: 'pod' } },
    ],
  });
  // A compound parent's position follows its children's bounding box; position the
  // child imperatively so the parent 'ctrl' is recomputed off the origin.
  cy.getElementById('p1').position({ x: 300, y: 200 });
  return cy;
}

describe('seedAddedNodePositions', () => {
  it('seeds a new child at its present parent position instead of (0,0)', () => {
    const cy = cyWithPositionedParent();
    const parentPos = cy.getElementById('ctrl').position();

    const { elements, unanchored } = seedAddedNodePositions(cy, [
      { group: 'nodes', data: { id: 'p2', parent: 'ctrl', kind: 'pod' } },
    ]);

    expect(elements[0]?.position).toEqual({ x: parentPos.x, y: parentPos.y });
    expect(parentPos).not.toEqual({ x: 0, y: 0 });
    expect(unanchored).toBe(0);
    cy.destroy();
  });

  it('does not mutate the input elements (memoization safety)', () => {
    const cy = cyWithPositionedParent();
    const input: cytoscape.ElementDefinition[] = [{ group: 'nodes', data: { id: 'p2', parent: 'ctrl', kind: 'pod' } }];

    const { elements } = seedAddedNodePositions(cy, input);

    expect(input[0]?.position).toBeUndefined();
    expect(elements[0]).not.toBe(input[0]);
    cy.destroy();
  });

  it('leaves edges and nodes with an existing position untouched; counts a parentless newcomer as unanchored', () => {
    const cy = cyWithPositionedParent();
    const input: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'orphan', kind: 'pod' } },
      { group: 'nodes', data: { id: 'pinned', parent: 'ctrl', kind: 'pod' }, position: { x: 5, y: 5 } },
      { group: 'edges', data: { id: 'e1', source: 'p1', target: 'orphan' } },
    ];

    const { elements, unanchored } = seedAddedNodePositions(cy, input);

    expect(elements[0]?.position).toBeUndefined(); // orphan: nothing to anchor to
    expect(elements[1]?.position).toEqual({ x: 5, y: 5 }); // pinned: keeps its position
    expect(elements[2]).toBe(input[2]); // edge: returned as-is
    // A parentless newcomer (top-level external/others leaf) has no anchor either —
    // it must trigger the one-shot relayout or it sits at (0,0) forever.
    expect(unanchored).toBe(1);
    cy.destroy();
  });

  it('walks a NEW parent in the same batch up to an existing ancestor (child precedes parent)', () => {
    // normalize emits pods BEFORE their synthesized controller, so the child precedes
    // its new parent in toAdd. The new controller's parent (an existing cluster) is the
    // anchor: both the pod and the new controller should seed to the cluster position.
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: [
        { group: 'nodes', data: { id: 'cluster', isCluster: true } },
        { group: 'nodes', data: { id: 'anchor', parent: 'cluster', kind: 'pod' } },
      ],
    });
    cy.getElementById('anchor').position({ x: 600, y: 100 });
    const clusterPos = cy.getElementById('cluster').position();

    const { elements, unanchored } = seedAddedNodePositions(cy, [
      { group: 'nodes', data: { id: 'newPod', parent: 'newCtrl', kind: 'pod' } }, // child first
      { group: 'nodes', data: { id: 'newCtrl', parent: 'cluster', isController: true } }, // parent second
    ]);

    expect(elements[0]?.position).toEqual({ x: clusterPos.x, y: clusterPos.y }); // walked newCtrl → cluster
    expect(elements[1]?.position).toEqual({ x: clusterPos.x, y: clusterPos.y });
    expect(unanchored).toBe(0);
    cy.destroy();
  });

  it('reports a wholly-new family (no present ancestor) as unanchored instead of seeding it', () => {
    const cy = cyWithPositionedParent();

    // A brand-new top-level controller + its pod, neither with any existing ancestor.
    const { elements, unanchored } = seedAddedNodePositions(cy, [
      { group: 'nodes', data: { id: 'orphanPod', parent: 'orphanCtrl', kind: 'pod' } },
      { group: 'nodes', data: { id: 'orphanCtrl', isController: true } },
    ]);

    expect(elements[0]?.position).toBeUndefined(); // no anchor → left for relayout
    // Both family members lack an anchor: the pod's chain dangles and the new
    // top-level controller is parentless — each counts toward the one-shot relayout.
    expect(unanchored).toBe(2);
    cy.destroy();
  });

  it('leaves a child whose parent reference dangles (no such node anywhere) unanchored', () => {
    const cy = cyWithPositionedParent();

    const { elements, unanchored } = seedAddedNodePositions(cy, [
      { group: 'nodes', data: { id: 'p3', parent: 'ghost', kind: 'pod' } },
    ]);

    expect(elements[0]?.position).toBeUndefined();
    expect(unanchored).toBe(1);
    cy.destroy();
  });
});
