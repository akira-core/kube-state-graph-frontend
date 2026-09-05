## Why

`kube-state-graph-panel` 以 Grafana panel plugin 形式存在,UI 受限於 panel 邊界、`@grafana/ui` 主題、panel options editor、Infinity datasource 間接取數,以及 plugin 簽署與 Grafana 版本升級路徑。要為儲存 throughput 新增 Sankey 視圖並取得多視圖、路由、自有主題的完整 UI 控制權,單一 panel 模型已不合適。本 change 在此 repo 建立獨立的純前端 SPA:沿用 kube-state-graph 後端的 cytoscape.js 格式契約,完整移植 panel 的全部 UI 功能,並新增以儲存 I/O metrics 為權重的 Sankey 視圖。

後端另有一個為此形狀而生的端點。`GET /v1/graph` 是**工作負載為根**的:預設投影只留下位於連線邊上的 pod,其選擇器只定址 Kubernetes。儲存操作者問的是相反的問題——「這台 filer / 這個 aggregate 降級了,上面坐著哪些 claim、pod 與 Kubernetes node?」——後端因此提供 `GET /v1/storage-graph`:必填單值的 `az` / `env`、可自儲存端或工作負載端出發的 root 搜尋、多一層 `netapp-svm`、方向為 storage → workload 的固定 tier 鏈,以及**逐 tier 守恆**的流量權重。這些沒有一項能從 `/v1/graph` 的 body 推導。本 change 因此讓兩個視圖各走一個端點。

## What Changes

- **建立獨立 SPA 專案骨架**:React + TypeScript + Vite,Node 22,含 lint / format / typecheck / unit test / e2e 工具鏈與 git hooks。無任何 `@grafana/*` 依賴。
- **直連後端取數,兩個圖端點各服務一個視圖**:以 `fetch` 直接呼叫 `GET /v1/graph`(Graph 視圖)與 `GET /v1/storage-graph`(Sankey 視圖),以及 node detail 子端點(`code_changes`、`config_changes`、`dashboard`)、篩選選項來源(`/v1/edge-types` 與 Prometheus 相容的 label values),取代 Infinity datasource 與 `getDataSourceSrv()`。兩個圖端點回傳同一個 cytoscape.js 形狀,故共用同一組 wire 型別與同一個 normalize boundary,但**取數、狀態與失敗完全獨立**;storage-graph 為 lazy——使用者未進入 Sankey 視圖前不發出。保留 fixture 驅動的 demo 模式(兩份 fixture,各對應一個端點):clean checkout 不需後端即可渲染完整圖。
- **所有 URL 皆可由 runtime config 設定**:每個後端端點(graph、storageGraph、labelValues、edgeTypes、code_changes、config_changes、dashboard)各自獨立設定;設定於**執行期**載入(容器啟動時掛載的 `config.json`),不於 build 時烘入,同一個 image 可部署至不同環境。`graph` 為非 demo 模式的唯一必要端點;`storageGraph` 缺席時 Sankey 視圖顯示未設定說明而 Graph 視圖完全不受影響。設定不合法時明確報錯,絕不靜默退回 demo 模式。
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
- **新增 Sankey 儲存流量視圖,由 `GET /v1/storage-graph` 驅動**:沿後端固定的六層 tier 鏈 `netapp-node → netapp-aggr → netapp-svm → pvc → pod → node`(方向 storage → workload)呈現,link 權重直接取自每條 `storage-flow` edge 的 `read_bytes_per_sec` / `write_bytes_per_sec`——**前端不再自行加總或均分**,因為後端已保證逐 tier 守恆並已完成 RWX claim 的均分(以 `labels.attribution="split"` 標記)。讀 / 寫可區分;無 metrics 的 edge 不畫入(absent ≠ 0)。視覺語彙為盒卡節點加共用比例尺的漸層緞帶,並提供圖內縮放平移與專注模式。視圖自帶其估計選擇器(`az` / `env` **必填單值**,後端對缺值與多值一律 400)與 root 搜尋(`ontap_cluster` / `node` / `aggr` / `svm` / `pod`,可自兩端出發、可混用)。以主流 charting 框架繪製,選型於 design 決定。
- **多視圖 app shell**:Graph 與 Sankey 兩視圖間切換(client-side routing),各持有**自己的**資料來源與載入生命週期(重新載入與自動刷新只作用於當前視圖的來源);唯一跨視圖共用的輸入是檢視時間範圍。主題切換、pod-parent mode、legend 收合等 view state 為 app 自有狀態。
- **新增檢視時間範圍(view time range)**:取代 panel 自 Grafana dashboard 繼承的時間範圍。導覽列提供相對區間(1h / 6h / 24h / 7d)與自訂絕對區間,消費端有三個:兩個圖端點的 `start` / `end`(兩者皆為必填,且沒有相對形式,故於每次請求送出當下解析——一個被凍結的視窗最終會落到保留期外,回傳一個與壞掉的管線無法區分的空圖),以及 node detail 的 Dashboard 查詢(`from_time` / `to_time`);alert「Last occurred」點擊將其設為該時刻 ±5 分鐘。
- **新增後端 graph 過濾(`graph-filters`)**:取代 Grafana dashboard 變數所做的窄化。導覽列之下的過濾列提供 cluster / AZ / env / namespace / edge type 與投影(`prune`)控制,以查詢參數送往後端而非於前端套用;選項自 pod inventory 的 label values 與後端 edge-type 目錄列舉。
- **不移植**(Grafana 專屬,無對應概念):`pod-list-variable-export`、`selected-pod-export`、panel options editor、`PanelPlugin` 註冊。原 panel option(佈局演算法、detail 端點等)改為 app 設定或 UI 控制。

## Capabilities

### New Capabilities

- `app-shell`:SPA 進入點、視圖路由(Graph / Sankey)、主題 token 與 dark / light 切換、檢視時間範圍(兩個圖端點與 Dashboard 查詢的共同來源)、全域 layout(頂部導覽 + 視圖專屬控制列 + 全幅視圖區)、**兩個獨立的資料生命週期**(graph 立即載入、storage-graph lazy)與只作用於當前視圖的重新載入 / 自動刷新。
- `runtime-config`:執行期設定契約——所有後端端點 URL(graph、storageGraph、labelValues、edgeTypes、code_changes、config_changes、dashboard)、demo 模式、預設佈局等;載入來源與優先序、schema 驗證、缺值行為(`storageGraph` 缺席只停用 Sankey 取數,不影響 Graph)、設定錯誤呈現。
- `container-deployment`:container image(靜態資產 + web server)、ConfigMap → runtime config 注入、Kubernetes manifests(Deployment / Service / ConfigMap)、健康檢查、SPA fallback routing。
- `dev-environment`:Vite + TypeScript 專案結構、Node 22、ESLint / Prettier、Vitest 單元測試、Playwright e2e、git hooks、fixture build / drift check 腳本。
- `graph-data-source`:**兩個圖端點**的請求組裝與取數(`GET /v1/graph` 的時間範圍 + 篩選參數;`GET /v1/storage-graph` 的必填單值 `az` / `env` + root + lazy 規則)、各自獨立的 loading / error 狀態、兩份 fixture 的 demo 模式,以及兩端點共用的 `WireGraph` 型別與 `normalizeGraph` boundary(節點 kind 含 `netapp-svm`、edge type 含 `storage-flow` 與其 `labels.tier` / `labels.attribution`、RED / storage I/O metrics 聯集、usage / health / ready_status / hardware / perf、alerts、controller 聚合、worstStatus)——自 panel `graph-data-integration` 移植,去除 datasource / provisioning 需求。
- `graph-view`:cytoscape.js canvas 渲染、佈局演算法、compound 與 collapse、icon 編碼、edge 配色、status 外框、legend 與過濾、hover tooltip、pinned card、選取與 focus fade、空 / 錯誤狀態——自 panel `panel-rendering` 與 `node-icon-encoding` 移植,去除 Grafana theme / panel option 需求。
- `node-detail`:node detail panel 內容(attributes、Application / Containers、change history)、detail 子端點取數、Dashboard 按鈕的適用性判定 / 參數組裝 / URL 預取——自 panel `panel-rendering` 的 node detail 需求與 `node-dashboard-url` 移植,端點解析改為 runtime base URL。
- `graph-search`:搜尋列、hit 判定、miss fade、proxy hit、result list、locate——自 panel `graph-search` 移植。
- `pod-parent-mode`:`controller` / `node` 模式切換控制與 `applyPodParentMode` 拓樸轉換——自 panel `pod-parent-mode` 移植。
- `ingress-visibility-toggle`:ingress-gateway 節點集合辨識、隱藏切換、dashed 樣式——自 panel `ingress-visibility-toggle` 移植。
- `switch-tier-layout`:switch level 讀取與佈局約束——自 panel `switch-tier-layout` 移植。
- `node-group-compound`:panel 端合成的 node group 容器——自 panel `node-group-compound` 移植。
- `storage-flow-sankey`:自 `/v1/storage-graph` 的回應推導 Sankey 節點與 link(六層 tier、直接取用後端權重、讀 / 寫分流、缺值處理、無流量 root 的呈現)、估計與 root 選擇器、Sankey 渲染(盒卡節點與槽位、漸層緞帶與帶上數值、欄位標題、namespace 分組色條、圖外數字摘要)、圖區的縮放平移與專注模式、hover 高亮,以及與 Graph 視圖的互通(點選節點跳至 Graph 定位,並在目標不存在於 graph body 時給出可辨識的提示而非靜默失敗)。
- `graph-filters`:送往後端的 graph 過濾——cluster / AZ / env / namespace / edge type 與投影(`prune`)控制、其查詢參數對應、選項自 pod inventory label values 與後端 edge-type 目錄列舉、來源失敗時的降級——取代 Grafana dashboard 變數。

### Modified Capabilities

(無——本 repo `openspec/specs/` 為空,所有 capability 皆為新建。)

## Impact

- **新增程式碼**:整個 `src/` 樹(feature-first 結構,沿用 panel 慣例)、`tests/`、`vite.config.ts`、`package.json` 等專案設定。
- **新增依賴**(候選,最終於 design 定案):`react`、`react-dom`、`vite`、`typescript`;`cytoscape`、`cytoscape-fcose`、`cytoscape-dagre`、`cytoscape-expand-collapse`(與 panel 相同);Sankey 候選 —— `d3-sankey`(佈局)+ React 自繪 SVG、Apache ECharts(內建 sankey series)、`@nivo/sankey`;client-side router(如 `react-router`);測試 `vitest`、`@playwright/test`。
- **外部系統**:kube-state-graph 後端的 `GET /v1/graph`、`GET /v1/storage-graph`、`/v1/edge-types` 與 detail 子端點(`code_changes`、`config_changes`、`dashboard`),以及持有 pod inventory 的 Prometheus 相容 label-values API;每個 URL 皆由 runtime config 指定(需 CORS 允許前端 origin,或以 web server 反向代理 / dev proxy 處理)。**不改動後端契約**——`/v1/storage-graph`、`storage-flow` edge type、`netapp-svm` 節點與 `data.hardware` / `data.perf` / `data.alerts` 屬性皆為後端既有能力(見後端 change `add-netapp-storage-graph-api`),本 change 只是消費它們。
- **部署**:Kubernetes 叢集;新增 `Dockerfile`、web server 設定、`deploy/` manifests;CI 需建置與推送 image。
- **與 panel repo 的關係**:`src/shared/**` 與各 feature 純邏輯以複製移植方式帶入(非 monorepo、非套件依賴);兩 repo 之後獨立演進。fixture 需與後端契約同步,沿用 panel 的 `fixture:check` 防漂移機制。
- **非目標**:後端修改、Grafana 整合、認證 / 授權、多後端 instance 切換、Ingress / TLS 設定(由叢集運維提供)。
