import type cytoscape from 'cytoscape';
import { useMemo } from 'react';

/**
 * Hostname candidates for the trace start: the switches the last response drew, by name
 * and by id when the two differ. There is no inventory endpoint for switches, so until a
 * query has run the control offers only what the operator types.
 */
export function switchHostnames(elements: readonly cytoscape.ElementDefinition[]): string[] {
  const out = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'nodes') {
      continue;
    }
    const d = el.data as cytoscape.NodeDataDefinition;
    if (d.kind !== 'switch') {
      continue;
    }
    if (typeof d.label === 'string' && d.label.length > 0) {
      out.add(d.label);
    }
    if (typeof d.id === 'string' && d.id.length > 0) {
      out.add(d.id);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

export function useHostnameCandidates(elements: readonly cytoscape.ElementDefinition[]): string[] {
  return useMemo(() => switchHostnames(elements), [elements]);
}
