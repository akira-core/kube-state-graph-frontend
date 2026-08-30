import type cytoscape from 'cytoscape';

import type { PodParentMode } from '../../shared/constants/types';

import { deriveContainersBy, type ContainerEntry } from './deriveContainersBy';

export type NodeContainerEntry = ContainerEntry;

export interface ContainerDerivation {
  containerEntries: NodeContainerEntry[]; // name-deduped, cluster-coloured swatches
  containerIds: string[]; // every container id (not name-deduped) for the collapse toggle
  title: string; // 'Nodes' (node mode) | 'Controllers' (controller mode)
  collapseNoun: string; // 'nodes' | 'controllers'
}

// A container in `node` mode is a K8s `node` that boxes pods; in `controller` mode
// it is a synthesized controller (isController) that boxes pods. The collection
// mechanics (childless-leaf skip, name dedupe, cluster tint) live in the shared
// deriveContainersBy core. Whether a container's kind also shows in the icon
// Node-kinds legend is decided separately (deriveLegendKinds, collapse-aware).
export function deriveContainers(
  elements: readonly cytoscape.ElementDefinition[],
  fallbackColor: string,
  mode: PodParentMode
): ContainerDerivation {
  const isContainerKind = (d: cytoscape.NodeDataDefinition): boolean =>
    mode === 'controller' ? d.isController === true : d.kind === 'node';
  return {
    ...deriveContainersBy(elements, fallbackColor, isContainerKind),
    title: mode === 'controller' ? 'Controllers' : 'Nodes',
    collapseNoun: mode === 'controller' ? 'controllers' : 'nodes',
  };
}
