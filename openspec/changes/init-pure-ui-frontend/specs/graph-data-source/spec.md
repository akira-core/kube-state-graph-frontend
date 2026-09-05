## Purpose

定義 app 如何取得 kube-state-graph 的圖資料。後端提供**兩個獨立的圖端點**,各服務一個視圖:

- `GET /v1/graph`(runtime config 的 `endpoints.graph`)—— Graph 視圖的工作負載拓樸;
- `GET /v1/storage-graph`(runtime config 的 `endpoints.storageGraph`)—— Sankey 視圖的儲存流量 DAG。

兩者回傳**同一個 cytoscape.js 形狀**的 body,故共用同一個 normalize boundary 與同一套 wire 型別;差異只在請求參數、投影規則與所帶的 node / edge 型別。`demoMode` 下各以一份內建 fixture 取代取數。

本 capability 涵蓋:兩個端點的請求組裝與取數、載入 / 錯誤 / 重新載入 / 自動刷新狀態的傳遞,以及 normalize boundary(anti-corruption layer)把 wire payload 驗證並映射為 app 內部 cytoscape.js 元素模型的完整契約:節點 kind、edge type、RED / 儲存 I/O metrics 聯集、usage / health / ready_status / hardware / perf、alerts、controller 聚合與 worstStatus。Sankey **視圖**如何消費 storage-graph body(tier、模式、選擇器、空狀態)由 `storage-flow-sankey` 規範。

## ADDED Requirements

### Requirement: 直連後端取數(`GET endpoints.graph`)與 demo 模式

App SHALL 以瀏覽器原生 `fetch` 直接向 runtime config 中 `endpoints.graph` 所指定的 URL 發出 `GET` 請求(request header 帶 `Accept: application/json`)取得 **Graph 視圖**的圖資料,不經任何中介 datasource 層。請求 MUST 於 app 啟動(runtime config 載入完成)時發出一次;之後的重新取數由「重新載入與自動刷新」定義。此端點 MUST NOT 用於 Sankey 視圖——Sankey 走 `endpoints.storageGraph`,見「storage-graph 取數」。

`endpoints.graph` 的 **origin 與路徑** MUST 原樣使用——絕對 URL(如 `https://ksg.example/v1/graph`)與 root-relative URL(如 `/api/v1/graph`,由同源 reverse proxy 轉發)皆合法,app MUST NOT 自行拼接、改寫或推導**路徑**(例如 MUST NOT 於其後補上 `/service_graph` 或任何子路徑)。app 只附加查詢參數,依「graph 請求參數組裝」定義;端點自帶的 query string MUST 保留,同名參數由 app 的值取代。

回應 body MUST 以 JSON 解析後、以 `unknown` 型別交付 normalize boundary 驗證;app MUST NOT 對 payload 做任何型別斷言或信任(包含 `apiVersion` 與 `clusters` 欄位),所有欄位的存在與型別皆由 normalize boundary 逐一驗證。

當 runtime config 的 `demoMode` 為 `true` 時,app SHALL 改以內建的 showcase fixture(型別 `WireGraph`,與 panel 共用的單一假資料來源)作為 payload 送入**同一個** normalize boundary,且 MUST NOT 對 `endpoints.graph`(或任何後端端點)發出網路請求;clean checkout 在無後端的情況下 MUST 能渲染完整的圖。Sankey 於 demo 模式下改用**第二份** fixture,見「storage-graph 取數」。`demoMode` 為 `false` 且缺 `endpoints.graph` 時,graph data source MUST NOT 發出請求,並依 runtime-config capability 的缺值規則呈現設定錯誤。

CORS 允許或同源反向代理屬部署責任(見 container-deployment capability),graph data source 不做任何額外處理。

#### Scenario: 啟動時向設定的 URL 取數

- **WHEN** runtime config 載入完成,`demoMode` 為 `false` 且 `endpoints.graph` 為 `https://ksg.example/v1/graph`
- **THEN** app 對該 URL 發出恰好一次 `GET` 請求(路徑為 `/v1/graph`,查詢參數依「graph 請求參數組裝」),header 含 `Accept: application/json`
- **AND** 回應 body 經 JSON 解析後以 `unknown` 交付 normalize boundary,產出的 elements 供 graph-view 使用

#### Scenario: root-relative URL 原樣使用

- **WHEN** `endpoints.graph` 為 `/api/v1/graph`
- **THEN** 請求送往目前 origin 下的 `/api/v1/graph`,app 不對路徑做任何拼接或改寫

#### Scenario: 兩個端點各自取數

- **WHEN** `endpoints.graph` 為 `/api/v1/graph`、`endpoints.storageGraph` 為 `/api/v1/storage-graph`,使用者載入 Graph 視圖後切換至 Sankey 視圖
- **THEN** Graph 視圖的請求只送往 `/api/v1/graph`,Sankey 的請求只送往 `/api/v1/storage-graph`;兩者的 loading / error 狀態互相獨立,任一失敗 MUST NOT 影響另一個視圖已載入的資料

#### Scenario: demo 模式不發出網路請求

- **WHEN** runtime config 的 `demoMode` 為 `true`(無論 `endpoints.graph` 是否存在)
- **THEN** app 不對任何後端端點發出網路請求,showcase fixture 經同一個 normalize boundary 產出 elements,graph 完整渲染

#### Scenario: 非 demo 模式缺 endpoints.graph 時不取數

- **WHEN** `demoMode` 為 `false` 且 runtime config 缺 `endpoints.graph`
- **THEN** graph data source 不發出任何請求,app 呈現 runtime-config capability 定義的設定錯誤,而非空白畫面或例外

#### Scenario: 回應不被信任

- **WHEN** 後端回應為合法 JSON 但形狀與契約不符(例如頂層為陣列,或 `elements` 為字串)
- **THEN** app 不拋出例外;normalize boundary 以 `errors` 回報形狀錯誤,錯誤狀態依「載入與錯誤狀態傳遞」呈現

### Requirement: graph 請求參數組裝(時間範圍與篩選)

每次對 `endpoints.graph` 取數時,app SHALL 由**檢視時間範圍**(見 `app-shell`)與 Graph 視圖的篩選選擇組出查詢參數,附加於設定的 URL 之後:

- `start` / `end`:MUST 於**送出當下**由檢視時間範圍解析為 Unix 秒後送出,且 MUST 恆送。相對區間(如 `6h`)MUST NOT 於選取當下凍結為固定值——每次請求重讀時鐘,否則視窗停止移動,最終落到儲存保留期之外,後端會回一個與「管線壞掉」無法區分的空圖。
- `prune`:MUST 恆送 `true` / `false`(即使為預設值),使一個被擷取的請求能自證其投影。
- `cluster` / `az` / `env` / `namespace` / `edge_type`:每個維度為一個字串列表,非空時以**同名重複參數**送出(後端於同名內取 OR、跨參數取 AND),空列表時 MUST 完全不送該參數。
- 上述以外的參數 MUST NOT 送出。前端欄位名到參數名的轉換(`edgeType` → `edge_type`)MUST 只發生在此一處。

**選擇**改變(時間範圍選項、任一篩選維度、`prune`)MUST 觸發一次重新取數;**時鐘前進**本身 MUST NOT 觸發任何請求——重新取數的判定 MUST 依選擇而非依組出的 URL,否則相對區間會每次 render 都產生不同 URL 而無限重取。

後端以 400 拒絕請求時(如 `missing_start` / `invalid_range`),app MUST 以「載入與錯誤狀態傳遞」的 error 狀態呈現後端回報的 `reason` 與訊息,MUST NOT 靜默重試或降級為 demo 資料。

#### Scenario: 相對區間於每次請求重解析

- **WHEN** 檢視時間範圍為 `6h`,app 於 `T` 與 `T+30s`(自動刷新)各取數一次
- **THEN** 兩次請求的 `start` / `end` 不同,分別為 `[T-6h, T]` 與 `[T+30s-6h, T+30s]`,而非同一組凍結值

#### Scenario: 篩選以重複參數送出,空維度不送

- **WHEN** 篩選為 `cluster: []`、`az: ['zone-a']`、`env: ['prod', 'dev']`、`namespace: []`、`edgeType: ['pod-calls-pod']`、`prune: false`
- **THEN** 請求含 `az=zone-a&env=prod&env=dev&edge_type=pod-calls-pod&prune=false` 與 `start` / `end`,且完全不含 `cluster` 與 `namespace` 參數

#### Scenario: 時鐘前進不觸發請求

- **WHEN** 檢視時間範圍為 `1h` 且無任何選擇變更,元件連續 re-render
- **THEN** app 不發出任何新的 graph 請求

#### Scenario: 後端 400 呈現為錯誤狀態

- **WHEN** 後端以 400 與 `reason: "invalid_range"` 回應
- **THEN** 資料狀態為 `error`,錯誤訊息可讀到該 `reason`,且既有資料(若有)依「重新載入與自動刷新」保留

### Requirement: storage-graph 取數(`GET endpoints.storageGraph`)

Sankey 視圖的資料 SHALL 來自對 `endpoints.storageGraph` 的獨立 `GET` 請求(header 帶 `Accept: application/json`),與 `endpoints.graph` 為**兩個互不相干的資料來源**:各自的 in-flight 請求、loading / error 狀態、最後成功載入時間與重試皆獨立。回應 body MUST 以 `unknown` 交付**同一個** normalize boundary(兩端點的 body 為同一形狀契約)。

請求 MUST 為 **lazy**:僅於使用者首次進入 Sankey 視圖、且 `az` 與 `env` 皆已選定時發出第一次;未進入該視圖前 MUST NOT 發出任何 storage-graph 請求。

查詢參數:

- `start` / `end`:與 graph 請求同一規則(檢視時間範圍、送出當下解析、恆送)。
- `az` / `env`:MUST **各恰好送出一個值**。後端對缺值回 400 `missing_az` / `missing_env`、對重複值回 400 `invalid_scope`,故 app MUST 於兩者皆選定前**不發出請求**,MUST NOT 送出空值、MUST NOT 送出多個值,亦 MUST NOT 自行挑選其一。
- `cluster` / `namespace`:選用、可重複的收斂條件,非空時以同名重複參數送出。
- root 選擇器:`ontap_cluster` / `node` / `aggr` / `svm` / `pod`,各為可重複的字串列表,非空時以同名重複參數送出;`pod` 的值 MUST 為 `<namespace>/<pod-name>` 形式(app 於送出前 MUST 驗證恰有一個 `/` 且兩段皆非空,不合法時不送出該值並於控制項就地提示)。全部為空時等同「該 estate 的完整儲存流量」。
- `edge_type` / `prune` MUST NOT 送出(後端會忽略,但送出會讓被擷取的請求誤導讀者)。

`az` / `env` / root / `cluster` / `namespace` 任一改變 MUST 觸發一次重新取數(視圖已進入時);與 graph 請求同理,時鐘前進本身 MUST NOT 觸發請求。後端 400 的 `reason` MUST 原樣呈現於錯誤狀態。

`demoMode` 為 `true` 時,app SHALL 以第二份內建 fixture(`/v1/storage-graph` 形狀,型別同為 `WireGraph`)送入同一個 normalize boundary,且 MUST NOT 發出任何請求;fixture 內容 MUST NOT 隨 `az` / `env` / root 的選擇改變。`demoMode` 為 `false` 且缺 `endpoints.storageGraph` 時 MUST NOT 發出請求,並依 runtime-config 的缺席規則由 Sankey 視圖呈現未設定狀態(非設定錯誤畫面)。

#### Scenario: az / env 齊備才發出第一次請求

- **WHEN** 使用者首次進入 Sankey 視圖,`az` 已選 `zone-a` 但 `env` 尚未選定
- **THEN** app 不發出任何 storage-graph 請求;使用者接著選定 `env: prod` 後,app 發出恰好一次請求,其查詢字串含 `az=zone-a&env=prod` 與 `start` / `end`,不含 `edge_type` 與 `prune`

#### Scenario: 未進入 Sankey 視圖不取數

- **WHEN** 使用者停留在 Graph 視圖,graph 資料完成多次自動刷新
- **THEN** 期間對 `endpoints.storageGraph` 的請求數為 0

#### Scenario: root 以重複參數送出並可混用

- **WHEN** 使用者選定 root `aggr: ['aggr1']` 與 `pod: ['shop/orders-0']`
- **THEN** 請求含 `aggr=aggr1&pod=shop%2Forders-0`,兩者一併送出(兩側交集的語意由後端決定,app 不自行過濾)

#### Scenario: 不合法的 pod root 不送出

- **WHEN** 使用者於 pod root 輸入 `orders-0`(無 `/`)
- **THEN** app 不將其加入請求,控制項就地提示需為 `<namespace>/<pod>` 形式,且不發出會被後端以 400 `invalid_scope` 拒絕的請求

#### Scenario: 兩個來源的錯誤互不牽連

- **WHEN** storage-graph 請求回應 HTTP 500,而 graph 請求成功
- **THEN** Sankey 視圖呈現其自身的錯誤狀態,Graph 視圖的資料與狀態完全不受影響;反之亦然

### Requirement: 載入與錯誤狀態傳遞

每個資料來源(graph 與 storage-graph)SHALL 各自向 app 其餘部分公開**一份形狀相同、內容獨立**的資料狀態,至少含 `{ status, elements, errors, error, hasPayload }`:`status` 為 `idle` / `loading` / `ready` / `error` 之一(app 自有狀態,無外部 data state 可依賴);`elements` 為 normalize boundary 產出的 cytoscape.js elements;`errors` 為 normalize boundary 的 partial-parse 警告(供 graph-view 的警告 banner 顯示);`error` 為使用者可讀的錯誤訊息(取數失敗或 normalize 失敗時);`hasPayload` 區分「尚未取得任何可辨識的 graph payload」與「payload 成功載入但正規化出零元素」。

取數失敗 MUST 逐類判定並產生**具名**的使用者可讀訊息:

- HTTP 回應非 2xx:訊息 MUST 含設定的 URL 與 HTTP status code(如 `GET https://ksg.example/v1/graph failed: 503`)。
- 網路錯誤(`fetch` reject、DNS / 連線失敗、CORS 阻擋):訊息 MUST 含設定的 URL 並指明為網路錯誤。
- 回應 body 非合法 JSON:訊息 MUST 含設定的 URL 並指明 JSON 解析失敗;MUST NOT 把原始 body 全文塞入訊息。
- normalize boundary 回報形狀錯誤(零元素且 `errors` 非空):`error` 為 `errors` 的首則訊息。

`hasPayload` MUST 為 `false` 於:尚未取得回應(`idle` / 首次 `loading`)、HTTP / 網路 / JSON 錯誤;MUST 為 `true` 於 payload 已成功解析為 JSON 並交付 normalize boundary(包含合法的空 graph `{ nodes: [], edges: [] }`,以及形狀錯誤的 payload)。graph-view 據此區分 loading / error / empty 三種狀態 UI,MUST NOT 把「沒拿到資料」呈現為「graph 是空的」。

#### Scenario: 取資料並 normalize

- **WHEN** `GET endpoints.graph` 回傳 2xx 且 body 為合法的 graph payload
- **THEN** 狀態依序為 `loading` → `ready`,`elements` 為 normalize 產出,`error` 為 `undefined`,`hasPayload` 為 `true`

#### Scenario: HTTP 非 2xx 回應

- **WHEN** `GET https://ksg.example/v1/graph` 回傳 `503`
- **THEN** 狀態為 `error`,`error` 訊息含 `https://ksg.example/v1/graph` 與 `503`,`hasPayload` 為 `false`,graph-view 顯示錯誤狀態而非破損的 canvas

#### Scenario: 網路錯誤

- **WHEN** 對 `endpoints.graph` 的 `fetch` 因連線失敗或 CORS 阻擋而 reject
- **THEN** 狀態為 `error`,`error` 訊息含設定的 URL 並指明網路錯誤,`hasPayload` 為 `false`

#### Scenario: 回應非合法 JSON

- **WHEN** `GET endpoints.graph` 回傳 2xx 但 body 為 HTML(例如 reverse proxy 的錯誤頁)
- **THEN** 狀態為 `error`,`error` 訊息含設定的 URL 並指明 JSON 解析失敗,`hasPayload` 為 `false`

#### Scenario: normalize 失敗時公開 error

- **WHEN** payload 為合法 JSON 但 normalize boundary 回傳零元素且 `errors` 非空(payload 形狀錯誤)
- **THEN** 狀態為 `error`,`elements` 為 `[]`,`error` 為 `errors` 的首則訊息,`hasPayload` 為 `true`

#### Scenario: 無 payload 與空 graph 可區分

- **WHEN** 請求尚未回應或取數失敗
- **THEN** `hasPayload` 為 `false`
- **AND** 收到 `{ nodes: [], edges: [] }` 的合法空 payload 時 `hasPayload` 為 `true`、`status` 為 `ready`、`elements` 為 `[]`,graph-view 顯示空狀態而非錯誤或載入中

#### Scenario: partial-parse 警告不阻擋渲染

- **WHEN** normalize boundary 產出非空 `elements` 且 `errors` 非空(部分項目被略過)
- **THEN** 狀態為 `ready`,`errors` 原樣公開供 graph-view 顯示警告 banner,`error` 為 `undefined`

### Requirement: 重新載入與自動刷新

App SHALL 提供使用者可觸發的「重新載入」動作,對**當前視圖的資料來源**重新發出與其第一次相同的 `GET` 請求——於 Graph 視圖為 `endpoints.graph`,於 Sankey 視圖為 `endpoints.storageGraph`(且 `az` / `env` 已齊備時才發出);當 runtime config 的 `refreshIntervalSeconds` 大於 0 時,app SHALL 以該秒數為週期自動重新取數,同樣只作用於當前視圖的來源(預設 0 表示關閉)。非當前視圖的來源 MUST NOT 被刷新——一個從未被開啟的 Sankey 視圖 MUST NOT 產生任何背景請求。`demoMode` 下重新載入 MUST NOT 發出網路請求(fixture 重新經 normalize boundary,結果不變),且 MUST NOT 啟動自動刷新計時器。

本需求的每一條規則 MUST 對**兩個來源各自獨立成立**:兩者各有自己的 in-flight 請求與「至多一個進行中」的限制,一個來源的刷新 MUST NOT 取消或延後另一個。

刷新期間(無論手動或自動)**先前成功渲染的圖 MUST 維持可見**,直到新 payload 經 normalize boundary 成功產出為止;成功後以新 elements 取代。刷新失敗(HTTP / 網路 / JSON / normalize 形狀錯誤)MUST 顯示錯誤指示(含與「載入與錯誤狀態傳遞」相同的具名訊息)但 MUST 保留最後一份成功的 elements 繼續渲染,MUST NOT 清空畫面或退回全頁錯誤狀態。刷新進行中 MUST 以非遮蔽式的指示呈現,MUST NOT 以全頁 loading 覆蓋已渲染的圖。

同一時間 MUST 至多一個進行中的請求:請求進行中時觸發重新載入或計時器到期 MUST NOT 再發第二個並行請求,以進行中請求的結果為準。

View state MUST 跨刷新保留,與 graph-view / graph-search / pod-parent-mode / node-group-compound 各 capability 定義的「data refresh preserve」行為一致:selection(若該節點仍存在)、collapse 狀態(desired ∩ present 對帳)、kind / edge-type / ingress 過濾、search query 與 pod-parent mode 皆 MUST NOT 因新 elements 而重設;被新 payload 移除的節點依各 capability 的規則處理(如取消選取、清除 pinned card)。

#### Scenario: 手動重新載入

- **WHEN** 使用者觸發「重新載入」
- **THEN** app 對 `endpoints.graph` 再發一次 `GET` 請求,顯示非遮蔽式的刷新指示,既有圖維持可見;回應成功後 elements 更新

#### Scenario: 自動刷新依設定週期

- **WHEN** `refreshIntervalSeconds` 為 `30`
- **THEN** app 每 30 秒自動重新取數
- **AND** `refreshIntervalSeconds` 為 `0` 或缺值時不啟動計時器

#### Scenario: 刷新失敗保留最後一份成功的圖

- **WHEN** 首次載入成功後,某次刷新回傳 `502`
- **THEN** 錯誤指示顯示含 URL 與 `502` 的訊息,先前成功的 elements 持續渲染,selection 與 collapse 狀態不變

#### Scenario: 刷新成功前舊圖不消失

- **WHEN** 刷新請求進行中(尚未回應)
- **THEN** 先前的 elements 仍在畫面上,`hasPayload` 維持 `true`,graph-view 不顯示 loading 覆蓋層

#### Scenario: 刷新保留 view state

- **WHEN** 使用者已選取節點 `pod/checkout-0`、收合某 controller、過濾掉 `service` kind、search query 為 `mongo`,之後刷新回傳仍含這些節點的新 payload
- **THEN** selection、collapse、過濾、search query 與 pod-parent mode 全部保留,hit set 與可見性依新 elements 重算

#### Scenario: 進行中的請求不被重複發出

- **WHEN** 自動刷新請求尚未回應時使用者觸發「重新載入」
- **THEN** 不發出第二個並行請求,進行中請求的結果套用後狀態才更新

#### Scenario: demo 模式下重新載入不連網

- **WHEN** `demoMode` 為 `true` 且使用者觸發「重新載入」
- **THEN** 不發出任何網路請求,fixture 重新經 normalize boundary,渲染結果與先前一致

### Requirement: 上游 kube-state-graph payload 契約(cytoscape.js 形狀)

上游 kube-state-graph 後端的 `GET /v1/graph` 與 `GET /v1/storage-graph` 兩個端點輸出**同一個 cytoscape.js elements 形狀**的 JSON,app MUST 將其視為唯一的資料來源契約並據以正規化,兩端點共用同一組 wire 型別與同一個 normalize boundary。後端(design D6,取代舊的 `cluster > node > pod` 模型)是**整個拓樸階層的單一事實來源**。頂層形狀為:

```
{ apiVersion: string, clusters: string[], elements: { nodes: CyNode[], edges: CyEdge[] } }
```

每個 node 與 edge 依 cytoscape 慣例包在 `data` 物件內:

- `CyNode.data { id: string, name: string, type: string, parent?: string, ipaddress?: string[], owner?: { kind: string, name: string }, application?: string, containers?: Array<{ name: string; image: string }>, storageclass?: string, health?: string, ready_status?: string, usage?: { used_bytes?: number, capacity_bytes?: number }, hardware?: { model?: string, serial?: string, version?: string, vendor?: string, location?: string }, perf?: { cpu_busy_pct?: number, total_ops?: number, total_latency_us?: number, total_bytes_per_sec?: number }, labels: Record<string,string> }`
- `CyEdge.data { id: string, type: string, source: string, target: string, labels: Record<string,string>, metrics?: EdgeMetricsUnion }`

後端 node `type` enum(小寫):核心資源 `pod` / `node` / `pvc` / `service` / `external`;**實體儲存** `netapp-aggr` / `netapp-node` / `netapp-svm`;**compound 群組節點** `cluster` / `storage-cluster` / `namespace` / `application` / `controller`;實體網路 `switch`。`netapp-svm` **只出現於 `/v1/storage-graph` 的 body**——`/v1/graph` 從不輸出該型別(其 SVM 資訊只以 PVC 的 `svm` label 存在)。`controller` 群組的 `type` 為字面值 `controller`(**不是**小寫化的 workload Kind);其 Kind 只存在於 id 路徑與子 pod 的 `owner.kind`。`node` 為其 cluster 下的葉節點。無法對應到具體 K8s 資源的端點為 `external`(契約無 `others` 型別)。`storageclass` **已自契約移除**——後端不再輸出該 node type,claim 的 StorageClass 名稱改置於 PVC 自身的 `data.storageclass`(string,omitempty)。

**NetApp 儲存鏈。** `netapp-aggr`(ONTAP aggregate,id `netapp/<ontap-cluster>/aggr/<aggr>`)是 PVC 實際落地的實體單位,其 `labels` 恰為 `{ontap_cluster, node}`(`node` = 目前擁有該 aggregate 的 controller);`netapp-node`(ONTAP controller,id `netapp/<ontap-cluster>/<node>`)的 `labels` 恰為 `{ontap_cluster}`。兩者皆不帶 `cluster` label(不屬於任何 K8s cluster,也不出現於頂層 `clusters[]`),故 app 的 cluster 色彩強調與 cluster 過濾不適用於它們。兩者皆可帶 `health`(恰為 `"online"` 或 `"degraded"`,omitempty);`netapp-aggr` 另可帶 `usage`。**缺 `health` 不等於 `"degraded"`**——缺值表示後端無其狀態資料,消費者 MUST NOT 將缺值解讀為 `"degraded"`。

`netapp-svm`(ONTAP SVM,id `netapp/<ontap-cluster>/svm/<svm>`)的 `labels` 恰為 `{ontap_cluster}`,同樣不帶 `cluster`、不出現於頂層 `clusters[]`,且不帶 `health` / `usage`。它 parent 於 `storage-cluster/<ontap-cluster>`(**不是** parent 於 `netapp-node` 或 `netapp-aggr`——SVM 與 aggregate 是兩個正交的維度)。

`netapp-node` 另可帶兩個選用的**具型別、可為缺席**的屬性,**兩個端點皆可能出現**:

- `hardware`:`{ model?, serial?, version?, vendor?, location? }`,全為字串,各欄獨立選用。來自 Harvest 的 `node_labels`,是操作者用來對上手邊機器的硬體識別。
- `perf`:`{ cpu_busy_pct?, total_ops?, total_latency_us?, total_bytes_per_sec? }`,全為 JSON number,各欄獨立選用,**皆為原始讀數**(後端不做 `rate()`、不做門檻判斷)。app MUST NOT 由這些數值自行推導健康判定或上色警示——`health` 維持其精確語意(ONTAP 回報的狀態),健康判定經由 `alerts` 抵達(見「告警 (alerts) 正規化」)。

兩者缺席時整個 key 不出現;app MUST NOT 以 `0`、`null` 或 `"unknown"` 補值。

**`usage` 欄位**形狀為 `{ used_bytes?: number, capacity_bytes?: number }`(bytes,JSON number),以**相同形狀**出現於 `pvc`(來自 kubelet volume stats)與 `netapp-aggr`(來自 Harvest aggregate space)。物件本身在至少一個欄位有值時出現;未解析到的欄位直接缺席(絕不以 `0` 填補)。

後端 edge `type` enum:`pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr`,加上實體網路 fabric edges `switch-to-switch` / `node-to-switch`。`pod-to-node`(pod→node)表達 pod 與其 K8s node 的關係(自 D6 起 pod-runs-on-node 不再以巢狀表達);`pvc-to-netapp-aggr`(pvc→netapp-aggr)連接 PVC 與承載其 FlexVol 的 ONTAP aggregate(取代已移除的 `pvc-to-storageclass`);`pod-calls-service`(pod→service)與 `service-selects-pod`(service→pod)為方向相反的一對。edge 的視覺(顏色、線型、箭頭)由 graph-view capability 定義。

**`storage-flow` 為第九個 edge type,且只出現於 `/v1/storage-graph` 的 body。** `/v1/graph` 從不輸出它(於該端點送 `?edge_type=storage-flow` 會得到一個沒有 edge 的 200);反之 storage-graph 的 body **只**含這一種 edge,不含 `pod-mounts-pvc` / `pod-to-node` / `pvc-to-netapp-aggr` / `pod-calls-*` / `service-selects-pod`,也不含 `service` 與 `external` 節點。其方向恆為 **storage → workload**,每條 edge 為固定 tier 鏈 `netapp-node → netapp-aggr → netapp-svm → pvc → pod → node` 上的一個相鄰對,並以 `labels.tier` 指名該 hop,值恰為 `node-aggr` / `aggr-svm` / `svm-pvc` / `pvc-pod` / `pod-node` 之一。同一組 `(source, target)` 在一份 body 內至多出現一次,無論多少 claim 流經。`labels.attribution` 為選用,值為 `"split"` 時表示該 `pvc-pod` edge 的權重是一個被多個 pod 掛載(RWX)的 claim **均分**後的歸屬值,而非直接量測;缺該 label 表示為單一掛載,權重即量測值。app MUST 依 `labels.tier` 判定 hop,MUST NOT 由 source / target 的 kind 反推(FlexGroup claim 的路徑自 `svm-pvc` 起始、未排程的 pod 於 `pvc-pod` 結束,兩者都會讓「鏈必然完整」的假設失效)。

**Edge `metrics` 是兩個互斥家族的聯集。** 單一 edge 只帶其中一個家族,絕不混合:

1. **RED 家族**(trace 推導的 edge):後端將兩端皆解析為 `pod` 或 `service` 節點、且 edge 來自 `traces_service_graph_request_*` series 時附加。實務上只有 `pod-calls-pod` 與 `pod-calls-service` 會帶。欄位為 `rate` / `error_rate` / `p90_server_ms`。
2. **I/O 家族**(`pvc-to-netapp-aggr` edge,以及 storage-graph 的 `storage-flow` edge):六個**量測**欄位——`read_ops` / `write_ops` / `read_latency_us` / `write_latency_us` / `read_bytes_per_sec` / `write_bytes_per_sec`——加上兩個**宣告上限**欄位 `max_iops` / `max_bytes_per_sec`。八者**各自獨立**選用(各對應自己的 Harvest series family,缺一個 family 只少對應的欄位)。ops 為每秒次數、latency 為平均微秒、throughput 為每秒 bytes——所有值後端皆原樣透傳。

   **`storage-flow` edge 上的 I/O 家族多兩條規則。** (a) `read_ops` / `write_ops` / `read_bytes_per_sec` / `write_bytes_per_sec` 為**流經該 hop 的所有 claim 之總和**,由後端於 build 時加總完畢並保證 tier 間**守恆**(每個非 root 的中間節點,入邊總和等於出邊總和,至多差捨入);app MUST 直接使用這些值,MUST NOT 自行加總、均分或重新分配——任何客戶端再計算都會破壞守恆。(b) `read_latency_us` / `write_latency_us` 與 `max_iops` / `max_bytes_per_sec` **只出現於 `svm-pvc` tier**(claim 層級的那一 hop);其他四個 tier 恆不帶這四個欄位,app MUST NOT 於其他 tier 尋找或顯示它們。整條路徑上的 claim 皆無量測時,該 edge 完全不帶 `metrics` key。

   量測欄位與上限欄位來自後端 NetApp join 的**兩個不同 hop**,各自獨立降級:六個量測來自 Harvest QoS workload families(hop B),兩個上限來自 QoS fixed-policy families(hop C),以 `(ontap_cluster, svm, policy_group)` 三元組 join 到已匹配的 workload series。後端因此保證**上限欄位絕不會在沒有任何量測欄位時出現**——app 可以依賴此不變式,但 MUST NOT 假設反向:一個有量測但不屬於任何 QoS policy group 的 volume 完全沒有上限,這是正常狀態而非錯誤。

`service-selects-pod` / `pod-to-node` / `pod-mounts-pvc` / fabric edges、任何一端為 `external` 的 edge、以及所有後端合成的 edge MUST 視為**絕不帶** `metrics`。逐欄契約:

- `rate`:查詢窗口內的每秒請求數(**req/s**,非累計次數)。**RED 家族存在時**此欄必定存在且 > 0;但因 `metrics` 是聯集,消費者 MUST NOT 假設任意 `metrics` 物件都有 `rate`(I/O 家族從不帶)。
- `error_rate`:失敗**比率**,落在 `[0,1]`(**非**百分比)。缺值表示失敗計數器**讀不到**;`0` 表示**讀到了且無失敗**——兩者為不同狀態,消費者 MUST NOT 把缺值當成 `0`。
- `p90_server_ms`:server 端觀測的 p90 請求時長,單位**毫秒**。無 classic histogram 可用時(如 native histogram 或 `vmrange`)缺席。
- `read_ops` / `write_ops`:每秒讀 / 寫次數。
- `read_latency_us` / `write_latency_us`:平均讀 / 寫 latency,單位**微秒**(µs)。
- `read_bytes_per_sec` / `write_bytes_per_sec`:讀 / 寫 throughput,單位**每秒 bytes**(十進位)。**非**累計 byte 數,亦非 KB 或 MB。
- `max_iops`:該 volume 所屬 QoS policy group 宣告的 IOPS 上限(每秒操作數),後端原樣透傳。
- `max_bytes_per_sec`:同一 policy group 宣告的 throughput 上限,單位**每秒 bytes**。這是後端**唯一做單位換算**的欄位(自 Harvest 的 MB/s 乘以 `1048576`),正是為了與 `read_bytes_per_sec` / `write_bytes_per_sec` 同單位、可直接比較。app MUST NOT 再做任何單位換算。
- **兩個上限欄位的缺值語意**:缺值表示該 volume **無宣告上限**(不屬於任何 QoS policy group,或該 policy 未設定此維度)。MUST NOT 渲染為 `0`,MUST NOT 渲染為 `∞` / `unlimited` 哨兵,MUST NOT 用來推導使用率百分比——缺上限即不畫該列。

後端所有數值以 **6 位有效數字**輸出,故值可能以指數形式抵達(如 `3.86e-7`);app MUST 依實際值格式化,MUST NOT 假設為小整數。`metrics` 缺席時整個 key 不出現(非 `null`、非 `0`)。這些數值欄位皆 MUST NOT 出現於 `labels` map——`labels` 維持嚴格的 `Record<string,string>`。

`ipaddress` 為**陣列**(可能多個 IP,可能為空),僅 `pod` / `node` / `service` 節點攜帶。上游已將 IP 資料自 `labels`(原 `pod_ip` / `host_ip` / `external_ip`)移入此專屬欄位,app MUST 自 `data.ipaddress` 讀取 IP,**MUST NOT** 自 `labels` 讀取。

**D6 parent 鏈(`data.parent`)。** workload 鏈為 `cluster > namespace > application > controller > pod`;`pvc` / `service` 直接 parent 於其 `namespace` 群組;`node` 為 cluster 下的葉節點。**儲存鏈為 `storage-cluster > netapp-node > netapp-aggr`,並於 storage-graph body 另有 `storage-cluster > netapp-svm`**(SVM 與 aggregate 同層,皆直接 parent 於 storage-cluster)——其中間層 `netapp-node` 是**真實節點**(有 kind、有 icon、可選取)而非裝飾性群組。storage-graph body 的 compound 群組與 `/v1/graph` **完全相同**(`cluster > namespace > application > controller > pod`、`cluster > namespace > [application >] pvc`、`cluster > node`),且 `namespace` 與 `application` **不是** Sankey 的 tier——它們是 pod / pvc tier 之上正交的分組,消費者若需要 namespace 或 Application 層級的 Sankey,MUST 由 `data.parent` 向上走並加總守恆的權重,而非期待後端提供該層 edge。這是契約中唯一「真實節點兼任 compound parent」之處,app MUST 依 `data.parent` 原樣建立巢狀,MUST NOT 因 parent 是真實 kind 而改以 edge 表達。`namespace` / `application` / `storage-cluster` 群組 `labels: {}`、無 status、無 edge;純粹作為 `data.parent` 目標存在。

**Pod controller 歸屬。** 後端仍在 pod 節點上帶 `data.owner: { kind, name }`、`application: <string>` 與 `labels.node`(其 K8s node id),**即使該 pod 已經由 `data.parent` 巢狀於其 `controller` 群組之下**。後端**直接輸出** `controller` / `namespace` / `application` 群組節點與 `pod-to-node` edge——app 不再自 `data.owner` 合成 controller 節點或 `controller-owns-pod` edge。未 join 到 NetApp aggregate 的 PVC(無 `volumename`、無匹配的 Harvest series、或匹配到的 series 之 `aggr` 為空)後端**不**輸出 `pvc-to-netapp-aggr` edge。

#### Scenario: 契約欄位以後端 golden fixture 為錨

- **WHEN** normalize boundary 餵入後端 golden fixture `with-netapp-storage-cytoscape.json` 的內容
- **THEN** 解析出對應數量的 nodes 與 edges,且 `netapp-aggr` / `netapp-node` / `storage-cluster` 三種 node type 與 `pvc-to-netapp-aggr` edge 皆正確映射

#### Scenario: 後端 D6 階層原樣消費,巢狀於 controller 下的 pod 保留 owner / application / labels.node

- **WHEN** 上游 pod 節點 `data` 帶 `owner: { kind: "StatefulSet", name: "mongo" }`、`application: "mongo"`、`labels.node: "prod/node-1"`,且其 `data.parent` 指向 `controller` 群組
- **THEN** normalize 不合成 controller 節點、不合成 `controller-owns-pod` edge,並保留該 pod 的 `owner` / `application` / `labels.node` 與後端給的 `parent`

#### Scenario: pod-to-node 與 pvc-to-netapp-aggr edge 映射

- **WHEN** 上游 edges 含 `type: 'pod-to-node'`(pod→node)與 `type: 'pvc-to-netapp-aggr'`(pvc→netapp-aggr;取代已移除的 `pvc-to-storageclass`)
- **THEN** 兩者皆映射至對應的 `edgeType`,皆不落入 unknown-type fallback

#### Scenario: 未 join aggregate 的 PVC 無儲存 edge

- **WHEN** 某 PVC 未 join 到 NetApp aggregate(後端未輸出對應的 `pvc-to-netapp-aggr` edge;`pvc-to-storageclass` edge type 已自契約移除)
- **THEN** normalize 不為其產生任何儲存 edge,該 PVC 維持為一般節點

#### Scenario: storage-flow edge 與 netapp-svm 節點映射

- **WHEN** normalize boundary 餵入 `/v1/storage-graph` 形狀的 payload,含 `{id:"netapp/ontap-prod/svm/svm_shop", name:"svm_shop", type:"netapp-svm", parent:"storage-cluster/ontap-prod", labels:{ontap_cluster:"ontap-prod"}}` 與五條 `type: 'storage-flow'` 的 edge(`labels.tier` 分別為 `node-aggr` / `aggr-svm` / `svm-pvc` / `pvc-pod` / `pod-node`)
- **THEN** SVM 映射為 `kind: 'netapp-svm'` 且 parent 為 `storage-cluster/ontap-prod`;五條 edge 皆映射為 `edgeType: 'storage-flow'`,`labels.tier` 原樣保留,皆不落入 unknown-type fallback

#### Scenario: 均分歸屬的 pvc-pod edge

- **WHEN** 某 `pvc-pod` 的 `storage-flow` edge 帶 `labels.attribution: "split"` 與 `metrics: { read_ops: 100 }`
- **THEN** normalize 保留該 label 與該值原樣,MUST NOT 乘回 pod 數、MUST NOT 移除該 label(消費端據此標示為估計值)

#### Scenario: latency 與 ceiling 只在 svm-pvc tier

- **WHEN** payload 中 `svm-pvc` edge 帶 `read_latency_us` 與 `max_iops`,而 `node-aggr` 與 `pod-node` edge 只帶四個總和欄位
- **THEN** normalize 逐欄映射既有欄位,不為缺席的 latency / ceiling 補值,亦不將 `svm-pvc` 的值傳播到其他 tier

#### Scenario: netapp-node 的 hardware 與 perf 逐欄降級

- **WHEN** 某 `netapp-node` 帶 `hardware: { model: "AFF-A400" }`(無 `serial`)與 `perf: { cpu_busy_pct: 41.2 }`(無其餘三欄),另一個 `netapp-node` 兩個 key 皆缺席
- **THEN** 前者保留既有欄位、缺席欄位維持缺席;後者的 `hardware` 與 `perf` 皆為缺席,MUST NOT 出現為 `{}`、`null` 或以 `0` 填補的物件,且 `perf` 的數值 MUST NOT 影響該節點的 `health` 或狀態外框

#### Scenario: RED metrics 契約以後端 golden fixture 為錨

- **WHEN** normalize boundary 餵入形如後端 golden fixture `with-red-metrics-cytoscape.json` 的內容(同一 payload 內含一條 `metrics: { rate, error_rate, p90_server_ms }` 齊全的 edge、一條只有 `{ rate, error_rate }` 的 edge、一條完全無 `metrics` 的 edge)
- **THEN** 三條 edge 分別解析為 `metrics` 齊全、僅含既有欄位、與完全缺席的元素

#### Scenario: NetApp 節點不帶 cluster label 且不出現於 clusters[]

- **WHEN** 上游 payload 含 `netapp-aggr` 與 `netapp-node` 節點,其 `labels` 分別為 `{ontap_cluster, node}` 與 `{ontap_cluster}`
- **THEN** 兩者皆無 `cluster` label,normalize 不指派 cluster 色彩強調,且頂層 `clusters[]` 不含任何 ONTAP cluster 名稱

### Requirement: 內部 Graph 模型(手寫,無 codegen)

App 內部模型 MUST 以 cytoscape.js 原生元素型別為單一來源:自訂的 node / edge `data` 欄位以 declaration merging 擴充 cytoscape.js 的 `NodeDataDefinition` / `EdgeDataDefinition`,normalize boundary 直接產生 cytoscape.js `ElementDefinition[]`。**不採用 OpenAPI codegen**——採「手寫型別 + boundary runtime 驗證」;若日後 schema 大量增長再另起 change 引入 codegen。wire 側以 `WireGraph` 型別(後端 snake_case 原樣,不做轉換)表達,供 showcase fixture 於編譯期對齊契約;執行期一律以 `unknown` 進入 normalize boundary,不依賴該型別。欄位以上游契約為準,映射至 app 內部命名:

- node `data { id, kind, label?, namespace?, ipAddress?, labels? }`(`kind` 由上游 `data.type` 映射;`label` 由 `data.name` 映射;`namespace` 由 `data.labels.namespace` 取出;`ipAddress` 由 `data.ipaddress` 映射)
- edge `data { id, source, target, edgeType, labels? }`(`edgeType` 由上游 `data.type` 映射)

#### Scenario: 內部元素保留必要欄位

- **WHEN** 專案 typecheck 執行,且 normalize boundary 對合法 payload 產出 elements
- **THEN** typecheck 通過,產出的 node `data` 含 `id` / `kind` / `ipAddress`(上游有值時),edge `data` 含 `id` / `source` / `target` / `edgeType`

#### Scenario: fixture 與 wire 型別對齊

- **WHEN** showcase fixture 以 `WireGraph` 型別宣告,而 normalize boundary 新增讀取某個 wire 欄位並將其加入 `WireGraph`
- **THEN** fixture 缺該欄位時於 typecheck 階段失敗,而非執行期渲染出不完整的圖

### Requirement: Normalize boundary(anti-corruption layer)

系統 SHALL 提供一個純函式作為 normalize boundary,契約為 `(raw: unknown) => { elements: cytoscape.ElementDefinition[]; errors: string[] }`,負責 (a) 驗證上游 payload 形狀;(b) 把上游 cytoscape `data` 映射為 app 內部 cytoscape 元素;(c) 略過不合法項目並收集警告於 `errors`。無論 payload 來自 `endpoints.graph` 回應或 showcase fixture,MUST 經同一個 boundary。

normalize MUST 同時容忍下列頂層形狀:完整回應 `{ elements: { nodes, edges } }`、或已解包的 `{ nodes, edges }`。每個 node / edge 條目 MUST 容忍 cytoscape 包裝 `{ data: {...} }` 與扁平物件兩種形式(優先取 `entry.data`,否則用 entry 本身)。此寬容性使後端回應、fixture 與手寫測試 payload 走同一路徑。

欄位映射:node `type → data.kind`、`name → data.label`(缺則 fallback 為 id)、`labels.namespace → data.namespace`、`ipaddress → data.ipAddress`(僅當為非空字串陣列時)、`labels → data.labels`;edge `type → data.edgeType`。

#### Scenario: Normalize 為純函式

- **WHEN** 對 normalize boundary 以相同 input 多次呼叫
- **THEN** 回傳值結構完全一致,函式無副作用(無 I/O、無 mutation 外部變數、不修改輸入)

#### Scenario: 映射上游 cytoscape data 至內部欄位

- **WHEN** 上游 node `data` 為 `{ id, name: 'checkout', type: 'pod', labels: { namespace: 'shop' } }`
- **THEN** 產出 cytoscape node element `data` 含 `kind: 'pod'`、`label: 'checkout'`、`namespace: 'shop'`;edge `data.type` 映射為 `edgeType`

#### Scenario: ipAddress 從專屬欄位取出而非 labels

- **WHEN** 上游 `service` node `data` 含 `ipaddress: ['10.0.0.5']`
- **THEN** 產出 element `data.ipAddress` 為 `['10.0.0.5']`;即使 `labels` 不含 `pod_ip` / `host_ip` / `external_ip` 亦不影響

#### Scenario: 容忍 wrapped 與 unwrapped 頂層形狀

- **WHEN** 餵入 `{ elements: { nodes, edges } }` 或已解包的 `{ nodes, edges }`
- **THEN** 兩者皆解析出相同的 cytoscape elements

#### Scenario: 不合法資料不中斷渲染

- **WHEN** 上游 payload 含一個缺 `id` 欄位的 node
- **THEN** normalize boundary 略過該 node,於 `errors` 加入描述字串,其餘合法資料正常映射

### Requirement: 告警 (alerts) 正規化與 time_records 解析

Normalize boundary SHALL 於 anti-corruption boundary 將上游 leaf node 的選用欄位 `alerts`(陣列)正規化為 app 內部 `NodeAlert[]`,並以**選用**的 `timeRecords: number[]` 承載同一 alert 的**所有發生時間**(取代舊的單一 `time` scalar)。

`alerts` 有**兩種上游產生者,對「時間」的認知不同**,契約 MUST 同時容納:

| 產生者                                                   | 送出                                                 | 發生時間                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| kube-state-graph 的 alert overlay                        | `{ name, state, severity }`,讀自上游 `ALERTS` series | **完全沒有**——該 series 只陳述「此 alert 在請求視窗內 firing」,`last_over_time` 不保留發生史 |
| panel 時代的產生者(內建 fixture、既有部署前置的告警來源) | 將同一 alert 的重複發生聚合為單筆                    | `time_records`(或 legacy `time`)                                                             |

因此 `name` 是**唯一**必填欄位——它是該 alert 的身分。**發生時間與 `severity` 都不是**:

- overlay 完全不帶發生時間;
- overlay 的 `severity` 以 `omitempty` 序列化,**未宣告 severity label 的規則會產出沒有該欄的 alert**。

兩者缺漏都是一筆**完整**的 alert,MUST NOT 因此丟棄——丟棄會讓真實後端的 overlay 在 200 回應下靜默清空,而那正是 overlay 存在要揭露的狀態。兩者的降級方式與 `pod` / `service` 一致:省略該欄,由表格於該儲存格顯示 missing-value placeholder。規則:

- 每筆 alert MUST 至少帶非空 `name`(自由字串),否則丟棄。
- 發生時間自上游 wire 欄位 `time_records`(數字陣列)取得:MUST 僅保留有限(`Number.isFinite`)且 ≥ 0 的值,並**升序排序**後存為 `timeRecords`。
- **相容舊後端**:缺 `time_records`(或其元素全部無效)時,MUST 退讀 legacy scalar 欄位 `time`(Unix 秒,須有限且 ≥ 0)→ `timeRecords: [time]`。
- 經上述過濾後無任何有效發生時間時,`timeRecords` MUST **省略**(不得寫成 `[]`,亦不得寫成 `undefined` 值)——「無發生史」只有一種表示法,下游無須測試兩種。該 alert 本身 MUST 保留。
- 上游的 `state` 欄(`firing` / `pending`)MUST NOT 投影至 `NodeAlert`:後端查詢帶固定 `alertstate="firing"` selector 且其 reader 會再測一次,抵達此處者皆已 firing,呈現該欄只會是一個常數。
- `severity` 為選用的自由字串:非空字串時保留原樣,缺漏 / 空字串 / 非字串時 MUST **省略該欄**(不得代入預設等級)。缺漏 `severity` 與**無法辨識的自訂 label 不同**——後者仍是一個等級,取 fallback 顏色;前者是「無人評級」,由表格顯示 placeholder。
- `pod` / `service` / `id` 為選用字串,缺值則省略。
- 分組容器(`cluster` / `namespace` / `application` / `controller`)MUST NOT 攜帶自身 `alerts`(即使上游帶亦丟棄;controller 的 alerts 改由 enrichment 自子 pod 聚合——見「controller 告警(alerts)自子 pod 聚合」)。

下游(node-detail 的告警表格)由 `timeRecords` 衍生:Count = `timeRecords.length`、Last occurred = `max(timeRecords)`(因升序故為末元素),不另存欄位;`timeRecords` 缺漏時兩欄的降級呈現由 `node-detail` 規範。

#### Scenario: time_records 解析為升序 timeRecords

- **WHEN** 上游 node `alerts` 含 `{ name: 'HighMem', severity: 'critical', time_records: [1717500300, 1717500000] }`
- **THEN** 產出 `NodeAlert.timeRecords` 為 `[1717500000, 1717500300]`(升序);其 Count 衍生為 `2`、last occurred 衍生為 `1717500300`

#### Scenario: 相容 legacy scalar time

- **WHEN** 上游 alert 僅帶 `time: 1717500000`(無 `time_records`)
- **THEN** 產出 `timeRecords: [1717500000]`(等價單次發生),不報錯

#### Scenario: 過濾非有限 / 負值發生時間

- **WHEN** 上游 alert `time_records: [1717500000, -5, NaN, 1717500300]`
- **THEN** 產出 `timeRecords: [1717500000, 1717500300]`(濾掉 `-5` 與 `NaN`,升序)

#### Scenario: 保留無發生時間的 overlay alert

- **WHEN** 上游 alert 為 `{ name: 'NetAppControllerDegraded', state: 'firing', severity: 'critical' }`(kube-state-graph overlay 的形狀,無 `time_records` 亦無 `time`)
- **THEN** 該 alert 出現於 `data.alerts`,帶 `name` 與 `severity`,且 **MUST NOT** 帶 `timeRecords` 欄

#### Scenario: 無有效發生時間時省略 timeRecords 而非寫成空陣列

- **WHEN** 上游 alert 的 `time_records` 為 `[]` 或元素全部非有限 / 負值,且無有效 scalar `time`
- **THEN** 該 alert 仍出現於 `data.alerts`,且 **MUST NOT** 帶 `timeRecords` 欄(不得為 `[]`);同節點其餘 alert 不受影響

#### Scenario: 不投影上游的 state 欄

- **WHEN** 上游 alert 帶 `state: 'firing'`
- **THEN** 產出的 `NodeAlert` **MUST NOT** 有 `state` 欄,其餘欄位照常解析

#### Scenario: 保留無 severity 的 alert

- **WHEN** 上游 alert 的 `severity` 缺漏、為空字串,或非字串
- **THEN** 該 alert 仍出現於 `data.alerts`,且 **MUST NOT** 帶 `severity` 欄(不得代入 `info` / `critical` 等預設值)

#### Scenario: 同時缺 severity 與發生時間

- **WHEN** 上游 alert 僅為 `{ name: 'Ungraded', state: 'firing' }`
- **THEN** 產出的 `NodeAlert` 為 `{ name: 'Ungraded' }`,既無 `severity` 亦無 `timeRecords`

#### Scenario: 缺 name 的 alert 丟棄

- **WHEN** 上游 alert 缺 `name`、`name` 為空字串,或 `name` 非字串
- **THEN** 該 alert 被丟棄(即使 `time_records` 與 `severity` 有效),其餘合法 alert 正常解析

#### Scenario: 分組容器不帶 alerts

- **WHEN** 上游 `cluster` 或 `namespace` 節點帶 `alerts`
- **THEN** 正規化結果該節點 MUST NOT 有 `data.alerts`

### Requirement: pod / service / pvc `application`、pod `containers` 透傳與 controller 聚合

Normalize boundary SHALL 於 anti-corruption boundary 承載 backend 在 pod 節點輸出的兩個欄位——**`application?: string`**(ArgoCD application name)與 **`containers?: Array<{ name: string; image: string }>`**(container 與其 image)——並為 backend **直接輸出**的 `controller` 群組節點自子 pod 聚合兩者。自 backend D6 起,**service 與 pvc leaf 亦可帶 `application`**(backend 自其 annotation tracking-id 解析,並將該 leaf nest 於對應 application 群組);normalize MUST 以與 pod 相同規則透傳該欄。controller 不由 app 合成,改為 **enrich**(豐富化)後端送來的 `type: "controller"` 群組節點。兩欄位以 declaration merging 宣告於內部模型的 `NodeDataDefinition`,供 node-detail 面板顯示與變更歷史查詢(`endpoints.codeChanges` / `endpoints.configChanges`)的參數組裝使用。該查詢本身**非** normalize 職責——它是 UI 端的非同步動作,由 node-detail capability 發出。規則:

- **pod `application`**:backend 值為非空字串時原樣透傳;缺失或空字串時 MUST 省略該欄(不寫入 `undefined` 值)。
- **service / pvc `application`**(backend D6):service 與 pvc leaf 帶 backend 解析的 ArgoCD `application` 時,MUST 以**與 pod `application` 完全相同**的規則透傳(非空字串保留、缺失或空字串省略)。`containers` 與 typed `owner` 仍**僅限 pod**——service / pvc 即使 backend 誤送這兩欄,normalize MUST NOT 帶上。
- **pod `containers`**:逐項驗證——`name` 與 `image` 皆為非空字串的項目保留,形狀不符的項目 MUST 丟棄(anti-corruption);驗證後為空陣列或欄位缺失時 MUST 省略該欄。
- **controller `kind`**:後端 `controller` 群組之 `type` 為字面值 `controller`、不帶 `kind`;normalize MUST 自其**任一子 pod**(`pod.parent === controllerId`)的 `owner.kind` **小寫化**推導出 controller 的 `kind`(如 `StatefulSet` → `statefulset`),並標 `isController: true`,使 controller 成為 Workloads kind 並保留 detail 面板。
- **controller `application`**(enrich,backend 不送):MUST 自其**子 pod**(`pod.parent === controllerId`)的 `application` 聚合——取任一帶值的子 pod(以穩定排序確定性選取**首個**);無任何子 pod 帶值時 MUST 省略該欄。
- **controller `containers`**:MUST 自其**所有子 pod** 的 `containers` 聯集聚合,以 **(name, image)** 去重、穩定排序;無任何子 pod 帶 containers 時 MUST 省略該欄。
- 解析 / 聚合 MUST 為純函式、確定性、immutable(產生新元素,不就地修改輸入)。
- 兩欄位 MUST NOT 影響 `worstStatus` 彙整或 alerts 聚合。
- 舊版 backend(不送這兩欄位)MUST 完全不受影響——產出與現行相同,無錯誤、無多餘欄位。

#### Scenario: pod application 原樣透傳

- **WHEN** backend 某 pod 節點 `data.application` 為 `"checkout"`
- **THEN** 正規化後該 pod element 之 `data.application` 為 `"checkout"`

#### Scenario: service / pvc application 原樣透傳(backend D6)

- **WHEN** backend 某 service 或 pvc 節點 `data.application` 為 `"mongodb"`
- **THEN** 正規化後該 element 之 `data.application` 為 `"mongodb"`;且該 leaf MUST NOT 因此帶 `data.containers` 或 `data.owner`(僅限 pod)

#### Scenario: 欄位缺失或空值時省略

- **WHEN** backend 某 pod 節點無 `application`(或為空字串)且無 `containers`(或驗證後為空)
- **THEN** 該 pod element MUST NOT 帶 `data.application` 與 `data.containers`

#### Scenario: pod containers 原樣透傳

- **WHEN** backend 某 pod 節點 `data.containers` 為 `[{ name: "app", image: "repo/app:1.2" }]`
- **THEN** 正規化後該 pod element 之 `data.containers` 等值保留

#### Scenario: 形狀不符的 container 項目被丟棄

- **WHEN** backend 某 pod 的 `containers` 為 `[{ name: "app", image: "repo/app:1.2" }, { name: "", image: "x" }, { name: "noimg" }]`
- **THEN** 正規化後僅保留 `{ name: "app", image: "repo/app:1.2" }`

#### Scenario: controller kind 自子 pod owner.kind 推導

- **WHEN** backend `controller` 群組(`type: "controller"`,無 `kind`)旗下某子 pod 帶 `owner: { kind: "StatefulSet", name: "mongo" }`
- **THEN** enrich 後該 controller 節點 `data.kind` 為 `'statefulset'`(小寫化)且 `data.isController === true`

#### Scenario: controller 自子 pod 聚合 application

- **WHEN** 某 backend `controller` 群組旗下有子 pod 帶 `data.application: "mongo"`
- **THEN** enrich 後該 controller 節點 `data.application` 為 `"mongo"`(controller 本身 backend 不送此欄)

#### Scenario: controller 聚合 containers 並以 (name, image) 去重

- **WHEN** 某 controller 旗下三個子 pod 皆帶 `containers: [{ name: "app", image: "repo/app:1.2" }]`,其中一個另帶 `{ name: "sidecar", image: "repo/sc:0.9" }`
- **THEN** enrich 後該 controller 節點 `data.containers` 為兩項:`app` / `repo/app:1.2` 與 `sidecar` / `repo/sc:0.9`(去重後、穩定排序)

#### Scenario: controller 無子 pod 帶值時省略

- **WHEN** 某 controller 旗下無任一子 pod 帶 `application` 或 `containers`
- **THEN** enrich 後該 controller 節點 MUST NOT 帶 `data.application` 與 `data.containers`

#### Scenario: 聚合為純函式且確定性

- **WHEN** 以相同 input 多次呼叫 normalize boundary,且某 controller 有多個子 pod 帶不同 `application` 值
- **THEN** 每次選取的 `data.application` 一致(穩定排序確定性選取),且輸入未被就地修改

#### Scenario: 舊版 backend 不受影響

- **WHEN** backend 回應的 pod 節點皆不含 `application` / `containers` 欄位
- **THEN** normalize boundary 產出無相關欄位,`errors` 不含相關錯誤

### Requirement: controller 告警(alerts)自子 pod 聚合

Normalize boundary SHALL 於 **enrich** backend 直接輸出的 `controller` 群組節點時,自其**子 pod**(`pod.parent === controllerId`)的 `data.alerts` 聚合出該 controller 的 `data.alerts`(`NodeAlert[]`),使 node-detail 面板的告警表格對 controller 顯示旗下所有 pod 的告警。聚合僅及於 backend `controller` 群組(enrich 後 `isController === true`);k8s `node` 容器與其他 backend 實體節點不在此列。規則:

- **順序**:以子 pod 的穩定排序(podId 升冪)串接各 pod 的 alerts,pod 內保持解析後順序——對相同輸入確定性。
- **pod 歸屬**:聚合項目缺 `pod` 欄時 MUST 以來源 pod 的 label 回填;已帶 `pod` 的項目 MUST 保留原值。回填 MUST 作用於新物件——來源 pod 元素自身的 `alerts` MUST NOT 被修改。
- **去重**:帶 `id` 的項目 MUST 跨 pod 以 `id` 去重(穩定順序下首見者勝);無 `id` 的項目一律保留。
- **省略**:無任一子 pod 帶 alerts 時,controller MUST NOT 帶 `alerts` 欄(不寫 `undefined` 值)。
- **顏色不受影響**:此聚合 MUST NOT 改變 `worstStatus` 彙整(**status 仍為唯一節點上色來源**;alerts 不參與 stylesheet)。

#### Scenario: controller 聚合子 pod 告警

- **WHEN** 某 backend `controller` 群組旗下兩個 pod(`pod.parent === controllerId`)各帶一筆 alert(`HighMem` / `CrashLoop`)
- **THEN** enrich 後該 controller 節點 `data.alerts` 含兩筆(podId 升冪串接),node-detail 告警表格對該 controller 顯示兩列

#### Scenario: 缺 pod 欄的告警以來源 pod 回填

- **WHEN** 子 pod(label `mongo-0`)的 alert 不帶 `pod` 欄
- **THEN** controller 上的聚合副本 `pod` 為 `"mongo-0"`;該 pod 自身元素的 alert 仍不帶 `pod` 欄(輸入與 pod 元素未被修改)

#### Scenario: 帶 id 的告警跨 pod 去重

- **WHEN** 兩個子 pod 各帶 `id: "alert-1"` 的同一筆 alert
- **THEN** controller 的 `data.alerts` 僅含一筆 `id: "alert-1"`(穩定順序首見者)

#### Scenario: 無子 pod 帶告警時省略

- **WHEN** 某 controller 旗下無任一子 pod 帶 `alerts`
- **THEN** enrich 後該 controller 節點 MUST NOT 帶 `data.alerts`(告警表格顯示「No alerts」)

#### Scenario: 告警聚合不影響 status 上色

- **WHEN** 某 controller 旗下唯一 pod `status: normal` 但帶一筆 `severity: 'critical'` 的 alert
- **THEN** controller 的 `data.alerts` 含該筆 alert,但 `worstStatus` 仍為 `normal`(alert 不升級 status——顏色仍由 status 決定)

### Requirement: 後端群組節點(namespace / application / controller / storage-cluster)的辨識與上色

Normalize boundary SHALL 辨識後端直接輸出的四種 compound 群組節點(`data.type` 為 `namespace` / `application` / `controller` / `storage-cluster`),並比照既有 `cluster` flag-group 的處理方式將其正規化為**裝飾性 compound parent**——除 `controller` 外皆不給 `kind`(使其對 kind 過濾與 icon 圖例不可見,且可見性過濾略過它們:無 kind ⇒ 恆可見,僅受 orphan 級聯影響)。其 `data.parent` 一律**原樣透傳**(app 不重組結構,只指派色彩強調)。**可選取性由 graph-view 的「Interaction and selection state」規範**:`namespace` / `application` 群組與 `controller` 皆維持可選取(選取驅動的 collapse cue 依賴此;選取 `namespace` 不開 detail panel,`application` 則為 detail-eligible 的例外),`cluster` 與 `storage-cluster` 群組為 `selectable: false`。normalize MUST NOT 對 `namespace` / `application` / `controller` 設 `selectable: false`——否則 canvas 的 tap gate 會丟棄其點擊,collapse cue 永遠不會出現、controller / application 的 detail panel 也永遠打不開。映射為:

- `namespace` → `{ isNamespace, namespace: <label>, namespaceColor }`——**沿用**既有 `isNamespace` flag、stylesheet selector 與 namespace 圖例;色彩強調為固定的 per-kind 顏色(見 graph-view「裝飾性 compound 群組使用 per-kind 固定色彩與 kind 前綴標籤」)。
- `application` → `{ isApplication, application: <label>, applicationColor }`——**新增** `isApplication` flag、application 調色盤、stylesheet selector 與 application 圖例;色彩強調同為固定 per-kind 顏色。
- `storage-cluster` → `{ isStorageCluster, storageCluster: <label>, storageClusterColor }`——ONTAP cluster 外圍的裝飾性框,色彩強調同為固定 per-kind 顏色;與 `cluster` 一樣 `selectable: false`(可選取的真實節點是其下的 `netapp-node` / `netapp-aggr`)。
- `controller` → `{ isController: true, kind: <子 pod 的 owner.kind 小寫化> }`(見「pod / service / pvc `application`、pod `containers` 透傳與 controller 聚合」):controller 帶真實 `kind` 以保留其 detail panel,使其既是 compound parent 也是帶 glyph 的節點(收合時繪製該 kind 的 icon)。

`namespace` / `application` / `storage-cluster` 群組 `labels: {}`、無 status、無 edge;純粹作為 `data.parent` 目標存在。

對裝飾性群組(`cluster` / `storage-cluster` / `namespace` / `application`),normalize MUST 將 `data.label` 設為上游的裸名稱(`data.name`,缺則 fallback 為 id),**MUST NOT** 寫入 kind 前綴(`Cluster:` / `Storage:` / `Namespace:` / `Release Unit:`)。帶前綴的畫布標籤是 stylesheet render-only mapper 的職責(見 graph-view);裸 `data.label` 供 tooltip 標題與其他 identity 消費者使用。

#### Scenario: namespace 群組被正規化並上色

- **WHEN** 上游節點 `data.type === 'namespace'`、`name === 'shop'`,且 `parent` 指向其 cluster 容器
- **THEN** normalize 產出 `isNamespace: true`、`namespace: 'shop'`、`label: 'shop'`(裸名稱,無 `Namespace:` 前綴)與固定 per-kind 色彩的 `namespaceColor`;**不**帶 `kind`、**不**設 `selectable: false`(維持可選取、由 cue 驅動——見 graph-view「Interaction and selection state」),`parent` 原樣透傳

#### Scenario: application 群組被正規化並上色

- **WHEN** 上游節點 `data.type === 'application'`、`name === 'checkout'`,且 `parent` 指向其 namespace 群組
- **THEN** normalize 產出 `isApplication: true`、`application: 'checkout'`、`label: 'checkout'`(裸名稱,無 `Release Unit:` 前綴)與固定 per-kind 色彩的 `applicationColor`;**不**帶 `kind`、**不**設 `selectable: false`(維持可選取;`application` 為 detail-eligible——見 graph-view),`parent` 原樣透傳

#### Scenario: cluster 群組正規化為裸標籤

- **WHEN** 上游節點 `data.type === 'cluster'` 且 `name === 'prod'`
- **THEN** normalize 產出 `isCluster: true`、`cluster: 'prod'`、`label: 'prod'`(裸名稱,無 `Cluster:` 前綴)、固定 per-kind 色彩的 `clusterColor`,以及 `selectable: false`

#### Scenario: storage-cluster 群組正規化為裸標籤

- **WHEN** 上游節點 `data.type === 'storage-cluster'` 且 `name === 'ontap-prod'`(無 `parent`)
- **THEN** normalize 產出 `isStorageCluster: true`、`storageCluster: 'ontap-prod'`、`label: 'ontap-prod'`(裸名稱,無前綴)與固定 per-kind 色彩的 `storageClusterColor`;**不**帶 `kind` 且 `selectable: false`

#### Scenario: controller 群組標記 isController 並自子 pod 取 kind(維持可選取)

- **WHEN** 上游節點 `data.type === 'controller'`(無 `kind`),且其某子 pod 的 `owner.kind === 'StatefulSet'`
- **THEN** normalize 產出 `isController: true` 與 `kind: 'statefulset'`,`parent` 原樣透傳,且 **MUST NOT** 設 `selectable: false`(controller 為 detail-eligible,必須維持可選取以開啟 detail panel)

#### Scenario: 無 kind 的群組對 kind 過濾與 icon 圖例不可見

- **WHEN** 可見性過濾與 icon 圖例推導對 `namespace` / `application` / `storage-cluster` 群組執行
- **THEN** 三者皆因無 `kind` 而被可見性過濾略過(恆可見,僅受 orphan 級聯影響),且皆不出現於 icon 圖例

### Requirement: Node worstStatus 依 pod-to-node 邊聚合

自 design D6 起 pod 不再巢狀於 k8s `node` 之下(`pod-runs-on-node` 改以 `pod-to-node` 邊表達),故 `controller` 視圖中 node 的收合邊框顏色無法再自子節點計算。Normalize boundary SHALL 將每個 `node` 的 `data.worstStatus` 重算為:**經 `pod-to-node` 邊連結的 pod 之中最差 status**(worst-wins,並納入 node 自身 status;排序 critical > warning > normal;status 取自 pod 的 `data.status`,缺值 / 不合法預設 `normal`)。於**有 status 資訊**時寫入(node 自身帶合法 status,或至少有一條 `pod-to-node` 邊連到的 pod);自身無 status 且無任何連結 pod 時 MUST 省略此欄(「無資訊」不得偽裝成 `normal`)。此欄供 graph-view 的 stylesheet 對**收合的** node 邊框上色(見 graph-view 規格)。`node` 視圖中 pod 重新巢狀於 node 之下,既有以子節點計算的 worstStatus 亦成立。

#### Scenario: node worstStatus 取 pod-to-node 連結 pod 之最差

- **WHEN** 某 `node`(自身 `status: normal`)經 `pod-to-node` 邊連到兩個 pod,分別 `status: warning` 與 `status: critical`
- **THEN** 該 node `data.worstStatus` 為 `critical`(critical > warning)

#### Scenario: node 自身 status 不被連結 pod 降級

- **WHEN** 某 `node` 自身 `status: critical`,其經 `pod-to-node` 連到的 pod 皆 `normal`
- **THEN** 該 node `data.worstStatus` 為 `critical`(worst-wins,不被子節點降級)

#### Scenario: 無 status 資訊時省略 worstStatus

- **WHEN** 某 `node` 自身無 `status` 且無任何 `pod-to-node` 邊連結的 pod
- **THEN** 該 node MUST 省略 `worstStatus`(無 status 資訊)

### Requirement: Edge metrics 正規化與逐欄降級

Normalize boundary MUST 將上游 edge 的 `data.metrics` 以**相同名稱、相同單位**帶到產出 cytoscape edge 的 `data.metrics`,其型別以 declaration merging 宣告於內部模型。`metrics` 為兩個互斥家族的聯集(見「上游 kube-state-graph payload 契約」):RED 家族 `rate` / `errorRate` / `p90ServerMs`,與 I/O 家族 `readOps` / `writeOps` / `readLatencyUs` / `writeLatencyUs` / `readBytesPerSec` / `writeBytesPerSec` / `maxIops` / `maxBytesPerSec`(snake_case → camelCase,其餘不變)。這是**純透傳加驗證**:app MUST NOT 於此層換算單位、轉百分比、四捨五入或填預設值——格式化屬於渲染層(graph-view / storage-flow-sankey)。

驗證與降級規則(metrics 是附加資訊層,**任何 metrics 問題都不得使 edge 消失**):

- `metrics` 非 plain object → 丟棄整個 `metrics`;edge 照常產出。
- `rate` 存在但非 `number` 或非有限(`NaN` / `±Infinity`)→ 丟棄整個 `metrics`(`rate` 為 RED 家族的必要欄位);edge 照常產出。
- **缺 `rate` MUST NOT 丟棄整個 `metrics`**:改以 I/O 家族解析——八個 I/O 欄位中任一為有限 `number` 則保留該家族;否則丟棄整個 `metrics`。這是聯集引入的唯一行為差異。
- 任何選用欄位(`error_rate` / `p90_server_ms` / 八個 I/O 欄位)存在但非有限 `number` → **只丟該欄**,保留 `metrics` 其餘部分。
- 兩個上限欄位(`max_iops` / `max_bytes_per_sec`)與六個量測欄位走**完全相同**的逐欄守衛。normalize MUST NOT 額外強制「上限不得單獨出現」:該不變式屬於後端(見上游契約的 hop B / hop C 說明),在此重驗會在後端行為改變時悄悄丟資料。
- 若兩家族欄位同時出現(依契約不可能),RED 家族 MUST 勝出、I/O 欄位 MUST 丟棄——絕不產出消費者無法判別的混合物件。
- 上游未送的選用欄位 MUST 維持缺席(**絕不**以 `0`、`null` 或任何佔位值填補)。
- 值 MUST 原樣保留,包含指數形式的極小值(如 `3.86e-7`)與 `0`。

metrics 驗證失敗 MUST NOT 寫入 normalize boundary 的 `errors` 陣列——該通道專供影響拓樸正確性的 partial-parse 警告,metrics 缺口不影響拓樸,寫入只會讓警告 banner 變成噪音。

#### Scenario: 合法 metrics 透傳至 edge data

- **WHEN** 上游 edge `data` 為 `{ id, source, target, type: 'pod-calls-service', labels: {}, metrics: { rate: 5, error_rate: 0.2, p90_server_ms: 45 } }`(兩端節點皆存在)
- **THEN** 產出的 edge element `data.metrics` 為 `{ rate: 5, errorRate: 0.2, p90ServerMs: 45 }`,無單位換算、無四捨五入

#### Scenario: 無 metrics 的 edge 不產生該欄位

- **WHEN** 上游 edge `data` 無 `metrics` key(例如 `pod-mounts-pvc` edge)
- **THEN** 產出的 edge element `data` 同樣無 `metrics` key(非明確的 `undefined`,非空物件)

#### Scenario: 缺席的 error_rate 與零值 error_rate 是不同狀態

- **WHEN** 一條上游 edge 帶 `metrics: { rate: 3 }`(無 `error_rate`),另一條帶 `metrics: { rate: 1, error_rate: 0 }`
- **THEN** 前者的 `data.metrics` 無 `errorRate` key,後者為 `errorRate: 0`

#### Scenario: 單一無效欄位不拖垮其餘 metrics

- **WHEN** 上游 edge 的 `metrics` 為 `{ rate: 5, error_rate: 'high', p90_server_ms: 45 }`
- **THEN** 產出 `data.metrics` 為 `{ rate: 5, p90ServerMs: 45 }`(丟棄 `errorRate`),edge 本身照常產出

#### Scenario: 不可用的 rate 丟棄 metrics 但保留 edge

- **WHEN** 上游 edge 的 `metrics` 為 `{ rate: null, error_rate: 0.1 }`(`rate` 存在但無效),或 `metrics` 為字串,或 `{ error_rate: 0.1, p90_server_ms: 45 }`(無 `rate` 亦無任何合法 I/O 欄位)
- **THEN** 產出的 edge element 無 `metrics` key,但該 edge element 仍存在於 `elements` 中,其 `edgeType` / `labels` 不受影響

#### Scenario: 指數形式的極小值原樣保留

- **WHEN** 上游 edge 的 `metrics` 為 `{ rate: 3.86e-7, error_rate: 6.7e-8 }`
- **THEN** 產出 `data.metrics.rate` 嚴格等於 `3.86e-7`、`data.metrics.errorRate` 嚴格等於 `6.7e-8`(皆未被截為 `0`)

#### Scenario: RED 缺口不進入 errors 通道

- **WHEN** 上游 payload 含上述任一形式的無效 `metrics` edge
- **THEN** normalize boundary 回傳的 `errors` 陣列 MUST NOT 因此新增任何項目

#### Scenario: I/O 家族 metrics 透傳至儲存 edge

- **WHEN** 上游 `pvc-to-netapp-aggr` edge 帶 `metrics: { read_ops: 150, write_ops: 40, read_latency_us: 830, write_latency_us: 1200, read_bytes_per_sec: 5242880, write_bytes_per_sec: 1048576, max_iops: 5000, max_bytes_per_sec: 262144000 }`(無 `rate`)
- **THEN** 產出 `data.metrics` 為 `{ readOps: 150, writeOps: 40, readLatencyUs: 830, writeLatencyUs: 1200, readBytesPerSec: 5242880, writeBytesPerSec: 1048576, maxIops: 5000, maxBytesPerSec: 262144000 }`,無 `rate` key,此層不做任何換算(不在此換成 MB/s;`maxBytesPerSec` 已由後端自 MB/s 換算完成)

#### Scenario: I/O 家族逐欄降級

- **WHEN** 上游儲存 edge 的 `metrics` 為 `{ read_ops: 150, write_ops: 'many', read_bytes_per_sec: 5242880 }`(僅部分欄位,其中一個無效)
- **THEN** 產出 `data.metrics` 為 `{ readOps: 150, readBytesPerSec: 5242880 }`,edge 照常產出,`errors` 不新增任何項目

#### Scenario: 有量測、無宣告上限

- **WHEN** 上游儲存 edge 帶 `metrics: { read_ops: 150, write_ops: 40, read_bytes_per_sec: 5242880 }`(該 volume 不屬於任何 QoS policy group,後端未送上限)
- **THEN** 產出 `data.metrics` 無 `maxIops` 與 `maxBytesPerSec` key(絕非 `0`、`null` 或 unlimited 哨兵),其餘欄位照常透傳

#### Scenario: 上限欄位逐欄降級

- **WHEN** 上游儲存 edge 帶 `metrics: { read_ops: 150, max_iops: 5000, max_bytes_per_sec: 'unlimited' }`
- **THEN** 產出 `data.metrics` 為 `{ readOps: 150, maxIops: 5000 }`——無效的 `max_bytes_per_sec` 只丟該欄,家族其餘欄位完整,`errors` 不新增任何項目

### Requirement: NetApp 節點與 PVC 儲存欄位(health / usage / storageclass)正規化

Normalize boundary SHALL 將上游 `data.type === 'netapp-aggr'` 與 `data.type === 'netapp-node'` 的節點正規化為對應 `kind` 的**真實葉節點語意**節點(帶 icon、可選取、屬 `Storage` 類別),`parent` 原樣透傳——包含 `netapp-aggr` 的 parent 為**真實** `netapp-node` id 的情況(見「上游 kube-state-graph payload 契約」的儲存鏈)。後端不送 `status`,故 `status` 省略。

三個節點欄位在各自獨立的逐欄守衛下透傳,互不牽連:

- `health`(`netapp-aggr` / `netapp-node`):值為字串 `"online"` 或 `"degraded"` 時透傳;**任何其他字串亦原樣透傳**(未知的後端值絕不能讓節點失敗);非字串或空字串則省略。缺 `health` MUST NOT 以 `"degraded"` 或任何預設值填補。
- `usage`(`netapp-aggr` / `pvc`):`used_bytes` / `capacity_bytes` 各自為有限 `number` 且 `>= 0` 時透傳為 `usedBytes` / `capacityBytes`;兩者皆不合格時省略整個 `usage`。
- `storageclass`(`pvc`):為非空字串時透傳。

**推導 `usageRatio`。** 當 `usage` 同時持有合格的 `usedBytes` 與合格的 `capacityBytes` 且 `capacityBytes > 0` 時,normalize MUST 另寫入推導欄位 `usageRatio`(`usedBytes / capacityBytes`,clamp 至 `[0,1]`)。此欄位**專為 stylesheet 的節點使用率視覺**而存在——cytoscape selector 既讀不到巢狀 `data` 也做不了除法,故必須於 normalize 攤平。`capacityBytes` 為 `0`、任一欄位缺席、或比率無法計算時,MUST NOT 寫入 `usageRatio`(缺席 = 不畫使用率視覺)。此推導**與 kind 無關**:任何帶合格 `usage` 的節點都得到 `usageRatio`,`pvc` 與 `netapp-aggr` 走同一規則,未來任何帶 usage 的 kind 自動涵蓋。

`netapp-aggr` 與 `netapp-node` 皆為 `Storage` 類別的帶 icon `NodeKind`,故自動出現於 kind 圖例;兩者皆為**可選取**、detail-eligible 的節點——`netapp-node` 雖為 compound parent 仍維持可選取,與 `controller` 及 k8s `node` 容器相同。

#### Scenario: netapp-aggr 被正規化、透傳 health / usage 並推導 usageRatio

- **WHEN** 上游節點 `data.type === 'netapp-aggr'`,`parent` 指向真實的 `netapp-node` id,`health: "online"`,`usage: { used_bytes: 700000000000, capacity_bytes: 1000000000000 }`
- **THEN** normalize 產出 `kind: 'netapp-aggr'`、`health: 'online'`、`usage: { usedBytes: 700000000000, capacityBytes: 1000000000000 }` 與 `usageRatio: 0.7`,**不**帶 `status`,且 `parent` 與 `label`(= `name`)原樣保留

#### Scenario: netapp-node 是真實的 compound parent 且維持可選取

- **WHEN** 上游節點 `data.type === 'netapp-node'`,`parent` 指向 `storage-cluster` 群組,`health: "degraded"`,且另一個 `netapp-aggr` 節點的 `parent` 指向它
- **THEN** normalize 產出 `kind: 'netapp-node'` 與 `health: 'degraded'`,**MUST NOT** 設 `selectable: false`,且該 `netapp-aggr` 的 `parent` 仍指向此節點的 id(cytoscape 自 `data.parent` 建立巢狀)

#### Scenario: 缺席的 health 不被填補

- **WHEN** 上游 `netapp-aggr` 或 `netapp-node` 無 `health` 欄位(或其值為空字串或非字串)
- **THEN** 產出 element 的 `data` 無 `health` key(不寫入 `undefined` 值),且 MUST NOT 填為 `'degraded'`

#### Scenario: PVC 透傳 storageclass 與 usage

- **WHEN** 上游 `pvc` 節點帶 `storageclass: "netapp-nas"` 與 `usage: { used_bytes: 5368709120, capacity_bytes: 10737418240 }`
- **THEN** normalize 產出 `storageclass: 'netapp-nas'`、`usage: { usedBytes: 5368709120, capacityBytes: 10737418240 }` 與 `usageRatio: 0.5`

#### Scenario: usage 逐欄降級

- **WHEN** 上游節點的 `usage` 為 `{ capacity_bytes: 1000 }`(僅 capacity)或 `{ used_bytes: 'lots', capacity_bytes: 1000 }`(一欄無效)
- **THEN** 兩者皆產出 `usage: { capacityBytes: 1000 }`,且因缺 `usedBytes` **MUST NOT** 寫入 `usageRatio`

#### Scenario: 零 capacity 不產生 usageRatio

- **WHEN** 上游節點的 `usage` 為 `{ used_bytes: 0, capacity_bytes: 0 }`
- **THEN** 產出 `usage: { usedBytes: 0, capacityBytes: 0 }`,且 **MUST NOT** 寫入 `usageRatio`(避免除以零)

#### Scenario: 形狀錯誤的 usage 整個丟棄

- **WHEN** 上游節點的 `usage` 非 plain object(字串、陣列或 `null`)
- **THEN** normalize 省略 `usage` 與 `usageRatio`,其餘欄位照常正規化,節點照常產出

### Requirement: K8s node `ready_status` 正規化

Normalize boundary SHALL 將上游節點的 `ready_status` 於其為非空字串時以 `data.readyStatus`(`string`)帶到產出的 cytoscape node;否則該欄位 SHALL 自 `data` **完全缺席**。

值 SHALL **原樣**透傳,不做映射、大小寫變更、或對後端 `"Ready"` / `"NotReady"` / `"Unknown"` 三值的成員檢查。守衛與 `health` 相同、理由相同:上游若新增第四種 condition 值,必須浮現而非消失。

**缺值 MUST NOT 預設為 `"Unknown"`、`""` 或任何其他值。** 後端在節點完全沒有 Ready-condition series 時省略此欄,並將字面值 `"Unknown"` 保留給 kubelet 停止回報的真實 Kubernetes 狀態。混淆兩者會把 scrape 缺口渲染成叢集級的故障。

`readyStatus` 是**第三個 status 軸**,MUST NOT 餵入 `data.status`、`data.worstStatus`、status 邊框顏色或任何 alerts 聚合。Kubernetes 的 Ready condition 與 app 的 alert severity 回答不同的問題,節點可以合法地 `NotReady` 而無任何告警;將其一折入另一會讓同一顏色代表兩件事。

#### Scenario: 每種 condition 值原樣透傳

- **WHEN** 上游 `node` 帶 `ready_status: "NotReady"`
- **THEN** 產出 node 的 `data.readyStatus` 為 `'NotReady'`

#### Scenario: 無 Ready 資料的 node 不帶欄位

- **WHEN** 上游 `node` 無 `ready_status` key、或為空字串、或為非字串值
- **THEN** 產出 `data` 無 `readyStatus` key——絕非 `''`、絕非 `'Unknown'`——且 `errors` 不新增任何項目

#### Scenario: 未辨識的 condition 值得以保留

- **WHEN** 上游 `node` 帶 `ready_status: "SchedulingDisabled"`
- **THEN** `data.readyStatus` 為 `'SchedulingDisabled'`

#### Scenario: 各 status 軸互不影響

- **WHEN** 一個帶 `ready_status: "NotReady"` 且無 alerts 的 node 被正規化
- **THEN** 其產出 `data` 除 `readyStatus` 欄位本身外,與同一 node 不帶 `ready_status` 時的正規化結果完全相同
