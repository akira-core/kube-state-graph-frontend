export type DefaultLayout = 'fcose' | 'dagre';

export type ConfigTheme = 'dark' | 'light' | 'system';

export interface RuntimeEndpoints {
  graph?: string;
  /**
   * Backend `GET /v1/storage-graph`. Independent of `graph`: absence disables Sankey
   * fetching only. It is never required, including when `demoMode` is false.
   */
  storageGraph?: string;
  /**
   * Base URL of a Prometheus-compatible HTTP API holding the pod inventory. The filter
   * controls read their options from `<base>/api/v1/label/<name>/values`, which is the
   * only shape the backend can act on: the graph response carries the COMPOSED
   * `<az>-<env>-<cluster>` identity, and sending that back as `?cluster=` matches no
   * series and returns an empty graph with a 200.
   */
  labelValues?: string;
  /**
   * The backend's edge-type catalogue (`/v1/edge-types`). It is served from the same
   * registry that validates `?edge_type=`, so an option read from here is one the
   * backend accepts — an unregistered value is a 400, not a quietly empty graph. Absent
   * means the edge-type control is not offered.
   */
  edgeTypes?: string;
  codeChanges?: string;
  configChanges?: string;
  dashboard?: string;
}

export interface RuntimeConfig {
  endpoints: RuntimeEndpoints;
  demoMode: boolean;
  refreshIntervalSeconds: number;
  defaultLayout: DefaultLayout;
  theme: ConfigTheme;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  endpoints: {},
  demoMode: false,
  refreshIntervalSeconds: 0,
  defaultLayout: 'fcose',
  theme: 'system',
};
