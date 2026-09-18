## Context

See proposal.md — Why. The current state that shapes the approach:

- `deriveSankey(elements, mode, roots, svmDisplay)` builds one `SankeyGraph`. `metricOf` reads `readBytesPerSec` / `writeBytesPerSec` per direction and skips the edge when that field is absent. `readOps` / `writeOps` already survive normalize; the spec currently forbids them as thickness.
- `cutTopPods` ranks pods with the same pair of byte fields. Layout, tooltips, mid-ribbon labels and card `total` lines format every weight through `formatBytesPerSec`.
- Immediate view values live in `sankeyUrlScope`: `mode` (`read` / `write`; default `both` omitted) and `top_pods`. `Layout` and `SVM` are local state on `SankeyView`. The control row is `SankeyViewControls` in the scope-bar trailing group (`Mode`, `Layout`, `SVM`, cut statement, legend).
- `SHOWCASE_STORAGE_GRAPH` conserves bytes on every hop. Ops exist only on `svm_shop → data-mongo-0` (`read_ops: 150`, `write_ops: 40`). An IOPS drawing of the fixture today would be a single claim hop, not a chain.
- `formatOps` (`N ops/s`, 3 significant digits) already lives in `features/hover-tooltip/formatEdgeMetrics.ts` for the Graph tooltip. `formatBytes` / `formatSignificant` live in `shared/format/measurements.ts`. A Sankey import of `hover-tooltip` would invert the feature-first layout.

## Goals / Non-Goals

**Goals:**

- One derivation argument selects the measured pair. Every consumer of a link's `value` (thickness, sort, Top pods, derived columns, labels, tooltips, empty state 6) reads that value and does not re-pick a field.
- Throughput drawing of the current fixture is unchanged.
- IOPS drawing of the mongo claims is a conserved chain, not a one-hop island.

**Non-Goals:**

- Backend, request parameters, or Graph / Network behaviour.
- Converting ops to bytes, or using `max_iops` / latency as thickness.
- Persisting Weight in local storage. URL (live) / component state (demo) is enough.

## Decisions

### D1. Weight family is a derivation input, parallel to `mode`

`deriveSankey` and `cutTopPods` take a `SankeyWeight` (`throughput` | `iops`, default `throughput`). `metricOf` reads the matching pair for the current direction. Link identity (source, target, direction, tier) is unchanged; only `value` changes, and an edge missing the active pair still yields no link (absent ≠ 0 per family).

_Alternative — layout remaps thickness from a second field while keeping byte `value`._ Rejected: sort, Top pods, derived sums, labels and empty state 6 all read `value`. Two sources of "the number" drift.

### D2. URL `weight`, like `mode`, not like `Layout`

Outside demo mode, `sankeyUrlScope` reads and writes `weight=iops`. Default `throughput` is omitted. Invalid values fall back to `throughput`. Demo mode holds it in component state and strips the parameter on the next query write. Switching writes replace, issues no request, and does not mark Query dirty.

_Alternative — transient, like `Layout`._ Rejected: the two Harvest families are independently optional, so Weight changes which ribbons exist, which pods the cut keeps, and whether empty state 6 appears. A shared live URL that always redraws Throughput would lie about the drawing.

### D3. `formatOps` moves next to `formatBytes`

Lift `formatOps` into `shared/format/measurements.ts`. The Graph tooltip keeps importing it (re-export from `formatEdgeMetrics` so existing import paths stay). The Sankey formats IOPS weights, tooltip flow rows and card totals through that one helper. Throughput keeps `formatBytesPerSec`. QoS ceiling rows stay as they are: bytes ceiling through the byte ladder, `max_iops` as ops.

_Alternative — a Sankey-local `formatOpsPerSec`._ Rejected: the Graph tooltip already prints `150 ops/s` next to `5.24 MB/s` on the same edge; a second spelling would show up the moment Locate opens `/graph`.

### D4. Fixture: conserved ops on the mongo claims; bytes-only elsewhere

On the `data-mongo-0` chain, copy the existing `150` / `40` onto `node-aggr`, `aggr-svm` and `pvc-pod`. `pod-node` for `mongo-0` carries `150` / `40` (the FlexGroup claim still has no ops, so it must not be folded into the ops hop). On the `data-mongo-1` chain, add `12` / `3` on every hop — the same pair `SHOWCASE_GRAPH` already stamps on that claim's `pvc-to-netapp-aggr`. FlexGroup, orphan and pending paths keep bytes and no ops, so IOPS mode drops them and Throughput is unchanged.

Do not add ops to `SHOWCASE_GRAPH` beyond what it already has; same-estate is ids and names, not a second copy of every metric.

Regenerate `public/demo/storage-graph.json` with `npm run fixture:build`.

### D5. Empty state 6 is per family

`hasCurrentDirectionMeasurement` already gates state 6 off the derived links. After D1 it follows the active pair, so a body with only bytes in Read + IOPS is state 6. The copy names both Mode and Weight.

### D6. Control placement

`SankeyViewControls` grows a `Weight` `Segmented` (`Throughput` / `IOPS`) immediately after `Mode`. Accessible name `Sankey weight`, `data-testid="sankey-weight"`. It stays operable in every empty state, including state 6.

## Risks / Trade-offs

- [IOPS mode on a live body whose Harvest ops series is missing looks empty] → State 6, with a hint to switch Weight; Throughput remains the default.
- [Fixture ops on only `svm-pvc` would look like a conservation bug] → D4 stamps the same pair on every hop of those two claims; a fixture test pins both families independently.
- [Sankey importing `hover-tooltip` for `formatOps`] → D3 lifts the helper into `shared/`.
- [Two unarchived changes also rewrite `storage-flow-sankey` and `app-shell`] → This change's deltas are written against those texts. Archive or sync `standalone-pages-lean-sankey` and `sankey-svm-grouping` before this one.

## Migration Plan

Frontend-only. No request shape change; an old URL without `weight` is Throughput. Roll back by reverting the change: the `weight` query key is ignored and stripped, as unknown parameters already are.

## Open Questions

(none)
