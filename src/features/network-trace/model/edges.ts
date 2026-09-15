import { recKind } from '../../graph-data';

import { clientsOf, wireFacts } from './classify';
import type { AggEdge, BuildCtx } from './ctx';
import { APP_ID_PREFIX, NS_ID_PREFIX, OWNER_ID_PREFIX } from './ids';
import { makeEdge, makeNode, type TraceEdge, type TraceNode } from './types';
import { SEP } from './util';

interface OwnerGroup {
  owner: string | null;
  count: number;
}

/**
 * Step 2: build the edges in first-appearance order, always in packet direction (left →
 * right). Leaves, the namespace / application end cards and the owner cards are created
 * lazily here — by the first surviving edge, so a threshold never leaves an orphan card.
 */
export function buildEdges(ctx: BuildCtx): void {
  const { direction, nodes, order, edges, index, minBps, dropIn, dropOut } = ctx;
  const nsBag = new Map<string, TraceNode>();
  let nsSeq = 0;
  const appBag = new Map<string, TraceNode>();
  let appSeq = 0;
  const podLinks = new Map<string, TraceEdge[]>();
  const ownerBag = new Map<string, TraceNode>();
  let ownerSeq = 0;
  const ownerLinks = new Map<string, TraceEdge[]>();

  // Every leaf pod gets a derived edge to its namespace (through its application card
  // when it has an application ancestor); one card per namespace / application across the
  // whole drawing — per cluster, so a namespace name shared by two clusters is two cards —
  // so "how much does this namespace receive" is read off the chart. The values are the
  // pod's own measurements regrouped — never an estimate.
  const nsFor = (name: string, cluster: string | null): TraceNode => {
    const key = `${cluster ?? ''}${SEP}${name}`;
    let ns = nsBag.get(key);
    if (ns === undefined) {
      nsSeq += 1;
      ns = makeNode({
        id: `${NS_ID_PREFIX}${String(nsSeq)}`,
        kind: 'leaf',
        role: 'ns',
        label: name,
        namespace: name,
        cluster,
      });
      nsBag.set(key, ns);
      nodes.set(ns.id, ns);
      order.push(ns.id);
    }
    return ns;
  };
  // One application name can exist in two namespaces (or clusters): the key carries both.
  const appFor = (name: string, ns: string | null, cluster: string | null): TraceNode => {
    const key = `${cluster ?? ''}${SEP}${ns ?? ''}${SEP}${name}`;
    let app = appBag.get(key);
    if (app === undefined) {
      appSeq += 1;
      app = makeNode({
        id: `${APP_ID_PREFIX}${String(appSeq)}`,
        kind: 'leaf',
        role: 'app',
        label: name,
        namespace: ns,
        cluster,
      });
      appBag.set(key, app);
      nodes.set(app.id, app);
      order.push(app.id);
    }
    return app;
  };
  // Derived edges carry the reference panel's column-pair tiers so a tooltip can say
  // they are not a backend hop.
  const derived = (a: TraceNode, b: TraceNode, ns: string | null, tier: string | null = null): TraceEdge =>
    makeEdge(a, b, '', '', 0, { namespace: ns, derived: true, tier });

  // The first time a pod is seen its whole pod → app → ns chain is created, right after
  // the hop → pod edge (edge order = z-order); later edges into the same pod only add.
  const linkPod = (pod: TraceNode, bps: number): void => {
    let links = podLinks.get(pod.id);
    if (links === undefined) {
      links = [];
      podLinks.set(pod.id, links);
      const appD = index.appOf(pod.id);
      const nsName = pod.namespace;
      if (appD !== null) {
        const app = appFor(index.labelOf(appD), nsName, pod.cluster);
        const e1 =
          direction === 'destination'
            ? derived(pod, app, nsName, 'pod-application')
            : derived(app, pod, nsName, 'pod-application');
        edges.push(e1);
        links.push(e1);
        if (nsName !== null) {
          const ns = nsFor(nsName, pod.cluster);
          if (app.nsEdge === null) {
            app.nsEdge =
              direction === 'destination'
                ? derived(app, ns, nsName, 'application-namespace')
                : derived(ns, app, nsName, 'application-namespace');
            edges.push(app.nsEdge);
          }
          links.push(app.nsEdge);
        }
      } else if (nsName !== null) {
        const ns = nsFor(nsName, pod.cluster);
        const e2 =
          direction === 'destination'
            ? derived(pod, ns, nsName, 'pod-namespace')
            : derived(ns, pod, nsName, 'pod-namespace');
        edges.push(e2);
        links.push(e2);
      }
    }
    for (const e of links) {
      e.bps += bps;
    }
  };

  // Owner aggregation: a port leaf whose clients resolve to an owner grows an owner card
  // to its right; same owner = one card across the drawing. The amount only travels when
  // the whole port belongs to that one owner — the backend measures the port, not each
  // client, so splitting it would be an estimate. A shared port still links to every
  // named owner, but with an ownership line that carries no amount. Clients with no
  // owner get no card and no line, yet still count as a group (the port is then mixed).
  const ownerFor = (name: string): TraceNode => {
    let o = ownerBag.get(name);
    if (o === undefined) {
      ownerSeq += 1;
      o = makeNode({
        id: `${OWNER_ID_PREFIX}${String(ownerSeq)}`,
        kind: 'leaf',
        role: 'owner',
        label: name,
        owner: name,
      });
      ownerBag.set(name, o);
      nodes.set(o.id, o);
      order.push(o.id);
    }
    return o;
  };
  const ownerGroups = (clients: ReadonlyArray<{ owner: string | null }>): OwnerGroup[] => {
    const seen = new Map<string, OwnerGroup>();
    let unknown: OwnerGroup | null = null;
    const out: OwnerGroup[] = [];
    for (const c of clients) {
      let g: OwnerGroup;
      if (c.owner === null) {
        if (unknown === null) {
          unknown = { owner: null, count: 0 };
        }
        g = unknown;
      } else {
        const existing = seen.get(c.owner);
        g = existing ?? { owner: c.owner, count: 0 };
        seen.set(c.owner, g);
      }
      if (g.count === 0) {
        out.push(g);
      }
      g.count += 1;
    }
    return out;
  };
  const ownEdge = (a: TraceNode, b: TraceNode, metered: boolean): TraceEdge =>
    makeEdge(a, b, '', '', 0, { derived: true, owns: !metered });
  const linkOwner = (leaf: TraceNode, bps: number): void => {
    let links = ownerLinks.get(leaf.id);
    if (links === undefined) {
      const groups = ownerGroups(leaf.clients ?? []);
      const named = groups.filter((g) => g.owner !== null);
      if (named.length === 0) {
        return; // no owner known at all: the leaf stays a plain trace stop
      }
      // Metered only when the port has ONE group in total — a port that also carries
      // machines of unknown owner is mixed, and its amount is not this owner's alone.
      const metered = groups.length === 1;
      links = [];
      ownerLinks.set(leaf.id, links);
      for (const g of named) {
        const o = ownerFor(g.owner ?? '');
        o.clientCount += g.count;
        o.portCount += 1;
        if (metered) {
          o.meteredPorts += 1;
        }
        const e = direction === 'destination' ? ownEdge(leaf, o, metered) : ownEdge(o, leaf, metered);
        edges.push(e);
        if (metered) {
          links.push(e);
        }
      }
      leaf.ownerLinked = true;
    }
    for (const e of links) {
      e.bps += bps;
    }
  };

  const ensureLeaf = (id: string, a: AggEdge, side: 'from' | 'to'): TraceNode => {
    const existing = nodes.get(id);
    const own = side === 'from' ? a.sif : a.tif;
    const local = side === 'from' ? a.tif : a.sif;
    if (existing !== undefined) {
      if (existing.kind === 'leaf') {
        // Several edges into one leaf card: an inconsistent iface is left blank, not guessed.
        if (existing.iface !== own) {
          existing.iface = '';
        }
        if (existing.localIface !== local) {
          existing.localIface = '';
        }
      }
      return existing;
    }
    const d = index.get(id);
    if (d === null) {
      throw new Error(`network-trace: edge endpoint "${id}" is not a node`);
    }
    const kind = recKind(d);
    const clients = clientsOf(d);
    const wireLabel = index.labelOf(d);
    const named = wireLabel !== id;
    // A neighbourless port's id is usually the synthetic `switch:iface`. With exactly one
    // client, the client's hostname (or IP) is the card's name, so the ribbon tooltip
    // reads `sw → 10.42.7.32`; the synthetic id stays in the card tooltip.
    let label = id;
    if (named) {
      label = wireLabel;
    } else if (clients !== null && clients.length === 1) {
      label = clients[0]?.hostname ?? clients[0]?.ip ?? id;
    }
    const n = makeNode({
      id,
      kind: 'leaf',
      role: kind === 'pod' ? 'pod' : 'leaf',
      type: kind,
      label,
      named,
      iface: own,
      localIface: local,
      ...wireFacts(index, d, id, kind),
    });
    nodes.set(id, n);
    order.push(id);
    return n;
  };
  const isHop = (id: string): boolean => nodes.get(id)?.kind === 'node';

  for (const a of ctx.agg.values()) {
    // Below the threshold: no edge and no leaf (filter first, then build, so no orphan
    // card survives). The amount is charged to the hop end and folded into its residual
    // in step 6.
    if (minBps > 0 && !(a.bps > minBps)) {
      ctx.filteredCount += 1;
      ctx.filteredBps += a.bps;
      if (isHop(a.src)) {
        dropOut.set(a.src, (dropOut.get(a.src) ?? 0) + a.bps);
      }
      if (isHop(a.tgt)) {
        dropIn.set(a.tgt, (dropIn.get(a.tgt) ?? 0) + a.bps);
      }
      continue;
    }
    const from = ensureLeaf(a.src, a, 'from');
    const to = ensureLeaf(a.tgt, a, 'to');
    const e = makeEdge(from, to, a.sif, a.tif, a.bps, { tier: a.tier, attribution: a.attribution });
    const leafEnd = [to, from].find((n) => n.kind === 'leaf');
    e.namespace = leafEnd?.namespace ?? null;

    edges.push(e);
    // The downstream leaf (packet direction for a destination trace, the reverse for a
    // source trace) grows its derived cards: a pod its ns chain, a client leaf its owners.
    const downLeaf = direction === 'destination' ? to : from;
    if (downLeaf.kind === 'leaf' && downLeaf.role === 'pod') {
      linkPod(downLeaf, a.bps);
    }
    if (downLeaf.kind === 'leaf' && downLeaf.role === 'leaf' && downLeaf.clients !== null) {
      linkOwner(downLeaf, a.bps);
    }
  }
}
