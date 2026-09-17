## Purpose

Defines the SPA's entry point and global frame: the startup sequence (config-load gate → error screen or application), client-side routing where `/graph` / `/sankey` are each independent pages, page scope and view time range carried in the URL query, deep links, the persistently shown top nav bar (view switching, theme, reload, status and demo badge), the view area that fills the window, the data sources held by each page (the Graph page's `/v1/graph` and the Sankey page's `/v1/storage-graph`), transient view state discarded on leaving a route, and basic accessibility. Behavior inside the views is not specified here.

## Requirements

### Requirement: Startup sequence and configuration gate

The application entry point SHALL pass through three phases in order: (1) the **loading screen** — shown while the configuration document is fetched and validated, containing only a minimal loading indicator, without the nav bar or any view; (2) on configuration failure, switching to the **configuration error screen** specified by `runtime-config`; (3) on configuration success, rendering the **application** (nav bar + the view matching the route). The nav bar, any view and any backend data request MUST NOT appear or be issued before configuration loading completes. The loading screen and the configuration error screen MUST be presented according to the theme rules (see "Theme switching and persistence").

#### Scenario: Entering the application after configuration succeeds

- **WHEN** the user opens `/graph`, and the configuration document is fetched and validated successfully after 300ms
- **THEN** only the loading screen is shown during those 300ms; afterwards the nav bar and the Graph view appear, the graph data request is issued only at this point, and no storage-graph request is issued

#### Scenario: Configuration failure shows only the error screen

- **WHEN** the configuration document fails to fetch or fails validation
- **THEN** the application shows the configuration error screen, renders neither the nav bar nor any view, and issues no request to any graph data endpoint for the entire session

#### Scenario: No fetching before configuration loads

- **WHEN** the configuration document's response has not yet arrived
- **THEN** the application has not yet issued a request to any `endpoints.*`

### Requirement: View routing

The application SHALL provide the following client-side routes, all paths relative to the app base URL (`/ksg/graph` etc. when deployed at `/ksg/`), organised as two **categories** (`Storage`, `Network`) each with two **views** (`Graph`, `Sankey`):

- `/graph` → the **Graph page** of the Storage category (cytoscape.js canvas, behavior in `graph-view`), with its own filter bar and graph data source.
- `/sankey` → the **Sankey page** of the Storage category (behavior in `storage-flow-sankey`), with its own estate / root control bar and storage-graph data source.
- `/network/graph` and `/network/sankey` → the **Network page** (one page component for both, see "The Network category is one page with one loader across its views"), whose Graph view reuses `graph-view` and whose Sankey view is `network-trace`, with the trace scope bar and the trace data source.
- `/network` → MUST redirect to `/network/graph` by replacing the history entry, **keeping the query string**, so a shared `/network?hostname=…` link opens the Graph view with that scope.
- `/` → MUST redirect to `/graph` by replacing the history entry (replace), so that "Back" does not return to `/`.
- `/network/<anything else>` and any other path → the **not-found page** screen, shown in the view area below the nav bar, containing a link back to `/graph`; the nav bar remains shown on this screen (for an unknown Network view the nav bar keeps `Network` active).

Trailing slashes MUST be treated as equivalent (`/graph/` is the same as `/graph`). Switching between views or categories MUST be client-side navigation: it MUST NOT trigger a full document load, and MUST NOT re-read the configuration document. The browser tab title SHALL reflect the current view (including the application name and the view name: `Graph`, `Sankey`, `Network Graph`, `Network Sankey`).

Each **category** MUST render **its own page component**; the page of a non-current category MUST NOT stay mounted and MUST NOT exist hidden in the DOM. Switching categories unmounts the previous page and mounts the new one — **switch = reset**. Within the Network category the two views share the page (see the added requirement). The nav bar's category links MUST point to the **bare paths** (`/graph`, `/network/graph`, without query); clicking one enters that category with its initial scope. The Storage view links are bare paths too (`/graph`, `/sankey`); the Network view links carry the current search.

The route's **query string is the carrier of that page's applied scope and applied view time range** (the Grafana dashboard-variable model, gated by `explicit-query`): for the Graph page, the filter parameters specified by `graph-filters`; for the Sankey page, the estate / root / narrowing specified by `storage-flow-sankey` plus its immediate view values `mode` and `top_pods`; for the Network page, the trace parameters specified by `network-trace` plus its immediate view value `min_bps`; all additionally carry `from` / `to` (see "View time range"). Parameter names MUST mirror the backend request parameter names (multiple values expressed as repeated keys), with no prefix; `mode`, `top_pods` and `min_bps` are the client-side exceptions and are never sent. A Query commit MUST update the query with **replace** (no new history entry), writing scope and time together in one write; the immediate view values likewise write with replace on change; draft edits write nothing. Switching between routes MUST be a push. The query carries only scope, view values and time range — selection, collapse, viewport, search, legend, pod-parent mode, the Storage layout (`Flat` / `Node`), the trace `Group` and `Order` and focus mode MUST NOT enter the URL. A page MUST ignore parameters it does not recognize, and strip them on its next write of the query.

#### Scenario: Root path redirects to the Graph view

- **WHEN** the user opens `/`
- **THEN** the address bar becomes `/graph`, the Graph view is shown, and pressing "Back" does not return to `/`

#### Scenario: Opening the Sankey view

- **WHEN** the user opens `/sankey` or clicks the Sankey link in the nav bar
- **THEN** the view area shows the Sankey view, and the address bar is `/sankey`

#### Scenario: `/network` redirects and keeps the query

- **WHEN** the user opens `/network?hostname=sw-tor-1&from=now-1h&to=now`
- **THEN** the address bar becomes `/network/graph?hostname=sw-tor-1&from=now-1h&to=now`, the history length is unchanged, the Network Graph view is shown with `sw-tor-1` prefilled, and no request is issued

#### Scenario: Unknown path shows the not-found page

- **WHEN** the user opens `/foo/bar`
- **THEN** the view area shows the not-found page screen, containing a link back to `/graph`, and the nav bar is still shown; after clicking that link the Graph view is shown

#### Scenario: Unknown Network view shows the not-found page

- **WHEN** the user opens `/network/foo`
- **THEN** the view area shows the not-found page screen with the nav bar still shown and `Network` presented as the active category, and no request is issued

#### Scenario: View switching does not reload the document

- **WHEN** the user clicks the Sankey link in the nav bar while on `/graph`
- **THEN** no full document load occurs and the configuration document is not re-requested; the Sankey page mounts and awaits Query according to "Page-owned data lifecycle"

#### Scenario: Switching routes resets

- **WHEN** the user, on `/graph?namespace=shop`, clicks the Sankey link in the nav bar, then clicks the Graph link
- **THEN** the address bar is `/graph` (without `namespace`), the Graph page remounts with its initial scope and awaits Query; the previous selection, collapse and viewport no longer exist

#### Scenario: Switching categories resets

- **WHEN** the user, on `/graph?namespace=shop`, clicks the `Network` category link, then clicks the `Storage` category link
- **THEN** the address bar is `/graph` (without `namespace`), the Graph page remounts with its initial scope and awaits Query; the previous selection, collapse and viewport no longer exist

#### Scenario: Tab titles name the Network views

- **WHEN** the user opens `/network/graph` and then switches to `/network/sankey`
- **THEN** the document title ends with `— Network Graph` and then `— Network Sankey`

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

### Requirement: Top nav bar

The application SHALL persistently show, above the view area, a nav bar of fixed height that does not scroll with content; it is present on every view and the not-found page screen. **The sole exception is the focus mode of either Sankey view** (the storage Sankey's, see "Focus mode" in `storage-flow-sankey`, and the network Sankey's, see `network-trace`): while it is active the nav bar MUST collapse so the diagram fills the window, and on leaving focus mode it MUST be restored immediately. In any other situation the nav bar MUST NOT be hidden. The nav bar MUST contain:

1. the application name;
2. the **category** control, a segmented pair of links `Storage` / `Network` with the accessible name `Category`, pointing at the bare paths `/graph` and `/network/graph`, of which the one matching the current route (`Network` when the path starts with `/network`) MUST be presented in the active style;
3. the **view** control, a segmented pair of links `Graph` / `Sankey` with the accessible name `View`, showing the current category's two views only (`/graph` / `/sankey` under Storage; `/network/graph` / `/network/sankey` under Network, carrying the current search), of which the one matching the current route MUST be presented in the active style and marked as the current page; at any moment exactly one `Graph` link and one `Sankey` link exist in the nav bar;
4. the theme switching control (see "Theme switching and persistence");
5. the "Reload data" action (see "Reload action and status indicator");
6. the status indicator (see "Reload action and status indicator");
7. a **demo mode badge** shown only when `demoMode` is `true`, whose text states explicitly that the data is built-in demo data; when `demoMode` is `false` the badge MUST NOT exist in the DOM;
8. the view time range control (see "View time range").

Below the nav bar there SHALL be a further row, the **page-owned control bar**, rendered by the current page rather than held by the shell: for the Graph page, the filter bar (see `graph-filters`); for the Sankey page, its estate / root / narrowing and mode controls (see `storage-flow-sankey`); for the Network page, the trace scope bar (see `network-trace`), shown under both of its views. All are presented with the same dropdown component (contract in `graph-filters`), but the selections MUST be independent — the same dimension appearing in two places is deliberate: they are sent to different endpoints, differ in semantics and cardinality, and each exists only in its own page's URL query.

#### Scenario: Control bar follows the view switch

- **WHEN** the user switches from the Graph view to the Sankey view
- **THEN** the filter bar disappears as the Graph page unmounts, and the Sankey control bar appears as its page mounts; on clicking the Graph link again to return to `/graph`, the filter bar is in its initial state (bare path = no scope)

#### Scenario: The trace scope bar stays across the Network views

- **WHEN** the user, on `/network/sankey` with `sw-tor-1` in the draft, clicks the `Graph` view link
- **THEN** the same trace scope bar is shown above the Graph view with `sw-tor-1` still in the draft and the same dirty state

#### Scenario: Same-named dimensions do not affect each other

- **WHEN** the user selects `az: zone-a` and `az: zone-b` in the Graph filter bar, then selects `az: zone-c` in Sankey
- **THEN** each place keeps its own values: the graph request for `/graph?az=zone-a&az=zone-b` carries `az=zone-a&az=zone-b`, and the storage-graph request for `/sankey?az=zone-c` carries `az=zone-c`; neither page's URL contains the other page's parameters

#### Scenario: The current view's link is presented as active

- **WHEN** the user is on `/sankey`
- **THEN** the Sankey link in the nav bar is presented in the active style and marked as the current page, the Graph link is not, and the `Storage` category link is active

#### Scenario: The current category and view are presented as active

- **WHEN** the user is on `/network/sankey`
- **THEN** the `Network` category link and the `Sankey` view link are presented in the active style, the `Sankey` link is marked as the current page, `Storage` and `Graph` are not, and there is exactly one link named `Graph` and one named `Sankey`

#### Scenario: Demo mode badge

- **WHEN** the configured `demoMode` is `true`
- **THEN** the nav bar shows the demo mode badge, and it remains shown when switching between any of the views

#### Scenario: No badge outside demo mode

- **WHEN** the configured `demoMode` is `false`
- **THEN** the nav bar does not contain the demo mode badge

#### Scenario: Sankey focus mode collapses the nav bar

- **WHEN** the user enters focus mode on the storage Sankey view or on the network Sankey view, then leaves it
- **THEN** while in it the nav bar is not shown and the diagram area fills the window; after leaving, the nav bar is restored immediately, and its active links, theme switch and status indicator all keep the state they had before entering

### Requirement: Theme switching and persistence

The nav bar's theme switching control SHALL offer three options: `dark` / `light` / `system`. The order of precedence for the effective theme MUST be: the user's choice saved in browser local storage (if any) → the configuration document's `theme` → `system`. Once the user chooses, that choice MUST be saved in browser local storage, carried across refreshes and new tabs, and take precedence over the configuration document's `theme`. `system` MUST follow the operating system's dark / light preference, and when the preference changes it MUST be applied immediately, without a refresh.

The effective theme MUST be applied to the whole application: the nav bar, the Graph view (including canvas styles), the Sankey view, all overlays (hover tooltip, pinned card, node detail panel, search result list, legend, menus), the not-found page screen, the loading screen and the configuration error screen. When the loading screen and the configuration error screen appear, configuration is not yet available, so the theme MUST be decided by "the user's choice saved in browser local storage → `system`".

Switching the theme MUST NOT reload data, MUST NOT reset any view state (selection, collapse, viewport, filters, search), and MUST NOT rebuild the Graph view's canvas; existing elements MUST be recolored in place.

#### Scenario: User choice persists and takes precedence over configuration

- **WHEN** the configuration document's `theme` is `"light"`, and the user selects `dark` in the nav bar and then refreshes the page
- **THEN** after the refresh the application is presented in the dark theme (including the loading screen)

#### Scenario: Configuration value is used when there is no user choice

- **WHEN** the browser has no saved theme choice, and the configuration document's `theme` is `"light"`
- **THEN** the application is presented in the light theme, and the theme switching control shows the current option as `light`

#### Scenario: system follows the operating system preference

- **WHEN** the effective theme is `system`, and the operating system switches from light to dark
- **THEN** the application immediately switches to the dark theme, without a refresh

#### Scenario: Theme applies to overlays

- **WHEN** the user opens the node detail panel and a pinned card on the Graph view, then switches the theme
- **THEN** the nav bar, canvas, detail panel and pinned card all change to the new theme at the same time

#### Scenario: Switching the theme preserves view state

- **WHEN** the user, on the Graph view, selects a node, collapses a container and enters a search string, then switches the theme
- **THEN** the selection, collapse state, search string and viewport position are all unchanged, and no data request is issued

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

| Page             | Endpoint                 | When first fetched                                                                                                                   |
| ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/graph`         | `endpoints.graph`        | on the first Query commit of that mount                                                                                              |
| `/sankey`        | `endpoints.storageGraph` | on the first Query commit of that mount whose draft holds `az`, `env` and at least one root (see `storage-flow-sankey`)              |
| `/network/:view` | `endpoints.trace`        | on the first Query commit of that mount whose draft holds a hostname and no problem (see `network-trace`); one source for both views |

Mounting a page seeds its draft from the URL and issues no request (see `explicit-query`). The source's in-flight request, `status`, error message, last successful load time, retry and auto-refresh timers all live and die with the page: unmounting the page MUST abort the in-flight request and discard its result, and stop the timers; remounting MUST prefill the draft from the scope carried by the URL and await Query, and MUST NOT reuse the data of the previous mount — switch = reset between pages. Switching between the two views of the Network page does not unmount it and keeps its source (see "The Network category is one page with one loader across its views"). The shell MUST NOT hold the data of any source, and MUST NOT hand one page's data to another page.

A page that has never been mounted MUST NOT produce any request (including those triggered by auto-refresh and time range changes).

During a reload within the same page (manual or automatic), the source's previously successfully loaded data MUST remain shown, and the view must not be cleared; when a reload fails, the previous data MUST be kept and the error shown in the status indicator, and the existing view MUST NOT be replaced by an error screen. When the first load fails there is no previous data, and the page is presented according to its error state.

#### Scenario: Switching routes refetches

- **WHEN** the user, after committing a query on `/graph`, switches to `/sankey` and then back to `/graph`
- **THEN** on the second entry to `/graph` the Graph page remounts, shows the awaiting-Query state with its controls prefilled from the URL, and issues no request until Query; during this, requests to `endpoints.storageGraph` are issued only while `/sankey` is mounted and a complete draft has been committed there

#### Scenario: Leaving a page aborts the in-flight request

- **WHEN** a request for `/graph` is in flight, and the user switches to `/sankey`
- **THEN** that request is aborted (or its result discarded), updates no state, and triggers no error indication

#### Scenario: Leaving the Network category aborts its request

- **WHEN** a request to `endpoints.trace` is in flight and the user clicks the `Storage` category link
- **THEN** that request is aborted, updates no state, triggers no error indication, and the Graph page mounts with its own initial state

#### Scenario: An unmounted page does not fetch

- **WHEN** after the application starts the user stays only on `/graph`, and several auto-refreshes occur during that time
- **THEN** the request counts to `endpoints.storageGraph` and `endpoints.trace` are 0

#### Scenario: Old data is kept during a reload

- **WHEN** the current page's data is loaded, and the user triggers a reload while the new request is in flight
- **THEN** the page keeps showing the existing data, and the status indicator shows loading

#### Scenario: One side failing does not affect the other

- **WHEN** the reload of `/sankey` responds with HTTP 500
- **THEN** Sankey still shows its previously successfully loaded data and presents the error in the status indicator; on switching to `/graph`, that page mounts with its own state and does not show the configuration error screen

### Requirement: Reload action and status indicator

The nav bar's "Reload data" action SHALL immediately trigger one refetch of **the current page's data source** with its **applied** selection — the graph source on the Graph page, the storage-graph source on the Sankey page, the trace source on the Network page (whichever of its views is shown); while the request is in flight the action MUST present an in-progress state and MUST NOT issue a second concurrent request (cancelling is the page's Query / Cancel control, see `explicit-query`). The action MUST NOT refresh the source of a non-current page. The action MUST be presented as unavailable (rather than issuing a request that is certain to be pointless or rejected with 400) before the first Query commit of the current mount, when the Sankey page's `az` / `env` / root are not all present, when the Network page's draft has no hostname or has a problem, or when the current page's endpoint (`endpoints.storageGraph`, `endpoints.trace`) is not configured. When `demoMode` is `true`, this action MUST regenerate the data from the corresponding fixture without issuing a network request and MUST be available on mount.

When the configured `refreshIntervalSeconds` is greater than `0`, the shell SHALL automatically trigger a reload every that many seconds, likewise **acting only on the current page's source** and only after its first commit; if that source's previous request is still in flight, that tick MUST be skipped; a manual reload or a Query commit MUST restart the timer; a Cancel MUST stop it until the next commit or manual reload. The timer lives and dies with the page: unmounting stops it, and after a new page mounts it counts from that page's first commit; a Network view switch does not restart it. When `refreshIntervalSeconds` is `0` there MUST NOT be auto-refresh.

The status indicator MUST reflect the state of **the current page's source**: an awaiting-Query indication before the first commit; a loading indication while loading; when ready, the time of that source's last successful load (presented in the user's local time); a cancelled indication after a Cancel, until the next request; an error state on error, and the error message MUST be readable via the indicator (for example by expanding or a tooltip); when auto-refresh is enabled its interval MUST be indicated. When a new page mounts the indicator MUST be presented with that page's source's initial state (awaiting Query), and MUST NOT carry over the previous page's time or error; a Network view switch keeps the indicator as it is.

#### Scenario: Manual reload

- **WHEN** the user, after a committed query, clicks "Reload data" on the Graph view
- **THEN** the application issues exactly one request to `endpoints.graph` and zero to `endpoints.storageGraph` or `endpoints.trace`; on success the status indicator updates to the new last load time

#### Scenario: Reloading on the Sankey view refetches only storage-graph

- **WHEN** the user, after a committed query, clicks "Reload data" on the Sankey view
- **THEN** the application issues only one request to `endpoints.storageGraph`; on switching back to `/graph`, the Graph page remounts and awaits Query

#### Scenario: Reloading on either Network view refetches the trace

- **WHEN** the user, after a committed query on `/network/sankey`, switches to `/network/graph` and clicks "Reload data"
- **THEN** the application issues exactly one request to `endpoints.trace` carrying the applied seven parameters, both views update from the new payload, and the status indicator updates the last load time

#### Scenario: Reload is unavailable before the first commit

- **WHEN** the user has just mounted `/graph` and has not activated Query
- **THEN** "Reload data" is presented as unavailable, the status indicator shows awaiting Query, and clicking it issues no request

#### Scenario: Reload is unavailable when az / env are not both selected

- **WHEN** the user is on the Sankey view and no root has been added
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

- **WHEN** `refreshIntervalSeconds` is `30`, and the user commits a query on the Graph view and stays there
- **THEN** the application issues one request to `endpoints.graph` roughly every 30 seconds, and the status indicator indicates auto-refresh as 30s; after a manual reload, the next auto-refresh counts 30 seconds from that point in time
- **AND** after switching to `/sankey`, the Graph page's timer stops as it unmounts, and no request is issued there until a query is committed, after which auto-refresh issues one request to `endpoints.storageGraph` every 30 seconds
- **AND** after committing a query on `/network/sankey`, auto-refresh issues one request to `endpoints.trace` every 30 seconds and keeps counting across a switch to `/network/graph`

#### Scenario: Auto-refresh off

- **WHEN** `refreshIntervalSeconds` is `0`
- **THEN** the application fetches only on Query and manual reload, and the status indicator does not indicate auto-refresh

#### Scenario: Demo mode reload

- **WHEN** `demoMode` is `true`, and the user clicks "Reload data" on any view
- **THEN** no network request is issued, that page's data is regenerated from its corresponding fixture, and the status indicator updates the last load time

### Requirement: View area fills the remaining window height and responds to size

The view area below the nav bar MUST fill the entire remaining height of the window after the nav bar, and its entire width; the page itself MUST NOT show a whole-page scrollbar. The Graph and Sankey views MUST be drawn according to the view area's size; when the window size changes the view area MUST change with it. The Graph view's canvas resizes and re-fits. The Sankey view resizes **without re-layout and without re-fitting** — its `<g>` viewport transform is preserved exactly as the user left it, even where that leaves part of the content outside the visible range (see "Sizing and container resize" in `storage-flow-sankey`); it carries no `viewBox`, so nothing else can rescale it behind that transform. Resizing the window MUST NOT reset the user's in-diagram viewport. How view area size changes caused by in-app layout changes (legend collapse, panel open / close) are handled is in the "Container size responsiveness" requirement of `graph-view`.

#### Scenario: View area height equals the window minus the nav bar

- **WHEN** the window height is 900px and the nav bar height is 48px
- **THEN** the view area height is 852px, its width equals the window width, and the page has no whole-page scrollbar

#### Scenario: View re-fits after the window is resized

- **WHEN** the user shrinks the window from 1600×900 to 1000×700
- **THEN** the view area shrinks with it, the current view is redrawn at the new size and all content is still within the visible range; if the Sankey has a user-customized in-diagram zoom / pan viewport, that viewport is kept rather than forcing the whole diagram to be visible

### Requirement: Page transient state lives and dies with the route

Each page's transient state — the Graph page's selection, collapse set, kind / edge type / ingress visibility, pod-parent mode, search string, legend collapse; the Sankey page's zoom / pan viewport, hover, layout (`Flat` / `Node`), focus mode — SHALL be created when the page mounts and discarded when it unmounts. On leaving and returning to a page, the user MUST see that page's initial state (the Graph's initial layout algorithm value comes from the configured `defaultLayout`; pod-parent mode is `controller`; the Sankey layout is `Flat`). The only things that survive across unmount are **the scope, mode and time range carried by the URL query** — they are not transient state but the page's inputs.

The transient state above MUST NOT be persisted to browser local storage and MUST NOT be written to the URL; after a full refresh it MUST all return to initial values, while scope / mode / time range are restored from the URL. A data reload MUST NOT actively clear this state; how individual state maps after the data changes (for example a selected node that no longer exists) is specified by each view.

#### Scenario: Returning to a page gives the initial state

- **WHEN** the user, on `/graph`, selects node `pod-a`, collapses container `deploy-x`, switches to the `node` pod-parent mode and collapses the legend, then switches to `/sankey` and presses "Back"
- **THEN** the Graph page remounts: no selection, default collapse, pod-parent mode `controller`, legend expanded; the filters and time range carried by the URL are restored

#### Scenario: Transient state does not enter the URL or local storage

- **WHEN** the user, on `/graph?namespace=shop`, performs arbitrary selection, collapse, kind filtering and search
- **THEN** the address bar's query always contains only `namespace` and `from` / `to`, and no view state exists in browser local storage

#### Scenario: After a refresh the scope is restored and transient state reset

- **WHEN** the user, on `/sankey?az=zone-a&env=prod&mode=write`, zooms / pans, switches the layout to `Node` and enters focus mode, then does a full refresh
- **THEN** the Sankey fetches and draws with `az=zone-a` / `env=prod` / `mode=write`; the viewport is initial, the layout is `Flat` and focus mode is not active

### Requirement: Shell registers no global keyboard shortcuts

The shell MUST NOT register any keyboard shortcut at the `document` / `window` level; all nav bar controls MUST be operated only by standard focus navigation (Tab / Shift+Tab) and activation keys (Enter / Space). The keyboard behavior of components inside views is specified by each view, and the shell MUST NOT intercept or rewrite key events bound for the views and their input fields.

#### Scenario: Keys have no effect without focus

- **WHEN** focus is on the page body (no control has focus), and the user presses any letter key or function key
- **THEN** the application does not switch views, does not switch theme, does not reload data, and has no other shell-level reaction

#### Scenario: Input field keys are not intercepted

- **WHEN** focus is on the Graph view's search input field, and the user types any character
- **THEN** the character enters the input field normally, and the shell does not consume the event

### Requirement: Accessibility basics

The nav bar MUST be a navigation landmark with an accessible name; the view area MUST be a main landmark. The current view's link MUST be marked as the current page in the standard way. All nav bar controls MUST be reachable and activatable by keyboard; when focused by keyboard they MUST show a clearly visible focus ring, with sufficient contrast against the background in both the dark and light themes. Icon-only controls (theme switch, reload) MUST have an accessible name; the theme switching control MUST expose the current option; the content of the status indicator and the demo badge MUST be text readable by assistive technology.

#### Scenario: Landmarks exist

- **WHEN** assistive technology enumerates the page landmarks
- **THEN** it finds one named navigation landmark (the nav bar) and one main landmark (the view area)

#### Scenario: Keyboard focus is visible

- **WHEN** the user moves focus through the nav bar controls in order with the Tab key
- **THEN** every control that receives focus shows a visible focus ring, clearly discernible in both the dark and light themes

#### Scenario: Icon controls have names

- **WHEN** assistive technology reads the theme switching and reload controls
- **THEN** both have an accessible name describing their function, and the theme switch also exposes the current option as one of `dark` / `light` / `system`

### Requirement: The Network category is one page with one loader across its views

`/network/graph` and `/network/sankey` MUST be served by **one page component** (`NetworkPage`, routed as `/network/:view`) that holds one data source for `endpoints.trace`, one applied scope, one draft and one seeded time range. Switching between the two Network views changes only the `view` route parameter: the page and its source stay mounted, the payload, `hasPayload`, `status`, last load time, error and the auto-refresh timer are retained, and **no request is issued**. The Sankey view's transient state (viewport, hover, layout, order, focus) and the Graph view's transient state (selection, collapse, filters, search) are created and discarded with their view component, as they are elsewhere. Switching **category** (`/graph` or `/sankey` ↔ `/network/*`) remains switch = reset: the previous page unmounts, its request is aborted and its data discarded.

The applied scope of the Network category is the trace query specified by `network-trace` (`hostname`, `max_hops`, `top_n`, `threshold`, `track_dir`) plus the immediate view value `min_bps` and `from` / `to`; the same query string applies to both views, written by the page's single canonical writer. The nav bar's Network view links MUST carry the current search so the applied scope survives the view switch; Locate from the Sankey navigates to `/network/graph` with the same search (push) and the Graph view runs Locate immediately on the retained payload.

Under `demoMode` the page renders `SHOWCASE_TRACE` on mount without a request, holds the scope in component state, and Reload regenerates from the fixture.

#### Scenario: Switching views issues no request and keeps the payload

- **WHEN** after a committed query on `/network/sankey?hostname=sw-tor-1&from=…&to=…` the user clicks the `Graph` view link
- **THEN** the address bar becomes `/network/graph?hostname=sw-tor-1&from=…&to=…` (push), the request count to `endpoints.trace` is unchanged, `hasPayload` is still `true`, the Graph view draws the same elements immediately, and the status indicator keeps the same last load time

#### Scenario: Switching category resets

- **WHEN** the user, on `/network/sankey?hostname=sw-tor-1`, clicks the `Storage` category link
- **THEN** the address bar is `/graph` (with `from` / `to` filled in), the Network page unmounts and aborts any in-flight request, and the Graph page awaits Query with its initial scope

#### Scenario: Locate lands on a page that already holds the payload

- **WHEN** the user clicks a locatable card on the Network Sankey
- **THEN** the view switches to `/network/graph` with the same query, no request is issued, and the node is selected and fitted at once
