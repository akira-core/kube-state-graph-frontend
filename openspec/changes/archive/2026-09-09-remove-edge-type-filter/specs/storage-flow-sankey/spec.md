## MODIFIED Requirements

### Requirement: Fully independent of the Graph view's controls

The Sankey's data MUST be fully independent of the Graph view's kind / edge-type display toggles, ingress visibility toggle, search query, pod-parent mode, collapse state, `prune` setting, and the filter bar's multi-value `cluster` / `az` / `env` / `namespace` selections — any change to those MUST NOT change the Sankey's nodes, links or weights, and MUST NOT trigger a storage-graph refetch. The edge-type toggles named here are the legend's client-side display refinement (`element-filter`); there is no backend edge-type filter on either page.

The reverse also holds: changes to the Sankey's `az` / `env` / roots / `cluster` / `namespace` / mode are written only to the `/sankey` query, MUST NOT rewrite the `/graph` query, and MUST NOT make the Graph page carry the Sankey's selections on its next mount. The Sankey's `Layout` control (`Flat` / `Node`) and the Graph's pod-parent `Layout` control (`Node` / `Controller`) are two unrelated pieces of transient state that happen to share a label: neither MUST read or write the other.

The only input the two pages share is the **view time range** (see `app-shell`; passed via the URL and the browser-local saved value): a change to it MUST make the current page refetch, and the other page uses the new `start` / `end` on its next mount.

#### Scenario: Graph view controls do not affect the Sankey

- **WHEN** the user, on `/graph`, hides the `pvc` kind, enters the search `nats`, switches the pod-parent mode to `node`, switches the Projection to `Full inventory`, then presses Back to return to `/sankey?az=zone-a&env=prod`
- **THEN** the storage-graph request's query string is the same as before (without `prune` or the Graph's filters), and the Sankey's nodes, links and weights are the same as before

#### Scenario: Sankey controls do not affect the Graph view

- **WHEN** the user, on `/sankey`, adds root `aggr: aggr1` and changes `env`, then clicks the Graph link in the nav bar
- **THEN** the address bar is `/graph` (with only `from` / `to` filled in), the filter bar has nothing selected, and the graph request contains no `aggr` / `az` / `env`

#### Scenario: The two Layout controls do not share state

- **WHEN** the user switches the Sankey layout to `Node`, clicks the Graph link, and finds the Graph's pod-parent mode at its default `controller`; then switches the Graph to `node` and presses Back
- **THEN** the Sankey remounts at `Flat` (its own default), and neither switch was reflected in the other page or in the URL
