## Why

The Storage Sankey draws one flow: ribbon weight, ranking, empty states and labels all come from `read_bytes_per_sec` / `write_bytes_per_sec`. The same `storage-flow` edges already carry a conserved `read_ops` / `write_ops` family — independently optional, same backend sum rules — but the view is forbidden from using them as thickness. An operator looking at IOPS pressure (small blocks, QoS ops ceilings) cannot switch the drawing to that family without leaving the page.

## What Changes

- **A `Weight` segmented control** in the Storage Sankey's scope-bar view-controls group, beside `Mode`: `Throughput` (default) and `IOPS`. It selects which measured pair becomes ribbon weight. `Mode` (`Read` / `Write` / `Both`) stays the direction split and is independent of `Weight`.
- **Weights stay backend-given.** Throughput reads `read_bytes_per_sec` / `write_bytes_per_sec`; IOPS reads `read_ops` / `write_ops`. The app still MUST NOT sum, split, convert between families, or use latency / QoS ceilings as thickness. Absent ≠ 0 still holds **per family**: an edge with bytes and no ops draws under Throughput and yields no IOPS ribbon.
- **Immediate view value, like `Mode`.** Switching redraws with no request. Outside demo mode it syncs to the URL as `weight=iops` (default `throughput` is not written); demo mode holds it in component state and ignores the parameter. Invalid values fall back to Throughput.
- **Units follow the family.** Mid-ribbon labels, card totals and tooltip flow rows use the Graph tooltip's ops formatter (`N ops/s`) under IOPS and the existing bytes/sec ladder under Throughput. QoS ceiling rows on `svm-pvc` stay informational and still show whichever ceilings the edge carries.
- **Top pods, sorting, scale and empty state 6 re-read the active family.** A body with throughput and no ops in the current direction is the IOPS empty state, and the copy points at the Weight control as well as Mode.
- **Demo fixture**: every hop that already carries conserved bytes on the mongo claims also carries conserved ops, so IOPS mode draws a full chain. At least one path keeps bytes and no ops, so absent ≠ 0 is visible under IOPS.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `storage-flow-sankey`: a new requirement "Weight family switch: throughput and IOPS", beside "Layout switch" and "SVM display switch". "Weights come straight from the backend" stops forbidding `read_ops` / `write_ops` as thickness and names the active family's direction fields instead. "az / env are required single-value selectors" (demo URL exemption), "Top pods projection", "Missing-value handling", "Empty states", "Value labels on ribbons" and "Labels and tooltips for nodes and links" follow the active family.
- `app-shell`: the Sankey page's immediate view values become `mode`, `weight` and `top_pods`; `weight` is a client-side exception never sent to the backend.
- `explicit-query`: `Weight` is an immediate display control (redraw, no request, no pending-draft indication), listed with mode, layout and Top pods.
- `dev-environment`: the storage fixture conserves `read_ops` / `write_ops` on the mongo claim hops and keeps at least one path with throughput and no ops.

## Impact

- Code: `src/features/storage-flow-sankey/` — `deriveSankey.ts` (`metricOf` and the derivation argument), `topPods.ts`, `sankeyUrlScope.ts`, `SankeyViewControls.tsx`, `SankeyView.tsx` / `SankeyChart.tsx` / `layoutSankey.ts` (format the active unit), and their tests; `src/features/app-shell/` only if the Sankey page's URL writer needs a new key.
- No backend, request or Graph / Network change. `read_ops` / `write_ops` are already on the wire and already conserved (`graph-data-source`).
- Spec sequencing: delta specs are written against the main specs **plus** the unarchived deltas of `standalone-pages-lean-sankey` and `sankey-svm-grouping` (view controls live in the scope-bar trailing group; SVM `Column` / `Group` stays). Archive or sync those before this change is archived.
- Demo payloads: regenerate `public/demo/storage-graph.json` from the typed fixture.
- Out of scope: Graph-view tooltips (already show both families), Network Sankey, converting ops to bytes, using `max_iops` as thickness, persisting the switch beyond the URL / remount.
