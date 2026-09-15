import type cytoscape from 'cytoscape';

import type { NodeIndex } from './nodeIndex';
import type { TraceCluster, TraceDirection, TraceEdge, TraceGrouping, TraceInvestigation, TraceNode } from './types';

/** One aggregated ribbon (same source / target / ifaces) before it becomes an edge. */
export interface AggEdge {
  src: string;
  tgt: string;
  sif: string;
  tif: string;
  bps: number;
  tier: string | null;
  attribution: string | null;
}

/**
 * The mutable state every derive step reads and extends, in call order. Sets and Maps for
 * membership; `order` keeps the drawing order that a Map's insertion order alone would
 * lose when a node is removed and re-added.
 */
export interface BuildCtx {
  elements: readonly cytoscape.ElementDefinition[];
  direction: TraceDirection;
  inv: TraceInvestigation | null;
  minBps: number;
  grouping: TraceGrouping;
  warnings: string[];
  index: NodeIndex;
  // step 1a
  flowTouch: Set<string>;
  placementTouch: Set<string>;
  drawTouch: Set<string>;
  contOut: Map<string, number>;
  contIn: Map<string, number>;
  agg: Map<string, AggEdge>;
  // step 1b / 2
  nodes: Map<string, TraceNode>;
  order: string[];
  edges: TraceEdge[];
  dropIn: Map<string, number>;
  dropOut: Map<string, number>;
  filteredCount: number;
  filteredBps: number;
  // step 3
  root: TraceNode | null;
  anchorEdge: TraceEdge | null;
  // step 4b
  filteredNodes: string[];
  // step 6b
  clusters: TraceCluster[];
}
