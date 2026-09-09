## Context

See proposal.md — Why. Three facts about the current code shape the approach:

1. **`edgeType` names two unrelated things.** `GraphFilters.edgeType` is a server-side narrowing dimension; `data.edgeType` on a cytoscape edge is the drawing attribute normalized from the wire field `data.type`. They share a word and nothing else. Roughly 70 references across nine test files belong to the second, which this change must leave untouched.
2. **The backend ignores unknown query parameters.** A parameter that no longer exists produces no error, so nothing at runtime will reveal a control left behind.
3. **The delta format cannot drop a scenario from a requirement it keeps.** `openspec validate` rejects a MODIFIED requirement whose scenario set is a subset of the current one, and it follows renames. Two requirements therefore had to be REMOVED and re-ADDED under new names.

## Goals / Non-Goals

**Goals:**

- The Graph page sends no `edge_type` parameter and offers no edge-type control, under any configuration.
- No request is issued to any edge-type catalogue URL.
- A deployment whose `config.json` still carries `endpoints.edgeTypes`, and a bookmark that still carries `?edge_type=`, both keep working without an error screen.

**Non-Goals:**

- Any change to how edges are coloured, legended, toggled, or grouped. `data.type` is untouched.
- A client-side replacement for the removed narrowing. The legend's per-edge-type visibility toggles already exist and already cascade to orphaned nodes; nothing is added to compensate.
- Changes to the `kube-state-graph-demo` integration repository.

## Decisions

**Remove the whole dimension rather than re-source its options.** The two alternatives were considered and rejected:

- _Populate from a list held in the frontend._ With `?edge_type=` unsupported, every offered value narrows nothing. The control would look identical to a working one. This was already the wrong answer while the parameter existed (the frontend's own edge-type union has drifted ahead of the backend registry more than once); with the parameter gone it has no upside at all.
- _Derive the options from the graph already returned._ The response is filtered by the current selection, so the option list would collapse to whatever is drawn and the user could never widen it back. The default projection (`prune=true`) draws only connectivity edges, so storage edge types would never be offered at all. And it cannot tell "the backend supports this but nothing matched" from "the backend does not support this".

Both alternatives preserve a control that moves nothing, which is the failure this removal exists to prevent.

**Keep `ScopeSelect`'s `allowCustom: false` mode.** It is not edge-type-specific: the Projection control and the Sankey's root-kind selector both use it, and both name a closed set of positions rather than a narrowing. Only `FilterBar`'s per-list-dimension conditional (`allowCustom={dimension !== 'edgeType'}`) collapses — every remaining list dimension allows custom values.

**Collapse `ListDimension` into `IdentityDimension`.** `ListDimension` existed only to widen `IdentityDimension` with `'edgeType'`. With that member gone the two are the same type; keeping both would leave a distinction that no longer distinguishes anything. `FilterBar` and `GraphPage` move to `IdentityDimension`.

**Let the removed config key and the removed URL parameter degrade through existing rules rather than adding compatibility code.** `endpoints.edgeTypes` becomes an unrecognised endpoint key, which the runtime config contract already handles with a console warning and no validation failure. `?edge_type=` in a URL becomes an unknown query parameter, which `app-shell`'s routing rules already ignore on read and strip on the next write. No migration shim is written; both paths are covered by a new scenario each so the degradation is asserted rather than assumed.

**Delete the edge-type fetch client outright.** `src/features/graph-filters/edgeTypes.ts` and its test have exactly one consumer. Leaving the module unreferenced would leave a second, plausible-looking way to reintroduce the request.

## Risks / Trade-offs

- **Touching `data.edgeType` while removing `GraphFilters.edgeType`** → the two are separated by directory: everything under `graph-filters/`, `graph-data/graphRequestUrl.ts` and `shared/types/graphFilters.ts` is the filter; everything under `graph-canvas/`, `legend/`, `element-filter/`, `pod-parent-mode/`, `graph-view/`, `storage-flow-sankey/` and `shared/constants/` is the drawing attribute. The drawing-side test files must still pass unmodified — that is the check, not a review of the diff.
- **Shipping after the backend** → opens a window in which the control is silently inert. Mitigated by ordering: a request without `edge_type` is valid against both the old and the new backend, so this change is safe to release first.
- **Users who relied on the narrowing** → the legend's edge-type toggles cover the same intent client-side, with three differences worth stating plainly rather than hiding: the selection is not in the URL and so is not shareable, it does not reduce the response size, and it applies to the already-pruned graph. No mitigation; this is the cost of the backend removal.
- **The two renamed requirements** → an archive folds them into the main spec under new names, so any external reference to "Option sources" or the "(Grafana style)" title goes stale. Both names are internal to `openspec/specs/`; a grep at archive time is enough.

## Migration Plan

1. Release this change. Requests stop carrying `edge_type`; both backends accept them.
2. The backend release removing `GET /v1/edge-types` and `?edge_type=` follows at any later time, with no coordination.
3. Deployments drop `endpoints.edgeTypes` from `config.json` at their convenience. Until they do, the console warns once per load and nothing else happens.

Rollback is a revert of this change alone, provided the backend still honours the parameter. Once the backend release has shipped, a revert restores an inert control rather than a working filter — so after that point the correct response to a problem is a fix forward.
