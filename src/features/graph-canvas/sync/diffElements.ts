import type cytoscape from 'cytoscape';

import { isExtensionDataKey } from './extensionDataKeys';

export interface ElementDiff {
  toAdd: cytoscape.ElementDefinition[];
  toRemove: string[];
  toUpdate: cytoscape.ElementDefinition[];
}

function elementId(el: cytoscape.ElementDefinition): string {
  return el.data.id ?? '';
}

// cytoscape's removeData() sets a field to undefined rather than deleting the key,
// so a live element's jsons() can carry `{ alerts: undefined }` tombstones. JSON-wise
// a tombstone IS absence: compare only DEFINED keys, or an element whose key was
// removed would mismatch an incoming definition that omits it on every diff cycle.
// expand-collapse bookkeeping keys are likewise invisible to the diff: the extension
// leaves `collapsedChildren: null` / `size-before-collapse` behind after expand and
// normalize never emits them, so counting them would re-flag every ever-collapsed
// parent on every cycle.
function definedKeys(o: cytoscape.ElementDataDefinition): string[] {
  const rec = o as Record<string, unknown>;
  return Object.keys(rec).filter((k) => rec[k] !== undefined && !isExtensionDataKey(k));
}

// cytoscape treats an edge's source/target as immutable through data(): a patch via
// data() is silently ignored, so a rewired edge must be routed through remove + add.
function endpointsChanged(existing: cytoscape.ElementDefinition, next: cytoscape.ElementDefinition): boolean {
  if (typeof next.data.source !== 'string' && typeof next.data.target !== 'string') {
    return false; // not an edge
  }
  return existing.data.source !== next.data.source || existing.data.target !== next.data.target;
}

function shallowEqualData(a: cytoscape.ElementDataDefinition, b: cytoscape.ElementDataDefinition): boolean {
  const keysA = definedKeys(a);
  const keysB = definedKeys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const k of keysA) {
    const av = (a as Record<string, unknown>)[k];
    const bv = (b as Record<string, unknown>)[k];
    if (av === bv) {
      continue;
    }
    if (typeof av === 'object' && typeof bv === 'object' && av !== null && bv !== null) {
      if (JSON.stringify(av) !== JSON.stringify(bv)) {
        return false;
      }
      continue;
    }
    return false;
  }
  return true;
}

export function diffElements(current: cytoscape.ElementDefinition[], next: cytoscape.ElementDefinition[]): ElementDiff {
  const currentById = new Map<string, cytoscape.ElementDefinition>();
  for (const el of current) {
    const id = elementId(el);
    if (id) {
      currentById.set(id, el);
    }
  }

  const nextIds = new Set<string>();
  const toAdd: cytoscape.ElementDefinition[] = [];
  const toRemove: string[] = [];
  const toUpdate: cytoscape.ElementDefinition[] = [];

  for (const el of next) {
    const id = elementId(el);
    if (!id) {
      continue;
    }
    nextIds.add(id);
    const existing = currentById.get(id);
    if (existing === undefined) {
      toAdd.push(el);
    } else if (endpointsChanged(existing, el)) {
      toRemove.push(id);
      toAdd.push(el);
    } else if (!shallowEqualData(existing.data, el.data)) {
      toUpdate.push(el);
    }
  }

  for (const id of currentById.keys()) {
    if (!nextIds.has(id)) {
      toRemove.push(id);
    }
  }

  return { toAdd, toRemove, toUpdate };
}
