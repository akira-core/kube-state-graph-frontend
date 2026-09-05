## Purpose

定義 Graph view 中 node detail panel 的行為契約:面板如何相對於選取(selection)開啟與關閉、header 與各資料閘控 section(Application / Containers / Alerts)的內容,以及自 runtime config 端點(`endpoints.configChanges`、`endpoints.codeChanges`、`endpoints.dashboard`)預取 change history 與 Dashboard 連結的請求、參數組裝、回應解析與可用性判定。

## ADDED Requirements

### Requirement: Node detail panel

當使用者於 Graph view **左鍵**點擊一個 detail-eligible 節點時,app SHALL 於 canvas 底部以 overlay 開啟 detail panel(不改變 graph 的尺寸),其 header 顯示節點名稱、kind badge、status badge 與關閉按鈕。

**選取(selection)與 detail open MUST 為兩個獨立的狀態。** 選取的建立、單一選取高亮、focus fade、pinned card 與取消選取的三條路徑(點擊背景、點擊 edge、點擊不可選取的 `cluster` 群組)由 `graph-view` capability 定義;本 capability 只規範面板相對於選取的開啟 / 關閉。關閉面板有**兩種語意不同**的方式:(1) 點擊背景或 edge(= 取消選取)關閉面板並一併清除選取;(2) 按下**關閉按鈕** MUST **僅關閉面板**(detail open → false)——選取與其衍生的一切(單一選取高亮、focus fade、右上角 pinned card)MUST 全部保留。切換到另一節點時面板切換至該節點。選取高亮 MUST 追蹤**選取**,而非面板的開啟狀態。關閉後,**再次點擊該已選取節點** MUST 重新開啟面板,並沿用選取當下擷取的查詢時間戳(MUST NOT 重發 change history 查詢——關閉與重開是 UI 動作而非資料動作;查詢時間戳的生命週期綁定於選取,只有在選取**不同**節點時才取新的時間戳)。

**Detail-eligible 節點**為:leaf 節點(含 `netapp-aggr`)、k8s `node` 容器、`netapp-node` 容器、controller 容器,以及 ArgoCD **`application` 群組**(無 kind,以合成的 `kind: application` 呈現於 header badge)。裝飾性的 **`cluster` / `storage-cluster` / `namespace`** 群組 MUST NOT 開啟面板,亦 MUST NOT pin card(`cluster` / `storage-cluster` 不可選取,`namespace` 可選取但不開啟面板——見 `graph-view`)。選取 `application` 群組 MUST 開啟面板並渲染該 ArgoCD application 的 Application section(見「Node-detail Application and Containers sections」),同時 pin card。`graph-search` 的 **locate** MUST 建立選取並為 detail-eligible 節點開啟面板(detail open → true,等同於 canvas 左鍵)。

除名稱 / kind / status 外,當該節點(任何 detail-eligible 節點——**leaf 含 `netapp-aggr`、k8s-node、`netapp-node`、controller**;**僅裝飾性 cluster / storage-cluster / namespace / application 排除**)的 `/dashboard` 查詢回傳可用的 URL 時,header MUST 於名稱旁顯示 **Dashboard 按鈕**;查詢的時機、參數組裝、200 閘控的可用性判定與新分頁開啟行為由本 capability 的 Dashboard 相關需求定義。

面板 body 一律依**資料是否存在**閘控,順序為:(1) **Application change-report section**,任何帶 `data.application` 的節點(**含 `service` / `pvc`**)顯示;**Containers change-report section**,僅 workload kind 帶 `data.containers` 時顯示(兩者見「Node-detail Application and Containers sections」);(2) **Alerts section**,節點帶非空 `data.alerts` 時渲染 alert 表格,**無 alerts 時完全不渲染**。**面板沒有常駐的 Properties section**——節點的 promoted attributes(合成 kind、`namespace`、`application`、`ipAddress`、`storageclass`、`health`、格式化的 `usage` 等)由 **pinned card** 呈現(與 hover tooltip 共用同一來源,見 `graph-view`),不在面板中重複。

**面板 ALWAYS 渲染**:只要 detail-eligible 節點被左鍵選取**且面板未被關閉按鈕關閉**(即存在選取且 detail open 為 true),**header**(節點名稱 + kind / status badge + 關閉按鈕,以及 `/dashboard` 查詢 ready 且 `urls` 非空時的 Dashboard 按鈕)即為最小渲染,每個 body section(Application / Containers / Alerts)各自依其資料閘控。完全沒有 body 內容的節點(如 `netapp-aggr` / `netapp-node`,或無 `application` 的 `service` / `pvc`)左鍵選取時**仍渲染 header-only 面板**;其 promoted attributes 由 pinned card 承載、不在面板重複。pinned card 本身 MUST NOT 帶 Dashboard 按鈕,header 是唯一的 dashboard 入口——由於 header 永遠渲染,該入口永遠可達。

面板高度 MUST 隨內容增長,僅在超過 canvas 高度 **50%** 的上限後才捲動(header 固定);低於上限的內容 MUST NOT 捲動。**捲動 MUST 集中於單一容器(面板 body)**:body 是唯一的捲動權威,每個 section 皆為內容高度,任何 section MUST NOT 擁有內部捲動。面板可同時堆疊多個 section(Application + Containers + Alerts);若任一 section 自帶內部捲動,受限高度下多個 section 會互相重疊且皆無法捲動,故單一 body 捲動是唯一可組合的模型。

Alert 資料來自上游 graph JSON node 的選用 `alerts` 欄(正規化為 `data.alerts`;缺漏或空陣列 → 該 section 不渲染)。每筆 alert 以**選用**的 `timeRecords: number[]`(Unix 秒,升冪)表示重複發生;產生者已將同一 alert 聚合為**單一**筆,故表格**一列一 alert**。**Count** 欄 MUST 顯示 `timeRecords.length`,並 MUST 以 hover 提示列出每一個發生時間(以瀏覽器本地時區格式化)。**Last occurred** 欄 MUST 顯示 `max(timeRecords)`(格式化);當 app 提供可變更的**檢視時間範圍**(view time range)時,該欄 MUST 可點擊,點擊將檢視時間範圍設為以 `t = max(timeRecords)`(Unix 秒)為中心、固定 ±5 分鐘(300 秒)的視窗 `[t-300, t+300]`;app 未提供檢視時間範圍時,該欄以純文字呈現。

**Count 與 Last occurred 皆為 `timeRecords` 的衍生欄,而該欄是選用的**(kube-state-graph 的 alert overlay 不帶任何發生時間——見 `graph-data-source`)。`timeRecords` 缺漏時,這兩格 MUST 各自降級為統一的 missing-value placeholder「n/a」,且 Last occurred MUST NOT 可點擊——沒有時刻可供回捲。兩格 MUST NOT 以 `0` 與 epoch 起點日期代替:那是捏造的讀數,與「該 alert 發生過一次、時間為 1970-01-01」無法區分。`severity` 為自由字串:`info` / `warning` / `critical` 取各自的語意色;其他任何自訂標籤 MUST 原樣保留並以 critical 色作為 fallback 上色。**alert 表格中缺漏的 Pod / Service 儲存格 MUST 顯示 muted 的「n/a」**(全面板統一的 missing-value placeholder——見「Node-detail Application and Containers sections」)。

#### Scenario: 左鍵點擊任一 detail-eligible 節點開啟面板

- **WHEN** 使用者**左鍵**點擊任一非裝飾性的 detail-eligible 節點
- **THEN** 底部 overlay 於 graph 上方渲染 header(節點 label、kind badge、status badge、關閉按鈕),graph 尺寸不變,且任何帶資料的 body section 一併出現
- **AND** 該節點的選取高亮追蹤選取,其屬性同時 pin 於右上角 pinned card

#### Scenario: 點擊外部或按下關閉

- **WHEN** 使用者點擊 graph 背景或 edge
- **THEN** detail panel 關閉且選取清除(選取高亮、focus fade 與 pinned card 全部消失)
- **WHEN** 面板開啟中,使用者按下關閉按鈕
- **THEN** detail panel 關閉但選取保留——選取高亮、focus fade 與 pinned card 維持可見

#### Scenario: 關閉後重開不重發查詢

- **WHEN** 使用者以關閉按鈕關閉面板,隨後再次左鍵點擊該(仍被選取的)節點
- **THEN** 面板以關閉前相同的內容重新開啟,change history 查詢沿用原本的選取時間戳且 MUST NOT 重發

#### Scenario: 切換節點

- **WHEN** 面板開啟中,使用者點擊另一節點
- **THEN** 面板切換至新點擊的節點(pinned card 隨之切換),查詢以該新選取當下擷取的時間戳發出

#### Scenario: Locate 開啟面板

- **WHEN** 使用者透過 graph-search 的 locate 啟用一個 detail-eligible 節點的搜尋結果
- **THEN** 該節點成為選取、detail panel 開啟(等同於 canvas 左鍵),pinned card 如常出現於搜尋列下方

#### Scenario: 選取 namespace 群組不開啟面板,選取 application 群組開啟其 app detail

- **WHEN** 使用者選取裝飾性的 `namespace` 群組
- **THEN** detail panel MUST NOT 開啟,亦不 pin card(只有 `graph-view` 定義的選取環與 collapse cue)
- **WHEN** 使用者選取 ArgoCD `application` 群組
- **THEN** detail panel 開啟,header badge 顯示合成的 `application` kind,渲染 Application section(預取該 application 的 `config_changes`),且 pinned card 一併出現

#### Scenario: 裸節點仍渲染 header-only 面板

- **WHEN** 使用者左鍵選取一個沒有 application、containers、alerts,且無 ready dashboard URL 的 detail-eligible 節點(如 `netapp-aggr` / `netapp-node`,或無 `application` 的 `service` / `pvc`)
- **THEN** detail panel **仍渲染**,僅含 header(節點名稱 + kind / status badge + 關閉按鈕),沒有任何 body section
- **AND** 該節點的 promoted attributes 由 pinned card 承載,不在面板中重複

#### Scenario: 後端提供 URL 時 header 顯示 Dashboard 按鈕

- **WHEN** 左鍵選取節點的 `/dashboard` 查詢回傳 ready 且 `urls` 非空(無論是否有任何 body 內容)
- **THEN** header 於節點名稱旁顯示 Dashboard 按鈕;完全沒有 body 內容時這是一個 header-only 面板
- **AND** Dashboard 按鈕可達(它只存在於 header,從不出現在 pinned card)

#### Scenario: Dashboard 按鈕出現在名稱旁

- **WHEN** 某 detail-eligible 節點的面板開啟(因其帶 change history / alerts 資料,或僅因有 ready dashboard 而 header-only),且其 `/dashboard` 查詢回 200 與非空 url
- **THEN** header 於節點名稱旁顯示 Dashboard 按鈕
- **AND** 裝飾性的 cluster / storage-cluster / namespace / application 群組沒有此按鈕(它們不適用 Dashboard 查詢);帶 dashboard URL 的 detail-eligible leaf(如 `netapp-aggr`)在 header-only 面板中顯示該按鈕

#### Scenario: alert 表格聚合渲染,一列一 alert

- **WHEN** 選取節點帶非空 `data.alerts`(一筆或多筆)
- **THEN** Alerts section 以帶欄位標題的表格逐列顯示 alerts,**一列一 alert**,欄位為 Pod / Service / Alert / Severity / Count / Last occurred

#### Scenario: 缺漏的 alert Pod / Service 顯示 n/a

- **WHEN** 某 alert 列的 Pod 或 Service 缺漏
- **THEN** 該儲存格顯示 muted 的「n/a」(統一的 missing-value placeholder)

#### Scenario: Count badge 與其發生時間提示

- **WHEN** 某 alert 的 `timeRecords` 含 N 個發生時間
- **THEN** 該列的 Count 欄顯示 `N`(= `timeRecords.length`)
- **AND** hover Count 時以提示列出全部 N 個發生時間(以瀏覽器本地時區格式化)

#### Scenario: 無發生時間的 alert 仍成列,兩個衍生欄降級為 n/a

- **WHEN** 某 alert 沒有 `timeRecords` 欄(如 kube-state-graph overlay 送出的 `{ name, severity }`)
- **THEN** 該 alert 仍 MUST 渲染為一列,Alert 與 Severity 欄如常呈現
- **AND** Count 與 Last occurred 兩欄 MUST 各顯示 muted 的「n/a」,MUST NOT 顯示 `0` 或 epoch 起點日期
- **AND** Last occurred 欄 MUST NOT 可點擊(無 Count hover 提示)
- **AND** 同表格中帶 `timeRecords` 的其他列 MUST 不受影響,照常顯示 Count 與可點擊的 Last occurred

#### Scenario: Severity 上色(自由字串加語意色)

- **WHEN** 某 alert 的 `severity` 為 `info` / `warning` / `critical`
- **THEN** 該列的 Severity 以對應語意色的 badge 呈現
- **WHEN** `severity` 不在已知集合中(如自訂標籤 `fatal`)
- **THEN** 以 critical 色作為 fallback 上色,badge 原樣保留該標籤文字,且不發生錯誤

#### Scenario: 點擊 Last occurred 調整檢視時間範圍

- **WHEN** app 提供可變更的檢視時間範圍,使用者點擊某列的 Last occurred 欄,且該 alert 最大的 `timeRecords` 值為 `t`(Unix 秒)
- **THEN** app 將檢視時間範圍設為 `[t-300, t+300]`(±5 分鐘),以最後一次發生為中心
- **WHEN** app 未提供檢視時間範圍,或該 alert 無 `timeRecords`
- **THEN** Last occurred 欄以純文字呈現,不可點擊

#### Scenario: 多個 section 共用單一 body 捲動且永不重疊

- **WHEN** 面板同時渲染多個高的 section(例如帶 application、許多 containers 與許多 alerts 的 pod,Containers 與 Alerts 皆超過上限)
- **THEN** 面板 body 是唯一的捲動容器,每個 section 為內容高度,其表格區 MUST NOT 自帶垂直捲動
- **AND** 各 section 垂直堆疊且 MUST NOT 重疊;超過上限時 body 捲動整個堆疊(header 固定),低於上限時無任何捲動

#### Scenario: 無 alerts 時 Alerts section 不渲染

- **WHEN** 選取節點沒有 `alerts` 欄,或其為空陣列
- **THEN** Alerts section MUST NOT 渲染(沒有表格,也沒有「No alerts」訊息);其他帶資料的 section 如常渲染,沒有其他 body section 時面板仍以 header-only 渲染

### Requirement: Node-detail Application and Containers sections

app SHALL 於 node detail panel 提供由 change history 查詢支撐的 **Application section** 與 **Containers section**,沿用與 Alerts section 相同的 section 版面。**Application section** 對**任何帶 `data.application` 的節點**顯示——pod 或 workload controller(`kind ∈ { pod, deployment, statefulset, daemonset, job, cronjob }`)、隸屬某 ArgoCD application 的 `service` / `pvc` leaf,**以及 ArgoCD `application` 群組節點本身**(無 kind,以合成的 `kind: application` 解析)——其 `config_changes`(Deployment Changes)查詢以該節點自身的身分發出(`service` / `pvc` 使用自己的 kind / name;`application` 群組使用 `{ kind: 'application', name: <app> }`)。**Containers section** MUST **僅對帶 `data.containers` 的 pod 或 workload controller** 顯示;`service` / `pvc` / `application` 群組 / `node` / `external` 等沒有 containers,Containers section 永不為其渲染。service 或 PVC 的 application 名稱**同時**以 promoted attr 出現在 pinned card(見 `graph-view`);兩者互補——pinned card 顯示名稱,Application section 提供 config_changes 連結。

面板 body 純粹依**每個 section 的資料是否存在**閘控:**Application section** 依 `data.application` 的存在(任何帶 application 的節點,含 `service` / `pvc`);**Containers section** 依 **workload kind 加上非空的 `data.containers`**。兩者與(資料閘控的)Alerts section 共存於同一個**左鍵**面板。面板**沒有常駐的 Properties section**(promoted attributes 由 pinned card 承載——見「Node detail panel」),且 header **永遠渲染**(面板 ALWAYS 渲染——見「Node detail panel」)。

**資料來源。** application 名稱來自節點的 `data.application`(後端於 pod 節點上發出;controller 的 application 由正規化時自其子 pod 聚合);containers 來自節點的 `data.containers`(`Array<{ name, image }>`)。沒有 `data.application` 時 Application section MUST NOT 渲染;沒有 `data.containers`(或空陣列)時 Containers section MUST NOT 渲染;兩者互不影響。

**觸發。** 對 pod / controller 節點的**左鍵**點擊 MUST (a) 選取該節點(沿用單一選取狀態,與選取高亮及面板開啟狀態同步,面板隨之開啟),並 (b) **建立**該節點兩個 URL 查詢所需的輸入(application-detail 與 image-detail):application 名稱、controller kind、controller 名稱與時間——時間為左鍵選取當下的時刻,Unix 秒——並自該輸入**同時 eager-prefetch 兩個查詢**。`config_changes`(application)與 `code_changes`(containers)MUST 在面板因 workload 節點的左鍵選取而開啟的當下,**不需任何進一步點擊**即發出(亦即只要輸入建立且對應端點已設定)。**右鍵不開啟 detail panel、不建立查詢輸入、不發出任何查詢**。**隸屬 ArgoCD application 的 `service` / `pvc`**(帶 `data.application`)左鍵選取時亦建立查詢輸入——`kind` / `name` 取自**該節點本身**——並預取 `config_changes`(驅動其 Application section);共用的預取亦會發出其 `code_changes`,但 service / PVC 沒有 containers,結果不被使用(Containers section 不渲染)。**沒有 `data.application` 的非 workload 節點(因此沒有 query target)**左鍵選取時 MUST NOT 建立查詢輸入,MUST NOT 發出任何查詢(其屬性由 pinned card 承載,有資料時顯示 Alerts)。

**查詢契約。** 兩個查詢 MUST 共用同一組輸入,以 query 參數送出:`application`(ArgoCD application 名稱)、`kind`(pod-controller kind)、`name`(pod-controller 名稱)、`time`(Unix 秒)。pod 節點的 controller kind / name 來自其 owner(`data.owner`);controller 節點使用自身的 kind / name;無 owner 的獨立 pod 送出自身的 kind(`pod`)與名稱。回應為:

- **application-detail 查詢**(`GET <endpoints.configChanges>?application=…&kind=…&name=…&time=…`)回傳 `{ "url": string, "current_time": string, "previous_time": string }`——`url` 為該 ArgoCD application 的外部 detail 頁面,`current_time` / `previous_time` 為該次部署 diff 的兩個時間戳。
- **image-detail 查詢**(`GET <endpoints.codeChanges>?application=…&kind=…&name=…&time=…`)回傳 `{ [containerName]: { "url": string, "current_time": string, "previous_time": string, "result_type": string } }`——container 名稱到 entry 的 map。輸入 MUST NOT 帶 image 參數;一次呼叫涵蓋該節點的所有 containers。
- **時間戳契約**:`current_time` / `previous_time` MUST 為 **RFC 3339 / ISO 8601(UTC)**字串。兩者皆為 **best-effort**:任一缺漏、非字串或解析失敗時,其時間欄 MUST 顯示 muted 的「n/a」(統一的 missing-value placeholder),且 MUST NOT 影響該列的 `url` anchor、其他欄位或任何其他列。
- **變更類型契約(`result_type`,僅 `code_changes`)**:每個 container entry MAY 帶 `result_type` 字串,已知 enum 值為 **`UNCHANGED` / `UPDATED` / `REPLACED` / `ADDED` / `REMOVED` / `RENAMED`**(大寫)。`result_type` 為 **best-effort**:缺漏、非字串或空字串時,該列的 Change Type 欄 MUST 顯示 muted 的「n/a」;**未知值**(六者之外)MUST 以中性灰的 fallback 色原樣渲染(預設可見)。`config_changes`(application)**不**帶 `result_type`,Application section MUST NOT 有 Change Type 欄。

**單一來源的 missing-value placeholder。** 面板中所有「列存在、儲存格缺漏」的 placeholder(change time、Change Type、alert 的 Pod / Service)MUST 來自同一個常數值「n/a」,以 muted 樣式渲染。

**呼叫快取。** 面板開啟期間,`code_changes` 與 `config_changes` MUST 各**至多呼叫一次**——eager prefetch 於面板開啟時各發一次,`code_changes` 回傳的整個 map 由所有 container 列**共用**。僅**成功**回應被快取;失敗 MUST NOT 被快取。**切換節點或關閉面板(unmount / 清除選取)MUST 清除快取**(並中止 in-flight 請求)。

**端點設定與傳輸。** 兩個查詢的 URL 來自 runtime config:Application section 使用 `endpoints.configChanges`,Containers section 使用 `endpoints.codeChanges`;每個 URL 為絕對 URL 或 root-relative URL,app MUST 原樣使用該 URL 並附加 query 參數,MUST NOT 自行推導或拼接其他路徑。查詢以瀏覽器 `fetch` 直接發往該 URL。**`endpoints.configChanges` 未設定時,Application section MUST 隱藏且 MUST NOT 發出 `config_changes`;`endpoints.codeChanges` 未設定時,Containers section MUST 隱藏且 MUST NOT 發出 `code_changes`**;兩者互不影響,未設定不視為錯誤(MUST NOT 顯示任何錯誤訊息)。預取查詢 MUST 可中止,且 MUST NOT 於 unmount 後更新狀態。

**呈現**(每個連結欄目標各自持有獨立狀態,三者之一:**loading / ready / unavailable**):

- **loading**:查詢於面板開啟當下同時發出;回傳前,每個未解析目標的列在其連結欄 MUST 顯示載入指示加提示文字,該處不得出現 anchor。
- **ready**:`config_changes` / `code_changes` 回 200 且帶有效 `url` 時,連結欄 MUST 渲染真實的 anchor `<a href={url} target="_blank" rel="noopener noreferrer">`(預先解析的 URL——絕不使用 `window.open`)。
- **unavailable**:失敗、無結果或無 URL 時,連結欄 MUST 以次要(muted)文字顯示「Not found」提示(過長時截斷,完整失敗訊息置於 `title`)。
- **失敗隔離**:一個 unavailable 目標 MUST NOT 影響 header、另一個 section 或同 section 的任何其他列。
- **時間欄(Current / Previous)**:兩個 section 皆有 **Current Change Time** 與 **Previous Change Time** 欄,將原始 RFC 3339 字串以瀏覽器本地時區格式化為在地化的絕對時間,完整 ISO 字串置於 `title`。無值或日期無效時儲存格顯示 muted 的「n/a」,MUST NOT 設定 `title`,MUST NOT 顯示「Invalid date」。
- **Change Type 欄(僅 Containers)**:Containers section 的 **Change Type** 欄以單一來源的顏色對應將 `result_type` 呈現為彩色文字——`ADDED`=綠 / `REMOVED`=紅 / `UPDATED`=藍 / `REPLACED`=橘 / `RENAMED`=紫 / `UNCHANGED`=灰。未知值以中性灰原樣渲染;缺漏、非字串或空字串顯示 muted 的「n/a」。顏色查找不分大小寫,顯示一律大寫。Application section MUST NOT 有此欄。
- **對齊**:連結欄內容 MUST 貼齊該欄右緣,使兩個 section 的連結欄垂直對齊、不隨內容水平漂移。
- **表格版面**:兩個 section MUST 以帶欄位標題的表格渲染——Application 的欄位順序為 **Name / Current Change Time / Previous Change Time / Deployment Changes**,Containers 的為 **Name / Image / Change Type / Current Change Time / Previous Change Time / Code Changes**。連結欄固定在最右側且不伸展,`Change Type` / `Current` / `Previous` 亦不伸展,Name / Image 填滿剩餘寬度。

#### Scenario: 左鍵點擊 pod / controller 選取並立即同時預取兩個查詢

- **WHEN** 使用者**左鍵**點擊一個帶 `data.application` 的 pod(或 controller)節點,且 `endpoints.configChanges` 與 `endpoints.codeChanges` 皆已設定
- **THEN** 該節點被選取(選取高亮與面板開啟同步),系統建立兩個查詢所需的輸入(application 名稱、controller kind、controller 名稱、時間)
- **AND** 系統 MUST **同時**發出 application-detail(`config_changes`)與 image-detail(`code_changes`)查詢,**不需進一步點擊**

#### Scenario: 右鍵不開啟 detail panel 亦不查詢

- **WHEN** 使用者**右鍵**點擊 pod / controller 節點
- **THEN** 系統 MUST NOT 開啟 detail panel、MUST NOT 建立查詢輸入、MUST NOT 發出任何 change history 查詢

#### Scenario: pod 的 controller kind / name 來自其 owner

- **WHEN** 左鍵點擊的節點是 pod,其 `data.owner` 為 `{ kind: "deployment", name: "gateway" }`
- **THEN** 該節點預取輸入中的 controller kind / name 為 `deployment` / `gateway`

#### Scenario: controller 節點以自身的 kind / name 查詢

- **WHEN** 左鍵點擊的節點是 controller(如 `statefulset` `mongo`)
- **THEN** 該節點預取輸入中的 controller kind / name 為 `statefulset` / `mongo`

#### Scenario: 兩個 section 僅對 pod 與 controller 顯示

- **WHEN** 使用者**左鍵**選取的節點 `kind` 為 `pod` 或 controller kind,且帶對應資料(`data.application` / 非空的 `data.containers`)
- **THEN** 面板渲染 change history 的 Application section 與 Containers section

#### Scenario: Containers 僅限 workload;帶 application 的 service / pvc 顯示 Application

- **WHEN** 選取節點的 `kind` 為 `service` / `pvc` 且帶 `data.application`
- **THEN** **Application section** 渲染並預取 `config_changes`(以該節點自身的 kind / name),**Containers section** MUST NOT 渲染(service 或 PVC 沒有 containers,即使資料恰好帶 `containers`)
- **WHEN** 選取節點的 `kind` 為 `node` / `external` / `switch` / `cluster` / `netapp-aggr` / `netapp-node`,或為無 `data.application` 的 `service` / `pvc`
- **THEN** Application 與 Containers section 皆不得渲染

#### Scenario: 無 application 時僅 Application section 隱藏

- **WHEN** **左鍵**選取的 pod / controller 節點沒有 `data.application` 但帶非空的 `data.containers`
- **THEN** Application section MUST NOT 渲染,Containers section 如常渲染並預取 `code_changes`

#### Scenario: 無 containers 時僅 Containers section 隱藏

- **WHEN** **左鍵**選取的 pod / controller 節點帶 `data.application` 但沒有 `data.containers`(或空陣列)
- **THEN** Containers section MUST NOT 渲染,Application section 如常渲染並預取 `config_changes`

#### Scenario: in-flight 預取顯示載入指示

- **WHEN** 左鍵開啟面板、對應端點已設定,且預取查詢尚未回傳
- **THEN** Application 與 Containers section 每一列的連結欄顯示載入指示加提示文字,該處沒有 anchor

#### Scenario: Application 預取成功渲染 anchor

- **WHEN** application-detail(`config_changes`)查詢回傳有效 URL `u`
- **THEN** Application section 的連結欄(標題「Deployment Changes」)渲染 `<a href="u" target="_blank" rel="noopener noreferrer">`,在一般使用者手勢下於新分頁開啟 `u`(絕不使用 `window.open`)

#### Scenario: Container 預取成功為每個有 URL 的列渲染 anchor

- **WHEN** 節點的 `data.containers` 含 `{ name: "app", image: "repo/app:1.2" }`,且 image-detail(`code_changes`)回傳 `{ "app": { "url": "https://x/app" } }`
- **THEN** `app` 列的連結欄(標題「Code Changes」)渲染 `<a href="https://x/app" target="_blank" rel="noopener noreferrer">`

#### Scenario: Application section 以帶標題的表格渲染

- **WHEN** 左鍵開啟的面板渲染 Application section(節點帶 `data.application`)
- **THEN** 該 section 以表格呈現欄位標題 **Name** / **Current Change Time** / **Previous Change Time** / **Deployment Changes**,順序如上

#### Scenario: Containers section 以帶標題的表格渲染且欄位對齊

- **WHEN** 左鍵開啟的面板渲染 Containers section(節點帶兩個以上、名稱長度不一的 containers)
- **THEN** 該 section 以表格呈現欄位標題 **Name** / **Image** / **Change Type** / **Current Change Time** / **Previous Change Time** / **Code Changes**,順序如上,欄位對齊(欄界不隨名稱長度漂移)

#### Scenario: 連結欄標題命名正確

- **WHEN** 面板同時渲染 Application 與 Containers section
- **THEN** Application section 的連結欄標題為「Deployment Changes」,Containers section 的為「Code Changes」(兩者皆不得顯示「Change Report」)

#### Scenario: 帶兩個時間戳時 Application 顯示在地化絕對時間

- **WHEN** application-detail(`config_changes`)查詢回傳 `{ "url": "u", "current_time": "2026-06-16T10:30:00Z", "previous_time": "2026-06-10T08:00:00Z" }`
- **THEN** Application 列的 Current / Previous 欄顯示以瀏覽器本地時區格式化的在地化絕對時間,各自的 `title` 為完整 ISO 字串,且該列的連結欄仍渲染 `u` 的 anchor

#### Scenario: 帶兩個時間戳的 code_changes container entry 顯示於其列

- **WHEN** image-detail(`code_changes`)回傳 `{ "app": { "url": "https://x/app", "current_time": "2026-06-16T10:30:00Z", "previous_time": "2026-06-10T08:00:00Z" } }`,且節點的 `data.containers` 含 `{ name: "app", image: "repo/app:1.2" }`
- **THEN** `app` 列的 Current / Previous 欄以在地化絕對時間顯示這兩個時間戳,各自的 `title` 為完整 ISO 字串,且該列的連結欄渲染 `https://x/app` 的 anchor

#### Scenario: 帶 result_type 的 code_changes entry 顯示彩色的變更類型

- **WHEN** image-detail(`code_changes`)回傳 `{ "app": { "url": "https://x/app", "result_type": "UPDATED" } }`,且節點的 `data.containers` 含 `{ name: "app", image: "repo/app:1.2" }`
- **THEN** `app` 列的 Change Type 欄以該已知 enum 值的語意色(藍)顯示 `UPDATED`,且該列的連結欄仍渲染其 anchor

#### Scenario: 未知的 result_type 以中性灰原樣渲染

- **WHEN** 某 container 的 `code_changes` entry 帶 enum 之外的 `result_type`(如 `"MIGRATED"`)
- **THEN** 該列的 Change Type 欄原樣顯示 `MIGRATED`(MUST NOT 被靜默丟棄),以中性灰的 fallback 色渲染

#### Scenario: 缺漏 / 非字串 / 空的 result_type 使 Change Type 降級為 muted 的 n/a

- **WHEN** 某 container 的 `code_changes` entry 回傳有效 `url`,但其 `result_type` 缺漏、非字串或為空字串
- **THEN** 該列的 Change Type 欄顯示 muted 的「n/a」,且該列的 url anchor、時間欄、其他欄位與所有其他列 MUST NOT 受影響

#### Scenario: Application section 沒有 Change Type 欄

- **WHEN** 面板渲染 Application section
- **THEN** Application section 的欄位依序為 Name / Current Change Time / Previous Change Time / Deployment Changes,且 MUST NOT 含 Change Type 欄

#### Scenario: 缺漏或非 RFC 3339 的時間戳使其欄位降級為 muted 的 n/a

- **WHEN** `config_changes`(或某 container 的 `code_changes` entry)回傳有效 `url`,但其 `current_time` 缺漏、非字串或非 RFC 3339 字串(如 `"not-a-date"`),而 `previous_time` 正常
- **THEN** 該目標的 Current 欄顯示 muted 的「n/a」且無 `title`,其 Previous 欄如常顯示在地化絕對時間,該列的 url anchor、其他欄位與所有其他列 MUST NOT 受影響(MUST NOT 出現「Invalid date」)

#### Scenario: 開啟期間 code_changes 只呼叫一次,所有 container 共用結果

- **WHEN** 面板開啟、`code_changes` 預取已完成,且有多個 container 列
- **THEN** 系統對 `code_changes` 只發出**一次**呼叫,每個 container 列自該一次回傳的 map 取值
- **AND** 關閉面板或切換節點 MUST 清除快取,下次開啟時再呼叫一次

#### Scenario: 失敗的查詢不被快取(remount 時重新取得)

- **WHEN** 某次 `code_changes`(或 `config_changes`)呼叫失敗,面板之後為同一節點 remount
- **THEN** 系統再次發出該查詢(失敗未被快取)

#### Scenario: 連結欄跨 section、跨狀態對齊

- **WHEN** 面板同時顯示 Application 與 Containers section,部分目標 loading、部分 ready、部分 unavailable(混合狀態)
- **THEN** 兩個 section 每一列的連結欄內容皆貼齊該欄右緣並垂直對齊

#### Scenario: map 中缺漏的 container key 顯示「Not found」

- **WHEN** `code_changes` 成功但某 container 名稱不在回傳的 map 中(或該名稱沒有有效 URL)
- **THEN** 該列的連結欄顯示「Not found」提示(無 anchor),其名稱與 image 仍如常顯示

#### Scenario: 失敗的查詢顯示「Not found」且不影響其餘部分

- **WHEN** `config_changes`(或 `code_changes`)查詢失敗
- **THEN** 對應目標的連結欄以次要色顯示「Not found」提示(無 anchor;過長時截斷,完整失敗訊息置於 `title`)
- **AND** 面板 header 與另一個 section / 其他列仍正常顯示

#### Scenario: 查詢發往 runtime config 設定的端點 URL

- **WHEN** runtime config 的 `endpoints.configChanges` 為 `https://ksg.example/v1/graph/config_changes`、`endpoints.codeChanges` 為 `/api/v1/graph/code_changes`,且使用者左鍵開啟某 workload 節點的面板
- **THEN** 預取查詢分別以 `GET https://ksg.example/v1/graph/config_changes?application=…&kind=…&name=…&time=…` 與 `GET /api/v1/graph/code_changes?application=…&kind=…&name=…&time=…`(root-relative,同源)發出,app 不自行推導或改寫任一路徑

#### Scenario: 端點未設定時該 section 隱藏且不查詢

- **WHEN** runtime config 未設定 `endpoints.configChanges`,而使用者左鍵開啟一個帶 `data.application` 與 `data.containers` 的 workload 節點面板(`endpoints.codeChanges` 已設定)
- **THEN** Application section MUST NOT 渲染且 MUST NOT 發出 `config_changes`;Containers section 如常渲染並預取 `code_changes`;不顯示任何錯誤訊息
- **WHEN** runtime config 未設定 `endpoints.codeChanges`
- **THEN** Containers section MUST NOT 渲染且 MUST NOT 發出 `code_changes`;Application section 依 `endpoints.configChanges` 的設定如常運作

#### Scenario: 左鍵選取帶 application 的 service / pvc 預取 config_changes

- **WHEN** 使用者左鍵選取一個帶 `data.application` 的 `service` 或 `pvc`,且 `endpoints.configChanges` 已設定
- **THEN** 系統以**該節點自身的 kind / name**加上 application 建立查詢輸入並預取 `config_changes`(驅動 Application section 的 Deployment Changes 連結)
- **AND** Containers section 不渲染(沒有 containers;`code_changes` 結果不被使用)

#### Scenario: 選取 application 群組預取其 config_changes

- **WHEN** 使用者左鍵選取 ArgoCD `application` 群組節點(無 kind,帶 `application`),且 `endpoints.configChanges` 已設定
- **THEN** 系統建立查詢輸入 `{ application: <app>, kind: 'application', name: <app>, time }` 並預取 `config_changes`;Application section 渲染該 application 的 Deployment Changes 連結(header badge 顯示合成的 `application` kind)
- **AND** Containers section 不渲染(application 群組沒有 containers)

#### Scenario: 左鍵選取無 application 的非 workload 節點不觸發查詢

- **WHEN** 使用者左鍵點擊一個**沒有 `data.application`** 的非 workload 節點(如 `node` / `external`,或無 application 的 `service` / `pvc`;即沒有 query target)
- **THEN** 面板仍渲染(header-only,或帶 Alerts),節點屬性由 pinned card 承載,但系統 MUST NOT 建立查詢輸入、MUST NOT 發出 application-detail / image-detail 查詢

#### Scenario: 切換節點或關閉面板清除狀態與快取並中止 in-flight 請求

- **WHEN** 面板開啟且預取進行中,使用者切換至另一節點或關閉面板(unmount / 清除選取)
- **THEN** 系統中止 in-flight 查詢,清除兩個端點的快取與每個目標的狀態,且 MUST NOT 在中止後為舊節點更新狀態

### Requirement: Dashboard 按鈕的節點適用性

app SHALL 僅對 **node detail panel 會為其開啟且具備 per-node dashboard** 的節點請求 `/dashboard` 並渲染 Dashboard 按鈕——即 **leaf 節點**(含後端的實體儲存 leaf **`netapp-aggr`**,其帶 `health` / `usage`)、**k8s-node**(`kind: node`)容器、**`netapp-node`** 容器(後端契約中唯一由真實節點擔任 compound parent 之處,帶 `health`),以及 **controller** 容器(後端提供並帶真實 `kind`)。**cluster / storage-cluster / namespace / application** 群組 MUST NOT 觸發任何 `/dashboard` 查詢,MUST NOT 渲染 Dashboard 按鈕(`application` 群組雖會開啟 detail panel,但沒有 per-node dashboard)。適用性由參數組裝對不適用節點回傳「無參數」來閘控——不適用節點不發出查詢——且 MUST 與 detail panel 開啟判定共用同一個排除集合(`isCluster` / `isStorageCluster` / `isNamespace` / `isApplication`),而非維護一份可能漂移的平行清單。

`netapp-aggr` / `netapp-node` 與其他適用節點一樣開啟 detail panel 並預取 `/dashboard`,但其 `kind` **不在 workload kind 集合中**,故 MUST NOT 為其指派 change history 的 query target:其 `health` / `usage`(及 `netapp-aggr` 的 `ontap_cluster` / `node` labels)透過右上角 **pinned card** 呈現(見 `graph-view`),detail panel 本身為 header-only。

#### Scenario: leaf / k8s-node / controller 為適用節點

- **WHEN** node detail panel 為 leaf 節點(含 `netapp-aggr` leaf)、k8s-node 容器、`netapp-node` 容器或後端提供的 controller 容器開啟
- **THEN** 系統為該節點發出一次 `/dashboard` 查詢(時機見「Dashboard URL 預取與可用性判定」),並在可用時渲染 Dashboard 按鈕

#### Scenario: NetApp leaf 開啟 detail 但沒有 change history 的 query target

- **WHEN** 選取節點為 `netapp-aggr` leaf 或 `netapp-node` 容器(帶 `health` / `usage`)
- **THEN** detail panel 以 header-only 開啟,其 `health` / `usage` 釘選於右上角 pinned card,且由於其 `kind` 不在 workload kind 集合中,MUST NOT 為其指派 change history 的 query target——它仍與其他適用節點一樣預取 `/dashboard`,並在可用時渲染 Dashboard 按鈕

#### Scenario: cluster / namespace / application 不適用

- **WHEN** 選取節點為 `cluster` / `storage-cluster` / `namespace` / `application` 群組
- **THEN** 系統 MUST NOT 發出 `/dashboard` 查詢,MUST NOT 渲染 Dashboard 按鈕(`cluster` / `storage-cluster` / `namespace` 本就不開啟 detail panel;`application` 群組開啟面板但沒有 per-node dashboard)

### Requirement: Dashboard URL 預取與可用性判定

當 node detail panel 為適用節點**開啟**(左鍵選取,或 graph-search 的 locate)時,app SHALL **eager-prefetch** 一次 `GET <endpoints.dashboard>?<params>`,**每個被開啟節點最多一次**(at-most-once per opened node;同值的 graph 資料刷新——含 `refreshIntervalSeconds` 觸發的自動刷新——MUST NOT 重發)。查詢以瀏覽器 `fetch` 直接發往 runtime config 的 `endpoints.dashboard`(絕對 URL 或 root-relative URL,原樣使用、不自行拼接路徑)。此預取與 `config_changes` / `code_changes`(application-detail / image-detail)查詢**互相獨立**:Dashboard 預取的觸發條件為**面板開啟**,而不以節點帶有 `application` 或 `containers` 為前提。

「最多一次」的保證僅在**固定的檢視時間範圍內**成立:當 app 提供檢視時間範圍時,param map 含 `from_time` / `to_time`(見「Dashboard 請求參數組裝」需求),時間範圍變動使參數改變、請求 key 隨之更新 → app SHALL 對同一被開啟節點以新時間範圍**重新預取**(time-windowed 的 URL 應隨檢視時間更新)。

**可用性的前提為 `endpoints.dashboard` 已設定。** 未設定時,app MUST 閒置:不發任何查詢、按鈕不渲染、不顯示任何錯誤或提示(未設定不是錯誤,而是功能停用)。

in-flight 查詢 MUST 於切換節點 / 關閉面板(unmount)時中止,且 MUST NOT 於中止或 unmount 後更新狀態。

可用性 MUST 嚴格以 **HTTP 200 + 至少一筆非空連結** 判定:回傳 body 解析後得到**一筆或以上** `{ label, url }`(`url` 皆非空且可解析為 http(s) URL,相對 URL 以 app origin 解析)→ **available**(渲染入口);非 200、解析結果為空、回應格式錯誤或網路錯誤 → **unavailable**(按鈕**不渲染**,且 MUST NOT 對使用者顯示任何錯誤訊息)。可用性語意與 `config_changes` / `code_changes` 一致。

回應格式:

- **新格式**:`{ "urls": [{ "label"?: string, "url": string }, …] }`——略過無效項目(`url` 缺漏、為空或非 http(s));`label` 缺省時由 app 補 fallback 標籤(取 URL 最後一個路徑段,無法取得時為「Dashboard」;重複標籤加序號區分)。
- **舊格式(向後相容)**:`{ "url": string }`——視為單一連結 `[{ label: "Dashboard", url }]`。
- 當 `urls` 為非空陣列時 MUST **優先**採用 `urls`;僅在 `urls` 缺漏或過濾後為空時才 fallback 至 `url`。

#### Scenario: 面板開啟即預取(左鍵與 locate 皆然)

- **WHEN** 使用者以左鍵點擊或 graph-search 的 locate 開啟某適用節點的 detail panel,且 `endpoints.dashboard` 已設定
- **THEN** 系統發出一次 `GET <endpoints.dashboard>?<params>`,參數為該節點組裝出的 param map(見「Dashboard 請求參數組裝」需求)

#### Scenario: 200 + urls 陣列視為可用

- **WHEN** `/dashboard` 回傳 HTTP 200 且 body 為 `{ "urls": [{ "label": "Metrics", "url": "https://a" }, { "label": "Logs", "url": "https://b" }] }`
- **THEN** 該查詢狀態為 available,解析出兩筆連結,Dashboard 入口渲染

#### Scenario: 200 + 非空 url(舊格式)視為可用

- **WHEN** `/dashboard` 回傳 HTTP 200 且 body 為 `{ "url": "https://…" }`(`url` 非空)
- **THEN** 該查詢狀態為 available,連結為單元素陣列 `[{ label: "Dashboard", url }]`,Dashboard 按鈕渲染

#### Scenario: 非 200 / 空 urls / 空 url / 格式錯誤視為不可用且不報錯

- **WHEN** `/dashboard` 回非 200、或回 `{ "urls": [] }`、或回 `{ "url": "" }`、或回應非物件 / 無 `url` 欄、或網路失敗
- **THEN** 該查詢狀態為 unavailable,Dashboard 按鈕 MUST NOT 渲染,且 MUST NOT 顯示任何錯誤訊息或殘留的載入指示

#### Scenario: endpoints.dashboard 未設定時不發查詢

- **WHEN** runtime config 未設定 `endpoints.dashboard`,使用者開啟某適用節點的 detail panel
- **THEN** 系統 MUST NOT 發出 `/dashboard` 查詢,Dashboard 按鈕不渲染,且不顯示任何錯誤或提示

#### Scenario: 換節點中止前一查詢並重新預取

- **WHEN** 面板為某節點開啟(`/dashboard` 查詢進行中)時,使用者改開另一個適用節點
- **THEN** 前一個 in-flight 查詢被中止(不更新狀態),系統為新節點發出新的一次 `/dashboard` 查詢

#### Scenario: 檢視時間範圍變動時重新預取

- **WHEN** app 提供檢視時間範圍,面板對某適用節點開啟後使用者改變檢視時間範圍
- **THEN** `from_time` / `to_time` 參數改變使請求 key 更新,系統為同一節點以新時間範圍**重新預取**一次 `/dashboard`(同節點、同其餘屬性、同時間範圍的純資料刷新 MUST NOT 重發)

### Requirement: Dashboard 請求參數組裝

`/dashboard` 查詢的 query 參數 MUST 由被開啟節點的 `data` 屬性(及 app 的檢視時間範圍,若有)以純函式組裝(可單測),參數值型別為 `string | string[]`(`string[]` 序列化為重複的 query 參數,如 `ipaddress`),規則如下:

- **排除集合**:`labels` 與所有 app 內部 rendering-only / 結構欄位 MUST NOT 送出——accent 顏色(`clusterColor` / `namespaceColor` / `applicationColor` / `storageClusterColor`)、`parent`、`worstStatus`、`is*` compound 旗標(`isCluster` / `isStorageCluster` / `isController` / `isNamespace` / `isApplication`)、供 pinned card 呈現的儲存事實欄(`storageclass`、`health`、`usage` 及衍生的 `usageRatio`;屬節點資訊而非 query 參數)、易變的 `status`(會使刷新時的請求 key 無謂變動),以及結構性的 `id`(controller 的 `id` 為後端 path 值,如 `<c>/namespace/<ns>/application/<app>/controller/<Kind>/<name>`,屬結構識別而非可查詢屬性;節點身分以 kind + name 表示)。
- **僅送 scalar(`ipaddress` 例外)**:非 scalar 值(陣列 / 物件,如 `alerts` / `containers` / `owner`)MUST NOT 作為 query 參數送出。**例外**:`ipAddress`(`string[]`,pod 節點上)SHALL 以重複的 `ipaddress=` 參數送出;陣列為空時 MUST 省略。
- **欄名對應**:節點顯示名存於 `data.label`(正規化時自上游 `name` 對應而來、未保留 `name`),組裝時 MUST 以 `name` 為參數名送出該值;`kind` 原樣送出。
- **Leaf 節點**:送出其(經上述排除後的)scalar 屬性。
- **Compound 節點(僅 k8s-node / netapp-node / controller)**:送出該容器**自身**的 scalar 屬性,**外加**在其**所有直接子節點**(`data.parent === 容器 id`)上**值皆相同**的屬性;值在子節點間**相異**的屬性 MUST **略過**;與自身屬性**衝突時自身值優先**(own-wins);子節點屬性同樣套用上述排除集合與 scalar-only 規則;容器無直接子節點時僅送自身屬性。
- **`cluster` 參數**:雖然 `cluster` 對適用節點**非** first-class data 欄(`labels` 又在排除集合中),app SHALL 仍解析並送出 `cluster`:**權威來源**為該節點**最近的 `isCluster` 祖先**(沿 `data.parent` 上溯,穿過 namespace 群組等中間 compound)之 `data.cluster`——這是唯一能涵蓋 **controller** 的來源(controller 既無 `data.cluster` 亦無 `labels`)。找不到 `isCluster` 祖先時 MUST **退回**該節點自身的 `labels.cluster`;兩者皆無時 MUST **省略** `cluster`(如無所屬 cluster 的頂層 external 節點)。祖先解析 MUST **優先於** labels 退回(祖先為權威),且 MUST **不覆寫**節點自身已帶的 `cluster`(own-wins)。
- **`controller` 參數**(與 `cluster` 對稱):app SHALL 解析並送出 `controller`:**權威來源**為該節點**最近的 `isController` 祖先**(沿 `data.parent` 上溯)之名稱(`data.label`)——controller mode 下一個 pod 的直接 parent 即其 controller 容器。找不到 `isController` 祖先時(如 node mode,pod 巢狀於 node 容器下、無 controller 節點)MUST **退回**該 pod 自身的 `data.owner.name`(與 change history 解析 pod controller 的同一來源);兩者皆無時 MUST **省略** `controller`(controller 容器自身無 parent controller;裸 service / pvc / external 無 owner)。祖先解析 MUST **優先於** owner 退回,且 MUST **不覆寫**節點自身已帶的 `controller`(own-wins)。`controller` 與既有的 `application`(ArgoCD application 名稱)正交,兩者可並存。
- **`from_time` / `to_time` 參數**:當 app 提供檢視時間範圍時,app SHALL 送出 `from_time` = 範圍起點之 **Unix 秒**、`to_time` = 範圍終點之 **Unix 秒**(與 backend graph query 的 `start` / `end` 同採 Unix 秒;backend 亦接受 RFC 3339,此處採秒)。時間界由組裝純函式自時間範圍參數注入,僅於適用(非「無參數」)分支加入,與其餘參數共用同一 param map / 請求 key。app 未提供檢視時間範圍時 MUST 省略 `from_time` / `to_time`。

#### Scenario: leaf 參數排除 labels 與 rendering 欄、label 以 name 送出

- **WHEN** 對一個帶 `kind` / `label` / `namespace` / `labels` / `parent` 的 pod leaf 組裝參數
- **THEN** 送出 `kind` 與 `name`(值為 `data.label`)、以及 `namespace`;MUST NOT 送出 `labels`、`parent`,或任何 `is*` / `*Color` / `worstStatus` / `status` / `id` 欄

#### Scenario: 儲存事實欄 storageclass / health / usage 不送出

- **WHEN** 對一個帶 `kind: 'pvc'` / `label` / `storageclass` 的 pvc leaf,或帶 `kind: 'netapp-aggr'` / `label` / `health` / `usage` 的 `netapp-aggr` leaf 組裝參數
- **THEN** 送出 `kind` 與 `name`(值為 `data.label`);MUST NOT 送出 `storageclass`、`health`、`usage`、`usageRatio`(pinned card 用的儲存事實欄),亦 MUST NOT 送出任何 `is*` / `*Color` / `parent` / `id` 欄

#### Scenario: compound 合併子節點一致屬性、略過相異屬性

- **WHEN** 對一個 controller 容器組裝參數,其所有子 pod 的某屬性(如 `namespace`)值皆相同、另一屬性(如 `name`)值各異
- **THEN** 該一致屬性併入參數(若自身未帶該欄),相異屬性略過;自身已帶的欄以自身值為準(own-wins)

#### Scenario: 非 scalar 與合成 id 不送出(`ipAddress` 除外)

- **WHEN** 被組裝的節點帶 `alerts` / `containers` / `owner` 等非 scalar 欄,且(若為 controller)帶合成 `id`
- **THEN** 這些欄 MUST NOT 出現在 `/dashboard` 的 query 參數中(`ipAddress` 為例外,見下「ipaddress」scenario)

#### Scenario: ipAddress 以重複 ipaddress 參數送出

- **WHEN** 對一個帶 `ipAddress: ['10.0.0.1', '10.0.0.2']` 的 pod leaf 組裝參數
- **THEN** `/dashboard` 帶重複的 `ipaddress=10.0.0.1&ipaddress=10.0.0.2`
- **WHEN** pod 的 `ipAddress` 缺漏或為空陣列
- **THEN** `ipaddress` 參數 MUST 省略

#### Scenario: controller 自最近 isController 祖先解析

- **WHEN** 某 pod leaf 於 controller mode 巢狀於某 `isController` 容器之下
- **THEN** `/dashboard` 參數含 `controller`,值為該最近 `isController` 祖先的名稱(`data.label`)

#### Scenario: controller 退回 owner.name、皆無則省略

- **WHEN** 某 pod 無任何 `isController` 祖先(如 node mode)但自身帶 `data.owner.name`
- **THEN** `controller` 取自 `data.owner.name`
- **WHEN** 節點既無 `isController` 祖先亦無 `data.owner`(如 controller 容器自身、或裸 service / pvc / external)
- **THEN** `controller` 參數 MUST 省略

#### Scenario: from_time / to_time 帶檢視時間範圍之 Unix 秒

- **WHEN** app 提供檢視時間範圍,對一個適用節點組裝參數,且該範圍的起點 / 終點對應 Unix 秒 `1700000000` / `1700003600`
- **THEN** `/dashboard` 參數含 `from_time=1700000000` 與 `to_time=1700003600`
- **WHEN** app 未提供檢視時間範圍
- **THEN** `from_time` / `to_time` 參數 MUST 省略

#### Scenario: cluster 自最近 isCluster 祖先解析(含 controller 經 namespace 群組上溯)

- **WHEN** 某適用節點(leaf / controller / k8s-node)巢狀於某 `isCluster` 容器之下(可能經 namespace 群組等中間 compound)
- **THEN** `/dashboard` 參數含 `cluster`,值為該最近 `isCluster` 祖先的 `data.cluster`

#### Scenario: cluster 退回 labels.cluster、皆無則省略

- **WHEN** 節點無任何 `isCluster` 祖先但自身帶 `labels.cluster`
- **THEN** `cluster` 取自 `labels.cluster`
- **WHEN** 節點既無 `isCluster` 祖先亦無 `labels.cluster`(如頂層 external)
- **THEN** `cluster` 參數 MUST 省略

### Requirement: Dashboard 按鈕呈現

當某節點的 `/dashboard` 查詢為 **available** 時,app SHALL 於 node detail panel **header 的節點名稱旁**渲染 Dashboard 入口;header 在面板的每一種內容組合(header-only、帶 Application / Containers / Alerts)下皆渲染,故單一放置即可。查詢為 **loading** 或 **unavailable** 時 MUST 不渲染任何按鈕(無載入指示、無錯誤、無 placeholder),避免閃爍。入口型態依連結數決定:

- **單一連結**(`urls.length === 1`):MUST 渲染一顆文案為 **Dashboard** 的連結按鈕,以新分頁開啟該 `url`(`target="_blank"`、`rel="noopener noreferrer"`)。
- **多個連結**(`urls.length >= 2`):MUST 渲染一顆 **Dashboards** 觸發鈕與下拉選單,每個項目顯示對應 `label`,點擊以新分頁(`noopener,noreferrer`)開啟該 `url`。

按鈕 MUST 使用 app 自身的 dark / light 主題 token 呈現,並隨主題切換。

#### Scenario: 單一連結維持 Dashboard 按鈕

- **WHEN** 某適用節點的 `/dashboard` 解析為一筆連結,且面板開啟
- **THEN** header 於節點名稱旁渲染文案為 **Dashboard** 的連結按鈕,點擊以新分頁(`noopener,noreferrer`)開啟該 `url`

#### Scenario: 多連結顯示 Dashboards 選單

- **WHEN** 某適用節點的 `/dashboard` 解析為兩筆或以上連結
- **THEN** header 顯示 **Dashboards** 觸發鈕;展開後每個 `label` 可點擊並以新分頁開啟對應 `url`

#### Scenario: loading / 不可用時不渲染按鈕

- **WHEN** `/dashboard` 查詢進行中(loading)、或為 unavailable
- **THEN** header MUST 不渲染 Dashboard 按鈕,且不顯示載入指示或錯誤訊息
