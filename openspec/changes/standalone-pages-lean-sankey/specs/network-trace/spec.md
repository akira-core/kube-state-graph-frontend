## ADDED Requirements

### Requirement: Input is the trace fetch

The Network Sankey page MUST take the response of `endpoints.trace` (normalized through the same normalize boundary of `graph-data-source`) as its sole input, held by the page's own loader (see `app-shell`). The request is `GET <endpoints.trace>?hostname=<h>&from_ts=<ms>&to_ts=<ms>&max_hops=<n>&top_n=<n>&threshold=<pct>&track_dir=<source|destination>`, assembled by `graph-data-source`: all seven parameters MUST always be sent explicitly, including those at their default, and `from_ts` / `to_ts` MUST be the applied view time range resolved **at send time** to epoch **milliseconds** (13 digits for any date in this century). The response body is the cytoscape-style wire shape shared with the other endpoints plus four network fields (`metrics.delta_bps`, node `investigation`, `clients`, `other_in_bps` / `other_out_bps`).

The trace model is **read-only derived data** computed from the normalized elements by `deriveTrace(elements, { direction, minBps, grouping })`; the derivation MUST NOT mutate any element (deep-equal before and after). While the loader is loading or in error, the view MUST present that state and draw nothing. When `endpoints.trace` is not configured and `demoMode` is `false`, the view MUST show the not-configured state and MUST NOT issue a request. When `demoMode` is `true`, the view renders the built-in `SHOWCASE_TRACE` fixture on mount, issues no request, and holds every scope value in component state as the storage view does.

#### Scenario: One request with seven explicit parameters

- **WHEN** the user opens `/network/sankey?hostname=sw-tor-1&from=now-1h&to=now`, leaves every other control at its default and activates Query at time `T`
- **THEN** exactly one request is issued to `endpoints.trace` whose query string contains `hostname=sw-tor-1`, `max_hops=7`, `top_n=3`, `threshold=10`, `track_dir=source`, `from_ts` equal to `(T − 1h)` in milliseconds and `to_ts` equal to `T` in milliseconds, and no request is issued to any other endpoint

#### Scenario: Derivation does not change the source data

- **WHEN** `deriveTrace` runs on the normalized fixture for both directions, with `minBps` `0` and `5e8`, and both groupings
- **THEN** the normalized elements after derivation are deep-equal to a deep copy taken before

#### Scenario: Endpoint not configured

- **WHEN** the runtime config lacks `endpoints.trace` and `demoMode` is `false`
- **THEN** `/network/sankey` shows `trace-empty-unconfigured`, its scope bar stays operable, and no request is issued

### Requirement: No card offers Locate

No card, frame title row or residual on the Network Sankey MUST be presented as clickable (no pointer cursor, no click effect, `data-locatable="false"` on every card), and clicking any of them MUST navigate nowhere and change nothing but hover: the Graph view that a Locate used to land on no longer exists, and the Storage Graph draws a different body. The card search's own Locate — framing the hit card within the chart (see `sankey-canvas` "Card search overlay") — is unaffected.

#### Scenario: Clicking a hop card does nothing

- **WHEN** the user clicks the `sw-core-1` card after a committed query on `/network/sankey?hostname=sw-tor-1&from=…&to=…`
- **THEN** the address bar is unchanged, the history length is unchanged, no request is issued, and the card is not presented with a pointer cursor

#### Scenario: Card search still frames a hit

- **WHEN** the user types `kafka-2` in the card search and activates the result
- **THEN** the viewport pans to frame the `kafka-2` card within the chart and the page stays on `/network/sankey`

### Requirement: Empty states by cause

The view MUST distinguish seven states by cause, each with its own `data-testid` and explanatory text in the same format as the storage view's empty states, with the scope bar — its scope controls and its view-controls group alike — operable in every state:

1. `trace-empty-unconfigured` — `endpoints.trace` absent outside demo mode; its text names the trace endpoint and states that the Storage pages are unaffected.
2. `trace-empty-scope` — the draft has no hostname or has problems; names the problem and states that no request has been issued.
3. `trace-empty-awaiting` — the draft is valid but nothing has been committed on this mount; points at Query.
4. `trace-empty-cancelled` — the only request of this mount was cancelled and no payload is held.
5. `trace-empty-response` — the backend answered with a body holding no element at all: an answer about this switch and window, not a malformed body; its text says no traffic was recorded and that the hostname may not exist or the window may be outside retention (plus the demo-fixture note in demo mode).
6. `trace-empty-model-error` — `deriveTrace` returned `ok: false` for a body that holds elements (a storage-only body, a trace stop with onward edges, …): lists every error.
7. `trace-empty-filtered` — the display threshold hid every hop.

A **warnings pill** in the scope bar's view-controls group shows how many warnings the drawn body carries — the model's warnings together with the normalize boundary's `errors` — and lists every message when hovered or focused; it is not drawn when there are none, and nothing else below the chart lists them.

#### Scenario: A deep link awaits Query

- **WHEN** the user opens `/network/sankey?hostname=sw-tor-1&from=now-1h&to=now`
- **THEN** `trace-empty-awaiting` is shown naming the Query control, no request has been issued, and Reload is unavailable

#### Scenario: Empty body is an answer, not a blank

- **WHEN** the backend answers 200 with `{ elements: { nodes: [], edges: [] } }`
- **THEN** the view shows `trace-empty-response` stating that no traffic was recorded, not `trace-empty-model-error`, and the status indicator reads ready

#### Scenario: Warnings are a pill, not a drawer

- **WHEN** the fixture is drawn and `Min Δ` is `1e9`, so the model reports the hidden-ribbon sentence as a warning
- **THEN** the view-controls group shows a warnings pill with the count, hovering or focusing it lists the hidden-ribbon warning, and no element below the chart lists warnings; after `Clear` that warning leaves the pill, and the pill disappears when no warning remains

## MODIFIED Requirements

### Requirement: Layout and order switches

The scope bar's **view-controls group** (see "Top nav bar" in `app-shell`) SHALL provide `Group` (`None` default | `Cluster`) and `Order` (`Flow` default | `Barycenter`), both **transient** page state (not in the URL, not persisted, reset on remount), and switching either issues no request and preserves the zoom / pan viewport and hover state. Both remain operable in every empty state.

Every card reads its Kubernetes cluster from its own `labels.cluster` (k8s nodes and pods on the wire); a synthesised namespace / application card inherits its pod's, and one namespace name present in two clusters is two namespace cards. Under `Cluster`, every k8s-band card (k8s node hop, pod, application, namespace) that names a cluster is framed with the others of that cluster in one `SankeyWrapperBox` spanning every k8s column, one row block per cluster shared across the columns (a column with no member of a cluster leaves that block's row empty); frames are ordered by the summed traced flow of the cluster's pod cards under `Flow` and by name under `Barycenter`, cards naming no cluster sit below every frame, the client partition below everything, and a frame's border takes the worst status of its members. A frame is not a graph node: it has no edges, no column of its own and no residuals; ribbons attach to the cards. Its title row hovers (tooltip `cluster / <name>`, the card count, the folded status) and lights the union of its members' paths, and is not locatable. Under `None`, or when no card names a cluster, no frame is drawn and the layout is exactly the ungrouped one.

Under `Flow`, a node's rank is the amount on its **traced side** — the sum of its inbound ribbons under a `destination` trace, of its outbound ribbons under a `source` trace — **excluding residuals**, descending; leaf pods and application cards of one namespace stay adjacent (groups ordered by group total), cluster frames partition the k8s columns first, a lateral chain stays adjacent with the producer above, and equal ranks fall back to the upstream barycenter. `Barycenter` orders purely by the upstream barycenter. Both orders apply to the k8s partition and the client partition of a column separately: the client cards are always below the k8s cards.

#### Scenario: Cluster grouping frames a cluster across the k8s columns

- **WHEN** the fixture's `node-w-11`, `ingest-7d9c` and `kafka-2` carry `labels.cluster: east`, `node-w-12` and its pods `west`, and the user switches `Group` to `Cluster`
- **THEN** a frame titled `east` encloses the `node-w-11` hop, both pod cards and their namespace cards across the k8s columns, a second frame `west` sits below it, `node-w-13` sits below both, the ribbons still end on the cards, the request count is unchanged, and the zoom readout is unchanged

#### Scenario: Flow order ignores residuals

- **WHEN** switch `X` has ribbons totalling `+3 Gbps` and an `other out` of `+20 Gbps`, and switch `Y` in the same column has ribbons totalling `+5 Gbps`
- **THEN** `Y` is placed above `X`

#### Scenario: The switches sit in the scope bar

- **WHEN** the user opens `/network/sankey`
- **THEN** `Group` and `Order` are found inside the page's control bar after the Query action, there is no bordered row between the control bar and the chart, and both are operable while `trace-empty-awaiting` is shown

### Requirement: The `Min Δ` display threshold

The scope bar's view-controls group SHALL provide a `Min Δ` input (bits/s, raw string, the same input styling as the storage view's Top pods field, an accessible name, an adjacent rendering of the value in `Gbps` / `Mbps` / `kbps`) with a `Clear` action. Edits apply after a 200 ms debounce; blur normalizes the field through `cleanMinBps` (floor; a value not greater than `0` is `0`). The chart keeps only ribbons whose aggregated value is **strictly greater** than the threshold (`>`, never `>=`); hidden amounts fold into the hop's residuals (see "Residuals"); the anchor edge and derived edges are exempt; a hop with no ribbon left is hidden as a whole (a no-flow hop is not counted); the residual blocks themselves are not filtered. While anything is hidden the view-controls group MUST show a pill `hidden N ribbons / M hops (X)` — the ` / M hops` part only when a hop was hidden whole, `X` the unsigned hidden total through `formatBitsPerSec` — and a warning naming the threshold, the hidden ribbons and total, and any hop hidden whole appears among the warnings pill's messages (see "Empty states by cause"). When the threshold hides every hop and there is no anchor, the view shows `trace-empty-filtered` with the pill still visible. The threshold is a display value: it is never sent to the backend, changing it issues no request, and outside demo mode it is written to the URL as `min_bps` (omitted when `0`).

#### Scenario: Strictly greater

- **WHEN** ribbons of exactly `500000000` and `500000001` exist and the user sets `Min Δ` to `500000000`
- **THEN** the first is hidden and the second is drawn

#### Scenario: Hidden amounts stay in the balance

- **WHEN** the start `sw-core-1` has outbound ribbons `+14 Gbps` to `sw-a`, `+5 Gbps` to `sw-b` and `+0.4 Gbps` to `sw-c`, `sw-c` also receives `+3 Gbps` from `sw-a`, and `Min Δ` is `1e9`
- **THEN** the `0.4 Gbps` ribbon disappears, `sw-core-1`'s `other out` grows by `0.4 Gbps`, `sw-c` stays drawn, the pill reads `hidden 1 ribbon (400 Mbps)`, no request is issued, and the address bar carries `min_bps=1000000000`; without the `sw-a → sw-c` ribbon `sw-c` is hidden whole and the pill reads `hidden 1 ribbon / 1 hop (400 Mbps)`

#### Scenario: Everything filtered

- **WHEN** a body without `investigation` has every ribbon below the threshold
- **THEN** the view shows `trace-empty-filtered` naming the threshold, the pill states the hidden counts, and the scope bar stays operable

### Requirement: Legend

The scope bar's view-controls group SHALL show a legend whose rows are presence-gated: a traced Δ ribbon row (always when a chart is drawn), a backward ribbon row, a lateral ribbon row, an ownership-line row, `other in` / `other out` swatches, and the shared `StatusLegend` dots when any card carries a status. Rows are drawn with the same SVG line samples the storage view's legend uses and text labels; the legend MUST NOT rely on hue alone to distinguish traced, backward and ownership lines (dashing and arrowheads distinguish them). While an empty state is shown no legend row is drawn.

#### Scenario: Rows follow the chart

- **WHEN** the fixture draws with one backward edge and owner lines but no lateral edge
- **THEN** the legend shows the Δ, backward, ownership and residual rows and no lateral row; after `Min Δ` hides the backward edge the backward row disappears

#### Scenario: The legend sits in the scope bar

- **WHEN** the fixture is drawn
- **THEN** the legend rows are found inside the page's control bar, after the `Group`, `Order` and `Min Δ` controls, and nowhere in the chart area

### Requirement: Zoom, keyboard and focus are the shared behaviour

The chart area's zoom / pan, opening viewport, control bar (zoom out, factor readout, zoom in, fit, 1:1, focus), keyboard shortcuts (`+` `-` `0` `1` `F` `Esc`, on the chart container only) and focus mode (collapsing the nav bar and the scope bar together with the view controls and legend it holds) MUST be provided by `sankey-canvas` and behave exactly as specified there and in `storage-flow-sankey`; the trace view MUST NOT reimplement any of them. Changing `Min Δ`, `Group`, `Order`, the theme, the container size or a refresh preserves the viewport; a new payload for a different hostname returns to the opening viewport.

#### Scenario: Focus mode on the Network Sankey

- **WHEN** the user zooms to 150 %, presses `F`, then `Esc`
- **THEN** in focus mode the nav bar and the scope bar (with `Group`, `Order`, `Min Δ`, the pills and the legend) are hidden and the chart fills the window; after leaving, all are restored and the readout still says `150%`

## REMOVED Requirements

### Requirement: Input is the trace fetch, shared by both Network views

**Reason**: There is one Network view. The requirement is re-stated as "Input is the trace fetch" above, without the Graph view.

**Migration**: None for the request or the model; the Network Sankey's loader, scope and URL contract are unchanged.

### Requirement: Empty states

**Reason**: Restated as "Empty states by cause". The block named an empty 200 body a model error, which the view has never drawn: a body holding no element is an answer about the switch and window (`trace-empty-response`), and only a body that holds elements the model cannot draw is `trace-empty-model-error`. The restated requirement lists all seven states and moves the warnings to a pill in the view-controls group.

**Migration**: None for the view; its states and test ids are unchanged. Read warnings from the warnings pill instead of the drawer below the chart.

### Requirement: Clicking a card Locates into the Network Graph

**Reason**: `/network/graph` no longer exists, so the navigation has no target.

**Migration**: Cards are not clickable (see "No card offers Locate"). Use the card search to frame a card within the Sankey.
