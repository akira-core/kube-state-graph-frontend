declare module 'cytoscape-fcose' {
  const fcose: cytoscape.Ext;
  export default fcose;
}

declare module 'cytoscape-dagre' {
  const dagre: cytoscape.Ext;
  export default dagre;
}

// cytoscape-expand-collapse has no @types package. Minimal stub so TypeScript
// accepts the import in registerExtensions.ts. The Core API augmentation
// (expandCollapse method) lives in cytoscape.d.ts alongside existing augmentations.
declare module 'cytoscape-expand-collapse' {
  const expandCollapse: cytoscape.Ext;
  export default expandCollapse;
}
