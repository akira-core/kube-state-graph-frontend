## Context

Motivation is in the Why of [proposal.md](./proposal.md); the behavioural contract is in [specs/](./specs/) (13 capabilities). This document covers only **how**.

Existing conditions that shape this design:

- **The source implementation exists and is mature**. `kube-state-graph-panel` already has a complete graph view implementation; its `src/shared/**` and each feature's pure logic are independent of Grafana and can be ported directly. This change is not a design from scratch but a **detachment from the host**.
- **The backend contract does not change, and the backend provides two graph endpoints**. `GET /v1/graph` (workload topology) and `GET /v1/storage-graph` (storage flow DAG) return the **same** cytoscape.js-shaped payload; they differ in request parameters, projection and the node / edge types they carry; `code_changes` / `config_changes` / `dashboard` are detail siblings, of which only `/dashboard` takes `from_time` / `to_time`. `start` / `end` on both graph endpoints are **required and have no relative form**, and `az` / `env` on `/v1/storage-graph` are additionally required single values.
- **cytoscape is a given constraint**. Canvas rendering, compound nesting, collapse and the layout algorithms are all bound to cytoscape.js and its extensions; it is not a replaceable choice.
- **The UI surface is small but highly customized**. The spec already specifies the search bar (two-stage Esc, ↑↓ skipping disabled rows, scroll-follow), the hover tooltip (follows the cursor, `right: 8` alignment) and the legend (per-row eye toggle, collapse button z-index constraint) down to the key and pixel level; off-the-shelf component libraries do not help in these three areas. Tables have no sorting, no pagination, no virtual scrolling.
- **Deployed as a static container in k8s**. The same image serves every environment; the differences come only from the mounted `config.json`.

## Goals / Non-Goals

**Goals:**

- Behavioural parity: the ported Graph view has no functional gap from the panel at the spec level.
- A single design token source feeding three rendering layers at once: DOM (CSS variables), cytoscape stylesheet (JS values), Sankey SVG (JS values).
- Pure logic ported with zero rewrites: pure functions such as normalize, visibility, topology transform and parameter assembly are brought over from the panel as-is, together with their unit tests.
- Minimal dependencies: beyond the cytoscape ecosystem, only introduce packages that genuinely save significant work.
- Build output decoupled from environment: `dist/` contains no environment information.

**Non-Goals:**

- No monorepo, and shared logic is not extracted into an npm package (the two repos evolve independently from here on; see Risks).
- No design system. Tailwind + tokens are enough; no component library documentation site.
- No state management architecture. The data flow is simple (one graph + per-view view state); Redux / Zustand / Jotai are not introduced.
- No SSR / SSG. Pure client-side SPA.
- No first-load optimization. cytoscape at about 300KB is a given cost; no code splitting (unless extensions exceed 3 in the future).

## Decisions

### 1. Build tool: Vite

**Decision:** Vite + React 18 + TypeScript. `npm run build` typechecks first, then builds (the Docker build stage is therefore also a type gate).

**Why:** the panel's webpack configuration comes from `@grafana/create-plugin`'s `.config/`; losing the host means losing its upgrade path, so it is not worth carrying over. Vite's dev server startup and HMR are an order of magnitude different for an app of this size; `server.proxy` is built in and directly satisfies the dev proxy need (see decision 12).

**Alternatives considered:** _webpack_ — reuses the panel configuration but must be maintained by us, with no gain. _Next.js_ — brings SSR / file routing / server concepts, none of which this app needs, and conflicts with the "static asset container" deployment model.

### 2. UI layer: Tailwind CSS + Radix primitives (taken as needed)

**Decision:** Tailwind CSS handles styling; only the Radix primitives actually needed are installed — `dropdown-menu` (the menu for multiple Dashboard links), `tooltip` (anchored tooltip, e.g. the alert Count column), `toggle-group` (segmented controls: pod-parent mode, layout, Sankey mode). **shadcn/ui is not brought in wholesale**; a single component file is copied into the repo only when needed. Variants are consolidated with `clsx` + `cva`.

**Why:**

- A component library's value is in saving the writing of dozens of components, but this app needs only about 8, and for the hardest three (search result list, canvas hover tooltip, legend) the spec already specifies behaviour item by item, so off-the-shelf components would all have to be torn apart and rewired. Paying the framework tax without getting the framework benefit.
- Radix fills the a11y gaps the spec explicitly requires (focus trap, ARIA, keyboard semantics) without taking on a whole component library's bundle and theme system.
- Tailwind has zero runtime JS, and its CSS variable model fits naturally with decision 3's token chain.

**Alternatives considered:** _Mantine_ — works out of the box and its theme is a JS object (cytoscape-friendly), but only 8 of 100+ components would be used, and the search bar and tooltip would still be hand-written, meaning half the UI sits outside the framework with an extra mental model. _MUI_ — the most stable ecosystem, but Material has a strong visual personality, a neutral operations dashboard needs heavy overrides, and emotion's per-render style serialization cost is a burden under high-frequency hover updates. _Plain CSS Modules_ — smallest bundle, but hand-writing dropdown focus management and keyboard semantics is a classic pitfall and conflicts with the spec's a11y requirements.

### 3. Design tokens: `tokens.ts` as the single source, producing CSS variables and JS values

**Decision:** `src/shared/theme/tokens.ts` defines the light / dark token sets as TypeScript objects (semantic colors `status.critical` / `status.warning`, kind colors, edge type colors, Sankey read / write colors, background and foreground hierarchy). From it:

1. CSS variables (`:root` and `.dark`) are produced and injected into `<style>`, for Tailwind and the DOM;
2. JS values are passed directly into the cytoscape stylesheet factory;
3. JS values are used directly for the Sankey SVG's `stroke` / `fill`.

Theme switching only toggles the `dark` class on `<html>` and recomputes the cytoscape stylesheet; it **does not rebuild the cytoscape instance**.

**Why:** the cytoscape stylesheet takes JS string values (`{ 'border-color': STATUS_COLOR.critical }`), not CSS classes; the same holds for the hand-drawn Sankey SVG. If tokens existed only in CSS, the canvas and SVG could not read them and would be forced to look them up via `getComputedStyle` (fragile, with timing problems) or to maintain two color tables (guaranteed to drift). With the TS object as the source and CSS variables as a derivative, the three rendering layers are guaranteed the same colors. This is also exactly the panel's existing shape — its `getStylesheet(theme: GrafanaTheme2, ...)` takes a JS theme object, so porting only requires swapping `GrafanaTheme2` for our own token type.

**Alternatives considered:** _CSS variables as the single source, read on the JS side with `getComputedStyle`_ — must wait for styles to be applied, easily reads an empty string in cytoscape init timing, and cannot be statically checked. _Two color tables maintained separately_ — guaranteed to drift, already rejected by the panel's `ICON_SVG_BY_KIND` single-source convention.

### 4. Routing: react-router, one page element per route, query string as the page's input

**Decision:** react-router with a layout route (nav bar + `<Outlet>`) and one page element per route: `/graph` → `GraphPage`, `/sankey` → `SankeyPage`, `/` → replace-redirect to `/graph`, `*` → not-found. Nav links are `NavLink`s to the **bare** paths. Each page parses its own query string through a small pure codec (`parse` / `serialize`) and writes it back with `replace` whenever its scope changes; navigating between pages is a push. The Sankey → Graph Locate target travels in router navigation state (`navigate('/graph', { state: { locate } })`), never in the URL.

**Why:** the router handles back/forward, replace vs push, modifier-key link behaviour and `aria-current` for free; hand-rolling those grows into a worse router. Now that the query string is the page's input (decision 18), the router's `useSearchParams` is also the single read/write seam for it — no second state store.

**Alternatives considered:** _hand-written History API router_ — saves a dependency, re-implements the details above. _TanStack Router_ — typed search params are now genuinely relevant, but two flat routes with a ~60-line codec do not justify a second routing model; revisit if the parameter set multiplies.

### 5. State management: no library

**Decision:** graph data and runtime config live in a shell-level React context; each view's ephemeral view state is held by `useState` / `useReducer` within that view. cytoscape-related state is held by the instance itself per decision 9; the React side keeps only the projections needed to drive the DOM (selected id, collapse set, filter set).

**Why:** the data flow is "one shared read-only graph + each view's own view state"; there are no complex cross-component write paths and no entity cache that needs normalization. Introducing a store library would just be `useState` spelled differently.

**Alternatives considered:** _Zustand / Jotai_ — an extra layer of indirection at this scale. _Redux Toolkit_ — clearly over-engineered.

### 6. Data access: hand-written hook, no data-fetching library

**Decision:** one **parameterized** loader hook, instantiated by each page for its own graph endpoint (see decisions 7 and 17), implementing the semantics the spec requires itself: a single in-flight request (reload and auto-refresh ticks do not re-issue while a request is in progress), stale-while-revalidate (the last successful data is retained during a refresh and after a refresh failure), failure shown only via the status indicator without clearing the screen, manual reload resetting the interval. The two instances' states are independent of each other. Detail endpoint queries reuse the panel's existing hook shape, with the endpoint source swapped from datasource to runtime config.

The refetch trigger key is the **selection**, not the assembled URL: a relative time range resolves to different `start` / `end` on every render, so using the URL as a dependency would refetch endlessly. The hook therefore depends on a "selection snapshot" (endpoint + time range option + filter / estate / root), and the window is resolved only at the moment of sending.

**Why:** there are only two polled resources and a handful of by-id queries. The spec's refresh semantics are precise; writing them directly is shorter and easier to verify than configuring a library's cache policy. The panel's detail hooks have already implemented the same in-flight and key comparison logic and can be ported as-is.

**Alternatives considered:** _TanStack Query_ — worth revisiting if detail endpoints multiply and cross-component shared caching and invalidation policies are needed; at this stage the configuration burden of its cache model outweighs the benefit.

The loader instance lives in the page, not the shell: it receives an `AbortSignal`, aborts in flight and clears its refresh timer on unmount, and drops any result that lands after unmount. The "selection snapshot" that keys a refetch is derived from the page's URL query plus the resolved time-range selection.

### 7. View switching: unmount on leave, the URL carries what survives

**Decision:** Leaving a route unmounts its page — the cytoscape instance is destroyed, the Sankey SVG is gone, nothing is cached in the shell. Whatever must survive a switch is either in the URL (scope, Sankey mode, time range) or in browser storage (theme, time-range fallback). Switching is a reset; returning re-fetches with the URL's scope and re-runs layout.

**Why:** Two views that behave like two Grafana dashboards are a simpler mental model than one shell juggling hidden containers. It removes the hidden-container measurement hazard (zero-size containers, `resize()` on reveal, "resize but do not fit"), the `visible` / `hidden` prop plumbing, and every "which view's state is this" question — state provenance is now the URL or nothing. The cost is a re-fetch and a re-layout on return; the URL restores the exact same request, and the nav lamp shows the loading state honestly.

**Alternatives considered:** _keep both views mounted and toggle `hidden`_ (the previous decision) — preserves viewport and selection across switches, but at the price above and with state that no link can reproduce. _Unmount but cache loader results in the shell_ — keeps the data, still loses the cytoscape viewport, and reintroduces cross-page state ownership; rejected.

### 8. Sankey: self-computed layout + React-drawn SVG, box-card nodes and a single zoom layer

**Decision:** no chart library is introduced, and **`d3-sankey` is not used**; the layout is our own pure function (`layoutSankey`), and rendering is SVG generated by React (`<path>` / `<rect>` / `<text>`). Bidirectional read / write ribbons, minimum-thickness dashed lines for zero weight, orphaned cards for no-flow roots, hover full-path highlight, tooltip, click-to-locate across views — all are our own JSX and event handling. Colors come from decision 3's tokens.
The input is the `/v1/storage-graph` body (see decision 17), and derivation does only three things: layer by `labels.tier`, take one direction's weight from each `storage-flow` edge per the current mode, sort by total flow. **No summing or even splitting of any kind** — the backend already guarantees per-tier conservation and has already completed the RWX even split; recomputing on the frontend would only produce a set of numbers that do not match.

The layout has four steps, each a unit-testable pure function:

1. **Column x** — tiers are four fixed columns (`pod` / `pvc` / `netapp-aggr` / `netapp-node`); column width is the widest box card in that column, column gap is fixed.
2. **Order within a column** — the spec's deterministic ordering (total flow descending, ties by `label` lexicographic order); the pod column is grouped by namespace first, then sorted.
3. **Slot stacks** — each node has one stack of slots on each of its left and right sides; slot height is `max(ribbon thickness, minimum row height)`, with fixed spacing, vertically centered within the box card's body; box card height is derived from this (not proportional to weight).
4. **Ribbon geometry** — a filled cubic Bézier region anchored at slot centers at both ends; thickness comes from one scale shared across the whole graph, `max thickness / graph-wide max weight`, with the minimum thickness as the floor.

The rendering layer adds three more things: node box cards (title / divider / subtitle, kinds distinguished by solid versus dashed stroke, `netapp-node` as a leaf card), ribbon gradients and on-ribbon values (stroke halo, not an opaque backing plate), column headers and namespace color bars. Hover full-path highlight via class toggling, tooltip, and click-to-locate across views are all ordinary React event handling. Colors always come from decision 3's tokens.

**Zoom / pan is one `<g transform>` layer, not a re-layout.** The SVG fills the container and carries **no `viewBox`**, so one user unit is one CSS pixel and that `<g>`'s `transform` is the single place content is scaled or moved; a container resize changes neither the layout nor the viewport. The no-`viewBox` part is load-bearing rather than incidental: `useZoomPan` is written in CSS pixels throughout (fit centres against the measured container, the wheel anchors on `clientX - rect.left`, a drag adds raw client deltas, `percent` reports `scale * 100` as a 1:1 level), and a `viewBox` sized to the layout maps the content a second time, so the two mappings compose and every one of those numbers is wrong by the viewBox factor — fit squares itself. `<defs>` (gradients) stay outside the `<g>` so they are not scaled along with it. This gives true geometric zoom: font size and line width scale with it, no inverse compensation needed. Keyboard (`+` `-` `0` `1` `F` `Esc`) is bound to the graph area container rather than `document`, because `app-shell` explicitly forbids shell-level global shortcuts.

**Why not `d3-sankey`:** the box card model overrides every one of its outputs. Its core is "node height proportional to throughput", while box card height comes from the slot minimum row height and the title / subtitle; the two are incompatible. The spec specifies the order within a column as a deterministic sort, not its barycenter iteration; link endpoints are anchored at slot centers rather than proportional positions along node height, and `sankeyLinkHorizontal`'s constant-width path is not the shape here either. Keeping it means paying for a dependency to compute a set of values that are all thrown away. Computed ourselves, the layout is four small pure functions, and testing is more direct than integrating an overridden library.

**Why hand-drawn rather than a chart library:** the spec's rules for this diagram (two distinguishable links drawn for the same source/target pair, zero weight must still be visible, hover lights up the full upstream and downstream path, colors must not be distinguished by hue alone, box card nodes, in-diagram zoom / pan) are almost every one an edge case for a chart library. Hand-drawn SVG turns each rule into ordinary React code, and is consistent with the Tailwind + token architecture — no second theme system needed.

**Alternatives considered:** _Apache ECharts_ — sankey is a built-in series and configuration produces a chart, but canvas rendering defeats CSS variable theming (the option must be rebuilt on the JS side), custom highlighting must go through its `dispatchAction`, bidirectional links and zero-weight styling are limited by its API, box card nodes and slots are not in its data model at all, and it weighs about 300KB+. _@nivo/sankey_ — React-native and accepts custom node components, but its own theme system would run in parallel with Tailwind + tokens, and two links for the same source/target pair are an edge case in its data model. _Keep `d3-sankey` only for ordering_ — the ordering rule is already fixed by the spec, and everything else it computes would be thrown away.

### 9. Cytoscape × React integration conventions (ported from the panel, two fixes)

**Decision:** reuse the integration conventions from the panel's design.md, whose core is "**the cytoscape instance is the single source of truth for state; React only handles mount/unmount and imperative sync**":

1. **Lifecycle**: all lifecycle is encapsulated in one hook; the init effect (empty dependency array) creates the instance and in cleanup calls `removeAllListeners()` + `destroy()` and sets the ref back to null; update effects each watch their corresponding input and mutate the existing instance with `cy.batch()`. Must be idempotent under React StrictMode's double-mount.
2. **Extension registration**: `cytoscape.use(...)` runs exactly once at module top level; calling it inside a component / hook is forbidden.
3. **Types**: use cytoscape's native types; custom `data` fields are extended centrally via declaration merging; no `any`.
4. **Stylesheet**: a pure factory produces the `Stylesheet[]` array (inputs are decision 3's tokens and the various mapping tables), serializable and snapshot-testable; chained `cy.style().selector(...)` is forbidden.
5. **Layout**: `cy.stop()` before `cy.layout(opts).run()`; options are stabilized with `useMemo`.
6. **Events**: handlers are registered once in the init effect and are not toggled on/off as props change; cytoscape → React state projection goes through `useSyncExternalStore`.
7. **Size**: `ResizeObserver` + debounced `cy.resize()`.
8. **Testing**: pure logic is verified with `cytoscape({ headless: true, styleEnabled: true })`, no DOM needed.
9. **Performance**: batch updates are always wrapped in `cy.batch()`; the three inputs (elements / stylesheet / layout) are memoized on the React side.
10. **API boundary**: the hook exposes only `containerRef` and the necessary operations; cytoscape internals are not leaked.

**Two fixes:**

- **The boundary for element updates**. Ordinary data refreshes use **diff-and-patch** (compare existing against incoming, add / remove only the differences), preserving layout continuity; but **pod-parent mode switching uses a full rebuild** (remove all elements, then re-add), because that operation changes the compound parent chain itself, the diff result equals a full replacement, and a rebuild is simpler and more correct. This boundary is written into the `pod-parent-mode` spec.
- **Theme source**. The original `getStylesheet(theme: GrafanaTheme2, ...)` is changed to take decision 3's token type.

**Why:** these are the community consensus from years of pitfalls, avoiding three classes of bug: "two refs out of sync", "extension double-registration warning", "listeners left over from StrictMode double mount". The panel has already proven them in practice; there is no reason to reinvent.

**Alternatives considered:** _`react-cytoscapejs`_ — not actively maintained for years, its abstraction layer limits fine-grained updates, types are incomplete. _elements as props, fully replaced_ — re-runs layout on every update, nodes jump. _cytoscape instance in React state_ — triggers a re-render of the whole tree, an anti-pattern.

### 10. Code organization: feature-first + co-location

**Decision:** directories are split by feature rather than file type; one folder per component, containing same-named `.tsx` / `.types.ts` / `.test.tsx` / `index.ts`; function components only; named exports throughout `src/**`, default exports forbidden; no feature may reach across and import another feature's internal files. Enforced with ESLint's `import-x/no-default-export` and `import-x/no-restricted-paths`.

**Why:** reusing the panel's proven structure makes the port "moving folders" rather than "re-filing". Forbidding default exports keeps renaming and auto-import behaviour consistent. The boundary rule prevents implicit coupling from growing between features.

**Note:** these two are code organization conventions rather than observable behaviour, so they are not put into the spec (the spec is a behavioural contract); they are recorded here instead and enforced by lint.

### 11. Porting strategy: pure logic moved as-is, host-coupled parts rewritten

**Decision:** split by "whether it imports `@grafana/*`":

| Category                                                                                                                                                                                                                                                                                                                      | Treatment                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Pure functions + their unit tests (normalize, visibility computation, pod-parent topology transform, ingress set identification, switch level reading and layout constraints, node group synthesis, Dashboard parameter assembly, Dashboard link resolution, icon mapping table, all color and style mapping tables, fixture) | **Copied as-is**, together with `.test.ts`. Logic unchanged, only import paths changed                       |
| Stylesheet factory                                                                                                                                                                                                                                                                                                            | Rewrite signature: theme parameter swapped for our own token type                                            |
| Endpoint resolution                                                                                                                                                                                                                                                                                                           | Rewrite: datasource query swapped for reading runtime config                                                 |
| React components                                                                                                                                                                                                                                                                                                              | Rewrite: `@grafana/ui` components swapped for Tailwind + Radix; the rest of the structure and logic retained |
| Grafana-specific (variable export, panel options editor, `PanelPlugin` registration, provisioning)                                                                                                                                                                                                                            | **Not ported**                                                                                               |

After porting, the existing unit tests are the first correctness check — tests passing means the pure logic was moved without loss.

**Why:** these pure functions are the panel's most valuable part and the one most prone to error in a rewrite (never treating absent as 0, controller alert aggregation, the two union branches of edge metrics, the desired ∩ present of collapse reconciliation). They are independent of Grafana; rewriting would only introduce regressions.

**Trade-off:** copying rather than a shared package means this logic will diverge between the two repos. See Risks.

### 12. Runtime config: fetched at startup, hand-written validator

**Decision:** fetch `<base>/config.json` before rendering any view, validate it with a hand-written validator (no type coercion: `"30"` is not treated as `30`, `1.5` is not a valid `refreshIntervalSeconds`); on failure render a full-screen configuration error screen and stop there — **never silently fall back to demo mode**. The config path cannot be overridden by the page URL's query / hash. In dev mode `npm run dev` serves the version-controlled `dev/config.json` (`demoMode: true`), overridable by the gitignored `dev/config.local.json`; neither enters `dist/`. A real backend goes through Vite `server.proxy` under the `/api/` prefix.

**Why:** a hand-written validator is about 120 lines, written the same way as the existing normalize boundary (hand-written types + runtime validation at the boundary, no codegen), and the spec's requirements for the error message are specific (name the config path and the **first** problem), so a schema library's default messages would have to be overridden anyway. Zero dependencies. "No silent fallback to demo" is deliberate: a ConfigMap with a typo that makes the app show fake data would be the hardest production incident to notice.

**Alternatives considered:** _zod_ — good message quality but about 14KB and messages still need overriding. _valibot_ — much smaller; if the config schema becomes significantly more complex later, it is the first option to revisit. _Injecting environment variables at build time_ — directly conflicts with the "one image serves all environments" deployment model; ruled out.

### 13. Add a view time range

**Decision:** the nav bar provides a relative time range selector (1h / 6h / 24h / 7d / custom absolute window), default 24h, persisted in browser storage **and** written to the current route's query as `from` / `to` (`now-6h` / `now` for relative windows, Unix seconds for absolute); on mount the URL wins, then browser storage, then `24h`, and the resolved value is written back so every page URL is self-describing. It is the shell's only input shared across views, with three consumers: `start` / `end` for `/v1/graph` and `/v1/storage-graph`, and `from_time` / `to_time` for the `/dashboard` query; clicking an alert's "Last occurred" sets it to `[t-300, t+300]`.

**Why:** the panel inherits its time range from the Grafana dashboard; the SPA has no such host, and `start` / `end` on both graph endpoints are **required and have no relative form** — the window can only be resolved by the frontend at the moment each request is sent. This is also why the window cannot be a config value or a constant frozen at selection time: it would stop moving, eventually fall outside the store's retention, and the backend would return an empty graph indistinguishable from a broken pipeline. What comes back as a bonus is a real operational action: jumping from an alert to the dashboard at **that moment**.

**Impact:** the `app-shell` spec's view time range requirement governs the refetch behaviour of both endpoints at once; the `node-detail` spec's existing conditional wording ("when the app provides a changeable view time range") automatically becomes the active branch, no rewrite needed.

**Alternatives considered:** _Do not add it_ — `/dashboard` sends no time, the target dashboard uses its own default window, and "Last occurred" degrades to plain text. Saves one control, but loses the time alignment from alert to dashboard. _not in the URL_ (the previous decision) — dropped once the URL became the snapshot carrier (decision 18): a shared link without its time window is not a snapshot.

### 14. Test strategy: three layers, e2e included in CI

**Decision:**

- **Unit (Vitest)**: pure functions and the stylesheet factory; cytoscape-related logic is verified with a headless instance, no DOM needed. Ported tests are reused as-is.
- **Component (Vitest + Testing Library)**: interaction and a11y semantics (keyboard operation, `aria-current`, visible focus).
- **e2e (Playwright)**: starts its own dev server, two mandatory specs — a demo mode smoke test, and a round-trip test that goes through the real fetch path with `/demo/graph.json`.

CI chain: `typecheck → lint → fixture:check → unit → e2e → build`.

**Why:** the panel's e2e stays out of CI only because it needs a Grafana container; the SPA has no such restriction, Playwright starts its own dev server and demo mode has no external dependencies, about 1–2 minutes. "A clean checkout renders the full graph" is one of this project's core promises, and only e2e can hold it; running it only locally amounts to not holding it.

**Alternatives considered:** _e2e stays locally triggered_ — CI is 1–2 minutes faster, but demo regressions are not caught automatically, out of proportion to the importance of that promise.

### 15. Fixture and demo mode

**Decision:** `SHOWCASE_GRAPH` (TypeScript, typed as `WireGraph`) remains the single fake data source. `fixture:build` produces `public/demo/graph.json` — serialized as a complete `GET /v1/graph` response body; `fixture:check` blocks drift and runs in CI and pre-push. Demo mode imports the TS fixture directly (no network); `public/demo/graph.json` serves two purposes: for backend implementers it is a sample payload, and for tests it lets `demoMode: false` + `endpoints.graph: "/demo/graph.json"` go through the complete fetch path without a backend.

**Why:** the two paths (direct import and real fetch) cover different error classes — the former verifies rendering, the latter verifies fetching, validation and error handling. Feeding both from the same fixture guarantees the two paths test the same graph.

### 16. Container and deployment

**Decision:** multi-stage `Dockerfile` (build stage runs typecheck + build; runtime stage contains only `dist/` and a static web server), running as a non-root user with a numeric UID, listening on `8080`. Config is mounted as a directory at `/srv/config` (no `subPath`, so ConfigMap updates are reflected inside the container). Cache headers: `/assets/*` long-lived immutable, `index.html` `no-cache`, `config.json` `no-store`. `GET /healthz` for liveness / readiness probes. A history-API fallback makes deep links to `/graph` and `/sankey` usable on reload. An optional same-origin reverse proxy (`/api/` → backend) lets operators avoid CORS with root-relative endpoint URLs. Manifests live in `deploy/` and conform to the Pod Security Standards `restricted` profile.

**Why:** "same image + different ConfigMap" is this design's core deployment premise (see decision 12). `no-store` on config ensures a configuration change takes effect on the next load, with no image rebuild or Pod restart. `subPath` is avoided because that mount mode does not receive subsequent ConfigMap updates.

### 17. Two graph endpoints, two data sources

**Decision:** the Graph page uses `GET /v1/graph`, the Sankey page uses `GET /v1/storage-graph`; each page owns its own loader instance (decision 6), with its own in-flight request, state, error and last success time. Reload and auto-refresh act only on the mounted page's source; storage-graph is **lazy** in the strongest sense — the loader does not exist until the Sankey page is mounted (decision 7). Both bodies are the same cytoscape shape, so they share the same `WireGraph` types and the same `normalizeGraph` — **only the request side forks, the response side does not**.

**Why:** the early design had both views share one `/v1/graph` dataset, with the frontend deriving the chain along `pod → pvc → netapp-aggr`, summing an aggregate's incoming edges itself, and splitting an RWX claim's measurement evenly across pods itself. The backend's storage-graph endpoint makes that path both **impossible** and **unnecessary**:

- `netapp-svm` is an entire tier, and `/v1/graph` does not output that node type at all;
- root search (starting from any of aggregate, SVM, controller, pod or node, taking the intersection of both sides) is a backend projection that the frontend has no way to reproduce from the `/v1/graph` body;
- weight **conservation** is a property the backend computes at build time. Frontend summing would diverge from the backend on rounding and on incomplete paths such as FlexGroup / unscheduled pods, producing a set of numbers that cannot be reconciled;
- `az` is Harvest's routing key, so `/v1/storage-graph` requires `az` / `env` as required single values — this constraint does not exist on `/v1/graph` and cannot be expressed with the same set of filters.

**Cost:** same-named dimensions appear in two places (the Graph's multi-select filter bar and the Sankey's single-select estate selector), and users need to understand that each is sent to a different endpoint. This is deliberate: tying the two together would mean forcing a single-value restriction onto the Graph's multi-value selection, or silently taking the first value on the Sankey — the latter is exactly the kind of silent mismatch this demo exists to catch.

**Alternatives considered:** _Sankey keeps deriving from `/v1/graph`, only adding SVM_ — SVM is not in that body; it cannot be added. _One loader switching endpoints by current view_ — no longer an option once each page owns its loader (decision 7). _Both endpoints sharing one set of filter controls_ — see the cost above.

Both pages' scope parameters mirror the backend parameter names in the URL, so a page URL's query is a near-verbatim copy of the request it produces (minus `start` / `end`, which are derived from `from` / `to`).

### 18. The URL query is the snapshot mechanism (Grafana variable model)

**Decision:** A page's request-shaping inputs live in its query string and nowhere else. Graph: `cluster` / `az` / `env` / `namespace` / `edge_type` / `prune`. Sankey: `az` / `env` / `ontap_cluster` / `node` / `aggr` / `svm` / `pod` / `cluster` / `namespace` / `mode`. Both: `from` / `to`. Multi-value = repeated key, no `var-` prefix. Defaults are omitted (empty lists, `prune=true`, `mode=both`) except `from` / `to`, which are always written because they have a browser-storage fallback and "absent" would be ambiguous. In-page changes `replace`; unknown params are ignored and stripped on the next write; values not in the option list are applied and marked unlisted; `prune` / `mode` are validated to their enums, `pod` roots to `<ns>/<pod>`, `from` / `to` as a pair. Demo mode ignores scope params but still writes `from` / `to`.

**Why:** With switch-as-reset, some carrier must let a scope survive navigation and be shared. Three were weighed:

| Carrier                           | Shareable | Restorable (Back / refresh)       | Visible                                                                                               | Cost                               |
| --------------------------------- | --------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------- |
| URL query (Grafana `var-*` model) | yes       | yes — history is snapshot history | yes — address bar and controls agree                                                                  | codec + validation                 |
| localStorage named snapshots      | no        | needs its own list UI             | no — auto-applied state is invisible, the exact failure the old "no persistence" rule guarded against | a new persistent surface           |
| backend-stored snapshots          | yes       | yes                               | yes                                                                                                   | backend change — a stated non-goal |

The URL is the only stateless, shareable carrier a static SPA has. The old rule "filters are never persisted" was aimed at invisible auto-applied state; a filter in the address bar is not invisible, and a clean `/graph` still means "no filter". Mirroring backend parameter names keeps the URL readable as the request it will produce. Named snapshots, if ever wanted, are stored URLs — a layer on top, not a change to this contract.

**Alternatives considered:** _no carrier_ — Locate → Back would lose the Sankey scope. _`var-` prefixed names_ — Grafana needs the namespace because many panels share one URL; here each page produces exactly one request. _time range not in the URL_ — rejected by the user: a snapshot without its window is not a snapshot.

### 19. Grafana-style dropdown: Radix Popover + a hand-rolled ARIA listbox, one shared component

**Decision:** One `shared/ui` component (`ScopeSelect`, name final at implementation) with `mode: 'single' | 'multi'`, `options`, `value`, `onChange`, `allowCustom`, `label`. The trigger shows the label plus `All` or up to two pills with `×` and a `+N` overflow; the popover (Radix `Popover` for anchoring, dismiss and focus return) holds a search input (`role="combobox"`), a `listbox` with checkbox rows for multi (with a pinned `All` row) or plain rows for single, and — when `allowCustom` and the typed text matches no option — a `Use "<text>"` row. Unlisted values render with a dashed pill border and a title. Graph filter bar, Sankey estate / narrowing selectors, root kind and Projection all use it; `edge_type` is the only `allowCustom: false` list dimension.

**Why:** Radix ships no combobox; Popover covers the hard parts (positioning, outside-click, Escape, focus restoration) and the listbox semantics are ~150 lines that the spec pins to the key anyway. A single component makes the two control bars consistent and folds the Sankey free-text fallback into the custom-value row.

**Alternatives considered:** _`cmdk`_ — opinionated fuzzy filtering, single-select oriented; checkbox rows and custom values need workarounds. _`downshift`_ — capable, but a hooks-based state machine is a second mental model for one component. _native `<select multiple>`_ (current) — no search, no pills, poor discoverability on macOS, cannot express custom values.

## Risks / Trade-offs

- **Pure logic diverges between the two repos** → the port is a copy, not a shared package. A backend contract change (new kind, new edge type, new metrics field) must be made once in each place and may fall out of sync. **Mitigation:** both sides use the `WireGraph` types and the fixture drift check to turn a contract change into a typecheck failure rather than a blank screen at runtime; if the cost of divergence rises significantly later, re-evaluate extracting a package or a monorepo (this is a deliberately deferred decision, not an oversight).

- **Search bar, tooltip and legend must be hand-written** → these three account for a significant share of the frontend work, and the spec specifies them down to the key level, so implementation deviations are hard to spot in code review. **Mitigation:** every keyboard and positioning rule has a corresponding scenario, covered one by one with component tests; positioning contracts such as `right: 8`, the 40% max height and z-index relative ordering are written as assertable tests.

- **URL ↔ state sync loop** → a codec that is not idempotent, or a write on every render, spams `replace` and can loop. **Mitigation:** pure `parse` / `serialize`, canonical parameter order, write only when the serialized string differs; tests assert history length is unchanged across in-page changes.

- **Custom values reach the backend unvalidated** → `az` / `env` / `cluster` / `namespace` are raw label matchers; a typo yields an empty 200. **Mitigation:** unlisted marker on the pill; the empty state names the scope it queried; `edge_type` has no custom path because it is the one value the backend rejects with a 400.

- **Returning to a page re-fetches and re-lays-out** → accepted cost of decision 7. **Mitigation:** the nav lamp shows loading; layout time is bounded by the existing performance limits.

- **Locate target lost if the first Graph load fails** → **Mitigation:** the target is retained until the first successful load (spec), then consumed once.

- **Jitter between `ResizeObserver` and cytoscape `resize()`** → too short a debounce recomputes repeatedly while dragging the window; too long feels sluggish. **Mitigation:** reuse the panel's already-tuned debounce value, and verify with the spec's size responsiveness scenario.

- **The workload of hand-drawing the Sankey** → with `d3-sankey` removed, even the layout is hand-written: column x, order within a column, slot stacks, ribbon geometry, plus box cards, column headers, color bars, zoom / pan and focus mode, on the order of 600 lines. **Mitigation:** the four layout steps and hover path tracing (given a node, find the set of upstream and downstream links) are all pure functions, unit-testable away from the DOM; the rendering layer does only a literal "pure function output → SVG" translation, with no geometry hidden in rendering. Zoom / pan does not touch layout, so the two sets of tests do not interfere.

- **The Sankey's `az` / `env` are an extra hurdle** → the backend requires both as single values, so a user entering the Sankey view may see a screen with nothing drawn. **Mitigation:** auto-preselect when there is only one candidate value (most single-estate deployments are exactly this case); the hint when not both are selected and the "no storage flow" empty state must be two different pieces of text — writing them as the same sentence makes an incomplete selection look like a broken pipeline.

- **Consistency of the two fixtures** → in demo mode the Sankey and the Graph read different fixtures; if the two describe different estates, cross-view Locate would fail to find its target under demo. **Mitigation:** the two fixtures share the same set of node ids and names, and one unit test asserts that every pod / pvc / netapp node id in the storage fixture exists in the graph fixture (except SVM — `/v1/graph` does not output that type), and that `storage-flow` weights are conserved per tier.

- **cytoscape bundle about 300KB** → the first-load cost is fixed. **Mitigation:** accepted (see Non-Goals); choosing d3-sankey over ECharts for the Sankey already avoided stacking another 300KB.

- **Focus mode collapses the shell nav bar** → this is the only path in the whole app where a view hides shell chrome, leaving only `Esc` and the control bar button as exits; if both fail at once, the user is trapped in a screen with no navigation. **Mitigation:** the `app-shell` nav bar requirement hard-codes this exception and grants it only to Sankey focus mode; each of the two exit paths has a scenario; focus mode does not enter the URL and is not persisted, so a refresh always returns to a state with the nav bar.

- **`demoMode` misconfigured in production** → a ConfigMap typo could make a production environment show fake data. **Mitigation:** demo mode must be marked prominently in the UI; and a configuration error never silently falls back to demo (decision 12).

- **CORS** → if an operator points at a backend on a different origin with an absolute URL, the browser blocks it. **Mitigation:** the container provides an optional same-origin reverse proxy, and the documentation lists root-relative URLs as the recommended practice.

## Migration Plan

This repo currently holds only LICENSE and the openspec directory; **there are no existing users, no existing deployments and no data to migrate**. The "migration" here is the switchover path for panel users, not a version upgrade within this app.

**Build order** (details in tasks.md):

1. Project scaffold and toolchain → 2. Tokens and theme layer → 3. Runtime config loading and error screen → 4. Pure logic port (including its tests) → 5. App shell and routing → 6. Graph view (canvas → legend → interaction → search → detail) → 7. Graph request assembly (time range + filter bar) → 8. storage-graph source and Sankey view (estate / root selectors → tier derivation → rendering → cross-view Locate) → 9. Container and k8s manifests → 10. e2e and CI → 11. Grafana-style dropdowns, page split and URL scope (revision, tasks §24).

Demo mode must render at the end of every stage, so progress is visible at all times.

**Relationship to the panel:** the two coexist and do not replace each other. The panel continues to serve the scenario of embedding in a Grafana dashboard; this app serves the scenario that needs multiple views and full UI controls. This change does not modify, deprecate or archive the panel repo.

**Rollback strategy:** at the deployment level, images are tagged `sha-<short>`, and rollback is pointing the Deployment back at the previous tag; because configuration lives in the ConfigMap rather than the image, rolling back the image does not roll back the configuration with it. At the development level, this change is entirely new files; no existing code is modified.

## Open Questions

- **The readability ceiling of the Sankey on very large topologies**. The spec already sets a performance bound (first draw ≤ 1 second within 500 `pvc-to-netapp-aggr` edges), but "is a Sankey with several hundred links still readable" is a visual question, not a performance one. Top-N filtering or aggregation may be needed. **Can be deferred**: decide once the real data scale is known; does not affect the existing spec, architecture or task breakdown.
- **Whether export is needed** (PNG / SVG / CSV). "Paste the diagram into an incident report" is common in operations. **Can be deferred**: a standalone add-on feature that does not affect the existing design.
- **Whether to provide a namespace / Application level Sankey**. The backend deliberately does not make these two into tiers (a pod does not necessarily have an Application; `pod → node` is a physical hop while `pod → application` is a logical hop), but the same body carries `data.parent`, so the frontend can walk the parent chain and sum the conserved weights to derive it. **Can be deferred**: an addition on top of the existing body that does not affect the existing spec or architecture.
- **The practical default for `refreshIntervalSeconds`**. The spec sets the default to 0 (off), left to the operator. After real deployment it may turn out that some value should become the documented recommendation. **Can be deferred**: purely a documentation matter.
- **Named snapshots** ("Save as…" — stored URLs in browser storage or a backend). Deferred; the URL is the carrier either way (decision 18), so this is a layer on top, not a contract change.
- **Root value enumeration** (aggregate / SVM / controller names from Harvest label values) for the Sankey root selector. Deferred; today the root value is free text because no enumeration source is configured.
