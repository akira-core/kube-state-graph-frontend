## Purpose

Gates every request-shaping input of the Graph and Sankey pages behind an explicit **Query** action, so that editing a control never costs a request, an in-flight request can be **cancelled**, and the URL names exactly the scope that was last committed and drawn. This is the frontend's answer to estates whose whole-estate body stalls the browser: the operator narrows first and asks second.

## ADDED Requirements

### Requirement: Draft and applied selection

Each page SHALL hold two selections: a **draft**, which is what the controls show and edit, and an **applied** selection, which is what the last committed request was built from. The draft inputs are, on the Graph page, the four identity dimensions and the projection; on the Sankey page, `az` / `env`, the `cluster` / `namespace` narrowing and the roots; and on both pages the nav bar's **view time range**. Editing any draft input MUST change only the draft: it MUST NOT issue a request, MUST NOT write the route's query string, and MUST NOT alter the drawn data.

Inputs that change no request are **not** draft inputs and keep applying immediately: the Sankey's mode, layout and Top pods control, and every client-side display control of the Graph view (kind toggles, ingress, search, pod-parent mode, collapse).

While the draft differs from the applied selection the page MUST indicate it — on the Query control and in words near it — so an operator can tell that the drawing answers the previous controls, not the current ones. Under `demoMode` there is no applied selection to compare against, and the indication MUST NOT appear.

#### Scenario: Editing a filter costs nothing

- **WHEN** on `/graph` the operator selects namespace `shop`, then `infra`, then switches the projection to `Full inventory`
- **THEN** the request count to `endpoints.graph` is unchanged, the address bar is unchanged, the existing graph is still drawn, and the Query control indicates a pending draft

#### Scenario: A display control still applies immediately

- **WHEN** on `/sankey` after a committed query the operator switches the mode from Both to Write and sets Top pods to `5`
- **THEN** the chart redraws with no request issued, and the Query control does not indicate a pending draft

### Requirement: The Query control commits the draft

Each page SHALL present a **Query** control on its filter / scope bar, closing the same control row as the other controls but set apart from them as an **action**: a filled button with no field label above it, after a divider at the end of the row, so that it cannot be read as one more input beside the bordered dropdowns. It carries an accessible name and is operable by keyboard. Activating it MUST, in this order: write the draft to the route's query string as one **replace** (scope and `from` / `to` together, see `app-shell`), take the draft as the new applied selection, and issue exactly one request built from it (parameter rules in `graph-data-source`). Query with a draft equal to the applied selection is a re-run and is allowed.

Query MUST be unavailable while the draft cannot be sent: on the Sankey page when `az`, `env` or at least one root is missing, or a `pod` root is malformed; the reason MUST be stated beside the control. It MUST NOT be unavailable merely because a request is in flight — in that state it becomes Cancel (next requirement).

#### Scenario: Query writes the URL and sends once

- **WHEN** on `/graph` with an empty applied selection the operator selects cluster `prod` and namespace `shop` and activates Query
- **THEN** the address bar becomes `/graph?cluster=prod&namespace=shop&from=…&to=…` with the browser history length unchanged, exactly one request to `endpoints.graph` is issued carrying `cluster=prod&namespace=shop`, and once it succeeds the Query control no longer indicates a pending draft

#### Scenario: Query is unavailable with an incomplete Sankey scope

- **WHEN** on `/sankey` `az` and `env` are selected but no root has been added
- **THEN** Query is presented as unavailable with text stating that at least one root is required, and activating it issues no request

### Requirement: Cancel aborts the in-flight request

While a request committed from this page is in flight, the Query control SHALL become **Cancel**. Activating it MUST abort the request, MUST keep the last successfully drawn data (or the awaiting-Query state when there is none), MUST leave the draft and the applied selection unchanged, and MUST present the source as **cancelled** in the status indicator until the next commit, reload or auto-refresh — not as an error, and not as loading. A cancelled request MUST NOT update any state when its response arrives late. Cancel MUST also stop the auto-refresh timer until the next commit or manual reload: a request the operator stopped because it was too big must not be re-issued behind their back thirty seconds later.

#### Scenario: Cancel keeps the previous drawing

- **WHEN** a committed storage-graph request has been in flight for several seconds and the operator activates Cancel
- **THEN** the request is aborted, the previously drawn chart stays visible, the status indicator reads cancelled with no error message, the controls still show the draft as edited, and no auto-refresh request is issued afterwards until the operator commits or reloads again

#### Scenario: Cancel before any data

- **WHEN** the first committed request of a mount is cancelled
- **THEN** the view area shows the awaiting-Query explanation (not loading, not error, not empty), and Query is available again

### Requirement: No request on mount

Mounting a page — by deep link, refresh, the nav bar's view links, or Back / Forward — MUST NOT issue a request, even when the URL carries a complete scope. The URL's scope MUST seed the draft (every control shows what the URL named; a `from` / `to` absent from the URL is filled from the shell's fallback and written once, see `app-shell`), and the view area MUST show an **awaiting-Query** explanation distinct from loading, error and empty: it states that nothing has been requested yet and points at the Query control. Reload and auto-refresh MUST be unavailable until the first commit of that mount.

`demoMode` is exempt from this whole capability: the fixtures render on mount as before, the Query control is not shown, and the shell's reload regenerates the fixture.

#### Scenario: A deep link prefills and waits

- **WHEN** the operator opens `/sankey?az=zone-a&env=prod&aggr=aggr1&mode=write`
- **THEN** `az`, `env`, the `aggr1` root and the Write mode are shown on the controls, the request count to `endpoints.storageGraph` is 0, the view area shows the awaiting-Query explanation, and the nav bar's Reload is unavailable; activating Query issues exactly one request carrying `az=zone-a&env=prod&aggr=aggr1`

#### Scenario: Refresh does not re-run the last query

- **WHEN** the operator has committed a Graph query and refreshes the browser
- **THEN** the filter bar shows the committed selection from the URL, no request is issued, and the awaiting-Query explanation is shown until Query is activated

#### Scenario: Demo mode renders on mount

- **WHEN** `demoMode` is `true` and the operator opens `/graph` or `/sankey`
- **THEN** the fixture renders immediately, no Query control is in the DOM, and no awaiting-Query explanation is shown

### Requirement: Reload and auto-refresh re-run the applied selection

The shell's Reload action and the configured auto-refresh (see `app-shell`) SHALL re-issue the request of the **applied** selection, never of the draft: a draft edited but not committed MUST NOT leak into a refresh. Both MUST be unavailable / inert before the first commit of the mount. Auto-refresh MUST count from the last commit, manual reload or completed refresh, and MUST stay stopped after a Cancel until the next commit or manual reload.

#### Scenario: A pending draft does not leak into a refresh

- **WHEN** the applied selection is `namespace=shop`, the operator adds `infra` to the draft without committing, and then activates Reload
- **THEN** the request carries `namespace=shop` only, and the Query control still indicates a pending draft afterwards

#### Scenario: Auto-refresh waits for the first commit

- **WHEN** `refreshIntervalSeconds` is `30` and the operator stays on a freshly mounted `/graph` for two minutes without activating Query
- **THEN** no request is issued during that time; after Query is activated, requests follow every 30 seconds
