## Why

The backend has withdrawn `GET /v1/edge-types` and dropped support for the `?edge_type=` query parameter on `/v1/graph`. The backend ignores unknown query parameters rather than rejecting them (this is how the already-withdrawn `name`, `root`, `depth` and `direction` parameters degrade), so a front end that keeps the Edge type control would populate it from an endpoint that no longer exists, accept a selection, write it to the URL, send it — and draw exactly the same graph. That is a control that silently moves nothing, which is worse than the 400 the parameter used to produce for an unregistered value.

The whole dimension therefore goes, not just its option source. Populating the control from a list hard-coded in the front end is not an alternative: with the parameter unsupported, any value it offered would be equally inert.

## What Changes

- **BREAKING (runtime config)**: `endpoints.edgeTypes` is removed from the runtime configuration schema. A deployment that still carries the key keeps loading — an unrecognised endpoint key is reported through the existing unknown-key warning path, not as a configuration error — but the key no longer does anything.
- **BREAKING (URL contract)**: the `edge_type` query parameter is removed from the graph page's URL scope. It is no longer parsed on mount and no longer written. An existing bookmark or shared link carrying it degrades gracefully under the established rule that unknown parameters are ignored and stripped on the next write.
- The filter bar loses its **Edge type** control. Four list dimensions remain: `cluster`, `az`, `env`, `namespace`, plus the Projection control.
- The graph request no longer carries `edge_type` under any circumstances.
- The edge-type catalogue client (the module that fetches and parses `{ "edge_types": [...] }`) is deleted, along with the `FilterOptions.edgeType` option list it fed.
- The dropdown component's `allowCustom: false` mode is **retained**: Projection and the Sankey's root-kind selector still use it. Only the claim that `edge_type` is the sole list dimension refusing custom values goes away.
- **Explicitly unchanged**: every client-side use of an edge's `data.type`. Edge bodies still carry it, so edge colouring, the edge legend and its per-type visibility toggles, the pod-parent mode transform, the Sankey tier derivation and the ingress-node collection all keep working exactly as they do today. This change touches the server-side narrowing dimension only.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `graph-filters`: the Edge type dimension is removed — its option source, its dropdown, its custom-value exception, its URL parameter and its place in the Clear behaviour. Two requirements are restated under new names because the delta format cannot drop a scenario from a requirement it keeps: "Interaction contract of the dropdown control (Grafana style)" becomes "Interaction contract of the dropdown control", and "Option sources" becomes "Filter option source" (the filter bar now has exactly one).
- `graph-data-source`: `edge_type` is removed from the `/v1/graph` request contract, and from the list of parameters the `/v1/storage-graph` request must not send (there is no longer such a parameter to withhold).
- `runtime-config`: `endpoints.edgeTypes` is removed from the endpoint table and from the absent-endpoint behaviour rules.
- `container-deployment`: `endpoints.edgeTypes` is removed from the keys the example ConfigMap must carry.
- `storage-flow-sankey`: one scenario's expected query string names `edge_type` among the parameters the Sankey does not send; that reference is dropped.

## Impact

**Source** — `src/shared/types/graphFilters.ts` (`GraphFilters.edgeType`, `DEFAULT_GRAPH_FILTERS`, the `ListDimension` alias, which collapses into `IdentityDimension`), `src/features/graph-data/graphRequestUrl.ts`, `src/features/graph-filters/graphUrlScope.ts`, `src/features/graph-filters/FilterBar.tsx`, `src/features/graph-filters/useFilterOptions.ts`, `src/features/graph-filters/edgeTypes.ts` (deleted) and its re-export in `src/features/graph-filters/index.ts`, `src/features/app-shell/GraphPage.tsx`, `src/features/app-shell/SankeyPage.tsx`, `src/features/runtime-config/types.ts`, `src/features/runtime-config/validate.ts`, plus a comment in `src/features/graph-data/storageGraphRequestUrl.ts`.

**Tests** — `src/features/graph-filters/edgeTypes.test.ts` is deleted; `graphRequestUrl.test.ts`, `useFilterOptions.test.ts`, `validate.test.ts`, `FilterBar.test.tsx`, `ScopeSelect.test.tsx` and `storageGraphRequestUrl.test.ts` are updated. The drawing-side tests that exercise `data.edgeType` are not touched.

**Deployment** — `deploy/configmap.yaml` and `deploy/README.md`.

**Release order** — a request that omits `edge_type` is valid against both the old and the new backend, so this change is safe to ship before, or together with, the backend removal. Shipping the backend first opens a window in which the control is silently inert.

**Out of scope** — the `kube-state-graph-demo` integration repository (its `charts/kube-state-graph-frontend/values.yaml`, `scripts/verify.sh` and `CLAUDE.md`) is a separate repository and is not changed here. Its verify step reads the config key defensively and skips when the key is absent, so it does not fail once the key is dropped from a deployment.
