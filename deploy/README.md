# Deploying kube-state-graph-frontend

## Prerequisites

- A Kubernetes cluster and `kubectl`
- An image registry your cluster can pull from (default: GitHub Container Registry)

`config.json` is **publicly readable**. Do not put secrets in it.

## Image tags

CI publishes to `ghcr.io/<owner>/kube-state-graph-frontend`:

- push to `main` → `main` and `sha-<short>`
- tag `vX.Y.Z` → `X.Y.Z` and `latest`

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

## Health

`GET /healthz` returns `200` and does not depend on config or the backend. Liveness and readiness probes use it.

## Web server config

Image path: `/etc/nginx/nginx.conf`. Override by mounting a replacement file if you need extra server behaviour.

## Verify without a backend

1. Apply unmodified `deploy/` (`demoMode: true`).
2. `kubectl port-forward svc/kube-state-graph-frontend 8080:80` and open the app — you should see the showcase graph and a Demo badge.
3. Optionally set `demoMode: false` and `endpoints.graph: "/demo/graph.json"` to exercise the real fetch path against the image's bundled payload.
