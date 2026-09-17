## MODIFIED Requirements

### Requirement: View routing

The application SHALL provide exactly three client-side routes, all paths relative to the app base URL (`/ksg/graph` etc. when deployed at `/ksg/`), each a **standalone page** reached by its URL and by nothing in the application's own chrome:

- `/graph` → the **Storage Graph page** (cytoscape.js canvas, behavior in `graph-view`), with its own filter bar and graph data source.
- `/sankey` → the **Storage Sankey page** (behavior in `storage-flow-sankey`), with its own estate / root control bar and storage-graph data source.
- `/network/sankey` → the **Network Sankey page** (behavior in `network-trace`), with the trace scope bar and the trace data source.
- `/` → MUST redirect to `/graph` by replacing the history entry (replace), keeping the query string, so that "Back" does not return to `/`.
- `/network` → MUST redirect to `/network/sankey` by replacing the history entry, **keeping the query string**, so a shared `/network?hostname=…` link opens the Network Sankey with that scope.
- Any other path — `/network/graph` included — → the **not-found page** screen, shown in the view area below the nav bar, containing a link to `/graph`; the nav bar remains shown on this screen, and no request is issued.

Trailing slashes MUST be treated as equivalent (`/graph/` is the same as `/graph`). Every navigation the application itself performs — the two redirects, the Storage Sankey's Locate into `/graph`, the not-found page's link — and the browser's Back / Forward within one document MUST be client-side: it MUST NOT trigger a full document load, and MUST NOT re-read the configuration document. The browser tab title SHALL reflect the current page (the application name and the page name: `Graph`, `Sankey`, `Network Sankey`).

Each route MUST render **its own page component**; the page of a non-current route MUST NOT stay mounted and MUST NOT exist hidden in the DOM. Entering a route unmounts the previous page and mounts the new one — **switch = reset**. There is no nav-bar link between pages; a page is entered by its URL, by a Locate, by a redirect or by the browser's history.

The route's **query string is the carrier of that page's applied scope and applied view time range** (the Grafana dashboard-variable model, gated by `explicit-query`): for the Storage Graph page, the filter parameters specified by `graph-filters`; for the Storage Sankey page, the estate / root / narrowing specified by `storage-flow-sankey` plus its immediate view values `mode` and `top_pods`; for the Network Sankey page, the trace parameters specified by `network-trace` plus its immediate view value `min_bps`; all additionally carry `from` / `to` (see "View time range"). Parameter names MUST mirror the backend request parameter names (multiple values expressed as repeated keys), with no prefix; `mode`, `top_pods` and `min_bps` are the client-side exceptions and are never sent. A Query commit MUST update the query with **replace** (no new history entry), writing scope and time together in one write; the immediate view values likewise write with replace on change; draft edits write nothing. A navigation between routes (a Locate, the not-found link) MUST be a push. The query carries only scope, view values and time range — selection, collapse, viewport, search, legend, pod-parent mode, the Storage Sankey's layout (`Flat` / `Node`) and SVM display (`Column` / `Group`), the Network Sankey's `Group` and `Order`, and focus mode MUST NOT enter the URL. A page MUST ignore parameters it does not recognize, and strip them on its next write of the query.

#### Scenario: Root path redirects to the Graph view

- **WHEN** the user opens `/`
- **THEN** the address bar becomes `/graph`, the Storage Graph page is shown, and pressing "Back" does not return to `/`

#### Scenario: Opening the Sankey view

- **WHEN** the user opens `/sankey`
- **THEN** the view area shows the Storage Sankey page, and the address bar is `/sankey`

#### Scenario: `/network` redirects and keeps the query

- **WHEN** the user opens `/network?hostname=sw-tor-1&from=now-1h&to=now`
- **THEN** the address bar becomes `/network/sankey?hostname=sw-tor-1&from=now-1h&to=now`, the history length is unchanged, the Network Sankey is shown with `sw-tor-1` prefilled, and no request is issued

#### Scenario: Unknown Network view shows the not-found page

- **WHEN** the user opens `/network/graph?hostname=sw-tor-1&from=now-1h&to=now`, or `/network/foo`
- **THEN** the view area shows the not-found page screen with the nav bar still shown, the document title is the application name alone, and no request is issued to any endpoint

#### Scenario: Unknown path shows the not-found page

- **WHEN** the user opens `/foo/bar`
- **THEN** the view area shows the not-found page screen, containing a link to `/graph`, and the nav bar is still shown; after activating that link the Storage Graph page is shown without a full document load

#### Scenario: View switching does not reload the document

- **WHEN** the user, on `/sankey` with a drawn chart, clicks the `aggr1` card (the Storage Sankey's Locate)
- **THEN** the address bar becomes `/graph` (push), no full document load occurs, the configuration document is not re-requested, and the Storage Sankey page is unmounted

#### Scenario: Switching routes resets

- **WHEN** the user, on `/graph?namespace=shop` reached by a Locate from `/sankey?az=zone-a&env=prod&aggr=aggr1`, selects a node and collapses a container, presses Back, and clicks the `aggr1` card again
- **THEN** the address bar is `/graph` (with only `from` / `to`, without `namespace`), the Storage Graph page remounts with its initial scope and awaits Query; the previous selection, collapse and viewport no longer exist

#### Scenario: Switching categories resets

- **WHEN** the user, on `/network/sankey?hostname=sw-tor-1&from=…&to=…` with a drawn chart, presses Back to the `/graph` history entry they arrived from
- **THEN** the Network Sankey page unmounts and aborts any in-flight request, the Storage Graph page mounts awaiting Query with the scope of that entry, and Forward remounts the Network Sankey awaiting Query with `sw-tor-1` prefilled and no drawn chart

#### Scenario: Tab titles name the Network views

- **WHEN** the user opens `/network/sankey`, then `/network/graph`
- **THEN** the document title ends with `— Network Sankey`, then is the application name alone (the not-found page)

#### Scenario: Tab titles name the page

- **WHEN** the user opens `/graph`, then `/sankey`
- **THEN** the document title ends with `— Graph`, then `— Sankey`

#### Scenario: In-page changes update the query with replace

- **WHEN** the user, on `/graph`, selects namespace `shop` and then `infra`, and activates Query
- **THEN** the address bar is unchanged until Query, then becomes `/graph?namespace=shop&namespace=infra&from=…&to=…`, and the browser history length is unchanged; pressing "Back" leaves `/graph` rather than returning to the previous namespace selection

#### Scenario: Unknown parameters are ignored and stripped

- **WHEN** the user opens `/graph?foo=bar&namespace=shop` and activates Query
- **THEN** the Storage Graph page fetches with `namespace=shop`, `foo` affects no behavior, and the address bar written by that commit no longer contains `foo`

### Requirement: Top nav bar

The application SHALL persistently show, above the view area, a nav bar of fixed height that does not scroll with content; it is present on every page and on the not-found page screen. **The sole exception is the focus mode of either Sankey page** (the Storage Sankey's, see "Focus mode" in `storage-flow-sankey`, and the Network Sankey's, see `network-trace`): while it is active the nav bar MUST collapse so the diagram fills the window, and on leaving focus mode it MUST be restored immediately. In any other situation the nav bar MUST NOT be hidden. The nav bar MUST contain:

1. the application name;
2. the theme switching control (see "Theme switching and persistence");
3. the "Reload data" action (see "Reload action and status indicator");
4. the status indicator (see "Reload action and status indicator");
5. a **demo mode badge** shown only when `demoMode` is `true`, whose text states explicitly that the data is built-in demo data; when `demoMode` is `false` the badge MUST NOT exist in the DOM;
6. the view time range control (see "View time range").

The nav bar MUST NOT contain a link to any page: there is no category control and no view control, and no page is reachable from another through the shell. The only in-application links between pages are the not-found page's link to `/graph` and the Storage Sankey's Locate (see `storage-flow-sankey`), both owned by their page.

Below the nav bar there SHALL be a further row, the **page-owned control bar**, rendered by the current page rather than held by the shell:

- for the Storage Graph page, the filter bar (see `graph-filters`);
- for the Storage Sankey page, its estate / root / narrowing controls, the Top pods control and the Query action, followed on the same row by the page's **view-controls group**: the mode selector, the `Layout` and `SVM` controls, the Top pods cut statement and the legend (see `storage-flow-sankey`);
- for the Network Sankey page, the trace scope controls and the Query action, followed by its view-controls group: `Group`, `Order`, `Min Δ` with its readout and `Clear`, the hidden and warnings pills and the legend (see `network-trace`).

A view-controls group sits after the Query action and wraps onto the row beneath, inside the same control bar, when the width is short; it MUST NOT be a separate bar with its own border between the control bar and the view area, and a Sankey page MUST NOT draw a title-bar row of its own above its chart. The scope controls are presented with the same dropdown component (contract in `graph-filters`), but the selections MUST be independent — the same dimension appearing on two pages is deliberate: they are sent to different endpoints, differ in semantics and cardinality, and each exists only in its own page's URL query.

#### Scenario: The nav bar links nowhere

- **WHEN** assistive technology enumerates the links inside the navigation landmark on `/graph`, `/sankey` and `/network/sankey`
- **THEN** it finds none; the nav bar holds the application name, the view time range control, the status indicator with the Reload action, the theme control and (in demo mode) the badge

#### Scenario: The current view's link is presented as active

- **WHEN** the user is on `/sankey`
- **THEN** the nav bar holds no link named `Graph`, `Sankey`, `Storage` or `Network` to present as active; the current page is identified by the document title `— Sankey` and by its own control bar

#### Scenario: The current category and view are presented as active

- **WHEN** the user is on `/network/sankey`
- **THEN** no control in the nav bar is marked as the current page and no `Category` or `View` group exists; the document title ends with `— Network Sankey`

#### Scenario: Control bar follows the view switch

- **WHEN** the user, on `/sankey` with a drawn chart, clicks the `aggr1` card (Locate to `/graph`) and then presses Back
- **THEN** the Sankey control bar disappears as its page unmounts and the filter bar appears as the Storage Graph page mounts; after Back the Sankey control bar is back with the URL's scope prefilled, its view-controls group at `Both` / `Flat` / `Column`, awaiting Query

#### Scenario: The trace scope bar stays across the Network views

- **WHEN** the user, on `/network/sankey` with `sw-tor-1` typed into the draft and Query pending, switches `Group` to `Cluster` and `Order` to `Barycenter`
- **THEN** the same trace scope bar is shown with `sw-tor-1` still in the draft and the same dirty state; the view controls change the drawing only and never the draft

#### Scenario: The control bar is the page's own

- **WHEN** the user opens `/sankey`, then `/graph`, then `/network/sankey`
- **THEN** below the nav bar the first shows the Sankey scope controls with its view-controls group after Query; the second shows the filter bar and no view-controls group; the third shows the trace scope controls with its view-controls group after Query; and no page shows a second bordered row above its chart

#### Scenario: The view-controls group wraps inside the control bar

- **WHEN** the window is too narrow for the Sankey scope controls, Query and the view-controls group on one row
- **THEN** the view-controls group wraps beneath the scope controls inside the same control bar, the chart area begins directly under it, and no additional bordered bar appears

#### Scenario: Same-named dimensions do not affect each other

- **WHEN** the user commits `az: zone-a` and `az: zone-b` on `/graph`, and later commits `az: zone-c` on `/sankey`
- **THEN** each page keeps its own values: the graph request for `/graph?az=zone-a&az=zone-b` carries `az=zone-a&az=zone-b`, and the storage-graph request for `/sankey?az=zone-c` carries `az=zone-c`; neither page's URL contains the other page's parameters

#### Scenario: Demo mode badge

- **WHEN** the configured `demoMode` is `true`
- **THEN** the nav bar shows the demo mode badge on every page

#### Scenario: No badge outside demo mode

- **WHEN** the configured `demoMode` is `false`
- **THEN** the nav bar does not contain the demo mode badge

#### Scenario: Sankey focus mode collapses the nav bar

- **WHEN** the user enters focus mode on the Storage Sankey page or on the Network Sankey page, then leaves it
- **THEN** while in it the nav bar is not shown and the diagram area fills the window; after leaving, the nav bar is restored immediately, and its theme switch and status indicator keep the state they had before entering

### Requirement: Page-owned data lifecycle

Each page SHALL hold **its own** data source (fetching and normalization behavior in `graph-data-source`):

| Page              | Endpoint                 | When first fetched                                                                                                      |
| ----------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `/graph`          | `endpoints.graph`        | on the first Query commit of that mount                                                                                 |
| `/sankey`         | `endpoints.storageGraph` | on the first Query commit of that mount whose draft holds `az`, `env` and at least one root (see `storage-flow-sankey`) |
| `/network/sankey` | `endpoints.trace`        | on the first Query commit of that mount whose draft holds a hostname and no problem (see `network-trace`)               |

Mounting a page seeds its draft from the URL and issues no request (see `explicit-query`). The source's in-flight request, `status`, error message, last successful load time, retry and auto-refresh timers all live and die with the page: unmounting the page MUST abort the in-flight request and discard its result, and stop the timers; remounting MUST prefill the draft from the scope carried by the URL and await Query, and MUST NOT reuse the data of the previous mount — switch = reset between pages. The shell MUST NOT hold the data of any source, and MUST NOT hand one page's data to another page.

A page that has never been mounted MUST NOT produce any request (including those triggered by auto-refresh and time range changes).

During a reload within the same page (manual or automatic), the source's previously successfully loaded data MUST remain shown, and the view must not be cleared; when a reload fails, the previous data MUST be kept and the error shown in the status indicator, and the existing view MUST NOT be replaced by an error screen. When the first load fails there is no previous data, and the page is presented according to its error state.

#### Scenario: Switching routes refetches

- **WHEN** the user, after committing a query on `/sankey`, clicks a card (Locate to `/graph`) and then presses Back
- **THEN** the Storage Sankey page remounts, shows the awaiting-Query state with its controls prefilled from the URL, and issues no request until Query; the storage-graph request count grew only while a complete draft was committed on `/sankey`

#### Scenario: Leaving a page aborts the in-flight request

- **WHEN** a request for `/sankey` is in flight, and the user clicks a card of the previously drawn chart (Locate to `/graph`)
- **THEN** that request is aborted (or its result discarded), updates no state, and triggers no error indication; the Storage Graph page mounts with its own initial state

#### Scenario: Leaving the Network category aborts its request

- **WHEN** a request to `endpoints.trace` is in flight on `/network/sankey` and the user presses Back to a `/graph` history entry
- **THEN** that request is aborted, updates no state, triggers no error indication, and the Storage Graph page mounts with its own initial state

#### Scenario: An unmounted page does not fetch

- **WHEN** after the application starts the user stays only on `/graph`, and several auto-refreshes occur during that time
- **THEN** the request counts to `endpoints.storageGraph` and `endpoints.trace` are 0

#### Scenario: Old data is kept during a reload

- **WHEN** the current page's data is loaded, and the user triggers a reload while the new request is in flight
- **THEN** the page keeps showing the existing data, and the status indicator shows loading

#### Scenario: One side failing does not affect the other

- **WHEN** the reload of `/sankey` responds with HTTP 500
- **THEN** the Sankey still shows its previously successfully loaded data and presents the error in the status indicator; after a Locate to `/graph`, that page mounts with its own state and does not show the configuration error screen

### Requirement: Reload action and status indicator

The nav bar's "Reload data" action SHALL immediately trigger one refetch of **the current page's data source** with its **applied** selection — the graph source on the Storage Graph page, the storage-graph source on the Storage Sankey page, the trace source on the Network Sankey page; while the request is in flight the action MUST present an in-progress state and MUST NOT issue a second concurrent request (cancelling is the page's Query / Cancel control, see `explicit-query`). The action MUST NOT refresh the source of a non-current page. The action MUST be presented as unavailable (rather than issuing a request that is certain to be pointless or rejected with 400) before the first Query commit of the current mount, when the Storage Sankey page's `az` / `env` / root are not all present, when the Network Sankey page's draft has no hostname or has a problem, or when the current page's endpoint (`endpoints.storageGraph`, `endpoints.trace`) is not configured. When `demoMode` is `true`, this action MUST regenerate the data from the corresponding fixture without issuing a network request and MUST be available on mount.

When the configured `refreshIntervalSeconds` is greater than `0`, the shell SHALL automatically trigger a reload every that many seconds, likewise **acting only on the current page's source** and only after its first commit; if that source's previous request is still in flight, that tick MUST be skipped; a manual reload or a Query commit MUST restart the timer; a Cancel MUST stop it until the next commit or manual reload. The timer lives and dies with the page: unmounting stops it, and after a new page mounts it counts from that page's first commit. When `refreshIntervalSeconds` is `0` there MUST NOT be auto-refresh.

The status indicator MUST reflect the state of **the current page's source**: an awaiting-Query indication before the first commit; a loading indication while loading; when ready, the time of that source's last successful load (presented in the user's local time); a cancelled indication after a Cancel, until the next request; an error state on error, and the error message MUST be readable via the indicator (for example by expanding or a tooltip); when auto-refresh is enabled its interval MUST be indicated. When a new page mounts the indicator MUST be presented with that page's source's initial state (awaiting Query), and MUST NOT carry over the previous page's time or error.

#### Scenario: Manual reload

- **WHEN** the user, after a committed query, clicks "Reload data" on the Storage Graph page
- **THEN** the application issues exactly one request to `endpoints.graph` and zero to `endpoints.storageGraph` or `endpoints.trace`; on success the status indicator updates to the new last load time

#### Scenario: Reloading on the Sankey view refetches only storage-graph

- **WHEN** the user, after a committed query, clicks "Reload data" on `/sankey`
- **THEN** the application issues only one request to `endpoints.storageGraph`

#### Scenario: Reloading on either Network view refetches the trace

- **WHEN** the user, after a committed query on `/network/sankey`, clicks "Reload data"
- **THEN** the application issues exactly one request to `endpoints.trace` carrying the applied seven parameters, the chart updates from the new payload, and the status indicator updates the last load time

#### Scenario: Reload is unavailable before the first commit

- **WHEN** the user has just mounted `/graph` and has not activated Query
- **THEN** "Reload data" is presented as unavailable, the status indicator shows awaiting Query, and clicking it issues no request

#### Scenario: Reload is unavailable when az / env are not both selected

- **WHEN** the user is on `/sankey` and no root has been added
- **THEN** "Reload data" is presented as unavailable, and clicking it issues no request

#### Scenario: Reload is unavailable on the Network page without a valid draft or endpoint

- **WHEN** the user is on `/network/sankey` with an empty hostname, or with `max_hops=abc` in the URL, or with `endpoints.trace` absent
- **THEN** "Reload data" is presented as unavailable and clicking it issues no request

#### Scenario: No duplicate sending while in flight

- **WHEN** a reload request is in flight, and the user clicks "Reload data" again
- **THEN** no additional request is issued, and the action stays in the in-progress state until the existing request completes

#### Scenario: The indicator shows a cancel

- **WHEN** the user activates Cancel during a refresh
- **THEN** the status indicator reads cancelled, shows no error message, keeps the previous last load time visible, and returns to loading on the next commit or reload

#### Scenario: Auto-refresh

- **WHEN** `refreshIntervalSeconds` is `30`, and the user commits a query on `/graph` and stays there
- **THEN** the application issues one request to `endpoints.graph` roughly every 30 seconds, and the status indicator indicates auto-refresh as 30s; after a manual reload, the next auto-refresh counts 30 seconds from that point in time
- **AND** on `/network/sankey`, after a committed query, auto-refresh issues one request to `endpoints.trace` every 30 seconds and none to any other endpoint

#### Scenario: Auto-refresh off

- **WHEN** `refreshIntervalSeconds` is `0`
- **THEN** the application fetches only on Query and manual reload, and the status indicator does not indicate auto-refresh

#### Scenario: Demo mode reload

- **WHEN** `demoMode` is `true`, and the user clicks "Reload data" on any page
- **THEN** no network request is issued, that page's data is regenerated from its corresponding fixture, and the status indicator updates the last load time

### Requirement: Page transient state lives and dies with the route

Each page's transient state — the Storage Graph page's selection, collapse set, kind / edge type / ingress visibility, pod-parent mode, search string, legend collapse; the Storage Sankey page's zoom / pan viewport, hover, card search, layout (`Flat` / `Node`), SVM display (`Column` / `Group`), focus mode; the Network Sankey page's zoom / pan viewport, hover, card search, `Group`, `Order`, focus mode — SHALL be created when the page mounts and discarded when it unmounts. On leaving and returning to a page, the user MUST see that page's initial state (the Storage Graph's initial layout algorithm value comes from the configured `defaultLayout`; pod-parent mode is `controller`; the Storage Sankey's layout is `Flat` and its SVM display `Column`; the Network Sankey's `Group` is `None` and its `Order` `Flow`). The only things that survive across unmount are **the scope, view values and time range carried by the URL query** — they are not transient state but the page's inputs.

The transient state above MUST NOT be persisted to browser local storage and MUST NOT be written to the URL; after a full refresh it MUST all return to initial values, while scope / view values / time range are restored from the URL. A data reload MUST NOT actively clear this state; how individual state maps after the data changes (for example a selected node that no longer exists) is specified by each view.

#### Scenario: Returning to a page gives the initial state

- **WHEN** the user, on `/sankey?az=zone-a&env=prod&aggr=aggr1`, switches the layout to `Node` and the SVM display to `Group`, zooms, then clicks a card (Locate to `/graph`) and presses "Back"
- **THEN** the Storage Sankey page remounts: layout `Flat`, SVM display `Column`, the initial viewport, no hover; the estate, root and time range carried by the URL are restored

#### Scenario: Transient state does not enter the URL or local storage

- **WHEN** the user, on `/graph?namespace=shop`, performs arbitrary selection, collapse, kind filtering and search
- **THEN** the address bar's query always contains only `namespace` and `from` / `to`, and no view state exists in browser local storage

#### Scenario: After a refresh the scope is restored and transient state reset

- **WHEN** the user, on `/network/sankey?hostname=sw-tor-1&min_bps=1000000000`, switches `Group` to `Cluster` and `Order` to `Barycenter`, enters focus mode, then does a full refresh
- **THEN** the page awaits Query with `sw-tor-1` and `Min Δ` `1000000000` restored from the URL; `Group` reads `None`, `Order` reads `Flow`, the viewport is initial and focus mode is not active

## REMOVED Requirements

### Requirement: The Network category is one page with one loader across its views

**Reason**: The Network Graph view (`/network/graph`) is removed; the Network category is the one Network Sankey page at `/network/sankey`, which holds its loader like every other page. There is no second view to share a loader with, no view link to carry the search across, and no Graph view for the Sankey's Locate to land on.

**Migration**: Open `/network/sankey` directly. `/network` redirects there keeping the query; `/network/graph` answers with the not-found page. Nothing about the trace request, the applied scope or the URL contract of the Network Sankey changes.
