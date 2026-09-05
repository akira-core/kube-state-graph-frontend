import type cytoscape from 'cytoscape';

// Minimal read view over a cytoscape ElementDefinition's data. The node/edge data
// union does not expose source/target/kind together, so we narrow at this boundary
// (the values originate from the normalize anti-corruption layer upstream).
interface ElementDataView {
  id?: string;
  kind?: string;
  labels?: Record<string, string>;
  source?: string;
  target?: string;
}

const SWITCH_KIND = 'switch';

function isNodeElement(element: cytoscape.ElementDefinition, data: ElementDataView): boolean {
  if (element.group === 'nodes') {
    return true;
  }
  if (element.group === 'edges') {
    return false;
  }
  // group omitted: infer — an edge always carries source + target.
  return data.source === undefined && data.target === undefined;
}

// Parse a `labels.level` string into a non-negative integer, or undefined when the
// value is absent, blank, non-numeric, or negative.
function parseLevel(raw: string | undefined): number | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }
  return undefined;
}

/**
 * Read a network level for every `switch` node from its `labels.level`.
 *
 * - `labels.level` is parsed as a base-10 integer; only an integer >= 0 is kept.
 * - A switch with no valid level (absent / blank / non-numeric / negative) is
 *   excluded from the result — it is left for the force layout to place.
 * - Non-`switch` nodes are ignored even if they carry a `labels.level`.
 * - The level is NOT derived from graph structure (no edge traversal).
 *
 * Pure and deterministic for identical input.
 */
export function readSwitchLevels(elements: readonly cytoscape.ElementDefinition[]): Map<string, number> {
  const levelById = new Map<string, number>();
  for (const element of elements) {
    const data = element.data as ElementDataView;
    if (!isNodeElement(element, data) || typeof data.id !== 'string' || data.kind !== SWITCH_KIND) {
      continue;
    }
    const level = parseLevel(data.labels?.level);
    if (level !== undefined) {
      levelById.set(data.id, level);
    }
  }
  return levelById;
}
