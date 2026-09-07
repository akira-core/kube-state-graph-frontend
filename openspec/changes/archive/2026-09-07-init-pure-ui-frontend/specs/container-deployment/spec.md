## Purpose

Defines the contract for deploying kube-state-graph-frontend to Kubernetes as a container: a multi-stage `Dockerfile` producing an image holding only static assets and a static web server, SPA history fallback routing, `config.json` injected by a ConfigMap mount and forbidden from caching, static asset cache headers, a health check endpoint, an optional same-origin reverse proxy, `deploy/` manifests, and CI image build and push. Every clause is described as behavior an operator can verify from the image or from outside the cluster.

## ADDED Requirements

### Requirement: Multi-stage Dockerfile and minimal image

The repo root SHALL provide a `Dockerfile` that produces the image with a multi-stage build: the build stage runs `npm ci` and `npm run build` on Node 22 (including type checking; a type error MUST fail the image build); the final stage SHALL host a static web server on a small base image and copy only the contents of `dist/`. The final image MUST NOT contain a Node.js runtime, `npm`, `node_modules`, source code, or any intermediate product of the build stage. `.dockerignore` MUST exclude `node_modules`, `dist`, `.git`, and test output directories.

`docker build -t <image> .` on a clean checkout MUST succeed without any build arg, credential, or prior `npm install`.

#### Scenario: Build the image directly from a clean checkout

- **WHEN** `docker build -t ksg-frontend:test .` is run on a clean checkout where `npm install` has never been run
- **THEN** the build succeeds, and `docker run --rm --entrypoint sh ksg-frontend:test -c 'command -v node || command -v npm'` finds neither

#### Scenario: Final image contains no source code

- **WHEN** inspecting the output of `docker run --rm --entrypoint sh ksg-frontend:test -c 'ls /'` and the contents of the static root
- **THEN** only the `dist/` output and the web server itself exist; `src/`, `node_modules/`, `package.json`, or `vite.config.ts` are not found

### Requirement: Non-root execution and process lifecycle

The final image SHALL run as a non-root user with a **numeric** UID (the `USER` instruction is numeric, so Kubernetes `runAsNonRoot` can verify it at admission) and listen for HTTP on the unprivileged port `8080`. The web server process SHALL be PID 1 or forward signals correctly, and MUST exit within 10 seconds of receiving `SIGTERM`. Building and running the image MUST NOT require any secret.

#### Scenario: Non-root with numeric UID

- **WHEN** `docker inspect --format '{{.Config.User}}' ksg-frontend:test` is run
- **THEN** the output is a purely numeric UID other than `0` (optionally with `:GID`)

#### Scenario: Stops promptly after SIGTERM

- **WHEN** the container is started with `docker run -d -p 8080:8080 ksg-frontend:test` and then `docker stop` is run
- **THEN** the container exits within 10 seconds, and `docker stop` does not wait until the forced-kill timeout

### Requirement: SPA history fallback routing

The static web server SHALL answer every request by the following rules:

- When the path maps to a file that actually exists in `dist/`, return that file.
- When the path is outside `/assets/`, `/api/`, `/healthz`, `/config.json` and has no corresponding file, return `index.html` with `200`, so that the client-side routes `/graph`, `/sankey`, and their sub-paths can be deep-linked or refreshed directly.
- A file that does not exist under `/assets/` MUST return `404` and must not be impersonated by `index.html` — an asset referenced by a stale bundle must surface as an explicit error, not be loaded as HTML in place of JavaScript.

#### Scenario: Deep link to a client-side route

- **WHEN** `GET /sankey` and `GET /graph?focus=pod-a` are requested from the running container
- **THEN** both return `200`, the body is the content of `index.html`, and `Content-Type` is `text/html`

#### Scenario: Nonexistent asset returns 404

- **WHEN** `GET /assets/does-not-exist.js` is requested
- **THEN** the response is `404`, and the body is not `index.html`

### Requirement: Mounting and serving the runtime configuration file

The static web server SHALL map `GET /config.json` to the in-container path `/srv/config/config.json`; that path is the documented mount point, and in a Kubernetes deployment a ConfigMap is mounted as a **directory** at `/srv/config` (MUST NOT use `subPath`, otherwise ConfigMap updates do not propagate to the Pod).

The `/config.json` response MUST carry `Cache-Control: no-store` and `Content-Type: application/json`, so that a configuration change takes effect on the next page load, unaffected by browser or intermediary caches. When the file does not exist it MUST return `404` (app behavior when configuration is missing is governed by the `runtime-config` capability). `dist/` itself MUST NOT contain `config.json`, so the image has no built-in configuration and one image serves every environment.

`config.json` is publicly readable by every browser; the documentation MUST state explicitly that it MUST NOT hold any secret.

#### Scenario: Mounted configuration is served with no-store

- **WHEN** the container is started with `docker run -v $PWD/config.json:/srv/config/config.json -p 8080:8080` and `GET /config.json` is requested
- **THEN** the response is `200`, the body is byte-for-byte identical to the mounted file, and the headers include `Cache-Control: no-store` and `Content-Type: application/json`

#### Scenario: Returns 404 when no configuration is mounted

- **WHEN** the container is started without mounting any file and `GET /config.json` is requested
- **THEN** the response is `404`, not `index.html`

#### Scenario: ConfigMap changes do not require a Pod restart

- **WHEN** the `config.json` content is changed with `kubectl edit configmap`, and the page is refreshed after waiting for the kubelet's ConfigMap propagation delay
- **THEN** `GET /config.json` returns the new content, the app operates on the new configuration, and the Pod was not restarted in the meantime

### Requirement: Cache and content negotiation headers

The static web server SHALL set the cache policy by resource type:

- Content-hash-named files under `/assets/` MUST carry `Cache-Control: public, max-age=31536000, immutable`.
- `index.html` (including fallback responses) and other non-hash-named static files (such as `/demo/graph.json`, `/demo/storage-graph.json`) MUST carry `Cache-Control: no-cache`, so the browser revalidates after each new deployment.
- Every response MUST carry the correct `Content-Type` (`.js` as the JavaScript MIME type, `.json` as `application/json`, `.svg` as `image/svg+xml`), otherwise ES modules cannot load; and MUST carry `X-Content-Type-Options: nosniff`.
- Text resources (HTML, JavaScript, CSS, JSON, SVG) MUST be returned with a compressed encoding when the client declares support via `Accept-Encoding`, and carry `Vary: Accept-Encoding`.

#### Scenario: Hashed assets cached long-term, index.html revalidated

- **WHEN** any `/assets/*.js` referenced by `index.html` and `GET /` are requested
- **THEN** the former's headers include `Cache-Control: public, max-age=31536000, immutable`, and the latter's include `Cache-Control: no-cache`

#### Scenario: Compressed transfer

- **WHEN** the largest `/assets/*.js` is requested with `Accept-Encoding: gzip`
- **THEN** the response carries `Content-Encoding: gzip` (or `br`) and `Vary: Accept-Encoding`

### Requirement: Health check endpoint

The static web server SHALL provide `GET /healthz`, responding `200` with a very short plain-text body and `Cache-Control: no-store`. This endpoint MUST reflect only that the web server itself can serve, MUST NOT depend on whether `/srv/config/config.json` exists or whether any backend is reachable, and MUST NOT fall into the SPA fallback. The Deployment in `deploy/` SHALL use this endpoint as the liveness and readiness probe.

#### Scenario: Health check still passes with no configuration and no backend

- **WHEN** the container is started without mounting configuration and without setting any proxy target, and `GET /healthz` is requested
- **THEN** the response is `200`, `Content-Type` is `text/plain`, and the body is not `index.html`

### Requirement: Optional same-origin reverse proxy

The static web server SHALL support enabling a same-origin reverse proxy via the environment variable `KSG_API_PROXY_TARGET` (for example `http://kube-state-graph.monitoring.svc:8080`): when set, requests under the `/api/` prefix MUST be forwarded to that target with the `/api` prefix stripped (`/api/v1/graph` → `<target>/v1/graph`, `/api/dashboard` → `<target>/dashboard`), the path and query string preserved as-is, and the response status code, headers, and body returned as-is and MUST NOT be cached by the web server. This lets operators use root-relative endpoints (`/api/v1/graph`) in `config.json` and avoid CORS configuration. This feature is **optional**: when `KSG_API_PROXY_TARGET` is not set, requests under `/api/` MUST return `404` rather than `index.html`, so a misconfiguration surfaces as an explicit HTTP error rather than a JSON parse failure inside the app.

The web server SHALL additionally support a **second**, independent environment variable `KSG_METRICS_PROXY_TARGET`, proxying the `/metrics-api/` prefix by exactly the same rules to a **Prometheus-compatible** upstream (`/metrics-api/api/v1/label/az/values` → `<target>/api/v1/label/az/values`), likewise returning `404` when not set.

The two upstreams **cannot** be merged into one: `endpoints.labelValues` reads `<base>/api/v1/label/<name>/values`, a path the graph API does not provide. Pointing `labelValues` at `/api` yields a 404, and what a 404 looks like in the UI is a set of identity dimension controls that list no options — indistinguishable from "this estate has no pods".

Operators who need server behavior beyond this scope (for example, the metrics store requires credentials, which the publicly readable `config.json` must not carry) SHALL be able to override the web server's configuration file inside the image by mounting; the in-container path of that configuration file MUST be recorded in `deploy/README.md`.

#### Scenario: Enable the proxy via environment variable

- **WHEN** the backend serves `GET /v1/graph` at `http://backend:8080`, the container is started with `KSG_API_PROXY_TARGET=http://backend:8080`, and `GET /api/v1/graph?cluster=a` is requested
- **THEN** the backend receives `GET /v1/graph?cluster=a`, the client receives the same status code and body as the backend, and the response origin is the same as the app's

#### Scenario: /api/ returns 404 when the proxy is not enabled

- **WHEN** the container is started without `KSG_API_PROXY_TARGET` set, and `GET /api/v1/graph` is requested
- **THEN** the response is `404`, and the body is not `index.html`

#### Scenario: label values go through the second upstream

- **WHEN** the container is started with `KSG_API_PROXY_TARGET=http://backend:8080` and `KSG_METRICS_PROXY_TARGET=http://vmselect:8481/select/0/prometheus`, and `GET /metrics-api/api/v1/label/az/values?match%5B%5D=kube_pod_info` is requested
- **THEN** vmselect receives `GET /api/v1/label/az/values?match[]=kube_pod_info`, and the backend receives no request
- **AND** when only `KSG_API_PROXY_TARGET` is set, the same request returns `404` rather than being forwarded to the graph API, which does not provide that path

### Requirement: Kubernetes manifests

`deploy/` SHALL contain `kustomization.yaml` and the `deployment.yaml`, `service.yaml`, `configmap.yaml` it references, applicable with `kubectl apply -k deploy/`; each file MUST also be a valid manifest applicable on its own, so that `kubectl apply -f deploy/` also works. The manifests MUST NOT hardcode a namespace.

- **Deployment** SHALL: reference the image published by CI; declare container port `8080` (named `http`); configure liveness and readiness probes with `GET /healthz`; declare CPU / memory `requests` and `limits`; mount the ConfigMap as a directory at `/srv/config`; comply with the Pod Security Standards `restricted` profile (`runAsNonRoot: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `seccompProfile.type: RuntimeDefault`); and demonstrate in comments how to set `KSG_API_PROXY_TARGET` and `KSG_METRICS_PROXY_TARGET`, and the comments MUST explain that the two are different upstreams.
- **Service** SHALL be `ClusterIP`, with port `80` mapped to targetPort `http`. Ingress and TLS are provided by cluster operations and are outside the scope of this capability.
- **ConfigMap** SHALL carry a **complete** example configuration under the key `config.json`: every documented key appears (`endpoints.graph`, `endpoints.storageGraph`, `endpoints.labelValues`, `endpoints.edgeTypes`, `endpoints.codeChanges`, `endpoints.configChanges`, `endpoints.dashboard`, `demoMode`, `refreshIntervalSeconds`, `defaultLayout`, `theme`), `demoMode` defaults to `true`, and endpoints are demonstrated in root-relative form. Example values MUST point at the prefix where that endpoint is **actually served**: graph API endpoints go through `/api/...`, while `endpoints.labelValues` MUST be `/metrics-api` — the example is meant to be copied verbatim, and an example value that 404s is equivalent to being broken by default.

The image reference SHALL be overridable via the `images:` section of `kustomization.yaml`; the `Makefile` SHALL provide `image` (`docker build`), `image-push`, and `deploy` (apply the manifests) targets, all specifying the image reference via the documented variable `IMAGE=<registry>/<repo>:<tag>`.

#### Scenario: Unmodified manifests can be applied directly

- **WHEN** `kubectl apply -k deploy/` is run in any namespace
- **THEN** the Deployment, Service, and ConfigMap are all created, the Pod is `Ready` within 30 seconds, and `kubectl get deploy -o yaml` shows the liveness / readiness probes and resources all set

#### Scenario: Complies with the restricted Pod Security standard

- **WHEN** `deploy/` is applied in a namespace labeled `pod-security.kubernetes.io/enforce: restricted`
- **THEN** the Pod is accepted by admission and enters `Running`, with no PodSecurity warnings

#### Scenario: Override the image via variable

- **WHEN** `make deploy IMAGE=registry.example/ksg-frontend:1.2.3` is run
- **THEN** the created Deployment's container image is `registry.example/ksg-frontend:1.2.3`

### Requirement: Starts in demo mode without a backend

Image startup and readiness MUST NOT depend on any backend being reachable: the container performs no connectivity check at startup, and readiness looks only at `/healthz`. When the ConfigMap's `config.json` sets `demoMode: true` and there is no kube-state-graph backend anywhere in the cluster, the app MUST fully render the showcase graph after applying the unmodified `deploy/`. The image SHALL also serve the two example payloads from `dist/` at `<base>/demo/graph.json` and `<base>/demo/storage-graph.json`, so that `endpoints.graph: "/demo/graph.json"`, `endpoints.storageGraph: "/demo/storage-graph.json"`, `demoMode: false` can walk both real fetch paths in a cluster without a backend, as a post-deployment smoke test.

#### Scenario: Cluster without a backend shows the demo directly

- **WHEN** there is no backend in the cluster, `kubectl apply -k deploy/` is run, and a browser is opened via `kubectl port-forward`
- **THEN** `GET /config.json` returns `demoMode: true`, the page renders the complete showcase graph, and the Pod logs show no outbound connection errors

#### Scenario: Verify the fetch path with the example payload

- **WHEN** the ConfigMap is changed to `demoMode: false`, `endpoints.graph: "/demo/graph.json"`, and the page is refreshed after waiting for propagation
- **THEN** `GET /demo/graph.json` returns `200` with a body that is valid JSON, and the app fetches it over HTTP and renders the same graph as in demo mode

### Requirement: CI builds and pushes the image

A GitHub Actions workflow SHALL, on every push to `main` and every `v*` tag, build the image with the repo's `Dockerfile` and push it to the documented registry, defaulting to GitHub Container Registry (`ghcr.io/<owner>/kube-state-graph-frontend`); pull requests SHALL only build without pushing, to verify the `Dockerfile`. Pushing MUST use only the credentials the CI platform provides by default, requiring no manually created secret.

Image tags SHALL be: on push to `main`, `main` and `sha-<short-sha>`; on tag `vX.Y.Z`, `X.Y.Z` and `latest`. The image MUST carry the OCI labels `org.opencontainers.image.source` and `org.opencontainers.image.revision` (corresponding to the commit SHA). `deploy/README.md` MUST explain how to pin a deployed version with these tags.

#### Scenario: Image is pullable after a push to main

- **WHEN** a commit is pushed to `main` and the workflow completes
- **THEN** `docker pull ghcr.io/<owner>/kube-state-graph-frontend:sha-<short-sha>` succeeds, and `docker inspect` shows `org.opencontainers.image.revision` equal to that commit SHA

#### Scenario: PR only builds without pushing

- **WHEN** a pull request containing `Dockerfile` changes is opened
- **THEN** the workflow runs the image build and reports the result, and no new tag appears in the registry

### Requirement: Deployment documentation

`deploy/README.md` SHALL record: prerequisites (an available cluster and `kubectl`), the image registry and tag rules, the apply commands (`kubectl apply -k deploy/` and `make deploy IMAGE=...`), the `config.json` mount path `/srv/config/config.json` and the "publicly readable, must not contain secrets" warning, the usage of `KSG_API_PROXY_TARGET` and `KSG_METRICS_PROXY_TARGET`, the reason the two are different upstreams, and the CORS trade-off (root-relative endpoints + proxy, or absolute URLs + backend allowing the frontend origin), the path for overriding the web server configuration file, the `/healthz` endpoint, how changes take effect after editing the ConfigMap and the propagation delay, how to upgrade the image tag, and the steps to verify a deployment with `demoMode: true` and `/demo/graph.json`.

#### Scenario: Operator completes deployment and verification from the documentation alone

- **WHEN** an operator who has never touched this project follows only `deploy/README.md`
- **THEN** they can deploy to a cluster without a backend and see the demo graph within 30 minutes, and can switch to a real backend without reading the source code
