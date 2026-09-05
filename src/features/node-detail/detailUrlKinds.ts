import { CATEGORY_BY_KIND } from '../../shared/constants/categoryByKind';
import type { GraphNodeKind, NodeKind } from '../../shared/constants/types';

// The kinds whose node-detail panel carries the Application / Containers sections
// and whose (left-click) selection fires the detail-URL queries — exactly the Workloads
// category (pod + the five workload controllers). Derived from the single-source
// CATEGORY_BY_KIND (a compiler-exhaustive Record<NodeKind, …>) instead of a
// hand-maintained parallel list, so a future workload kind cannot silently miss
// this gate. The panel-rendering spec pins the same membership.
// Typed ReadonlySet<GraphNodeKind> (not NodeKind) so callers can membership-test a
// raw graph kind — which may be an unknown backend string — without casting; an
// unknown kind simply isn't a member.
export const DETAIL_URL_KINDS: ReadonlySet<GraphNodeKind> = new Set(
  (Object.keys(CATEGORY_BY_KIND) as NodeKind[]).filter((kind) => CATEGORY_BY_KIND[kind] === 'Workloads')
);
