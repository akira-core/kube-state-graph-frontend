## MODIFIED Requirements

### Requirement: View routing

The application SHALL provide the following client-side routes, all paths relative to the app base URL (`/ksg/graph` etc. when deployed at `/ksg/`):

- `/graph` → the **Graph page** (cytoscape.js canvas, behavior in `graph-view`), with its own filter bar and graph data source.
- `/sankey` → the **Sankey page** (behavior in `storage-flow-sankey`), with its own estate / root control bar and storage-graph data source.
- `/` → MUST redirect to `/graph` by replacing the history entry (replace), so that "Back" does not return to `/`.
- Any other path → the **not-found page** screen, shown in the view area below the nav bar, containing a link back to `/graph`; the nav bar remains shown on this screen.

Trailing slashes MUST be treated as equivalent (`/graph/` is the same as `/graph`). Switching between views MUST be client-side navigation: it MUST NOT trigger a full document load, and MUST NOT re-read the configuration document. The browser tab title SHALL reflect the current view (including the application name and the view name).

Each route MUST render **its own page component**; the page of a non-current route MUST NOT stay mounted and MUST NOT exist hidden in the DOM. Switching routes unmounts the previous page and mounts the new one — **switch = reset**. The nav bar's two view links MUST point to the **bare paths** (`/graph`, `/sankey`, without query); clicking one enters that page with its initial scope.

The route's **query string is the carrier of that page's applied scope and applied view time range** (the Grafana dashboard-variable model, gated by `explicit-query`): for the Graph page, the filter parameters specified by `graph-filters`; for the Sankey page, the estate / root / narrowing specified by `storage-flow-sankey` plus its immediate view values `mode` and `top_pods`; both additionally carry `from` / `to` (see "View time range"). Parameter names MUST mirror the backend request parameter names (multiple values expressed as repeated keys), with no prefix; `mode` and `top_pods` are the two client-side exceptions and are never sent. A Query commit MUST update the query with **replace** (no new history entry), writing scope and time together in one write; the immediate view values (`mode`, `top_pods`) likewise write with replace on change; draft edits write nothing. Switching between routes MUST be a push. The query carries only scope, view values and time range — selection, collapse, viewport, search, legend, pod-parent mode, the Sankey layout (`Flat` / `Node`) and focus mode MUST NOT enter the URL. A page MUST ignore parameters it does not recognize, and strip them on its next write of the query.

#### Scenario: Root path redirects to the Graph view

- **WHEN** the user opens `/`
- **THEN** the address bar becomes `/graph`, the Graph view is shown, and pressing "Back" does not return to `/`

#### Scenario: Opening the Sankey view

- **WHEN** the user opens `/sankey` or clicks the Sankey link in the nav bar
- **THEN** the view area shows the Sankey view, and the address bar is `/sankey`

#### Scenario: Unknown path shows the not-found page

- **WHEN** the user opens `/foo/bar`
- **THEN** the view area shows the not-found page screen, containing a link back to `/graph`, and the nav bar is still shown; after clicking that link the Graph view is shown

#### Scenario: View switching does not reload the document

- **WHEN** the user clicks the Sankey link in the nav bar while on `/graph`
- **THEN** no full document load occurs and the configuration document is not re-requested; the Sankey page mounts and awaits Query according to "Page-owned data lifecycle"

#### Scenario: Switching routes resets

- **WHEN** the user, on `/graph?namespace=shop`, clicks the Sankey link in the nav bar, then clicks the Graph link
- **THEN** the address bar is `/graph` (without `namespace`), the Graph page remounts with its initial scope and awaits Query; the previous selection, collapse and viewport no longer exist

#### Scenario: In-page changes update the query with replace

- **WHEN** the user, on `/graph`, selects namespace `shop` and then `infra`, and activates Query
- **THEN** the address bar is unchanged until Query, then becomes `/graph?namespace=shop&namespace=infra&from=…&to=…`, and the browser history length is unchanged; pressing "Back" leaves `/graph` rather than returning to the previous namespace selection

#### Scenario: Unknown parameters are ignored and stripped

- **WHEN** the user opens `/graph?foo=bar&namespace=shop` and activates Query
- **THEN** the Graph page fetches with `namespace=shop`, `foo` affects no behavior, and the address bar written by that commit no longer contains `foo`

### Requirement: Deep links and browser history

The URL of any route MUST be directly openable and refreshable: after the user refreshes on `/sankey`, they MUST see the Sankey view again (not a 404 or the Graph view). This behavior depends on the server answering unknown paths with `index.html` as a history fallback (provided by `container-deployment` in production; the dev server MUST provide it too). The browser's "Back / Forward" MUST switch between the Graph and Sankey views in history order, and likewise MUST NOT trigger a full document load.

A URL with a query MUST likewise be directly openable, shareable and refreshable: after `/sankey?az=zone-a&env=prod&aggr=aggr1&mode=write` is opened, every control MUST show that scope and mode and the page MUST await Query without issuing a request (see `explicit-query`); the request Query then sends MUST carry exactly that scope. The browser's "Back / Forward" restores the full address **including the query**, so Sankey → Locate → Back MUST return to the Sankey scope as it was on leaving, prefilled on the controls.

#### Scenario: Refreshing on the Sankey view

- **WHEN** the user refreshes on `/sankey?az=zone-a&env=prod&aggr=aggr1`
- **THEN** the application restarts (re-reading the configuration) and shows the Sankey view with the scope and time range carried by the URL restored on the controls; no request is issued until Query, and what Query then fetches is the storage-graph data — the Graph page is not mounted, and `endpoints.graph` is not fetched

#### Scenario: Sharing a deep link

- **WHEN** the user opens `https://ops.example/ksg/sankey` directly in a new tab
- **THEN** the Sankey view is shown

#### Scenario: Back returns to the previous view

- **WHEN** the user switches from `/graph` to `/sankey` and then presses "Back"
- **THEN** the Graph view is shown, the address bar is `/graph`, and no full document load occurs

#### Scenario: Back restores the Sankey scope

- **WHEN** the user, on `/sankey?az=zone-a&env=prod&aggr=aggr1`, selects a node and Locates to `/graph`, then presses "Back"
- **THEN** the address bar returns to `/sankey?az=zone-a&env=prod&aggr=aggr1…`, the Sankey page remounts with the `az` / `env` / root controls showing the same values and awaits Query, and the request Query then sends carries that scope

### Requirement: View time range

The nav bar SHALL provide a **view time range** control, whose options are the relative windows `1h` / `6h` / `24h` / `7d` and one custom absolute window (a start and an end, each a point in time). The default MUST be `24h`. The control edits the **draft** time range (see `explicit-query`): changing it MUST NOT issue a request and MUST NOT write the query string. The current page's Query commit takes the draft as the **applied** time range, at which point it MUST be saved in browser local storage (carried across refreshes and new tabs) **and written to the current route's query** (`from` / `to`) as part of that page's single canonical write: a relative window is written as `from=now-<window>&to=now` (`<window>` limited to `1h` / `6h` / `24h` / `7d`), an absolute window as two Unix seconds. The order of precedence for the draft on mount MUST be: the URL's `from` / `to` (if valid) → the browser local storage value → `24h`; when the URL lacked a valid pair the page MUST write the result back to the query once with replace on mount, so that the URLs of `/graph` and `/sankey` **always carry** `from` / `to` — the time range has a local fallback, so "not written in the URL" is ambiguous, unlike scope parameters where "not written = default". An invalid combination in the URL (unparseable, `from` ≥ `to`, an unknown relative form) MUST be ignored as a whole and fall back to the next layer; it MUST NOT take just one half. It MUST NOT be written to the runtime config. A relative window MUST be converted in place to the current absolute start and end on every read (`from` = now minus that length, `to` = now), rather than frozen at the moment of selection.

The query string MUST have exactly **one writer per page**: the page's canonical serializer, which emits scope, view values and `from` / `to` together from the values the page holds. The shell MUST NOT write `from` / `to` on its own, and neither the shell nor the page MUST re-derive the draft from a query string it has itself just written. Two writers with different notions of truth — one taking the URL as the source, the other taking its own state — is exactly what produced the observed revert: selecting `1h` wrote the URL three times within 25 ms and left the control on `24h`.

The view time range is the shell's only **cross-view shared** input, with three consumers of the **applied** value:

1. the `start` / `end` of `GET /v1/graph` (Graph view);
2. the `start` / `end` of `GET /v1/storage-graph` (Sankey view);
3. the `from_time` / `to_time` of the node detail's Dashboard queries (Unix seconds, see `node-detail`).

The first two are **required parameters** — the backend rejects a missing value with 400 `missing_start` / `missing_end`, and neither endpoint has a relative-time form, so the window is resolved by the frontend **at the moment each request is sent** (see the request assembly requirement in `graph-data-source`). Change history queries carry no time parameters, and MUST NOT refetch because of it.

A committed change of the view time range reaches the **current page's** data on that commit; the other page is not mounted and MUST NOT produce a request because of it, and on its next mount it seeds its draft from the URL or the local storage value. The commit MUST NOT reset any view state of the current page (selection, collapse, viewport, filters, search, the Sankey's mode and selectors). The control MUST be reachable and activatable by keyboard, and have an accessible name.

#### Scenario: Default is 24h and the choice carries across refreshes

- **WHEN** the user opens the application for the first time
- **THEN** the view time range control shows `24h`
- **AND** after the user changes it to `6h`, activates Query and refreshes the page, the control still shows `6h`

#### Scenario: A selected window sticks

- **WHEN** the user, on `/graph?from=now-24h&to=now`, selects `1h`
- **THEN** two seconds later the control still shows `1h`, the query string has not been rewritten, no request has been issued; activating Query then issues exactly one request whose window is one hour long and replaces the address bar with `from=now-1h&to=now`

#### Scenario: Relative window is converted to the current moment on read

- **WHEN** the applied view time range is `1h`, and the user selects a node and triggers its Dashboard query
- **THEN** that query's `from_time` / `to_time` are the Unix seconds from "the moment of the query minus one hour" to "the moment of the query", rather than values frozen when that window was selected

#### Scenario: Changing the time range refetches the loaded source

- **WHEN** the user, after `/graph` has finished loading, changes the view time range from `24h` to `1h`
- **THEN** no request is issued and the Query control indicates a pending draft; after Query the application issues one new request to `endpoints.graph` with the new `start` / `end`, and the request count to `endpoints.storageGraph` remains 0 (the Sankey page is not mounted)
- **AND** no request is issued to `endpoints.codeChanges` / `endpoints.configChanges`
- **AND** the current selection, collapse, viewport, filter and search state are all unchanged

#### Scenario: Written to the URL, and the URL takes precedence

- **WHEN** the browser local storage value is `6h`, and the user opens `/graph?from=now-1h&to=now`
- **THEN** the control shows `1h`; after the user changes it to `7d` and activates Query, the request's `start` / `end` are now minus seven days to now, the address bar becomes `from=now-7d&to=now` (replace), the local storage value is updated to `7d`, and the application does not write to the runtime config

#### Scenario: Bare path gets the time range filled in

- **WHEN** the local storage value is `6h`, and the user opens `/sankey`
- **THEN** the address bar immediately (replace) becomes `/sankey?from=now-6h&to=now`, the browser history length is unchanged, and no request is issued

#### Scenario: Invalid from / to is ignored as a whole

- **WHEN** the user opens `/graph?from=1700000000&to=1600000000` (`from` ≥ `to`)
- **THEN** both are ignored, the control is presented with the local storage value (or `24h`), and the address bar is replaced with that value's `from` / `to`

### Requirement: Page-owned data lifecycle

Each page SHALL hold **its own** data source (fetching and normalization behavior in `graph-data-source`):

| Page      | Endpoint                 | When first fetched                                                                                                      |
| --------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `/graph`  | `endpoints.graph`        | on the first Query commit of that mount                                                                                 |
| `/sankey` | `endpoints.storageGraph` | on the first Query commit of that mount whose draft holds `az`, `env` and at least one root (see `storage-flow-sankey`) |

Mounting a page seeds its draft from the URL and issues no request (see `explicit-query`). The source's in-flight request, `status`, error message, last successful load time, retry and auto-refresh timers all live and die with the page: unmounting the page MUST abort the in-flight request and discard its result, and stop the timers; remounting MUST prefill the draft from the scope carried by the URL and await Query, and MUST NOT reuse the data of the previous mount — "view switching does not refetch" is no longer a requirement; switch = reset. The shell MUST NOT hold the data of any source, and MUST NOT hand one page's data to another page.

A page that has never been mounted MUST NOT produce any request (including those triggered by auto-refresh and time range changes) — this is the natural consequence of `/v1/storage-graph` requiring single values for `az` / `env` and a root: with no page there is no valid request that could be sent.

During a reload within the same page (manual or automatic), the source's previously successfully loaded data MUST remain shown, and the view must not be cleared; when a reload fails, the previous data MUST be kept and the error shown in the status indicator, and the existing view MUST NOT be replaced by an error screen. When the first load fails there is no previous data, and the page is presented according to its error state.

#### Scenario: Switching routes refetches

- **WHEN** the user, after committing a query on `/graph`, switches to `/sankey` and then back to `/graph`
- **THEN** on the second entry to `/graph` the Graph page remounts, shows the awaiting-Query state with its controls prefilled from the URL, and issues no request until Query; during this, requests to `endpoints.storageGraph` are issued only while `/sankey` is mounted and a complete draft has been committed there

#### Scenario: Leaving a page aborts the in-flight request

- **WHEN** a request for `/graph` is in flight, and the user switches to `/sankey`
- **THEN** that request is aborted (or its result discarded), updates no state, and triggers no error indication

#### Scenario: An unmounted page does not fetch

- **WHEN** after the application starts the user stays only on `/graph`, and several auto-refreshes occur during that time
- **THEN** the request count to `endpoints.storageGraph` is 0

#### Scenario: Old data is kept during a reload

- **WHEN** the current page's data is loaded, and the user triggers a reload while the new request is in flight
- **THEN** the page keeps showing the existing data, and the status indicator shows loading

#### Scenario: One side failing does not affect the other

- **WHEN** the reload of `/sankey` responds with HTTP 500
- **THEN** Sankey still shows its previously successfully loaded data and presents the error in the status indicator; on switching to `/graph`, that page mounts with its own state and does not show the configuration error screen

### Requirement: Reload action and status indicator

The nav bar's "Reload data" action SHALL immediately trigger one refetch of **the current view's data source** with its **applied** selection — the graph source on the Graph view, the storage-graph source on the Sankey view; while the request is in flight the action MUST present an in-progress state and MUST NOT issue a second concurrent request (cancelling is the page's Query / Cancel control, see `explicit-query`). The action MUST NOT refresh the source of a non-current view. The action MUST be presented as unavailable (rather than issuing a request that is certain to be pointless or rejected with 400) before the first Query commit of the current mount, when the Sankey view's `az` / `env` / root are not all present, or when `endpoints.storageGraph` is not configured. When `demoMode` is `true`, this action MUST regenerate the data from the corresponding fixture without issuing a network request and MUST be available on mount.

When the configured `refreshIntervalSeconds` is greater than `0`, the shell SHALL automatically trigger a reload every that many seconds, likewise **acting only on the current view's source** and only after its first commit; if that source's previous request is still in flight, that tick MUST be skipped; a manual reload or a Query commit MUST restart the timer; a Cancel MUST stop it until the next commit or manual reload. The timer lives and dies with the page: unmounting stops it, and after a new page mounts it counts from that page's first commit. When `refreshIntervalSeconds` is `0` there MUST NOT be auto-refresh.

The status indicator MUST reflect the state of **the current view's source**: an awaiting-Query indication before the first commit; a loading indication while loading; when ready, the time of that source's last successful load (presented in the user's local time); a cancelled indication after a Cancel, until the next request; an error state on error, and the error message MUST be readable via the indicator (for example by expanding or a tooltip); when auto-refresh is enabled its interval MUST be indicated. When a new page mounts the indicator MUST be presented with that page's source's initial state (awaiting Query), and MUST NOT carry over the previous page's time or error.

#### Scenario: Manual reload

- **WHEN** the user, after a committed query, clicks "Reload data" on the Graph view
- **THEN** the application issues exactly one request to `endpoints.graph` and zero to `endpoints.storageGraph`; on success the status indicator updates to the new last load time

#### Scenario: Reloading on the Sankey view refetches only storage-graph

- **WHEN** the user, after a committed query, clicks "Reload data" on the Sankey view
- **THEN** the application issues only one request to `endpoints.storageGraph`; on switching back to `/graph`, the Graph page remounts and awaits Query

#### Scenario: Reload is unavailable before the first commit

- **WHEN** the user has just mounted `/graph` and has not activated Query
- **THEN** "Reload data" is presented as unavailable, the status indicator shows awaiting Query, and clicking it issues no request

#### Scenario: Reload is unavailable when az / env are not both selected

- **WHEN** the user is on the Sankey view and no root has been added
- **THEN** "Reload data" is presented as unavailable, and clicking it issues no request

#### Scenario: No duplicate sending while in flight

- **WHEN** a reload request is in flight, and the user clicks "Reload data" again
- **THEN** no additional request is issued, and the action stays in the in-progress state until the existing request completes

#### Scenario: The indicator shows a cancel

- **WHEN** the user activates Cancel during a refresh
- **THEN** the status indicator reads cancelled, shows no error message, keeps the previous last load time visible, and returns to loading on the next commit or reload

#### Scenario: Auto-refresh

- **WHEN** `refreshIntervalSeconds` is `30`, and the user commits a query on the Graph view and stays there
- **THEN** the application issues one request to `endpoints.graph` roughly every 30 seconds, and the status indicator indicates auto-refresh as 30s; after a manual reload, the next auto-refresh counts 30 seconds from that point in time
- **AND** after switching to `/sankey`, the Graph page's timer stops as it unmounts, and no request is issued there until a query is committed, after which auto-refresh issues one request to `endpoints.storageGraph` every 30 seconds

#### Scenario: Auto-refresh off

- **WHEN** `refreshIntervalSeconds` is `0`
- **THEN** the application fetches only on Query and manual reload, and the status indicator does not indicate auto-refresh

#### Scenario: Demo mode reload

- **WHEN** `demoMode` is `true`, and the user clicks "Reload data" on either view
- **THEN** no network request is issued, that view's data is regenerated from its corresponding fixture, and the status indicator updates the last load time
