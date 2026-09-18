## MODIFIED Requirements

### Requirement: Typed fixture is the single source of demo data

`src/shared/fixtures/showcaseGraph.ts` SHALL export `SHOWCASE_GRAPH`, annotated with the `WireGraph` type from `src/shared/types/wire.ts`, as the **only** graph read by demo mode, Vitest tests, Playwright specs, and the fixture coverage test. Demo mode SHALL read this fixture directly via module import.

Because the two backend endpoints are two bodies, the fixture SHALL also be **two**: the same module also exports `SHOWCASE_STORAGE_GRAPH`, likewise annotated with `WireGraph`, the showcase in the shape of `GET /v1/storage-graph` — containing only `storage-flow` edges (all five tiers present, including one `pvc-pod` edge carrying `labels.attribution: "split"` and one FlexGroup path starting from `svm-pvc`), `netapp-svm` nodes, and the `hardware` / `perf` of `netapp-node`. Every PVC whose claim sits on an aggregate SHALL carry `labels.aggr` holding that aggregate's node id, the FlexGroup PVC SHALL carry none, and one SVM SHALL hold claims on two aggregates — the shape the Sankey's SVM display switch exists for. The two fixtures MUST describe **the same estate**: the same set of pod / pvc / netapp node ids and names, so that "click a node in the Sankey to jump to Graph and Locate" actually finds its target in demo mode. The `storage-flow` weights of both MUST be conserved per tier **per measured family** (bytes and ops independently), otherwise the demo demonstrates a shape the backend never produces; in particular a FlexGroup claim's flow enters at its SVM, so no `node-aggr` or `aggr-svm` hop may include it, in either family. The mongo claims (`data-mongo-0`, `data-mongo-1`) MUST carry conserved `read_ops` / `write_ops` on every hop of their chain, matching the ops already stamped on those claims in `SHOWCASE_GRAPH`. At least one other path MUST carry throughput and no ops, so IOPS mode can show absent ≠ 0. The repository MUST NOT contain any script, test, or development flow that requires a connection to a running kube-state-graph server, Prometheus-compatible store, or Kubernetes cluster to work.

The `WireGraph` annotation is a mechanism, not decoration: `normalizeGraph` accepts `unknown` and validates at runtime, so a field the app newly learns to read is invisible at compile time; typing the fixture makes "taught normalize a new field but forgot the demo" an `npm run typecheck` failure, rather than a blank nobody looks at again.

The fixture SHALL carry the complete backend response envelope — `apiVersion`, `clusters`, `elements` — rather than only `elements`, so the body shape the demo exercises is consistent with what is received in deployment. `clusters` SHALL list only Kubernetes cluster names; ONTAP cluster names MUST NOT appear in it.

Where the fixture carries fields no backend version will ever emit (`status`, `alerts`, `time_records`, and the `switch` / `network` kinds with their `switch-to-switch` / `node-to-switch` edges — these are the frontend's own extension surface), the fixture and the wire types MUST record that origin in comments, so a reader does not mistake frontend-only fields for the backend contract and "fix" the backend.

#### Scenario: No backend dependency anywhere in the repository

- **WHEN** inspecting every file under `dev/`, `tests/`, `.github/workflows/` and every script in `package.json`
- **THEN** no file or script requires a reachable kube-state-graph, VictoriaMetrics, or Kubernetes endpoint to run successfully

#### Scenario: Typecheck fails when normalize adds a wire field the fixture does not cover

- **WHEN** `WireGraph` adds a required field and `SHOWCASE_GRAPH` is not updated in step
- **THEN** `npm run typecheck` fails

#### Scenario: The storage fixture reports claim aggregates

- **WHEN** `SHOWCASE_STORAGE_GRAPH` is inspected
- **THEN** `data-mongo-0` and `data-mongo-1` carry `labels.aggr` naming `netapp/ontap-prod/aggr/aggr1` and `netapp/ontap-prod/aggr/aggr2`, both nodes of the fixture; the FlexGroup claim `data-scratch` carries none; `svm_shop` has inbound `aggr-svm` edges from both aggregates; and no `node-aggr` or `aggr-svm` edge's weight includes `data-scratch`'s flow

#### Scenario: The storage fixture conserves ops on the mongo claims

- **WHEN** `SHOWCASE_STORAGE_GRAPH` is inspected
- **THEN** every `storage-flow` hop on the `data-mongo-0` chain carries `read_ops: 150` and `write_ops: 40`, every hop on the `data-mongo-1` chain carries `read_ops: 12` and `write_ops: 3`, and the FlexGroup / orphan / pending paths carry throughput with no ops fields

### Requirement: Fixture covers every kind and edge type the app can draw

`src/shared/fixtures/showcaseGraph.test.ts` SHALL assert that `normalizeGraph(SHOWCASE_GRAPH)` produces:

- an empty `errors` array — the partial-parse channel exists for a real backend misbehaving, and anything landing in it is this repository's own mistake;
- no edge whose `source` or `target` is not among the fixture's own nodes, and no node whose `parent` is not;
- at least one element for **every** key of `ICON_SVG_BY_KIND` and **every** key of `EDGE_STYLE_BY_TYPE`.

Coverage SHALL be measured against these two canonical maps rather than a filterable subset, so the virtual `network` wrapper counts too; anchoring here makes "adding a kind to the map" and "showing it in the demo" the same enforced thing.

The test suite SHALL additionally pin the demo cases that exist to be "seen" rather than merely "parseable": all three `ready_status` values, a claim that joined an aggregate alongside one that did not, a QoS-capped storage edge alongside one without a cap, a measured error rate alongside a measured-zero and an unmeasured edge, a valid tiny rate that must not round to zero, both `labels.role` ingress shapes and their differing dash and visibility behavior; and, for the Sankey view: at least one `pvc-to-netapp-aggr` edge carrying both `read_bytes_per_sec` and `write_bytes_per_sec`, one carrying no storage throughput metrics at all (absent ≠ 0), at least one `storage-flow` hop carrying both `read_ops` and `write_ops`, and one carrying throughput with neither ops field.

#### Scenario: Fails when a drawable kind is added without a corresponding fixture element

- **WHEN** a key is added to `ICON_SVG_BY_KIND` and no fixture node carries that kind
- **THEN** `showcaseGraph.test.ts` fails, naming the uncovered kind
