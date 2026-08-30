## Purpose

定義 kube-state-graph-frontend 的本機開發環境契約:Vite + TypeScript + React SPA 專案結構、Node 22、lint / format / typecheck / 單元測試 / e2e 工具鏈、版本控管的 git hooks、fixture 單一來源與漂移檢查,以及 clean checkout 不需任何後端即可開發、驗證與建置靜態 `dist/` 的保證。

## ADDED Requirements

### Requirement: SPA 專案骨架

專案 SHALL 為以 Vite 為建置工具的單頁應用程式(SPA),語言為 TypeScript,框架為 React 18(或更高),入口為 repo 根目錄的 `index.html` 與 `vite.config.ts`。專案 MUST NOT 依賴任何 `@grafana/*` 套件,MUST NOT 含 `.config/` webpack 目錄、`plugin.json`、`provisioning/` 或其他 Grafana plugin scaffold 產物。

`.nvmrc` SHALL 記載 `22`,`package.json` 的 `engines.node` SHALL 為 `>=22`;所有 npm script MUST 可在 Node 22 LTS 上執行。Node 22 是硬性下限而非建議值:fixture generator 依賴 Node 原生的 TypeScript type stripping 直接匯入 `.ts` fixture,不另設編譯步驟或額外相依。

#### Scenario: 無 Grafana 相依

- **WHEN** 檢視 `package.json` 的 `dependencies` 與 `devDependencies`,並列出 repo 根目錄
- **THEN** 不存在任何名稱以 `@grafana/` 開頭的套件,且 `.config/`、`plugin.json`、`provisioning/` 皆不存在

#### Scenario: Node 版本鎖定

- **WHEN** 開發者於 repo 根目錄執行 `nvm use`(或讀取 `.nvmrc` 的等效工具)後執行 `npm install`
- **THEN** 啟用的 Node 主版本為 22,`npm install` 成功,且 `package.json` 內每一個 script 皆可在此版本執行

### Requirement: 本機 demo 模式開發伺服器

`npm run dev` SHALL 啟動 Vite dev server,並於 clean checkout 上不需任何後端、Kubernetes 叢集、metrics store、Docker 或憑證即可在瀏覽器看到完整 showcase graph。

dev server SHALL 於 `<base>/config.json` 提供版本控管的 `dev/config.json`(內容為 `demoMode: true`);當 `.gitignore` 所列的 `dev/config.local.json` 存在時,SHALL 改以該檔案回應,讓開發者在不改動版本控管檔案的前提下切換到真實後端。兩個檔案皆位於 `public/` 之外,MUST NOT 出現在 `dist/`。

#### Scenario: Clean checkout 直接看到 showcase graph

- **WHEN** 於 clean checkout 執行 `npm install` 後 `npm run dev`,並以瀏覽器開啟終端印出的 URL
- **THEN** 頁面以 demo 模式渲染 `SHOWCASE_GRAPH` 的完整圖
- **AND** 瀏覽器 network 面板中沒有任何對 dev server 以外 origin 的請求

#### Scenario: 本機覆寫檔優先於版本控管的 dev config

- **WHEN** 開發者建立 `dev/config.local.json` 後(重新)啟動 `npm run dev`,並請求 `GET /config.json`
- **THEN** 回應內容等於 `dev/config.local.json`,且 `git status` 未顯示任何被修改的追蹤檔案

### Requirement: 連接真實後端的 dev proxy

`npm run dev` SHALL 支援以環境變數 `KSG_DEV_PROXY_TARGET`(例如 `http://localhost:8080`)啟用 dev proxy:設定時,dev server MUST 將 `/api/` 前綴下的請求轉發至該目標並去除 `/api` 前綴(`/api/v1/graph` → `<target>/v1/graph`,query string 原樣保留),使 `dev/config.local.json` 得以使用 root-relative 端點(如 `endpoints.graph: "/api/v1/graph"`)而不觸發 CORS。

`/api/` 前綴與去前綴規則 MUST 與 `container-deployment` capability 的同源反向代理一致,使同一份 `config.json` 在本機與叢集中皆可用。

#### Scenario: 以 proxy 連接本機後端

- **WHEN** 後端於 `http://localhost:8080` 提供 `GET /v1/graph`,開發者以 `KSG_DEV_PROXY_TARGET=http://localhost:8080 npm run dev` 啟動,並在 `dev/config.local.json` 設定 `demoMode: false`、`endpoints.graph: "/api/v1/graph"`
- **THEN** 瀏覽器對 `/api/v1/graph` 的請求由 dev server 轉發至 `http://localhost:8080/v1/graph`,回應以同 origin 回到 app
- **AND** 瀏覽器 console 無 CORS 錯誤,畫面渲染後端回傳的圖

### Requirement: 熱模組替換(HMR)

`npm run dev` 執行中,修改 `src/` 下任一 TypeScript / React 檔案並儲存後,瀏覽器 SHALL 於 5 秒內反映變更,且 MUST NOT 需要重新啟動 dev server。

#### Scenario: 修改 component 後瀏覽器即時更新

- **WHEN** dev server 執行中,開發者修改 `src/` 下任一 React component 並儲存
- **THEN** 瀏覽器在 5 秒內顯示新版畫面,終端未重新執行 `npm run dev`

### Requirement: 正式建置產出靜態 dist/

`npm run build` SHALL 先執行 TypeScript 型別檢查(等同 `npm run typecheck`)再以 Vite 建置;任一 type error MUST 使指令以非零結束且不寫出 `dist/`。成功時 SHALL 輸出 `dist/`,內含 `index.html`、以內容雜湊命名的資產(`dist/assets/*`)以及 `public/` 下的靜態檔(含 `demo/graph.json`)。

`dist/` MUST 為純靜態檔案,可由任何靜態 web server 提供;MUST NOT 含 `config.json`,MUST NOT 內嵌任何後端 URL 或環境專屬值 —— 執行期設定一律由部署時提供的 `config.json` 供給,同一份 `dist/` 服務所有環境。

#### Scenario: Build 產物結構

- **WHEN** 執行 `npm run build`
- **THEN** `dist/index.html`、`dist/assets/` 與 `dist/demo/graph.json` 存在,`dist/config.json` 不存在

#### Scenario: Type error 阻擋 build

- **WHEN** `src/` 中含 type error 時執行 `npm run build`
- **THEN** 指令以非零結束,終端顯示該 type error,且未產生或更新 `dist/`

#### Scenario: 同一份 dist/ 可離線以 demo 模式提供

- **WHEN** 以任一靜態檔案伺服器提供 `dist/`,並在其根目錄另放一個 `demoMode: true` 的 `config.json`
- **THEN** 瀏覽器開啟後渲染 showcase graph,無任何對其他 origin 的請求

### Requirement: ESLint 基線(精簡版)

專案 SHALL 採用 ESLint v9 flat config(`eslint.config.mjs`),整合下列 plugin 為必裝:`typescript-eslint`(`recommendedTypeChecked`)、`eslint-plugin-react`、`eslint-plugin-react-hooks`、`eslint-plugin-import-x`、`eslint-config-prettier`;`npm run lint` MUST 以 `--max-warnings=0` 執行,並涵蓋 `src/`、`tests/`、`dev/` 與根目錄設定檔。

**精簡版:沿用 panel 的取捨 —— 不採用 `@grafana/eslint-config`(無 Grafana 相依),亦不採用 sonarjs、unicorn、promise、eslint-comments、jsx-a11y、knip、`import-x/no-restricted-paths`;對小型 SPA 噪音 > 訊號,真正的邊界由 code review + barrel 慣例維持。**

#### Scenario: Lint 通過為零警告

- **WHEN** CI 執行 `npm run lint`
- **THEN** 結束代碼為 0,輸出顯示 `0 errors, 0 warnings`

### Requirement: TypeScript 嚴格設定

`tsconfig.json` SHALL 啟用 `strict: true`、`noUncheckedIndexedAccess: true`、`exactOptionalPropertyTypes: true`、`noImplicitOverride: true`、`noFallthroughCasesInSwitch: true`、`isolatedModules: true`;`npm run typecheck` 對應 `tsc --noEmit` MUST 通過,且涵蓋 `src/`、`tests/`、`dev/` 與 `vite.config.ts` 等根目錄 TypeScript 檔案。

#### Scenario: Typecheck 通過

- **WHEN** CI 執行 `npm run typecheck`
- **THEN** 結束代碼為 0,無 type error 輸出

### Requirement: Prettier 格式化

專案 SHALL 採用 `prettier` 作為唯一格式化工具,設定檔進版本控管;`eslint-config-prettier` MUST 關閉所有與 prettier 衝突的 ESLint 規則。`npm run format` SHALL 一鍵格式化全 repo。`.prettierignore` MUST 列入 `dist/`、`coverage/`、Playwright 輸出目錄、lock 檔,以及 `public/demo/graph.json`(generated 檔案,理由見 hook 需求)。

#### Scenario: Format 一致

- **WHEN** 開發者執行 `npm run format`
- **THEN** Prettier 對全 repo 重寫格式,後續再執行 `prettier --check .` 結束代碼為 0

### Requirement: 單元測試(Vitest)

單元與 component 測試 SHALL 以 Vitest 執行:`npm run test` 為 watch 模式,`npm run test:ci` 為一次性、非互動執行並以結束代碼回報結果。component 測試 SHALL 於 DOM 模擬環境執行;測試檔以 `*.test.ts` / `*.test.tsx` 與被測程式碼並置。`npm run test:ci` MUST 不需後端、網路連線或真實瀏覽器。

#### Scenario: 離線通過單元測試

- **WHEN** CI 於無外部網路的環境執行 `npm run test:ci`
- **THEN** 結束代碼為 0,且輸出列出 `src/shared/fixtures/showcaseGraph.test.ts` 通過

### Requirement: E2E 測試(Playwright)

E2E 測試 SHALL 以 Playwright 撰寫並置於 `tests/`;`npm run e2e` SHALL 自行啟動 dev server(webServer)並於結束時關閉,clean checkout 上不需另開終端、後端或 Docker 即可執行。

倉庫 SHALL 至少包含兩個 spec:

1. **Demo 模式 showcase smoke**:開啟 `/`,斷言 `[data-testid="graph-canvas"]` 掛載,並斷言依 fixture 內容而存在的 legend 控制項(如 `ingress-toggle`、`edge-legend-row-network-hop`)出現。
2. **Fetch 路徑 round trip**:以 Playwright route 將 `config.json` 回應為 `demoMode: false` 且 `endpoints.graph` 指向 `/demo/graph.json` 的設定,斷言同一組元素出現。此 spec 證明單元測試無法證明的事:generated payload 經 HTTP 取回、通過 `normalizeGraph`、到 cytoscape 掛載的完整資料路徑。

E2E MUST 可由開發者本機以單一指令觸發(`npm run e2e`),且兩個 spec 已穩定,因此**同時列入 CI 必要 gate**(見「CI Workflow(精簡版)」)。兩者跑的是同一個 `npm run e2e`:CI 不得擁有一條本機無法重現的 e2e 路徑。

#### Scenario: Clean checkout 上一個指令跑完 e2e

- **WHEN** 開發者於 clean checkout 執行 `npm install`、`npx playwright install` 後執行 `npm run e2e`
- **THEN** 兩個 spec 皆通過,期間沒有任何後端程序在執行

### Requirement: Pre-commit 與 Pre-push Hook

專案 SHALL 以**版本控管的** `.githooks/` 腳本設定 git hook,由 `prepare` npm script 於 `npm install` 時把 `core.hooksPath` 指向該目錄(亦可手動 `npm run init-hooks`);MUST NOT 使用 `husky` —— hook 進版本庫即可被 review、跨機一致,且少一個相依。

`pre-commit` SHALL 對 staged 檔案執行 `lint-staged`(設定於 `.lintstagedrc.json`:`eslint --cache --fix` + `prettier --write`);`pre-push` SHALL 依序執行 `npm run lint`、`npm run typecheck`、`npm run fixture:check`、`npm run test:ci`;任一失敗 MUST 阻擋 commit / push。

`fixture:check` MUST 在 hook 鏈中,因為 `public/demo/graph.json` 是 generated output:改了 fixture 卻忘記 `npm run fixture:build`,若不在此攔下就要等到 CI 才會發現。**generated 檔案 MUST 列入 `.prettierignore`** —— `pre-commit` 的 prettier 與 generator 的輸出格式若不一致(prettier 會把短陣列收成一行,`JSON.stringify(…, null, 2)` 一律展開),兩者會在每次 commit 互相覆寫,使 `fixture:check` 永遠失敗。

#### Scenario: Pre-commit 阻擋 lint error

- **WHEN** 開發者 commit 一個含 ESLint error 的 staged 變更
- **THEN** hook 執行 `lint-staged`,失敗並阻擋 commit,終端顯示 ESLint 錯誤訊息

#### Scenario: Pre-push 攔下未重新產生的 fixture 變更

- **WHEN** 開發者改了 `src/shared/fixtures/showcaseGraph.ts` 卻未執行 `npm run fixture:build` 便 push
- **THEN** `pre-push` 於 `fixture:check` 失敗並阻擋 push,訊息指出補救指令

### Requirement: CI Workflow(精簡版)

GitHub Actions CI workflow SHALL 於 pull request 與 push 到 `main` 時提供單一 job,依序執行 `npm ci` → `typecheck` → `lint` → `fixture:check` → `test:ci` → `e2e` → `build`;任一步失敗 MUST 標記 PR check failed,阻擋 merge。Node 版本 MUST 讀自 `.nvmrc`,不得在 workflow 內另行硬編。`e2e` 之前 MUST 於 job 內安裝 Playwright 的 Chromium(`npx playwright install --with-deps chromium`);瀏覽器安裝是 CI 的環境準備,不列入上述 gate 鏈的語意。

**精簡版:單一 job,無平行矩陣、無獨立 E2E workflow。** E2E 與其餘檢查同在這一個 job 內依序執行(見「E2E 測試(Playwright)」)。Container image 的建置與推送由 `container-deployment` capability 另行規範,不在此 job 內。

#### Scenario: CI 通過所有檢查

- **WHEN** PR 被推送
- **THEN** GitHub Actions「Checks」清單顯示一個 `ci` job,typecheck / lint / fixture:check / test:ci / e2e / build 六步皆通過

### Requirement: Makefile 捷徑

repo 根目錄 SHALL 提供 `Makefile`,預設目標 `help` 列出所有目標與一行說明;至少包含 `install`、`dev`、`lint`、`typecheck`、`test`、`e2e`、`build`、`fixture-build`、`fixture-check`、`check`(等同 `pre-push` 的完整 gate 鏈)。每個目標 MUST 為對應 npm script 的薄包裝,不得含 npm script 沒有的額外邏輯;`container-deployment` capability 定義的 image / deploy 目標 SHALL 收錄於同一份 `Makefile`。

#### Scenario: make help 列出目標

- **WHEN** 於 clean checkout 執行 `make`(無參數)
- **THEN** 輸出列出上述每個目標及其說明,且 `make check` 的執行結果與 `pre-push` hook 一致

### Requirement: 開發者文件

`README.md` SHALL 包含:Prerequisites(僅 Node 22+;Docker 只在建置 container image 時需要)、Quick Start(`npm install` → `npm run dev` → 開啟瀏覽器看到 showcase graph)、Demo data(fixture 位置、如何修改、`npm run fixture:build` / `fixture:check`)、Connecting to a backend(`dev/config.local.json` + `KSG_DEV_PROXY_TARGET`)、Architecture overview、Linting & testing、Build & deploy(指向 `deploy/` 文件)、Troubleshooting。

Quick Start MUST 可在 clean checkout 上完成,且 MUST NOT 提及任何後端服務、metrics store、Kubernetes 叢集、Docker、image tag 或憑證。文件 SHALL 說明 demo 資料來源與修改方式。

Troubleshooting SHALL 涵蓋:dev server port 衝突、`public/demo/graph.json` 過期(`fixture:check` 失敗)、使用絕對後端 URL 時的 CORS 錯誤(改用 dev proxy 或後端允許前端 origin)、`config.json` 缺少必要端點時的錯誤畫面。

#### Scenario: Quick Start 不依賴任何外部服務

- **WHEN** 新進開發者於 clean checkout 依 Quick Start 逐步操作
- **THEN** 瀏覽器渲染完整 showcase graph,且沒有任何步驟提及後端、Docker 或叢集

### Requirement: 型別化 fixture 是 demo 資料的單一來源

`src/shared/fixtures/showcaseGraph.ts` SHALL 匯出以 `src/shared/types/wire.ts` 的 `WireGraph` 型別標註的 `SHOWCASE_GRAPH`,作為 demo 模式、Vitest 測試、Playwright spec 與 fixture 覆蓋測試**唯一**讀取的圖。demo 模式 SHALL 直接以模組匯入方式讀取此 fixture。倉庫 MUST NOT 含任何需要連線到執行中的 kube-state-graph 伺服器、Prometheus 相容儲存或 Kubernetes 叢集才能運作的腳本、測試或開發流程。

`WireGraph` 標註是機制而非裝飾:`normalizeGraph` 接受 `unknown` 並於執行期驗證,app 新學會讀取的欄位在編譯期原本不可見;為 fixture 標型別,讓「教 normalize 認得新欄位卻忘了 demo」成為 `npm run typecheck` 失敗,而非無人重看的空白。

Fixture SHALL 帶完整的後端回應 envelope —— `apiVersion`、`clusters`、`elements` —— 而非只有 `elements`,使 demo 演練的 body 形狀與部署時收到的一致。`clusters` SHALL 只列 Kubernetes cluster 名稱;ONTAP cluster 名稱 MUST NOT 出現其中。

Fixture 帶有任何後端版本皆不會發出的欄位時(`status`、`alerts`、`time_records`,以及 `switch` / `network` kind 與其 `switch-to-switch` / `node-to-switch` edge —— 這些是前端自有的擴充面),fixture 與 wire 型別 MUST 以註解記錄該來源,使讀者不會把前端專屬欄位誤認為後端契約而「修正」後端。

#### Scenario: 倉庫內無任何後端相依

- **WHEN** 檢視 `dev/`、`tests/`、`.github/workflows/` 下每一個檔案與 `package.json` 的每個 script
- **THEN** 沒有任何檔案或 script 需要可連線的 kube-state-graph、VictoriaMetrics 或 Kubernetes 端點才能成功執行

#### Scenario: normalize 新增 wire 欄位但 fixture 未覆蓋時 typecheck 失敗

- **WHEN** `WireGraph` 新增一個必要欄位,而 `SHOWCASE_GRAPH` 未同步更新
- **THEN** `npm run typecheck` 失敗

### Requirement: 範例 payload 由 fixture 產生,漂移即失敗

`public/demo/graph.json` SHALL 為 `SHOWCASE_GRAPH` 序列化後的完整 `GET /v1/graph` 回應 body,由 `npm run fixture:build` **產生**且永不手改。此檔案的角色有二:(1) 唯一的範例 payload —— 後端開發者與運維者可拿它與真實 `GET /v1/graph` 回應比對;(2) 由 dev server 與 container image 以 `<base>/demo/graph.json` 提供,使 `endpoints.graph` 指向它即可在**沒有後端**的情況下走完真實的 fetch 路徑。

- `npm run fixture:build` SHALL 以 Node 原生 type stripping 匯入 TS fixture,以 `JSON.stringify(…, null, 2)` 加結尾換行寫出該檔案;內容相同時 MUST NOT 改動檔案。
- `npm run fixture:check` SHALL 於已提交檔案與 fixture 現況不一致時以非零結束,並點名 `npm run fixture:build` 為補救指令。
- 該檢查 SHALL 於 CI 與 `pre-push` hook 中執行。

#### Scenario: 對已同步的樹重新產生為 no-op

- **WHEN** fixture 與 `public/demo/graph.json` 一致時執行 `npm run fixture:build`
- **THEN** 檔案內容不變,`git status` 無變更,且 `npm run fixture:check` 結束代碼為 0

#### Scenario: 未重新產生的 fixture 修改使 CI 失敗

- **WHEN** `SHOWCASE_GRAPH` 被修改而 `public/demo/graph.json` 未更新
- **THEN** `npm run fixture:check` 以非零結束並印出 `npm run fixture:build` 補救指令

#### Scenario: 範例 payload 走真實 fetch 路徑

- **WHEN** `config.json` 設定 `demoMode: false`、`endpoints.graph: "/demo/graph.json"`,以 `npm run dev` 提供 app 並開啟瀏覽器
- **THEN** app 以 HTTP 取得 `/demo/graph.json`,經 `normalizeGraph` 後渲染出與 demo 模式相同的圖

### Requirement: Fixture 覆蓋 app 能畫出的每種 kind 與 edge type

`src/shared/fixtures/showcaseGraph.test.ts` SHALL 斷言 `normalizeGraph(SHOWCASE_GRAPH)` 產生:

- 空的 `errors` 陣列 —— partial-parse 通道是為真實後端出狀況而設,任何落入其中的都是本倉庫自己的錯;
- 沒有任何 edge 的 `source` 或 `target` 不在 fixture 自身的節點中,也沒有任何 node 的 `parent` 不在;
- `ICON_SVG_BY_KIND` 的**每一個** key 與 `EDGE_STYLE_BY_TYPE` 的**每一個** key 至少各有一個元素。

覆蓋 SHALL 以這兩張標準 map 為基準而非可過濾的子集,使虛擬的 `network` wrapper 也算數;錨定於此讓「把 kind 加進 map」與「在 demo 中展示它」成為同一件被強制的事。

測試套件 SHALL 額外釘住那些為了「被看見」而非僅「可解析」而存在的 demo 案例:全部三種 `ready_status` 值、一個加入 aggregate 的 claim 與一個未加入的並列、一條 QoS 上限的 storage edge 與一條無上限的並列、一個量測到的錯誤率與一個量測為零與一條未量測的 edge 並列、一個合法的極小速率且不得四捨五入為零、兩種 `labels.role` 的 ingress 形狀及其不同的 dash 與 visibility 行為;以及為 Sankey 視圖而設的:至少一條 `pvc-to-netapp-aggr` edge 同時帶 `read_bytes_per_sec` 與 `write_bytes_per_sec`,並有一條完全不帶儲存 throughput metrics(absent ≠ 0)。

#### Scenario: 新增可繪製 kind 卻無對應 fixture 元素時失敗

- **WHEN** `ICON_SVG_BY_KIND` 新增一個 key,而沒有任何 fixture 節點帶該 kind
- **THEN** `showcaseGraph.test.ts` 失敗,並點名未被覆蓋的 kind
