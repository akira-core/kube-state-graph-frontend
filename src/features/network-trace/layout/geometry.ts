import type { ColumnHeader } from '../../sankey-canvas';
import type { TraceEdge, TraceNode, TraceWrapper } from '../model/types';

export type SlotRole = 'in' | 'out' | 'back-out' | 'lat-out' | 'lat-in' | 'back-in';

/**
 * One port slot on a card's edge: an ordinary edge, a lateral arc, a backflow, or a
 * residual block (`res`). `cy` is assigned by the stack placement.
 */
export interface Slot {
  edge?: TraceEdge;
  role?: SlotRole;
  iface?: string;
  res?: 'in' | 'out';
  /** Residual amount, bits/s. */
  bps?: number;
  /** Visual thickness (already at least the minimum; an ownership line is OWN_T). */
  thickness: number;
  cy: number;
}

export interface NodeGeom {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Vertical centre (y + h / 2). */
  cy: number;
  leftSlots: Slot[];
  rightSlots: Slot[];
}

export interface EdgeGeom {
  /** Visual thickness. */
  t: number;
  /** A backflow spanning one column runs in the corridor between them, not around the bottom. */
  backNear: boolean;
  x1: number;
  y1: number;
  t1: number;
  x2: number;
  y2: number;
  t2: number;
  /** Lateral arc protrusion. */
  bulge?: number;
  /** Multi-column backflow loop geometry. */
  backT?: number;
  backY?: number;
  backXD?: number;
  backXU?: number;
}

/** A k8s node frame's placement; the model's wrapper is untouched. */
export interface WrapperGeom {
  wrapper: TraceWrapper;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TraceGeometry {
  width: number;
  height: number;
  /** Nodes per column, in drawing order (the pod column partitioned by frame under `node`). */
  cols: TraceNode[][];
  colX: number[];
  columns: ColumnHeader[];
  /** Frames (ordered); empty under `flat`. */
  wrappers: WrapperGeom[];
  /** The column holding the frames; -1 when there are none. */
  podCol: number;
  nodes: Map<string, NodeGeom>;
  edges: Map<string, EdgeGeom>;
}
