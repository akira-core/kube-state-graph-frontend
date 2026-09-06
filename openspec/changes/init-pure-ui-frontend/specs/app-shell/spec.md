## Purpose

Defines the SPA's entry point and global frame: the startup sequence (config-load gate → error screen or application), client-side routing where `/graph` / `/sankey` are each independent pages, page scope and view time range carried in the URL query, deep links, the persistently shown top nav bar (view switching, theme, reload, status and demo badge), the view area that fills the window, the data sources held by each page (the Graph page's `/v1/graph` and the Sankey page's `/v1/storage-graph`), transient view state discarded on leaving a route, and basic accessibility. Behavior inside the views is not specified here.

## ADDED Requirements

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

The application SHALL provide the following client-side routes, all paths relative to the app base URL (`/ksg/graph` etc. when deployed at `/ksg/`):

- `/graph` → the **Graph page** (cytoscape.js canvas, behavior in `graph-view`), with its own filter bar and graph data source.
- `/sankey` → the **Sankey page** (behavior in `storage-flow-sankey`), with its own estate / root control bar and storage-graph data source.
- `/` → MUST redirect to `/graph` by replacing the history entry (replace), so that "Back" does not return to `/`.
- Any other path → the **not-found page** screen, shown in the view area below the nav bar, containing a link back to `/graph`; the nav bar remains shown on this screen.

Trailing slashes MUST be treated as equivalent (`/graph/` is the same as `/graph`). Switching between views MUST be client-side navigation: it MUST NOT trigger a full document load, and MUST NOT re-read the configuration document. The browser tab title SHALL reflect the current view (including the application name and the view name).

Each route MUST render **its own page component**; the page of a non-current route MUST NOT stay mounted and MUST NOT exist hidden in the DOM. Switching routes unmounts the previous page and mounts the new one — **switch = reset**. The nav bar's two view links MUST point to the **bare paths** (`/graph`, `/sankey`, without query); clicking one enters that page with its initial scope.

The route's **query string is the carrier of that page's scope and view time range** (the Grafana dashboard-variable model): for the Graph page, the filter parameters specified by `graph-filters`; for the Sankey page, the estate / root / narrowing / `mode` specified by `storage-flow-sankey`; both additionally carry `from` / `to` (see "View time range"). Parameter names MUST mirror the backend request parameter names (multiple values expressed as repeated keys), with no prefix. Changes from in-page controls MUST update the query with **replace** (no new history entry); switching between routes MUST be a push. The query carries only scope and time range — selection, collapse, viewport, search, legend, pod-parent mode and focus mode MUST NOT enter the URL. A page MUST ignore parameters it does not recognize, and strip them on its next write of the query.

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
- **THEN** no full document load occurs and the configuration document is not re-requested; the Sankey page mounts and fetches its own data according to "Page-owned data lifecycle"

#### Scenario: Switching routes resets

- **WHEN** the user, on `/graph?namespace=shop`, clicks the Sankey link in the nav bar, then clicks the Graph link
- **THEN** the address bar is `/graph` (without `namespace`), the Graph page remounts with its initial scope and refetches; the previous selection, collapse and viewport no longer exist

#### Scenario: In-page changes update the query with replace

- **WHEN** the user, on `/graph`, selects namespace `shop` and then `infra`
- **THEN** the address bar is `/graph?namespace=shop&namespace=infra&from=…&to=…`, and the browser history length is unchanged; pressing "Back" leaves `/graph` rather than returning to the previous namespace selection

#### Scenario: Unknown parameters are ignored and stripped

- **WHEN** the user opens `/graph?foo=bar&namespace=shop`
- **THEN** the Graph page fetches with `namespace=shop`, and `foo` affects no behavior; after the user's next change to any control, the address bar no longer contains `foo`

### Requirement: Deep links and browser history

The URL of any route MUST be directly openable and refreshable: after the user refreshes on `/sankey`, they MUST see the Sankey view again (not a 404 or the Graph view). This behavior depends on the server answering unknown paths with `index.html` as a history fallback (provided by `container-deployment` in production; the dev server MUST provide it too). The browser's "Back / Forward" MUST switch between the Graph and Sankey views in history order, and likewise MUST NOT trigger a full document load.

A URL with a query MUST likewise be directly openable, shareable and refreshable: after `/sankey?az=zone-a&env=prod&aggr=aggr1&mode=write` is opened, it MUST immediately fetch and render with that scope and mode, without the user operating any control. The browser's "Back / Forward" restores the full address **including the query**, so Sankey → Locate → Back MUST return to the Sankey scope as it was on leaving.

#### Scenario: Refreshing on the Sankey view

- **WHEN** the user refreshes on `/sankey`
- **THEN** the application restarts (re-reading the configuration) and shows the Sankey view; the scope and time range carried by the URL are restored, and what is fetched is the storage-graph data — the Graph page is not mounted, and `endpoints.graph` is not fetched

#### Scenario: Sharing a deep link

- **WHEN** the user opens `https://ops.example/ksg/sankey` directly in a new tab
- **THEN** the Sankey view is shown

#### Scenario: Back returns to the previous view

- **WHEN** the user switches from `/graph` to `/sankey` and then presses "Back"
- **THEN** the Graph view is shown, the address bar is `/graph`, and no full document load occurs

#### Scenario: Back restores the Sankey scope

- **WHEN** the user, on `/sankey?az=zone-a&env=prod&aggr=aggr1`, selects a node and Locates to `/graph`, then presses "Back"
- **THEN** the address bar returns to `/sankey?az=zone-a&env=prod&aggr=aggr1…`, the Sankey page remounts and fetches with that scope, and the `az` / `env` / root controls show the same values

### Requirement: Top nav bar

The application SHALL persistently show, above the view area, a nav bar of fixed height that does not scroll with content; it is present on the Graph view, the Sankey view and the not-found page screen. **The sole exception is the Sankey view's focus mode** (see "Focus mode" in `storage-flow-sankey`): while it is active the nav bar MUST collapse so the diagram fills the window, and on leaving focus mode it MUST be restored immediately. In any other situation the nav bar MUST NOT be hidden. The nav bar MUST contain:

1. the application name;
2. the two view links, Graph and Sankey, of which the one matching the current route MUST be presented in the active style and marked as the current page;
3. the theme switching control (see "Theme switching and persistence");
4. the "Reload data" action (see "Reload action and status indicator");
5. the status indicator (see "Reload action and status indicator");
6. a **demo mode badge** shown only when `demoMode` is `true`, whose text states explicitly that the data is built-in demo data; when `demoMode` is `false` the badge MUST NOT exist in the DOM;
7. the view time range control (see "View time range").

Below the nav bar there SHALL be a further row, the **page-owned control bar**, rendered by the current page rather than held by the shell: for the Graph page, the filter bar (see `graph-filters`); for the Sankey page, its estate / root / narrowing and mode controls (see `storage-flow-sankey`). Both are presented with the same dropdown component (contract in `graph-filters`), but the selections MUST be independent — the same dimension appearing in both places is deliberate: they are sent to two different endpoints, differ in semantics and cardinality (multi-value vs single-value), and each exists only in its own page's URL query.

#### Scenario: Control bar follows the view switch

- **WHEN** the user switches from the Graph view to the Sankey view
- **THEN** the filter bar disappears as the Graph page unmounts, and the Sankey control bar appears as its page mounts; on clicking the Graph link again to return to `/graph`, the filter bar is in its initial state (bare path = no scope)

#### Scenario: Same-named dimensions do not affect each other

- **WHEN** the user selects `az: zone-a` and `az: zone-b` in the Graph filter bar, then selects `az: zone-c` in Sankey
- **THEN** each place keeps its own values: the graph request for `/graph?az=zone-a&az=zone-b` carries `az=zone-a&az=zone-b`, and the storage-graph request for `/sankey?az=zone-c` carries `az=zone-c`; neither page's URL contains the other page's parameters

#### Scenario: The current view's link is presented as active

- **WHEN** the user is on `/sankey`
- **THEN** the Sankey link in the nav bar is presented in the active style and marked as the current page, and the Graph link is not

#### Scenario: Demo mode badge

- **WHEN** the configured `demoMode` is `true`
- **THEN** the nav bar shows the demo mode badge, and it remains shown when switching between the Graph and Sankey views

#### Scenario: No badge outside demo mode

- **WHEN** the configured `demoMode` is `false`
- **THEN** the nav bar does not contain the demo mode badge

#### Scenario: Sankey focus mode collapses the nav bar

- **WHEN** the user enters focus mode on the Sankey view, then leaves it
- **THEN** while in it the nav bar is not shown and the Sankey diagram area fills the window; after leaving, the nav bar is restored immediately, and its active link, theme switch and status indicator all keep the state they had before entering

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

The nav bar SHALL provide a **view time range** control, whose options are the relative windows `1h` / `6h` / `24h` / `7d` and one custom absolute window (a start and an end, each a point in time). The default MUST be `24h`. The user's choice MUST be saved both in browser local storage (carried across refreshes and new tabs) **and written to the current route's query** (`from` / `to`): a relative window is written as `from=now-<window>&to=now` (`<window>` limited to `1h` / `6h` / `24h` / `7d`), an absolute window as two Unix seconds. The order of precedence MUST be: the URL's `from` / `to` (if valid) → the browser local storage value → `24h`; after the page mounts it MUST immediately write the result back to the query with replace, so that the URLs of `/graph` and `/sankey` **always carry** `from` / `to` — the time range has a local fallback, so "not written in the URL" is ambiguous, unlike scope parameters where "not written = default". An invalid combination in the URL (unparseable, `from` ≥ `to`, an unknown relative form) MUST be ignored as a whole and fall back to the next layer; it MUST NOT take just one half. It MUST NOT be written to the runtime config. A relative window MUST be converted in place to the current absolute start and end on every read (`from` = now minus that length, `to` = now), rather than frozen at the moment of selection.

The view time range is the shell's only **cross-view shared** input, with three consumers:

1. the `start` / `end` of `GET /v1/graph` (Graph view);
2. the `start` / `end` of `GET /v1/storage-graph` (Sankey view);
3. the `from_time` / `to_time` of the node detail's Dashboard queries (Unix seconds, see `node-detail`).

The first two are **required parameters** — the backend rejects a missing value with 400 `missing_start` / `missing_end`, and neither endpoint has a relative-time form, so the window is resolved by the frontend **at the moment each request is sent** (see the request assembly requirement in `graph-data-source`). Change history queries carry no time parameters, and MUST NOT refetch because of it.

Changing the view time range MUST cause the **current page's** data source to refetch; the other page is not mounted and MUST NOT produce a request because of it, and on its next mount it reads the new range from the URL or the local storage value. The change MUST NOT reset any view state of the current page (selection, collapse, viewport, filters, search, the Sankey's mode and selectors). The control MUST be reachable and activatable by keyboard, and have an accessible name.

#### Scenario: Default is 24h and the choice carries across refreshes

- **WHEN** the user opens the application for the first time
- **THEN** the view time range control shows `24h`
- **AND** after the user changes it to `6h` and refreshes the page, the control still shows `6h`

#### Scenario: Relative window is converted to the current moment on read

- **WHEN** the view time range is `1h`, and the user selects a node and triggers its Dashboard query
- **THEN** that query's `from_time` / `to_time` are the Unix seconds from "the moment of the query minus one hour" to "the moment of the query", rather than values frozen when that window was selected

#### Scenario: Changing the time range refetches the loaded source

- **WHEN** the user, after `/graph` has finished loading, changes the view time range from `24h` to `1h`
- **THEN** the application issues one new request to `endpoints.graph` with the new `start` / `end`, and the request count to `endpoints.storageGraph` remains 0 (the Sankey page is not mounted)
- **AND** no request is issued to `endpoints.codeChanges` / `endpoints.configChanges`
- **AND** the current selection, collapse, viewport, filter and search state are all unchanged

#### Scenario: Written to the URL, and the URL takes precedence

- **WHEN** the browser local storage value is `6h`, and the user opens `/graph?from=now-1h&to=now`
- **THEN** the control shows `1h`, and the graph request's `start` / `end` are now minus one hour to now; after the user changes it to `7d`, the address bar becomes `from=now-7d&to=now` (replace), the local storage value is updated to `7d`, and the application does not write to the runtime config

#### Scenario: Bare path gets the time range filled in

- **WHEN** the local storage value is `6h`, and the user opens `/sankey`
- **THEN** the address bar immediately (replace) becomes `/sankey?from=now-6h&to=now`, and the browser history length is unchanged

#### Scenario: Invalid from / to is ignored as a whole

- **WHEN** the user opens `/graph?from=1700000000&to=1600000000` (`from` ≥ `to`)
- **THEN** both are ignored, the control is presented with the local storage value (or `24h`), and the address bar is replaced with that value's `from` / `to`

### Requirement: Page-owned data lifecycle

Each page SHALL hold **its own** data source (fetching and normalization behavior in `graph-data-source`):

| Page      | Endpoint                 | When first fetched                                                                                       |
| --------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `/graph`  | `endpoints.graph`        | once, immediately after the page mounts                                                                  |
| `/sankey` | `endpoints.storageGraph` | when the page is mounted and `az` / `env` are selected (from the URL, auto-preselected or user-selected) |

The source's in-flight request, `status`, error message, last successful load time, retry and auto-refresh timers all live and die with the page: unmounting the page MUST abort the in-flight request and discard its result, and stop the timers; remounting MUST refetch from the scope carried by the URL, and MUST NOT reuse the data of the previous mount — "view switching does not refetch" is no longer a requirement; switch = reset. The shell MUST NOT hold the data of any source, and MUST NOT hand one page's data to another page.

A page that has never been mounted MUST NOT produce any request (including those triggered by auto-refresh and time range changes) — this is the natural consequence of `/v1/storage-graph` requiring single values for `az` / `env`: with no page there is no valid request that could be sent.

During a reload within the same page (manual or automatic), the source's previously successfully loaded data MUST remain shown, and the view must not be cleared; when a reload fails, the previous data MUST be kept and the error shown in the status indicator, and the existing view MUST NOT be replaced by an error screen. When the first load fails there is no previous data, and the page is presented according to its error state.

#### Scenario: Switching routes refetches

- **WHEN** the user, after `/graph` has finished loading, switches to `/sankey` and then back to `/graph`
- **THEN** on the second entry to `/graph` the Graph page remounts, issues a new request to `endpoints.graph` and shows the loading state; during this, requests to `endpoints.storageGraph` are issued only while `/sankey` is mounted and `az` / `env` are both present

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
- **THEN** Sankey still shows its previously successfully loaded data and presents the error in the status indicator; on switching to `/graph`, that page reloads with its own state and does not show the configuration error screen

### Requirement: Reload action and status indicator

The nav bar's "Reload data" action SHALL immediately trigger one refetch of **the current view's data source** — the graph source on the Graph view, the storage-graph source on the Sankey view; while the request is in flight the action MUST present an in-progress state and MUST NOT issue a second concurrent request. The action MUST NOT refresh the source of a non-current view. When the Sankey view's `az` / `env` are not both selected, or `endpoints.storageGraph` is not configured, the action MUST be presented as unavailable (rather than issuing a request that is certain to be rejected with 400). When `demoMode` is `true`, this action MUST regenerate the data from the corresponding fixture without issuing a network request.

When the configured `refreshIntervalSeconds` is greater than `0`, the shell SHALL automatically trigger a reload every that many seconds, likewise **acting only on the current view's source**; if that source's previous request is still in flight, that tick MUST be skipped; a manual reload MUST restart the timer. The timer lives and dies with the page: unmounting stops it, and after a new page mounts it counts from that page's first load. When `refreshIntervalSeconds` is `0` there MUST NOT be auto-refresh.

The status indicator MUST reflect the state of **the current view's source**: a loading indication while loading; when ready, the time of that source's last successful load (presented in the user's local time); an error state on error, and the error message MUST be readable via the indicator (for example by expanding or a tooltip); when auto-refresh is enabled its interval MUST be indicated. When a new page mounts the indicator MUST be presented with that page's source's initial state (loading), and MUST NOT carry over the previous page's time or error.

#### Scenario: Manual reload

- **WHEN** the user clicks "Reload data" on the Graph view
- **THEN** the application issues exactly one request to `endpoints.graph` and zero to `endpoints.storageGraph`; on success the status indicator updates to the new last load time

#### Scenario: Reloading on the Sankey view refetches only storage-graph

- **WHEN** the user clicks "Reload data" on the Sankey view
- **THEN** the application issues only one request to `endpoints.storageGraph`; on switching back to `/graph`, the Graph page remounts and fetches, and its last load time is new

#### Scenario: Reload is unavailable when az / env are not both selected

- **WHEN** the user is on the Sankey view and `env` is not yet selected
- **THEN** "Reload data" is presented as unavailable, and clicking it issues no request

#### Scenario: No duplicate sending while in flight

- **WHEN** a reload request is in flight, and the user clicks "Reload data" again
- **THEN** no additional request is issued, and the action stays in the in-progress state until the existing request completes

#### Scenario: Auto-refresh

- **WHEN** `refreshIntervalSeconds` is `30`, and the user stays on the Graph view
- **THEN** the application issues one request to `endpoints.graph` roughly every 30 seconds, and the status indicator indicates auto-refresh as 30s; after a manual reload, the next auto-refresh counts 30 seconds from that point in time
- **AND** after switching to `/sankey`, the Graph page's timer stops as it unmounts, and auto-refresh instead issues one request to `endpoints.storageGraph` every 30 seconds

#### Scenario: Auto-refresh off

- **WHEN** `refreshIntervalSeconds` is `0`
- **THEN** the application fetches only on startup and manual reload, and the status indicator does not indicate auto-refresh

#### Scenario: Demo mode reload

- **WHEN** `demoMode` is `true`, and the user clicks "Reload data" on either view
- **THEN** no network request is issued, that view's data is regenerated from its corresponding fixture, and the status indicator updates the last load time

### Requirement: View area fills the remaining window height and responds to size

The view area below the nav bar MUST fill the entire remaining height of the window after the nav bar, and its entire width; the page itself MUST NOT show a whole-page scrollbar. The Graph and Sankey views MUST be drawn according to the view area's size; when the window size changes the view area MUST change with it. The Graph view's canvas resizes and re-fits. The Sankey view resizes **without re-layout and without re-fitting** — its `<g>` viewport transform is preserved exactly as the user left it, even where that leaves part of the content outside the visible range (see "Sizing and container resize" in `storage-flow-sankey`); it carries no `viewBox`, so nothing else can rescale it behind that transform. Resizing the window MUST NOT reset the user's in-diagram viewport. How view area size changes caused by in-app layout changes (legend collapse, panel open / close) are handled is in the "Container size responsiveness" requirement of `graph-view`.

#### Scenario: View area height equals the window minus the nav bar

- **WHEN** the window height is 900px and the nav bar height is 48px
- **THEN** the view area height is 852px, its width equals the window width, and the page has no whole-page scrollbar

#### Scenario: View re-fits after the window is resized

- **WHEN** the user shrinks the window from 1600×900 to 1000×700
- **THEN** the view area shrinks with it, the current view is redrawn at the new size and all content is still within the visible range; if the Sankey has a user-customized in-diagram zoom / pan viewport, that viewport is kept rather than forcing the whole diagram to be visible

### Requirement: Page transient state lives and dies with the route

Each page's transient state — the Graph page's selection, collapse set, kind / edge type / ingress visibility, pod-parent mode, search string, legend collapse; the Sankey page's zoom / pan viewport, hover, focus mode — SHALL be created when the page mounts and discarded when it unmounts. On leaving and returning to a page, the user MUST see that page's initial state (the Graph's initial layout algorithm value comes from the configured `defaultLayout`; pod-parent mode is `controller`). The only things that survive across unmount are **the scope, mode and time range carried by the URL query** — they are not transient state but the page's inputs.

The transient state above MUST NOT be persisted to browser local storage and MUST NOT be written to the URL; after a full refresh it MUST all return to initial values, while scope / mode / time range are restored from the URL. A data reload MUST NOT actively clear this state; how individual state maps after the data changes (for example a selected node that no longer exists) is specified by each view.

#### Scenario: Returning to a page gives the initial state

- **WHEN** the user, on `/graph`, selects node `pod-a`, collapses container `deploy-x`, switches to the `node` pod-parent mode and collapses the legend, then switches to `/sankey` and presses "Back"
- **THEN** the Graph page remounts: no selection, default collapse, pod-parent mode `controller`, legend expanded; the filters and time range carried by the URL are restored

#### Scenario: Transient state does not enter the URL or local storage

- **WHEN** the user, on `/graph?namespace=shop`, performs arbitrary selection, collapse, kind filtering and search
- **THEN** the address bar's query always contains only `namespace` and `from` / `to`, and no view state exists in browser local storage

#### Scenario: After a refresh the scope is restored and transient state reset

- **WHEN** the user, on `/sankey?az=zone-a&env=prod&mode=write`, zooms / pans and enters focus mode, then does a full refresh
- **THEN** the Sankey fetches and draws with `az=zone-a` / `env=prod` / `mode=write`; the viewport is initial and focus mode is not active

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
