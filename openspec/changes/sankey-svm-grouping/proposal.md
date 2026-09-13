## Why

The Sankey cannot show which aggregate a PVC sits on. Its chain is `NetApp node → aggregate → SVM → PVC`, and an SVM spans aggregates: when `svm_demo` holds claims on both `aggr1` and `aggr2`, two ribbons enter the SVM card and three leave it, and nothing in the drawing says which is which. Hover makes it misleading rather than merely unreadable: `hoverPathLinks` walks every link, so hovering a PVC lights **both** aggregates, including the one its volume is not on, and hovering an aggregate lights every PVC of the SVMs it feeds.

The backend change `expose-claim-aggregate` (in `kube-state-graph`) puts each claim's aggregate on its PVC node as `labels.aggr`, holding the aggregate's node id. This change uses it.

## What Changes

- **An `SVM` display switch** beside the `Layout` control, with two segments: `Column` (default — the seven columns drawn today) and `Group`. Under `Group` the SVM column is removed and each SVM becomes a **frame in the PVC column** wrapping its PVCs. A PVC belongs to exactly one SVM, so that containment is exact; an SVM cannot wrap aggregates, which it shares with other SVMs. Ribbons run straight from each aggregate to the PVCs on it.
- The switch is **transient view state**, like `Layout`: not in the URL, not persisted, back to `Column` on remount, and switching issues no request.
- **Weights stay backend-given.** An aggregate → PVC ribbon carries that claim's `svm-pvc` weight unchanged — the one weight the backend measures per claim — drawn from the aggregate its `labels.aggr` names; `aggr-svm` hops are not drawn under `Group`. A frame's total is a client-side sum over its PVCs and is marked derived, like the `application` / `namespace` columns. `node → aggr` is unchanged.
- **Hover follows each claim's own aggregate**, in both modes: hovering a PVC, or a pod downstream of it, lights only the aggregate its `labels.aggr` names and that aggregate's controller; hovering an aggregate lights only the PVCs on it. Under `Column` the path still passes through the SVM card, over that aggregate's `aggr → svm` ribbon only.
- **The PVC tooltip names its aggregate and SVM.**
- **Top pods keeps the right aggregates.** The cut's backward walk keeps an aggregate when a kept PVC's `labels.aggr` names it, instead of every aggregate feeding a kept SVM, so `Group` never draws an aggregate with no PVC to flow into.
- **No `labels.aggr`, no guess.** A FlexGroup claim, out of scope here, carries none: under `Group` it is drawn in its SVM frame with no aggregate ribbon, and its hover path stops at its SVM. A body from a backend without `expose-claim-aggregate` carries none at all: the `Group` segment is then unavailable and says why, rather than drawing frames with no inbound flow, and hover keeps today's walk through every link, which is all such a body can say.
- **Demo fixture**: `SHOWCASE_STORAGE_GRAPH` gains `labels.aggr` on its NetApp-backed PVCs and an SVM spanning two aggregates, so demo mode shows the ambiguity and both modes resolve it.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `storage-flow-sankey`: a new requirement "SVM display switch: column and group", beside "Layout switch: flat and node grouping", for the switch and the `Group` presentation (frames in the PVC column, aggregate → PVC ribbons, no SVM column) and the no-`aggr` degradation. "Flow chain and tier structure" defines a PVC's claim aggregate once for every reader; "Column headers", "Weights come straight from the backend", "Hover highlights the path", "Labels and tooltips for nodes and links", "Numeric summary outside the chart" (a frame row replaces its SVM's) and "Top pods projection" follow it.
- `dev-environment`: the storage fixture carries `labels.aggr`, holds an SVM spanning two aggregates, and keeps a FlexGroup claim's flow off the aggregate hops.

## Impact

- Code: `src/features/storage-flow-sankey/` — `deriveSankey.ts` (aggregate → PVC links and the hover walk), `layoutSankey.ts` (frames in the PVC column; today's wrappers are specific to Kubernetes nodes in the pod column), `topPods.ts`, the toolbar in `SankeyView.tsx`, the tooltip and the summary; `src/shared/fixtures/showcaseStorageGraph.ts` and the example payloads generated from it.
- Depends on `kube-state-graph` change `expose-claim-aggregate`; release the backend first. Against an older backend this degrades as above instead of failing.
- Spec sequencing: `sankey-large-cluster-controls` also modified `storage-flow-sankey`, including "Layout switch" and "Top pods projection". It is archived on PR #9's branch (`c1a71fb`), this change's branch is stacked on that one, and its delta specs are written against the synced main spec; it merges after PR #9.
- Demo repository: its estate already has `svm_demo` spanning `aggr1` / `aggr2`. Once both changes land, `verify.sh` can assert that every joined PVC carries a `labels.aggr` naming a drawn aggregate.
- Out of scope: FlexGroup presentation (a claim spanning aggregates), root selection and the request.
