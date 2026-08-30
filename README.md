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

The single source of demo data is `src/shared/fixtures/showcaseGraph.ts` (`SHOWCASE_GRAPH`).

```sh
npm run fixture:build   # writes public/demo/graph.json
npm run fixture:check   # fails if that file drifted
```

`public/demo/graph.json` is generated. Do not hand-edit it.

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
- Graph and Sankey share one normalized graph loaded by the app shell

## Linting & testing

```sh
npm run lint
npm run typecheck
npm run test        # vitest watch
npm run test:ci     # once, with coverage
npm run e2e         # Playwright, starts the dev server
make check          # lint + typecheck + fixture:check + test:ci
```

## Build & deploy

```sh
npm run build       # typecheck then vite build → dist/
make image IMAGE=ghcr.io/<owner>/kube-state-graph-frontend:local
```

See `deploy/README.md` for Kubernetes manifests, ConfigMap mounting, and the optional `KSG_API_PROXY_TARGET` reverse proxy.

## Troubleshooting

- **Dev server port in use** — Vite will pick the next port; open the URL it prints.
- **`fixture:check` fails** — run `npm run fixture:build` after editing `showcaseGraph.ts`.
- **CORS errors with an absolute backend URL** — use `KSG_DEV_PROXY_TARGET` (or the container proxy) and root-relative endpoints, or allow the frontend origin on the backend.
- **Full-screen configuration error** — `config.json` is missing, not JSON, or failed validation (for example `endpoints.graph` is required when `demoMode` is false). The screen names the path and the first problem; it never silently falls back to demo data.
