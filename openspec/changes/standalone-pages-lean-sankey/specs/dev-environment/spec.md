## MODIFIED Requirements

### Requirement: A third typed fixture for the network trace

`src/shared/fixtures/showcaseTrace.ts` SHALL export `SHOWCASE_TRACE`, annotated with `WireGraph`, as the only trace body read by demo mode, Vitest tests, Playwright specs and the fixture coverage test. It is the response shape of `GET endpoints.trace` and is **merged from the network samples of the sankey-panel repo** (`samples/*.json`), so demo mode shows every case those samples draw. It is one `destination` trace with exactly one `investigation`, on `dci-uturn/core-1`. The `dci-uturn` sample is the backbone; its `tor-1` and `tor-2` feed the `k8s` and `client` samples in place of their servers, so the start reaches k8s node → pod → namespace cards and client ports through several switch layers. `classic`, `dual-uplink`, `campus`, `pruned`, `dci-tier` and `k8s-source` are drawn beside the backbone; each of their starts holds what its sample's anchor ribbon brought in as an explicit residual (`other_in_bps`, or `other_out_bps` for the source-trace `k8s-source`). Every node and edge id MUST carry its sample key as a prefix, and a name shared across samples MUST carry the sample key so every card is unique. `source` (servers sending into switches, invalid as trace-stop leaves in a destination trace) and `storage` (storage-flow edges) are not merged. The `k8s` island's k8s nodes and pods carry `labels.cluster` (`east` for `node-w-11` and its pods, `west` for `node-w-12` and its pods, none on `node-w-13`), so `Group: Cluster` draws two frames on it. Every hop that receives traffic MUST balance under the rule of `network-trace`.

`src/shared/fixtures/showcaseTrace.test.ts` SHALL assert that `normalizeGraph(SHOWCASE_TRACE)` yields an empty `errors` array, that exactly one node (`dci-uturn/core-1`) carries `investigation`, that every merged sample key appears as an id prefix with ids and names unique, that the `k8s` and `client` starts are fed by the backbone ToRs, that `deriveTrace` succeeds as `destination` with at least one lateral, one backward, one metered owner ribbon, one ownership line, a client table, a k8s node hop, a leaf pod, a namespace card, a pod hop, derived and explicit residuals and a ROUTER hop reached from two hops (kind `node`, role `router`, no onward edge, its traffic leaving as an `other out` residual) — a router is a hop like a switch, never a leaf, so a fixture that let one collapse into a leaf would stop covering the shape the `campus` sample exists for — and that every hop with inflow balances. The fixture coverage test keeps the `host` kind and the `network-flow` edge type covered through this fixture's normalized elements; no route draws them on a Graph view.

#### Scenario: The trace fixture covers the network drawings

- **WHEN** `showcaseTrace.test.ts` runs
- **THEN** it passes; removing the backward edges (the `dci-uturn` DCI → border hops) from the fixture makes it fail

#### Scenario: Demo mode renders the fixture on the Network views

- **WHEN** `demoMode` is `true` and the user opens `/network/sankey`
- **THEN** the Sankey draws the merged samples (the `dci-uturn` start with its anchor card, the stitched k8s ToR with pods and namespace cards, client tables and owner cards, the islands beside) without any request
