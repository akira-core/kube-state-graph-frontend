## ADDED Requirements

### Requirement: Card search

The Network trace Sankey SHALL show the card search of `sankey-canvas` "Card search overlay". The searchable records are exactly the placed cards — hop boxes, leaf, pod, application, namespace and owner cards, the anchor card — and every k8s node frame under the `Node` layout; a hop hidden by `Min Δ` MUST NOT be a hit.

- A card's fields are its `label`, its role (a leaf's wire type such as `host` in place of the role `leaf`), `namespace`, NetApp cluster, tier, k8s node and owner, and for a leaf each client's `ip`, `hostname` and `owner` as separate values, so a hit on an address names that address on its result line. A frame's fields are its `label` and the kind `node`.
- A hit's lit path is its "Hover highlights the path" set; a frame hit lights the union of its member pods' paths.

#### Scenario: A pod lights its path to the start

- **WHEN** the user types `kafka-2` on the showcase trace
- **THEN** `kafka-2`, `node-w-11`, `ToR k8s (k8s)` and `Core 1` are lit and the `網管部 王小明` owner card is faded

#### Scenario: A client address finds its leaf

- **WHEN** the user types `10.42.7.31`
- **THEN** one result is listed with the line `ip: 10.42.7.31`, and the leaf's path including its owner card `網管部 王小明` is lit
