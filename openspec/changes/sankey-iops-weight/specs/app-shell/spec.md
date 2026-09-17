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

The route's **query string is the carrier of that page's applied scope and applied view time range** (the Grafana dashboard-variable model, gated by `explicit-query`): for the Storage Graph page, the filter parameters specified by `graph-filters`; for the Storage Sankey page, the estate / root / narrowing specified by `storage-flow-sankey` plus its immediate view values `mode`, `weight` and `top_pods`; for the Network Sankey page, the trace parameters specified by `network-trace` plus its immediate view value `min_bps`; all additionally carry `from` / `to` (see "View time range"). Parameter names MUST mirror the backend request parameter names (multiple values expressed as repeated keys), with no prefix; `mode`, `weight`, `top_pods` and `min_bps` are the client-side exceptions and are never sent. A Query commit MUST update the query with **replace** (no new history entry), writing scope and time together in one write; the immediate view values likewise write with replace on change; draft edits write nothing. A navigation between routes (a Locate, the not-found link) MUST be a push. The query carries only scope, view values and time range — selection, collapse, viewport, search, legend, pod-parent mode, the Storage Sankey's layout (`Flat` / `Node`) and SVM display (`Column` / `Group`), the Network Sankey's `Group` and `Order`, and focus mode MUST NOT enter the URL. A page MUST ignore parameters it does not recognize, and strip them on its next write of the query.

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

#### Scenario: Sankey weight is an immediate view value

- **WHEN** the user, on `/sankey?az=zone-a&env=prod&aggr=aggr1` after a committed query, switches Weight to IOPS
- **THEN** the address bar carries `weight=iops` with the history length unchanged, no storage-graph request is issued, and a refresh plus a new Query still shows IOPS
