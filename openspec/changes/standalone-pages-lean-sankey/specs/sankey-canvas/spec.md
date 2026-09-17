## ADDED Requirements

### Requirement: Ribbon end chevron

`sankey-canvas` SHALL provide the **direction chevron** every amount ribbon ends in, and both Sankey views MUST draw theirs through it: one geometry function that, given a ribbon's target end (`x2`, `y2`), its thickness and the direction it enters its target (`+1` rightward, `−1` leftward), returns the path of an open chevron just inside the target end pointing the way the flow goes, its half-size `max(3, min(7, thickness / 2 − 1))`; and one drawing primitive that strokes that path in the primary foreground token (`fill: none`, round joins and caps, `pointer-events: none`), at full opacity when the ribbon is on the lit path (or nothing is lit) and faded with the ribbon otherwise. The chevron is part of the ribbon: it is never drawn without one, a ribbon carrying no amount (an ownership line) has none, and a zero-amount dashed ribbon keeps its chevron. A theme switch recolours it through the token with no hardcoded colour.

#### Scenario: Both views share one chevron

- **WHEN** the repository is searched for the chevron path geometry and its drawing primitive
- **THEN** each is defined once, in `sankey-canvas`; the storage chart (`layoutSankey` for the path, `SankeyChart` for the primitive) and the network chart (`layout/paths` for the path, `chart/TraceBand` for the primitive) import them and define no chevron of their own; the network chart's chevron markup is unchanged by the move

#### Scenario: The chevron follows the hover fade

- **WHEN** the user hovers a card so that some ribbons are lit and the rest faded
- **THEN** the chevron of every lit ribbon is at full stroke opacity, the chevron of every faded ribbon is faded like its ribbon, and leaving restores all of them
