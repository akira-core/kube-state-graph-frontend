## Purpose

定義送往後端的 graph 過濾:一列位於導覽列之下的過濾控制(cluster / AZ / env / namespace / edge type 與投影),它們如何成為 `endpoints.graph` 的查詢參數,選項自何處列舉(pod inventory 的 label values 與後端的 edge-type 目錄),以及選項來源失敗時的行為。此能力取代 Grafana dashboard 變數所做的事。它與 `element-filter`(legend 上的視覺過濾)互不相干:前者決定後端回傳什麼,後者只在已回傳的圖上做視覺精修。

## ADDED Requirements

### Requirement: 過濾列與其控制

非 demo 模式下,app SHALL 於導覽列之下、視圖區之上顯示一列固定高度的**過濾列**,含下列控制,每個皆 MUST 具有可存取名稱並可經鍵盤操作:

1. **Cluster**、**AZ**、**Env**、**Namespace** 四個多選控制(身分維度);
2. **Edge type** 多選控制;
3. **Projection** 單選控制,兩個選項為 `Traffic graph`(對應 `prune=true`,預設)與 `Full inventory`(對應 `prune=false`);
4. **Clear** 動作,將全部選擇還原為預設(五個清單清空、投影回 `Traffic graph`);當已是預設時 MUST 為 disabled。

`demoMode` 為 `true` 時 MUST NOT 顯示過濾列——demo 模式渲染內建 fixture,沒有可窄化的後端。

某個維度已被選取的值即使不再出現於該維度的選項清單中(如 namespace 已被清空、cluster 已下線),MUST 仍留在清單中並維持選取樣式:把它從清單移除會在控制仍宣稱過濾生效的情況下,悄悄放寬過濾範圍。

#### Scenario: demo 模式不顯示過濾列

- **WHEN** runtime config 的 `demoMode` 為 `true`
- **THEN** 過濾列不存在於 DOM,且 app 不對 `endpoints.labelValues` / `endpoints.edgeTypes` 發出任何請求

#### Scenario: Clear 還原為預設

- **WHEN** 使用者選了兩個 namespace 並將投影改為 `Full inventory`,然後按下 Clear
- **THEN** 五個清單皆清空、投影回 `Traffic graph`,且 Clear 隨即為 disabled

#### Scenario: 已消失的選取值仍留在清單

- **WHEN** 使用者選取 namespace `shop`,其後選項來源不再回報 `shop`
- **THEN** `shop` 仍出現於 Namespace 控制中且維持選取,過濾範圍不變

### Requirement: 過濾由後端執行,而非前端

過濾選擇 MUST 以查詢參數送往 `endpoints.graph`,MUST NOT 於前端對已回傳的圖套用:此處要證明的正是 `cluster` / `az` / `env` / `namespace` 作為原始 label matcher 抵達上游 PromQL。參數對應為 `cluster` / `az` / `env` / `namespace` / `edge_type`(前端欄位 `edgeType` 於組 URL 之處更名,是唯一一處)與 `prune`。同一參數名重複代表 OR,不同參數名之間為 AND。清單為空的維度 MUST 完全不出現於查詢字串;`prune` MUST 恆帶(見 `graph-data-source`)。

變更任一過濾控制 MUST 以新的選擇對 `endpoints.graph` 重新取數,並走與「重新載入」相同的路徑:既有圖於請求進行中持續可見,不重跑佈局,亦不重置視圖狀態。

過濾選擇 MUST NOT 被持久化——不寫入瀏覽器本機儲存、不寫入 URL、不寫入 runtime config。被記住的過濾在下次造訪時是隱形的,會把一個被窄化的機房當成全部呈現,正是投影控制要避免的那種「這裡沒有東西」與「這裡沒有顯示東西」的混淆。

`element-filter` 的 kind / edge-type 顯示切換、ingress toggle、搜尋、pod-parent mode 與 collapse 狀態 MUST NOT 影響此處的任何參數,反之亦然。

#### Scenario: 多選送出重複參數

- **WHEN** 使用者於 Cluster 選取 `prod` 與 `dr`,於 Namespace 選取 `shop`
- **THEN** 送出的 graph 請求帶 `cluster=prod&cluster=dr&namespace=shop`,不帶 `az` 與 `env`

#### Scenario: 投影切換送出 prune

- **WHEN** 使用者將投影自 `Traffic graph` 改為 `Full inventory`
- **THEN** 送出的 graph 請求帶 `prune=false`,且該次取數期間既有圖持續可見

#### Scenario: 過濾不被記住

- **WHEN** 使用者選取 cluster `prod` 後重新整理頁面
- **THEN** Cluster 控制為空選,網址列不含任何過濾參數,runtime config 未被寫入

### Requirement: 選項來源

四個身分維度的選項 SHALL 讀自 `endpoints.labelValues` 所指的 Prometheus 相容 HTTP API 根:每個維度請求 `<root>/api/v1/label/<dimension>/values?match[]=kube_pod_info`,回應 MUST 依 Prometheus 封套 `{"status":"success","data":[…]}` 驗證,`data` MUST 為字串陣列。`status` 非 `success` 時 MUST 視為失敗並回報其 `error`,MUST NOT 讀成空清單——一個空的下拉與一個壞掉的 store 不可長得一樣。

序列 `kube_pod_info` MUST 固定,不可設定:它就是 Kubernetes pod inventory 的定義,也正是後端把 `?cluster=` / `?az=` / `?env=` / `?namespace=` 推入上游查詢時所比對的 label 家族。選項 MUST NOT 改由 graph 回應推導——回應帶的是合成後的 `<az>-<env>-<cluster>` 身分,把它送回作 `?cluster=` 會比不中任何序列、得到一張 200 的空圖;`az` 與 `env` 更根本不在回應裡。

Edge type 的選項 SHALL 讀自 `endpoints.edgeTypes`(後端的 `/v1/edge-types`),回應形狀為 `{ "edge_types": [{ "type": "…" }, …] }`,任一元素缺 `type` 即為失敗。該目錄與驗證 `?edge_type=` 的是上游同一份 registry,故它提供的值必為後端接受的值;寫死於前端的清單遲早會提供一個換來 400 的值。

兩個端點皆為選用:缺席(或為空字串)時,對應控制 MUST 不提供任何選項,且 MUST NOT 因此發出請求。選項 MUST 於每個來源各載入一次,而非隨每次 graph 請求重載:選項追蹤的是 inventory 與 registry,兩者都不隨投影或當前選擇變動;隨請求重建會把 namespace 清單縮成剛好那張被 prune 過的圖所含的值,使用者便再也無法把過濾放寬回去。

#### Scenario: 身分維度自 label values 列舉

- **WHEN** `endpoints.labelValues` 為 `https://prom.example/`,`GET https://prom.example/api/v1/label/namespace/values?match[]=kube_pod_info` 回 `{"status":"success","data":["shop","infra"]}`
- **THEN** Namespace 控制提供 `shop` 與 `infra` 兩個選項

#### Scenario: store 回報錯誤不被當成空清單

- **WHEN** label values 端點回 `{"status":"error","error":"query timed out"}`
- **THEN** 該控制不提供選項,且過濾列顯示來源不可用的指示,其細節含 `query timed out`

#### Scenario: edge type 自後端目錄列舉

- **WHEN** `endpoints.edgeTypes` 回 `{"edge_types":[{"type":"pod-calls-service"},{"type":"pvc-to-netapp-aggr"}]}`
- **THEN** Edge type 控制恰好提供這兩個值

#### Scenario: 端點缺席即不提供選項

- **WHEN** runtime config 無 `endpoints.edgeTypes`
- **THEN** app 不為 edge type 發出任何請求,該控制沒有選項,其餘控制不受影響

### Requirement: 選項來源失敗不得變成缺圖

任一選項來源失敗(HTTP 非 2xx、網路錯誤、JSON 解析失敗、形狀不符、Prometheus `status` 非 `success`)MUST NOT 使 graph 取數失敗、MUST NOT 阻擋過濾列渲染、MUST NOT 拋出未捕捉的錯誤。失敗的維度 MUST 呈現為空的控制,並於過濾列上以一個指示說明有幾個來源不可用,其細節(每個失敗來源一行,含 URL 與原因)MUST 可被使用者讀到。一個消失的下拉絕不能變成一張消失的圖。

#### Scenario: 一個來源失敗其餘照常

- **WHEN** `endpoints.labelValues` 回 503,而 `endpoints.edgeTypes` 正常回應
- **THEN** 四個身分控制為空、Edge type 控制正常提供選項,過濾列顯示 4 個來源不可用的指示,graph 仍以目前選擇正常取數並渲染

#### Scenario: 失敗細節可讀

- **WHEN** 某個來源以 `GET https://prom.example/api/v1/label/az/values…: data is not an array` 失敗
- **THEN** 該訊息可自過濾列的來源指示讀到,而非只記於主控台
