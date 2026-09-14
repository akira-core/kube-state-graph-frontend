import type { TraceNode, TraceWrapper } from './types';

/**
 * Which cards can be located in Graph view: k8s node frames, hop boxes (except an SVM,
 * which `/v1/graph` never carries) and leaf pods. Namespace / application / owner cards
 * and the anchor are synthesised — there is nothing to locate.
 */
export function locatable(n: TraceNode | TraceWrapper): boolean {
  if (n.kind === 'wrapper') {
    return true;
  }
  if (n.kind === 'node') {
    return n.role !== 'netapp-svm';
  }
  if (n.kind === 'leaf') {
    return n.role === 'pod';
  }
  return false;
}
