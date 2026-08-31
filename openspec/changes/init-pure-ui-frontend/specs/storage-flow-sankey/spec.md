## Purpose

`storage-flow-sankey` 定義 Sankey 儲存流量視圖的行為契約:自 app shell 共用的正規化 graph 推導 `pod → pvc → netapp-aggr → netapp-node` 的節點與 link、以 `pvc-to-netapp-aggr` edge 的 `readBytesPerSec` / `writeBytesPerSec` 為權重、讀 / 寫分流、缺值(absent ≠ 0)處理、排序、tooltip、hover 高亮、跨視圖 Locate、主題、尺寸、重新整理與效能界限;並規範其視覺語彙(盒卡節點與槽位、共用比例尺的漸層緞帶、帶上數值、欄位標題、namespace 分組色條、圖外數字摘要)與檢視操作(縮放、平移、縮放控制列、專注模式)。本 capability 不決定繪圖框架(於 design 定案),只規範可觀察行為。

## ADDED Requirements

### Requirement: 輸入為共用的正規化 graph,Sankey 為唯讀衍生視圖

Sankey 視圖 MUST 以 app shell 持有、與 Graph 視圖**同一份**已載入並經 `normalizeGraph` 正規化的 graph 為唯一輸入;MUST NOT 另行 fetch `GET /v1/graph`,MUST NOT 自行呼叫 normalize。Sankey 的節點 / link 為自該 graph 推導的衍生資料,推導過程 MUST NOT 變更(mutate)共用 graph 的任何節點、edge 或欄位——推導前後共用 graph MUST 深度相等(deep-equal)。共用 graph 處於 loading / error 狀態時,Sankey 視圖 SHALL 呈現 app shell 提供的同一 loading / error 狀態且不繪製任何圖形。

#### Scenario: 兩視圖共用同一份 graph 實例

- **WHEN** 使用者於 Graph 視圖載入 graph 後切換至 Sankey 視圖
- **THEN** Sankey 視圖不發出任何新的 `GET /v1/graph` 請求,且其推導所用的 graph 物件與 Graph 視圖持有者為同一參照(reference-equal)

#### Scenario: 推導不改變共用 graph

- **WHEN** 以 fixture 正規化後的 graph 執行 Sankey 推導(含 Read / Write / Both 三種模式各一次)
- **THEN** 推導後的共用 graph 與推導前的深拷貝 deep-equal(無新增欄位、無改寫的 `metrics`、無被移除的 edge)

#### Scenario: 共用 graph 載入中或錯誤

- **WHEN** 共用 graph 尚在 loading,或取數失敗進入 error 狀態
- **THEN** Sankey 視圖顯示 app shell 的 loading / error 狀態,不呈現 mode selector 以外的任何圖形元素,且不顯示「metrics 缺失」的空狀態

### Requirement: 流向鏈與 tier 結構

Sankey SHALL 由左至右固定四個 tier:`pod` → `pvc` → `netapp-aggr` → `netapp-node`。Link 的推導規則為:

- pod → pvc:每條 `pod-mounts-pvc` edge(source 為 `kind: 'pod'`、target 為 `kind: 'pvc'`)推導一個 source→target 配對。
- pvc → netapp-aggr:每條 `pvc-to-netapp-aggr` edge(source 為 `kind: 'pvc'`、target 為 `kind: 'netapp-aggr'`)推導一個配對。
- netapp-aggr → netapp-node:自 `netapp-aggr` 節點的 compound `parent` 推導——當 `parent` 指向一個 `kind: 'netapp-node'` 的節點時,產生 aggr→netapp-node 配對;沒有 `parent`、或 `parent` 不是 `netapp-node` 的 aggr MUST 仍留在 aggr tier 作為終點(sink),不產生向右的 link。

Edge 的 source / target MUST 以 id 解析為 graph 中實際存在且 kind 相符的節點,否則該 edge MUST 被忽略。`storage-cluster`、`cluster`、`namespace`、`application`、`controller`、`node`、`service`、`switch` 等其他 kind 的節點 MUST NOT 出現在 Sankey 中;compound 容器的 collapse 狀態 MUST NOT 影響 Sankey。

#### Scenario: fixture 推導出四個 tier

- **WHEN** 以 fixture(`SHOWCASE_GRAPH`)正規化後的 graph 推導 Sankey(Both 模式)
- **THEN** pod tier 為 `mongo-0`、`mongo-1`;pvc tier 為 `data-mongo-0`、`data-mongo-1`;aggr tier 為 `aggr1`、`aggr2`;netapp-node tier 為 `ontap-prod-01`、`ontap-prod-02`
- **AND** link 配對為 `mongo-0→data-mongo-0`、`mongo-1→data-mongo-1`、`data-mongo-0→aggr1`、`data-mongo-1→aggr2`、`aggr1→ontap-prod-01`、`aggr2→ontap-prod-02`,且 `storage-cluster/ontap-prod`、`prod/app/mongodb`、`prod/ctrl/StatefulSet/mongodb` 皆不出現

#### Scenario: aggr 的 parent 不是 netapp-node

- **WHEN** 某 `netapp-aggr` 節點無 `parent`,或其 `parent` 指向 `storage-cluster` 而非 `netapp-node`
- **THEN** 該 aggr 仍出現在 aggr tier 並承接其 pvc→aggr link,但不產生任何向 netapp-node tier 的 link,且不建立任何替代節點

### Requirement: 權重來源與 Read / Write / Both 檢視模式

Link 權重 MUST 只取自 `pvc-to-netapp-aggr` edge 的 `data.metrics.readBytesPerSec` 與 `data.metrics.writeBytesPerSec`(單位 bytes/sec,不換算);`readOps` / `writeOps` / `readLatencyUs` / `writeLatencyUs` / `maxIops` / `maxBytesPerSec` MUST NOT 作為權重。視圖 SHALL 提供一個 mode selector,選項為 **Read** / **Write** / **Both**,預設 **Both**。Read 或 Write 模式下,每個 source→target 配對至多一條 link,權重為該單一方向的值;Both 模式下,每個配對 MUST 繪製兩條可區分的 link(read 與 write 各一,顏色不同),且畫面 MUST 顯示 legend 說明兩種顏色分別對應 read / write。

#### Scenario: Read 模式權重

- **WHEN** 使用者選擇 Read 模式,且 fixture 中 `e-pts-0`(`data-mongo-0→aggr1`)的 `readBytesPerSec` 為 `5242880`
- **THEN** `data-mongo-0→aggr1` 恰有一條 link,權重為 `5242880`,不受同一 edge 的 `writeBytesPerSec`、`readOps` 或 `maxBytesPerSec` 影響

#### Scenario: Both 模式雙 link 與 legend

- **WHEN** 視圖以預設模式開啟
- **THEN** mode selector 顯示 Both,`data-mongo-0→aggr1` 有兩條 link(read 權重 `5242880`、write 權重 `1048576`),兩者顏色不同,且 legend 標示 read / write 各自的顏色

#### Scenario: 切換模式即時重算

- **WHEN** 使用者自 Both 切換為 Write
- **THEN** 每個配對只剩 write link(`data-mongo-0→aggr1` 權重 `1048576`、`data-mongo-1→aggr2` 權重 `49152`),legend 不再顯示 read 項目

### Requirement: 權重傳播:pvc→aggr 為實測、aggr→netapp-node 加總、pod→pvc 均分

各 tier 之間的權重 SHALL 依下列規則傳播(每個方向 read / write 各自獨立計算):

- pvc→aggr link 權重 = 該 `pvc-to-netapp-aggr` edge 該方向的實測值。
- aggr→netapp-node link 權重 = 該 aggr 所有**已繪製**的 pvc→aggr link 於該方向的總和。
- pod→pvc link 權重 = 該 pvc 該方向的實測值 ÷ 掛載該 pvc 的 pod 數(pod 數 = 以該 pvc 為 target 的 `pod-mounts-pvc` edge 數);此為估計值,link tooltip MUST 標示其為「均分估計」並註明 pod 數。
- 沒有任何 pod 掛載的 pvc MUST 仍出現在 pvc tier,作為無入邊的 source。
- 未掛載任何有量測的 pvc 之 pod MUST NOT 出現。

#### Scenario: aggr→netapp-node 為入邊總和

- **WHEN** 於 Read 模式,`aggr1` 的入邊僅有 `data-mongo-0→aggr1`(`5242880`)
- **THEN** `aggr1→ontap-prod-01` 的權重為 `5242880`;若另有第二個 pvc 以 `readBytesPerSec: 1000` 連至 `aggr1`,則權重為 `5243880`

#### Scenario: 多 pod 掛載同一 pvc 時均分

- **WHEN** 某 pvc 由 2 個 pod 掛載(2 條 `pod-mounts-pvc` edge),其 `pvc-to-netapp-aggr` edge 的 `writeBytesPerSec` 為 `1048576`,且處於 Write 模式
- **THEN** 兩條 pod→pvc link 權重各為 `524288`,且每條 link 的 tooltip 標示該值為 2 個 pod 的均分估計

#### Scenario: 無 pod 掛載的 pvc 與無有量測 pvc 的 pod

- **WHEN** 某 pvc 有帶量測的 `pvc-to-netapp-aggr` edge 但沒有任何 `pod-mounts-pvc` edge 指向它;同時 fixture 中的 `mongo-2` 只掛載沒有儲存 edge 的 `data-mongo-2`
- **THEN** 該 pvc 出現在 pvc tier 且無入邊;`mongo-2` 不出現在 pod tier

### Requirement: 缺值處理(absent ≠ 0)

推導 MUST 區分「量測不存在」與「量測為 0」:

- 某 edge 缺少當前方向的量測(`readBytesPerSec` 或 `writeBytesPerSec` 欄位不存在)→ 該方向不繪製 link;Both 模式下只繪製存在的那個方向。
- 某 edge 兩個方向的量測皆不存在(含整個 `metrics` 不存在)→ 該 edge 完全排除,不產生任何 link。
- 值為 `0` → MUST 繪製一條零權重 link,以最小可見粗細且與非零 link 視覺可區分的方式呈現(例如虛線或半透明),MUST NOT 視為缺值。
- 任一節點若其所有 link 皆被排除 → 該節點不繪製(pod / pvc / aggr / netapp-node 皆適用)。
- 上述判定 MUST 只依賴欄位存在與否與數值,MUST NOT 以 `0`、`null` 或任何預設值補入缺值。

#### Scenario: 只有 read 量測的 edge

- **WHEN** 某 `pvc-to-netapp-aggr` edge 的 `metrics` 為 `{ readBytesPerSec: 262144 }`(無 `writeBytesPerSec`)
- **THEN** Read 模式繪製權重 `262144` 的 link;Write 模式該配對無 link;Both 模式只有 read link,且 tooltip 不顯示 write 值(不顯示為 `0`)

#### Scenario: 零值繪製為零權重 link

- **WHEN** 某 edge 的 `metrics` 為 `{ readBytesPerSec: 0, writeBytesPerSec: 1048576 }` 且處於 Read 模式
- **THEN** 該配對繪製一條零權重 link,tooltip 顯示值為 `0 B/s`,其視覺樣式與非零 link 可區分,且其 source / target 節點仍被繪製

#### Scenario: 無儲存 edge 的 pvc 與其 pod 不繪製

- **WHEN** 以 fixture 推導(`data-mongo-2` 沒有任何 `pvc-to-netapp-aggr` edge)
- **THEN** `data-mongo-2` 與 `mongo-2` 皆不出現在任何 tier,且 `e-pvc-2` 不產生 link

### Requirement: 無 storage I/O metrics 時的空狀態

當共用 graph 中沒有任何 `pvc-to-netapp-aggr` edge 帶有 `readBytesPerSec` 或 `writeBytesPerSec`(含 graph 中根本沒有此類 edge)時,Sankey 視圖 MUST 以空狀態取代圖形,說明 graph 中不含儲存 I/O metrics;若共用 graph 來自 demo fixture(demo 模式),空狀態 MUST 額外說明目前顯示的是 demo fixture 資料。當 graph 具有量測但**當前模式的方向**全無量測(例如 Read 模式下所有 edge 只有 `writeBytesPerSec`)時,空狀態 MUST 說明當前方向無量測並提示切換模式。空狀態顯示期間 mode selector(與 cluster selector,若有)MUST 保持可操作。

#### Scenario: graph 完全沒有儲存量測

- **WHEN** 共用 graph 的所有 `pvc-to-netapp-aggr` edge 都沒有 `metrics`,或 graph 沒有任何 `pvc-to-netapp-aggr` edge
- **THEN** 視圖顯示空狀態文字,說明此 graph 不含儲存 I/O metrics(bytes/sec),且不繪製任何節點或 link

#### Scenario: demo 模式的空狀態

- **WHEN** 上述情境發生且共用 graph 來自 demo fixture
- **THEN** 空狀態文字額外指出資料來源為 demo fixture

#### Scenario: 當前方向無量測

- **WHEN** 所有帶量測的 edge 只有 `writeBytesPerSec`,且使用者選擇 Read 模式
- **THEN** 視圖顯示「Read 方向無量測」的空狀態並提示可切換至 Write / Both;切換至 Write 後圖形正常繪製

### Requirement: tier 內排序

每個 tier 內的節點 SHALL 由上而下依節點在**當前模式**下的總流量降序排列;總流量定義為該節點所有已繪製 link 權重的總和(Read / Write 模式為單一方向;Both 模式為 read + write),對有入邊與出邊的節點取入邊總和與出邊總和中的較大者。總流量相同時 MUST 依節點 `label` 字典序升序(以 `localeCompare` 比較)。排序結果 MUST 為確定性(同一輸入永遠得到同一順序)。pod tier 另受 namespace 分組約束(見「pod tier 的 namespace 分組色條與相鄰排列」):分組相鄰優先於跨群組的流量排序,群組內部仍依本規則排序。

#### Scenario: 依總流量降序

- **WHEN** 於 Both 模式以 fixture 推導(`aggr1` 總流量 `6291456`、`aggr2` 總流量 `311296`)
- **THEN** aggr tier 中 `aggr1` 在 `aggr2` 之上;切換為 Write 模式後(`1048576` vs `49152`)順序不變

#### Scenario: 同值以 label 排序

- **WHEN** 兩個 pvc 在當前模式下總流量皆為 `1048576`,label 分別為 `data-b` 與 `data-a`
- **THEN** `data-a` 排在 `data-b` 之上

### Requirement: 節點以盒卡呈現,連線自槽位進出

每個 Sankey 節點 MUST 繪製為一張圓角盒卡,而非高度與權重成正比的細長矩形。盒卡內容自上而下為:

- **標題列**:節點 `label`。
- **分隔線**:標題列與內文之間。
- **副標列**:節點 kind;`pod` 另顯示其 `namespace`;`pvc` 與 `netapp-aggr` 在 `usage` 的 `usedBytes` 與 `capacityBytes` **皆**存在時顯示 `used / capacity`,任一缺值即整項不顯示,MUST NOT 補 `0`。

連線 MUST 自盒卡邊緣的**槽位**進出:入邊掛左緣、出邊掛右緣;同一側的槽位由上而下依該連線權重降序排列,權重相同時依對側節點 `label` 字典序升序(`localeCompare`)。槽位高度為 max(該連線的緞帶厚度, 固定的最小列高),槽位之間有固定間距;盒卡高度為標題與副標所需高度加上 max(左側槽疊總高, 右側槽疊總高, 內文最小高度),兩側槽疊各自於盒卡內文垂直置中。因為槽位有最小列高而緞帶厚度沒有,同一節點左右兩疊的總高度**不必**相等 —— 守恆看的是緞帶厚度,不是槽疊高度。

節點 kind MUST 以描邊語彙區分,且區分 MUST NOT 只依賴色相:`netapp-aggr` 與 `netapp-node` 非 Kubernetes 資源,以**虛線**描邊;`pod` 與 `pvc` 以**實線**描邊。最右側 tier 的 `netapp-node` 為流向終點,MUST 以較小的**葉卡**呈現(標題、kind 與該節點當前模式下的總流入,無右緣槽位)。

盒卡內的所有文字 MUST NOT 接收指標事件(`pointer-events: none`):文字若吃事件會遮斷其下緞帶的 hover 高亮與 tooltip。

#### Scenario: pvc 盒卡的三列內容

- **WHEN** 使用者檢視 `data-mongo-0`(其 `usage` 為 `usedBytes` `700` GB 與 `capacityBytes` `1` TB)
- **THEN** 盒卡顯示標題 `data-mongo-0`、副標含 `pvc` 與 `700 GB / 1 TB`;其入邊掛左緣、出邊掛右緣

#### Scenario: 缺 usage 的盒卡不補零

- **WHEN** 某 `pvc` 節點沒有 `usage`,或只有 `usedBytes` 而無 `capacityBytes`
- **THEN** 該盒卡副標只顯示 kind,不出現 used / capacity 項目,也不顯示 `0`

#### Scenario: 槽位排序與最小列高

- **WHEN** 某 `netapp-aggr` 有三條入邊,權重分別為 `5242880`、`0` 與 `1000`
- **THEN** 左緣槽位由上而下為 `5242880`、`1000`、`0`;後兩者的緞帶厚度雖遠小於最小列高,其槽位仍各佔最小列高,三條緞帶互不重疊

#### Scenario: netapp-node 為葉卡

- **WHEN** 使用者檢視 `ontap-prod-01`
- **THEN** 該節點以葉卡呈現(較小尺寸、虛線描邊),只有左緣槽位,無右緣槽位

### Requirement: 連線為共用比例尺的漸層緞帶

所有連線的厚度 MUST 出自**同一把**比例尺:比例尺為最大厚度除以當前模式下所有**已繪製**連線權重的最大值,連線厚度為 max(最小厚度, 權重 × 比例尺)。Both 模式下 read 與 write 兩族 MUST 共用這一把尺 —— 各自縮放會使兩者的粗細不可互相比較。切換 mode 或 cluster selector 後 MUST 依新的最大值重算比例尺。

緞帶 MUST 為三次貝茲曲線圍成的**填色區域**(而非等寬 stroke 路徑),兩端各錨於來源與目標的槽位中心,並以自 source 端至 target 端的線性漸層填色;漸層兩端色 MUST 同屬該方向(read / write)的色族,使方向仍可辨識。

hover 高亮 MUST 由 class 或 CSS `:hover` 驅動的樣式切換完成,並 MUST 在 `mouseleave` 不會觸發的情況下(指標直接移出瀏覽器視窗、觸控中斷、平移開始)仍能還原:MUST NOT 有任何連線卡在高亮樣式。

#### Scenario: 共用比例尺

- **WHEN** 於 Both 模式,全圖已繪製連線的最大權重為 `5242880`(一條 read 連線)
- **THEN** 該連線以最大厚度呈現;權重 `1048576` 的 write 連線厚度約為其五分之一,兩者以同一把尺換算

#### Scenario: 切換模式重算比例尺

- **WHEN** 使用者自 Both 切換為 Write,最大權重自 `5242880` 變為 `1048576`
- **THEN** 比例尺依 `1048576` 重算,該 write 連線改以最大厚度呈現

#### Scenario: hover 不卡在高亮

- **WHEN** 使用者 hover 一條緞帶後,將指標直接移出瀏覽器視窗(不經過任何其他元素)
- **THEN** 該緞帶回到未高亮樣式

### Requirement: 緞帶上的數值標籤

每條已繪製的連線 MUST 於其緞帶中點標示該方向格式化後的 bytes/sec 值。標籤 MUST 以**描邊光暈**(描邊先於填色繪製,描邊色為圖區背景色)與其下的緞帶分離,MUST NOT 使用不透明底板 —— 底板會在緞帶上打出一塊缺口。Both 模式下 read 與 write 兩條各自標示。當緞帶厚度小於標籤字高時 MUST 省略該標籤以免疊字,該值仍 MUST 可自 link tooltip 讀到。

#### Scenario: Both 模式兩條各自標示

- **WHEN** 使用者於 Both 模式檢視 `data-mongo-0→aggr1`
- **THEN** read 緞帶標 `5.24 MB/s`、write 緞帶標 `1.05 MB/s`,兩個標籤皆有描邊光暈,標籤之下的緞帶仍連續可見(無不透明底板造成的缺口)

#### Scenario: 極細緞帶省略標籤

- **WHEN** 某連線權重為 `0`,緞帶以最小厚度呈現
- **THEN** 該緞帶不標數值;hover 時 tooltip 仍顯示 `0 B/s`

### Requirement: 欄位標題

四個 tier MUST 各於其欄頂端標示一行標題:`Pod`、`PVC`、`NetApp aggregate`、`NetApp node`。標題 MUST 以次要前景色與較寬字距呈現,且 MUST NOT 佔用節點的佈局空間(不推擠盒卡)。某 tier 在當前模式與 cluster 選擇下沒有任何已繪製節點時,該欄標題 MUST NOT 繪製。

#### Scenario: 四欄標題

- **WHEN** 以 fixture 於 Both 模式開啟 Sankey
- **THEN** 由左至右依序出現 `Pod`、`PVC`、`NetApp aggregate`、`NetApp node` 四行欄位標題

#### Scenario: 空 tier 不標題

- **WHEN** 所有帶量測的 pvc 都沒有任何 `pod-mounts-pvc` edge 指向它,pod tier 因而沒有節點
- **THEN** `Pod` 欄標題不繪製,其餘三行照常繪製

### Requirement: pod tier 的 namespace 分組色條與相鄰排列

pod tier 內,同一 `namespace` 的 pod MUST 相鄰排列,並於其盒卡左緣掛一條固定寬度的圓角色條,同 namespace 者同色。色盤 MUST 依 namespace 在該 tier 內**首次出現的順序**取色、用盡即循環,MUST NOT 以雜湊(hash)決定 —— 色盤色數有限時雜湊撞色不可控,相鄰兩組同色比跨次載入顏色不穩更傷可讀性。色盤 MUST 與 read / write 的語意色可區分。沒有 `namespace` 的 pod MUST NOT 掛色條,並排在所有已分組的 pod 之後。

分組後的排序 MUST 仍為確定性:群組之間依「群組內節點總流量的最大值」降序,同值依 namespace 名稱字典序升序;群組內部依「tier 內排序」的規則。namespace 不是流量路徑上的節點,MUST NOT 被畫成盒卡,MUST NOT 產生任何連線。

#### Scenario: 同 namespace 相鄰且同色

- **WHEN** pod tier 含 `prod` 的 `mongo-0`、`mongo-1` 與 `staging` 的 `redis-0`,且 `redis-0` 的總流量高於兩個 mongo
- **THEN** `staging` 群組排在 `prod` 群組之上;`mongo-0` 與 `mongo-1` 相鄰且左緣色條同色,與 `redis-0` 的色條不同色

#### Scenario: 無 namespace 的 pod

- **WHEN** 某 pod 沒有 `namespace`
- **THEN** 該 pod 不掛色條,且排在所有帶 namespace 的 pod 之後

#### Scenario: namespace 不是節點

- **WHEN** pod tier 含兩個 namespace
- **THEN** 圖上沒有任何代表 namespace 的盒卡或連線,分組只以相鄰排列與色條表達

### Requirement: 圖外的數字摘要

圖形**下方** MUST 另有數字摘要,這些數字 MUST NOT 被塞進節點盒卡:

- **節點摘要表**:每個已繪製節點一列,欄位為 tier、`label`、當前模式下的總流入與總流出;`pvc` / `netapp-aggr` 另列 usage,`netapp-aggr` / `netapp-node` 另列 health。缺值 MUST 以缺值佔位符呈現,MUST NOT 顯示 `0`、`0 B` 或 `unknown`。
- **namespace 小計表**:pod tier 每個 namespace 一列,欄位為 namespace、pod 數與當前模式下的總流量合計,依合計降序。pod tier 沒有任何帶 namespace 的 pod 時,整張表 MUST NOT 繪製。

兩張表 MUST 隨 mode、cluster selector 與 graph 重新整理同步更新。表格過寬時 MUST 於其自身容器內橫向捲動,MUST NOT 使頁面出現橫向捲軸。空狀態(見「無 storage I/O metrics 時的空狀態」)顯示期間,兩張表 MUST NOT 繪製。

#### Scenario: 摘要表隨模式更新

- **WHEN** 使用者自 Both 切換為 Write
- **THEN** 節點摘要表的總流入 / 總流出改為只計 write 方向,namespace 小計亦隨之改變

#### Scenario: 缺值不補零

- **WHEN** `ontap-prod-01` 沒有 `usage`
- **THEN** 其列的 usage 欄為缺值佔位符,不顯示 `0` 或 `0 B`

### Requirement: 節點與 link 的標籤與 tooltip

每個節點 MUST 顯示其 `label`(即 pod / pvc / aggr / netapp-node 的 name)。hover 節點時 tooltip MUST 顯示:

- 節點 kind 與 `label`;pod 另顯示 `namespace`。
- 當前模式下的總流入與總流出 bytes/sec(Both 模式下 read / write 各自列出)。
- `pvc` / `netapp-aggr`:若 `usage` 存在,顯示 `usedBytes` / `capacityBytes`(used / capacity);缺 `usage` 或任一欄位時不顯示該項,MUST NOT 補 `0`。
- `netapp-aggr` / `netapp-node`:若 `health` 存在則原樣顯示;缺值時不顯示,MUST NOT 補 `unknown` 或 `degraded`。

hover link 時 tooltip MUST 顯示 source `label`、target `label`、方向(read / write)與權重值;pvc→aggr link 另 MUST 在 `maxBytesPerSec` / `maxIops` 存在時以資訊形式顯示(標示為 QoS ceiling),缺值時不顯示、MUST NOT 顯示 `0` 或「unlimited」;量測超過 ceiling 時 MUST NOT 上色、警示或改變 link 樣式。pod→pvc link 的 tooltip MUST 標示「均分估計」與 pod 數。tooltip MUST 跟隨指標,並 MUST 被夾在視圖區之內 —— 不得溢出視窗邊緣造成裁切或使頁面出現捲軸;平移進行中 MUST NOT 開啟 tooltip,平移結束後 hover 行為恢復。

#### Scenario: hover aggr 節點

- **WHEN** 使用者於 Read 模式 hover `aggr1`
- **THEN** tooltip 顯示 `netapp-aggr` / `aggr1`、流入 `5.24 MB/s`、流出 `5.24 MB/s`、usage `700 GB / 1 TB`、health `online`

#### Scenario: hover netapp-node 與 pod

- **WHEN** 使用者 hover `ontap-prod-02`,隨後 hover `mongo-0`
- **THEN** `ontap-prod-02` 的 tooltip 顯示 health `degraded` 且不含 usage 項目;`mongo-0` 的 tooltip 顯示 namespace `prod`,不含 usage 與 health 項目

#### Scenario: link tooltip 的 QoS ceilings

- **WHEN** 使用者於 Both 模式 hover `data-mongo-0→aggr1` 的 read link,隨後 hover `data-mongo-1→aggr2` 的 read link
- **THEN** 前者顯示 read `5.24 MB/s`、`maxBytesPerSec` `105 MB/s`、`maxIops` `5000`,無任何警示樣式;後者(`e-pts-1` 無 ceiling)顯示 read `262 kB/s` 且不含任何 ceiling 項目

### Requirement: bytes/sec 數值格式化

所有 bytes/sec 值(權重、tooltip 總量、`maxBytesPerSec`)MUST 以 SI 單位(1000 進位:`B/s`、`kB/s`、`MB/s`、`GB/s`、`TB/s`)格式化,規則為:

- 選擇使縮放後數值 ≥ 1 的最大單位,並以 **3 位有效數字**呈現(例:`5242880` → `5.24 MB/s`;`104857600` → `105 MB/s`;`262144` → `262 kB/s`;`49152` → `49.2 kB/s`)。
- 值為 `0` → `0 B/s`。
- 非零但小於 `1 B/s` 的值 MUST 以指數表示法呈現 3 位有效數字(例:`3.86e-7` → `3.86e-7 B/s`),MUST NOT 顯示為 `0 B/s` 或 `0.00 B/s`。
- 格式化 MUST NOT 使用固定小數位的截斷方式(如 `toFixed(2)`)處理任意量級的值。

`usedBytes` / `capacityBytes` MUST 以同一 SI 規則、不含 `/s` 後綴格式化。

#### Scenario: 一般量級

- **WHEN** 格式化 `5242880`、`104857600`、`49152`
- **THEN** 分別得到 `5.24 MB/s`、`105 MB/s`、`49.2 kB/s`

#### Scenario: 極小值與零

- **WHEN** 格式化 `3.86e-7` 與 `0`
- **THEN** 分別得到 `3.86e-7 B/s` 與 `0 B/s`;前者 MUST NOT 被截斷為零

#### Scenario: tooltip 夾在視窗內

- **WHEN** 使用者 hover 位於視圖區最右緣、最下緣的節點
- **THEN** tooltip 完整可見且不溢出視窗,頁面不出現捲軸

### Requirement: hover 高亮路徑

hover 某節點時,視圖 MUST 高亮所有經過該節點的路徑上的 link——即自該節點沿入邊方向可回溯到的所有 link(上游)與沿出邊方向可到達的所有 link(下游)之聯集——並淡化(fade)其餘 link 與節點;Both 模式下 read / write 兩方向的 link 皆納入。不在任何經過該節點之路徑上的 link(例如同一 netapp-node 下其他 aggr 的入邊)MUST NOT 被高亮。滑鼠離開後 MUST 還原為全部正常顯示。hover 高亮 MUST 僅改變樣式,MUST NOT 觸發重新佈局。

#### Scenario: hover pvc 高亮上下游

- **WHEN** 使用者於 Both 模式 hover `data-mongo-0`
- **THEN** `mongo-0→data-mongo-0`、`data-mongo-0→aggr1`、`aggr1→ontap-prod-01` 的 read 與 write link 皆高亮;`data-mongo-1→aggr2`、`aggr2→ontap-prod-02` 及其節點被淡化

#### Scenario: 不高亮旁支

- **WHEN** 有兩個 aggr(`aggrA`、`aggrB`)皆隸屬同一 netapp-node,使用者 hover `aggrA`
- **THEN** `aggrA` 的所有入邊、`aggrA→netapp-node` 高亮;`aggrB→netapp-node` 與 `aggrB` 的入邊被淡化

#### Scenario: 離開後還原

- **WHEN** 使用者將滑鼠移出任何節點
- **THEN** 所有 link 與節點還原為未淡化狀態,且佈局座標與 hover 前完全相同

### Requirement: 點選節點跨視圖 Locate

點選 Sankey 節點 MUST 導覽至 Graph 視圖並對同一 id 的 graph 節點執行 Locate(語意同 CONTEXT.md 的 **Locate**):展開其 collapsed 祖先容器鏈、選取該節點、將 viewport fit 至其 closed neighborhood、並清空搜尋輸入。Sankey 自身 MUST NOT 持有持久化的選取狀態——返回 Sankey 視圖時無任何節點處於選取態。若目標節點在 Graph 視圖中為 **filter-hidden**,MUST NOT 靜默覆寫使用者的過濾設定:Graph 視圖 MUST 顯示提示說明該節點被過濾隱藏,且不改變過濾器亦不選取。

#### Scenario: 點選 aggr 定位至 Graph 視圖

- **WHEN** 使用者於 Sankey 點選 `aggr1`
- **THEN** app 路由切換至 Graph 視圖,`netapp/ontap-prod/aggr/aggr1` 成為選取節點、其 collapsed 祖先(如 `storage-cluster/ontap-prod`、`ontap-prod-01`)被展開、viewport fit 至其 closed neighborhood,搜尋輸入為空

#### Scenario: 返回 Sankey 無選取

- **WHEN** 使用者 Locate 後切換回 Sankey 視圖
- **THEN** Sankey 中無任何節點顯示選取樣式,mode selector 保持離開前的值

#### Scenario: 目標為 filter-hidden

- **WHEN** Graph 視圖已隱藏 `pvc` kind,使用者於 Sankey 點選 `data-mongo-0`
- **THEN** app 切換至 Graph 視圖並顯示「該節點目前被過濾隱藏」的提示;kind 過濾器維持不變且無節點被選取

### Requirement: 主題支援與可區分的 read / write 配色

Sankey 視圖 MUST 讀取 app shell 的主題 token,在 dark 與 light 兩主題下皆正確渲染(背景、節點、link、文字、tooltip、legend 均使用主題 token,不得硬編顏色);主題切換時 MUST 即時重繪且不遺失 mode / hover 狀態。read 與 write 的 link 顏色在兩主題下 MUST 皆可區分,且區分 MUST NOT 僅依賴色相:兩者 MUST 同時以明度差異或填充圖樣(pattern)區分,並由 legend 的文字標籤說明。盒卡的描邊與底色、欄位標題、緞帶漸層的兩端色、數值標籤的描邊光暈、namespace 色條色盤、縮放控制列與專注模式的背景 MUST 一律取自主題 token。

#### Scenario: 主題切換

- **WHEN** 使用者於 Sankey 視圖(Write 模式、hover 中)將主題自 dark 切為 light
- **THEN** 圖形以 light 主題 token 重繪,mode selector 仍為 Write,hover 高亮狀態維持

#### Scenario: read / write 不僅靠色相

- **WHEN** 檢視 Both 模式的 legend 與 link
- **THEN** read 與 write 除色相外另有明度差異或填充圖樣差異,且 legend 以文字標示 read / write

#### Scenario: 新視覺元素隨主題重繪

- **WHEN** 使用者於 Sankey 視圖切換主題
- **THEN** 盒卡、欄位標題、緞帶漸層、數值標籤的描邊光暈、namespace 色條與縮放控制列皆改用新主題的 token,無硬編顏色殘留

### Requirement: 尺寸與容器 resize

Sankey 的 SVG MUST 填滿 app shell 提供的視圖區域(寬高皆隨容器),其 `viewBox` 為佈局算出的**內在座標**,並以 `preserveAspectRatio` 的 meet 語意等比置中適配。容器尺寸變化 MUST NOT 觸發重新佈局:節點與連線的內在座標 MUST 保持不變,只由 viewBox 重新適配;期間 MUST NOT 遺失 hover 高亮狀態、mode selector 值、cluster selector 值與當前的縮放平移視角。內容不因尺寸變化而產生視圖區域外的水平捲動。

#### Scenario: 視窗縮放

- **WHEN** 使用者將視窗寬度自 1400px 調整為 900px
- **THEN** 圖形等比縮小並完整落於視圖區域內,佈局函式未被呼叫(節點內在座標與 hover 前完全相同),mode selector 值不變

#### Scenario: resize 期間的 hover

- **WHEN** 使用者 hover `aggr1` 期間容器尺寸改變
- **THEN** `aggr1` 的路徑高亮仍維持,tooltip 位置隨新的螢幕座標更新

### Requirement: 圖區的縮放與平移

圖區 MUST 支援獨立於瀏覽器頁面縮放的圖內縮放與平移,且 MUST 只改變**單一**包住全部圖形的 `<g>` 的 `transform`;漸層等 `<defs>` MUST 留在該 `<g>` 之外。縮放為真幾何縮放:字級與線寬 MUST 隨之等比改變,MUST NOT 做反向補償。

- **滾輪 / 觸控板雙指**:以**指標位置為錨點**縮放 —— 錨點下的圖上座標在縮放前後 MUST 不變;該事件 MUST 被 `preventDefault`,MUST NOT 捲動頁面。
- **按住拖曳**:平移。圖區游標在一般狀態 MUST 為 `grab`、拖曳中 MUST 為 `grabbing`。
- 縮放倍率 MUST 有上下限,到達界限時 MUST 停住,MUST NOT 反彈或翻轉。

初始視角 MUST 為「符合視窗但不放大超過 1:1」:圖形大於視圖區時縮到全圖可見,小於視圖區時維持原尺寸並置中。mode 切換、cluster selector 切換、主題切換、容器 resize 與 graph 重新整理 MUST 保留當前視角。視角 MUST NOT 寫入 URL(路由 MUST 維持精確的 `/sankey`),MUST NOT 持久化。

#### Scenario: 以指標為錨點縮放

- **WHEN** 使用者將指標停在 `aggr1` 上滾動滾輪放大
- **THEN** `aggr1` 停在指標下方不移動,頁面本身不捲動

#### Scenario: 開場不放大小圖

- **WHEN** 圖形的內在尺寸小於視圖區
- **THEN** 開場視角為 1:1 並置中,MUST NOT 被放大至填滿

#### Scenario: 切換模式保留視角

- **WHEN** 使用者放大並平移至 `ontap-prod-02` 附近後,自 Both 切換為 Read
- **THEN** 圖形以 Read 模式重繪,縮放倍率與平移位置不變

### Requirement: 縮放控制列與圖區鍵盤操作

圖形繪製期間,圖區 MUST 於其右下角顯示一列縮放控制,含:縮小、目前倍率讀數(1:1 顯示為 `100%`,啟動它即回到 1:1)、放大、符合視窗、1:1、專注模式。每一項 MUST 為具可存取名稱且可鍵盤操作的按鈕。「符合視窗」(與按鍵 `0`)為完整 fit —— 全圖塞進視圖區,小圖**可以**因此被放大;這與開場視角的「符合視窗但不放大超過 1:1」不同,開場規則只適用於開場。空狀態、loading 與 error 期間 MUST NOT 顯示縮放控制列。

圖區容器 MUST 可取得焦點(`tabindex`)並具可存取名稱。下列按鍵 MUST 只在**圖區容器或其後代**具有焦點時作用:`+` / `-` 縮放一格、`0` 符合視窗、`1` 回到 1:1、`F` 進入專注模式、`Esc` 離開專注模式。這些監聽 MUST 註冊於圖區容器,MUST NOT 註冊於 `document` 或 `window`(見 `app-shell` 的「Shell 不註冊全域鍵盤快捷鍵」),且 MUST NOT 攔截送往 mode selector、cluster selector 或任何輸入元件的按鍵。

#### Scenario: 空狀態不顯示控制列

- **WHEN** Sankey 因 graph 無任何儲存量測而顯示空狀態
- **THEN** 縮放控制列不顯示;mode selector(與 cluster selector,若有)仍可操作

#### Scenario: 符合視窗可放大小圖

- **WHEN** 圖形的內在尺寸小於視圖區(開場為 1:1 置中),使用者按 `0` 或啟動「符合視窗」
- **THEN** 圖形被放大至恰好塞滿視圖區

#### Scenario: 倍率讀數回到 1:1

- **WHEN** 使用者放大至 240% 後啟動倍率讀數
- **THEN** 圖形回到 1:1,讀數顯示 `100%`

#### Scenario: 焦點不在圖區時按鍵無效

- **WHEN** 焦點在導覽列的主題切換上,使用者按 `0`
- **THEN** Sankey 的視角不變,該按鍵未被 Sankey 攔截

### Requirement: 專注模式

專注模式 MUST 收起 app shell 的頂部導覽列與 Sankey 自身的控制項(mode selector、cluster selector、legend 與圖外摘要表),使圖區填滿整個視窗。`Esc` 或再次啟動控制列的專注按鈕 MUST 離開。進入與離開 MUST 保留縮放平移視角、mode、cluster selector 與 hover 狀態。專注模式 MUST 為暫時的 view state:MUST NOT 寫入 URL、MUST NOT 持久化;切離 Sankey 視圖或完整重新整理後 MUST 回到未啟用。

#### Scenario: 進出專注模式保留視角

- **WHEN** 使用者放大至 180% 後按 `F`,再按 `Esc`
- **THEN** 進入時導覽列與控制項收起、圖填滿視窗;離開後兩者回復,縮放倍率仍為 180%

#### Scenario: 切走視圖即離開專注模式

- **WHEN** 使用者於專注模式按 `Esc` 離開後切換至 Graph 視圖再切回 Sankey
- **THEN** 專注模式為未啟用,導覽列可見,縮放平移視角仍為切走前的值

### Requirement: 共用 graph 重新整理時就地更新

當共用 graph 因重新整理(refresh)而更新時,Sankey MUST 就地重新推導並更新圖形(新增 / 移除節點與 link、更新權重),MUST NOT 重置為初始狀態;mode selector 與 cluster selector 的值 MUST 保留。已消失節點的 tooltip 與 hover 高亮 MUST 被清除;仍存在節點的 hover 高亮 MUST 依新拓樸重算。

#### Scenario: 權重更新

- **WHEN** 於 Write 模式,重新整理後 `e-pts-0` 的 `writeBytesPerSec` 自 `1048576` 變為 `2097152`
- **THEN** `data-mongo-0→aggr1` 與 `aggr1→ontap-prod-01` 的 link 權重更新為 `2097152`,mode selector 仍為 Write

#### Scenario: 節點新增與消失

- **WHEN** 重新整理後新增一條帶量測的 `pvc-to-netapp-aggr` edge(`data-mongo-2→aggr2`),同時 `e-pts-1` 被移除
- **THEN** `data-mongo-2` 與 `mongo-2` 出現於對應 tier,`data-mongo-1` 與 `mongo-1` 消失,若當時 hover 的是 `data-mongo-1` 則 tooltip 關閉且無殘留高亮

### Requirement: 與 Graph 視圖過濾器獨立;選用的 cluster 篩選

Sankey 的推導 MUST 獨立於 Graph 視圖的 kind / edge-type 過濾器、ingress visibility toggle、搜尋查詢、pod-parent mode 與 collapse 狀態——上述任何變更 MUST NOT 改變 Sankey 的節點、link 或權重。當共用 graph 的 `clusters` 列表含有 **兩個以上** Kubernetes cluster 時,視圖 SHALL 顯示 cluster selector,選項為 **All** 與每個 cluster 名稱,預設 All;僅一個或零個 cluster 時 MUST NOT 顯示 selector(等同 All)。選定單一 cluster 時:

- pod tier 與 pvc tier 只保留屬於該 cluster 的節點;節點所屬 cluster 的判定為:沿其 compound `parent` 鏈向上找到最近的 `kind: 'cluster'` 容器並取其 cluster 名稱;找不到時退回節點 `labels.cluster`;兩者皆無的節點視為不屬於任何 cluster,只在 All 下顯示。
- `netapp-aggr` 與 `netapp-node` 不屬於任何 Kubernetes cluster,MUST NOT 依 cluster 過濾;其 link 權重 MUST 只以在範圍內的 pvc→aggr link 重新加總;所有 link 皆被排除的 aggr / netapp-node 依缺值規則不繪製。

cluster selector 的值 MUST 於 mode 切換、resize、主題切換與 graph 重新整理後保留;重新整理後若選定的 cluster 已不存在於 `clusters`,MUST 退回 All。

#### Scenario: Graph 視圖過濾不影響 Sankey

- **WHEN** 使用者於 Graph 視圖隱藏 `pvc` kind、隱藏 `pvc-to-netapp-aggr` edge type、輸入搜尋 `nats`、切換 pod-parent mode 為 `node`,再切換至 Sankey 視圖
- **THEN** Sankey 的節點、link 與權重與未套用任何過濾時完全相同

#### Scenario: fixture 的兩個 cluster

- **WHEN** 以 fixture(`clusters: ['prod', 'dr']`)開啟 Sankey
- **THEN** 顯示 cluster selector,選項為 All / `prod` / `dr`,預設 All;選擇 `prod` 時圖形與 All 相同(所有 mongo pod 與 pvc 屬 `prod`);選擇 `dr` 時 pod / pvc tier 為空,`aggr1`、`aggr2`、`ontap-prod-01`、`ontap-prod-02` 因無任何 link 而不繪製,並顯示「所選 cluster 無儲存流量」的空狀態

#### Scenario: 單一 cluster 不顯示 selector

- **WHEN** 共用 graph 的 `clusters` 為 `['prod']` 或缺少 `clusters`
- **THEN** 不顯示 cluster selector,推導結果等同 All

### Requirement: 效能界限

以下界限 MUST 在 e2e 測試套件所用的開發機 / CI 等級硬體上成立:

- 對一個含 500 條皆帶 `readBytesPerSec` 與 `writeBytesPerSec` 的 `pvc-to-netapp-aggr` edge、500 個 pvc、1000 個 pod(每 pvc 2 個)、25 個 aggr、5 個 netapp-node 的合成 graph,自取得正規化 graph 至 Sankey 首次完成繪製(Both 模式)MUST 在 **1000 ms** 內。
- 切換 mode 或 cluster selector 後的重繪 MUST 在 500 ms 內。
- hover 與離開 MUST 只更新樣式,MUST NOT 觸發佈局重算(以佈局函式呼叫次數為 0 驗證),且樣式更新 MUST 在一個 animation frame 內完成。
- 縮放與平移 MUST 只更新單一 `<g>` 的 `transform`,MUST NOT 觸發佈局重算(同樣以佈局函式呼叫次數為 0 驗證),且每次更新 MUST 在一個 animation frame 內完成。

#### Scenario: 500 條儲存 edge 首次繪製

- **WHEN** 以上述合成 graph 開啟 Sankey 視圖
- **THEN** 自 graph 可用至圖形首次繪製完成的耗時 ≤ 1000 ms,且四個 tier 的節點數分別為 1000 / 500 / 25 / 5

#### Scenario: hover 不重算佈局

- **WHEN** 於上述合成 graph 連續 hover 與離開 100 個不同節點
- **THEN** 佈局函式被呼叫的次數為 0,每次 hover 的樣式更新於一個 animation frame 內完成,且節點座標全程不變

#### Scenario: 縮放平移不重算佈局

- **WHEN** 於上述合成 graph 連續縮放與平移 100 次
- **THEN** 佈局函式被呼叫的次數為 0,每次更新於一個 animation frame 內完成,節點的內在座標全程不變
