## Purpose

The Graph view's built-in graph search: lets the user locate nodes instantly in a dense multi-cluster topology — **without refetching from the backend, without re-running layout, without changing the element set**. Miss fade lets the user see at a glance where the hits land; the result list can jump to (locate) hits that are off-screen or folded inside a collapsed container. This feature complements the app's kind / edge filters (the filters change the element set and redraw); it does not replace them.

## ADDED Requirements

### Requirement: Search bar rendering and lifecycle

The Graph view SHALL render a **persistent** search bar in the **top-right corner** of the canvas (absolutely positioned, sharing the same inset band as the pinned hover-tooltip — **`right: 8`**, flush with or adjacent to the Graph view's top edge; stacked above the canvas; it MUST NOT occupy layout space or shrink the graph). When the search bar and the pinned hover attributes card are both present, the search bar MUST be stacked **above** the pinned card: the two MUST NOT overlap; the pinned card docks **below** the search bar. The search query MUST be Graph-view-local, transient view state (the same class as pod-parent mode / legend collapsed state): it MUST NOT be written to runtime config, MUST NOT be written to the URL, and is never persisted. When graph data refreshes from the configured backend URL and delivers new data, the query and its effects MUST be preserved. The system MUST NOT register any global keyboard shortcut for invoking search (such as `/`, `Ctrl+F`) — keyboard behavior exists only while the input has focus (see "Keyboard interaction inside the search input"). When the search bar and the partial-parse warning banner are both present, the two MUST NOT overlap (the banner stays in the top-left corner; the search bar in the top-right).

#### Scenario: Search bar always visible at top-right above pinned attributes

- **WHEN** the Graph view renders normally (not in the error / first-load state)
- **THEN** the search input is shown in the top-right corner of the canvas (right inset consistent with the pinned card); the graph's size and layout are unaffected by its presence
- **WHEN** a node is selected and the pinned attributes card is showing
- **THEN** the pinned card appears directly below the search bar and does not overlap it

#### Scenario: Query is not persisted

- **WHEN** the user enters a query and then reloads the app page
- **THEN** the search input is empty, with no fade or viewport effect; neither runtime config nor the URL contains any search-related field

#### Scenario: Data refresh preserves the query

- **WHEN** the query is non-empty and graph data refreshes from the configured backend URL and delivers new data
- **THEN** the query is preserved; the hit set is recomputed over the new elements, and the fade and result list update accordingly

### Requirement: Hit matching rules

Whether a node is a **hit** SHALL be decided by a pure predicate (no side effects, based only on the query and node fields): the query is split into tokens on whitespace; **every** token (AND) must match — case-insensitive substring — **any** (OR) of the node's six fields: `label`, `kind`, `namespace`, `cluster`, `application`, `ipAddress`. Missing fields are simply skipped. Matching MUST cover nodes only: edges are never hits and never appear in the result list; a hit node's incident edges stay lit together with it (see "Miss fade"). No regex, fuzzy, or field-qualifier syntax is supported. An empty (or whitespace-only) query means search is inactive.

#### Scenario: Single token substring-matches label

- **WHEN** the query is `mongo`, and a node with label `mongodb-replica-0` exists
- **THEN** that node is a hit (case-insensitive — `Mongo` also matches)

#### Scenario: Multi-token AND across fields

- **WHEN** the query is `prod mongo`, node A (`cluster: prod`, `label: mongodb-0`), node B (`cluster: dr`, `label: mongodb-0`)
- **THEN** node A is a hit (the two tokens match cluster and label respectively); node B is not (`prod` matches no field)

#### Scenario: Reverse lookup by IP

- **WHEN** the query is `10.0.3`, and some pod's `ipAddress` is `10.0.3.17`
- **THEN** that pod is a hit, and its result row's subline shows the matched field (`ipAddress: 10.0.3.17`)

#### Scenario: Edges are never hits

- **WHEN** the query is any edge type string (such as `pod-calls-pod`)
- **THEN** no edge becomes a hit or appears in the result list; only nodes whose six fields happen to match (if any) are hits

### Requirement: Viewport fit

After a pause in typing (debounce), the Graph view SHALL animate the viewport to fit the **visible hit set** (including proxy-hit containers; **excluding** filter-hidden and other invisible elements). The zoom after the fit MUST NOT exceed `1.5` (when exceeded, clamp to 1.5 and keep centered). When the query is cleared, the viewport MUST stay where it is (no snapshot, no restore — clearing only removes the fade). When the hit set is empty, the Graph view MUST NOT perform a fit (viewport unchanged).

#### Scenario: Debounced fit to all hits

- **WHEN** the user stops typing and ≥1 visible hit exists
- **THEN** the viewport animates to fit the bounding box of all visible hits (including proxy-hit containers), zoom ≤ 1.5

#### Scenario: A single hit is not over-zoomed

- **WHEN** exactly one hit exists, and the natural fit would push the zoom far beyond 1.5
- **THEN** the zoom is clamped to 1.5, and that hit is centered

#### Scenario: Viewport stays put on clear

- **WHEN** the user clears the query
- **THEN** the viewport keeps its last position (no restore animation); only the fade is removed

#### Scenario: Zero hits never move the viewport

- **WHEN** the query has no hits
- **THEN** the viewport does not move (the whole graph fades; the result list shows a no-results message)

### Requirement: Result list

When the query is non-empty **and the result list is in the open state**, a dropdown result list SHALL hang below the search bar; each row (**result**) corresponds to one hit: the main line is `label` + kind badge; the subline shows `namespace` / `cluster` context, and when the matched field is not `label` it MUST show that field and its value (so the user can understand why it matched). The list MUST be stably sorted by label, capped at **50** rows, with an "N more" indicator at the end when the cap is exceeded. Hits inside a collapsed container MUST be annotated with their container (such as `in <controller> (collapsed)`). **Filter-hidden** hits (hidden by the kind / edge / ingress filters) MUST still be listed, but rendered in a **disabled** state with an `eye-slash` badge — informational only, not locatable, and the list MUST NOT offer any action path that would silently change the filters. The list has a maximum height (about 40% of the canvas height) and scrolls internally.

The list's open / closed state is transient UI state **independent of the query string**:

- When the user changes the query to a non-empty value, or the search input gains focus while the query is already non-empty, the list MUST open.
- When the search input loses focus (blur), a non-disabled result is successfully activated (locate), or the query becomes empty, the list MUST close.
- Closing the list itself MUST NOT clear the query, remove the miss fade, or deselect the node.

#### Scenario: List shows hits with cap

- **WHEN** the query matches 120 nodes and the result list is open
- **THEN** the list shows the first 50 rows + "70 more"; each row carries the label, kind badge and context subline

#### Scenario: Filter-hidden hit renders disabled with eye-slash

- **WHEN** a hit's kind is hidden by the legend's visibility toggle (eye), and the result list is open
- **THEN** its row still appears, disabled + `eye-slash` icon; clicking has no effect (no selection, no fit, kind filter state unchanged)

#### Scenario: Blur hides the result list without clearing the query

- **WHEN** the query is non-empty, the result list is open, and the search input loses focus
- **THEN** the result list is hidden; the query text, the miss fade and any existing selection all remain unchanged

#### Scenario: Focus reopens the result list when the query is non-empty

- **WHEN** the query is non-empty, the result list is closed, and the user moves focus to the search input
- **THEN** the result list reopens, showing the hits for the current query

### Requirement: Proxy hit (visual stand-in for collapsed hits)

While typing (before any locate), a hit folded inside a collapsed container MUST be visually represented by its **outermost collapsed ancestor**: that container stays lit and counts toward the fit set. Typing MUST NOT auto-expand any container — expansion happens only through locate.

#### Scenario: Typing lights containers without expanding

- **WHEN** the query matches several pods inside a collapsed controller
- **THEN** each pod's outermost collapsed ancestor stays lit and joins the fit set; no container is expanded and the layout does not move; the list still shows those pods (with the collapsed annotation)

### Requirement: Search never touches visibility or empty states

Search (fading) MUST NOT change the output of the visibility computation (kind / edge / ingress filters), and MUST NOT trigger the empty-state overlay: under a zero-hit query every element stays on the canvas (only faded), and the "All elements filtered out" / "All node types filtered" empty states MUST NOT appear because of search.

#### Scenario: Zero hits do not trigger the empty state

- **WHEN** the query matches no node (such as random characters)
- **THEN** the whole graph fades but every element remains visible; no empty-state overlay; the list shows a no-results message

### Requirement: Miss fade over the hit set alone

When the query is non-empty, the Graph view SHALL fade all **non-hit** elements (**miss fade**), achieved solely by toggling style classes: it MUST NOT remove or hide elements, MUST NOT trigger a layout run, and MUST NOT take part in the visibility computation. The lit (unfaded) set is exactly the union of every hit's **focus neighborhood** — identical to the set lit by left-clicking that node on the canvas: the hit itself, its incident edges, its 1-hop neighbor nodes, its descendants, and the ancestor containers of all of the above (a lit node must never sit inside a faded container) — proxy-hit containers (see "Proxy hit") light their neighborhood the same way. Because the other endpoint of every lit edge is a lit neighbor, a lit edge MUST NOT terminate in a faded node. **No selection ever enlarges this set** — neither a selection left over from before the query (a canvas selection survives after the detail panel closes), nor the node the user most recently located, because locate clears the query and thereby ends the miss fade outright rather than enlarging it. A **zero-hit** query yields an empty lit set and the whole graph fades. Miss fade and selection-focus fade MUST be **mutually exclusive**: while the query is non-empty only the miss fade applies (the focus fade yields); when the query becomes empty — whether by editing, Esc, canvas click or locate — all miss fade is removed and (if a selection exists) the focus fade is restored.

#### Scenario: Typing fades non-hits immediately

- **WHEN** the user types a query that makes some nodes hits
- **THEN** non-hit elements fade; each hit, its incident edges, its 1-hop neighbor nodes and their ancestor containers stay lit — exactly what clicking that hit would light; elements outside every hit's focus neighborhood stay faded; no element is hidden or moved, and layout does not re-run

#### Scenario: No lit edge ends in a faded node

- **WHEN** a node hit by the query has a neighbor that does not itself match the query
- **THEN** that neighbor node stays lit together with the connecting edge — a lit edge terminating in a faded node never appears on the canvas

#### Scenario: A selection from before the search stays faded

- **WHEN** a node is selected, the user closes the detail panel (the selection survives), then types a query that neither matches that node nor hits any of its neighbors
- **THEN** that selected node and its neighborhood fade together with all other misses; only each hit's focus neighborhood stays lit

#### Scenario: Zero hits fade the whole graph

- **WHEN** the query is non-empty and matches no node, whether or not an active selection exists
- **THEN** every element is faded; no element is hidden, and the empty-state overlay does not appear

#### Scenario: Focus fade yields while searching

- **WHEN** a node is selected (selection-focus fade in effect), and the user types a non-empty query
- **THEN** the canvas shows only the miss fade, driven entirely by the hit set; the selection ring is retained, but no focus fade is applied

#### Scenario: Clearing the query restores focus fade

- **WHEN** the query is cleared (or cleared with Esc) while a node is selected
- **THEN** all miss fade is removed and the selection-focus fade is restored immediately (per the selected node's neighborhood)

### Requirement: Locate (activating a result row) ends the search

Activating (click or Enter) a non-disabled result SHALL behave like **left-clicking that node on the canvas plus a viewport fit**, and SHALL, in order: (1) if the hit sits inside a collapsed container, expand its **collapsed ancestor chain** (that chain only, via the existing collapse state update path — this is the only search action allowed to change collapse state); (2) select the node, **and open the node-detail panel when the node is detail-eligible** (the same path as a canvas tap: highlight, pinned tooltip, detail panel opens — a non-detail-eligible node, such as a decorative `namespace` group, follows the canvas rules and MUST NOT open the panel); (3) fit to that node's closed neighborhood (the same zoom cap); (4) **clear the search query** — the input is left empty and MUST NOT retain the result's label or any other text; (5) **close the result list**.

Clearing the query in step 4 MUST NOT cancel the fit from step 3, MUST NOT move the viewport on its own, and MUST NOT trigger the debounced fit-to-all-hits. Because the query is empty afterwards, the miss fade is removed and control of the fade returns to the just-selected node's **focus fade**, so exactly that node's neighborhood stays lit. Containers expanded by locate MUST remain expanded afterwards (no automatic re-collapse).

#### Scenario: Locate a hit inside collapsed containers

- **WHEN** a hit sits inside a collapsed controller, which in turn sits inside a collapsed application, and the user clicks its result row
- **THEN** the application and the controller expand in order (that chain only — other collapsed containers are untouched), the node is selected, the detail panel opens if it is detail-eligible, and the viewport fits to its closed neighborhood

#### Scenario: Locate clears the query and closes the list

- **WHEN** the user activates a non-disabled result with label `mongodb-replica-0`
- **THEN** the search input becomes empty, the result list closes, and the node is selected (locate steps 1–3 still execute)

#### Scenario: Locate lights only the located node's neighborhood

- **WHEN** the query `gateway` matches several nodes (such as a `gateway` pod, plus the entire `mesh-gateway` application, controller and pod), and the user locates the `gateway` pod
- **THEN** only the `gateway` pod's focus neighborhood stays lit — the other previous hits, their incident edges, and every edge whose other endpoint is faded are faded too

#### Scenario: Locate opens the detail panel like a canvas node tap

- **WHEN** the user activates a non-disabled result whose node is detail-eligible (such as a pod)
- **THEN** the node-detail panel opens, with the same selection side effects as a canvas left-click (highlight + top-right pinned tooltip)

#### Scenario: Locate of a non–detail-eligible node does not open the panel

- **WHEN** the user activates a selectable but non-detail-eligible result (such as a decorative `namespace` group)
- **THEN** selection (and collapse cue behavior) applies per the canvas rules, but the node-detail panel MUST NOT open

#### Scenario: Expansion survives locate

- **WHEN** locate expanded a container in order to reach its hit
- **THEN** that container remains expanded after the query is cleared; only the fade changes, and the viewport keeps the fit performed by locate

### Requirement: Keyboard interaction inside the search input (arrows, Enter, Esc)

While the input has focus: `↑` / `↓` SHALL move the highlight cursor while the result list is open, **skipping disabled rows**, and scroll along with it (scroll-follow); `Enter` SHALL locate the highlighted row when one exists (the same steps as a click: open detail if detail-eligible, fit, clear the query, close the list), otherwise fit to all hits immediately (without waiting for the debounce); `Esc` SHALL be two-stage — the first press clears the query (removes the fade, closes the list, viewport stays where it is), the second press (query already empty) blurs the input. These keyboard events MUST NOT bubble to the app shell / document (to avoid triggering any app-level Esc / shortcut behavior).

#### Scenario: Arrow keys skip disabled rows

- **WHEN** the open list is [hit A, filter-hidden B, hit C], the cursor is on A, and the user presses `↓`
- **THEN** the cursor jumps to C (skipping B)

#### Scenario: Enter locates highlighted row and clears the query

- **WHEN** a non-disabled row is highlighted and the user presses `Enter`
- **THEN** locate executes for that row, the input value becomes empty, and the result list closes

#### Scenario: Enter with no cursor fits immediately

- **WHEN** the user types quickly and presses `Enter` before the debounce fires, and no row is highlighted
- **THEN** the viewport fits to all hits immediately, without waiting for the debounce

#### Scenario: Two-stage Esc

- **WHEN** `Esc` is pressed while the query is non-empty
- **THEN** the query is cleared, the result list closes, the fade is removed (viewport stays where it is); the input keeps focus
- **WHEN** `Esc` is pressed again while the query is already empty
- **THEN** the input loses focus; the event does not bubble to the app shell

### Requirement: Canvas interaction and locate clear search

When the user changes the selection via the **graph canvas** (node tap, background tap, edge tap, or the unselectable cluster backplate — that is, any selection change on the canvas) while the search query is non-empty, the Graph view SHALL clear the query, with the same effect as clearing via Esc: remove the miss fade, close the result list, **viewport stays where it is**. The canvas selection / deselection brought by that click MUST still apply normally. **Locate** SHALL likewise clear the query (see "Locate (activating a result row) ends the search"); it differs from a canvas tap only in first expanding the collapsed ancestor chain, then fitting the viewport to the located node's closed neighborhood. Closing the detail panel and toggling the legend MUST NOT clear the search.

#### Scenario: Canvas node tap clears search

- **WHEN** the query is non-empty and the user taps a node on the canvas
- **THEN** the query is cleared, the miss fade is removed, the result list closes, the viewport stays where it is, and the node is selected (detail opens if it is detail-eligible)

#### Scenario: Canvas background tap clears search

- **WHEN** the query is non-empty and the user taps the graph background (or an edge / cluster backplate)
- **THEN** the query is cleared, the miss fade is removed, and the selection is cleared per the existing deselection rules

#### Scenario: Locate clears search but still fits

- **WHEN** the user activates a non-disabled result with label `mongodb-replica-0`
- **THEN** the query is cleared exactly as with a canvas tap, and unlike a canvas tap the viewport fits to that node's closed neighborhood
