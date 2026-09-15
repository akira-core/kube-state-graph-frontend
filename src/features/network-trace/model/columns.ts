import { formatBitsPerSec } from '../../../shared/format/measurements';

import { bandOf, isClientPartition, K8S_SUBCOLS, k8sSubcol } from './bands';
import type { BuildCtx } from './ctx';
import type { TraceEdge, TraceNode } from './types';
import { mustGet, SEP } from './util';

/**
 * Step 5: columns. The drawing is three bands (see `bands.ts`): the switch band is laid out
 * by longest path with tier locking (5a–5d, on the switch subgraph only); the k8s band is a
 * fixed chain of sub-columns and the owner band one column after it (5h). Under a
 * destination trace the bands run start → k8s → owner left to right; under a source trace
 * the k8s and owner bands take negative columns so packets still flow left → right and the
 * start hop keeps the far right (`normalizeColumns` pulls the minimum back to 0).
 */
export function assignColumns(ctx: BuildCtx): void {
  const { nodes, edges, direction } = ctx;
  const ids = [...ctx.order];
  const nodeOf = (id: string): TraceNode => mustGet(nodes, id, 'node');
  const switchIds = ids.filter((id) => bandOf(nodeOf(id)) === 'switch');
  const switchSet = new Set(switchIds);
  const switchEdges = edges.filter((e) => switchSet.has(e.fromId) && switchSet.has(e.toId));
  layerSwitchBand(ctx, switchIds, switchEdges);

  // 5h. The k8s band: only the sub-columns that hold a card take a column; the client
  // partition shares the last of them (or stands alone when nothing is k8s). Owners follow.
  const present = new Set<string>();
  let hasClient = false;
  for (const id of ids) {
    const n = nodeOf(id);
    const s = k8sSubcol(n);
    if (s !== null) {
      present.add(s);
    }
    hasClient = hasClient || isClientPartition(n);
  }
  const subs: string[] = K8S_SUBCOLS.filter((s) => present.has(s));
  const nSub = Math.max(subs.length, hasClient ? 1 : 0);
  let maxSwitchCol = -1;
  for (const id of switchIds) {
    maxSwitchCol = Math.max(maxSwitchCol, nodeOf(id).col);
  }
  for (const id of ids) {
    const n = nodeOf(id);
    const band = bandOf(n);
    if (band === 'switch') {
      continue;
    }
    let idx: number;
    if (band === 'owner') {
      idx = nSub;
    } else if (band === 'client') {
      idx = nSub - 1;
    } else {
      idx = subs.indexOf(k8sSubcol(n) ?? 'node');
    }
    n.col = direction === 'destination' ? maxSwitchCol + 1 + idx : -(idx + 1);
  }

  // 5e. Still-reversed edges (decreasing column) are backflow; 5f. same-column edges are
  // lateral interconnects, drawn as right-side arcs. An edge crossing a band boundary the
  // wrong way never took part in the vote, so it gets its warning here.
  for (const e of edges) {
    const from = nodeOf(e.fromId);
    const to = nodeOf(e.toId);
    e.backward = from.col > to.col;
    e.lateral = from.col === to.col;
    if (e.backward && bandOf(from) !== bandOf(to)) {
      ctx.warnings.push(
        `${from.label} → ${to.label} runs back toward the trace start across the band boundary (${formatBitsPerSec(e.bps)}); drawn as backflow.`
      );
    }
  }

  assignTierSubOrder(ctx, ids);
}

/**
 * 5a–5d on one subgraph: nodes sharing a `tier` act as one super-node — the group takes
 * one column and edges inside it do not take part in the ordering, so a same-tier
 * interconnect (bdr ↔ dci) never splits a tier into two columns. Untiered nodes are
 * groups of one, so with no tiers this IS plain longest path.
 */
function layerSwitchBand(ctx: BuildCtx, ids: readonly string[], edges: readonly TraceEdge[]): void {
  const { nodes, warnings } = ctx;
  const groupOf = new Map<string, string>();
  const groupIds: string[] = [];
  // Group → first-appearance rank, for the tie-break in 5b.
  const groupIdx = new Map<string, number>();
  for (const id of ids) {
    const n = mustGet(nodes, id, 'node');
    const g = n.tier !== null ? `t:${n.tier}` : `n:${id}`;
    groupOf.set(id, g);
    if (!groupIdx.has(g)) {
      groupIdx.set(g, groupIds.length);
      groupIds.push(g);
    }
  }
  const gOf = (id: string): string => mustGet(groupOf, id, 'group');
  // 5a. Total flow between groups, per direction, in first-appearance order.
  const gflow = new Map<string, number>();
  for (const e of edges) {
    const ga = gOf(e.fromId);
    const gb = gOf(e.toId);
    if (ga === gb) {
      continue;
    }
    const k = `${ga}${SEP}${gb}`;
    gflow.set(k, (gflow.get(k) ?? 0) + e.bps);
  }
  const groupLabel = (g: string): string =>
    g.startsWith('t:') ? `tier "${g.slice(2)}"` : mustGet(nodes, g.slice(2), 'node').label;
  const split = (k: string): [string, string] => {
    const i = k.indexOf(SEP);
    return [k.slice(0, i), k.slice(i + 1)];
  };

  // 5b. Flow both ways between two groups is a cycle. Majority wins: the smaller direction
  // leaves the ordering whole and is drawn as backflow — a tier always keeps one column.
  // A tie keeps the first-seen group upstream.
  const gdropped = new Set<string>();
  for (const [k, v] of gflow) {
    const [a, b] = split(k);
    const rk = `${b}${SEP}${a}`;
    const rv = gflow.get(rk);
    if (rv === undefined || gdropped.has(k) || gdropped.has(rk)) {
      continue;
    }
    let loser = k;
    if (v > rv || (v === rv && mustGet(groupIdx, a, 'group') < mustGet(groupIdx, b, 'group'))) {
      loser = rk;
    }
    gdropped.add(loser);
    const [la, lb] = split(loser);
    warnings.push(
      `${groupLabel(la)} → ${groupLabel(lb)} runs against the majority direction (${formatBitsPerSec(gflow.get(loser) ?? 0)} vs ${formatBitsPerSec(gflow.get(`${lb}${SEP}${la}`) ?? 0)}); drawn as backflow, not used for column order.`
    );
  }

  // 5c. The pairwise vote leaves cycles through three or more groups. Repeatedly remove the
  // smallest group edge inside a strongly connected component; at least one per round.
  const sccOf = (live: string[]): { id: Map<string, number>; size: number[] } => {
    const adj = new Map<string, string[]>();
    const radj = new Map<string, string[]>();
    for (const g of groupIds) {
      adj.set(g, []);
      radj.set(g, []);
    }
    for (const k of live) {
      const [a, b] = split(k);
      mustGet(adj, a, 'group').push(b);
      mustGet(radj, b, 'group').push(a);
    }
    const seen = new Set<string>();
    const post: string[] = [];
    const dfs = (g: string): void => {
      if (seen.has(g)) {
        return;
      }
      seen.add(g);
      for (const next of mustGet(adj, g, 'group')) {
        dfs(next);
      }
      post.push(g);
    };
    groupIds.forEach(dfs);
    const id = new Map<string, number>();
    const size: number[] = [];
    for (let i = post.length - 1; i >= 0; i -= 1) {
      const start = post[i];
      if (start === undefined || id.has(start)) {
        continue;
      }
      const cur = size.length;
      size.push(0);
      const stack = [start];
      while (stack.length > 0) {
        const v = stack.pop();
        if (v === undefined || id.has(v)) {
          continue;
        }
        id.set(v, cur);
        size[cur] = (size[cur] ?? 0) + 1;
        for (const w of mustGet(radj, v, 'group')) {
          if (!id.has(w)) {
            stack.push(w);
          }
        }
      }
    }
    return { id, size };
  };
  for (;;) {
    const live = [...gflow.keys()].filter((k) => !gdropped.has(k));
    const scc = sccOf(live);
    let victim: string | null = null;
    for (const k of live) {
      const [a, b] = split(k);
      const sa = scc.id.get(a);
      const sb = scc.id.get(b);
      if (sa !== undefined && sa === sb && (scc.size[sa] ?? 0) > 1) {
        if (victim === null || (gflow.get(k) ?? 0) < (gflow.get(victim) ?? 0)) {
          victim = k;
        }
      }
    }
    if (victim === null) {
      break;
    }
    gdropped.add(victim);
    const [va, vb] = split(victim);
    warnings.push(
      `Groups still form a cycle; the smallest edge ${groupLabel(va)} → ${groupLabel(vb)} (${formatBitsPerSec(gflow.get(victim) ?? 0)}) is drawn as backflow to break it.`
    );
  }

  // 5d. Mark the edges that left the ordering, then longest path over the group DAG.
  for (const e of edges) {
    const ga = gOf(e.fromId);
    const gb = gOf(e.toId);
    e.dropped = ga !== gb && gdropped.has(`${ga}${SEP}${gb}`);
  }
  const gcol = new Map<string, number>();
  for (const g of groupIds) {
    gcol.set(g, 0);
  }
  let pass = 0;
  for (; pass < groupIds.length + 2; pass += 1) {
    let moved = false;
    for (const e of edges) {
      if (e.dropped) {
        continue;
      }
      const ga = gOf(e.fromId);
      const gb = gOf(e.toId);
      if (ga === gb) {
        continue;
      }
      const next = mustGet(gcol, ga, 'group') + 1;
      if (mustGet(gcol, gb, 'group') < next) {
        gcol.set(gb, next);
        moved = true;
      }
    }
    if (!moved) {
      break;
    }
  }
  if (pass >= groupIds.length + 2) {
    warnings.push('The topology seems to contain a cycle; column order may be inaccurate.');
  }
  for (const id of ids) {
    mustGet(nodes, id, 'node').col = mustGet(gcol, gOf(id), 'group');
  }
}

/**
 * 5g. Topological sub-order inside a tier group — for layout only: a node fed only from
 * its own column has no cross-column parent to align to, and the layout uses subOrder
 * to keep producers above consumers so arcs do not cross.
 */
function assignTierSubOrder(ctx: BuildCtx, ids: readonly string[]): void {
  const { nodes, edges } = ctx;
  for (const id of ids) {
    mustGet(nodes, id, 'node').subOrder = 0;
  }
  const tierOf = new Map<string, string>();
  const tierMembers = new Map<string, string[]>();
  for (const id of ids) {
    const t = mustGet(nodes, id, 'node').tier;
    if (t !== null) {
      tierOf.set(id, t);
      const list = tierMembers.get(t) ?? [];
      list.push(id);
      tierMembers.set(t, list);
    }
  }
  // The edges inside each tier, bucketed in one pass (edge order kept, so adjacency is stable).
  const tierEdges = new Map<string, TraceEdge[]>();
  for (const e of edges) {
    const t = tierOf.get(e.fromId);
    if (t !== undefined && tierOf.get(e.toId) === t) {
      const list = tierEdges.get(t) ?? [];
      list.push(e);
      tierEdges.set(t, list);
    }
  }
  for (const [tier, members] of tierMembers) {
    if (members.length < 2) {
      continue;
    }
    const indeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const id of members) {
      indeg.set(id, 0);
      adj.set(id, []);
    }
    for (const e of tierEdges.get(tier) ?? []) {
      mustGet(adj, e.fromId, 'member').push(e.toId);
      indeg.set(e.toId, (indeg.get(e.toId) ?? 0) + 1);
    }
    const queue = members.filter((id) => indeg.get(id) === 0);
    let seq = 0;
    const popped = new Set<string>();
    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur === undefined) {
        break;
      }
      popped.add(cur);
      mustGet(nodes, cur, 'node').subOrder = seq;
      seq += 1;
      for (const m of mustGet(adj, cur, 'member')) {
        const left = (indeg.get(m) ?? 0) - 1;
        indeg.set(m, left);
        if (left === 0) {
          queue.push(m);
        }
      }
    }
    // A cycle inside a tier never empties the queue; the rest keep discovery order.
    for (const id of members) {
      if (!popped.has(id)) {
        mustGet(nodes, id, 'node').subOrder = seq;
        seq += 1;
      }
    }
  }
}
