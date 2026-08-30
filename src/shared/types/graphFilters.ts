/**
 * The dimensions `GET /v1/graph` narrows on, as the front door holds them.
 *
 * Field names are the FRONT END's. `buildGraphRequestUrl` is the single place they
 * become the backend's query parameters, which is where `edgeType` becomes `edge_type`
 * — the same one-place rename the wire types use for the response direction.
 *
 * Every identity dimension is a list because the backend ORs repeated values within one
 * parameter name and ANDs across names.
 */
export interface GraphFilters {
  cluster: string[];
  az: string[];
  env: string[];
  namespace: string[];
  edgeType: string[];
  /**
   * The backend's `prune`. True keeps only workload sitting on a connectivity edge; it
   * is the backend's own default and the front door's, so the first thing a viewer sees
   * is the traffic graph. False returns the inventory — every loaded pod with its node,
   * claim and storage chain — which is what the demo harness counts.
   */
  prune: boolean;
}

/** The four dimensions whose options are read from the pod inventory. */
export type IdentityDimension = 'cluster' | 'az' | 'env' | 'namespace';

export const IDENTITY_DIMENSIONS: readonly IdentityDimension[] = ['cluster', 'az', 'env', 'namespace'];

export const DEFAULT_GRAPH_FILTERS: GraphFilters = {
  cluster: [],
  az: [],
  env: [],
  namespace: [],
  edgeType: [],
  prune: true,
};
