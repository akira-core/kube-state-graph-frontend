## Purpose

`storage-flow-sankey` 定義 Sankey 儲存流量視圖的行為契約:自 app shell 共用的正規化 graph 推導 `pod → pvc → netapp-aggr → netapp-node` 的節點與 link、以 `pvc-to-netapp-aggr` edge 的 `readBytesPerSec` / `writeBytesPerSec` 為權重、讀 / 寫分流、缺值(absent ≠ 0)處理、排序、tooltip、hover 高亮、跨視圖 Locate、主題、尺寸、重新整理與效能界限。本 capability 不決定繪圖框架(於 design 定案),只規範可觀察行為。

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

每個 tier 內的節點 SHALL 由上而下依節點在**當前模式**下的總流量降序排列;總流量定義為該節點所有已繪製 link 權重的總和(Read / Write 模式為單一方向;Both 模式為 read + write),對有入邊與出邊的節點取入邊總和與出邊總和中的較大者。總流量相同時 MUST 依節點 `label` 字典序升序(以 `localeCompare` 比較)。排序結果 MUST 為確定性(同一輸入永遠得到同一順序)。

#### Scenario: 依總流量降序

- **WHEN** 於 Both 模式以 fixture 推導(`aggr1` 總流量 `6291456`、`aggr2` 總流量 `311296`)
- **THEN** aggr tier 中 `aggr1` 在 `aggr2` 之上;切換為 Write 模式後(`1048576` vs `49152`)順序不變

#### Scenario: 同值以 label 排序

- **WHEN** 兩個 pvc 在當前模式下總流量皆為 `1048576`,label 分別為 `data-b` 與 `data-a`
- **THEN** `data-a` 排在 `data-b` 之上

### Requirement: 節點與 link 的標籤與 tooltip

每個節點 MUST 顯示其 `label`(即 pod / pvc / aggr / netapp-node 的 name)。hover 節點時 tooltip MUST 顯示:

- 節點 kind 與 `label`;pod 另顯示 `namespace`。
- 當前模式下的總流入與總流出 bytes/sec(Both 模式下 read / write 各自列出)。
- `pvc` / `netapp-aggr`:若 `usage` 存在,顯示 `usedBytes` / `capacityBytes`(used / capacity);缺 `usage` 或任一欄位時不顯示該項,MUST NOT 補 `0`。
- `netapp-aggr` / `netapp-node`:若 `health` 存在則原樣顯示;缺值時不顯示,MUST NOT 補 `unknown` 或 `degraded`。

hover link 時 tooltip MUST 顯示 source `label`、target `label`、方向(read / write)與權重值;pvc→aggr link 另 MUST 在 `maxBytesPerSec` / `maxIops` 存在時以資訊形式顯示(標示為 QoS ceiling),缺值時不顯示、MUST NOT 顯示 `0` 或「unlimited」;量測超過 ceiling 時 MUST NOT 上色、警示或改變 link 樣式。pod→pvc link 的 tooltip MUST 標示「均分估計」與 pod 數。

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

Sankey 視圖 MUST 讀取 app shell 的主題 token,在 dark 與 light 兩主題下皆正確渲染(背景、節點、link、文字、tooltip、legend 均使用主題 token,不得硬編顏色);主題切換時 MUST 即時重繪且不遺失 mode / hover 狀態。read 與 write 的 link 顏色在兩主題下 MUST 皆可區分,且區分 MUST NOT 僅依賴色相:兩者 MUST 同時以明度差異或填充圖樣(pattern)區分,並由 legend 的文字標籤說明。

#### Scenario: 主題切換

- **WHEN** 使用者於 Sankey 視圖(Write 模式、hover 中)將主題自 dark 切為 light
- **THEN** 圖形以 light 主題 token 重繪,mode selector 仍為 Write,hover 高亮狀態維持

#### Scenario: read / write 不僅靠色相

- **WHEN** 檢視 Both 模式的 legend 與 link
- **THEN** read 與 write 除色相外另有明度差異或填充圖樣差異,且 legend 以文字標示 read / write

### Requirement: 尺寸與容器 resize

Sankey MUST 填滿 app shell 提供的視圖區域(寬高皆隨容器);容器尺寸變化時 MUST 在觀測到變化後的**一個 animation frame** 內完成重新佈局,期間 MUST NOT 遺失 hover 高亮狀態、mode selector 值與 cluster selector 值。內容不因尺寸變化而產生視圖區域外的水平捲動。

#### Scenario: 視窗縮放

- **WHEN** 使用者將視窗寬度自 1400px 調整為 900px
- **THEN** 圖形在下一個 animation frame 內以新尺寸重新佈局並完整落於視圖區域內,mode selector 值不變

#### Scenario: resize 期間的 hover

- **WHEN** 使用者 hover `aggr1` 期間容器尺寸改變
- **THEN** 重新佈局後 `aggr1` 的路徑高亮仍維持,tooltip 位置隨新座標更新

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

#### Scenario: 500 條儲存 edge 首次繪製

- **WHEN** 以上述合成 graph 開啟 Sankey 視圖
- **THEN** 自 graph 可用至圖形首次繪製完成的耗時 ≤ 1000 ms,且四個 tier 的節點數分別為 1000 / 500 / 25 / 5

#### Scenario: hover 不重算佈局

- **WHEN** 於上述合成 graph 連續 hover 與離開 100 個不同節點
- **THEN** 佈局函式被呼叫的次數為 0,每次 hover 的樣式更新於一個 animation frame 內完成,且節點座標全程不變
