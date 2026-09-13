## MODIFIED Requirements

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

### Requirement: Deployment documentation

`deploy/README.md` SHALL record: prerequisites (an available cluster and `kubectl`), the image registry and tag rules, the apply commands (`kubectl apply -k deploy/` and `make deploy IMAGE=...`), the `config.json` mount path `/srv/config/config.json` and the "publicly readable, must not contain secrets" warning, the usage of `KSG_API_PROXY_TARGET` and `KSG_METRICS_PROXY_TARGET`, the reason the two are different upstreams, and the CORS trade-off (root-relative endpoints + proxy, or absolute URLs + backend allowing the frontend origin), the usage of `KSG_AZ_LABEL` / `KSG_ENV_LABEL` — what they rewrite, that they mirror and must match the backend's `--az-label` / `--env-label`, that the app never sees the upstream names, and that a mismatch shows up as `az` / `env` controls listing values the backend then matches nothing against — the path for overriding the web server configuration file, the `/healthz` endpoint, how changes take effect after editing the ConfigMap and the propagation delay, how to upgrade the image tag, the steps to verify a deployment with `demoMode: true` and `/demo/graph.json`, how to pin a digest instead of a moving tag, the proxy scope (`GET` / `HEAD` only, label enumeration only under `/metrics-api/`, `/api/metrics` never forwarded) and the accepted target format, the security headers and what a replacement web server configuration must keep (the header include, `pid` and temp paths under `/tmp`), and that the front door carries no authentication.

#### Scenario: Operator completes deployment and verification from the documentation alone

- **WHEN** an operator who has never touched this project follows only `deploy/README.md`
- **THEN** they can deploy to a cluster without a backend and see the demo graph within 30 minutes, and can switch to a real backend without reading the source code

#### Scenario: An operator with renamed labels finds the binding from the documentation

- **WHEN** an operator whose kube-state-metrics series carry `zone` instead of `az` reads `deploy/README.md`
- **THEN** they find `KSG_AZ_LABEL`, the instruction to set the backend's `--az-label` to the same value, and the symptom of leaving one side unset
