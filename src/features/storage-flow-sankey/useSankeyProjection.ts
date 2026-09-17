import type cytoscape from 'cytoscape';
import { useMemo } from 'react';

import type { StorageGraphRoots } from '../graph-data';

import { resolveClaimAggregates, type SankeyMode, type SankeyWeight } from './deriveSankey';
import { cutTopPods } from './topPods';

export interface SankeyProjectionInputs {
  elements: cytoscape.ElementDefinition[];
  mode: SankeyMode;
  weight?: SankeyWeight;
  topPods: number;
  /** The roots the drawn payload was requested with — the APPLIED ones. */
  roots: StorageGraphRoots;
}

export interface SankeyPodCut {
  shown: number;
  total: number;
}

export interface SankeyProjection {
  /** The body after the Top pods cut; the body itself when nothing was cut. */
  elements: cytoscape.ElementDefinition[];
  /** Present only while the cut hid a pod. */
  podCut: SankeyPodCut | undefined;
  /** The SVM display's `Group` has a claim aggregate to draw from. */
  svmAvailable: boolean;
}

/**
 * `Group` needs the backend's `expose-claim-aggregate`: available only when the body has at
 * least one svm-pvc-fed pvc that names a claim aggregate. Checked directly off the elements
 * (not off a `group`-derived graph) so an unavailable choice never has to be derived once
 * to find out it draws frames with no inbound ribbon.
 */
export function reportsClaimAggregates(elements: readonly cytoscape.ElementDefinition[]): boolean {
  const claimAggregates = resolveClaimAggregates(elements);
  let hasSvmPvc = false;
  for (const el of elements) {
    if (el.group !== 'edges') {
      continue;
    }
    const d = el.data as cytoscape.EdgeDataDefinition;
    if (d.edgeType !== 'storage-flow' || d.labels?.tier !== 'svm-pvc') {
      continue;
    }
    hasSvmPvc = true;
    if (typeof d.target === 'string' && claimAggregates.has(d.target)) {
      return true;
    }
  }
  return !hasSvmPvc;
}

/**
 * The Storage Sankey page's projection of its body, before derivation: the Top pods cut and
 * whether `Group` can be offered. Held by the page, not the view, so the chart and the view
 * controls in the scope bar read one answer. A body requested with a `pod` root is never
 * cut: naming pods and ranking them are mutually exclusive.
 */
export function useSankeyProjection({
  elements,
  mode,
  weight = 'throughput',
  topPods,
  roots,
}: Readonly<SankeyProjectionInputs>): SankeyProjection {
  const podRootPresent = roots.pod.length > 0;
  const cut = useMemo(
    () => (podRootPresent ? { elements, shown: 0, total: 0 } : cutTopPods(elements, mode, topPods, weight)),
    [elements, mode, podRootPresent, topPods, weight]
  );
  const svmAvailable = useMemo(() => reportsClaimAggregates(cut.elements), [cut.elements]);
  const podCut = useMemo(
    () => (cut.shown < cut.total ? { shown: cut.shown, total: cut.total } : undefined),
    [cut.shown, cut.total]
  );
  return { elements: cut.elements, podCut, svmAvailable };
}
