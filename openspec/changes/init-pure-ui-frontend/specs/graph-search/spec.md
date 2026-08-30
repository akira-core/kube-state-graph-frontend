## Purpose

Graph view 內建的圖搜尋:讓使用者在密集的多叢集拓樸中即時定位節點——**不重新向後端取數、不重跑佈局、不改變元素集合**。Miss fade 讓使用者一眼看出 hit 落在何處;result list 則可跳至(locate)畫面外或被摺疊於 collapsed 容器內的 hit。此功能與 app 內的 kind / edge 過濾器互補(過濾器改變元素集合並重繪),不取代它們。

## ADDED Requirements

### Requirement: Search bar rendering and lifecycle

Graph view SHALL 在 canvas 的**右上角**渲染一個**常駐**的搜尋列(絕對定位,與 pinned hover-tooltip 使用同一條 inset 帶——**`right: 8`**,貼齊或緊鄰 Graph view 頂緣;層疊於 canvas 之上;它 MUST NOT 佔用 layout 空間或縮小圖面)。當搜尋列與 pinned hover attributes card 同時存在時,搜尋列 MUST 疊放於 pinned card **之上**:兩者 MUST NOT 重疊;pinned card 停靠於搜尋列**下方**。搜尋 query MUST 為 Graph view 本地的、暫時性的 view state(與 pod-parent mode / legend 收合狀態同一類):它 MUST NOT 被寫入 runtime config,MUST NOT 被寫入 URL,且永不被持久化。當 graph 資料自設定的後端 URL 重新整理(refresh)而送來新資料時,query 及其效果 MUST 被保留。系統 MUST NOT 註冊任何用於喚起搜尋的全域鍵盤快捷鍵(如 `/`、`Ctrl+F`)——鍵盤行為僅存在於 input 取得焦點期間(見「Keyboard interaction inside the search input」)。當搜尋列與 partial-parse warning banner 同時存在時,兩者 MUST NOT 重疊(banner 維持在左上角;搜尋列在右上角)。

#### Scenario: Search bar always visible at top-right above pinned attributes

- **WHEN** Graph view 正常渲染(非 error / 首次載入狀態)
- **THEN** 搜尋 input 顯示於 canvas 右上角(right inset 與 pinned card 一致);圖面尺寸與佈局不受其存在影響
- **WHEN** 有節點被選取且 pinned attributes card 顯示中
- **THEN** pinned card 出現在搜尋列正下方,且不與其重疊

#### Scenario: Query is not persisted

- **WHEN** 使用者輸入 query 後重新載入 app 頁面
- **THEN** 搜尋 input 為空,沒有任何 fade 或 viewport 效果;runtime config 與 URL 皆不含任何搜尋相關欄位

#### Scenario: Data refresh preserves the query

- **WHEN** query 非空時,graph 資料自設定的後端 URL 重新整理並送來新資料
- **THEN** query 被保留;hit set 依新元素重新計算,fade 與 result list 隨之更新

### Requirement: Hit matching rules

節點是否為 **hit** SHALL 由純粹的判定規則決定(無副作用,僅依據 query 與節點欄位):query 以空白切分為 token;**每個** token(AND)都必須匹配——不分大小寫的子字串——節點六個欄位中的**任一**(OR):`label`、`kind`、`namespace`、`cluster`、`application`、`ipAddress`。缺少的欄位直接略過。匹配 MUST 僅涵蓋節點:edge 永遠不是 hit,也永遠不出現在 result list 中;hit 節點的 incident edges 會與它一起保持點亮(見「Miss fade」)。不支援 regex、fuzzy 或欄位限定(field-qualifier)語法。空的(或僅含空白的)query 表示搜尋未啟用。

#### Scenario: Single token substring-matches label

- **WHEN** query 為 `mongo`,且存在 label 為 `mongodb-replica-0` 的節點
- **THEN** 該節點為 hit(不分大小寫——`Mongo` 亦匹配)

#### Scenario: Multi-token AND across fields

- **WHEN** query 為 `prod mongo`,節點 A(`cluster: prod`、`label: mongodb-0`),節點 B(`cluster: dr`、`label: mongodb-0`)
- **THEN** 節點 A 為 hit(兩個 token 分別匹配 cluster 與 label);節點 B 不是(`prod` 在任何欄位都不匹配)

#### Scenario: Reverse lookup by IP

- **WHEN** query 為 `10.0.3`,且某 pod 的 `ipAddress` 為 `10.0.3.17`
- **THEN** 該 pod 為 hit,且其 result row 的 subline 顯示匹配到的欄位(`ipAddress: 10.0.3.17`)

#### Scenario: Edges are never hits

- **WHEN** query 為任一 edge type 字串(如 `pod-calls-pod`)
- **THEN** 沒有任何 edge 成為 hit 或出現在 result list;只有六個欄位恰好匹配的節點(若有)才是 hit

### Requirement: Viewport fit

在輸入停頓(debounce)後,Graph view SHALL 以動畫將 viewport fit 至**可見的 hit set**(包含 proxy-hit 容器;**排除**被過濾器隱藏及其他不可見的元素)。fit 後的 zoom MUST NOT 超過 `1.5`(超過時 clamp 至 1.5 並保持置中)。當 query 被清空時,viewport MUST 停留原處(不做快照、不還原——清空僅移除 fade)。當 hit set 為空時,Graph view MUST NOT 執行 fit(viewport 不變)。

#### Scenario: Debounced fit to all hits

- **WHEN** 使用者停止輸入且存在 ≥1 個可見 hit
- **THEN** viewport 以動畫 fit 至所有可見 hit 的 bounding box(包含 proxy-hit 容器),zoom ≤ 1.5

#### Scenario: A single hit is not over-zoomed

- **WHEN** 恰好只有一個 hit,且自然 fit 會將 zoom 推到遠超 1.5
- **THEN** zoom clamp 至 1.5,並將該 hit 置中

#### Scenario: Viewport stays put on clear

- **WHEN** 使用者清空 query
- **THEN** viewport 保持最後位置(沒有還原動畫);僅移除 fade

#### Scenario: Zero hits never move the viewport

- **WHEN** query 沒有任何 hit
- **THEN** viewport 不移動(整張圖 fade;result list 顯示無結果訊息)

### Requirement: Result list

當 query 非空**且 result list 處於開啟狀態**時,SHALL 於搜尋列下方懸掛一個下拉式 result list;每一列(**result**)對應一個 hit:主行為 `label` + kind badge;subline 顯示 `namespace` / `cluster` 脈絡,且當匹配到的欄位不是 `label` 時 MUST 顯示該欄位與其值(使用者才能理解為何匹配)。列表 MUST 依 label 穩定排序,上限 **50** 列,超過上限時於末尾顯示「N more」指示。位於 collapsed 容器內的 hit MUST 標註其容器(如 `in <controller> (collapsed)`)。**被過濾器隱藏**的 hit(被 kind / edge / ingress 過濾器隱藏)MUST 仍被列出,但以 **disabled** 狀態渲染並附 `eye-slash` 標記——僅告知、不可 locate,且列表 MUST NOT 提供任何會默默改變過濾器的操作路徑。列表有最大高度(約 canvas 高度的 40%)並於內部捲動。

列表的開啟 / 關閉是**獨立於 query 字串**的暫時性 UI 狀態:

- 當使用者將 query 改為非空值,或搜尋 input 在 query 已非空時取得焦點,列表 MUST 開啟。
- 當搜尋 input 失去焦點(blur)、某個非 disabled 的 result 被成功啟動(locate),或 query 變為空時,列表 MUST 關閉。
- 關閉列表本身 MUST NOT 清空 query、移除 miss fade,或取消節點選取。

#### Scenario: List shows hits with cap

- **WHEN** query 匹配 120 個節點且 result list 開啟
- **THEN** 列表顯示前 50 列 + 「70 more」;每列帶有 label、kind badge 與脈絡 subline

#### Scenario: Filter-hidden hit renders disabled with eye-slash

- **WHEN** 某 hit 的 kind 被 legend 的可見性切換(eye)隱藏,且 result list 開啟
- **THEN** 其列仍出現,為 disabled + `eye-slash` icon;點擊無任何效果(不選取、不 fit、kind 過濾狀態不變)

#### Scenario: Blur hides the result list without clearing the query

- **WHEN** query 非空、result list 開啟,且搜尋 input 失去焦點
- **THEN** result list 隱藏;query 文字、miss fade 與任何既有選取皆維持不變

#### Scenario: Focus reopens the result list when the query is non-empty

- **WHEN** query 非空、result list 已關閉,且使用者將焦點移至搜尋 input
- **THEN** result list 重新開啟,顯示目前 query 的 hit

### Requirement: Proxy hit (visual stand-in for collapsed hits)

輸入期間(任何 locate 之前),被摺疊於 collapsed 容器內的 hit MUST 在視覺上由其**最外層的 collapsed 祖先**代表:該容器保持點亮並計入 fit set。輸入 MUST NOT 自動展開任何容器——展開只透過 locate 發生。

#### Scenario: Typing lights containers without expanding

- **WHEN** query 匹配到多個位於 collapsed controller 內的 pod
- **THEN** 每個 pod 的最外層 collapsed 祖先保持點亮並加入 fit set;沒有容器被展開,佈局不動;列表仍顯示這些 pod(附 collapsed 標註)

### Requirement: Search never touches visibility or empty states

搜尋(fading)MUST NOT 改變可見性計算(kind / edge / ingress 過濾器)的輸出,且 MUST NOT 觸發 empty-state overlay:在零 hit 的 query 下每個元素仍留在 canvas 上(僅被 fade),且「All elements filtered out」/「All node types filtered」empty state MUST NOT 因搜尋而出現。

#### Scenario: Zero hits do not trigger the empty state

- **WHEN** query 沒有匹配任何節點(如隨機字元)
- **THEN** 整張圖 fade 但每個元素仍可見;沒有 empty-state overlay;列表顯示無結果訊息

### Requirement: Miss fade over the hit set alone

當 query 非空時,Graph view SHALL 將所有**非 hit** 元素淡化(**miss fade**),且僅透過切換 style class 達成:MUST NOT 移除或隱藏元素,MUST NOT 觸發佈局執行,且 MUST NOT 參與可見性計算。點亮(未 fade)的集合恰為每個 hit 的 **focus neighborhood** 之聯集——與在 canvas 上左鍵點擊該節點所點亮的集合完全相同:hit 本身、其 incident edges、其 1-hop 鄰居節點、其後代,以及上述所有元素的祖先容器(點亮的節點絕不能位於被 fade 的容器內)——proxy-hit 容器(見「Proxy hit」)以同樣方式點亮其 neighborhood。因為每條點亮 edge 的另一端點都是點亮的鄰居,點亮的 edge MUST NOT 終止於被 fade 的節點。**任何選取都不會擴大這個集合**——不論是 query 之前遺留的選取(canvas 選取在 detail panel 關閉後仍存續),或使用者最近 locate 的節點,因為 locate 會清空 query,從而直接結束 miss fade 而非擴大它。**零 hit** 的 query 產生空的點亮集合,整張圖 fade。Miss fade 與 selection-focus fade MUST **互斥**:query 非空時只套用 miss fade(focus fade 讓位);當 query 變為空——不論經由編輯、Esc、canvas 點擊或 locate——所有 miss fade 被移除,並(若存在選取)還原 focus fade。

#### Scenario: Typing fades non-hits immediately

- **WHEN** 使用者輸入的 query 使部分節點成為 hit
- **THEN** 非 hit 元素 fade;每個 hit、其 incident edges、其 1-hop 鄰居節點及它們的祖先容器保持點亮——恰為點擊該 hit 所會點亮者;在所有 hit 的 focus neighborhood 之外的元素維持 fade;沒有元素被隱藏或移動,佈局不重跑

#### Scenario: No lit edge ends in a faded node

- **WHEN** query 命中的節點,其鄰居本身並不匹配 query
- **THEN** 該鄰居節點與連接 edge 一同保持點亮——canvas 上絕不出現終止於 fade 節點的點亮 edge

#### Scenario: A selection from before the search stays faded

- **WHEN** 某節點被選取,使用者關閉 detail panel(選取存續),接著輸入一個既不匹配該節點、也不命中其任何鄰居的 query
- **THEN** 該選取節點及其 neighborhood 與其他所有 miss 一同 fade;只有各 hit 的 focus neighborhood 保持點亮

#### Scenario: Zero hits fade the whole graph

- **WHEN** query 非空且不匹配任何節點,不論是否存在有效選取
- **THEN** 每個元素都被 fade;沒有元素被隱藏,empty-state overlay 不出現

#### Scenario: Focus fade yields while searching

- **WHEN** 某節點被選取(selection-focus fade 生效中),且使用者輸入非空 query
- **THEN** canvas 僅顯示 miss fade,且完全由 hit set 驅動;selection ring 保留,但不套用 focus fade

#### Scenario: Clearing the query restores focus fade

- **WHEN** 在某節點被選取的情況下清空 query(或以 Esc 清空)
- **THEN** 所有 miss fade 被移除,selection-focus fade 立即還原(依選取節點的 neighborhood)

### Requirement: Locate (activating a result row) ends the search

啟動(點擊或 Enter)一個非 disabled 的 result SHALL 表現如同**在 canvas 上左鍵點擊該節點再加上 viewport fit**,並 SHALL 依序:(1) 若 hit 位於 collapsed 容器內,展開其 **collapsed 祖先鏈**(僅該鏈,經由既有的 collapse 狀態更新路徑——這是唯一允許改變 collapse 狀態的搜尋動作);(2) 選取該節點,**並在節點符合 detail 資格時開啟 node-detail panel**(與 canvas tap 相同路徑:highlight、pinned tooltip、detail panel 開啟——不符合 detail 資格的節點,如裝飾性的 `namespace` 群組,遵循 canvas 規則且 MUST NOT 開啟 panel);(3) fit 至該節點的 closed neighborhood(同樣的 zoom 上限);(4) **清空搜尋 query**——input 留空,MUST NOT 保留 result 的 label 或任何其他文字;(5) **關閉 result list**。

步驟 4 清空 query 時 MUST NOT 取消步驟 3 的 fit,MUST NOT 自行移動 viewport,且 MUST NOT 觸發 debounced 的 fit-to-all-hits。因為之後 query 為空,miss fade 被移除,fade 的主導權回到剛選取節點的 **focus fade**,故恰好只有該節點的 neighborhood 保持點亮。由 locate 展開的容器之後 MUST 維持展開(不自動重新摺疊)。

#### Scenario: Locate a hit inside collapsed containers

- **WHEN** 某 hit 位於 collapsed controller 內,而該 controller 又位於 collapsed application 內,使用者點擊其 result row
- **THEN** application 與 controller 依序展開(僅該鏈——其他 collapsed 容器不動),該節點被選取,若符合 detail 資格則 detail panel 開啟,且 viewport fit 至其 closed neighborhood

#### Scenario: Locate clears the query and closes the list

- **WHEN** 使用者啟動一個非 disabled、label 為 `mongodb-replica-0` 的 result
- **THEN** 搜尋 input 變為空,result list 關閉,且該節點被選取(locate 步驟 1–3 仍然執行)

#### Scenario: Locate lights only the located node's neighborhood

- **WHEN** query `gateway` 匹配多個節點(如一個 `gateway` pod,加上整個 `mesh-gateway` application、controller 與 pod),且使用者 locate 該 `gateway` pod
- **THEN** 只有 `gateway` pod 的 focus neighborhood 保持點亮——其他先前的 hit、它們的 incident edges,以及每條另一端點被 fade 的 edge 也都被 fade

#### Scenario: Locate opens the detail panel like a canvas node tap

- **WHEN** 使用者啟動一個非 disabled、且節點符合 detail 資格(如 pod)的 result
- **THEN** node-detail panel 開啟,且帶有與 canvas 左鍵點擊相同的選取副作用(highlight + 右上角 pinned tooltip)

#### Scenario: Locate of a non–detail-eligible node does not open the panel

- **WHEN** 使用者啟動一個可選取但不符合 detail 資格的 result(如裝飾性的 `namespace` 群組)
- **THEN** 選取(與 collapse cue 行為)依 canvas 規則套用,但 node-detail panel MUST NOT 開啟

#### Scenario: Expansion survives locate

- **WHEN** locate 為了抵達其 hit 而展開了某容器
- **THEN** query 清空後該容器維持展開;只有 fade 改變,且 viewport 保持 locate 所執行的 fit

### Requirement: Keyboard interaction inside the search input (arrows, Enter, Esc)

當 input 取得焦點時:`↑` / `↓` SHALL 在 result list 開啟時移動 highlight 游標,**跳過 disabled 列**,並隨之捲動(scroll-follow);`Enter` SHALL 在存在 highlight 列時 locate 該列(與點擊相同步驟:符合 detail 資格則開啟 detail、fit、清空 query、關閉列表),否則立即 fit 至所有 hit(不等待 debounce);`Esc` SHALL 為兩段式——第一次按下清空 query(移除 fade、關閉列表、viewport 停留原處),第二次按下(query 已為空)使 input 失去焦點。這些鍵盤事件 MUST NOT 冒泡至 app shell / document(避免觸發任何 app 層級的 Esc / 快捷鍵行為)。

#### Scenario: Arrow keys skip disabled rows

- **WHEN** 開啟的列表為 [hit A, 被過濾器隱藏的 B, hit C],游標在 A,使用者按下 `↓`
- **THEN** 游標跳至 C(跳過 B)

#### Scenario: Enter locates highlighted row and clears the query

- **WHEN** 某非 disabled 列處於 highlight 且使用者按下 `Enter`
- **THEN** 對該列執行 locate,input 值變為空,且 result list 關閉

#### Scenario: Enter with no cursor fits immediately

- **WHEN** 使用者快速輸入並在 debounce 觸發前按下 `Enter`,且沒有 highlight 列
- **THEN** viewport 立即 fit 至所有 hit,不等待 debounce

#### Scenario: Two-stage Esc

- **WHEN** query 非空時按下 `Esc`
- **THEN** query 清空,result list 關閉,fade 被移除(viewport 停留原處);input 保持焦點
- **WHEN** query 已為空時再次按下 `Esc`
- **THEN** input 失去焦點;事件不冒泡至 app shell

### Requirement: Canvas interaction and locate clear search

當使用者經由 **graph canvas** 改變選取(node tap、background tap、edge tap,或不可選取的 cluster backplate——即任何 canvas 上的選取變更)且搜尋 query 非空時,Graph view SHALL 清空 query,效果與 Esc 清空相同:移除 miss fade、關閉 result list、**viewport 停留原處**。該次點擊帶來的 canvas 選取 / 取消選取 MUST 仍正常套用。**Locate** SHALL 同樣清空 query(見「Locate (activating a result row) ends the search」);它與 canvas tap 的差別僅在於先展開 collapsed 祖先鏈,再將 viewport fit 至被 locate 節點的 closed neighborhood。Detail panel 關閉與 legend 切換 MUST NOT 清空搜尋。

#### Scenario: Canvas node tap clears search

- **WHEN** query 非空且使用者在 canvas 上 tap 某節點
- **THEN** query 清空,miss fade 移除,result list 關閉,viewport 停留原處,且該節點被選取(符合 detail 資格則 detail 開啟)

#### Scenario: Canvas background tap clears search

- **WHEN** query 非空且使用者 tap graph 背景(或 edge / cluster backplate)
- **THEN** query 清空,miss fade 移除,且依既有的取消選取規則清除選取

#### Scenario: Locate clears search but still fits

- **WHEN** 使用者啟動一個非 disabled、label 為 `mongodb-replica-0` 的 result
- **THEN** query 清空方式與 canvas tap 完全相同,而與 canvas tap 不同的是 viewport 會 fit 至該節點的 closed neighborhood
