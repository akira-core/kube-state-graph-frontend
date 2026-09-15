import { locatableKind } from '../../sankey-canvas';

import type { TraceNode, TraceWrapper } from './types';

/**
 * Which cards can be located in Graph view: k8s node frames, hop boxes and leaf pods, by
 * the shared kind rule (an SVM has no `/v1/graph` node). The anchor and the synthesised
 * namespace / application / owner cards have nothing to locate.
 */
export function locatable(n: TraceNode | TraceWrapper): boolean {
  if (n.kind === 'wrapper') {
    return true;
  }
  if (n.kind === 'anchor' || (n.kind === 'leaf' && n.role !== 'pod')) {
    return false;
  }
  return locatableKind(n.role);
}
