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

// Node-STATUS rank (higher = worse). A container that hides other nodes — a collapsed
// cytoscape compound, a Sankey `application` / `namespace` card, a Sankey node wrapper —
// borders by the worst status it HIDES. STATUS, not alert severity, is the signal: every
// node has a status (default normal) on a uniform scale, and a pod can be
// warning/critical without any alert.
export const STATUS_RANK: Record<NodeStatus, number> = { normal: 0, warning: 1, critical: 2 };

export function rankToStatus(rank: number): NodeStatus {
  return rank >= 2 ? 'critical' : rank === 1 ? 'warning' : 'normal';
}

// Keyed off STATUS_COLOR so a status can never be paintable but unrecognised, or the
// reverse. Callers use it to keep a backend `data.status` ONLY when it is one this palette
// can draw — an unknown value must leave the field absent, not paint a wrong colour.
export function isNodeStatus(value: unknown): value is NodeStatus {
  return typeof value === 'string' && Object.hasOwn(STATUS_COLOR, value);
}
