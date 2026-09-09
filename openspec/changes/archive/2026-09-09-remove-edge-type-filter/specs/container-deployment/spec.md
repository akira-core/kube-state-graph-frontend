## MODIFIED Requirements

### Requirement: Kubernetes manifests

`deploy/` SHALL contain `kustomization.yaml` and the `deployment.yaml`, `service.yaml`, `configmap.yaml` it references, applicable with `kubectl apply -k deploy/`; each file MUST also be a valid manifest applicable on its own, so that `kubectl apply -f deploy/` also works. The manifests MUST NOT hardcode a namespace.

- **Deployment** SHALL: reference the image published by CI; declare container port `8080` (named `http`); configure liveness and readiness probes with `GET /healthz`; declare CPU / memory `requests` and `limits`; mount the ConfigMap as a directory at `/srv/config`; comply with the Pod Security Standards `restricted` profile (`runAsNonRoot: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `seccompProfile.type: RuntimeDefault`); and demonstrate in comments how to set `KSG_API_PROXY_TARGET` and `KSG_METRICS_PROXY_TARGET`, and the comments MUST explain that the two are different upstreams.
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
