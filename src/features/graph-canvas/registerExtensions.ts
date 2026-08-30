import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import expandCollapse from 'cytoscape-expand-collapse';
import fcose from 'cytoscape-fcose';

let registered = false;

export function registerCytoscapeExtensions(): void {
  if (registered) {
    return;
  }
  cytoscape.use(fcose);
  cytoscape.use(dagre);
  cytoscape.use(expandCollapse);
  registered = true;
}

registerCytoscapeExtensions();
