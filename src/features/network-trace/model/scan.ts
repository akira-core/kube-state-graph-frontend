import type cytoscape from 'cytoscape';

import { recKind } from '../../graph-data';

import { AUTO_TIER, classOf, FLOW_EDGE_TYPES, isPlacementEdge, weightOf, wireFacts } from './classify';
import type { BuildCtx } from './ctx';
import { makeNode, type TraceNode } from './types';
import { isFiniteNumber, isNonEmptyString, SEP } from './util';

/**
 * Step 1a: scan edges — aggregate same-key ribbons, remember who is touched by a flow edge.
 * The direction counts (`contOut` / `contIn`) ignore metrics: "has an edge onward" is a
 * topological fact, not a measured one.
 */
export function scanEdges(ctx: BuildCtx): void {
  const { flowTouch, placementTouch, drawTouch, contOut, contIn, agg } = ctx;
  let unmeasured = 0;
  for (const el of ctx.elements) {
    if (el.group !== 'edges') {
      continue;
    }
    const d = el.data as cytoscape.EdgeDataDefinition;
    if (typeof d.source !== 'string' || typeof d.target !== 'string') {
      continue;
    }
    if (isPlacementEdge(d)) {
      // Placement only, never a ribbon: it identifies the k8s nodes touched by nothing
      // else, and under the `node` layout which pod sits on which node.
      placementTouch.add(d.source);
      placementTouch.add(d.target);
      const pods = ctx.k8sPods.get(d.target) ?? [];
      pods.push(d.source);
      ctx.k8sPods.set(d.target, pods);
      continue;
    }
    if (d.edgeType === undefined || !FLOW_EDGE_TYPES.includes(d.edgeType)) {
      continue;
    }
    flowTouch.add(d.source);
    flowTouch.add(d.target);
    contOut.set(d.source, (contOut.get(d.source) ?? 0) + 1);
    contIn.set(d.target, (contIn.get(d.target) ?? 0) + 1);
    const weight = weightOf(d.metrics);
    if (weight === undefined) {
      unmeasured += 1;
      continue;
    }
    drawTouch.add(d.source);
    drawTouch.add(d.target);
    const lab = d.labels ?? {};
    const sif = isNonEmptyString(lab.source_iface) ? lab.source_iface : '';
    const tif = isNonEmptyString(lab.target_iface) ? lab.target_iface : '';
    const key = [d.source, d.target, sif, tif].join(SEP);
    let a = agg.get(key);
    if (a === undefined) {
      a = {
        src: d.source,
        tgt: d.target,
        sif,
        tif,
        bps: 0,
        tier: isNonEmptyString(lab.tier) ? lab.tier : null,
        attribution: isNonEmptyString(lab.attribution) ? lab.attribution : null,
      };
      agg.set(key, a);
    }
    a.bps += weight;
  }
  if (unmeasured > 0) {
    ctx.warnings.push(
      `${String(unmeasured)} flow ${unmeasured === 1 ? 'edge carries' : 'edges carry'} no usable measurement (no delta_bps); not drawn.`
    );
  }
}

function makeHop(ctx: BuildCtx, d: cytoscape.NodeDataDefinition, id: string): TraceNode {
  const kind = recKind(d);
  const lab = d.labels ?? {};
  // A stated tier wins; a storage kind without one locks to its own column.
  let tier: string | null = null;
  if (isNonEmptyString(lab.tier)) {
    tier = lab.tier;
  } else if (AUTO_TIER.includes(kind)) {
    tier = kind;
  }
  const n = makeNode({
    id,
    label: ctx.index.labelOf(d),
    role: kind,
    kind: 'node',
    tier,
    otherInBps: isFiniteNumber(d.otherInBps) ? d.otherInBps : null,
    otherOutBps: isFiniteNumber(d.otherOutBps) ? d.otherOutBps : null,
    noFlow: !ctx.drawTouch.has(id),
    ...wireFacts(ctx.index, d, id, kind),
  });

  if (n.noFlow && (n.otherInBps !== null || n.otherOutBps !== null)) {
    ctx.warnings.push(
      `${n.label}: no drawable flow edge (no-flow card); its other_in_bps / other_out_bps are not drawn.`
    );
    n.otherInBps = null;
    n.otherOutBps = null;
  }
  return n;
}

/**
 * Step 1b: scan nodes. Groups are skipped; leaves and leaf pods are created lazily by the
 * first surviving edge (so a threshold never leaves an orphan card); every other hop gets
 * a box. Returns an error when nothing at all can be drawn.
 */
export function scanNodes(ctx: BuildCtx): string | null {
  const { nodes, order, flowTouch, placementTouch } = ctx;
  const isProxyPod = (id: string): boolean =>
    ((ctx.direction === 'destination' ? ctx.contOut : ctx.contIn).get(id) ?? 0) > 0;
  for (const el of ctx.elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (typeof d.id !== 'string') {
      continue;
    }
    const kind = recKind(d);
    if (classOf(kind) !== 'hop') {
      continue;
    }
    if (kind === 'pod' && !isProxyPod(d.id)) {
      continue; // a leaf pod: created by its first surviving edge
    }
    // A k8s node touched only by placement edges is the reference panel's Node-layout
    // wrapper: not drawn under `flat`; under `node` it becomes a frame once pods exist.
    if (kind === 'node' && !flowTouch.has(d.id) && placementTouch.has(d.id)) {
      if (ctx.layout === 'node') {
        ctx.k8sRaw.push(d);
      }
      continue;
    }
    const n = makeHop(ctx, d, d.id);
    nodes.set(d.id, n);
    order.push(d.id);
  }
  if (order.length === 0 && ctx.k8sRaw.length === 0) {
    return 'The response has no drawable node.';
  }
  return null;
}
