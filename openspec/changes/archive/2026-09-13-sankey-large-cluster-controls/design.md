## Context

See `proposal.md` — Why. The pieces this design rearranges, as they stand today:

- **Requests are effect-driven.** `useGraphLoader` fires whenever its `requestKey` changes and on mount; both pages derive that key from the URL scope plus `time.range`, so every control edit and every mount is a request. Cancel does not exist; abort only happens on key change and unmount.
- **The URL has two writers.** `useUrlScope` (page) rebuilds the whole query string from `range` + scope and treats the URL as the source of truth for scope; `useViewTimeRange` (shell) writes `from` / `to` on its own and, in an effect, copies the URL's range back into its state. Under react-router v7's `BrowserRouter` a navigation lands in a transition render, so one render sees `range = 1h` beside `searchParams = 24h`; the shell effect reverts `range`, the page effect rewrites the URL from the reverted `range`, and the selection is gone. Confirmed in the browser: three `replaceState` calls in 25 ms, ending on `24h`.
- **Sankey roots are optional and enumerate from the drawn body** (`rootValueOptions(elements)`), through a single-select `ScopeSelect` plus an `Add` button (`SankeyScopeBar`). `useFilterOptions` enumerates exactly the four identity dimensions, once per mount, with no selector.
- **Derived `application` / `namespace` cards fold member status** in `deriveSankey`; the `Node` layout's wrapper folds in `layoutSankey`. Summary rows and tooltips read the node's `status` field.
- **The front door** generates `/tmp/metrics_proxy.conf` in `docker/entrypoint.sh`: one prefix location `/metrics-api/api/v1/label/` → `<target>/api/v1/label/`, included from `nginx.conf` after the fixed locations. The backend already binds `?az=` / `?env=` to configurable upstream labels (`--az-label` / `KSG_AZ_LABEL`, validated as PromQL label names, required to differ).

Constraints that shape the approach: URL parameter names mirror backend request names (`app-shell` View routing); the metrics proxy forwards only `/metrics-api/api/v1/label/`; no backend change; the shared dropdown contract in `graph-filters` is one component (`ScopeSelect`); `demoMode` keeps every scope value in component state.

## Goals / Non-Goals

**Goals:**

- One request model for both pages: request only on commit, reload or auto-refresh, with an abort path the operator can reach.
- The URL is always the applied scope, written by exactly one function per page, so the time-range revert cannot recur by construction.
- A required, multi-valued Sankey root that can be chosen before anything is drawn, with a bounded default projection (Top pods) so the first draw on a large estate is small.
- Label-name rebinding at the front door with zero SPA knowledge, mirroring the backend's own knob.

**Non-Goals:**

- Any backend change (no `top_pods` parameter, no root enumeration endpoint).
- A `/metrics-api/` dev proxy in Vite; the label rebinding is container-only.
- Changing what the Graph view draws or how it lays out; only when it asks.
- Persisting draft edits across mounts — a draft lives and dies with its page, like the rest of the page's transient state.

## Decisions

### D1. The loader becomes imperative: `run` / `reload` / `cancel`, no key effect

`useGraphLoader` drops `requestKey` and its mount / key effect. It exposes `{ state, run(makeUrl), reload(), cancel() }`: `run` captures the URL builder of the commit and issues the request; `reload` re-runs the last captured builder (inert when none); `cancel` aborts the current `AbortController`, marks `state.cancelled`, keeps `elements` / `hasPayload`, and clears the auto-refresh timer. The generation counter stays — a late response after cancel or unmount must not commit. Auto-refresh becomes a timer the loader (re)starts on every successful `run` / `reload` and clears on `cancel` / unmount, so "count from the last commit or reload" and "stopped after Cancel" fall out of one place. `state.status === 'idle' && !hasPayload` is the awaiting-Query state; nothing else changes shape except the new `cancelled` boolean.

_Alternative — keep the key effect and feed it an "applied key" that only changes on commit._ Works, but keeps the two behaviours this change removes (fetch on mount, abort-on-key-change) alive as latent paths, and needs a sentinel key for "never committed". Imperative is smaller and its tests read like the spec.

### D2. Draft in page state, applied in the URL, one canonical writer per page

`useUrlScope` is replaced by `useAppliedScope(parse, serialize)` returning `{ applied, commit(scope, range) }`: `applied` is parsed from the URL on every render (the URL **is** the applied selection, including `from` / `to`); `commit` builds the whole canonical string — scope pairs, immediate view values, then `from` / `to` — and replaces once. A companion `useDraft(applied, seed)` holds the draft in `useState`, seeds it from `applied` on mount and re-seeds when `applied` changes without a commit from this page (Back / Forward after a Locate), and exposes `dirty` (deep-equality against `applied`). Query = `commit(draft, draftRange)` then `loader.run(...)` from the values just committed, not from a re-parse of the URL (that would reintroduce a render-order dependency).

The immediate view values (`mode`, `top_pods`) go through the same `commit` with the current applied scope — one writer, even for values that apply without a request. Unknown parameters are dropped by construction, as today.

_Alternative — keep the draft in the URL under a marker (`?pending=1`)._ Rejected: a shared link would then name a scope that was never drawn, and every reader of the URL (Back, refresh, the demo's `verify.sh`) would have to learn the marker.

### D3. The time range is a shell-held draft; the page commits it; the shell never touches the URL

`useViewTimeRange` keeps the control state (`draft`, `setRelative`, `setAbsolute`, `setAround`) and the local-storage helpers, and loses both its URL writer and its URL → state effect. The page owns the URL: on mount it parses `from` / `to`; if valid it seeds the shell draft from it (`seedDraft(range)`), otherwise it commits once with the shell draft (which was initialised URL → local storage → `24h` at app start). On Query the page commits the draft range alongside the scope and persists it to local storage. The applied range used by requests and by the node-detail Dashboard link is `applied.range` from the URL, resolved at send time exactly as today (`buildGraphRequestUrl(…, range, …)` already re-reads the clock).

This is the structural fix for the revert: there is no longer a second writer, and no effect anywhere copies URL state back into React state in a way a transition render can race. The unit test for it renders under `MemoryRouter` with the navigation wrapped in `startTransition` and asserts the control value and a single `replaceState`.

### D4. Cancel is the Query control's in-flight face; the nav's Reload only reloads

A shared `QueryButton` (`src/shared/ui/QueryButton.tsx`) takes `{ dirty, inFlight, disabled, disabledReason, onQuery, onCancel }` and renders `Query`, or `Cancel` while `inFlight`, with a note beside it: the reason while disabled, "Changes not applied" while `dirty`. It is an action, not a field: no label above it, a filled button after a divider at the end of the row — hue-free `solid` when there is nothing new to apply, the accent `primary` while `dirty`, `outline` with a spinner as Cancel. The first cut was an outlined, labelled last column, and it read as one more dropdown beside the bordered ones. Both `FilterBar` and `SankeyScopeBar` render it last in their control row. The nav bar's Reload keeps its single job — re-run the applied selection — and is disabled before the first commit, while in flight, and while the Sankey draft is incomplete. `PageStatus` gains `phase: 'awaiting' | 'loading' | 'ready' | 'error' | 'cancelled'` so the status lamp and readout can say "awaiting Query" and "cancelled" without inferring them from `lastLoadedAt` / `error`.

### D5. Root candidates: label-values on demand, unioned with the drawn body

A `useRootCandidates({ labelValuesBase, kind, namespaces, drawn })` hook returns `SankeyRootOptions` for the current kind plus `problems`. It requests `node` label values once per mount when the kind is `node`, and `pod` label values per namespace when the kind is `pod` and the narrowing names namespaces, caching per key in a ref for the mount; results are unioned with `rootValueOptions(elements)` (which keeps serving names after a draw, and is the only source for the storage-side kinds). `labelValuesUrl(base, label, selector?)` grows an optional matcher rendered as `kube_pod_info{namespace="<escaped>"}` with PromQL string escaping of `\` and `"`, URL-encoded. The Sankey scope bar's source indicator merges these problems with the identity ones. Nothing here runs on the Graph page or before the kind is chosen.

_Alternative — enumerate every namespace's pods up front._ Rejected: on the estates this change is for, that is thousands of names per namespace across many namespaces, fetched for a control most sessions never open.

### D6. Root value is a multi-select `ScopeSelect` with the `All` row suppressed

`ScopeSelect` gains `allRow?: boolean` (default `true`); the root value control uses `mode="multi"`, `allRow={false}`, `allowCustom`, `emptyLabel="Pick values"`, and its checked set **is** the current kind's draft roots: checking a value calls `addRoots(kind, [value])`, unchecking calls `removeRoot`. `addRoots` validates each `pod` value, so a malformed one is refused with the inline error and never shows as checked. Root pills of every kind, the required-root text and the pod error stay on the row below the controls, as the spec's alignment rule demands.

_Alternative — a pending list confirmed by an `Add` button._ Built first and dropped: the draft is already the staging area Query commits, so Add was a second confirmation between a pick and its pill, and a checked-but-not-added value looked chosen when it was not.

### D7. Top pods is a pure pre-derivation cut over elements

`cutTopPods(elements, mode, k): { elements, shown, total }` in `storage-flow-sankey/topPods.ts` runs in `SankeyView` before `deriveSankey`, gated on `k` and `roots.pod.length === 0` of the **applied** roots. It indexes `storage-flow` edges once, sums each pod's inbound `pvc-pod` metrics in the mode's directions (the same field reads `deriveSankey` uses), sorts pods with ≥1 inbound link by total descending then label, keeps the first `k`, and walks the tiers backwards (`pvc` ← kept pods, `svm` ← kept pvcs, `aggr` ← kept svms, `netapp-node` ← kept aggrs) to keep only nodes on a surviving path; `pod-node` edges of dropped pods go with them; every other element passes through untouched. It returns a **new** array and never mutates an element, so the deep-equality rule holds across it. The `Node` layout's wrappers are built from the cut elements, so an emptied wrapper is simply absent. `SankeyUrlScope` gains `topPods` (parse: integer ≥ 1 else `10`; serialise only when ≠ `10` and no `pod` root; never sent to the backend).

_Alternative — re-sum upstream weights from kept downstream links._ Rejected: `aggr → svm` and `node → aggr` are not decomposable per pod from the body (there is no per-path attribution), and the spec forbids client-side re-summing of backend tiers. Showing the backend's numbers with an explicit "N of M pods" is honest; a recomputed ribbon would be a guess dressed as a measurement.

### D8. Derived cards stop folding status; the wrapper keeps folding

`deriveSankey` no longer assigns `status` to the synthesised `application` / `namespace` nodes. Everything downstream — border, summary dot, tooltip status item — already keys on the node's `status`, so the neutral border, the placeholder cell and the missing tooltip item follow without special cases. The wrapper fold in `layoutSankey` is untouched, and its tooltip keeps the "worst of members" wording.

### D9. Label rebinding at the front door: two exact-match locations, generated by the entrypoint

`docker/entrypoint.sh` reads `KSG_AZ_LABEL` / `KSG_ENV_LABEL` (default `az` / `env`), validates each with `grep -Eqx '[A-Za-z_][A-Za-z0-9_]*'` and rejects equality, exiting non-zero naming the variable — before and regardless of `KSG_METRICS_PROXY_TARGET`. When the metrics target is set and a binding differs from its default, it emits an exact-match block `location = /metrics-api/api/v1/label/az/values { proxy_pass <target>/api/v1/label/<KSG_AZ_LABEL>/values; … }` (and the `env` twin) into `/tmp/metrics_proxy.conf` ahead of the existing prefix location, through the same `proxy_location` helper extended with an optional exact flag. A static `proxy_pass` with a URI part still forwards the request's query string, so nothing is re-appended; an `$is_args$args` suffix would make the target a variable and force runtime DNS through a `resolver`. Exact-match locations win over the prefix regardless of file order, so the generic `/metrics-api/api/v1/label/` block keeps serving every other label name unchanged. The 404 for everything else under `/metrics-api/` is untouched.

_Alternative — a `labelNames` key in `config.json` and the SPA requesting the upstream names._ Rejected: it would put the same fact in two places (backend flag and frontend config) with two spellings, and the SPA would carry a store detail it has no other use for. The env-var pair keeps the operator's mental model — "set the same two variables on both containers" — and leaves the app's logical dimension names alone.

### D10. Verification layout

- Unit (Vitest): loader `run` / `reload` / `cancel` / timer semantics; `useAppliedScope` + `useDraft` commit and re-seed; the time-range regression under `startTransition`; `cutTopPods` on the performance fixture (membership, weights untouched, `shown` / `total`, no-flow pods, wrapper emptiness); `useRootCandidates` request counts and caching; `labelValuesUrl` selector escaping; `sankeyUrlScope` `top_pods` round-trip; `deriveSankey` derived nodes carry no `status`.
- e2e (Playwright): the `explicit-query` scenarios on both pages (mount = 0 requests, Query = 1, Cancel keeps the drawing, Reload disabled before commit), the Sankey required-root and multi-add flows, Top pods default on the large fixture, the "A selected window sticks" scenario.
- Container: a `docker run` matrix driven by `make image` plus `curl` against a stub upstream (`KSG_AZ_LABEL=zone` rewrite, `namespace` untouched, invalid / colliding values exit non-zero) recorded as a checklist in tasks, since the repository has no container test harness today.

## Risks / Trade-offs

- [Every mount needs one extra click, including a refresh after a committed query] → the awaiting-Query state names the control, Query is the last tab stop of the control row, and a bare `/graph` no longer fires a whole-estate request behind the operator's back, which is the trade the proposal asked for.
- [Top pods leaves upstream ribbons wider than their drawn downstream] → the header strip states `K of N pods`, the toolbar names the cut, and the tooltip values are the backend's; no number on screen is invented.
- [Storage-side root names must be typed before the first draw] → the empty list says so; after one query the drawn body populates them; a backend enumeration endpoint is the follow-up that removes this (out of scope here).
- [`match[]` selectors could be misread by a store, or the namespace value could carry quotes] → the selector uses only `namespace` (never the rebound `az` / `env`), values are PromQL-escaped and URL-encoded, and a rejected request degrades to an empty list with a source problem, never to a missing chart.
- [A Cancel silently stops auto-refresh] → the status indicator reads `cancelled` until the next commit or reload, and the interval badge stays visible so the pause is legible.
- [The demo repository's `verify.sh` §10 assumes a request on page load and optional roots] → called out in the proposal; a follow-up there bumps the submodule pointer and drives the Query control (or requests the backend directly for the pipeline assertions).
- [Two exact-match nginx locations are generated text] → they reuse `proxy_location`, the label regex admits nothing nginx could parse, and the container test matrix covers the rewrite and the refusal paths.

## Migration Plan

1. Ship as one frontend image; `config.json` is unchanged, so no ConfigMap edit is needed. Rollback is the previous image tag.
2. Operators whose external labels are not `az` / `env` set `KSG_AZ_LABEL` / `KSG_ENV_LABEL` on the front door to the same values as the backend's `--az-label` / `--env-label`; everyone else changes nothing.
3. Shared links keep working: their scope prefills the controls; the first draw needs one Query.
4. Demo repository: bump the submodule pointer after merge and adjust `verify.sh` §10 in that repository.

## Open Questions

- Should a future backend `top_pods` parameter replace the client-side cut once it exists? Deferrable: the control, URL key and summary wording would stay; only where the cut runs would move.
- Is a `/metrics-api/` Vite dev proxy worth adding so the rebinding can be exercised without Docker? Deferrable; the container matrix covers it for now.
