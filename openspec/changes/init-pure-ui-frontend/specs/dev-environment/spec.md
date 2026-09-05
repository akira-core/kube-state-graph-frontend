## Purpose

Defines the local development environment contract for kube-state-graph-frontend: the Vite + TypeScript + React SPA project structure, Node 22, the lint / format / typecheck / unit test / e2e toolchain, version-controlled git hooks, the single source of fixtures and their drift check, and the guarantee that a clean checkout can develop, verify, and build the static `dist/` without any backend.

## ADDED Requirements

### Requirement: SPA project scaffold

The project SHALL be a single-page application (SPA) built with Vite, in TypeScript, on React 18 (or higher), with `index.html` and `vite.config.ts` at the repo root as entry points. The project MUST NOT depend on any `@grafana/*` package, and MUST NOT contain a `.config/` webpack directory, `plugin.json`, `provisioning/`, or any other Grafana plugin scaffold artifact.

`.nvmrc` SHALL record `22`, and `engines.node` in `package.json` SHALL be `>=22`; every npm script MUST run on Node 22 LTS. Node 22 is a hard floor, not a recommendation: the fixture generator relies on Node's native TypeScript type stripping to import the `.ts` fixture directly, with no separate compile step or extra dependency.

#### Scenario: No Grafana dependency

- **WHEN** inspecting `dependencies` and `devDependencies` in `package.json` and listing the repo root
- **THEN** no package whose name starts with `@grafana/` exists, and `.config/`, `plugin.json`, `provisioning/` do not exist

#### Scenario: Node version pinned

- **WHEN** a developer runs `nvm use` (or an equivalent tool that reads `.nvmrc`) at the repo root and then runs `npm install`
- **THEN** the activated Node major version is 22, `npm install` succeeds, and every script in `package.json` runs on this version

### Requirement: Local demo-mode development server

`npm run dev` SHALL start the Vite dev server, and on a clean checkout show the complete showcase graph in the browser without any backend, Kubernetes cluster, metrics store, Docker, or credentials.

The dev server SHALL serve the version-controlled `dev/config.json` (whose content is `demoMode: true`) at `<base>/config.json`; when the `.gitignore`-listed `dev/config.local.json` exists, it SHALL respond with that file instead, letting developers switch to a real backend without touching version-controlled files. Both files live outside `public/` and MUST NOT appear in `dist/`.

#### Scenario: Clean checkout shows the showcase graph directly

- **WHEN** `npm install` then `npm run dev` are run on a clean checkout, and the URL printed to the terminal is opened in a browser
- **THEN** the page renders the complete graph of `SHOWCASE_GRAPH` in demo mode
- **AND** the browser network panel shows no request to any origin other than the dev server

#### Scenario: Local override file takes precedence over the version-controlled dev config

- **WHEN** a developer creates `dev/config.local.json`, then (re)starts `npm run dev` and requests `GET /config.json`
- **THEN** the response content equals `dev/config.local.json`, and `git status` shows no modified tracked file

### Requirement: Dev proxy for connecting to a real backend

`npm run dev` SHALL support enabling a dev proxy via the environment variable `KSG_DEV_PROXY_TARGET` (for example `http://localhost:8080`): when set, the dev server MUST forward requests under the `/api/` prefix to that target with the `/api` prefix stripped (`/api/v1/graph` → `<target>/v1/graph`, query string preserved as-is), so that `dev/config.local.json` can use root-relative endpoints (such as `endpoints.graph: "/api/v1/graph"`) without triggering CORS.

The `/api/` prefix and the prefix-stripping rule MUST be consistent with the same-origin reverse proxy of the `container-deployment` capability, so the same `config.json` works both locally and in the cluster.

#### Scenario: Connect to a local backend via the proxy

- **WHEN** the backend serves `GET /v1/graph` at `http://localhost:8080`, the developer starts with `KSG_DEV_PROXY_TARGET=http://localhost:8080 npm run dev`, and sets `demoMode: false`, `endpoints.graph: "/api/v1/graph"` in `dev/config.local.json`
- **THEN** the browser's request to `/api/v1/graph` is forwarded by the dev server to `http://localhost:8080/v1/graph`, and the response returns to the app on the same origin
- **AND** the browser console shows no CORS error, and the screen renders the graph returned by the backend

### Requirement: Hot module replacement (HMR)

While `npm run dev` is running, after editing and saving any TypeScript / React file under `src/`, the browser SHALL reflect the change within 5 seconds, and MUST NOT require restarting the dev server.

#### Scenario: Browser updates immediately after editing a component

- **WHEN** the dev server is running and a developer edits and saves any React component under `src/`
- **THEN** the browser shows the new screen within 5 seconds, and the terminal has not re-run `npm run dev`

### Requirement: Production build produces a static dist/

`npm run build` SHALL first run TypeScript type checking (equivalent to `npm run typecheck`) and then build with Vite; any type error MUST make the command exit non-zero without writing `dist/`. On success it SHALL output `dist/`, containing `index.html`, content-hash-named assets (`dist/assets/*`), and the static files under `public/` (including `demo/graph.json` and `demo/storage-graph.json`).

`dist/` MUST be purely static files, servable by any static web server; it MUST NOT contain `config.json`, and MUST NOT embed any backend URL or environment-specific value — runtime config is always supplied by the `config.json` provided at deployment, and the same `dist/` serves every environment.

#### Scenario: Build output structure

- **WHEN** `npm run build` is run
- **THEN** `dist/index.html`, `dist/assets/`, `dist/demo/graph.json`, and `dist/demo/storage-graph.json` exist, and `dist/config.json` does not exist

#### Scenario: Type error blocks the build

- **WHEN** `npm run build` is run while `src/` contains a type error
- **THEN** the command exits non-zero, the terminal shows that type error, and `dist/` is neither produced nor updated

#### Scenario: The same dist/ can be served offline in demo mode

- **WHEN** `dist/` is served by any static file server, with a separate `config.json` containing `demoMode: true` placed at its root
- **THEN** the browser renders the showcase graph after opening, with no request to any other origin

### Requirement: ESLint baseline (trimmed edition)

The project SHALL adopt ESLint v9 flat config (`eslint.config.mjs`), integrating the following plugins as mandatory: `typescript-eslint` (`recommendedTypeChecked`), `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-import-x`, `eslint-config-prettier`; `npm run lint` MUST run with `--max-warnings=0`, and cover `src/`, `tests/`, `dev/`, and the root configuration files.

**Trimmed edition: carries over the panel's trade-off — does not adopt `@grafana/eslint-config` (no Grafana dependency), nor sonarjs, unicorn, promise, eslint-comments, jsx-a11y, knip, `import-x/no-restricted-paths`; for a small SPA, noise > signal, and the real boundaries are maintained by code review + the barrel convention.**

#### Scenario: Lint passes with zero warnings

- **WHEN** CI runs `npm run lint`
- **THEN** the exit code is 0, and the output shows `0 errors, 0 warnings`

### Requirement: TypeScript strict configuration

`tsconfig.json` SHALL enable `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`, `isolatedModules: true`; `npm run typecheck`, corresponding to `tsc --noEmit`, MUST pass, and cover `src/`, `tests/`, `dev/`, and root TypeScript files such as `vite.config.ts`.

#### Scenario: Typecheck passes

- **WHEN** CI runs `npm run typecheck`
- **THEN** the exit code is 0, with no type error output

### Requirement: Prettier formatting

The project SHALL adopt `prettier` as the sole formatting tool, with its configuration file under version control; `eslint-config-prettier` MUST disable every ESLint rule that conflicts with prettier. `npm run format` SHALL format the whole repo in one step. `.prettierignore` MUST list `dist/`, `coverage/`, the Playwright output directories, lock files, and `public/demo/graph.json` and `public/demo/storage-graph.json` (generated files; see the hook requirement for the reason).

#### Scenario: Format is consistent

- **WHEN** a developer runs `npm run format`
- **THEN** Prettier rewrites the formatting of the whole repo, and a subsequent `prettier --check .` exits with code 0

### Requirement: Unit tests (Vitest)

Unit and component tests SHALL run with Vitest: `npm run test` is watch mode, and `npm run test:ci` is a one-shot, non-interactive run that reports the result via exit code. Component tests SHALL run in a simulated DOM environment; test files are named `*.test.ts` / `*.test.tsx` and colocated with the code under test. `npm run test:ci` MUST require no backend, network connection, or real browser.

#### Scenario: Unit tests pass offline

- **WHEN** CI runs `npm run test:ci` in an environment with no external network
- **THEN** the exit code is 0, and the output lists `src/shared/fixtures/showcaseGraph.test.ts` as passing

### Requirement: E2E tests (Playwright)

E2E tests SHALL be written with Playwright and placed in `tests/`; `npm run e2e` SHALL start the dev server itself (webServer) and shut it down on exit, runnable on a clean checkout without opening another terminal, a backend, or Docker.

The repository SHALL contain at least three specs:

1. **Demo-mode showcase smoke**: open `/`, assert `[data-testid="graph-canvas"]` mounts, and assert the legend controls that exist because of the fixture content (such as `ingress-toggle`, `edge-legend-row-network-hop`) appear.
2. **Fetch path round trip**: with a Playwright route, respond to `config.json` with a configuration of `demoMode: false` and `endpoints.graph` pointing at `/demo/graph.json`, and assert the same set of elements appears. This spec proves what unit tests cannot: the complete data path of the generated payload fetched over HTTP, passing through `normalizeGraph`, to the cytoscape mount.
3. **Two endpoints each fetch on their own**: with a Playwright route, serve both `endpoints.graph: "/demo/graph.json"` and `endpoints.storageGraph: "/demo/storage-graph.json"`, assert the request count for `/demo/storage-graph.json` is 0 while staying on the Graph view, that exactly one is issued after switching to Sankey and selecting `az` / `env`, and that the tiers the Sankey draws come from the storage fixture rather than the graph fixture. This spec guards the core boundary of this change — two views go through two endpoints, and the Sankey is lazy.

E2E MUST be triggerable by a developer locally with a single command (`npm run e2e`), and since both specs are stable, they are **also included as a required CI gate** (see "CI workflow (trimmed edition)"). Both run the same `npm run e2e`: CI must not own an e2e path that cannot be reproduced locally.

#### Scenario: One command runs e2e to completion on a clean checkout

- **WHEN** a developer runs `npm install`, `npx playwright install`, and then `npm run e2e` on a clean checkout
- **THEN** both specs pass, with no backend process running in the meantime

### Requirement: Pre-commit and pre-push hooks

The project SHALL configure git hooks with **version-controlled** `.githooks/` scripts, with the `prepare` npm script pointing `core.hooksPath` at that directory during `npm install` (or manually via `npm run init-hooks`); it MUST NOT use `husky` — hooks in the repository can be reviewed, are consistent across machines, and are one dependency fewer.

`pre-commit` SHALL run `lint-staged` on staged files (configured in `.lintstagedrc.json`: `eslint --cache --fix` + `prettier --write`); `pre-push` SHALL run `npm run lint`, `npm run typecheck`, `npm run fixture:check`, `npm run test:ci` in order; any failure MUST block the commit / push.

`fixture:check` MUST be in the hook chain, because `public/demo/graph.json` and `public/demo/storage-graph.json` are both generated output: editing the fixture but forgetting `npm run fixture:build` would not be discovered until CI if not caught here. **Generated files MUST be listed in `.prettierignore`** — if the output format of `pre-commit`'s prettier and the generator disagree (prettier collapses short arrays onto one line, `JSON.stringify(…, null, 2)` always expands them), the two overwrite each other on every commit, making `fixture:check` fail forever.

#### Scenario: Pre-commit blocks a lint error

- **WHEN** a developer commits a staged change containing an ESLint error
- **THEN** the hook runs `lint-staged`, fails and blocks the commit, and the terminal shows the ESLint error message

#### Scenario: Pre-push catches a fixture change that was not regenerated

- **WHEN** a developer edits `src/shared/fixtures/showcaseGraph.ts` and pushes without running `npm run fixture:build`
- **THEN** `pre-push` fails at `fixture:check` and blocks the push, with a message naming the remedy command

### Requirement: CI workflow (trimmed edition)

The GitHub Actions CI workflow SHALL provide a single job on pull requests and pushes to `main`, running `npm ci` → `typecheck` → `lint` → `fixture:check` → `test:ci` → `e2e` → `build` in order; any step failing MUST mark the PR check failed, blocking merge. The Node version MUST be read from `.nvmrc`, and must not be separately hardcoded inside the workflow. Before `e2e`, Playwright's Chromium MUST be installed inside the job (`npx playwright install --with-deps chromium`); browser installation is CI environment preparation and is not part of the semantics of the gate chain above.

**Trimmed edition: a single job, no parallel matrix, no separate E2E workflow.** E2E runs in order within this same job alongside the other checks (see "E2E tests (Playwright)"). Container image build and push are governed separately by the `container-deployment` capability and are not in this job.

#### Scenario: CI passes every check

- **WHEN** a PR is pushed
- **THEN** the GitHub Actions "Checks" list shows one `ci` job, with all six steps typecheck / lint / fixture:check / test:ci / e2e / build passing

### Requirement: Makefile shortcuts

The repo root SHALL provide a `Makefile` whose default target `help` lists every target with a one-line description; it includes at least `install`, `dev`, `lint`, `typecheck`, `test`, `e2e`, `build`, `fixture-build`, `fixture-check`, `check` (equivalent to the full `pre-push` gate chain). Each target MUST be a thin wrapper around the corresponding npm script, and must not contain extra logic the npm script does not have; the image / deploy targets defined by the `container-deployment` capability SHALL be collected in the same `Makefile`.

#### Scenario: make help lists the targets

- **WHEN** `make` (no arguments) is run on a clean checkout
- **THEN** the output lists each of the targets above with its description, and the result of running `make check` is consistent with the `pre-push` hook

### Requirement: Developer documentation

`README.md` SHALL include: Prerequisites (only Node 22+; Docker is needed only when building the container image), Quick Start (`npm install` → `npm run dev` → open a browser and see the showcase graph), Demo data (fixture location, how to edit it, `npm run fixture:build` / `fixture:check`), Connecting to a backend (`dev/config.local.json` + `KSG_DEV_PROXY_TARGET`), Architecture overview, Linting & testing, Build & deploy (pointing to the `deploy/` documentation), Troubleshooting.

Quick Start MUST be completable on a clean checkout, and MUST NOT mention any backend service, metrics store, Kubernetes cluster, Docker, image tag, or credential. The documentation SHALL explain the source of the demo data and how to edit it.

Troubleshooting SHALL cover: dev server port conflicts, a stale `public/demo/graph.json` (`fixture:check` failing), CORS errors when using an absolute backend URL (switch to the dev proxy or have the backend allow the frontend origin), and the error screen when `config.json` is missing a required endpoint.

#### Scenario: Quick Start depends on no external service

- **WHEN** a new developer follows Quick Start step by step on a clean checkout
- **THEN** the browser renders the complete showcase graph, and no step mentions a backend, Docker, or a cluster

### Requirement: Typed fixture is the single source of demo data

`src/shared/fixtures/showcaseGraph.ts` SHALL export `SHOWCASE_GRAPH`, annotated with the `WireGraph` type from `src/shared/types/wire.ts`, as the **only** graph read by demo mode, Vitest tests, Playwright specs, and the fixture coverage test. Demo mode SHALL read this fixture directly via module import.

Because the two backend endpoints are two bodies, the fixture SHALL also be **two**: the same module also exports `SHOWCASE_STORAGE_GRAPH`, likewise annotated with `WireGraph`, the showcase in the shape of `GET /v1/storage-graph` — containing only `storage-flow` edges (all five tiers present, including one `pvc-pod` edge carrying `labels.attribution: "split"` and one FlexGroup path starting from `svm-pvc`), `netapp-svm` nodes, and the `hardware` / `perf` of `netapp-node`. The two fixtures MUST describe **the same estate**: the same set of pod / pvc / netapp node ids and names, so that "click a node in the Sankey to jump to Graph and Locate" actually finds its target in demo mode. The `storage-flow` weights of both MUST be conserved per tier, otherwise the demo demonstrates a shape the backend never produces. The repository MUST NOT contain any script, test, or development flow that requires a connection to a running kube-state-graph server, Prometheus-compatible store, or Kubernetes cluster to work.

The `WireGraph` annotation is a mechanism, not decoration: `normalizeGraph` accepts `unknown` and validates at runtime, so a field the app newly learns to read is invisible at compile time; typing the fixture makes "taught normalize a new field but forgot the demo" an `npm run typecheck` failure, rather than a blank nobody looks at again.

The fixture SHALL carry the complete backend response envelope — `apiVersion`, `clusters`, `elements` — rather than only `elements`, so the body shape the demo exercises is consistent with what is received in deployment. `clusters` SHALL list only Kubernetes cluster names; ONTAP cluster names MUST NOT appear in it.

Where the fixture carries fields no backend version will ever emit (`status`, `alerts`, `time_records`, and the `switch` / `network` kinds with their `switch-to-switch` / `node-to-switch` edges — these are the frontend's own extension surface), the fixture and the wire types MUST record that origin in comments, so a reader does not mistake frontend-only fields for the backend contract and "fix" the backend.

#### Scenario: No backend dependency anywhere in the repository

- **WHEN** inspecting every file under `dev/`, `tests/`, `.github/workflows/` and every script in `package.json`
- **THEN** no file or script requires a reachable kube-state-graph, VictoriaMetrics, or Kubernetes endpoint to run successfully

#### Scenario: Typecheck fails when normalize adds a wire field the fixture does not cover

- **WHEN** `WireGraph` adds a required field and `SHOWCASE_GRAPH` is not updated in step
- **THEN** `npm run typecheck` fails

### Requirement: Example payloads are generated from the fixture; drift is a failure

`public/demo/graph.json` and `public/demo/storage-graph.json` SHALL be, respectively, the complete `GET /v1/graph` / `GET /v1/storage-graph` response bodies serialized from `SHOWCASE_GRAPH` and `SHOWCASE_STORAGE_GRAPH`, **generated** by `npm run fixture:build` and never hand-edited. Each has two roles: (1) the only example payload — backend developers and operators can compare it against a real response; (2) served by the dev server and the container image at `<base>/demo/<name>.json`, so that pointing `endpoints.graph` / `endpoints.storageGraph` at it walks the real fetch path **without a backend**.

- `npm run fixture:build` SHALL import the TS fixture with Node's native type stripping and write out **both** files with `JSON.stringify(…, null, 2)` plus a trailing newline; when the content is identical it MUST NOT touch the files.
- `npm run fixture:check` SHALL exit non-zero when any committed file is inconsistent with the current fixture, and name `npm run fixture:build` as the remedy command.
- That check SHALL run in CI and in the `pre-push` hook.

#### Scenario: Regenerating an already-synced tree is a no-op

- **WHEN** `npm run fixture:build` is run while the fixture and `public/demo/graph.json` are consistent
- **THEN** the file content is unchanged, `git status` shows no changes, and `npm run fixture:check` exits with code 0

#### Scenario: A fixture change that was not regenerated fails CI

- **WHEN** `SHOWCASE_GRAPH` is modified and `public/demo/graph.json` is not updated
- **THEN** `npm run fixture:check` exits non-zero and prints the `npm run fixture:build` remedy command

#### Scenario: Example payload walks the real fetch path

- **WHEN** `config.json` sets `demoMode: false`, `endpoints.graph: "/demo/graph.json"`, the app is served with `npm run dev`, and a browser is opened
- **THEN** the app fetches `/demo/graph.json` over HTTP and, after `normalizeGraph`, renders the same graph as in demo mode

### Requirement: Fixture covers every kind and edge type the app can draw

`src/shared/fixtures/showcaseGraph.test.ts` SHALL assert that `normalizeGraph(SHOWCASE_GRAPH)` produces:

- an empty `errors` array — the partial-parse channel exists for a real backend misbehaving, and anything landing in it is this repository's own mistake;
- no edge whose `source` or `target` is not among the fixture's own nodes, and no node whose `parent` is not;
- at least one element for **every** key of `ICON_SVG_BY_KIND` and **every** key of `EDGE_STYLE_BY_TYPE`.

Coverage SHALL be measured against these two canonical maps rather than a filterable subset, so the virtual `network` wrapper counts too; anchoring here makes "adding a kind to the map" and "showing it in the demo" the same enforced thing.

The test suite SHALL additionally pin the demo cases that exist to be "seen" rather than merely "parseable": all three `ready_status` values, a claim that joined an aggregate alongside one that did not, a QoS-capped storage edge alongside one without a cap, a measured error rate alongside a measured-zero and an unmeasured edge, a valid tiny rate that must not round to zero, both `labels.role` ingress shapes and their differing dash and visibility behavior; and, for the Sankey view: at least one `pvc-to-netapp-aggr` edge carrying both `read_bytes_per_sec` and `write_bytes_per_sec`, and one carrying no storage throughput metrics at all (absent ≠ 0).

#### Scenario: Fails when a drawable kind is added without a corresponding fixture element

- **WHEN** a key is added to `ICON_SVG_BY_KIND` and no fixture node carries that kind
- **THEN** `showcaseGraph.test.ts` fails, naming the uncovered kind
