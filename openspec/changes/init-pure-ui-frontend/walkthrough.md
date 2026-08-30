# Spec walkthrough — `init-pure-ui-frontend`

Each capability below is mapped to the test or observable behavior that covers it. Gaps that were not cluster/registry-verifiable are listed at the end.

## app-shell

| Requirement                                                     | Evidence                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Config gate before any view / backend fetch                     | `src/app/App.test.tsx` (hanging config fetch; 404 error screen)            |
| Retry re-fetches config                                         | `src/app/App.test.tsx` Retry                                               |
| `/` replace → `/graph`                                          | `src/features/app-shell/AppShell.test.tsx`                                 |
| Trailing slash `/graph/`                                        | `AppShell.test.tsx`; ViewHost `pathKey`                                    |
| `/sankey` + `aria-current`                                      | `AppShell.test.tsx`; e2e `tests/demo.spec.ts`                              |
| Unknown path + back link                                        | `AppShell.test.tsx`                                                        |
| `/sankey` reload                                                | e2e `sankey deep link reloads`                                             |
| Demo badge                                                      | `AppShell.test.tsx`; e2e demo-badge                                        |
| Theme user → config → system                                    | `src/features/theme/useThemeController.test.tsx`                           |
| Loading screen uses ThemeProvider                               | `src/app/App.tsx`                                                          |
| View time range default 24h, persist, resolve-at-read, absolute | `useViewTimeRange.test.ts`, `NavBar.test.tsx`                              |
| Shared loader: demo, in-flight, stale-on-fail                   | `useGraphLoader.test.ts`                                                   |
| Keep-alive views                                                | `AppShell.tsx` `graphMounted` / `sankeyMounted` + `hidden`; e2e round-trip |
| Landmarks                                                       | `NavBar.test.tsx` navigation; `AppShell.tsx` `<main>`                      |

## runtime-config

| Requirement                                       | Evidence                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| Types                                             | `src/features/runtime-config/types.ts` + `npm run typecheck`      |
| Validator (no coercion, URL forms, first error)   | `validate.test.ts`                                                |
| Load `<base>/config.json`                         | `load.test.ts`                                                    |
| Error screen, never silent demo                   | `ConfigErrorScreen.test.tsx`, `App.test.tsx`                      |
| `dev/config.json` + local override + `/api` proxy | `vite.config.ts`, `dev/config.json`; `dist/` has no `config.json` |

## graph-data-source

| Requirement                                                        | Evidence                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------- |
| normalize (alerts, controller, metrics, NetApp, PVC, ready_status) | `normalize.test.ts`                                      |
| wrapNodeGroup / wrapSwitchFabric                                   | `wrapNodeGroup.test.ts`, `wrapSwitchFabric.test.ts`      |
| Demo vs fetch                                                      | `useGraphLoader.test.ts`; e2e `tests/fetch-path.spec.ts` |
| Fixture dual storage edges                                         | `showcaseGraph.test.ts`; `fixture:check`                 |

## graph-view

| Requirement                                                  | Evidence                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canvas + stylesheet tokens                                   | `getStylesheet.test.ts`, e2e `graph-canvas`                                                                                                                                                                                                                                |
| Layout radios                                                | `GraphView.tsx`; `useGraphLayout.test.ts`                                                                                                                                                                                                                                  |
| Kind / edge-type filter + baseline orphan cascade            | `computeVisibility.test.ts` (leaf kept when the baseline connects it, leaf dropped when it never was, both coexisting, container collapsed when its children are filtered, container not read as a leaf, view-transform-dropped `pod-to-node`), `useElementFilter.test.ts` |
| Folded edge-legend row surfaced without its anchor type      | `EdgeLegend.test.tsx` (svc-only and `node-to-switch`-only graphs, group toggle)                                                                                                                                                                                            |
| Resize without fit on app-internal layout change             | `useGraphResize.test.ts` (window resize fits; legend collapse does not)                                                                                                                                                                                                    |
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

| Requirement                       | Evidence                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| Derive chain + weights + absent≠0 | `deriveSankey.test.ts`                                                                |
| Both dual links                   | `SankeyView.test.tsx`                                                                 |
| Cluster selector + `dr` empty     | `SankeyView.test.tsx` `sankey-empty-cluster`                                          |
| Tooltips kind/label               | `SankeyView.test.tsx`                                                                 |
| Cross-view locate                 | e2e click `sankey-node-aggr1` → `/graph`; filter-hidden banner `locate-filter-hidden` |

## container-deployment

| Requirement                                                                                               | Evidence                                                  |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Multi-stage image, UID 101, 8080                                                                          | `Dockerfile`; `docker build` succeeded                    |
| `/` `index.html` `no-cache`; `/assets` immutable; `/config.json` `no-store`; `/healthz` 200; SPA fallback | curled `kube-state-graph-frontend:local` on :18081        |
| `/api/*` 404 unless `KSG_API_PROXY_TARGET`                                                                | curl 404; proxy forwarded `/api/hello` → `proxied:/hello` |
| k8s manifests (probes, ConfigMap dir mount, restricted)                                                   | `deploy/*.yaml` — **not** applied to a cluster            |

## dev-environment

| Requirement                              | Evidence                                                     |
| ---------------------------------------- | ------------------------------------------------------------ |
| Vite/TS/Vitest/Playwright/hooks/Makefile | `package.json`, `.githooks/`, `Makefile`                     |
| e2e in CI                                | `.github/workflows/ci.yml`                                   |
| Image workflow tags                      | `.github/workflows/image.yml` — **not** pushed to a registry |

## Not verified in this apply

- **15.4 / 15.5** — `kubectl apply` / Ready pod / demo ConfigMap on a live cluster
- **16.4** — image tags appearing in a registry after a `main` push
- GitHub Actions run on a real PR (workflow matches the local chain that passed)
