## ADDED Requirements

### Requirement: Card search overlay

`sankey-canvas` SHALL provide the card search every Sankey view shows: a `useSankeySearch` hook and a `SankeySearchOverlay` that renders the Graph view's `SearchBar` (result list, keyboard navigation, 300 ms debounced fit, two-stage `Esc`) at the chart's top-right, inside the chart host, while a chart is drawn. The hook MUST take only search records, a content-space rect per record id, a path callback and the zoom API — never elements or a feature model.

- **Hit rule.** A record is a hit by exactly the Graph search hit rule (`graph-search` "Hit matching rules": whitespace tokens, case-insensitive substring, AND across tokens, any field per token), and results are ordered by label.
- **Highlight.** While the query is non-empty, the view MUST keep lit the union of every hit's hover path — the same set hovering each hit alone would light — and fade everything else through the shared `lit` mechanism. A non-empty query with no hits MUST fade every card and ribbon. Clearing the query reverts everything.
- **Hover precedence.** Hovering a card while a query is typed MUST light that card's path alone; leaving it MUST return to the search highlight.
- **Locate.** Choosing a result (click, or `Enter` on the highlighted row) MUST frame that card — centred, never enlarged past 1:1 — and clear the query; it MUST NOT navigate or run the cross-view Locate that clicking the card does. When typing pauses, or on `Enter` with no row highlighted, the viewport MUST fit the union of every hit's card (never past 1:1); a query with no hits never moves the viewport. Viewport moves are not animated.
- **Input isolation.** Typing in the box MUST NOT trigger the chart shortcuts; a wheel over the box or its result list MUST NOT zoom the chart, and pressing or dragging in the box MUST NOT pan it.
- **Lifetime.** The query is page-transient: not written to the URL, not persisted, empty after remount, and kept across a refresh, a layout / mode / order / threshold switch and focus mode; hits the new drawing has no card for drop out.

#### Scenario: Hits light their whole paths

- **WHEN** the user types a query matching two cards on different paths
- **THEN** both cards' paths are lit, every card and ribbon on neither path is faded, and no layout recomputation occurs

#### Scenario: Hover takes over and hands back

- **WHEN** a query is typed and the user hovers a card that is not a hit, then leaves it
- **THEN** while hovered only that card's path is lit; after leaving the hits' paths are lit again

#### Scenario: Locate frames the card without leaving the view

- **WHEN** the user clicks a result row
- **THEN** the viewport centres that card at no more than 100 %, the search box is empty, every card is un-faded, and the address bar is unchanged

#### Scenario: The box keeps its own wheel and keys

- **WHEN** the search box has focus and the user presses `F` and `+`, and scrolls over the result list
- **THEN** focus mode is not entered, the zoom readout is unchanged, and the list scrolls
