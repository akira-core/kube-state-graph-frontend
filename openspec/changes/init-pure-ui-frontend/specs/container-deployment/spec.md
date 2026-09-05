## Purpose

定義 kube-state-graph-frontend 以容器部署至 Kubernetes 的契約:多階段 `Dockerfile` 產出僅含靜態資產與靜態 web server 的 image、SPA history fallback 路由、`config.json` 由 ConfigMap 掛載注入並禁止快取、靜態資產快取 header、健康檢查端點、可選的同源反向代理、`deploy/` manifests,以及 CI 的 image 建置與推送。所有條款皆以運維者能從 image 或叢集外部驗證的行為描述。

## ADDED Requirements

### Requirement: 多階段 Dockerfile 與最小化 image

repo 根目錄 SHALL 提供 `Dockerfile`,以多階段建置產出 image:建置階段以 Node 22 執行 `npm ci` 與 `npm run build`(含型別檢查,type error MUST 使 image 建置失敗);最終階段 SHALL 以小型基底 image 承載一個靜態 web server,並只複製 `dist/` 的內容。最終 image MUST NOT 含 Node.js 執行環境、`npm`、`node_modules`、原始碼或建置階段的任何中間產物。`.dockerignore` MUST 排除 `node_modules`、`dist`、`.git` 與測試輸出目錄。

`docker build -t <image> .` 於 clean checkout 上 MUST 不需任何 build arg、憑證或事先執行的 `npm install` 即可成功。

#### Scenario: Clean checkout 直接建置 image

- **WHEN** 於未執行過 `npm install` 的 clean checkout 執行 `docker build -t ksg-frontend:test .`
- **THEN** 建置成功,且 `docker run --rm --entrypoint sh ksg-frontend:test -c 'command -v node || command -v npm'` 找不到任何一者

#### Scenario: 最終 image 不含原始碼

- **WHEN** 檢視 `docker run --rm --entrypoint sh ksg-frontend:test -c 'ls /'` 及靜態根目錄的內容
- **THEN** 只存在 `dist/` 的產物與 web server 本身;找不到 `src/`、`node_modules/`、`package.json` 或 `vite.config.ts`

### Requirement: 非 root 執行與程序生命週期

最終 image SHALL 以**數值** UID 的非 root 使用者執行(`USER` 指令為數值,使 Kubernetes `runAsNonRoot` 能於 admission 時驗證),並於非特權 port `8080` 監聽 HTTP。web server 程序 SHALL 為 PID 1 或正確轉發 signal,收到 `SIGTERM` 後 MUST 在 10 秒內結束。image 建置與執行 MUST NOT 需要任何 secret。

#### Scenario: 非 root 且數值 UID

- **WHEN** 執行 `docker inspect --format '{{.Config.User}}' ksg-frontend:test`
- **THEN** 輸出為非 `0` 的純數值 UID(可帶 `:GID`)

#### Scenario: SIGTERM 後迅速停止

- **WHEN** 以 `docker run -d -p 8080:8080 ksg-frontend:test` 啟動後執行 `docker stop`
- **THEN** 容器在 10 秒內結束,`docker stop` 未等到強制 kill 逾時

### Requirement: SPA history fallback 路由

靜態 web server SHALL 對每一個請求依下列規則回應:

- 路徑對應 `dist/` 中實際存在的檔案時,回傳該檔案。
- 路徑位於 `/assets/`、`/api/`、`/healthz`、`/config.json` 之外且無對應檔案時,回傳 `index.html` 並以 `200` 回應,使 client-side 路由 `/graph`、`/sankey` 及其子路徑可直接深連結或重新整理。
- `/assets/` 下不存在的檔案 MUST 回傳 `404`,不得以 `index.html` 冒充 —— 過期 bundle 引用的資產必須以明確錯誤浮現,而非把 HTML 當 JavaScript 載入。

#### Scenario: 深連結 client-side 路由

- **WHEN** 對執行中的容器請求 `GET /sankey` 與 `GET /graph?focus=pod-a`
- **THEN** 兩者皆回 `200`,body 為 `index.html` 內容,`Content-Type` 為 `text/html`

#### Scenario: 不存在的資產回 404

- **WHEN** 請求 `GET /assets/does-not-exist.js`
- **THEN** 回應為 `404`,body 不是 `index.html`

### Requirement: 執行期設定檔的掛載與提供

靜態 web server SHALL 將 `GET /config.json` 對應到容器內路徑 `/srv/config/config.json`;該路徑是文件化的掛載點,Kubernetes 部署時由 ConfigMap 以**目錄**方式掛載於 `/srv/config`(MUST NOT 使用 `subPath`,否則 ConfigMap 更新不會傳播到 Pod)。

`/config.json` 的回應 MUST 帶 `Cache-Control: no-store` 與 `Content-Type: application/json`,使設定修改在下一次頁面載入即生效,不受瀏覽器或中介快取影響。檔案不存在時 MUST 回 `404`(缺設定時的 app 行為由 `runtime-config` capability 規範)。`dist/` 本身 MUST NOT 含 `config.json`,因此 image 沒有內建設定,同一個 image 服務所有環境。

`config.json` 對每一個瀏覽器公開可讀;文件 MUST 明示其中 MUST NOT 放置任何 secret。

#### Scenario: 掛載的設定以 no-store 提供

- **WHEN** 以 `docker run -v $PWD/config.json:/srv/config/config.json -p 8080:8080` 啟動,並請求 `GET /config.json`
- **THEN** 回應 `200`,body 與掛載的檔案逐位元組相同,header 含 `Cache-Control: no-store` 與 `Content-Type: application/json`

#### Scenario: 未掛載設定時回 404

- **WHEN** 不掛載任何檔案即啟動容器並請求 `GET /config.json`
- **THEN** 回應為 `404`,而非 `index.html`

#### Scenario: ConfigMap 修改不需重啟 Pod

- **WHEN** 以 `kubectl edit configmap` 修改 `config.json` 內容,等待 kubelet 的 ConfigMap 傳播延遲後重新整理頁面
- **THEN** `GET /config.json` 回傳新內容,app 依新設定運作,期間 Pod 未重啟

### Requirement: 快取與內容協商 header

靜態 web server SHALL 依資源類型設定快取策略:

- `/assets/` 下以內容雜湊命名的檔案 MUST 帶 `Cache-Control: public, max-age=31536000, immutable`。
- `index.html`(含 fallback 回應)與其他非雜湊命名的靜態檔(如 `/demo/graph.json`、`/demo/storage-graph.json`)MUST 帶 `Cache-Control: no-cache`,使每次部署新版後瀏覽器重新驗證。
- 每個回應 MUST 帶正確的 `Content-Type`(`.js` 為 JavaScript MIME type、`.json` 為 `application/json`、`.svg` 為 `image/svg+xml`),否則 ES module 無法載入;並 MUST 帶 `X-Content-Type-Options: nosniff`。
- 文字類資源(HTML、JavaScript、CSS、JSON、SVG)在 client 以 `Accept-Encoding` 表明支援時 MUST 以壓縮編碼回傳,並帶 `Vary: Accept-Encoding`。

#### Scenario: 雜湊資產長期快取、index.html 重新驗證

- **WHEN** 請求 `index.html` 引用的任一 `/assets/*.js` 與 `GET /`
- **THEN** 前者 header 含 `Cache-Control: public, max-age=31536000, immutable`,後者含 `Cache-Control: no-cache`

#### Scenario: 壓縮傳輸

- **WHEN** 以 `Accept-Encoding: gzip` 請求最大的 `/assets/*.js`
- **THEN** 回應帶 `Content-Encoding: gzip`(或 `br`)與 `Vary: Accept-Encoding`

### Requirement: 健康檢查端點

靜態 web server SHALL 提供 `GET /healthz`,回應 `200` 與極短的純文字 body,並帶 `Cache-Control: no-store`。此端點 MUST 只反映 web server 本身可服務,MUST NOT 依賴 `/srv/config/config.json` 是否存在或任何後端是否可達,且 MUST NOT 落入 SPA fallback。`deploy/` 的 Deployment SHALL 以此端點作為 liveness 與 readiness probe。

#### Scenario: 無設定、無後端時健康檢查仍通過

- **WHEN** 不掛載設定、不設定任何 proxy 目標即啟動容器,請求 `GET /healthz`
- **THEN** 回應 `200`,`Content-Type` 為 `text/plain`,body 非 `index.html`

### Requirement: 可選的同源反向代理

靜態 web server SHALL 支援以環境變數 `KSG_API_PROXY_TARGET`(例如 `http://kube-state-graph.monitoring.svc:8080`)啟用同源反向代理:設定時,`/api/` 前綴下的請求 MUST 轉發至該目標並去除 `/api` 前綴(`/api/v1/graph` → `<target>/v1/graph`、`/api/dashboard` → `<target>/dashboard`),path 與 query string 原樣保留,回應的狀態碼、header 與 body 原樣回傳且 MUST NOT 由 web server 快取。運維者藉此在 `config.json` 使用 root-relative 端點(`/api/v1/graph`)而免除 CORS 設定。此功能為**可選**:未設定 `KSG_API_PROXY_TARGET` 時,`/api/` 下的請求 MUST 回 `404` 而非 `index.html`,讓錯誤設定以明確的 HTTP 錯誤浮現,而非 app 內的 JSON 解析失敗。

web server SHALL 另支援**第二個**、獨立的環境變數 `KSG_METRICS_PROXY_TARGET`,以完全相同的規則代理 `/metrics-api/` 前綴至一個 **Prometheus 相容**的 upstream(`/metrics-api/api/v1/label/az/values` → `<target>/api/v1/label/az/values`),未設定時同樣回 `404`。

兩個 upstream **不可**合而為一:`endpoints.labelValues` 讀的是 `<base>/api/v1/label/<name>/values`,graph API 不提供該路徑。把 `labelValues` 指向 `/api` 會得到 404,而 404 在 UI 上的樣子是一組列不出任何選項的識別維度控制——與「這個 estate 沒有 pod」無法區分。

運維者若需超出此範圍的 server 行為(例如該 metrics store 需要憑證,而 `config.json` 公開可讀不得攜帶),SHALL 能以掛載方式覆寫 image 內的 web server 設定檔;該設定檔在容器內的路徑 MUST 記載於 `deploy/README.md`。

#### Scenario: 以環境變數啟用代理

- **WHEN** 後端於 `http://backend:8080` 提供 `GET /v1/graph`,容器以 `KSG_API_PROXY_TARGET=http://backend:8080` 啟動,並請求 `GET /api/v1/graph?cluster=a`
- **THEN** 後端收到 `GET /v1/graph?cluster=a`,client 收到與後端相同的狀態碼與 body,回應 origin 與 app 相同

#### Scenario: 未啟用代理時 /api/ 回 404

- **WHEN** 未設定 `KSG_API_PROXY_TARGET` 即啟動容器,請求 `GET /api/v1/graph`
- **THEN** 回應為 `404`,body 不是 `index.html`

#### Scenario: label values 走第二個 upstream

- **WHEN** 容器以 `KSG_API_PROXY_TARGET=http://backend:8080` 與 `KSG_METRICS_PROXY_TARGET=http://vmselect:8481/select/0/prometheus` 啟動,請求 `GET /metrics-api/api/v1/label/az/values?match%5B%5D=kube_pod_info`
- **THEN** vmselect 收到 `GET /api/v1/label/az/values?match[]=kube_pod_info`,後端未收到任何請求
- **AND** 只設定 `KSG_API_PROXY_TARGET` 時,同一請求回 `404`,而非被轉發至不提供該路徑的 graph API

### Requirement: Kubernetes manifests

`deploy/` SHALL 含 `kustomization.yaml` 與其引用的 `deployment.yaml`、`service.yaml`、`configmap.yaml`,可以 `kubectl apply -k deploy/` 套用;每個檔案亦 MUST 為可獨立套用的合法 manifest,使 `kubectl apply -f deploy/` 亦可。manifests MUST NOT 硬編 namespace。

- **Deployment** SHALL:引用 CI 發佈的 image;宣告 container port `8080`(命名 `http`);以 `GET /healthz` 設定 liveness 與 readiness probe;宣告 CPU / memory 的 `requests` 與 `limits`;將 ConfigMap 以目錄掛載於 `/srv/config`;符合 Pod Security Standards `restricted` profile(`runAsNonRoot: true`、`allowPrivilegeEscalation: false`、`capabilities.drop: [ALL]`、`seccompProfile.type: RuntimeDefault`);並以註解示範 `KSG_API_PROXY_TARGET` 與 `KSG_METRICS_PROXY_TARGET` 的設定方式,且註解 MUST 說明兩者是不同的 upstream。
- **Service** SHALL 為 `ClusterIP`,port `80` 對應 targetPort `http`。Ingress 與 TLS 由叢集運維提供,不在本 capability 範圍。
- **ConfigMap** SHALL 以 `config.json` 為 key 攜帶一份**完整**的設定範例:每一個文件化的 key 皆出現(`endpoints.graph`、`endpoints.storageGraph`、`endpoints.labelValues`、`endpoints.edgeTypes`、`endpoints.codeChanges`、`endpoints.configChanges`、`endpoints.dashboard`、`demoMode`、`refreshIntervalSeconds`、`defaultLayout`、`theme`),`demoMode` 預設 `true`,端點以 root-relative 形式示範。範例值 MUST 指向該端點**真正會被服務到**的前綴:graph API 的端點走 `/api/...`,而 `endpoints.labelValues` MUST 為 `/metrics-api`——範例是照抄用的,一個 404 的範例值等同於預設就是壞的。

image 參照 SHALL 可由 `kustomization.yaml` 的 `images:` 區段覆寫;`Makefile` SHALL 提供 `image`(`docker build`)、`image-push` 與 `deploy`(套用 manifests)目標,皆以文件化變數 `IMAGE=<registry>/<repo>:<tag>` 指定 image 參照。

#### Scenario: 未修改的 manifests 可直接套用

- **WHEN** 於任一 namespace 執行 `kubectl apply -k deploy/`
- **THEN** Deployment、Service、ConfigMap 皆建立,Pod 於 30 秒內 `Ready`,且 `kubectl get deploy -o yaml` 顯示 liveness / readiness probe 與 resources 皆已設定

#### Scenario: 符合 restricted Pod Security 標準

- **WHEN** 於標記 `pod-security.kubernetes.io/enforce: restricted` 的 namespace 套用 `deploy/`
- **THEN** Pod 被 admission 接受並進入 `Running`,無 PodSecurity 警告

#### Scenario: 以變數覆寫 image

- **WHEN** 執行 `make deploy IMAGE=registry.example/ksg-frontend:1.2.3`
- **THEN** 建立的 Deployment 之 container image 為 `registry.example/ksg-frontend:1.2.3`

### Requirement: 無後端時以 demo 模式啟動

image 的啟動與就緒 MUST NOT 依賴任何後端可達:容器不做啟動時連線檢查,readiness 只看 `/healthz`。當 ConfigMap 的 `config.json` 設定 `demoMode: true` 且叢集內沒有任何 kube-state-graph 後端時,套用未修改的 `deploy/` 後 app MUST 完整渲染 showcase graph。image 亦 SHALL 於 `<base>/demo/graph.json` 與 `<base>/demo/storage-graph.json` 提供 `dist/` 內的兩份範例 payload,使 `endpoints.graph: "/demo/graph.json"`、`endpoints.storageGraph: "/demo/storage-graph.json"`、`demoMode: false` 能在無後端的叢集中走完兩條真實 fetch 路徑,作為部署後的 smoke test。

#### Scenario: 無後端的叢集直接看到 demo

- **WHEN** 叢集內無任何後端,執行 `kubectl apply -k deploy/` 後以 `kubectl port-forward` 開啟瀏覽器
- **THEN** `GET /config.json` 回傳 `demoMode: true`,頁面渲染完整 showcase graph,Pod 日誌無對外連線錯誤

#### Scenario: 以範例 payload 驗證 fetch 路徑

- **WHEN** 將 ConfigMap 改為 `demoMode: false`、`endpoints.graph: "/demo/graph.json"`,等待傳播後重新整理頁面
- **THEN** `GET /demo/graph.json` 回 `200` 且 body 為合法 JSON,app 以 HTTP 取回並渲染出與 demo 模式相同的圖

### Requirement: CI 建置與推送 image

GitHub Actions workflow SHALL 於每次 push 到 `main` 與每個 `v*` tag 時以 repo 的 `Dockerfile` 建置 image 並推送至文件化的 registry,預設為 GitHub Container Registry(`ghcr.io/<owner>/kube-state-graph-frontend`);pull request SHALL 只建置不推送,以驗證 `Dockerfile`。推送 MUST 只使用 CI 平台預設提供的憑證,不需手動建立任何 secret。

image tag SHALL 為:push 到 `main` 時 `main` 與 `sha-<short-sha>`;tag `vX.Y.Z` 時 `X.Y.Z` 與 `latest`。image MUST 帶 OCI label `org.opencontainers.image.source` 與 `org.opencontainers.image.revision`(對應 commit SHA)。`deploy/README.md` MUST 說明如何以這些 tag 指定部署版本。

#### Scenario: main 分支推送後可拉取 image

- **WHEN** commit 被 push 到 `main` 且 workflow 完成
- **THEN** `docker pull ghcr.io/<owner>/kube-state-graph-frontend:sha-<short-sha>` 成功,且 `docker inspect` 顯示 `org.opencontainers.image.revision` 等於該 commit SHA

#### Scenario: PR 只建置不推送

- **WHEN** 開啟含 `Dockerfile` 變更的 pull request
- **THEN** workflow 執行 image 建置並回報結果,registry 中未出現新 tag

### Requirement: 部署文件

`deploy/README.md` SHALL 記載:前置需求(可用的叢集與 `kubectl`)、image registry 與 tag 規則、套用指令(`kubectl apply -k deploy/` 與 `make deploy IMAGE=...`)、`config.json` 的掛載路徑 `/srv/config/config.json` 與「公開可讀、不得含 secret」的警語、`KSG_API_PROXY_TARGET` 與 `KSG_METRICS_PROXY_TARGET` 的用法、兩者為不同 upstream 的理由,與 CORS 取捨(root-relative 端點 + 代理,或絕對 URL + 後端允許前端 origin)、覆寫 web server 設定檔的路徑、`/healthz` 端點、修改 ConfigMap 後的生效方式與傳播延遲、升版 image tag 的方式,以及以 `demoMode: true` 與 `/demo/graph.json` 驗證部署的步驟。

#### Scenario: 運維者只靠文件完成部署與驗證

- **WHEN** 未接觸過本專案的運維者僅依 `deploy/README.md` 操作
- **THEN** 能在 30 分鐘內於無後端的叢集部署並看到 demo graph,且能切換到真實後端而不需閱讀原始碼
