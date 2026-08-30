## Purpose

定義 SPA 的執行期設定契約:應用啟動時自設定文件讀取所有後端端點 URL、demo 模式、自動刷新間隔、預設佈局與初始主題,並規範 schema、驗證規則、缺值與錯誤行為,使同一份建置產物(同一個 container image)僅憑設定文件即可部署至任何環境。

## ADDED Requirements

### Requirement: 設定文件位置與載入時機

應用 SHALL 於每次完整頁面載入時,在渲染任何視圖之前,以 HTTP `GET` 取得一份 JSON 設定文件;其路徑為 app base URL 之下的 `config.json`(app 部署於 `/` 時為 `/config.json`,部署於 `/ksg/` 時為 `/ksg/config.json`)。設定文件於容器內由 Kubernetes ConfigMap 掛載提供(掛載方式見 `container-deployment`)。

設定文件 MUST 僅於每次完整頁面載入時讀取一次;應用 MUST NOT 於 session 內輪詢或重新讀取設定,MUST NOT 將設定內容寫入瀏覽器本機儲存或於後續載入沿用先前副本——設定文件的變更 MUST 在下一次完整頁面載入時生效。

設定文件的路徑 MUST NOT 可由頁面 URL(query string、hash)或任何使用者可控的輸入覆寫:任何連結都不得使應用改讀其他來源的設定。

#### Scenario: 啟動時先取得設定再渲染視圖

- **WHEN** 使用者開啟應用的任一 URL
- **THEN** 應用在發出任何後端資料請求或渲染任何視圖之前,先發出恰好一次 `GET <base>/config.json`;設定解析完成前 MUST NOT 對 `endpoints.*` 發出任何請求

#### Scenario: 設定變更於下次完整載入生效

- **WHEN** ConfigMap 更新使 `config.json` 內容改變,而使用者的分頁仍在執行中
- **THEN** 執行中的 session 持續使用原本載入的設定;使用者完整重新整理頁面後,應用重新取得設定文件並依新內容運作

#### Scenario: 頁面 URL 無法改變設定來源

- **WHEN** 使用者開啟形如 `/graph?config=https://evil.example/c.json` 的 URL
- **THEN** 應用仍只讀取 `<base>/config.json`,且該 query 參數不影響設定來源

### Requirement: 設定 schema、型別與預設值

設定文件的根 MUST 為 JSON object。應用 SHALL 依下表驗證每個已知鍵;任一已知鍵存在但型別或值不合法(含 `null`)即為驗證失敗。缺席的選用鍵 MUST 套用預設值。

| 鍵                        | 型別                                | 必要性                       | 預設值     | 語意                                                                                        |
| ------------------------- | ----------------------------------- | ---------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `endpoints`               | object                              | 選用                         | `{}`       | 後端端點 URL 集合                                                                           |
| `endpoints.graph`         | string(URL)                         | `demoMode` 為 `false` 時必要 | 無         | 後端 graph 查詢端點的 URL(部署上通常為 `/v1/graph/service_graph`;detail 子端點為其 sibling) |
| `endpoints.codeChanges`   | string(URL)                         | 選用                         | 缺席       | 後端 `/v1/graph/code_changes` 的 URL                                                        |
| `endpoints.configChanges` | string(URL)                         | 選用                         | 缺席       | 後端 `/v1/graph/config_changes` 的 URL                                                      |
| `endpoints.dashboard`     | string(URL)                         | 選用                         | 缺席       | 後端 `/dashboard` 的 URL                                                                    |
| `demoMode`                | boolean                             | 選用                         | `false`    | 為 `true` 時渲染內建 showcase fixture 而不取數                                              |
| `refreshIntervalSeconds`  | integer,`>= 0`                      | 選用                         | `0`(關閉)  | graph 資料自動刷新間隔(秒);`0` 表示不自動刷新                                               |
| `defaultLayout`           | `"fcose"` \| `"dagre"`              | 選用                         | `"fcose"`  | Graph 視圖的初始佈局演算法;使用者可於 app 內切換                                            |
| `theme`                   | `"dark"` \| `"light"` \| `"system"` | 選用                         | `"system"` | 初始主題;使用者於 app 內的選擇 MUST 優先於此值(見 `app-shell`)                              |

`refreshIntervalSeconds` MUST 為 JSON 整數:小數、負數、字串形式的數字皆為驗證失敗。`demoMode` MUST 為 JSON boolean:字串 `"true"` / `"false"` 為驗證失敗。列舉型欄位 MUST 精確比對(區分大小寫)。應用 MUST NOT 對任何欄位做自動修正(型別強制轉換、去除空白、補上 scheme)。

#### Scenario: 最小有效設定

- **WHEN** 設定文件內容為 `{ "endpoints": { "graph": "https://ksg.example/v1/graph" } }`
- **THEN** 設定驗證通過,且 `demoMode` 為 `false`、`refreshIntervalSeconds` 為 `0`、`defaultLayout` 為 `"fcose"`、`theme` 為 `"system"`,其餘 `endpoints.*` 視為缺席

#### Scenario: 根非物件

- **WHEN** 設定文件內容為 JSON 陣列 `[]` 或字串 `"x"`
- **THEN** 設定驗證失敗,應用顯示設定錯誤畫面(見「設定缺失或無效時的錯誤畫面」)

#### Scenario: 型別錯誤即驗證失敗

- **WHEN** 設定文件含 `"refreshIntervalSeconds": "30"`、`"refreshIntervalSeconds": 1.5`、`"refreshIntervalSeconds": -1`、`"demoMode": "true"`、`"endpoints": "https://ksg.example"`、或 `"theme": null` 之一
- **THEN** 設定驗證失敗,錯誤畫面指出該鍵名與問題(例如 `refreshIntervalSeconds: must be an integer >= 0`)

#### Scenario: 列舉值不合法

- **WHEN** 設定文件含 `"defaultLayout": "cola"` 或 `"theme": "auto"` 或 `"theme": "Dark"`
- **THEN** 設定驗證失敗,錯誤畫面指出該鍵名與允許的值

#### Scenario: 自動刷新間隔生效

- **WHEN** 設定文件含 `"refreshIntervalSeconds": 30` 且 `demoMode` 為 `false`
- **THEN** 應用每 30 秒重新取得一次 graph 資料(刷新行為與狀態呈現見 `app-shell`)

### Requirement: 端點 URL 形式規則

每個 `endpoints.*` 的值 MUST 為下列兩種形式之一,否則為驗證失敗:

1. **絕對 URL**:scheme 為 `http` 或 `https`(不區分大小寫)且含 host,例如 `https://ksg.example/v1/graph`。
2. **root-relative 路徑**:以單一 `/` 開頭的路徑,例如 `/api/v1/graph`;應用 MUST 以目前頁面的 origin(`scheme://host[:port]`)解析之,而非 app base path——app 部署於 `https://host/ksg/` 時,`/api/v1/graph` 解析為 `https://host/api/v1/graph`。此形式供同 origin 反向代理使用。

下列形式 MUST 判定為驗證失敗:不以 `/` 開頭的相對路徑(`api/v1/graph`、`./graph`、`../graph`)、protocol-relative URL(`//host/path`)、非 `http(s)` 的 scheme(`ftp:`、`javascript:`、`file:`、`data:`)、無法解析為 URL 的字串、以及任何非字串值。

空字串 `""` 對選用端點 MUST 視為缺席(功能停用,非錯誤);對 `endpoints.graph` MUST 視為缺席(於 `demoMode` 為 `false` 時為驗證失敗)。URL 值 MUST 原樣使用(含其 query string);各消費端如何在其後附加參數由對應 capability 規範。

#### Scenario: 絕對 https URL 通過驗證

- **WHEN** `endpoints.graph` 為 `"https://ksg.example/v1/graph"`
- **THEN** 驗證通過,graph 資料請求發往該 URL

#### Scenario: root-relative 路徑以頁面 origin 解析

- **WHEN** app 於 `https://ops.example/ksg/graph` 執行,且 `endpoints.graph` 為 `"/api/v1/graph"`
- **THEN** 驗證通過,graph 資料請求發往 `https://ops.example/api/v1/graph`

#### Scenario: 未以斜線開頭的相對路徑被拒絕

- **WHEN** `endpoints.dashboard` 為 `"api/dashboard"`
- **THEN** 設定驗證失敗,錯誤畫面顯示 `endpoints.dashboard` 必須為絕對 http(s) URL 或以 `/` 開頭的路徑

#### Scenario: 非 http(s) scheme 與 protocol-relative URL 被拒絕

- **WHEN** 任一 `endpoints.*` 為 `"ftp://ksg.example/v1/graph"`、`"javascript:alert(1)"` 或 `"//ksg.example/v1/graph"`
- **THEN** 設定驗證失敗,錯誤畫面指出該鍵名與問題

#### Scenario: 非字串值被拒絕

- **WHEN** 任一 `endpoints.*` 為數字、物件、陣列或 `null`
- **THEN** 設定驗證失敗,錯誤畫面指出該鍵名與問題

### Requirement: endpoints.graph 為非 demo 模式的必要端點

當 `demoMode` 為 `false`(含缺席時的預設)時,`endpoints.graph` MUST 存在且為合法 URL;缺席、空字串或不合法皆為驗證失敗,應用 MUST 顯示設定錯誤畫面,MUST NOT 以 demo 模式代替。當 `demoMode` 為 `true` 時,`endpoints.graph` 的缺席 MUST NOT 視為錯誤。

#### Scenario: 非 demo 模式缺少 graph 端點

- **WHEN** 設定文件為 `{ "theme": "dark" }`(無 `endpoints.graph`,`demoMode` 缺席)
- **THEN** 設定驗證失敗,錯誤畫面指出 `endpoints.graph` 於 `demoMode` 為 `false` 時為必要,且應用 MUST NOT 渲染 fixture

#### Scenario: demo 模式允許缺少 graph 端點

- **WHEN** 設定文件為 `{ "demoMode": true }`
- **THEN** 設定驗證通過,應用以內建 fixture 渲染

### Requirement: 選用端點缺席時停用對應功能

`endpoints.codeChanges`、`endpoints.configChanges`、`endpoints.dashboard` 任一缺席(或為空字串)時,依賴該端點的功能 MUST 停用:應用 MUST NOT 對該端點發出任何請求,依賴其資料的 UI MUST 不渲染(不得以錯誤訊息、停用狀態的按鈕、或 spinner 取代),且 MUST NOT 對使用者顯示任何錯誤。對應關係如下:

- `endpoints.codeChanges` 缺席 → node detail 的 code change history 區段不渲染。
- `endpoints.configChanges` 缺席 → node detail 的 config change history 區段不渲染。
- `endpoints.dashboard` 缺席 → Dashboard 按鈕不渲染,亦不發出 dashboard URL 預取。

各端點獨立判定:一個端點缺席 MUST NOT 影響其他已設定端點的功能。端點存在時的取數與呈現行為由 `node-detail` 規範。

#### Scenario: 僅設定 graph 端點

- **WHEN** 設定文件的 `endpoints` 僅含 `graph`
- **THEN** graph 正常載入;開啟任一 node 的 detail 面板時,change history 各區段與 Dashboard 按鈕皆不渲染,且不對 code_changes / config_changes / dashboard 發出任何請求

#### Scenario: 部分端點設定

- **WHEN** `endpoints` 含 `graph` 與 `dashboard`,但無 `codeChanges` / `configChanges`
- **THEN** Dashboard 按鈕依 `node-detail` 的適用性規則運作,而 change history 區段不渲染

#### Scenario: 空字串等同缺席

- **WHEN** `endpoints.dashboard` 為 `""`
- **THEN** 行為與 `endpoints.dashboard` 缺席完全相同,且不視為驗證錯誤

### Requirement: demoMode 語意

`demoMode` 為 `true` 時,應用 SHALL 以內建的 showcase fixture 作為 graph 資料來源,MUST NOT 對任何後端端點發出請求,且 MUST 在 UI 上持續、明顯地標示目前為 demo 模式(呈現方式見 `app-shell`)。此時 `endpoints` 整個物件 MUST 被忽略:其缺席、其子鍵的缺席與其值皆不參與驗證、不被使用。依賴選用端點的功能 MUST 依「選用端點缺席時停用對應功能」處理(視所有 `endpoints.*` 為缺席)。

`demoMode` 僅豁免 `endpoints` 的驗證;其他欄位(`refreshIntervalSeconds`、`defaultLayout`、`theme`)在 demo 模式下 MUST 照常驗證並生效。demo 模式下的「重新載入」動作與自動刷新 MUST NOT 發出網路請求,而是以同一份 fixture 重新產生資料。

#### Scenario: demo 模式不取數並標示

- **WHEN** 設定文件為 `{ "demoMode": true, "endpoints": { "graph": "https://ksg.example/v1/graph" } }`
- **THEN** 應用渲染 fixture 圖,整個 session 內不對 `https://ksg.example/v1/graph` 或任何端點發出請求,且 UI 顯示 demo 模式標示

#### Scenario: demo 模式忽略不合法的 endpoints

- **WHEN** 設定文件為 `{ "demoMode": true, "endpoints": { "graph": "not a url" } }`
- **THEN** 設定驗證通過(`endpoints` 被忽略),應用以 fixture 渲染

#### Scenario: demo 模式仍驗證其他欄位

- **WHEN** 設定文件為 `{ "demoMode": true, "theme": "blue" }`
- **THEN** 設定驗證失敗,應用顯示設定錯誤畫面

#### Scenario: demo 模式下端點相依功能停用

- **WHEN** `demoMode` 為 `true`,使用者開啟某 node 的 detail 面板
- **THEN** change history 區段與 Dashboard 按鈕不渲染,且不發出任何請求

### Requirement: 設定缺失或無效時的錯誤畫面

設定文件無法取得(HTTP 非 2xx,含 404)、網路錯誤、內容非合法 JSON、或驗證失敗時,應用 MUST 渲染一個全螢幕的設定錯誤畫面,且 MUST NOT 渲染其他任何內容(無導覽列、無視圖、無資料請求)。錯誤畫面 MUST 顯示:

- 實際請求的設定文件路徑(例如 `/config.json` 或 `/ksg/config.json`);
- 第一個問題的描述:HTTP 狀態碼(如 `HTTP 404`)、JSON 解析錯誤、或第一個驗證問題的鍵名與原因。

應用 MUST NOT 在上述任一情況下靜默退回 demo 模式:404 或空回應 MUST NOT 被解讀為「未設定 → demo」。錯誤畫面 SHALL 提供「重試」動作,重新發出一次設定文件請求並依結果重新走啟動流程。錯誤畫面 MUST 在 dark 與 light 主題下皆可讀。

#### Scenario: 設定文件 404

- **WHEN** `GET /config.json` 回應 HTTP 404
- **THEN** 應用顯示全螢幕設定錯誤畫面,內容含 `/config.json` 與 `HTTP 404`,不渲染導覽列與任何視圖,亦不渲染 fixture

#### Scenario: 設定文件非合法 JSON

- **WHEN** `GET /config.json` 回應 HTTP 200 但 body 為 `{ "endpoints": `(截斷)或 HTML 頁面
- **THEN** 應用顯示設定錯誤畫面,內容含設定路徑與 JSON 解析失敗的說明

#### Scenario: 驗證失敗僅顯示第一個問題

- **WHEN** 設定文件同時含 `"refreshIntervalSeconds": -1` 與 `"theme": "auto"`
- **THEN** 錯誤畫面顯示其中一個問題的鍵名與原因(至少一個、且為第一個被偵測到的問題),不渲染任何視圖

#### Scenario: 網路錯誤

- **WHEN** `GET /config.json` 因網路失敗而無回應
- **THEN** 應用顯示設定錯誤畫面,內容含設定路徑與連線失敗的說明

#### Scenario: 重試後成功

- **WHEN** 錯誤畫面顯示中,運維修正 ConfigMap 後使用者點擊「重試」
- **THEN** 應用重新發出 `GET /config.json`;若成功且驗證通過,則離開錯誤畫面並正常進入應用

### Requirement: 未知鍵值忽略並警告

設定文件的根層級或 `endpoints` 之下出現本契約未定義的鍵時,應用 MUST 忽略該鍵、MUST NOT 視為驗證失敗,且 MUST 於瀏覽器 console 輸出一則警告,指明被忽略的鍵名(以完整路徑表示,如 `endpoints.metrics`)。

#### Scenario: 根層級未知鍵

- **WHEN** 設定文件含 `"title": "Prod"`(未定義的鍵)且其餘內容合法
- **THEN** 設定驗證通過,應用正常啟動,console 出現一則指明 `title` 被忽略的警告

#### Scenario: endpoints 之下未知鍵

- **WHEN** 設定文件的 `endpoints` 含 `"metrics": "/api/metrics"`
- **THEN** 設定驗證通過,console 出現一則指明 `endpoints.metrics` 被忽略的警告,且應用不對該 URL 發出請求

### Requirement: 開發時可覆寫設定來源

開發者執行 `npm run dev` 時,SHALL 能在不修改已提交(committed)的設定文件與任何原始碼的前提下,讓應用讀取另一份設定文件或指向另一個後端;覆寫機制僅存在於開發伺服器,對建置產物與容器 image 無任何影響。覆寫時應用的啟動流程 MUST 與正式環境完全相同——仍是 `GET <base>/config.json`,只是開發伺服器回應不同的內容。未覆寫時,開發伺服器 MUST 提供 repo 內已提交的預設設定文件,且該預設 MUST 為 `demoMode: true`,使 clean checkout 不需後端即可渲染完整 fixture 圖。

#### Scenario: 未覆寫時以 demo 模式啟動

- **WHEN** 開發者於 clean checkout 執行 `npm run dev` 並開啟應用
- **THEN** 應用讀取已提交的預設設定、以 demo 模式渲染 fixture,且 `git status` 顯示設定文件未被修改

#### Scenario: 指向本機後端

- **WHEN** 開發者以開發伺服器的覆寫機制指定一份含 `"endpoints": { "graph": "http://localhost:8080/v1/graph" }` 的設定後執行 `npm run dev`
- **THEN** 應用自 `GET <base>/config.json` 取得該覆寫內容並向 `http://localhost:8080/v1/graph` 取數,而 repo 內已提交的設定文件內容不變

### Requirement: 設定不於建置時烘入

建置產物(靜態資產)MUST NOT 包含任何環境專屬的後端 URL、demo 旗標或本契約中的設定值;所有設定值 MUST 僅來自執行期取得的設定文件。同一份建置產物在不同環境的行為差異 MUST 僅由設定文件造成:替換設定文件而不重新建置,MUST 足以切換後端、開關 demo 模式與變更其他設定。

#### Scenario: 同一 image 服務不同環境

- **WHEN** 同一個 container image 分別以 `endpoints.graph` 為 `https://ksg-staging.example/v1/graph` 與 `https://ksg-prod.example/v1/graph` 的兩份 ConfigMap 部署
- **THEN** 兩個部署各自向對應的 URL 取數,且無需重新建置

#### Scenario: 建置產物不含環境 URL

- **WHEN** 檢視 `npm run build` 產出的所有靜態資產內容
- **THEN** 其中不含任何後端主機名稱或 `endpoints.*` 的值;改變環境 URL 不需改動建置產物
