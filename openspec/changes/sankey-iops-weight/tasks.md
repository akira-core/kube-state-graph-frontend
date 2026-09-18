## 1. Fixture (design D4, spec `dev-environment`)

- [x] 1.1 In `src/shared/fixtures/showcaseStorageGraph.ts`, stamp conserved ops on the mongo claims: `data-mongo-0` hops (`node-aggr` / `aggr-svm` / `svm-pvc` / `pvc-pod` and `mongo-0`'s `pod-node`) `read_ops: 150` / `write_ops: 40`; `data-mongo-1` hops `read_ops: 12` / `write_ops: 3`; leave FlexGroup / orphan / pending paths with throughput and no ops; verify a fixture test pins "The storage fixture conserves ops on the mongo claims" and `npm run typecheck` passes
- [x] 1.2 Regenerate example payloads with `npm run fixture:build`; verify `npm run fixture:check` is clean and `public/demo/storage-graph.json` gains only the ops fields 1.1 describes
- [x] 1.3 Extend `showcaseGraph.test.ts` / `showcaseStorageGraph.test.ts` so the Sankey coverage pins at least one `storage-flow` hop with both `read_ops` and `write_ops`, and one with throughput and neither ops field; verify those tests pass

## 2. Shared ops formatter (design D3)

- [x] 2.1 Lift `formatOps` into `src/shared/format/measurements.ts` beside `formatBytes`, re-export it from `features/hover-tooltip/formatEdgeMetrics.ts`, and add unit tests for `150` → `150 ops/s`, `0` → `0 ops/s`, and a non-zero tiny value that must not round to `0 ops/s`; verify `npx vitest run src/shared/format src/features/hover-tooltip` passes and no feature imports `hover-tooltip` from `storage-flow-sankey`

## 3. Derivation (design D1, spec `storage-flow-sankey`)

- [x] 3.1 Add `SankeyWeight` (`throughput` | `iops`, default `throughput`) to `deriveSankey` and make `metricOf` read `readBytesPerSec` / `writeBytesPerSec` or `readOps` / `writeOps` for the current direction; verify `deriveSankey.test.ts` covers "IOPS weights taken as-is", "Throughput is unchanged", "Bytes without ops is absent under IOPS", "Switching weight recomputes immediately" at the graph (ops values, missing-family links dropped, derived sums follow drawn ops), and that the fixture under Throughput still matches today's byte weights
- [x] 3.2 Thread `weight` through `useSankeyProjection` into `cutTopPods` so ranking uses the same `metricOf`; verify `topPods.test.ts` covers "The ranking follows the weight family" and existing mode-ranking / default-cut tests still pass

## 4. URL scope (design D2, specs `app-shell` / `explicit-query`)

- [x] 4.1 Add `weight` to `SankeyUrlScope`: parse `iops`, default `throughput`, omit the default on serialize, invalid values fall back to `throughput`; under demo the page holds it in component state and the serializer writes no `weight`; verify `sankeyUrlScope.test.ts` covers "Weight restored from the URL", "Demo mode ignores the parameter", and that `mode` / `top_pods` round-trips are unchanged
- [x] 4.2 Wire `weight` through `SankeyPage` like `mode` (`useCommitField`, demo state, `commit` payload, `useSankeyProjection`); verify switching Weight after a committed query writes `weight=iops` with replace, issues no request, and does not mark Query dirty (`explicit-query` "A display control still applies immediately")

## 5. Control, labels and empty state (design D5, D6)

- [x] 5.1 Add the `Weight` segmented control (`Throughput` / `IOPS`) immediately after `Mode` in `SankeyViewControls`, accessible name `Sankey weight`, `data-testid="sankey-weight"`, operable in every empty state; verify `SankeyViewControls.test.tsx` renders both segments, default Throughput, and that a click calls `onWeightChange('iops')`
- [x] 5.2 Format mid-ribbon labels, tooltip flow rows and the namespace leaf `total` line with `formatOps` under IOPS and `formatBytesPerSec` under Throughput; keep `svm-pvc` QoS ceiling rows in their own units; verify `SankeyView.test.tsx` / `layoutSankey.test.ts` cover "IOPS draws the ops pair as weight", "IOPS labels use ops/s", "Hovering an aggregate under IOPS", and that Throughput tooltip figures on the fixture still read `5.24 MB/s`
- [x] 5.3 Gate empty state 6 off the active family and name both Mode and Weight in the copy; verify `SankeyView.test.tsx` covers "No measurement in the current weight family" (bytes-only body + IOPS → `sankey-empty-mode`, switch to Throughput draws) and that Read-with-only-write-bytes under Throughput still shows the direction hint

## 6. End-to-end (Playwright, `tests/`)

- [x] 6.1 In demo mode, switch Weight to IOPS: `svm_shop → data-mongo-0` is labelled `150 ops/s`, FlexGroup / orphan paths are not drawn as ops ribbons, no request is issued; after a refresh the control reads Throughput; verify `npm run e2e` passes
- [x] 6.2 In live mode against a stubbed complete scope, `weight=iops` in the URL shows IOPS after Query, switching back to Throughput strips `weight` with replace and issues no extra request; verify `tests/url-scope.spec.ts` / `tests/explicit-query.spec.ts` cover this and `npm run e2e` passes

## 7. Documentation and gates

- [x] 7.1 Document `weight` (`iops`; default Throughput omitted) in `README.md`'s `/sankey` parameter table and name the `Weight` control beside Mode in the scope-bar paragraph; verify the text reads against the delta specs
- [x] 7.2 Run `npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run e2e` and `npm run fixture:check`; verify all pass, with coverage at or above 80% on the changed modules
- [x] 7.3 Run `openspec validate sankey-iops-weight --strict`; verify it passes and that every new or changed scenario in the four delta specs maps to a test from groups 1–6
