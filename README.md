# kube-state-graph-frontend

Standalone SPA for the kube-state-graph topology: three standalone pages — a cytoscape Graph and a storage-flow Sankey of the storage estate, and a Network Sankey that traces a switch's traffic. No Grafana, no backend required for local demo.

## Prerequisites

- Node 22+ (see `.nvmrc`)
- Docker only if you are building the container image

## Quick Start

```sh
npm install
npm run dev
```

Open the URL printed by Vite. The app loads `dev/config.json` (`demoMode: true`) and renders the showcase graph. You do not need a backend, Docker, or a cluster.

## Demo data

Demo data is three fixtures, one per graph endpoint:

- `src/shared/fixtures/showcaseGraph.ts` (`SHOWCASE_GRAPH`) → `GET /v1/graph`
- `src/shared/fixtures/showcaseStorageGraph.ts` (`SHOWCASE_STORAGE_GRAPH`) → `GET /v1/storage-graph`
- `src/shared/fixtures/showcaseTrace.ts` (`SHOWCASE_TRACE`) → `GET /v1/trace`

```sh
npm run fixture:build   # writes public/demo/graph.json, storage-graph.json and trace.json
npm run fixture:check   # fails if any file drifted
```

The trace fixture merges the network samples of the sankey-panel repo into one `destination` trace: the `dci-uturn` backbone (`dci-uturn/core-1` is the start; its ToRs feed the `k8s` and `client` samples) plus `classic`, `dual-uplink`, `campus`, `pruned`, `dci-tier` and `k8s-source` drawn beside it. Ids carry the sample key as a prefix. It draws under `track_dir=destination` only; asked to walk it as a `source` trace, the Network Sankey reports that the body cannot be drawn.

The JSON files are generated. Do not hand-edit them.

## Connecting to a backend

1. Copy `dev/config.json` to `dev/config.local.json` (gitignored).
2. Set `demoMode: false` and point `endpoints.graph` at your API.
3. Prefer root-relative URLs plus the dev proxy:

```sh
KSG_DEV_PROXY_TARGET=http://localhost:8080 npm run dev
```

Example `dev/config.local.json`:

```json
{
  "demoMode": false,
  "endpoints": {
    "graph": "/api/v1/graph/service_graph",
    "storageGraph": "/api/v1/storage-graph",
    "trace": "/api/v1/trace"
  }
}
```

Requests to `/api/…` are forwarded to `KSG_DEV_PROXY_TARGET` with the `/api` prefix stripped.

`endpoints.trace` is optional and rides the same `/api` proxy. It is the network trace endpoint the Network Sankey fetches (`GET <trace>?hostname&from_ts&to_ts&max_hops&top_n&threshold&track_dir`, timestamps in epoch **milliseconds**). Leaving it out disables only that fetch: `/network/sankey` stays reachable and shows a not-configured notice with its scope bar still operable, and the Storage Graph and Sankey are unaffected.

The Vite dev proxy does not front `/metrics-api/`. Label-name rebinding (`KSG_AZ_LABEL` / `KSG_ENV_LABEL`) is container-only: set those on the front-door image to the same values as the backend's `--az-label` / `--env-label`. The SPA always requests logical `az` / `env`.

## Architecture

- `src/features/*` — feature folders (barrel imports only across features)
- `src/shared/*` — tokens, wire types, fixtures, pure helpers
- Runtime config is fetched from `<base>/config.json` on every full page load
- Graph loads `endpoints.graph`; Sankey loads `endpoints.storageGraph`. Both wait for **Query**. Both share the same normalize boundary.
- `/graph` and `/sankey` are independent pages. Switching unmounts the previous page (switch = reset). The URL query is the **applied** scope, written when Query commits. Share it, refresh it, or press Back to restore controls — then press Query to draw. View state (selection, collapse, viewport, search) is not in the URL and dies with the page.
- There are exactly three pages — `/graph`, `/sankey` and `/network/sankey` — each **standalone**: reached by its URL, never from the shell. The nav bar holds the application name, the view time range, the status indicator with Reload, the theme control and (in demo mode) the badge; it links nowhere, and the current page is named by the tab title. `/` redirects to `/graph` and `/network` to `/network/sankey`, both keeping the query; `/network/graph` and every other path show the not-found page. The only in-app navigation between pages is the Storage Sankey's Locate into `/graph` (and Back).
- `/network/sankey` loads `endpoints.trace` on Query and draws it as a conserving trace Sankey (hop boxes with interface slots, other-in / other-out residuals, anchor and trace-stop cards, derived pod → application → namespace cards).
- Below the nav bar each page draws its own control bar. On both Sankeys the scope controls and Query are followed, in the same bar, by the page's **view controls** (mode, layout, legend, …), which wrap beneath the scope controls on a narrow window. Neither Sankey draws a title-bar row or a summary under its chart; focus mode collapses the nav bar and the whole control bar.

## URL parameters

The URL is the applied scope. Filter / scope / time-range edits change a **draft** and write nothing; **Query** commits the draft in one replace (scope plus `from` / `to`). Immediate view values (`mode`, `top_pods`, `min_bps`) also write with replace. A Locate from the Sankey pushes `/graph` with a fresh scope. Demo mode ignores scope parameters but still writes `from` / `to`. Unknown parameters are ignored and stripped on the next write.

### All pages

| Parameter     | Meaning                                                                                                                 | Default               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `from` / `to` | View time range. Relative: `from=now-1h\|now-6h\|now-24h\|now-7d` and `to=now`. Absolute: Unix seconds. Always written. | `from=now-24h&to=now` |

### `/graph`

| Parameter                           | Meaning                                                        | Default          |
| ----------------------------------- | -------------------------------------------------------------- | ---------------- |
| `cluster`, `az`, `env`, `namespace` | Repeated keys = OR within a dimension                          | omitted (all)    |
| `prune`                             | `false` = full inventory. Default traffic graph is not written | omitted (`true`) |

### `/sankey`

| Parameter                                     | Meaning                                                         | Default                                            |
| --------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| `az`, `env`                                   | Required single values                                          | omitted (Query unavailable until both plus a root) |
| `ontap_cluster`, `node`, `aggr`, `svm`, `pod` | Roots; at least one required; `pod` must be `<namespace>/<pod>` | omitted (Query unavailable)                        |
| `cluster`, `namespace`                        | Optional narrowing                                              | omitted                                            |
| `mode`                                        | `read` or `write`. Default `both` is not written                | omitted (`both`)                                   |
| `top_pods`                                    | Client-side Top pods cut. Integer ≥ 1. Not sent to the backend  | omitted (`10`; omitted with a `pod` root)          |

The Sankey draws seven columns, storage → workload: NetApp node, aggregate, SVM, PVC, Pod, Application, Namespace. The last two are **derived** — walked up each pod's `data.parent` chain and summed per direction from that pod's drawn `pvc-pod` weights. Derived values are marked "derived from member pods" in tooltips; they never rewrite a backend-tier weight. A `Layout` control (`Flat` / `Node`) wraps pods in their Kubernetes node under `Node`. That choice is page-transient: it is not a URL parameter, is not persisted, and returns to `Flat` on remount.

An `SVM` control (`Column` / `Group`) switches how SVMs are presented, just as page-transient as `Layout`. `Column` is the default: SVMs are their own card column, as above. `Group` removes that column and wraps each SVM's PVCs into a **frame** in the PVC column instead, with a ribbon running straight from each claim's aggregate to its PVC — the shape that answers "which aggregate is this claim actually on" when one SVM spans several aggregates, which the plain SVM card cannot say. This reads a PVC's **claim aggregate** off `labels.aggr`, a field `kube-state-graph` started stamping on `/v1/storage-graph`'s PVC nodes in its `expose-claim-aggregate` change; a claim with none (a FlexGroup, which has no single aggregate) sits in its frame with no inbound ribbon instead. Against an older backend that stamps no such label at all, `Group` is presented disabled with its reason, and the chart keeps drawing under `Column`.

A root is **required**. The root value dropdown is a multi-select: `node` names come from `endpoints.labelValues`, `pod` names as `<namespace>/<pod>` from the selected namespace narrowing, and storage-side kinds (`ontap_cluster` / `aggr` / `svm`) are typed until a query has drawn them. The drawn body still contributes once a query has run. A typed value is always accepted.

**Top pods** (default 10) keeps the K highest-inflow pods and anything on a path to them. It is client-side, not sent to the backend, unavailable while any `pod` root is present, and written as `top_pods` only when it differs from 10. While the cut hides any pod, the view controls state it as `<shown> of <total> pods`.

Card borders carry `data.status` — the backend's own fold over alert severity, NetApp `health` and Kubernetes readiness — in the same three colours the Graph view borders by, named in the scope bar's legend. Nothing here derives or re-folds it, and a node the backend judges none for (an SVM, say) keeps the neutral border rather than a green one: an absent verdict is not a healthy one. Derived `application` / `namespace` cards keep the **neutral** border. The `Node` layout's wrapper still borders by the worst status among the node and the pods it draws.

The mode selector, `Layout`, `SVM` (with its unavailable reason), the cut statement and the legend (status dots, read / write swatches for the directions the mode draws) sit after Query in the scope bar. There is no numeric summary: every figure is in a card's tooltip, and the derived `application` / `namespace` cards carry the per-group totals in the chart.

A card reads like a trace card: the title, the kind alone on the subtitle (`netapp-aggr · ontap-prod` for the NetApp kinds, `· no flow` for a no-flow root), then one monospace attribute per line — `ns/<namespace>`, `usage <used> / <capacity> (<pct>%)` only when both halves are known, `<n> pods`, and `total <inflow>` on a namespace leaf. Every read / write ribbon ends in a direction chevron drawn by the same `sankey-canvas` primitive the trace uses, fading with its ribbon on hover. In a tooltip the flow rows (`in read`, `out write`, a link's `read: …`, derived rows included) are painted in the colour of the ribbons they sum; every other row is plain.

### `/network/sankey`

`/network` redirects here keeping the query; there is no Network Graph, and `/network/graph` is the not-found page. The controls hold **raw strings**: a missing parameter is the backend default, and a present value that does not parse is **refused, not rewritten** — it stays in the URL and the draft, the scope bar names the problem, and Query is disabled until it is edited into something valid. No request is ever assembled from an invalid or empty value.

| Parameter   | Meaning                                                                                              | Default                     |
| ----------- | ---------------------------------------------------------------------------------------------------- | --------------------------- |
| `hostname`  | The start switch. Required. Typed until a query has drawn switches, then offered from the drawn body | omitted (Query unavailable) |
| `max_hops`  | How many interface hops to follow. Integer ≥ 1                                                       | omitted (`7`)               |
| `top_n`     | How many of each hop's busiest interfaces to follow. Integer ≥ 1                                     | omitted (`3`)               |
| `threshold` | Contribution floor in percent of the hop's delta, `0`–`100`                                          | omitted (`10`)              |
| `track_dir` | `source` (walk upstream, start hop rightmost) or `destination` (walk downstream, start hop leftmost) | omitted (`source`)          |
| `min_bps`   | Client-side display floor in bits/s; ribbons at or below it fold into the residuals. Not sent        | omitted (`0`, show all)     |

The first five are sent to `endpoints.trace` on Query, defaults spelled out, with the view time range as `from_ts` / `to_ts` in epoch milliseconds. `min_bps` is a view value like `top_pods`: changing it redraws and writes the URL without a request. `Group` (`None` / `Cluster`) and `Order` (`Flow` / `Barycenter`) are page-transient, as `Layout` is on the storage Sankey. All of them sit after Query in the trace scope bar, with the `Min Δ` readout and `Clear`, the hidden-ribbons pill, a warnings pill (its count on the pill, every message on hover or focus) and the legend. No card is clickable: the card search frames a card within the chart instead.

The Network Sankey is three **bands**, left to right under a `destination` trace (mirrored under `source`, so packets always flow left → right): the **switch** band (`Trace start`, `Hop 1`, `Hop 2`, … — laid out by longest path, with `labels.tier` locking same-tier switches into one column), the **k8s** band with fixed columns `k8s node` → `pod` → `application` → `namespace` (a column no card needs is dropped), and the **owner** band. Every non-k8s trace stop — a host, a router, a neighbourless port with its clients table — sits in the k8s band's last column **below** the k8s cards, so that column reads `namespace / client` (or `client` when nothing on the chart is Kubernetes). Inside every column the cards are ordered by the amount on the traced side (inbound under `destination`, outbound under `source`), largest on top, with the k8s cards and the client cards sorted as two separate stacks; pods and applications of one namespace stay together.

## Linting & testing

```sh
npm run lint
npm run typecheck
npm run test        # vitest watch
npm run test:ci     # once, with coverage
npm run e2e         # Playwright, starts the dev server
make check          # lint + typecheck + fixture:check + test:ci
```

`package.json` pins `nwsapi` to `2.2.20` through `overrides`. It is jsdom's selector engine, and
from `2.2.21` its `:modal` / `:fullscreen` handling calls back into `Element.matches`, which
re-enters the same handler — an unbounded mutual recursion that only stops when the stack
overflows and the `try`/`catch` swallows it. Floating UI asks `element.matches(':modal')` on
every reposition, so every Radix popover in the suite (`ScopeSelect`, and so `FilterBar`,
`SankeyScopeBar` and `AppShell`) paid ~1.7s per open — under 5s locally, well over it on a
two-core CI runner, where the tests timed out rather than failed. Do not lift the pin without
re-running `npm run test:ci` and checking the suite still finishes in seconds.

## Build & deploy

```sh
npm run build       # typecheck then vite build → dist/
make image IMAGE=ghcr.io/<owner>/kube-state-graph-frontend:local
```

The default build serves from `/`. To serve under a sub-path, build with a matching base —
`npm run build -- --base=/ksg/` — and serve `dist/` under that prefix. Routing, assets and
`config.json` all resolve against `import.meta.env.BASE_URL`, so `/ksg/sankey` is a working
deep link with no further configuration.

See `deploy/README.md` for Kubernetes manifests, ConfigMap mounting, and the optional `KSG_API_PROXY_TARGET` reverse proxy.

### Image hygiene

The runtime base is `nginx-unprivileged:*-alpine-slim`, pinned by digest in the `Dockerfile`, and
the `image` workflow runs Trivy against the freshly built image before anything is pushed: a
vulnerability with a fix available fails the job at any severity. Dependabot bumps both base
digests weekly, which is what keeps the pin from drifting back into CVEs. Reproduce the gate
locally with `make scan` (needs `trivy`), and accept a known finding by adding its CVE id to a
`.trivyignore` at the repository root — with a comment saying why.

Every workflow action is pinned by full commit SHA, because a tag can be force-pushed to new
code after review; Dependabot moves those pins weekly as well. Workflow tokens are
least-privilege: pull-request builds get a read-only token, and only the job that pushes to the
registry holds `packages: write`. At runtime the web server sends a Content-Security-Policy and
framing / referrer headers from `docker/security-headers.conf`.

## Troubleshooting

- **Dev server port in use** — Vite will pick the next port; open the URL it prints.
- **`fixture:check` fails** — run `npm run fixture:build` after editing `showcaseGraph.ts`, `showcaseStorageGraph.ts` or `showcaseTrace.ts`.
- **CORS errors with an absolute backend URL** — use `KSG_DEV_PROXY_TARGET` (or the container proxy) and root-relative endpoints, or allow the frontend origin on the backend.
- **Full-screen configuration error** — `config.json` is missing, not JSON, or failed validation (for example `endpoints.graph` is required when `demoMode` is false). The screen names the path and the first problem; it never silently falls back to demo data.
- **Sankey says the storage graph endpoint is not configured** — `endpoints.storageGraph` is missing or empty. Graph view is unaffected. Set a URL (for example `/api/v1/storage-graph` or `/demo/storage-graph.json`) and reload.
- **Sankey asks for one az, one env and a root** — `/v1/storage-graph` requires a single `az`, a single `env` and at least one root. Query is unavailable until all three are present. The controls are independent of the Graph filter bar. If `endpoints.labelValues` is unset they still accept a typed custom value; if it is set but points at the graph API, every dropdown comes up empty — label values need a Prometheus-compatible upstream (`KSG_METRICS_PROXY_TARGET`, see `deploy/README.md`).
- **Network says the trace endpoint is not configured** — `endpoints.trace` is missing or empty. Storage Graph and Sankey are unaffected. Set a URL (for example `/api/v1/trace` or `/demo/trace.json`) and reload.
- **Query disabled: hostname required / invalid value from the link** — the Network scope needs a start switch, and a `max_hops`, `top_n`, `threshold` or `track_dir` that arrived unusable in the URL is kept as it came rather than corrected. The reason beside Query names the field; type a valid value (or clear it for the default) and Query returns. The link itself keeps the bad value until the next commit.
- **A request was refused and the error names a reason** — a non-2xx answer carrying a JSON `reason` is shown verbatim after the status (`GET /api/v1/trace failed: 400 — unknown hostname "sw-nope"`), because the sentence the backend wrote says what the status code cannot. A body that is not JSON, or names no reason, leaves the status line as it is.
- **The trace draws with no anchor card** — the response named no investigated interface. The drawing is still valid: the direction is the `track_dir` that was asked for, and the warnings pill says so.
- **Nothing draws after opening a link** — press **Query**. A deep link, a refresh and a route switch prefill the draft and wait.
- **az / env empty with renamed labels** — set `KSG_AZ_LABEL` / `KSG_ENV_LABEL` on the front door to the same values as the backend's `--az-label` / `--env-label`. The app still requests logical `az` / `env`.
