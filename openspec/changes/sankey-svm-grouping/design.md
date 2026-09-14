## Context

See proposal.md — Why. The current state that shapes the approach:

- `deriveSankey` builds one `SankeyGraph` from the normalized elements: `nodes`, `links` (one per `storage-flow` edge per direction, plus the derived `application` / `namespace` links) and `k8sNodes` (the `Node` layout's wrappers, from `pod-node` edges). It indexes nodes into `NodeRec` from `data.labels`. A PVC's `labels.svm` arrives but is not read, and nothing reads an aggregate off a PVC.
- `hoverPathLinks(graph, id)` walks every inbound link upward and every outbound link downward; `hoverPathForWrapper` takes the union over a wrapper's pods. `SankeyView` calls them on hover.
- `layoutSankey(graph, palette, podLayout)` places one column per kind in `SANKEY_KIND_ORDER`, drops empty columns, and under the `node` layout places pods inside Kubernetes-node wrappers through `layoutPodWrappers` (title row, subtitle, stacked cards, ordered by label). `locatableFor` already excludes `netapp-svm`.
- `cutTopPods` runs on the elements before derivation; after ranking, `reverseFrom` walks `pvc ← svm ← aggr ← node` by tier over every edge.
- `SankeyView` holds the transient `podLayout` (a prop, or local state) and renders `LAYOUT_OPTIONS` through `Segmented`. Node tooltips come from `nodeTooltip`; `SankeySummary` builds rows from the graph's nodes and wrappers.
- The storage fixture has no SVM spanning aggregates: `svm_shop` is fed only by `aggr1`, `svm_dr` only by `aggr2`. Its `aggr1` hops (read `5505024`) include the FlexGroup claim `data-scratch`'s `262144`, a shape the backend never produces, because a FlexGroup claim has no aggregate hop.

## Goals / Non-Goals

**Goals:**

- The claim aggregate is computed in one place and read by every consumer: hover, the Top pods cut, the `Group` presentation, tooltips and the summary.
- `Group` is a projection of the same body: no request, and no weight arithmetic beyond the derived frame totals.
- `Column` draws what it draws today; only hover and the cut become exact when the body reports claim aggregates.

**Non-Goals:**

- Presenting a FlexGroup claim across aggregates.
- Persisting the switch, or any URL or request change.
- The backend side, which is `kube-state-graph`'s `expose-claim-aggregate`.
- The Graph view.

## Decisions

### D1. One claim-aggregate reading, shared

A single exported helper reads a PVC's `labels.aggr` and resolves it against the node ids in the body. `deriveSankey` uses it to build `claimAggregates: ReadonlyMap<pvcId, aggrId>` and a `reportsClaimAggregates` flag (some PVC with an inbound `svm-pvc` edge carries the label) on `SankeyGraph`; hover, layout, tooltips, the summary and the switch's availability read those. `cutTopPods`, which runs on the elements before derivation, calls the same helper.

_Alternative — each consumer reads the label itself._ Rejected: five readings of one rule drift, and the spec defines the claim aggregate once for exactly that reason.

### D2. `Group` is a derivation option, not a layout trick

`deriveSankey` takes the SVM display. Under `group` an `svm-pvc` edge becomes a link from its PVC's claim aggregate — keeping tier `svm-pvc`, so its ceilings, latency and tooltip need no new branch — an `aggr-svm` edge becomes no link, and `netapp-svm` nodes leave `nodes` to become `svmFrames` (id, label, ONTAP cluster, member PVC ids, no-flow flag). A PVC with no claim aggregate gets no inbound link; its downstream links are unchanged. Under `column` the output is today's plus the two new fields.

_Alternative — keep one graph and let the layout re-route ribbons._ Rejected: hover, tooltip flows and the summary all read `graph.links`, and a layout-only rewrite would leave them describing ribbons that are not drawn.

### D3. Frames reuse the wrapper placement

`layoutPodWrappers` becomes a column-wrapper routine parameterised by column, groups, member order and subtitle, serving both the pod column (Kubernetes nodes) and the PVC column (SVM frames). A frame gets the neutral border, is not locatable, has the subtitle `svm · N PVCs`, and the PVC column header reads `SVM / PVC`. Both wrapper kinds can be drawn at once, since the two switches combine.

_Alternative — a second renderer for frames._ Rejected: it would duplicate the wrapper's geometry, slot and hover code for the same shape.

### D4. Hover walks through the claim aggregate under `Column`

The two unconstrained walks become walks that carry a claim filter. Walking up and reaching an SVM from a PVC follows only the `aggr-svm` link whose source is that PVC's claim aggregate, and none when the PVC has no claim aggregate and the graph reports claim aggregates. Walking down and entering an SVM from an aggregate continues only to the PVCs whose claim aggregate is that aggregate. A walk that starts at an SVM is unconstrained. When `reportsClaimAggregates` is false the walk is today's. Under `Group` the links are already direct, so the plain walk is exact, and a frame's path is the union of its PVCs' paths, as `hoverPathForWrapper` does for pods. The walks stay pure functions of the graph; hover still only changes styles.

### D5. The Top pods cut keeps claim aggregates

`reverseFrom` keeps an aggregate when it is the claim aggregate of a kept PVC, whenever the elements report claim aggregates, and otherwise keeps today's walk through the SVM. A frame left with no kept PVC disappears on its own, because derivation builds frames from drawn PVCs.

### D6. The switch mirrors `Layout`

`SankeyView` gains an SVM display prop with local-state fallback, exactly like `podLayout`, rendered as `SVM_OPTIONS` (`Column` / `Group`) beside `LAYOUT_OPTIONS`. `Group` is disabled with its reason when the graph has `svm-pvc` links but does not report claim aggregates, and the effective display then falls back to `Column`. Nothing reaches the URL or the page's applied scope, and the viewport is preserved as it is across a layout switch.

### D7. Tooltips and summary follow the graph

- The PVC tooltip adds its SVM and, when present, its claim aggregate's label.
- A frame's title row gets a tooltip shaped like the wrapper's: kind `netapp-svm`, label, ONTAP cluster, PVC count, derived inflow, and no status.
- Under `Group` a link tooltip keeps tier `svm-pvc` and names the SVM it belongs to.
- `SankeySummary` emits one row per frame (tier `netapp-svm`, derived inflow, status placeholder) in place of the SVM card rows.

### D8. Fixture: move one claim, correct the aggregate hops

- Move `data-mongo-1` from `svm_dr` to `svm_shop`: its `svm-pvc` source, its `labels.svm` and the target of the `aggr2` `aggr-svm` edge. Then drop `svm_dr`, which is left with no claim.
- Add `labels.aggr` to `data-mongo-0` (`aggr1`) and `data-mongo-1` (`aggr2`).
- Take `data-scratch`'s `262144` off both `aggr1` hops (read `5505024` → `5242880`), and correct the header comment, since in = out does not hold at an SVM holding a FlexGroup claim.
- Every other weight stays as it is. Regenerate `public/demo/storage-graph.json` with `npm run fixture:build`; `fixture:check` guards it.

_Alternative — add a new claim and pod._ Rejected: it needs new ids in both fixtures, per the same-estate rule, and new weights to conserve.

## Risks / Trade-offs

- [The cut and the derivation read the claim aggregate separately and drift] → Both call the one helper, and a unit test asserts they agree on the fixture.
- [Hover cost on the 3000-edge body] → The adjacency and the claim map are built once per graph and memoised with it, so a walk stays linear in links; the hover bound in `sankeyPerformance.test.ts` covers it.
- [`Group` against an older backend] → The segment is disabled with its reason, and `Column` is unchanged.
- [The fixture edits break tests pinned to `svm_dr` or to the `aggr1` values] → Only `deriveSankey.test.ts` names `svm_dr` (two lists), and no test pins `5505024`; update them in the same commit.
- [A `labels.aggr` naming a node absent from the body] → Treated as no claim aggregate, as the spec's definition requires.
- [Large frames make the PVC column tall] → The same as Kubernetes-node wrappers; Top pods bounds the pods, and with them the PVCs.

## Migration Plan

- No persisted state, and the switch defaults to `Column`. Ship after the backend's `expose-claim-aggregate`; against an older backend `Group` is disabled and hover behaves as today.
- Rollback is a revert.
