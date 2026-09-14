## ADDED Requirements

### Requirement: Card search

The Storage flow Sankey SHALL show the card search of `sankey-canvas` "Card search overlay". The searchable records are exactly the cards the current drawing holds: every card in the layout (including derived `application` / `namespace` cards) and every wrapper it draws — a Kubernetes node wrapper under the `Node` layout, an SVM frame under the `Group` SVM display. A pod removed by the Top pods cut, or a wrapper the current layout does not draw, MUST NOT be a hit.

- A card's fields are its `label`, `kind`, `namespace` and NetApp cluster (`ontap_cluster`); a wrapper's are its `label` and `kind` (`node` / `netapp-svm`), plus the NetApp cluster for an SVM frame. A PVC's `labels.svm` text is not a search field. A result's context line shows the namespace and NetApp cluster when present.
- A hit's lit path is its "Hover highlights the path" set, claim-aware as described there; a wrapper hit lights the union of its member pods' paths and an SVM frame hit the union of its member PVCs' paths.
- Matching and lighting MUST stay within one interaction: on the "Performance bounds" synthetic body with Top pods at `1000`, a query hitting every pod MUST match and compute the lit set within **100 ms**.

#### Scenario: Searching an aggregate lights its claims only

- **WHEN** in Both mode the user types `aggr1`
- **THEN** `ontap-prod-01`, `aggr1`, `data-mongo-0`, `mongo-0`, `mongodb` and `prod` are lit, and `aggr2` and `mongo-1` are faded

#### Scenario: A node wrapper is a hit under the Node layout

- **WHEN** the layout is `Node` and the user types `worker-0`
- **THEN** `mongo-0` and `orphan-0` are lit and `mongo-1` is faded

#### Scenario: A refresh keeps the query

- **WHEN** `aggr` is typed and a refresh drops `aggr1`
- **THEN** the search box still reads `aggr`, and `aggr2` with its claim path is lit
