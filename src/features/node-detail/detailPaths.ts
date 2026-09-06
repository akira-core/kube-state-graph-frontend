// The two fixed trailing path SEGMENTS the Change Report lookups (fired on node
// selection) append to the resolved detail base (see resolveDetailEndpoint). The base
// already carries the shared prefix — either the explicit `detailEndpoint`
// option, or the datasource proxy mount + the graph query's own directory — so
// the detail endpoints resolve as SIBLINGS of the graph query: a graph query at
// `…/api/v1/graph/service_graph` yields config_changes at
// `…/api/v1/graph/config_changes` and code_changes at `…/api/v1/graph/code_changes`.
// Named once here so useNodeDetailUrls references a single source rather than
// re-typing the literal; the panel-rendering spec pins the same two segments as
// the backend contract (config_changes = application-detail `{url}`, code_changes =
// image-detail `{container:{url}}`). The hook's tests keep the literal resolved
// path in their assertions on purpose — an independent contract guard that a
// wrong value here cannot silently pass.
export const DETAIL_CONFIG_CHANGES_PATH = '/config_changes';
export const DETAIL_CODE_CHANGES_PATH = '/code_changes';
// The per-node Dashboard URL lookup segment (same sibling-of-the-graph-query base
// as the two Change Report endpoints). useNodeDashboardUrl appends this to the
// resolved detail base; the backend returns `{ url }` or `{ urls: [{ label?, url }] }`
// (200 + at least one non-empty url ⇒ available).
export const DETAIL_DASHBOARD_PATH = '/dashboard';
