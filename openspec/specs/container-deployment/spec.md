## Purpose

Defines the contract for deploying kube-state-graph-frontend to Kubernetes as a container: a multi-stage `Dockerfile` producing an image holding only static assets and a static web server, SPA history fallback routing, `config.json` injected by a ConfigMap mount and forbidden from caching, static asset cache headers, a health check endpoint, an optional same-origin reverse proxy, `deploy/` manifests, and CI image build and push. Every clause is described as behavior an operator can verify from the image or from outside the cluster.

## Requirements

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

The runtime user MUST NOT be able to write the static root or the web server's configuration: a compromised server process must not be able to rewrite the bundle every browser loads, nor reconfigure itself on its next reload. The image SHALL start and serve with a read-only root filesystem when only `/tmp` is writable.

#### Scenario: Runtime user cannot modify what it serves

- **WHEN** `docker run --rm --entrypoint sh ksg-frontend:test -c 'touch /usr/share/nginx/html/x; touch /etc/nginx/x'` is run
- **THEN** both `touch` commands fail with a permission error

#### Scenario: Serves with a read-only root filesystem

- **WHEN** the container is started with `docker run --read-only --tmpfs /tmp -p 8080:8080 ksg-frontend:test` and `GET /healthz` is requested
- **THEN** the response is `200`

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

### Requirement: Browser security headers

Every response the web server produces for a routed request — static files, the SPA fallback, its own `403` / `404` answers, and proxied responses — SHALL carry, besides `X-Content-Type-Options: nosniff`:

- a `Content-Security-Policy` that loads scripts only from the page's own origin, forbids plugins (`object-src 'none'`), pins `base-uri` to the own origin, and forbids framing (`frame-ancestors 'none'`). It MUST admit `data:` images, which the graph canvas draws its node icons from; it MAY admit inline styles (`'unsafe-inline'` in `style-src`), because libraries in the bundle create `<style>` elements at runtime that the browser would otherwise block — scripts get no such exception; and it MUST NOT confine `connect-src` to the own origin, because runtime config may legitimately point an endpoint at an absolute cross-origin URL;
- `X-Frame-Options: DENY`, for browsers that predate `frame-ancestors`;
- `Referrer-Policy: same-origin`.

Each of these MUST appear exactly once per response. The web server MUST NOT disclose its version, in the `Server` header or on its own error pages.

#### Scenario: Headers on the document and on a proxied response

- **WHEN** `GET /graph` and, with `KSG_API_PROXY_TARGET` set, `GET /api/v1/graph` are requested
- **THEN** each response carries exactly one `Content-Security-Policy` containing `frame-ancestors 'none'`, plus `X-Frame-Options: DENY` and `Referrer-Policy: same-origin`

#### Scenario: The app runs under its own policy

- **WHEN** the image is started with `demoMode: true`, and `/graph` and `/sankey` are opened in a browser and their controls exercised
- **THEN** the showcase graph renders and the browser reports no Content Security Policy violation

#### Scenario: No version disclosure

- **WHEN** `GET /` and, without a proxy target, `GET /api/v1/graph` are requested
- **THEN** the `Server` header carries no version number, and neither does the `404` body

### Requirement: Health check endpoint

The static web server SHALL provide `GET /healthz`, responding `200` with a very short plain-text body and `Cache-Control: no-store`. This endpoint MUST reflect only that the web server itself can serve, MUST NOT depend on whether `/srv/config/config.json` exists or whether any backend is reachable, and MUST NOT fall into the SPA fallback. The Deployment in `deploy/` SHALL use this endpoint as the liveness and readiness probe.

#### Scenario: Health check still passes with no configuration and no backend

- **WHEN** the container is started without mounting configuration and without setting any proxy target, and `GET /healthz` is requested
- **THEN** the response is `200`, `Content-Type` is `text/plain`, and the body is not `index.html`

### Requirement: Optional same-origin reverse proxy

The static web server SHALL support enabling a same-origin reverse proxy via the environment variable `KSG_API_PROXY_TARGET` (for example `http://kube-state-graph.monitoring.svc:8080`): when set, `GET` and `HEAD` requests under the `/api/` prefix MUST be forwarded to that target with the `/api` prefix stripped (`/api/v1/graph` → `<target>/v1/graph`, `/api/dashboard` → `<target>/dashboard`), the path and query string preserved as-is, and the response status code, headers, and body returned as-is and MUST NOT be cached by the web server. This lets operators use root-relative endpoints (`/api/v1/graph`) in `config.json` and avoid CORS configuration. This feature is **optional**: when `KSG_API_PROXY_TARGET` is not set, requests under `/api/` MUST return `404` rather than `index.html`, so a misconfiguration surfaces as an explicit HTTP error rather than a JSON parse failure inside the app.

Any other method MUST be refused with `403` without reaching the upstream: the app only ever reads, so no other method has a reason to cross the front door. `/api/metrics`, the backend's own Prometheus registry, MUST NOT be forwarded and returns `404` — it is for an in-cluster scraper, not for a browser.

The web server SHALL additionally support a **second**, independent environment variable `KSG_METRICS_PROXY_TARGET`, forwarding **only** label enumeration to a **Prometheus-compatible** upstream by the same rules (`/metrics-api/api/v1/label/az/values` → `<target>/api/v1/label/az/values`). Every other path under `/metrics-api/` MUST return `404` whether or not the target is set: the front door carries no authentication, so forwarding the store's whole API would give every browser arbitrary PromQL (`query`, `query_range`) and a bulk export of every series.

The two logical dimensions `az` and `env` MAY be bound to differently named upstream labels with `KSG_AZ_LABEL` and `KSG_ENV_LABEL` (defaults `az` / `env`), mirroring the backend's `--az-label` / `--env-label`: when set, the metrics proxy MUST forward `/metrics-api/api/v1/label/az/values` to `<target>/api/v1/label/<KSG_AZ_LABEL>/values` and `/metrics-api/api/v1/label/env/values` to `<target>/api/v1/label/<KSG_ENV_LABEL>/values`, query string preserved, while every other label name under `/metrics-api/api/v1/label/` is forwarded unchanged. The app itself never learns the upstream names — it keeps requesting the logical `az` / `env` and keeps sending `?az=` / `?env=` to the graph API, whose own binding is the backend's concern; the two bindings MUST be configured alike, and the documentation MUST say so. Each variable MUST be a valid PromQL label name (`[a-zA-Z_][a-zA-Z0-9_]*`) and the two MUST differ; an invalid or colliding value MUST stop the container before serving with a message naming the variable, even when `KSG_METRICS_PROXY_TARGET` is unset — a typo must not wait for the day the proxy is enabled to be noticed.

A proxy target MUST be a bare `http://` or `https://` URL. When a target carries anything the web server's configuration would parse — whitespace, `;`, braces, quotes, `$` — the container MUST exit non-zero before serving, with a message naming the variable, rather than splice the value into its configuration.

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

#### Scenario: az and env are rebound at the front door

- **WHEN** the container is started with `KSG_METRICS_PROXY_TARGET=http://vmselect:8481/select/0/prometheus`, `KSG_AZ_LABEL=zone` and `KSG_ENV_LABEL=environment`, and `GET /metrics-api/api/v1/label/az/values?match%5B%5D=kube_pod_info`, `GET /metrics-api/api/v1/label/env/values?match%5B%5D=kube_pod_info` and `GET /metrics-api/api/v1/label/namespace/values?match%5B%5D=kube_pod_info` are requested
- **THEN** vmselect receives `GET /api/v1/label/zone/values?match[]=kube_pod_info`, `GET /api/v1/label/environment/values?match[]=kube_pod_info` and `GET /api/v1/label/namespace/values?match[]=kube_pod_info` respectively, and the app's `az` and `env` controls list the values of `zone` and `environment`

#### Scenario: An invalid or colliding label binding stops the container

- **WHEN** the container is started with `KSG_AZ_LABEL='zone; }'`, or with `KSG_AZ_LABEL=site` and `KSG_ENV_LABEL=site`, in either case without `KSG_METRICS_PROXY_TARGET`
- **THEN** the container exits non-zero before serving, and its log names `KSG_AZ_LABEL` (and, for the collision, `KSG_ENV_LABEL`)

#### Scenario: Only GET and HEAD reach an upstream

- **WHEN** the container is started with `KSG_API_PROXY_TARGET=http://backend:8080` and `POST /api/v1/graph` is requested
- **THEN** the response is `403` and the backend receives no request

#### Scenario: The backend's metrics registry is not forwarded

- **WHEN** the container is started with `KSG_API_PROXY_TARGET=http://backend:8080` and `GET /api/metrics` is requested
- **THEN** the response is `404` and the backend receives no request

#### Scenario: The metrics store's query and export APIs are not reachable

- **WHEN** the container is started with `KSG_METRICS_PROXY_TARGET=http://vmselect:8481/select/0/prometheus`, and `GET /metrics-api/api/v1/query?query=up`, `GET /metrics-api/api/v1/export` or `GET /metrics-api/api/v1/label/../../query?query=up` is requested
- **THEN** each returns `404` and vmselect receives no request

#### Scenario: A target that is not a bare URL stops the container

- **WHEN** the container is started with `KSG_API_PROXY_TARGET='http://backend:8080; }'`
- **THEN** the container exits non-zero before serving, and its log names `KSG_API_PROXY_TARGET`

### Requirement: Kubernetes manifests

`deploy/` SHALL contain `kustomization.yaml` and the `deployment.yaml`, `service.yaml`, `configmap.yaml` it references, applicable with `kubectl apply -k deploy/`; each file MUST also be a valid manifest applicable on its own, so that `kubectl apply -f deploy/` also works. The manifests MUST NOT hardcode a namespace.

- **Deployment** SHALL: reference the image published by CI; declare container port `8080` (named `http`); configure liveness and readiness probes with `GET /healthz`; declare CPU / memory `requests` and `limits`; mount the ConfigMap as a directory at `/srv/config`; comply with the Pod Security Standards `restricted` profile (`runAsNonRoot: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `seccompProfile.type: RuntimeDefault`); run with `readOnlyRootFilesystem: true`, mounting an `emptyDir` at `/tmp` as the only writable path; set `automountServiceAccountToken: false`, since the app calls no Kubernetes API; pull with `imagePullPolicy: Always` while it references a moving tag such as `main`; and demonstrate in comments how to set `KSG_API_PROXY_TARGET` and `KSG_METRICS_PROXY_TARGET`, and the comments MUST explain that the two are different upstreams. The same comments MUST demonstrate `KSG_AZ_LABEL` / `KSG_ENV_LABEL` beside the metrics target and state that they must match the backend's `--az-label` / `--env-label`.
- **Service** SHALL be `ClusterIP`, with port `80` mapped to targetPort `http`. Ingress and TLS are provided by cluster operations and are outside the scope of this capability.
- **ConfigMap** SHALL carry a **complete** example configuration under the key `config.json`: every documented key appears (`endpoints.graph`, `endpoints.storageGraph`, `endpoints.labelValues`, `endpoints.codeChanges`, `endpoints.configChanges`, `endpoints.dashboard`, `demoMode`, `refreshIntervalSeconds`, `defaultLayout`, `theme`), `demoMode` defaults to `true`, and endpoints are demonstrated in root-relative form. The example MUST NOT carry `endpoints.edgeTypes`, which is no longer a documented key: an example that names a key the app ignores teaches a deployment to configure something inert. Example values MUST point at the prefix where that endpoint is **actually served**: graph API endpoints go through `/api/...`, while `endpoints.labelValues` MUST be `/metrics-api` — the example is meant to be copied verbatim, and an example value that 404s is equivalent to being broken by default.

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

#### Scenario: The example ConfigMap names no withdrawn endpoint

- **WHEN** `deploy/configmap.yaml` is read and its `config.json` value is parsed
- **THEN** the object under `endpoints` contains no `edgeTypes` key, and every key it does contain is one the runtime-config contract documents

#### Scenario: The label bindings are demonstrated next to the metrics target

- **WHEN** `deploy/deployment.yaml` is read
- **THEN** its commented env block names `KSG_AZ_LABEL` and `KSG_ENV_LABEL` directly after `KSG_METRICS_PROXY_TARGET`, with a comment stating they must equal the backend's `--az-label` / `--env-label`

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

Every action a workflow uses MUST be pinned by full commit SHA, with the version it corresponds to in a trailing comment, and Dependabot SHALL move those pins: a tag can be pointed at different code after review, a SHA cannot. Workflow tokens SHALL be least-privilege — every workflow declares its permissions; a pull request's image build runs with a read-only token; `packages: write` is held only by the job that pushes, which never runs for a pull request; no unused permission is granted; and checkouts do not persist the token into the working tree.

Image tags SHALL be: on push to `main`, `main` and `sha-<short-sha>`; on tag `vX.Y.Z`, `X.Y.Z` and `latest`. The image MUST carry the OCI labels `org.opencontainers.image.source` and `org.opencontainers.image.revision` (corresponding to the commit SHA). `deploy/README.md` MUST explain how to pin a deployed version with these tags.

#### Scenario: Image is pullable after a push to main

- **WHEN** a commit is pushed to `main` and the workflow completes
- **THEN** `docker pull ghcr.io/<owner>/kube-state-graph-frontend:sha-<short-sha>` succeeds, and `docker inspect` shows `org.opencontainers.image.revision` equal to that commit SHA

#### Scenario: PR only builds without pushing

- **WHEN** a pull request containing `Dockerfile` changes is opened
- **THEN** the workflow runs the image build and reports the result, and no new tag appears in the registry

#### Scenario: No action is referenced by a movable ref

- **WHEN** every `uses:` line under `.github/workflows/` is listed
- **THEN** each names a 40-character commit SHA followed by a `# vX.Y.Z` comment

### Requirement: Deployment documentation

`deploy/README.md` SHALL record: prerequisites (an available cluster and `kubectl`), the image registry and tag rules, the apply commands (`kubectl apply -k deploy/` and `make deploy IMAGE=...`), the `config.json` mount path `/srv/config/config.json` and the "publicly readable, must not contain secrets" warning, the usage of `KSG_API_PROXY_TARGET` and `KSG_METRICS_PROXY_TARGET`, the reason the two are different upstreams, and the CORS trade-off (root-relative endpoints + proxy, or absolute URLs + backend allowing the frontend origin), the usage of `KSG_AZ_LABEL` / `KSG_ENV_LABEL` — what they rewrite, that they mirror and must match the backend's `--az-label` / `--env-label`, that the app never sees the upstream names, and that a mismatch shows up as `az` / `env` controls listing values the backend then matches nothing against — the path for overriding the web server configuration file, the `/healthz` endpoint, how changes take effect after editing the ConfigMap and the propagation delay, how to upgrade the image tag, the steps to verify a deployment with `demoMode: true` and `/demo/graph.json`, how to pin a digest instead of a moving tag, the proxy scope (`GET` / `HEAD` only, label enumeration only under `/metrics-api/`, `/api/metrics` never forwarded) and the accepted target format, the security headers and what a replacement web server configuration must keep (the header include, `pid` and temp paths under `/tmp`), and that the front door carries no authentication.

#### Scenario: Operator completes deployment and verification from the documentation alone

- **WHEN** an operator who has never touched this project follows only `deploy/README.md`
- **THEN** they can deploy to a cluster without a backend and see the demo graph within 30 minutes, and can switch to a real backend without reading the source code

#### Scenario: An operator with renamed labels finds the binding from the documentation

- **WHEN** an operator whose kube-state-metrics series carry `zone` instead of `az` reads `deploy/README.md`
- **THEN** they find `KSG_AZ_LABEL`, the instruction to set the backend's `--az-label` to the same value, and the symptom of leaving one side unset
