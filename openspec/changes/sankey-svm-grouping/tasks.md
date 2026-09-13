## 1. Fixture (design D8, spec `dev-environment`)

- [ ] 1.1 In `src/shared/fixtures/showcaseStorageGraph.ts`, move `data-mongo-1` from `svm_dr` to `svm_shop` (its `svm-pvc` source, its `labels.svm`, the target of the `aggr2` `aggr-svm` edge), drop `svm_dr`, add `labels.aggr` to `data-mongo-0` (`netapp/ontap-prod/aggr/aggr1`) and `data-mongo-1` (`netapp/ontap-prod/aggr/aggr2`), take `data-scratch`'s `262144` off both `aggr1` hops (read `5505024` → `5242880`), and correct the header comment; verify `npm run typecheck` passes and a fixture test pins the scenario "The storage fixture reports claim aggregates"
- [ ] 1.2 Regenerate the example payloads with `npm run fixture:build`; verify `npm run fixture:check` is clean and `public/demo/storage-graph.json` changes only as 1.1 describes
- [ ] 1.3 Update the tests the move touches — the two SVM lists in `deriveSankey.test.ts` that name `svm_dr`, and any assertion on the `aggr1` hops; verify `npx vitest run src/features/storage-flow-sankey` passes before any behaviour change

## 2. Claim aggregates (design D1)

- [ ] 2.1 Add the one exported helper that resolves a PVC's `labels.aggr` against the node ids in the body, read it into `NodeRec`, and add `claimAggregates` and `reportsClaimAggregates` to `SankeyGraph`; verify unit tests for "A claim aggregate is read from the PVC, never inferred", a label naming an absent node (no claim aggregate), and a body with no label (`reportsClaimAggregates` false)

## 3. Group derivation and layout (design D2, D3)

- [ ] 3.1 Give `deriveSankey` the SVM display: under `group`, `svm-pvc` edges become links from the claim aggregate (tier `svm-pvc`, weight unchanged), `aggr-svm` edges become none, and `netapp-svm` nodes become `svmFrames`; verify `deriveSankey.test.ts` covers "Group draws each aggregate straight to its claims", "A FlexGroup claim sits in its frame with no aggregate ribbon" and "Group re-sources a claim's weight without re-summing", and that `column` output on the fixture equals today's apart from the two new fields
- [ ] 3.2 Generalise `layoutPodWrappers` into a column-wrapper routine and draw SVM frames in the PVC column: ordered by label, members in PVC order, an empty no-flow frame for an SVM root, neutral border, not locatable, no SVM column, PVC header `SVM / PVC`, and frames combining with Kubernetes-node wrappers; verify `layoutSankey.test.ts` covers "Frames are ordered by name", the `Group` headers of "Seven column headers", and both wrapper kinds at once

## 4. Hover (design D4)

- [ ] 4.1 Replace the unconstrained walks with the claim-aware walk, falling back to today's walk when the graph does not report claim aggregates, and add the frame union beside `hoverPathForWrapper`; verify `deriveSankey.test.ts` covers "Hovering a pvc highlights upstream and downstream", "Hovering an aggregate lights only its own claims", "A FlexGroup claim's path starts at its SVM", "Without claim aggregates every link is walked" and "Hovering a frame highlights its claims' paths", the existing wrapper and side-branch scenarios still pass, and the hover bound in `sankeyPerformance.test.ts` still holds

## 5. Top pods (design D5)

- [ ] 5.1 Make `reverseFrom` keep an aggregate when it is a kept PVC's claim aggregate, keeping today's walk for a body without claim aggregates; verify `topPods.test.ts` covers "The cut keeps only the kept claims' aggregates", a body without labels keeps every aggregate feeding a kept SVM, and "The default cut bounds a large body" still passes

## 6. Switch, tooltips and summary (design D6, D7)

- [ ] 6.1 Add the `SVM` segmented control (`Column` / `Group`) beside `Layout` in `SankeyView.tsx`, as a prop with local-state fallback like `podLayout`, disabled with its reason when the graph has `svm-pvc` links but reports no claim aggregates, falling back to `Column`; verify `SankeyView.test.tsx` covers "Group is unavailable when no claim aggregate is reported", that switching writes nothing to the URL and issues no request, and that the viewport and hover survive a switch
- [ ] 6.2 Extend the tooltips — the PVC's SVM and claim aggregate, a frame's title row, and a `Group` link naming its SVM; verify `SankeyView.test.tsx` covers "Hovering a PVC names its SVM and aggregate" and the frame tooltip items of "Labels and tooltips for nodes and links"
- [ ] 6.3 Emit one `SankeySummary` row per frame (tier `netapp-svm`, derived inflow, status placeholder) in place of the SVM card rows under `Group`; verify `SankeySummary.test.tsx` covers "A frame replaces its SVM's row"

## 7. End-to-end (Playwright, `tests/`)

- [ ] 7.1 In demo mode, switch the SVM display to `Group`: the `svm_shop` frame holds its three PVCs, `aggr1 → data-mongo-0` and `aggr2 → data-mongo-1` are drawn, no `SVM` header is, and no request is issued; after a refresh the control reads `Column`; verify `npm run e2e` passes
- [ ] 7.2 In live mode against a stubbed body whose PVCs carry no `labels.aggr`, the `Group` segment is disabled with its reason and the chart draws as under `Column`; verify `npm run e2e` passes

## 8. Documentation and gates

- [ ] 8.1 Describe the `SVM` display in `README.md`'s Sankey section — `Column` / `Group`, claim aggregates, and the backend version that reports them; verify the text reads against the delta specs
- [ ] 8.2 Run `npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run e2e` and `npm run fixture:check`; verify all pass, with coverage at or above 80% on the changed modules
- [ ] 8.3 Run `openspec validate sankey-svm-grouping --strict`; verify it passes and that every scenario in the two delta specs maps to a test from groups 1–7
- [ ] 8.4 Once `kube-state-graph` ships `expose-claim-aggregate`, rebuild both images in the demo repository and switch the SVM display to `Group` on `svm_demo`; verify each of its three PVCs is drawn under its own aggregate and `make verify` still reports 0 failed
