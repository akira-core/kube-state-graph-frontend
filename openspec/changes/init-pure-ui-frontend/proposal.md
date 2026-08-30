## Why

`kube-state-graph-panel` 以 Grafana panel plugin 形式存在,UI 受限於 panel 邊界、`@grafana/ui` 主題、panel options editor、Infinity datasource 間接取數,以及 plugin 簽署與 Grafana 版本升級路徑。要為儲存 throughput 新增 Sankey 視圖並取得多視圖、路由、自有主題的完整 UI 控制權,單一 panel 模型已不合適。本 change 在此 repo 建立獨立的純前端 SPA:沿用 kube-state-graph 後端的 cytoscape.js 格式 `GET /v1/graph` 契約,完整移植 panel 的全部 UI 功能,並新增以儲存 I/O metrics 為權重的 Sankey 視圖。

## What Changes

- **建立獨立 SPA 專案骨架**:React + TypeScript + Vite,Node 22,含 lint / format / typecheck / unit test / e2e 工具鏈與 git hooks。無任何 `@grafana/*` 依賴。
- **直連後端取數**:以 `fetch` 直接呼叫 kube-state-graph graph 查詢端點(部署上通常為 `GET /v1/graph/service_graph`)與其 sibling 的 node detail 子端點(`code_changes`、`config_changes`、`dashboard`),取代 Infinity datasource 與 `getDataSourceSrv()`。保留 fixture 驅動的 demo 模式:clean checkout 不需後端即可渲染完整圖。
- **所有 URL 皆可由 runtime config 設定**:每個後端端點(graph、code_changes、config_changes、dashboard)各自獨立設定為完整 URL 或 base + path;設定於**執行期**載入(如容器啟動時掛載的 `config.json` / `window.__KSG_CONFIG__`),不於 build 時烘入,同一個 image 可部署至不同環境。缺少必要 URL 時明確報錯或退回 demo 模式。
- **以容器部署於 Kubernetes**:產出靜態資產由輕量 web server(如 nginx)提供的 container image;config 透過 ConfigMap 掛載注入;提供 Deployment / Service / ConfigMap manifests(或 Helm chart)與健康檢查端點。
- **移植 wire → 內部模型的 anti-corruption layer**:`WireGraph` 型別、`normalizeGraph`、`ICON_SVG_BY_KIND` 等 `src/shared/**` 純邏輯自 panel 移植,去除 Grafana 耦合;showcase fixture 為兩邊共用的單一假資料來源。
- **完整移植 graph 視圖**(cytoscape.js canvas),與 panel 功能對等:
  - 核心渲染:fcose / dagre 佈局、compound 容器與 collapse、kind → icon 編碼、edge type 配色、dark / light 主題、容器尺寸響應、空 / 載入 / 錯誤狀態
  - Legend:kind / edge-type 顯示切換、容器圖例、collapse-aware kind 列表、側邊收合
  - 互動:hover tooltip、pinned card、單一選取 + focus fade、node detail panel(Application / Containers / change history / Dashboard 按鈕)
  - Graph search:miss fade、proxy hit、result list、locate
  - Pod-parent mode:`controller` / `node` 兩種 compound 拓樸切換
  - Ingress visibility toggle:`ingress-gateway` 節點集合隱藏與 dashed 樣式
  - Switch-tier layout:自 `labels.level` 讀取 switch 層級並施加佈局約束
  - Node-group compound:panel 端合成的 `cluster > node group > node` 容器
- **新增 Sankey 儲存流量視圖**:以 `pvc-to-netapp-aggr` edge 的 `read_bytes_per_sec` / `write_bytes_per_sec` 為 link 權重,沿 `pod → pvc → netapp-aggr → netapp-node` 鏈呈現儲存 throughput 流向;讀 / 寫可區分;無 metrics 的 edge 不畫入(absent ≠ 0)。以主流 charting 框架繪製,選型於 design 決定。
- **多視圖 app shell**:Graph 與 Sankey 兩視圖間切換(client-side routing),共用同一份已載入 / 正規化的 graph 資料;主題切換、pod-parent mode、legend 收合等 view state 為 app 自有狀態。
- **新增檢視時間範圍(view time range)**:取代 panel 自 Grafana dashboard 繼承的時間範圍。導覽列提供相對區間(1h / 6h / 24h / 7d)與自訂絕對區間,唯一消費端為 node detail 的 Dashboard 查詢(`from_time` / `to_time`),alert「Last occurred」點擊將其設為該時刻 ±5 分鐘。
- **不移植**(Grafana 專屬,無對應概念):`pod-list-variable-export`、`selected-pod-export`、panel options editor、`PanelPlugin` 註冊。原 panel option(佈局演算法、detail 端點等)改為 app 設定或 UI 控制。

## Capabilities

### New Capabilities

- `app-shell`:SPA 進入點、視圖路由(Graph / Sankey)、主題 token 與 dark / light 切換、檢視時間範圍、全域 layout(頂部導覽 + 全幅視圖區)、共用 graph 資料狀態。
- `runtime-config`:執行期設定契約——所有後端端點 URL(graph、code_changes、config_changes、dashboard)、demo 模式、預設佈局等;載入來源與優先序、schema 驗證、缺值行為、設定錯誤呈現。
- `container-deployment`:container image(靜態資產 + web server)、ConfigMap → runtime config 注入、Kubernetes manifests(Deployment / Service / ConfigMap)、健康檢查、SPA fallback routing。
- `dev-environment`:Vite + TypeScript 專案結構、Node 22、ESLint / Prettier、Vitest 單元測試、Playwright e2e、git hooks、fixture build / drift check 腳本。
- `graph-data-source`:直連 `GET /v1/graph` 的取數與 loading / error 狀態、fixture demo 模式、`WireGraph` 型別與 `normalizeGraph` boundary(節點 kind、edge type、RED / storage I/O metrics 聯集、usage / health / ready_status、alerts、controller 聚合、worstStatus)——自 panel `graph-data-integration` 移植,去除 datasource / provisioning 需求。
- `graph-view`:cytoscape.js canvas 渲染、佈局演算法、compound 與 collapse、icon 編碼、edge 配色、status 外框、legend 與過濾、hover tooltip、pinned card、選取與 focus fade、空 / 錯誤狀態——自 panel `panel-rendering` 與 `node-icon-encoding` 移植,去除 Grafana theme / panel option 需求。
- `node-detail`:node detail panel 內容(attributes、Application / Containers、change history)、detail 子端點取數、Dashboard 按鈕的適用性判定 / 參數組裝 / URL 預取——自 panel `panel-rendering` 的 node detail 需求與 `node-dashboard-url` 移植,端點解析改為 runtime base URL。
- `graph-search`:搜尋列、hit 判定、miss fade、proxy hit、result list、locate——自 panel `graph-search` 移植。
- `pod-parent-mode`:`controller` / `node` 模式切換控制與 `applyPodParentMode` 拓樸轉換——自 panel `pod-parent-mode` 移植。
- `ingress-visibility-toggle`:ingress-gateway 節點集合辨識、隱藏切換、dashed 樣式——自 panel `ingress-visibility-toggle` 移植。
- `switch-tier-layout`:switch level 讀取與佈局約束——自 panel `switch-tier-layout` 移植。
- `node-group-compound`:panel 端合成的 node group 容器——自 panel `node-group-compound` 移植。
- `storage-flow-sankey`:自正規化 graph 推導 Sankey 節點與 link(tier、權重、讀 / 寫分流、缺值處理)、Sankey 渲染、hover / 選取與 Graph 視圖的互通(如點選 Sankey 節點可跳至 Graph 定位)。

### Modified Capabilities

(無——本 repo `openspec/specs/` 為空,所有 capability 皆為新建。)

## Impact

- **新增程式碼**:整個 `src/` 樹(feature-first 結構,沿用 panel 慣例)、`tests/`、`vite.config.ts`、`package.json` 等專案設定。
- **新增依賴**(候選,最終於 design 定案):`react`、`react-dom`、`vite`、`typescript`;`cytoscape`、`cytoscape-fcose`、`cytoscape-dagre`、`cytoscape-expand-collapse`(與 panel 相同);Sankey 候選 —— `d3-sankey`(佈局)+ React 自繪 SVG、Apache ECharts(內建 sankey series)、`@nivo/sankey`;client-side router(如 `react-router`);測試 `vitest`、`@playwright/test`。
- **外部系統**:kube-state-graph 後端 graph 查詢端點(`/v1/graph/service_graph`)與 detail 子端點(`code_changes`、`config_changes`、`dashboard`),每個 URL 皆由 runtime config 指定(需 CORS 允許前端 origin,或以 web server 反向代理 / dev proxy 處理)。不改動後端契約。
- **部署**:Kubernetes 叢集;新增 `Dockerfile`、web server 設定、`deploy/` manifests;CI 需建置與推送 image。
- **與 panel repo 的關係**:`src/shared/**` 與各 feature 純邏輯以複製移植方式帶入(非 monorepo、非套件依賴);兩 repo 之後獨立演進。fixture 需與後端契約同步,沿用 panel 的 `fixture:check` 防漂移機制。
- **非目標**:後端修改、Grafana 整合、認證 / 授權、多後端 instance 切換、Ingress / TLS 設定(由叢集運維提供)。
