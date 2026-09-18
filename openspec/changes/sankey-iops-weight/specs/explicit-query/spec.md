## MODIFIED Requirements

### Requirement: Draft and applied selection

Each page SHALL hold two selections: a **draft**, which is what the controls show and edit, and an **applied** selection, which is what the last committed request was built from. The draft inputs are, on the Graph page, the four identity dimensions and the projection; on the Sankey page, `az` / `env`, the `cluster` / `namespace` narrowing and the roots; and on both pages the nav bar's **view time range**. Editing any draft input MUST change only the draft: it MUST NOT issue a request, MUST NOT write the route's query string, and MUST NOT alter the drawn data.

Inputs that change no request are **not** draft inputs and keep applying immediately: the Sankey's mode, weight, layout and Top pods control, and every client-side display control of the Graph view (kind toggles, ingress, search, pod-parent mode, collapse).

While the draft differs from the applied selection the page MUST indicate it — on the Query control and in words near it — so an operator can tell that the drawing answers the previous controls, not the current ones. Under `demoMode` there is no applied selection to compare against, and the indication MUST NOT appear.

#### Scenario: Editing a filter costs nothing

- **WHEN** on `/graph` the operator selects namespace `shop`, then `infra`, then switches the projection to `Full inventory`
- **THEN** the request count to `endpoints.graph` is unchanged, the address bar is unchanged, the existing graph is still drawn, and the Query control indicates a pending draft

#### Scenario: A display control still applies immediately

- **WHEN** on `/sankey` after a committed query the operator switches the mode from Both to Write, the weight from Throughput to IOPS, and sets Top pods to `5`
- **THEN** the chart redraws with no request issued, and the Query control does not indicate a pending draft
