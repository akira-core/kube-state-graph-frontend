# Spec walkthrough — `init-pure-ui-frontend`

Each capability below is mapped to the test or observable behavior that covers it. Gaps that were not cluster/registry-verifiable are listed at the end.

## app-shell

| Requirement                                                     | Evidence                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Config gate before any view / backend fetch                     | `src/app/App.test.tsx` (hanging config fetch; 404 error screen)                                         |
| Retry re-fetches config                                         | `src/app/App.test.tsx` Retry                                                                            |
| `/` replace → `/graph`                                          | `src/features/app-shell/AppShell.test.tsx`                                                              |
| Trailing slash `/graph/`                                        | `AppShell.test.tsx`; ViewHost `pathKey`                                                                 |
| `/sankey` + `aria-current`                                      | `AppShell.test.tsx`; e2e `tests/demo.spec.ts`                                                           |
| Unknown path + back link                                        | `AppShell.test.tsx`                                                                                     |
| `/sankey` reload                                                | e2e `sankey deep link reloads`                                                                          |
| Demo badge                                                      | `AppShell.test.tsx`; e2e demo-badge                                                                     |
| Theme user → config → system                                    | `src/features/theme/useThemeController.test.tsx`                                                        |
| Loading screen uses ThemeProvider                               | `src/app/App.tsx`                                                                                       |
| View time range default 24h, persist, resolve-at-read, absolute | `useViewTimeRange.test.ts`, `NavBar.test.tsx`                                                           |
| Shared loader: demo, in-flight, stale-on-fail                   | `useGraphLoader.test.ts`                                                                                |
| Two independent loaders; storage-graph lazy                     | `AppShell.test.tsx` “two data sources”; `useGraphLoader` `enabled`                                      |
| Reload / auto-refresh only the current view                     | `AppShell.test.tsx` reload; `NavBar` `reloadDisabled`                                                   |
| Time range refetches loaded sources only                        | `AppShell.test.tsx` time-range change                                                                   |
| Keep-alive views                                                | `AppShell.tsx` `graphMounted` / `sankeyMounted` + `hidden`; e2e round-trip                              |
| Landmarks                                                       | `NavBar.test.tsx` navigation; `AppShell.tsx` `<main>`                                                   |
| Routes relative to the app base URL                             | `AppShell.test.tsx` (`BASE_URL=/ksg/`: `/ksg/sankey` renders Sankey, `/ksg/` redirects to `/ksg/graph`) |

## runtime-config

| Requirement                                       | Evidence                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| Types                                             | `src/features/runtime-config/types.ts` + `npm run typecheck`      |
| Validator (no coercion, URL forms, first error)   | `validate.test.ts`                                                |
| `endpoints.storageGraph` optional, empty = absent | `validate.test.ts` storageGraph cases                             |
| Load `<base>/config.json`                         | `load.test.ts`                                                    |
| Error screen, never silent demo                   | `ConfigErrorScreen.test.tsx`, `App.test.tsx`                      |
| `dev/config.json` + local override + `/api` proxy | `vite.config.ts`, `dev/config.json`; `dist/` has no `config.json` |

## graph-data-source

| Requirement                                                           | Evidence                                                                                            |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| normalize (alerts, controller, metrics, NetApp, PVC, ready_status)    | `normalize.test.ts`                                                                                 |
| `netapp-svm` + `storage-flow` + hardware/perf                         | `normalize.test.ts` “storage-flow edges and netapp-svm”                                             |
| wrapNodeGroup / wrapSwitchFabric                                      | `wrapNodeGroup.test.ts`, `wrapSwitchFabric.test.ts`                                                 |
| Graph request URL                                                     | `graphRequestUrl.test.ts`                                                                           |
| Storage-graph request URL (no prune/edge_type; pod validation)        | `storageGraphRequestUrl.test.ts`                                                                    |
| Demo vs fetch                                                         | `useGraphLoader.test.ts`; e2e `tests/fetch-path.spec.ts`                                            |
| Two fixtures                                                          | `showcaseGraph.test.ts`, `showcaseStorageGraph.test.ts`; `fixture:check`                            |
| Lazy storage-graph e2e                                                | `tests/storage-graph.spec.ts`                                                                       |
| Query string: `start`/`end`/`prune` always sent, resolved per request | `graphRequestUrl.test.ts`, `useGraphLoader.test.ts`                                                 |
| A same-name key on the configured URL is replaced, not appended       | `fetchJson.test.ts` (`?start=100` + new window → one `start`; `tenant=ops` and `%20` kept verbatim) |

## graph-view

| Requirement                                                  | Evidence                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canvas + stylesheet tokens                                   | `getStylesheet.test.ts`, e2e `graph-canvas`                                                                                                                                                                                                                                |
| Layout radios                                                | `GraphView.tsx`; `useGraphLayout.test.ts`                                                                                                                                                                                                                                  |
| Kind / edge-type filter + baseline orphan cascade            | `computeVisibility.test.ts` (leaf kept when the baseline connects it, leaf dropped when it never was, both coexisting, container collapsed when its children are filtered, container not read as a leaf, view-transform-dropped `pod-to-node`), `useElementFilter.test.ts` |
| Folded edge-legend row surfaced without its anchor type      | `EdgeLegend.test.tsx` (svc-only and `node-to-switch`-only graphs, group toggle)                                                                                                                                                                                            |
| Resize without fit on app-internal layout change             | `useGraphResize.test.ts` (window resize fits; legend collapse does not); `GraphView.test.tsx` (returning to the view announces no window resize, so the viewport survives)                                                                                                 |
| Cross-view locate ends the search                            | `GraphView.test.tsx` (`locateNodeId` clears the query; the in-view result row clears it in `SearchBar`)                                                                                                                                                                    |
| Endpoint URL used verbatim                                   | `useNodeDashboardUrl.test.ts` (trailing slash preserved)                                                                                                                                                                                                                   |
| Double-tap collapse on every non-selectable decorative group | `clusterCollapseToggle.test.ts` (`storage-cluster` expand/collapse, selectable container is a no-op)                                                                                                                                                                       |
| Collapse change re-applies selection ring and fade           | `useGraphFade.test.ts` (re-applies on `collapseToken` alone with a stable `elements` identity)                                                                                                                                                                             |
| Collapse-aware kind legend                                   | `deriveLegendEntries.test.ts`                                                                                                                                                                                                                                              |
| Legend collapse z-index 1000                                 | `GraphView.tsx` `legend-expand`; e2e collapse/expand                                                                                                                                                                                                                       |
| Focus fade                                                   | `useGraphFade.test.ts`                                                                                                                                                                                                                                                     |
| Hover tooltip RED + storage                                  | `HoverTooltip.test.tsx`, `formatEdgeMetrics.test.ts`                                                                                                                                                                                                                       |
| Pinned card                                                  | `buildPinnedTooltip.test.ts`                                                                                                                                                                                                                                               |
| Expand-collapse reconcile                                    | `useExpandCollapse.test.ts`, `reconcileCollapse.test.ts`                                                                                                                                                                                                                   |
| Status on compound parents                                   | `getStylesheet.test.ts`                                                                                                                                                                                                                                                    |

## ingress-visibility-toggle / pod-parent-mode / switch-tier-layout / node-group-compound

| Requirement                    | Evidence                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| Ingress set + toggle + dashed  | `collectIngressNodeIds.test.ts`, `IngressToggle.test.tsx`, `dashedEdges.integration.test.ts` |
| Pod-parent modes + drawn edges | `applyPodParentMode.test.ts`, `drawnEdgeTypesForMode.test.ts`                                |
| Switch levels + constraints    | `readSwitchLevels.test.ts`, `buildSwitchConstraints.test.ts`                                 |
| Node group wrap                | `wrapNodeGroup.test.ts`, `wrapNodeGroup.pipeline.test.ts`                                    |

## graph-search

| Requirement               | Evidence                                                                  |
| ------------------------- | ------------------------------------------------------------------------- |
| Hits / resolve / keyboard | `computeHits.test.ts`, `resolveSearchHits.test.ts`, `keyboardNav.test.ts` |
| Result list rules         | `SearchBar.test.tsx`                                                      |
| Miss fade vs focus fade   | `useGraphFade.test.ts`                                                    |

## node-detail

| Requirement                                   | Evidence                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Open/close without clearing select            | `NodeDetailPanel.test.tsx`                                                                   |
| Alerts table + last-occurred ±300s            | `AlertTable.test.tsx`, `useViewTimeRange.test.ts` `setAround`                                |
| Application / containers links                | `ApplicationTable.test.tsx`, `ContainerTable.test.tsx`                                       |
| Change-history gated by endpoints             | `useNodeDetailUrls.test.ts`                                                                  |
| Dashboard eligibility + params + single/multi | `assembleDashboardParams.test.ts`, `useNodeDashboardUrl.test.ts`, `DashboardButton.test.tsx` |

## storage-flow-sankey

| Requirement                                                             | Evidence                                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Input is storage-graph, not `/v1/graph`                                 | `AppShell.tsx` second loader; `SankeyView.test.tsx`; e2e `tests/storage-graph.spec.ts`                 |
| az / env single-select, auto-preselect, independent of Graph filter bar | `useSankeyQuery.test.ts`, `SankeyControlBar.test.tsx`, `AppShell.test.tsx`                             |
| Roots mixed, invalid pod refused, empty roots legal                     | `useSankeyQuery.test.ts`, `storageGraphRequestUrl.test.ts`                                             |
| cluster / namespace as request params, not client filter                | `storageGraphRequestUrl.test.ts`; no `clusterFilter` in `deriveSankey.ts`                              |
| Six tiers from `labels.tier`, FlexGroup / unscheduled / no-flow root    | `deriveSankey.test.ts`                                                                                 |
| Weights taken from edge metrics; split attribution                      | `deriveSankey.test.ts`; `SankeyView.test.tsx` split estimate                                           |
| Four empty states                                                       | `SankeyView.test.tsx` `sankey-empty-*`                                                                 |
| Tooltips: ontap_cluster, hardware, raw perf, tier, svm-pvc ceiling      | `SankeyView.test.tsx`                                                                                  |
| Locate: filter-hidden vs missing vs SVM not clickable                   | `locateOutcome.test.ts`, `SankeyView.test.tsx` `data-locatable`                                        |
| Hover state cleared when its node disappears                            | `SankeyView.test.tsx` (tooltip closes and fade lifts on refresh; a surviving node keeps its highlight) |
| Box cards, ribbons, column headers, namespace stripes, summary tables   | `layoutSankey.test.ts`, `SankeyView.test.tsx`                                                          |
| Zoom / pan / zoom control bar / focus mode                              | `useZoomPan.test.ts`, `SankeyView.test.tsx`                                                            |

## graph-filters

| Requirement                                        | Evidence                                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Filter bar controls, Clear, hidden in demo mode    | `FilterBar.test.tsx`; `AppShell.tsx` renders it only when `demoMode` is false                             |
| Selection reaches the backend as query parameters  | `graphRequestUrl.test.ts` (repeated keys OR within a name; empty dimensions omitted; `prune` always sent) |
| Identity options from `kube_pod_info` label values | `labelValues.test.ts` (URL shape, Prometheus envelope, `status: error` is a failure not an empty list)    |
| Edge-type options from the backend catalogue       | `edgeTypes.test.ts`                                                                                       |
| A failing source never becomes a missing graph     | `useFilterOptions.test.ts` (per-source `problems`, empty control, load still completes)                   |
| Selection is not persisted                         | `useGraphFilters.ts` — held in component state only; no storage write, no URL write                       |

## container-deployment

| Requirement                                                                                               | Evidence                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Multi-stage image, UID 101, 8080                                                                          | `Dockerfile`; `docker build` succeeded                                                                                                                                                                                                                             |
| `/` `index.html` `no-cache`; `/assets` immutable; `/config.json` `no-store`; `/healthz` 200; SPA fallback | curled `kube-state-graph-frontend:local` on :18081                                                                                                                                                                                                                 |
| `/api/*` 404 unless `KSG_API_PROXY_TARGET`                                                                | curl 404; proxy forwarded `/api/hello` → `proxied:/hello`                                                                                                                                                                                                          |
| `/metrics-api/*` 404 unless `KSG_METRICS_PROXY_TARGET`                                                    | curl 404 with only `KSG_API_PROXY_TARGET` set and with neither; with both set, `/metrics-api/api/v1/label/az/values?match[]=…` reached the metrics upstream as `/api/v1/label/az/values?match[]=…` while `/api/v1/graph` reached the graph upstream as `/v1/graph` |
| k8s manifests (probes, ConfigMap dir mount, restricted)                                                   | `deploy/*.yaml` — **not** applied to a cluster                                                                                                                                                                                                                     |
| ConfigMap includes `storageGraph` / `labelValues` / `edgeTypes`                                           | `deploy/configmap.yaml`; `labelValues` points at `/metrics-api`, not the graph API                                                                                                                                                                                 |
| `/demo/storage-graph.json` served `no-cache`                                                              | `docker/nginx.conf` `location /`                                                                                                                                                                                                                                   |

## dev-environment

| Requirement                              | Evidence                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| Vite/TS/Vitest/Playwright/hooks/Makefile | `package.json`, `.githooks/`, `Makefile`                                |
| Two generated demo payloads              | `dev/buildFixture.mjs`; `public/demo/graph.json` + `storage-graph.json` |
| e2e in CI                                | `.github/workflows/ci.yml`                                              |
| Image workflow tags                      | `.github/workflows/image.yml` — **not** pushed to a registry            |

## Not verified in this apply

- **15.4 / 15.5** — `kubectl apply` / Ready pod / demo ConfigMap on a live cluster
- **16.4** — image tags appearing in a registry after a `main` push
- GitHub Actions run on a real PR (workflow matches the local chain that passed)
