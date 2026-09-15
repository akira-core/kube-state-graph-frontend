import type cytoscape from 'cytoscape';

import { recKind } from '../../graph-data';

import { isNonEmptyString } from './util';

export interface NodeIndex {
  get(id: string): cytoscape.NodeDataDefinition | null;
  /** Nearest ancestor of the given wire kind along `parent`; null when the chain ends or loops. */
  ancestorOf(id: string, kind: string): cytoscape.NodeDataDefinition | null;
  appOf(id: string): cytoscape.NodeDataDefinition | null;
  /** A pod's namespace: application's namespace ancestor, then its own, then `labels.namespace`. */
  nsOfPod(id: string): string | null;
  /** Display name (normalize folded `name ?? id` into `label`). */
  labelOf(d: cytoscape.NodeDataDefinition): string;
}

export function indexNodes(elements: readonly cytoscape.ElementDefinition[]): NodeIndex {
  const byId = new Map<string, cytoscape.NodeDataDefinition>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (typeof d.id === 'string') {
      byId.set(d.id, d);
    }
  }
  const get = (id: string): cytoscape.NodeDataDefinition | null => byId.get(id) ?? null;
  const labelOf = (d: cytoscape.NodeDataDefinition): string => {
    if (isNonEmptyString(d.label)) {
      return d.label;
    }
    return typeof d.id === 'string' ? d.id : '';
  };
  const ancestorOf = (id: string, kind: string): cytoscape.NodeDataDefinition | null => {
    const seen = new Set<string>();
    let cur = get(id);
    while (cur !== null && isNonEmptyString(cur.parent) && !seen.has(cur.parent)) {
      seen.add(cur.parent);
      const p = get(cur.parent);
      if (p === null) {
        return null;
      }
      if (recKind(p) === kind) {
        return p;
      }
      cur = p;
    }
    return null;
  };
  const appOf = (id: string): cytoscape.NodeDataDefinition | null => ancestorOf(id, 'application');
  const nsOfPod = (id: string): string | null => {
    const app = appOf(id);
    let ns = app !== null && typeof app.id === 'string' ? ancestorOf(app.id, 'namespace') : null;
    if (ns === null) {
      ns = ancestorOf(id, 'namespace');
    }
    if (ns !== null) {
      return labelOf(ns);
    }
    const d = get(id);
    return d !== null && isNonEmptyString(d.labels?.namespace) ? d.labels.namespace : null;
  };
  return { get, ancestorOf, appOf, nsOfPod, labelOf };
}
