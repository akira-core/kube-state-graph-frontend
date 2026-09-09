## 1. Remove the filter dimension from the request and URL contracts

- [x] 1.1 Drop `edgeType` from `GraphFilters` and `DEFAULT_GRAPH_FILTERS`, and collapse the `ListDimension` alias into `IdentityDimension` in `src/shared/types/graphFilters.ts`; verify `npm run typecheck` names every remaining consumer (they are fixed in the tasks below).
- [x] 1.2 Remove the `edge_type` parameter from `buildGraphRequestUrl` in `src/features/graph-data/graphRequestUrl.ts`; verify by updating `graphRequestUrl.test.ts` so the "filters sent as repeated parameters" case asserts the request carries no `edge_type` under any selection, and the test passes.
- [x] 1.3 Remove `edge_type` from both directions of `src/features/graph-filters/graphUrlScope.ts` (`parseGraphScope` no longer reads it, `serializeGraphScope` no longer writes it); verify with a test that `/graph?namespace=shop&edge_type=pod-calls-pod` parses to a selection carrying only `namespace`, and that re-serializing that selection emits no `edge_type`.
- [x] 1.4 Update the stale comment in `src/features/graph-data/storageGraphRequestUrl.ts` that lists `edge_type` among the parameters the storage-graph request withholds, and drop `edge_type` from the never-sent key list in `storageGraphRequestUrl.test.ts`; verify the test still passes.

## 2. Remove the control and its option source

- [x] 2.1 Delete `src/features/graph-filters/edgeTypes.ts` and `src/features/graph-filters/edgeTypes.test.ts`, and remove the `fetchEdgeTypes` / `parseEdgeTypes` re-exports from `src/features/graph-filters/index.ts`; verify `npm run lint` and `npm run typecheck` report no unresolved import.
- [x] 2.2 Reduce `useFilterOptions` in `src/features/graph-filters/useFilterOptions.ts` to a single argument (the label-values base) and drop `edgeType` from `FilterOptions`; verify by updating `useFilterOptions.test.ts` so no edge-types response is stubbed and the hook issues exactly four label-values requests.
- [x] 2.3 Remove the Edge type entry from `DIMENSION_LABEL` and `LIST_DIMENSIONS` in `src/features/graph-filters/FilterBar.tsx`, and change the per-dimension `allowCustom={dimension !== 'edgeType'}` to an unconditional `allowCustom` — leaving the Projection control's `allowCustom={false}` as it is; verify by updating `FilterBar.test.tsx` to assert the bar renders exactly four identity dropdowns plus Projection and Clear, with no `filter-edgeType` control in the DOM.
- [x] 2.4 Update the two call sites, `src/features/app-shell/GraphPage.tsx` and `src/features/app-shell/SankeyPage.tsx`, to the new `useFilterOptions` signature and the `IdentityDimension` type; verify `npm run typecheck` passes.
- [x] 2.5 Retarget the `testId="filter-edgeType"` case in `src/shared/ui/ScopeSelect.test.tsx` at a control that still exists (the Projection control or the Sankey root-kind selector, both `allowCustom={false}`); verify the test passes and still covers the no-custom-value branch.

## 3. Remove the runtime-config key

- [x] 3.1 Remove `edgeTypes` from `RuntimeEndpoints` in `src/features/runtime-config/types.ts`, and from `KNOWN_ENDPOINT_KEYS` and the parsed-key list in `src/features/runtime-config/validate.ts`; verify `npm run typecheck` passes.
- [x] 3.2 Update `src/features/runtime-config/validate.test.ts`: replace the cases asserting `endpoints.edgeTypes` is accepted with one asserting a config carrying it validates successfully and reports `endpoints.edgeTypes` in `warnings`; verify the test passes.
- [x] 3.3 Remove the `"edgeTypes"` line from `deploy/configmap.yaml` and the sentence describing the edge-type catalogue from `deploy/README.md`; verify the `config.json` value in the ConfigMap still parses as JSON and its `endpoints` object contains only documented keys.

## 4. Update the specs

- [x] 4.1 Edit the `## Purpose` paragraph of `openspec/specs/graph-filters/spec.md` directly — it lists "edge type" among the controls and names the backend's edge-type catalogue as an option source. This is not carried by a delta (an existing capability's Purpose is ignored there), so it must be edited in place; verify the paragraph names four identity dimensions plus projection, and one option source.
- [x] 4.2 Run `openspec validate remove-edge-type-filter --strict` and confirm it reports the change as valid before archiving.

## 5. Verify the drawing side is untouched

- [x] 5.1 Confirm no file under `src/shared/constants/`, `src/features/graph-canvas/`, `src/features/legend/`, `src/features/element-filter/`, `src/features/pod-parent-mode/`, `src/features/graph-view/` or `src/features/storage-flow-sankey/` was modified by this change; verify with `git diff --name-only` against the branch point.
- [x] 5.2 Run `make check` (lint, typecheck, fixture check, unit tests) and confirm every drawing-side test file passes without having been edited — edge colouring, the edge legend, per-edge-type visibility toggles, the pod-parent transform, the Sankey tier derivation and ingress-node collection all still read `data.edgeType`.
- [x] 5.3 Run `npm run e2e` and confirm the Graph and Sankey routes still load, the filter bar renders without an Edge type control, and no request is issued to an edge-type URL.

## Notes from the apply run

- `make check` could not complete end to end on this machine: `npm run fixture:check` invokes
  `node --experimental-strip-types`, which Node v21.7.3 rejects (`node: bad option:
--experimental-strip-types`). `.nvmrc` pins Node 22 and Vite warns it needs 20.19+ or 22.12+.
  The other three gates were run directly and pass: `npm run lint` (0 warnings),
  `npm run typecheck` (0 errors), and the full unit suite. The fixture is built from
  `SHOWCASE_GRAPH` by `dev/buildFixture.mjs` and is untouched by this change.
- Two tests are flaky on this Node version and neither is caused by this change:
  `AppShell.test.tsx > seeds a sole az / env once and lets the operator clear it again`
  fails intermittently (measured 2 of 5 runs at HEAD `9e568c7` with this change stashed), and
  `sankeyPerformance.test.ts` asserts a 1000 ms wall-clock bound that a loaded machine misses
  by ~2 ms. A clean run gives 1196 passed / 1 failed (the AppShell flake).
- `npm run e2e`: 9 of 10 passed. The one failure differs run to run and also fails at HEAD
  with this change stashed (`fetch-path.spec.ts` at baseline, `demo.spec.ts` with the change),
  and each passes when its file is run alone.
- One edit beyond the written tasks: `README.md` documented `edge_type` in the `/graph` URL
  parameter table. That row was removed with 3.3, since leaving it would document a parameter
  the app no longer sends.
