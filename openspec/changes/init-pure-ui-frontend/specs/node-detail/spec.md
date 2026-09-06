## Purpose

Defines the behavioral contract of the node detail panel in the Graph view: how the panel opens and closes relative to the selection, the contents of the header and of each data-gated section (Application / Containers / Alerts), and the requests, parameter assembly, response parsing and availability determination for prefetching change history and Dashboard links from the runtime config endpoints (`endpoints.configChanges`, `endpoints.codeChanges`, `endpoints.dashboard`).

## ADDED Requirements

### Requirement: Node detail panel

When the user **left-clicks** a detail-eligible node in the Graph view, the app SHALL open the detail panel as an overlay at the bottom of the canvas (without changing the size of the graph), whose header shows the node name, the kind badge, the status badge and a close button.

**Selection and detail open MUST be two independent states.** Establishing the selection, the single-selection highlight, the focus fade, the pinned card and the three deselection paths (clicking the background, clicking an edge, clicking the non-selectable `cluster` group) are defined by the `graph-view` capability; this capability only governs the panel's opening / closing relative to the selection. There are **two semantically different** ways to close the panel: (1) clicking the background or an edge (= deselect) closes the panel and clears the selection with it; (2) pressing the **close button** MUST **only close the panel** (detail open → false) — the selection and everything derived from it (single-selection highlight, focus fade, the pinned card in the top-right corner) MUST all be retained. When switching to another node the panel switches to that node. The selection highlight MUST track the **selection**, not the panel's open state. After closing, **clicking the already-selected node again** MUST reopen the panel, reusing the query timestamp captured at selection time (it MUST NOT re-issue the change history queries — closing and reopening are UI actions, not data actions; the query timestamp's lifetime is bound to the selection, and a new timestamp is taken only when a **different** node is selected).

**Detail-eligible nodes** are: leaf nodes (including `netapp-aggr`), k8s `node` containers, `netapp-node` containers, controller containers, and the ArgoCD **`application` group** (no kind; presented in the header badge with a synthesized `kind: application`). The decorative **`cluster` / `storage-cluster` / `namespace`** groups MUST NOT open the panel, and MUST NOT pin a card (`cluster` / `storage-cluster` are not selectable; `namespace` is selectable but does not open the panel — see `graph-view`). Selecting an `application` group MUST open the panel and render the Application section for that ArgoCD application (see "Node-detail Application and Containers sections"), and pin the card at the same time. **Locate** in `graph-search` MUST establish the selection and open the panel for a detail-eligible node (detail open → true, equivalent to a canvas left-click).

Besides name / kind / status, when the `/dashboard` query for that node (any detail-eligible node — **leaf including `netapp-aggr`, k8s-node, `netapp-node`, controller**; **only the decorative cluster / storage-cluster / namespace / application are excluded**) returns a usable URL, the header MUST show a **Dashboard button** beside the name; the timing of the query, parameter assembly, the 200-gated availability determination and the open-in-new-tab behavior are defined by this capability's Dashboard-related requirements.

The panel body is always gated by **whether data is present**, in this order: (1) the **Application change-report section**, shown for any node carrying `data.application` (**including `service` / `pvc`**); the **Containers change-report section**, shown only when a workload kind carries `data.containers` (both are covered in "Node-detail Application and Containers sections"); (2) the **Alerts section**, which renders the alert table when the node carries a non-empty `data.alerts`, and **is not rendered at all when there are no alerts**. **The panel has no permanent Properties section** — the node's promoted attributes (synthesized kind, `namespace`, `application`, `ipAddress`, `storageclass`, `health`, formatted `usage`, etc.) are presented by the **pinned card** (sharing the same source as the hover tooltip, see `graph-view`) and are not repeated in the panel.

**The panel ALWAYS renders**: as long as a detail-eligible node is left-click selected **and the panel has not been closed with the close button** (i.e. a selection exists and detail open is true), the **header** (node name + kind / status badges + close button, plus the Dashboard button when the `/dashboard` query is ready and `urls` is non-empty) is the minimum rendering, and each body section (Application / Containers / Alerts) is gated by its own data. A node with no body content at all (such as `netapp-aggr` / `netapp-node`, or a `service` / `pvc` without `application`) **still renders a header-only panel** when left-click selected; its promoted attributes are carried by the pinned card and not repeated in the panel. The pinned card itself MUST NOT carry a Dashboard button; the header is the only dashboard entry point — and since the header always renders, that entry point is always reachable.

The panel height MUST grow with content, and scroll only after exceeding the cap of **50%** of the canvas height (header fixed); content below the cap MUST NOT scroll. **Scrolling MUST be concentrated in a single container (the panel body)**: the body is the sole scrolling authority, every section is content-height, and no section MUST own internal scrolling. The panel can stack several sections at once (Application + Containers + Alerts); if any section carried its own internal scrolling, under a constrained height several sections would overlap each other and none could scroll, so a single body scroll is the only composable model.

Alert data comes from the optional `alerts` field of the upstream graph JSON node (normalized to `data.alerts`; missing or empty array → the section is not rendered). Each alert expresses repeated occurrences with an **optional** `timeRecords: number[]` (Unix seconds, ascending); the producer has already aggregated the same alert into a **single** entry, so the table is **one row per alert**. The **Count** column MUST show `timeRecords.length`, and MUST list every occurrence time (formatted in the browser's local time zone) in a hover hint. The **Last occurred** column MUST show `max(timeRecords)` (formatted); when the app provides a changeable **view time range**, that column MUST be clickable, and clicking sets the view time range to the window `[t-300, t+300]` centered on `t = max(timeRecords)` (Unix seconds) with a fixed ±5 minutes (300 seconds); when the app provides no view time range, the column is presented as plain text.

**The only field guaranteed to exist on an alert row is Alert (`name`).** Every other column corresponds to an optional upstream field, and when any is missing that cell degrades on its own to the uniform "n/a"; the row itself always renders — an alert carrying only `name` is presented as one row with five n/a.

**Count and Last occurred are both derived columns of `timeRecords`, and that field is optional** (the alert overlay of kube-state-graph carries no occurrence time at all — see `graph-data-source`). When `timeRecords` is missing, these two cells MUST each degrade to the uniform missing-value placeholder "n/a", and Last occurred MUST NOT be clickable — there is no moment to rewind to. The two cells MUST NOT substitute `0` and the epoch start date: that is a fabricated reading, indistinguishable from "this alert occurred once, at 1970-01-01". `severity` is an **optional** free-form string: `info` / `warning` / `critical` take their respective semantic colors; any other custom label MUST be preserved as-is and colored with the critical color as fallback. **When `severity` is missing, that cell MUST show a muted "n/a" rather than a badge** — missing differs from "an unrecognized label": the latter is still a level the producer gave, the former was rated by nobody, and rendering a badge in the fallback color amounts to asserting a severity nobody assigned. **Missing Pod / Service cells in the alert table MUST show a muted "n/a"** (the panel-wide uniform missing-value placeholder — see "Node-detail Application and Containers sections").

#### Scenario: Left-clicking any detail-eligible node opens the panel

- **WHEN** the user **left-clicks** any non-decorative detail-eligible node
- **THEN** the bottom overlay renders the header (node label, kind badge, status badge, close button) above the graph, the graph size is unchanged, and any body section that has data appears along with it
- **AND** the node's selection highlight tracks the selection, and its attributes are pinned in the top-right pinned card at the same time

#### Scenario: Clicking outside or pressing close

- **WHEN** the user clicks the graph background or an edge
- **THEN** the detail panel closes and the selection is cleared (selection highlight, focus fade and pinned card all disappear)
- **WHEN** with the panel open, the user presses the close button
- **THEN** the detail panel closes but the selection is retained — the selection highlight, focus fade and pinned card remain visible

#### Scenario: Reopening after close does not re-issue queries

- **WHEN** the user closes the panel with the close button, then left-clicks that (still selected) node again
- **THEN** the panel reopens with the same content as before closing; the change history queries reuse the original selection timestamp and MUST NOT be re-issued

#### Scenario: Switching nodes

- **WHEN** with the panel open, the user clicks another node
- **THEN** the panel switches to the newly clicked node (the pinned card switches with it), and the queries are issued with the timestamp captured at that new selection

#### Scenario: Locate opens the panel

- **WHEN** the user activates a search result for a detail-eligible node through graph-search's locate
- **THEN** that node becomes the selection, the detail panel opens (equivalent to a canvas left-click), and the pinned card appears below the search bar as usual

#### Scenario: Selecting a namespace group does not open the panel; selecting an application group opens its app detail

- **WHEN** the user selects a decorative `namespace` group
- **THEN** the detail panel MUST NOT open, and no card is pinned (only the selection ring and collapse cue defined by `graph-view`)
- **WHEN** the user selects an ArgoCD `application` group
- **THEN** the detail panel opens, the header badge shows the synthesized `application` kind, the Application section renders (prefetching that application's `config_changes`), and the pinned card appears along with it

#### Scenario: A bare node still renders a header-only panel

- **WHEN** the user left-click selects a detail-eligible node with no application, containers, alerts, and no ready dashboard URL (such as `netapp-aggr` / `netapp-node`, or a `service` / `pvc` without `application`)
- **THEN** the detail panel **still renders**, containing only the header (node name + kind / status badges + close button), with no body section
- **AND** that node's promoted attributes are carried by the pinned card and are not repeated in the panel

#### Scenario: Header shows the Dashboard button when the backend provides a URL

- **WHEN** the left-click selected node's `/dashboard` query returns ready with a non-empty `urls` (regardless of whether there is any body content)
- **THEN** the header shows the Dashboard button beside the node name; with no body content at all this is a header-only panel
- **AND** the Dashboard button is reachable (it exists only in the header, and never appears in the pinned card)

#### Scenario: Dashboard button appears beside the name

- **WHEN** the panel of some detail-eligible node is open (because it carries change history / alerts data, or header-only merely because a ready dashboard exists), and its `/dashboard` query returns 200 with a non-empty url
- **THEN** the header shows the Dashboard button beside the node name
- **AND** the decorative cluster / storage-cluster / namespace / application groups do not have this button (the Dashboard query does not apply to them); a detail-eligible leaf carrying a dashboard URL (such as `netapp-aggr`) shows the button in its header-only panel

#### Scenario: Alert table renders aggregated, one row per alert

- **WHEN** the selected node carries a non-empty `data.alerts` (one or more entries)
- **THEN** the Alerts section shows the alerts row by row in a table with column headers, **one row per alert**, with the columns Pod / Service / Alert / Severity / Count / Last occurred

#### Scenario: Missing alert Pod / Service shows n/a

- **WHEN** an alert row's Pod or Service is missing
- **THEN** that cell shows a muted "n/a" (the uniform missing-value placeholder)

#### Scenario: Count badge and its occurrence-time hint

- **WHEN** an alert's `timeRecords` contains N occurrence times
- **THEN** that row's Count column shows `N` (= `timeRecords.length`)
- **AND** hovering Count lists all N occurrence times in a hint (formatted in the browser's local time zone)

#### Scenario: An alert without occurrence times still forms a row, with its two derived columns degraded to n/a

- **WHEN** an alert has no `timeRecords` field (such as the `{ name, severity }` sent by the kube-state-graph overlay)
- **THEN** that alert MUST still render as one row, with the Alert and Severity columns presented as usual
- **AND** the Count and Last occurred columns MUST each show a muted "n/a", and MUST NOT show `0` or the epoch start date
- **AND** the Last occurred column MUST NOT be clickable (no Count hover hint)
- **AND** other rows in the same table that carry `timeRecords` MUST be unaffected, showing Count and a clickable Last occurred as usual

#### Scenario: Severity coloring (free-form string plus semantic color)

- **WHEN** an alert's `severity` is `info` / `warning` / `critical`
- **THEN** that row's Severity is presented as a badge in the corresponding semantic color
- **WHEN** `severity` is not in the known set (such as the custom label `fatal`)
- **THEN** it is colored with the critical color as fallback, the badge preserves the label text as-is, and no error occurs

#### Scenario: An alert without severity shows n/a rather than a badge

- **WHEN** an alert has no `severity` field (the producer's rule declared no severity label)
- **THEN** that row MUST still render, with the Alert column and its occurrence-time-related columns as usual
- **AND** the Severity column MUST show a muted "n/a", and MUST NOT render any badge (including one in the fallback color)

#### Scenario: An alert carrying only name still forms a row

- **WHEN** an alert carries only `name` (no pod / service / severity / timeRecords)
- **THEN** that row renders, the Alert column shows the name, the remaining five columns are all a muted "n/a", and Last occurred is not clickable

#### Scenario: Clicking Last occurred adjusts the view time range

- **WHEN** the app provides a changeable view time range, the user clicks a row's Last occurred column, and that alert's largest `timeRecords` value is `t` (Unix seconds)
- **THEN** the app sets the view time range to `[t-300, t+300]` (±5 minutes), centered on the last occurrence
- **WHEN** the app provides no view time range, or that alert has no `timeRecords`
- **THEN** the Last occurred column is presented as plain text and is not clickable

#### Scenario: Multiple sections share a single body scroll and never overlap

- **WHEN** the panel renders several tall sections at once (for example a pod with an application, many containers and many alerts, where both Containers and Alerts exceed the cap)
- **THEN** the panel body is the only scrolling container, every section is content-height, and their table areas MUST NOT carry their own vertical scrolling
- **AND** the sections stack vertically and MUST NOT overlap; above the cap the body scrolls the whole stack (header fixed), below the cap there is no scrolling at all

#### Scenario: Alerts section is not rendered when there are no alerts

- **WHEN** the selected node has no `alerts` field, or it is an empty array
- **THEN** the Alerts section MUST NOT render (no table, and no "No alerts" message); other sections with data render as usual, and when there is no other body section the panel still renders header-only

### Requirement: Node-detail Application and Containers sections

The app SHALL provide in the node detail panel an **Application section** and a **Containers section** backed by change history queries, reusing the same section layout as the Alerts section. The **Application section** is shown for **any node carrying `data.application`** — a pod or workload controller (`kind ∈ { pod, deployment, statefulset, daemonset, job, cronjob }`), a `service` / `pvc` leaf belonging to some ArgoCD application, **and the ArgoCD `application` group node itself** (no kind; resolved with a synthesized `kind: application`) — and its `config_changes` (Deployment Changes) query is issued with the node's own identity (`service` / `pvc` use their own kind / name; the `application` group uses `{ kind: 'application', name: <app> }`). The **Containers section** MUST be shown **only for a pod or workload controller carrying `data.containers`**; `service` / `pvc` / `application` groups / `node` / `external` etc. have no containers, and the Containers section is never rendered for them. A service's or PVC's application name **also** appears as a promoted attr in the pinned card (see `graph-view`); the two complement each other — the pinned card shows the name, the Application section provides the config_changes link.

The panel body is gated purely by **whether each section's data is present**: the **Application section** by the presence of `data.application` (any node with an application, including `service` / `pvc`); the **Containers section** by **a workload kind plus a non-empty `data.containers`**. Both coexist with the (data-gated) Alerts section in the same **left-click** panel. The panel **has no permanent Properties section** (promoted attributes are carried by the pinned card — see "Node detail panel"), and the header **always renders** (the panel ALWAYS renders — see "Node detail panel").

**Data source.** The application name comes from the node's `data.application` (emitted by the backend on pod nodes; a controller's application is aggregated from its child pods during normalization); containers come from the node's `data.containers` (`Array<{ name, image }>`). Without `data.application` the Application section MUST NOT render; without `data.containers` (or with an empty array) the Containers section MUST NOT render; the two do not affect each other.

**Trigger.** A **left-click** on a pod / controller node MUST (a) select that node (reusing the single selection state, in sync with the selection highlight and the panel open state, with the panel opening accordingly), and (b) **build** the input needed by the node's two URL queries (application-detail and image-detail): application name, controller kind, controller name and time — the time being the moment of the left-click selection, in Unix seconds — and from that input **eager-prefetch both queries simultaneously**. `config_changes` (application) and `code_changes` (containers) MUST be issued at the moment the panel opens due to the left-click selection of a workload node, **without any further click** (that is, as long as the input is built and the corresponding endpoint is configured). **A right-click does not open the detail panel, does not build query input, and does not issue any query**. **A `service` / `pvc` belonging to an ArgoCD application** (carrying `data.application`) also builds query input when left-click selected — `kind` / `name` are taken from **the node itself** — and prefetches `config_changes` (driving its Application section); the shared prefetch also issues its `code_changes`, but a service / PVC has no containers, so the result is not used (the Containers section is not rendered). **A non-workload node without `data.application` (and therefore without a query target)** MUST NOT build query input and MUST NOT issue any query when left-click selected (its attributes are carried by the pinned card, and Alerts are shown when data is present).

**Query contract.** Both queries MUST share the same set of inputs, sent as query parameters: `application` (ArgoCD application name), `kind` (pod-controller kind), `name` (pod-controller name), `time` (Unix seconds). A pod node's controller kind / name come from its owner (`data.owner`); a controller node uses its own kind / name; a standalone pod with no owner sends its own kind (`pod`) and name. The responses are:

- The **application-detail query** (`GET <endpoints.configChanges>?application=…&kind=…&name=…&time=…`) returns `{ "url": string, "current_time": string, "previous_time": string }` — `url` is the external detail page of that ArgoCD application, and `current_time` / `previous_time` are the two timestamps of that deployment diff.
- The **image-detail query** (`GET <endpoints.codeChanges>?application=…&kind=…&name=…&time=…`) returns `{ [containerName]: { "url": string, "current_time": string, "previous_time": string, "result_type": string } }` — a map from container name to entry. The input MUST NOT carry an image parameter; a single call covers all of the node's containers.
- **Timestamp contract**: `current_time` / `previous_time` MUST be **RFC 3339 / ISO 8601 (UTC)** strings. Both are **best-effort**: when either is missing, not a string, or fails to parse, its time column MUST show a muted "n/a" (the uniform missing-value placeholder), and MUST NOT affect that row's `url` anchor, its other columns, or any other row.
- **Change type contract (`result_type`, `code_changes` only)**: each container entry MAY carry a `result_type` string, whose known enum values are **`UNCHANGED` / `UPDATED` / `REPLACED` / `ADDED` / `REMOVED` / `RENAMED`** (uppercase). `result_type` is **best-effort**: when missing, not a string, or an empty string, that row's Change Type column MUST show a muted "n/a"; an **unknown value** (outside the six) MUST be rendered as-is in a neutral gray fallback color (visible by default). `config_changes` (application) does **not** carry `result_type`, and the Application section MUST NOT have a Change Type column.

**Single-source missing-value placeholder.** Every "row exists, cell missing" placeholder in the panel (change time, Change Type, an alert's Pod / Service) MUST come from the same constant value "n/a", rendered in the muted style.

**Call caching.** While the panel is open, `code_changes` and `config_changes` MUST each be called **at most once** — the eager prefetch issues each once when the panel opens, and the entire map returned by `code_changes` is **shared** by all container rows. Only **successful** responses are cached; failures MUST NOT be cached. **Switching nodes or closing the panel (unmount / clearing the selection) MUST clear the cache** (and abort in-flight requests).

**Endpoint configuration and transport.** The URLs of both queries come from the runtime config: the Application section uses `endpoints.configChanges`, the Containers section uses `endpoints.codeChanges`; each URL is an absolute URL or a root-relative URL, and the app MUST use that URL as-is with the query parameters appended, and MUST NOT derive or concatenate other paths on its own. Queries are sent with the browser `fetch` directly to that URL. **When `endpoints.configChanges` is not configured, the Application section MUST be hidden and `config_changes` MUST NOT be issued; when `endpoints.codeChanges` is not configured, the Containers section MUST be hidden and `code_changes` MUST NOT be issued**; the two do not affect each other, and not configured is not treated as an error (no error message MUST be shown). Prefetch queries MUST be abortable, and MUST NOT update state after unmount.

**Presentation** (each link column target holds its own independent state, one of three: **loading / ready / unavailable**):

- **loading**: the queries are issued simultaneously at the moment the panel opens; until they return, each unresolved target's row MUST show a loading indicator plus hint text in its link column, and no anchor may appear there.
- **ready**: when `config_changes` / `code_changes` returns 200 with a valid `url`, the link column MUST render a real anchor `<a href={url} target="_blank" rel="noopener noreferrer">` (a pre-resolved URL — never use `window.open`).
- **unavailable**: on failure, no result, or no URL, the link column MUST show a "Not found" hint in secondary (muted) text (truncated when too long, with the full failure message placed in `title`).
- **Failure isolation**: an unavailable target MUST NOT affect the header, the other section, or any other row in the same section.
- **Time columns (Current / Previous)**: both sections have **Current Change Time** and **Previous Change Time** columns, formatting the raw RFC 3339 string into a localized absolute time in the browser's local time zone, with the full ISO string placed in `title`. When there is no value or the date is invalid the cell shows a muted "n/a", MUST NOT set `title`, and MUST NOT show "Invalid date".
- **Change Type column (Containers only)**: the Containers section's **Change Type** column presents `result_type` as colored text with a single-source color mapping — `ADDED`=green / `REMOVED`=red / `UPDATED`=blue / `REPLACED`=orange / `RENAMED`=purple / `UNCHANGED`=gray. Unknown values are rendered as-is in neutral gray; missing, non-string or empty string shows a muted "n/a". The color lookup is case-insensitive, and the display is always uppercase. The Application section MUST NOT have this column.
- **Alignment**: link column content MUST be flush with the column's right edge, so that the link columns of both sections align vertically and do not drift horizontally with content.
- **Table layout**: both sections MUST render as tables with column headers — the Application column order is **Name / Current Change Time / Previous Change Time / Deployment Changes**, and the Containers order is **Name / Image / Change Type / Current Change Time / Previous Change Time / Code Changes**. The link column is fixed at the far right and does not stretch, `Change Type` / `Current` / `Previous` do not stretch either, and Name / Image fill the remaining width.

#### Scenario: Left-clicking a pod / controller selects it and immediately prefetches both queries simultaneously

- **WHEN** the user **left-clicks** a pod (or controller) node carrying `data.application`, and both `endpoints.configChanges` and `endpoints.codeChanges` are configured
- **THEN** that node is selected (selection highlight in sync with the panel opening), and the system builds the input needed by the two queries (application name, controller kind, controller name, time)
- **AND** the system MUST issue the application-detail (`config_changes`) and image-detail (`code_changes`) queries **simultaneously**, **without any further click**

#### Scenario: Right-click neither opens the detail panel nor queries

- **WHEN** the user **right-clicks** a pod / controller node
- **THEN** the system MUST NOT open the detail panel, MUST NOT build query input, and MUST NOT issue any change history query

#### Scenario: A pod's controller kind / name come from its owner

- **WHEN** the left-clicked node is a pod whose `data.owner` is `{ kind: "deployment", name: "gateway" }`
- **THEN** the controller kind / name in that node's prefetch input are `deployment` / `gateway`

#### Scenario: A controller node queries with its own kind / name

- **WHEN** the left-clicked node is a controller (such as `statefulset` `mongo`)
- **THEN** the controller kind / name in that node's prefetch input are `statefulset` / `mongo`

#### Scenario: Both sections are shown only for pods and controllers

- **WHEN** the node the user **left-click** selects has `kind` `pod` or a controller kind, and carries the corresponding data (`data.application` / non-empty `data.containers`)
- **THEN** the panel renders the change history Application section and Containers section

#### Scenario: Containers is limited to workloads; a service / pvc with an application shows Application

- **WHEN** the selected node's `kind` is `service` / `pvc` and it carries `data.application`
- **THEN** the **Application section** renders and prefetches `config_changes` (with the node's own kind / name), and the **Containers section** MUST NOT render (a service or PVC has no containers, even if the data happens to carry `containers`)
- **WHEN** the selected node's `kind` is `node` / `external` / `switch` / `cluster` / `netapp-aggr` / `netapp-node`, or it is a `service` / `pvc` without `data.application`
- **THEN** neither the Application nor the Containers section may render

#### Scenario: Without an application only the Application section is hidden

- **WHEN** the **left-click** selected pod / controller node has no `data.application` but carries a non-empty `data.containers`
- **THEN** the Application section MUST NOT render, and the Containers section renders as usual and prefetches `code_changes`

#### Scenario: Without containers only the Containers section is hidden

- **WHEN** the **left-click** selected pod / controller node carries `data.application` but has no `data.containers` (or an empty array)
- **THEN** the Containers section MUST NOT render, and the Application section renders as usual and prefetches `config_changes`

#### Scenario: In-flight prefetch shows a loading indicator

- **WHEN** the panel is opened by left-click, the corresponding endpoints are configured, and the prefetch queries have not yet returned
- **THEN** the link column of every row in the Application and Containers sections shows a loading indicator plus hint text, with no anchor there

#### Scenario: Successful Application prefetch renders an anchor

- **WHEN** the application-detail (`config_changes`) query returns a valid URL `u`
- **THEN** the Application section's link column (header "Deployment Changes") renders `<a href="u" target="_blank" rel="noopener noreferrer">`, opening `u` in a new tab under an ordinary user gesture (never using `window.open`)

#### Scenario: Successful Container prefetch renders an anchor for every row with a URL

- **WHEN** the node's `data.containers` contains `{ name: "app", image: "repo/app:1.2" }`, and image-detail (`code_changes`) returns `{ "app": { "url": "https://x/app" } }`
- **THEN** the `app` row's link column (header "Code Changes") renders `<a href="https://x/app" target="_blank" rel="noopener noreferrer">`

#### Scenario: Application section renders as a table with headers

- **WHEN** the left-click opened panel renders the Application section (the node carries `data.application`)
- **THEN** that section presents the column headers **Name** / **Current Change Time** / **Previous Change Time** / **Deployment Changes** as a table, in that order

#### Scenario: Containers section renders as a table with headers and aligned columns

- **WHEN** the left-click opened panel renders the Containers section (the node carries two or more containers with names of differing length)
- **THEN** that section presents the column headers **Name** / **Image** / **Change Type** / **Current Change Time** / **Previous Change Time** / **Code Changes** as a table, in that order, with columns aligned (column boundaries do not drift with name length)

#### Scenario: Link column headers are named correctly

- **WHEN** the panel renders both the Application and Containers sections
- **THEN** the Application section's link column header is "Deployment Changes", and the Containers section's is "Code Changes" (neither may show "Change Report")

#### Scenario: With both timestamps Application shows localized absolute times

- **WHEN** the application-detail (`config_changes`) query returns `{ "url": "u", "current_time": "2026-06-16T10:30:00Z", "previous_time": "2026-06-10T08:00:00Z" }`
- **THEN** the Application row's Current / Previous columns show localized absolute times formatted in the browser's local time zone, each with the full ISO string as its `title`, and that row's link column still renders the anchor for `u`

#### Scenario: A code_changes container entry with both timestamps shows them on its row

- **WHEN** image-detail (`code_changes`) returns `{ "app": { "url": "https://x/app", "current_time": "2026-06-16T10:30:00Z", "previous_time": "2026-06-10T08:00:00Z" } }`, and the node's `data.containers` contains `{ name: "app", image: "repo/app:1.2" }`
- **THEN** the `app` row's Current / Previous columns show these two timestamps as localized absolute times, each with the full ISO string as its `title`, and that row's link column renders the anchor for `https://x/app`

#### Scenario: A code_changes entry with result_type shows a colored change type

- **WHEN** image-detail (`code_changes`) returns `{ "app": { "url": "https://x/app", "result_type": "UPDATED" } }`, and the node's `data.containers` contains `{ name: "app", image: "repo/app:1.2" }`
- **THEN** the `app` row's Change Type column shows `UPDATED` in that known enum value's semantic color (blue), and that row's link column still renders its anchor

#### Scenario: An unknown result_type is rendered as-is in neutral gray

- **WHEN** a container's `code_changes` entry carries a `result_type` outside the enum (such as `"MIGRATED"`)
- **THEN** that row's Change Type column shows `MIGRATED` as-is (it MUST NOT be silently discarded), rendered in the neutral gray fallback color

#### Scenario: A missing / non-string / empty result_type degrades Change Type to a muted n/a

- **WHEN** a container's `code_changes` entry returns a valid `url`, but its `result_type` is missing, not a string, or an empty string
- **THEN** that row's Change Type column shows a muted "n/a", and that row's url anchor, time columns, other columns and all other rows MUST NOT be affected

#### Scenario: Application section has no Change Type column

- **WHEN** the panel renders the Application section
- **THEN** the Application section's columns are, in order, Name / Current Change Time / Previous Change Time / Deployment Changes, and MUST NOT include a Change Type column

#### Scenario: A missing or non-RFC 3339 timestamp degrades its column to a muted n/a

- **WHEN** `config_changes` (or a container's `code_changes` entry) returns a valid `url`, but its `current_time` is missing, not a string, or not an RFC 3339 string (such as `"not-a-date"`), while `previous_time` is normal
- **THEN** that target's Current column shows a muted "n/a" with no `title`, its Previous column shows a localized absolute time as usual, and that row's url anchor, other columns and all other rows MUST NOT be affected ("Invalid date" MUST NOT appear)

#### Scenario: code_changes is called only once while open, and all containers share the result

- **WHEN** the panel is open, the `code_changes` prefetch has completed, and there are multiple container rows
- **THEN** the system issues **one** call to `code_changes`, and each container row takes its value from the map returned by that single call
- **AND** closing the panel or switching nodes MUST clear the cache, calling once more on the next open

#### Scenario: A failed query is not cached (refetched on remount)

- **WHEN** a `code_changes` (or `config_changes`) call fails, and the panel later remounts for the same node
- **THEN** the system issues that query again (the failure was not cached)

#### Scenario: Link columns align across sections and across states

- **WHEN** the panel shows both the Application and Containers sections, with some targets loading, some ready and some unavailable (mixed states)
- **THEN** the link column content of every row in both sections is flush with the column's right edge and vertically aligned

#### Scenario: A container key missing from the map shows "Not found"

- **WHEN** `code_changes` succeeds but some container name is not in the returned map (or that name has no valid URL)
- **THEN** that row's link column shows the "Not found" hint (no anchor), while its name and image still show as usual

#### Scenario: A failed query shows "Not found" and does not affect the rest

- **WHEN** the `config_changes` (or `code_changes`) query fails
- **THEN** the corresponding target's link column shows the "Not found" hint in secondary color (no anchor; truncated when too long, with the full failure message placed in `title`)
- **AND** the panel header and the other section / other rows still display normally

#### Scenario: Queries are sent to the endpoint URLs set in runtime config

- **WHEN** the runtime config's `endpoints.configChanges` is `https://ksg.example/v1/graph/config_changes` and `endpoints.codeChanges` is `/api/v1/graph/code_changes`, and the user left-click opens some workload node's panel
- **THEN** the prefetch queries are issued as `GET https://ksg.example/v1/graph/config_changes?application=…&kind=…&name=…&time=…` and `GET /api/v1/graph/code_changes?application=…&kind=…&name=…&time=…` (root-relative, same-origin) respectively, and the app neither derives nor rewrites either path on its own

#### Scenario: When an endpoint is not configured that section is hidden and does not query

- **WHEN** the runtime config does not set `endpoints.configChanges`, and the user left-click opens the panel of a workload node carrying `data.application` and `data.containers` (`endpoints.codeChanges` is configured)
- **THEN** the Application section MUST NOT render and `config_changes` MUST NOT be issued; the Containers section renders as usual and prefetches `code_changes`; no error message is shown
- **WHEN** the runtime config does not set `endpoints.codeChanges`
- **THEN** the Containers section MUST NOT render and `code_changes` MUST NOT be issued; the Application section operates as usual according to the `endpoints.configChanges` setting

#### Scenario: Left-click selecting a service / pvc with an application prefetches config_changes

- **WHEN** the user left-click selects a `service` or `pvc` carrying `data.application`, and `endpoints.configChanges` is configured
- **THEN** the system builds query input from **the node's own kind / name** plus the application and prefetches `config_changes` (driving the Application section's Deployment Changes link)
- **AND** the Containers section does not render (no containers; the `code_changes` result is not used)

#### Scenario: Selecting an application group prefetches its config_changes

- **WHEN** the user left-click selects an ArgoCD `application` group node (no kind, carrying `application`), and `endpoints.configChanges` is configured
- **THEN** the system builds the query input `{ application: <app>, kind: 'application', name: <app>, time }` and prefetches `config_changes`; the Application section renders that application's Deployment Changes link (the header badge shows the synthesized `application` kind)
- **AND** the Containers section does not render (an application group has no containers)

#### Scenario: Left-click selecting a non-workload node without an application triggers no query

- **WHEN** the user left-clicks a non-workload node **without `data.application`** (such as `node` / `external`, or a `service` / `pvc` without an application; that is, no query target)
- **THEN** the panel still renders (header-only, or with Alerts), the node attributes are carried by the pinned card, but the system MUST NOT build query input and MUST NOT issue application-detail / image-detail queries

#### Scenario: Switching nodes or closing the panel clears state and cache and aborts in-flight requests

- **WHEN** the panel is open with a prefetch in flight, and the user switches to another node or closes the panel (unmount / clearing the selection)
- **THEN** the system aborts the in-flight queries, clears the cache of both endpoints and the state of every target, and MUST NOT update state for the old node after the abort

### Requirement: Node applicability of the Dashboard button

The app SHALL request `/dashboard` and render the Dashboard button only for nodes **for which the node detail panel opens and which have a per-node dashboard** — namely **leaf nodes** (including the backend's physical storage leaf **`netapp-aggr`**, which carries `health` / `usage`), **k8s-node** (`kind: node`) containers, **`netapp-node`** containers (the only place in the backend contract where a real node serves as compound parent, carrying `health`), and **controller** containers (provided by the backend and carrying a real `kind`). The **cluster / storage-cluster / namespace / application** groups MUST NOT trigger any `/dashboard` query and MUST NOT render the Dashboard button (the `application` group does open the detail panel, but has no per-node dashboard). Applicability is gated by the parameter assembly returning "no parameters" for non-applicable nodes — non-applicable nodes issue no query — and MUST share the same exclusion set (`isCluster` / `isStorageCluster` / `isNamespace` / `isApplication`) as the detail panel open determination, rather than maintaining a parallel list that could drift.

`netapp-aggr` / `netapp-node` open the detail panel and prefetch `/dashboard` like every other applicable node, but their `kind` is **not in the workload kind set**, so a change history query target MUST NOT be assigned to them: their `health` / `usage` (and `netapp-aggr`'s `ontap_cluster` / `node` labels) are presented through the top-right **pinned card** (see `graph-view`), and the detail panel itself is header-only.

#### Scenario: leaf / k8s-node / controller are applicable nodes

- **WHEN** the node detail panel opens for a leaf node (including the `netapp-aggr` leaf), a k8s-node container, a `netapp-node` container, or a backend-provided controller container
- **THEN** the system issues one `/dashboard` query for that node (timing per "Dashboard URL prefetch and availability determination"), and renders the Dashboard button when available

#### Scenario: A NetApp leaf opens detail but has no change history query target

- **WHEN** the selected node is a `netapp-aggr` leaf or a `netapp-node` container (carrying `health` / `usage`)
- **THEN** the detail panel opens header-only, its `health` / `usage` are pinned in the top-right pinned card, and since its `kind` is not in the workload kind set, a change history query target MUST NOT be assigned to it — it still prefetches `/dashboard` like other applicable nodes, and renders the Dashboard button when available

#### Scenario: cluster / namespace / application are not applicable

- **WHEN** the selected node is a `cluster` / `storage-cluster` / `namespace` / `application` group
- **THEN** the system MUST NOT issue a `/dashboard` query and MUST NOT render the Dashboard button (`cluster` / `storage-cluster` / `namespace` do not open the detail panel in the first place; the `application` group opens the panel but has no per-node dashboard)

### Requirement: Dashboard URL prefetch and availability determination

When the node detail panel **opens** for an applicable node (left-click selection, or graph-search's locate), the app SHALL **eager-prefetch** one `GET <endpoints.dashboard>?<params>`, **at most once per opened node** (at-most-once per opened node; a same-value graph data refresh — including the auto-refresh triggered by `refreshIntervalSeconds` — MUST NOT re-issue it). The query is sent with the browser `fetch` directly to the runtime config's `endpoints.dashboard` (an absolute URL or root-relative URL, used as-is, with no path concatenated on the app's own). This prefetch is **independent** of the `config_changes` / `code_changes` (application-detail / image-detail) queries: the trigger condition for the Dashboard prefetch is **the panel opening**, and it is not predicated on the node carrying `application` or `containers`.

The "at most once" guarantee holds only within **a fixed view time range**: when the app provides a view time range, the param map includes `from_time` / `to_time` (see the "Dashboard request parameter assembly" requirement), and a change of the time range changes the parameters and thereby updates the request key → the app SHALL **re-prefetch** for the same opened node with the new time range (a time-windowed URL should follow the view time).

**Availability is predicated on `endpoints.dashboard` being configured.** When it is not configured, the app MUST stay idle: issue no query, render no button, and show no error or notice (not configured is not an error but a disabled feature).

An in-flight query MUST be aborted on node switch / panel close (unmount), and MUST NOT update state after the abort or unmount.

Availability MUST be determined strictly by **HTTP 200 + at least one non-empty link**: when parsing the returned body yields **one or more** `{ label, url }` (every `url` non-empty and parseable as an http(s) URL; relative URLs resolved against the app origin) → **available** (render the entry point); non-200, an empty parse result, a malformed response, or a network error → **unavailable** (the button is **not rendered**, and no error message MUST be shown to the user). The availability semantics are consistent with `config_changes` / `code_changes`.

Response formats:

- **New format**: `{ "urls": [{ "label"?: string, "url": string }, …] }` — invalid entries (`url` missing, empty, or not http(s)) are skipped; when `label` is absent the app fills in a fallback label (the last path segment of the URL, or "Dashboard" when none can be obtained; duplicate labels are distinguished with a sequence number).
- **Legacy format (backward compatible)**: `{ "url": string }` — treated as the single link `[{ label: "Dashboard", url }]`.
- When `urls` is a non-empty array, `urls` MUST take **precedence**; fall back to `url` only when `urls` is missing or empty after filtering.

#### Scenario: Prefetch on panel open (both left-click and locate)

- **WHEN** the user opens some applicable node's detail panel by left-click or by graph-search's locate, and `endpoints.dashboard` is configured
- **THEN** the system issues one `GET <endpoints.dashboard>?<params>`, with the parameters being the param map assembled for that node (see the "Dashboard request parameter assembly" requirement)

#### Scenario: 200 + urls array is treated as available

- **WHEN** `/dashboard` returns HTTP 200 with the body `{ "urls": [{ "label": "Metrics", "url": "https://a" }, { "label": "Logs", "url": "https://b" }] }`
- **THEN** that query's state is available, two links are parsed, and the Dashboard entry point renders

#### Scenario: 200 + non-empty url (legacy format) is treated as available

- **WHEN** `/dashboard` returns HTTP 200 with the body `{ "url": "https://…" }` (`url` non-empty)
- **THEN** that query's state is available, the links are the single-element array `[{ label: "Dashboard", url }]`, and the Dashboard button renders

#### Scenario: Non-200 / empty urls / empty url / malformed is treated as unavailable without an error

- **WHEN** `/dashboard` returns non-200, or returns `{ "urls": [] }`, or returns `{ "url": "" }`, or the response is not an object / has no `url` field, or the network fails
- **THEN** that query's state is unavailable, the Dashboard button MUST NOT render, and no error message or lingering loading indicator MUST be shown

#### Scenario: No query is issued when endpoints.dashboard is not configured

- **WHEN** the runtime config does not set `endpoints.dashboard`, and the user opens some applicable node's detail panel
- **THEN** the system MUST NOT issue a `/dashboard` query, the Dashboard button does not render, and no error or notice is shown

#### Scenario: Switching nodes aborts the previous query and re-prefetches

- **WHEN** with the panel open for some node (`/dashboard` query in flight), the user opens another applicable node instead
- **THEN** the previous in-flight query is aborted (no state update), and the system issues a new single `/dashboard` query for the new node

#### Scenario: Re-prefetch when the view time range changes

- **WHEN** the app provides a view time range, and after the panel opens for some applicable node the user changes the view time range
- **THEN** the changed `from_time` / `to_time` parameters update the request key, and the system **re-prefetches** `/dashboard` once for the same node with the new time range (a pure data refresh with the same node, the same remaining attributes and the same time range MUST NOT re-issue it)

### Requirement: Dashboard request parameter assembly

The query parameters of the `/dashboard` query MUST be assembled by a pure function (unit-testable) from the opened node's `data` attributes (and the app's view time range, if any), with parameter value type `string | string[]` (`string[]` serializes as repeated query parameters, such as `ipaddress`), by the following rules:

- **Exclusion set**: `labels` and all app-internal rendering-only / structural fields MUST NOT be sent — accent colors (`clusterColor` / `namespaceColor` / `applicationColor` / `storageClusterColor`), `parent`, `worstStatus`, the `is*` compound flags (`isCluster` / `isStorageCluster` / `isController` / `isNamespace` / `isApplication`), the storage fact fields presented by the pinned card (`storageclass`, `health`, `usage` and the derived `usageRatio`; they are node information, not query parameters), the volatile `status` (which would needlessly change the request key on refresh), and the structural `id` (a controller's `id` is a backend path value, such as `<c>/namespace/<ns>/application/<app>/controller/<Kind>/<name>`, a structural identifier rather than a queryable attribute; node identity is expressed by kind + name).
- **Scalars only (`ipaddress` excepted)**: non-scalar values (arrays / objects, such as `alerts` / `containers` / `owner`) MUST NOT be sent as query parameters. **Exception**: `ipAddress` (`string[]`, on pod nodes) SHALL be sent as repeated `ipaddress=` parameters; when the array is empty it MUST be omitted.
- **Field name mapping**: the node display name is stored in `data.label` (mapped from the upstream `name` during normalization; `name` is not retained), and assembly MUST send that value under the parameter name `name`; `kind` is sent as-is.
- **Leaf nodes**: send their scalar attributes (after the exclusions above).
- **Compound nodes (k8s-node / netapp-node / controller only)**: send the container's **own** scalar attributes, **plus** the attributes whose **values are identical** across **all of its direct children** (`data.parent === container id`); attributes whose values **differ** between children MUST be **skipped**; on **conflict with own attributes the own value wins** (own-wins); child attributes are likewise subject to the exclusion set and scalar-only rule above; when the container has no direct children only its own attributes are sent.
- **`cluster` parameter**: although `cluster` is **not** a first-class data field on applicable nodes (and `labels` is in the exclusion set), the app SHALL still resolve and send `cluster`: the **authoritative source** is the `data.cluster` of the node's **nearest `isCluster` ancestor** (walking up `data.parent`, through intermediate compounds such as namespace groups) — this is the only source that covers **controllers** (a controller has neither `data.cluster` nor `labels`). When no `isCluster` ancestor is found it MUST **fall back** to the node's own `labels.cluster`; when neither exists it MUST **omit** `cluster` (such as a top-level external node belonging to no cluster). Ancestor resolution MUST take **precedence** over the labels fallback (the ancestor is authoritative), and MUST **not overwrite** a `cluster` the node already carries (own-wins).
- **`controller` parameter** (symmetric with `cluster`): the app SHALL resolve and send `controller`: the **authoritative source** is the name (`data.label`) of the node's **nearest `isController` ancestor** (walking up `data.parent`) — in controller mode a pod's direct parent is its controller container. When no `isController` ancestor is found (such as node mode, where pods are nested under node containers with no controller node) it MUST **fall back** to the pod's own `data.owner.name` (the same source change history uses to resolve a pod's controller); when neither exists it MUST **omit** `controller` (a controller container itself has no parent controller; a bare service / pvc / external has no owner). Ancestor resolution MUST take **precedence** over the owner fallback, and MUST **not overwrite** a `controller` the node already carries (own-wins). `controller` is orthogonal to the existing `application` (ArgoCD application name); the two can coexist.
- **`from_time` / `to_time` parameters**: when the app provides a view time range, the app SHALL send `from_time` = the range start in **Unix seconds** and `to_time` = the range end in **Unix seconds** (the same Unix seconds as the backend graph query's `start` / `end`; the backend also accepts RFC 3339, seconds are used here). The time bounds are injected by the assembly pure function from the time range parameter, added only on the applicable (non-"no parameters") branch, and share the same param map / request key as the remaining parameters. When the app provides no view time range, `from_time` / `to_time` MUST be omitted.

#### Scenario: Leaf parameters exclude labels and rendering fields; label is sent as name

- **WHEN** parameters are assembled for a pod leaf carrying `kind` / `label` / `namespace` / `labels` / `parent`
- **THEN** `kind` and `name` (with the value of `data.label`) and `namespace` are sent; `labels`, `parent`, or any `is*` / `*Color` / `worstStatus` / `status` / `id` field MUST NOT be sent

#### Scenario: Storage fact fields storageclass / health / usage are not sent

- **WHEN** parameters are assembled for a pvc leaf carrying `kind: 'pvc'` / `label` / `storageclass`, or a `netapp-aggr` leaf carrying `kind: 'netapp-aggr'` / `label` / `health` / `usage`
- **THEN** `kind` and `name` (with the value of `data.label`) are sent; `storageclass`, `health`, `usage`, `usageRatio` (the storage fact fields used by the pinned card) MUST NOT be sent, and any `is*` / `*Color` / `parent` / `id` field MUST NOT be sent either

#### Scenario: Compound merges consistent child attributes and skips differing ones

- **WHEN** parameters are assembled for a controller container where some attribute (such as `namespace`) has the same value across all its child pods, and another attribute (such as `name`) differs
- **THEN** the consistent attribute is merged into the parameters (if the container does not carry that field itself), the differing attribute is skipped; fields the container carries itself take their own value (own-wins)

#### Scenario: Non-scalars and the synthesized id are not sent (`ipAddress` excepted)

- **WHEN** the assembled node carries non-scalar fields such as `alerts` / `containers` / `owner`, and (if a controller) a synthesized `id`
- **THEN** these fields MUST NOT appear in the `/dashboard` query parameters (`ipAddress` is the exception, see the "ipaddress" scenario below)

#### Scenario: ipAddress is sent as repeated ipaddress parameters

- **WHEN** parameters are assembled for a pod leaf carrying `ipAddress: ['10.0.0.1', '10.0.0.2']`
- **THEN** `/dashboard` carries the repeated `ipaddress=10.0.0.1&ipaddress=10.0.0.2`
- **WHEN** the pod's `ipAddress` is missing or an empty array
- **THEN** the `ipaddress` parameter MUST be omitted

#### Scenario: controller resolves from the nearest isController ancestor

- **WHEN** some pod leaf is nested under some `isController` container in controller mode
- **THEN** the `/dashboard` parameters include `controller`, with the value being the name (`data.label`) of that nearest `isController` ancestor

#### Scenario: controller falls back to owner.name, omitted when neither exists

- **WHEN** some pod has no `isController` ancestor (such as node mode) but carries `data.owner.name` itself
- **THEN** `controller` is taken from `data.owner.name`
- **WHEN** the node has neither an `isController` ancestor nor `data.owner` (such as a controller container itself, or a bare service / pvc / external)
- **THEN** the `controller` parameter MUST be omitted

#### Scenario: from_time / to_time carry the view time range in Unix seconds

- **WHEN** the app provides a view time range, parameters are assembled for an applicable node, and the range's start / end correspond to Unix seconds `1700000000` / `1700003600`
- **THEN** the `/dashboard` parameters include `from_time=1700000000` and `to_time=1700003600`
- **WHEN** the app provides no view time range
- **THEN** the `from_time` / `to_time` parameters MUST be omitted

#### Scenario: cluster resolves from the nearest isCluster ancestor (including a controller walking up through a namespace group)

- **WHEN** some applicable node (leaf / controller / k8s-node) is nested under some `isCluster` container (possibly through intermediate compounds such as namespace groups)
- **THEN** the `/dashboard` parameters include `cluster`, with the value being the `data.cluster` of that nearest `isCluster` ancestor

#### Scenario: cluster falls back to labels.cluster, omitted when neither exists

- **WHEN** the node has no `isCluster` ancestor but carries `labels.cluster` itself
- **THEN** `cluster` is taken from `labels.cluster`
- **WHEN** the node has neither an `isCluster` ancestor nor `labels.cluster` (such as a top-level external)
- **THEN** the `cluster` parameter MUST be omitted

### Requirement: Dashboard button presentation

When some node's `/dashboard` query is **available**, the app SHALL render the Dashboard entry point in the node detail panel **header beside the node name**; the header renders under every content combination of the panel (header-only, with Application / Containers / Alerts), so a single placement suffices. When the query is **loading** or **unavailable** no button MUST be rendered (no loading indicator, no error, no placeholder), to avoid flicker. The entry point's form is decided by the number of links:

- **Single link** (`urls.length === 1`): MUST render one link button labeled **Dashboard**, opening that `url` in a new tab (`target="_blank"`, `rel="noopener noreferrer"`).
- **Multiple links** (`urls.length >= 2`): MUST render one **Dashboards** trigger button with a dropdown menu, each item showing the corresponding `label`, and clicking opens that `url` in a new tab (`noopener,noreferrer`).

The button MUST be presented with the app's own dark / light theme tokens, and follow theme switches.

#### Scenario: A single link keeps the Dashboard button

- **WHEN** some applicable node's `/dashboard` resolves to one link, and the panel is open
- **THEN** the header renders a link button labeled **Dashboard** beside the node name, and clicking opens that `url` in a new tab (`noopener,noreferrer`)

#### Scenario: Multiple links show the Dashboards menu

- **WHEN** some applicable node's `/dashboard` resolves to two or more links
- **THEN** the header shows the **Dashboards** trigger button; once expanded, each `label` is clickable and opens the corresponding `url` in a new tab

#### Scenario: No button is rendered while loading / unavailable

- **WHEN** the `/dashboard` query is in flight (loading), or is unavailable
- **THEN** the header MUST NOT render the Dashboard button, and shows no loading indicator or error message
