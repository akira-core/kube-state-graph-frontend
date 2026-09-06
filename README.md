# kube-state-graph-frontend

Standalone SPA for the kube-state-graph topology: a cytoscape Graph view plus a storage-flow Sankey view. No Grafana, no backend required for local demo.

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

Demo data is two fixtures, one per graph endpoint:

- `src/shared/fixtures/showcaseGraph.ts` (`SHOWCASE_GRAPH`) → `GET /v1/graph`
- `src/shared/fixtures/showcaseStorageGraph.ts` (`SHOWCASE_STORAGE_GRAPH`) → `GET /v1/storage-graph`

```sh
npm run fixture:build   # writes public/demo/graph.json and public/demo/storage-graph.json
npm run fixture:check   # fails if either file drifted
```

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
    "graph": "/api/v1/graph/service_graph"
  }
}
```

Requests to `/api/…` are forwarded to `KSG_DEV_PROXY_TARGET` with the `/api` prefix stripped.

## Architecture

- `src/features/*` — feature folders (barrel imports only across features)
- `src/shared/*` — tokens, wire types, fixtures, pure helpers
- Runtime config is fetched from `<base>/config.json` on every full page load
- Graph loads `endpoints.graph`; Sankey loads `endpoints.storageGraph` (lazy, after az/env are chosen). Both share the same normalize boundary.
- `/graph` and `/sankey` are independent pages. Switching unmounts the previous page (switch = reset). The URL query is the snapshot: share it, refresh it, or press Back to restore scope and time range. View state (selection, collapse, viewport, search) is not in the URL and dies with the page.

## URL parameters

In-page changes replace the current history entry. Nav links go to the bare path (`/graph`, `/sankey`). Demo mode ignores scope parameters but still writes `from` / `to`. Unknown parameters are ignored and stripped on the next write.

### Both pages

| Parameter     | Meaning                                                                                                                 | Default               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `from` / `to` | View time range. Relative: `from=now-1h\|now-6h\|now-24h\|now-7d` and `to=now`. Absolute: Unix seconds. Always written. | `from=now-24h&to=now` |

### `/graph`

| Parameter                           | Meaning                                                        | Default          |
| ----------------------------------- | -------------------------------------------------------------- | ---------------- |
| `cluster`, `az`, `env`, `namespace` | Repeated keys = OR within a dimension                          | omitted (all)    |
| `edge_type`                         | Edge-type filter; no custom values                             | omitted          |
| `prune`                             | `false` = full inventory. Default traffic graph is not written | omitted (`true`) |

### `/sankey`

| Parameter                                     | Meaning                                          | Default                                 |
| --------------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| `az`, `env`                                   | Required single values                           | omitted (no request until both are set) |
| `ontap_cluster`, `node`, `aggr`, `svm`, `pod` | Roots; `pod` must be `<namespace>/<pod>`         | omitted (whole estate)                  |
| `cluster`, `namespace`                        | Optional narrowing                               | omitted                                 |
| `mode`                                        | `read` or `write`. Default `both` is not written | omitted (`both`)                        |

The Sankey draws seven columns, storage → workload: NetApp node, aggregate, SVM, PVC, Pod, Application, Namespace. The last two are **derived** — walked up each pod's `data.parent` chain and summed per direction from that pod's drawn `pvc-pod` weights. Derived values are marked "derived from member pods" in tooltips and tables; they never rewrite a backend-tier weight. A `Layout` control (`Flat` / `Node`) wraps pods in their Kubernetes node under `Node`. That choice is page-transient: it is not a URL parameter, is not persisted, and returns to `Flat` on remount.

The root value dropdown offers the names the **currently drawn body** carries for the selected kind — nothing enumerates aggregate / SVM / ONTAP-cluster names, and `endpoints.labelValues` reaches only the store holding `kube_pod_info`, which carries none of them. With no root applied that body is the whole estate, so the list starts complete; applying a root narrows the response and therefore the list, which is why a typed value is still accepted. Clear the root to get the full list back.

Card borders carry `data.status` — the backend's own fold over alert severity, NetApp `health` and Kubernetes readiness — in the same three colours the Graph view borders by, named in the toolbar. Nothing here derives or re-folds it, and a node the backend judges none for (an SVM, say) keeps the neutral border rather than a green one: an absent verdict is not a healthy one. A card that hides others — `application`, `namespace`, and the `Node` layout's wrapper — borders by the worst status among its members, like a collapsed container in the Graph view.

The numeric summary below the chart is **folded on arrival** and its header strip names the row counts; seven tiers of tables otherwise take about half the column from the diagram. Opening it is page-transient like `Layout`, and does not move the zoom / pan viewport — press `0` (Fit) after expanding if you want the chart refitted to what is left.

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

## Troubleshooting

- **Dev server port in use** — Vite will pick the next port; open the URL it prints.
- **`fixture:check` fails** — run `npm run fixture:build` after editing `showcaseGraph.ts`.
- **CORS errors with an absolute backend URL** — use `KSG_DEV_PROXY_TARGET` (or the container proxy) and root-relative endpoints, or allow the frontend origin on the backend.
- **Full-screen configuration error** — `config.json` is missing, not JSON, or failed validation (for example `endpoints.graph` is required when `demoMode` is false). The screen names the path and the first problem; it never silently falls back to demo data.
- **Sankey says the storage graph endpoint is not configured** — `endpoints.storageGraph` is missing or empty. Graph view is unaffected. Set a URL (for example `/api/v1/storage-graph` or `/demo/storage-graph.json`) and reload.
- **Sankey asks for one az and one env** — `/v1/storage-graph` requires a single `az` and a single `env`. The controls are independent of the Graph filter bar. If `endpoints.labelValues` is unset they still accept a typed custom value; if it is set but points at the graph API, every dropdown comes up empty — label values need a Prometheus-compatible upstream (`KSG_METRICS_PROXY_TARGET`, see `deploy/README.md`).
