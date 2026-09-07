## Purpose

Defines the Ingress Gateway visibility toggle of the Graph view: identify the ingress node set precisely by `labels.role` = `ingress-gateway` (including nested descendants and the `service-selects-pod` inference layer, never including `ingress-lb`), provide an eye / eye-slash toggle on the legend that hides the whole set through ephemeral view state, and mark the traffic edges passing through the gateway as `ingressPath` and draw them dashed; the demo fixture keeps both the chain and the fallback group as visible proof.

## ADDED Requirements

### Requirement: Ingress gateway node set identification

The Graph view SHALL identify ingress gateway nodes by `role: "ingress-gateway"` in the node's `data.labels` (the label key and value are single-source constants), **regardless of kind**. The derivation of the set MUST be a single pure function, and **all** of its consumers (the hiding by the visibility filter, the dashed marking by normalization) MUST take the **same** derivation result — if the two each derived a different set, contradictions the user can see on screen would appear, such as "the toggle hides it, but it is never drawn dashed".

The comparison MUST be **exact equality against the single value** `ingress-gateway`, and MUST NOT be a prefix match, a case-insensitive match, or any "looks like ingress" judgement. The backend marks **two** ingress shapes with **the same `role` key**, and the two are not symmetric:

|                     | `ingress-gateway`                                                  | `ingress-lb`                          |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| What it is          | The entry hop of a routed chain (Istio)                            | The non-Istio LB fallback destination |
| Behind it           | gateway pods, then one more synthesized hop to the backend service | Nothing — there is no routed backend  |
| The caller also has | A **direct** edge to the backend service                           | No other edge                         |

Therefore `ingress-lb` nodes MUST NOT enter this set (this decision and its rationale MUST be recorded in the same place as the label constant). Hiding an `ingress-gateway` node removes a **detour**, and the direct edge preserves the dependency; hiding an `ingress-lb` node removes the caller's **only** dependency edge — that pod would be drawn as having no dependencies at all. The dashed marking has the same asymmetry: a dashed line asserts "this traffic bypasses a direct path", which is true for the chain and false for the fallback.

A service carrying `ingress-lb` also MUST NOT act as an expansion origin of the layer 3 (SELECTED) derivation — the ingress controller pods its `service-selects-pod` points to likewise do not enter the set.

The derivation is three layers, in order:

1. **LABELLED (declared)** — any node carrying `role: "ingress-gateway"` (regardless of kind). This layer is **authoritative**: an operator putting the label on is a declaration, and it MUST NOT be excluded by any other condition.
2. **NESTED** — **all descendants** (recursive) of each labelled node along `data.parent`. Because the label is not limited by kind, it may land on a compound (a controller / application / K8s node group); the gateway that group names semantically covers everything inside it.
3. **SELECTED (inferred)** — the target pods that layer 1 and 2 nodes point to along `service-selects-pod` edges (source ∈ the first two layers), even when the pod itself **does not** carry the label. **Single-layer derivation, MUST NOT take the transitive closure**: pods added by this layer MUST NOT act as expansion origins again.

Layer 3 is **inference** rather than declaration, so it MUST yield to the "shared selection" exemption: **if some target pod is at the same time selected via `service-selects-pod` by a service not in the first two layers (common in topologies where one pod is selected by several Services), that pod MUST be excluded from the set** — it still serves other non-ingress traffic, and MUST NOT be hidden or drawn dashed along with the rest just because an ingress service also selects it. This exemption MUST NOT apply to layers 1 and 2: a pod that **itself carries the label** (or is nested inside a labelled group) MUST remain in the set even when some unrelated service also selects it.

#### Scenario: A labelled service and the unlabelled pod it selects both enter the set

- **WHEN** `igwSvc` carries `labels.role = "ingress-gateway"`, and the edge `igwSvc →(service-selects-pod) igwPod` exists, with `igwPod` lacking that label
- **THEN** both `igwSvc` and `igwPod` belong to the ingress set

#### Scenario: A labelled non-service node enters the set on its own

- **WHEN** some pod carries `labels.role = "ingress-gateway"` and has no `service-selects-pod` outgoing edge
- **THEN** that pod belongs to the ingress set (itself only)

#### Scenario: An unlabelled service is unaffected

- **WHEN** `otherSvc` does not carry that label, and `otherSvc →(service-selects-pod) somePod` exists
- **THEN** neither `otherSvc` nor `somePod` belongs to the ingress set

#### Scenario: `ingress-lb` nodes never enter the set

- **WHEN** `nginxSvc` carries `labels.role = "ingress-lb"`, and the `caller` pod has only one edge `caller →(pod-calls-service) nginxSvc`
- **THEN** `nginxSvc` does not belong to the ingress set; it stays visible when `showIngress` is `false`, that edge stays solid, and `caller`'s only dependency is not erased

#### Scenario: `ingress-lb` does not act as an expansion origin of the inference layer

- **WHEN** `nginxSvc` carries `labels.role = "ingress-lb"`, and `nginxSvc →(service-selects-pod) nginxPod` exists
- **THEN** neither `nginxSvc` nor `nginxPod` belongs to the ingress set

#### Scenario: The two shapes coexisting are not confused with each other

- **WHEN** the same graph contains both `igwSvc` carrying `ingress-gateway` (selecting `igwPod`) and `nginxSvc` carrying `ingress-lb` (selecting `nginxPod`)
- **THEN** the set is exactly `{igwSvc, igwPod}`

#### Scenario: An unknown role value does not enter the set

- **WHEN** some service carries `labels.role = "ingress-gateway-canary"`
- **THEN** that node does not belong to the ingress set — the comparison is exact equality against a single value, and a third role added in the future MUST be added explicitly to take effect

#### Scenario: A pod shared-selected by an unlabelled service is excluded from the set (inference layer yields)

- **WHEN** `igwSvc` carries the label and `igwSvc →(service-selects-pod) sharedPod` exists, while `appSvc` does not carry the label but `appSvc →(service-selects-pod) sharedPod` also exists
- **THEN** `sharedPod` MUST NOT belong to the ingress set (`appSvc` still has effective traffic to it); `igwSvc` still belongs to the set

#### Scenario: A pod carrying the label itself is unaffected by the shared-selection exemption (declared layer is authoritative)

- **WHEN** `labelledPod` **itself** carries `labels.role = "ingress-gateway"`, and `appSvc →(service-selects-pod) labelledPod` exists (`appSvc` does not carry the label)
- **THEN** `labelledPod` MUST belong to the ingress set — the exemption acts only on the inference layer, and an explicitly labelled node does not drop out because others select it

#### Scenario: The whole subtree of a labelled compound enters the set

- **WHEN** a `controller` group carries that label, with `igwPod` nested under it, and `sidecar` nested under `igwPod`
- **THEN** that controller, `igwPod` and `sidecar` all belong to the ingress set (recursive along `parent`, a different axis from the single-layer rule of `service-selects-pod`)

#### Scenario: A service nested inside a labelled compound can act as an expansion origin

- **WHEN** `nestedSvc` is nested inside a labelled group, and `nestedSvc →(service-selects-pod) backendPod` exists
- **THEN** `backendPod` belongs to the ingress set — a service inside the group is treated the same as a directly labelled service

### Requirement: showIngress visibility semantics

The visibility computation (the single pure function where kind / edge-type filtering and the orphan cascade live) SHALL accept an **optional** `showIngress` input (default `true`). When `showIngress === false`, nodes in the ingress set MUST NOT enter the visible node set; the hiding of connected edges and the removal of emptied compounds MUST be left to the existing edge pass and orphan cascade (no new cascade logic). When `showIngress === true` or omitted, the behaviour MUST be exactly identical to before this input was added.

The visibility computation SHALL also accept an **optional** precomputed ingress set; when omitted it derives one itself from the elements passed in. This input is needed for **correctness**, not merely for performance: the Graph view MUST derive that set from the base elements **before the view transform** and pass it in. The reason is that the label may land on a `controller` / `application` group, and the pod-parent topology transform in `node` mode **strips** exactly those groups — if the set were instead derived from the already-transformed elements, it would become empty at the moment the user switches pod-parent mode: the already-hidden path silently reappears and the legend's toggle disappears with it (see "Legend Ingress toggle and showIngress view state" below), while the `showIngress` view state is still `false`, so the user can neither see it nor restore it. Node ids do not change under the view transform, so a set derived from the base elements remains valid for lookups against the transformed elements.

Because label identification is **not limited by kind**, a labelled node may itself be a compound. **All of its descendants** (recursive along `data.parent`) MUST be removed from the visible node set together — not just the compound itself. This is distinct from the orphan cascade: the orphan cascade hides descendants only when they "lose their connections", whereas here descendants, even when they still have other visible connections, MUST be excluded together because an ancestor is hidden by ingress (cytoscape.js rendering already decides final visibility by the AND of the ancestor chain, and the data-layer visible node set MUST agree with it, otherwise the node detail panel / pinned card / orphan determination would misjudge a node already gone from the screen as "visible").

This descendant expansion MUST be **done again inside the visibility computation against the current view's elements**, rather than relying only on the expansion result already in the set passed in: the nesting relationships of the two **differ** — the set passed in comes from the backend hierarchy (a pod hangs under its controller), while the elements are the current view (in `node` mode the pod has been re-parented to its K8s node). Only by expanding again against the current view does "a labelled container hides what it contains on screen" hold.

#### Scenario: When off, the path through ingress disappears completely and the direct path is kept intact

- **WHEN** the elements contain the path `p →(pod-calls-service) igwSvc →(service-selects-pod) igwPod →(pod-calls-service) bsvc →(service-selects-pod) bpod` and the direct `p →(pod-calls-service) bsvc`, `igwSvc` carries the ingress label, and visibility is computed with all kinds and all edge types visible and `showIngress` `false`
- **THEN** the visible node set is exactly `{p, bsvc, bpod}`, and the visible edge set is exactly the two direct edges (`p → bsvc`, `bsvc → bpod`)

#### Scenario: Zero behaviour change when the parameter is omitted

- **WHEN** with the same elements as above, visibility is computed with all kinds and all edge types visible, omitting the `showIngress` input
- **THEN** all nodes and edges are visible, consistent with existing behaviour

#### Scenario: An emptied compound disappears with the orphan cascade

- **WHEN** some `cluster > node` compound contains only one ingress pod, and `showIngress === false`
- **THEN** that pod, its K8s node container and the cluster container are all absent from the visible node set

#### Scenario: The descendants of a labelled compound are hidden together

- **WHEN** a K8s `node` compound carries `labels.role = "ingress-gateway"`, with an unlabelled pod nested under it (that pod is also not the target of any `service-selects-pod` expansion), and `showIngress === false`
- **THEN** that `node` compound and its nested pod are both absent from the visible node set — even though the pod itself carries no label and was not reached by `service-selects-pod` expansion

#### Scenario: Switching pod-parent mode does not disturb an already-hidden ingress path

- **WHEN** the label lands on a `controller` group, `showIngress === false`, and the user switches from `controller` mode to `node` mode (the pod-parent topology transform strips that controller group and re-parents its pods to K8s nodes)
- **THEN** the pods originally in that group MUST still be absent from the visible node set, and the legend's Ingress toggle MUST still render — the set is taken from the base elements and does not evaporate with the view transform

### Requirement: Ingress traffic path dashed lines

Normalization (wire → internal model) SHALL set `data.ingressPath = true` on an edge if and only if **both conditions hold at once**: (a) either endpoint of that edge belongs to the ingress node set (**the same derivation as used by the `showIngress` hiding, including its nested descendant layer** — hence the traffic edges of a pod inside a labelled compound MUST likewise be drawn dashed; if the two sets disagreed, the visible contradiction "the toggle hides it, yet it is never drawn dashed" would appear), and (b) that edge's type is a "traffic" type (decided by a single-source edge type → is-traffic lookup table: `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` are `true`, all others `false`). A backend edge type not recorded in that table MUST be treated as non-traffic (not marked) — a dashed line is the assertion "this traffic detours through the gateway", which cannot be asserted for an unknown type; the filter's unknown-visible convention is deliberately not applied here, because not drawing a dash makes no element disappear. An edge that does not meet the conditions MUST **not carry** the `ingressPath` key (not `false`).

The traffic-type lookup MUST be decided by **own property** (e.g. `Object.hasOwn`), and MUST NOT index directly and then fall back with `?? false`. `data.type` is a backend string copied as-is by normalization, not filtered by an allowlist; if indexed directly, a type named after an `Object.prototype` member such as `constructor` / `toString` / `valueOf` would resolve to an **inherited function** (truthy and never `undefined`), defeating the guarantee that "unknown types are treated as non-traffic" and drawing a dashed line.

The stylesheet SHALL draw these edges dashed with the `edge[?ingressPath]` selector, declared after the base `edge` and taxi rules so that it overrides `line-style`; colour, arrows and routing MUST stay identical to that edge type's original (the dash is the only difference). The dash/gap values MUST be provided as a single constant shared by the canvas rule and the legend glyph, so that the two cannot drift.

#### Scenario: The three traffic hops dashed, the direct path solid

- **WHEN** the elements contain `p →(pod-calls-service) igwSvc →(service-selects-pod) igwPod →(pod-calls-service) bsvc →(service-selects-pod) bpod` and the direct `p →(pod-calls-service) bsvc`, with `igwSvc` carrying the ingress label
- **THEN** the first three edges carry `ingressPath: true`; `bsvc → bpod` and the direct `p → bsvc` both lack that key

#### Scenario: The scheduling and mount edges of an ingress pod stay solid

- **WHEN** `igwPod` also has the two edges `igwPod →(pod-to-node) k8sNode` and `igwPod →(pod-mounts-pvc) igwPvc`
- **THEN** neither carries `ingressPath` — although the endpoint belongs to the ingress set, they express placement and mount relationships, not traffic detouring through the gateway

#### Scenario: An unknown edge type stays solid

- **WHEN** `igwPod` has an edge whose type is not in the traffic lookup table (for example a newly added backend `pod-calls-configmap`)
- **THEN** that edge does not carry `ingressPath` (the edge itself is still visible per the unknown-visible convention, it is just not drawn dashed)

#### Scenario: An edge type named after an Object.prototype member stays solid

- **WHEN** the backend sends an edge whose type is `constructor` (or `toString` / `valueOf`) and whose endpoint belongs to the ingress set
- **THEN** that edge does not carry `ingressPath` — the lookup MUST NOT hit an inherited member on the prototype chain

#### Scenario: The traffic edges of a pod nested inside a labelled compound are dashed too

- **WHEN** a `controller` group carries the ingress label, with `igwPod` nested under it, and the two edges `igwPod →(pod-calls-service) bsvc` and `igwPod →(pod-to-node) k8sNode` exist
- **THEN** `igwPod → bsvc` carries `ingressPath: true` (the same set as what `showIngress` hides), and `igwPod → k8sNode` does not (non-traffic type)

#### Scenario: Zero marking when there is no ingress label

- **WHEN** no node carries `labels.role = "ingress-gateway"`
- **THEN** no edge carries `ingressPath`, and the elements pass through as-is (skipping the map traversal)

### Requirement: Legend Ingress toggle and showIngress view state

The Graph view SHALL hold the ephemeral view state `showIngress: boolean` (default `true`); this state MUST NOT be persisted in the runtime config, and toggling MUST take effect immediately. The left legend SHALL render a standalone Ingress toggle section after the node-kind legend section: the text "Ingress Gateway" (Title Case, consistent with the other section headings) + an eye (showing) / eye-slash (hidden) icon button; clicking MUST set `showIngress` to its inverse and MUST NOT touch any other view state. The Ingress toggle MUST be a controlled component (state held by the Graph view), and is not stuffed into the kind-based rows of the node-kind legend.

**Toggle rendering gate**: the Ingress toggle section MUST render only when an ingress set actually exists in the graph (the set is non-empty), consistent with the convention of the other legend sections "do not render without content" (node-kind / cluster / edge-type / container legends alike). The backend marks that label only when Istio route resolution hits, so the graphs of most deployments do not contain it; if rendered unconditionally, the user would see a dead button that changes nothing on screen when pressed yet still flips `showIngress` to `false`. The set used by this gate MUST come from the same source as the one the visibility computation takes (see the base elements requirement of "showIngress visibility semantics").

**Dashed legend**: the Ingress toggle section MUST be accompanied by a dashed-line sample (edge glyph) explaining the dashed semantics on the canvas. Its colour and dash style MUST be taken from the same constants as the stylesheet's `edge[?ingressPath]` rule (a single ingress dash colour and dash pattern) — the edge-type legend deliberately omits the rows for the service types (represented by the single `pod ↔ pod/service` row) and its samples are always solid, so without this sample the dashed lines on the canvas would have no corresponding explanation in the legend. The colour MUST NOT take the fallback grey: the only types that can ever be drawn dashed are the "traffic" types, which share the same orange, and the fallback grey is precisely the colour of unknown types, which are guaranteed never to be drawn dashed.

#### Scenario: Clicking the toggle flips the view state

- **WHEN** `showIngress` is `true`, and the user clicks the legend's Ingress toggle
- **THEN** `showIngress` becomes `false` and takes effect immediately; the other view state is unchanged; the runtime config is not written

#### Scenario: The icon reflects the current state

- **WHEN** `showIngress` is `false`
- **THEN** the toggle shows the eye-slash icon (hidden vocabulary), and shows eye when `true`

#### Scenario: The toggle is not rendered when the graph has no ingress nodes

- **WHEN** no node in the graph carries `labels.role = "ingress-gateway"` (the norm for deployments — the backend marks it only when route resolution hits)
- **THEN** the legend MUST NOT render the Ingress toggle section (no dead button)

#### Scenario: The dashed legend and the canvas share one source

- **WHEN** the Ingress toggle section renders
- **THEN** its dashed sample's colour is the ingress dash colour constant (the colour actually used by some "traffic" edge type), and its dash style is the ingress dash pattern constant, consistent with what `edge[?ingressPath]` draws on the canvas

### Requirement: Showcase demo dual-path fixture

The showcase fixture used by demo mode (the app's single fake data source, maintained by the fixture build / drift check scripts) SHALL contain both the path through ingress and the direct path: `pod/gateway →(pod-calls-service) service/ingress-svc →(service-selects-pod) pod/ingress-0 →(pod-calls-service) service/mongo-svc` and the existing direct `pod/gateway →(pod-calls-service) service/mongo-svc →(service-selects-pod) mongo pods`. `service/ingress-svc` MUST carry `labels.role = "ingress-gateway"`; `pod/ingress-0` MUST NOT carry that label (verifying select-expansion rather than a label hit).

The fixture SHALL also contain an `ingress-lb` control group: `service/nginx-lb` (carrying `labels.role = "ingress-lb"`), the `pod/nginx-lb-0` its `service-selects-pod` points to, and `pod/reporting` — whose **only** edge apart from `pod-to-node` is `pod/reporting →(pod-calls-service) service/nginx-lb`. The two groups coexisting is precisely the visible proof of this spec: when the toggle is off, the chain group disappears while `pod/gateway` still has its direct edge, and the `ingress-lb` group stays on screen as-is — if it were hidden too, `pod/reporting` would be drawn as having no dependencies at all.

Unit tests MUST pin the difference in `ingressPath` marking between these two groups (the chain's three edges dashed, the fallback's two edges without the flag), so that the "can be hidden / drawn dashed" asymmetry does not silently disappear in a refactor.

#### Scenario: After turning the toggle off, only the direct path remains in the demo

- **WHEN** the Ingress Gateway toggle is turned off in the demo-mode Graph view
- **THEN** `service/ingress-svc`, `pod/ingress-0`, their three connected edges, and the emptied `prod/app/ingress` application and `prod/ctrl/Deployment/ingress` controller containers all vanish from the screen; the direct path `pod/gateway → service/mongo-svc → mongo pods` is kept intact

#### Scenario: Turning the toggle off does not affect the ingress-lb control group

- **WHEN** the Ingress Gateway toggle is turned off on the same screen
- **THEN** `service/nginx-lb`, `pod/nginx-lb-0` and the `pod/reporting → service/nginx-lb` edge all stay visible and solid, and `pod/reporting`'s only dependency is not erased
