# Deploying kube-state-graph-frontend

## Prerequisites

- A Kubernetes cluster and `kubectl`
- An image registry your cluster can pull from (default: GitHub Container Registry)

`config.json` is **publicly readable**. Do not put secrets in it.

The front door carries **no authentication**: anyone who can reach it sees the whole topology the backend serves — pod names, IPs, container images, alerts. The sample Service is `ClusterIP`; if you publish it through an Ingress, put an authenticating proxy in front of it.

## Image tags

CI publishes to `ghcr.io/<owner>/kube-state-graph-frontend`:

- push to `main` → `main` and `sha-<short>`
- tag `vX.Y.Z` → `X.Y.Z` and `latest`

`main` moves on every push, which is why the sample Deployment pulls with `imagePullPolicy: Always`. To pin an exact build, replace `newTag:` in `kustomization.yaml` with the image's `digest:` (`docker buildx imagetools inspect ghcr.io/<owner>/kube-state-graph-frontend:<tag>` prints it); with a digest, `IfNotPresent` is safe again.

## Apply

```sh
kubectl apply -k deploy/
# or
make deploy IMAGE=ghcr.io/<owner>/kube-state-graph-frontend:sha-<short>
```

The ConfigMap is mounted as a **directory** at `/srv/config` (not `subPath`). Editing the ConfigMap updates the file after kubelet's propagation delay; reload the browser to pick it up. The Pod does not need to restart.

## Config

Mounted file: `/srv/config/config.json`, served at `/config.json` with `Cache-Control: no-store`.

The sample ConfigMap ships `demoMode: true` so a cluster without a backend still renders the showcase graph.

To talk to a real backend, either:

1. Set `KSG_API_PROXY_TARGET` on the container (see the commented env in `deployment.yaml`) and keep root-relative endpoints such as `/api/v1/graph/service_graph`, or
2. Use absolute `https://…` URLs and allow the frontend origin in the backend CORS policy.

`endpoints.labelValues` is a **second** upstream, not the graph API: the controls read `<base>/api/v1/label/<name>/values?match[]=kube_pod_info`, which the graph API does not serve — pointing it at `/api` returns 404 and the az / env and filter dropdowns come up empty. Set `KSG_METRICS_PROXY_TARGET` to a Prometheus-compatible root (Prometheus, Thanos Query, VictoriaMetrics `vmselect`) and keep `"labelValues": "/metrics-api"`, or use an absolute URL with CORS.

The metrics proxy forwards **only** `/metrics-api/api/v1/label/…`; every other path under `/metrics-api/` is a `404`, so the store's `query`, `query_range`, `series` and `export` APIs stay unreachable through the front door. Both proxies forward `GET` / `HEAD` only (anything else is a `403`), and `/api/metrics` — the backend's own Prometheus registry — is never forwarded. A target must be a bare `http(s)://` URL: one carrying whitespace, `;`, braces, quotes or `$` stops the container at start instead of being pasted into the server config.

`KSG_AZ_LABEL` and `KSG_ENV_LABEL` (defaults `az` / `env`) rebind those two logical dimensions at the front door: `/metrics-api/api/v1/label/az/values` is forwarded to `<target>/api/v1/label/<KSG_AZ_LABEL>/values` (and `env` alike), query string preserved. They must match the backend's `--az-label` / `--env-label`. The app never sees the upstream names — it keeps requesting `az` / `env` and sending `?az=` / `?env=`. A mismatch shows up as `az` / `env` controls listing values the backend then matches nothing against. Each variable must be a PromQL label name and the two must differ; an invalid or colliding value stops the container before serving, even when `KSG_METRICS_PROXY_TARGET` is unset.

If the metrics store needs credentials, do not put them in `config.json` (it is publicly readable) — mount a replacement `nginx.conf` that attaches the header in-cluster, on the label location only.

## Health

`GET /healthz` returns `200` and does not depend on config or the backend. Liveness and readiness probes use it.

## Web server config

Image path: `/etc/nginx/nginx.conf`. Override by mounting a replacement file if you need extra server behaviour. A replacement must keep two things the sample relies on:

- `include /etc/nginx/security-headers.conf;` in every `location` that sets its own `add_header` — nginx does not inherit headers into such a block. That file carries the `Content-Security-Policy` (scripts from the page's own origin only, no framing; `connect-src` admits any http(s) origin so absolute endpoint URLs keep working), `X-Frame-Options: DENY`, `Referrer-Policy: same-origin` and `X-Content-Type-Options: nosniff`.
- `pid` and every `*_temp_path` under `/tmp`: the sample runs with `readOnlyRootFilesystem: true`, and `/tmp` is its only writable mount.

## Verify without a backend

1. Apply unmodified `deploy/` (`demoMode: true`).
2. `kubectl port-forward svc/kube-state-graph-frontend 8080:80` and open the app — you should see the showcase graph and a Demo badge.
3. Optionally set `demoMode: false` and `endpoints.graph: "/demo/graph.json"` (and `endpoints.storageGraph: "/demo/storage-graph.json"`, `endpoints.trace: "/demo/trace.json"`) to exercise the real fetch path against the image's bundled payloads. `/demo/graph.json`, `/demo/storage-graph.json` and `/demo/trace.json` are served with `Cache-Control: no-cache`. The trace payload is one `destination` trace merged from the sankey-panel samples, starting at `dci-uturn/core-1`: open `/network/sankey?hostname=dci-uturn%2Fcore-1&track_dir=destination` and press Query.

`endpoints.storageGraph` is optional. When it is absent, Sankey shows an unconfigured notice and does not fetch; Graph is unchanged. `endpoints.trace` is optional in the same way: without it the Network Sankey (`/network/sankey`) stays reachable, shows a not-configured notice and fetches nothing, while the Storage pages are unaffected. It rides the same `KSG_API_PROXY_TARGET` proxy as `graph` (the sample uses `/api/v1/trace`). `endpoints.labelValues` feeds both the Graph filter bar and Sankey's single-value az/env selectors. It is optional too: without it every identity dropdown comes up empty but stays usable, because those dimensions accept a typed custom value — they reach the upstream PromQL as raw label matchers. That matters most for Sankey's az/env, which the storage-graph endpoint requires.
