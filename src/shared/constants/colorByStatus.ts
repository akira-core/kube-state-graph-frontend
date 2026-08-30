import { DARK_TOKENS } from '../theme/tokens';

import type { NodeStatus } from './types';

// Single source of truth for status border colour. Values live in tokens.ts so
// DOM, cytoscape, and Sankey stay in lockstep; light/dark share these hexes.
export const STATUS_COLOR: Record<NodeStatus, string> = {
  normal: DARK_TOKENS.status.normal,
  warning: DARK_TOKENS.status.warning,
  critical: DARK_TOKENS.status.critical,
};

// Aggregation default for an absent / unparseable status: a node that carries no
// status renders NO status border (data-driven — getStylesheet borders `node[status]`,
// not a kind whitelist; normalize omits the field when the backend sends none), but it
// still counts as `normal` when a parent rolls up its worst child status (worstStatus).
export const FALLBACK_STATUS: NodeStatus = 'normal';
