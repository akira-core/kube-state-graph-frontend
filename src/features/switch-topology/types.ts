// Pure data shapes for switch-fabric layering. The switch-topology feature reads
// an explicit per-`switch` network level from the node label and turns it into a
// native fcose fixed-node constraint that pins switches into stacked rows — one
// row per level (see readSwitchLevels / buildSwitchConstraints).

// A single fcose `fixedNodeConstraint` entry: pin `nodeId` to an absolute position
// in the layout's model coordinate space.
export interface SwitchFixedNode {
  nodeId: string;
  position: { x: number; y: number };
}

// The fcose-constraint bundle merged into the layout options. `fixedNodeConstraint`
// is absent when no switch carries a valid level (the layout-unchanged no-op case).
export interface SwitchConstraints {
  fixedNodeConstraint?: SwitchFixedNode[];
}
