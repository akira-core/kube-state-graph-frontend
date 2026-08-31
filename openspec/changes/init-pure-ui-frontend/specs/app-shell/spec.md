## Purpose

定義 SPA 的進入點與全域框架:啟動序列(設定載入閘門 → 錯誤畫面或應用)、Graph / Sankey 視圖的 client-side 路由與 deep link、持續顯示的頂部導覽列(視圖切換、主題、重新載入、狀態與 demo 標示)、填滿視窗的視圖區、由 shell 一次載入並供兩視圖共用的 graph 資料、跨視圖保留的暫時性視圖狀態,以及基本無障礙。視圖內部行為不在此規範。

## ADDED Requirements

### Requirement: 啟動序列與設定閘門

應用進入點 SHALL 依序經歷三個階段:(1) **載入中畫面**——設定文件取得與驗證期間顯示,僅含最小的載入指示,不含導覽列與任何視圖;(2) 設定失敗時切換為 `runtime-config` 規範的**設定錯誤畫面**;(3) 設定成功時渲染**應用**(導覽列 + 路由對應的視圖)。導覽列、任一視圖與任何後端資料請求 MUST NOT 早於設定載入完成出現或發出。載入中畫面與設定錯誤畫面 MUST 依主題規則呈現(見「主題切換與持久化」)。

#### Scenario: 設定成功後進入應用

- **WHEN** 使用者開啟 `/graph`,設定文件於 300ms 後成功取得並驗證通過
- **THEN** 該 300ms 內僅顯示載入中畫面;之後導覽列與 Graph 視圖出現,graph 資料請求在此時才發出

#### Scenario: 設定失敗只顯示錯誤畫面

- **WHEN** 設定文件取得失敗或驗證失敗
- **THEN** 應用顯示設定錯誤畫面,不渲染導覽列與任何視圖,且整個 session 不發出任何 graph 資料請求

#### Scenario: 設定載入前不取數

- **WHEN** 設定文件的回應尚未抵達
- **THEN** 應用尚未對任何 `endpoints.*` 發出請求

### Requirement: 視圖路由

應用 SHALL 提供下列 client-side 路由,路徑皆相對於 app base URL(部署於 `/ksg/` 時為 `/ksg/graph` 等):

- `/graph` → Graph 視圖(cytoscape.js canvas,行為見 `graph-view`)。
- `/sankey` → Sankey 視圖(行為見 `storage-flow-sankey`)。
- `/` → MUST 以取代歷史紀錄(replace)的方式導向 `/graph`,使「上一頁」不會回到 `/`。
- 其他任何路徑 → **找不到頁面**畫面,顯示於導覽列之下的視圖區,含一個返回 `/graph` 的連結;導覽列於此畫面仍持續顯示。

結尾斜線 MUST 視為等價(`/graph/` 等同 `/graph`)。視圖間切換 MUST 為 client-side 導覽:MUST NOT 觸發完整文件載入,MUST NOT 重新讀取設定文件。瀏覽器分頁標題 SHALL 反映目前視圖(含應用名稱與視圖名稱)。

#### Scenario: 根路徑導向 Graph 視圖

- **WHEN** 使用者開啟 `/`
- **THEN** 位址列變為 `/graph`,顯示 Graph 視圖,且按「上一頁」不會回到 `/`

#### Scenario: 開啟 Sankey 視圖

- **WHEN** 使用者開啟 `/sankey` 或在導覽列點擊 Sankey 連結
- **THEN** 視圖區顯示 Sankey 視圖,位址列為 `/sankey`

#### Scenario: 未知路徑顯示找不到頁面

- **WHEN** 使用者開啟 `/foo/bar`
- **THEN** 視圖區顯示找不到頁面畫面,含返回 `/graph` 的連結,導覽列仍顯示;點擊該連結後顯示 Graph 視圖

#### Scenario: 視圖切換不重新載入文件

- **WHEN** 使用者在 `/graph` 點擊導覽列的 Sankey 連結
- **THEN** 不發生完整文件載入,不重新請求設定文件,Sankey 視圖立即以已載入的資料渲染

### Requirement: Deep link 與瀏覽歷史

任一路由的 URL MUST 可直接開啟與重新整理:使用者於 `/sankey` 按重新整理後 MUST 再次看到 Sankey 視圖(而非 404 或 Graph 視圖)。此行為依賴伺服器對未知路徑回應 `index.html` 的 history fallback(正式環境由 `container-deployment` 提供,開發伺服器亦 MUST 提供)。瀏覽器「上一頁 / 下一頁」MUST 在 Graph 與 Sankey 視圖間依歷史順序切換,且同樣不觸發完整文件載入。

#### Scenario: 於 Sankey 視圖重新整理

- **WHEN** 使用者在 `/sankey` 按重新整理
- **THEN** 應用重新啟動(重新讀取設定、重新載入 graph 資料)並顯示 Sankey 視圖

#### Scenario: 分享 deep link

- **WHEN** 使用者直接在新分頁開啟 `https://ops.example/ksg/sankey`
- **THEN** 顯示 Sankey 視圖

#### Scenario: 上一頁回到前一視圖

- **WHEN** 使用者由 `/graph` 切至 `/sankey` 後按「上一頁」
- **THEN** 顯示 Graph 視圖,位址列為 `/graph`,不發生完整文件載入

### Requirement: 頂部導覽列

應用 SHALL 於視圖區上方持續顯示一列固定高度、不隨內容捲動的導覽列;在 Graph 視圖、Sankey 視圖與找不到頁面畫面皆存在。**唯一的例外是 Sankey 視圖的專注模式**(見 `storage-flow-sankey` 的「專注模式」):其啟用期間導覽列 MUST 收起以讓圖填滿視窗,離開專注模式後 MUST 立即回復。除此之外任何情況 MUST NOT 隱藏導覽列。導覽列 MUST 含:

1. 應用名稱;
2. Graph 與 Sankey 兩個視圖連結,對應目前路由者 MUST 呈現 active 樣式並標示為目前頁面;
3. 主題切換控制(見「主題切換與持久化」);
4. 「重新載入資料」動作(見「重新載入動作與狀態指示器」);
5. 狀態指示器(見「重新載入動作與狀態指示器」);
6. 僅當 `demoMode` 為 `true` 時顯示的 **demo 模式標記**,文字明確指出資料為內建 demo 資料;`demoMode` 為 `false` 時該標記 MUST NOT 存在於 DOM。

#### Scenario: 目前視圖的連結呈現 active

- **WHEN** 使用者位於 `/sankey`
- **THEN** 導覽列的 Sankey 連結呈現 active 樣式並標示為目前頁面,Graph 連結則否

#### Scenario: demo 模式標記

- **WHEN** 設定的 `demoMode` 為 `true`
- **THEN** 導覽列顯示 demo 模式標記,且於 Graph 與 Sankey 視圖切換時持續顯示

#### Scenario: 非 demo 模式無標記

- **WHEN** 設定的 `demoMode` 為 `false`
- **THEN** 導覽列不含 demo 模式標記

#### Scenario: Sankey 專注模式收起導覽列

- **WHEN** 使用者於 Sankey 視圖進入專注模式,隨後離開
- **THEN** 進入期間導覽列不顯示、Sankey 圖區填滿視窗;離開後導覽列立即回復,其 active 連結、主題切換與狀態指示器均維持進入前的狀態

### Requirement: 主題切換與持久化

導覽列的主題切換控制 SHALL 提供 `dark` / `light` / `system` 三個選項。有效主題的決定順序 MUST 為:瀏覽器本機保存的使用者選擇(若有)→ 設定文件的 `theme` → `system`。使用者一旦選擇,該選擇 MUST 保存於瀏覽器本機、跨重新整理與新分頁沿用,並優先於設定文件的 `theme`。`system` MUST 跟隨作業系統的 dark / light 偏好,且偏好改變時 MUST 即時套用,無需重新整理。

有效主題 MUST 套用至整個應用:導覽列、Graph 視圖(含 canvas 樣式)、Sankey 視圖、所有 overlay(hover tooltip、pinned card、node detail 面板、搜尋結果清單、legend、選單)、找不到頁面畫面、載入中畫面與設定錯誤畫面。載入中畫面與設定錯誤畫面出現時設定尚不可用,MUST 以「瀏覽器本機保存的使用者選擇 → `system`」決定主題。

切換主題 MUST NOT 重新載入資料、MUST NOT 重置任何視圖狀態(選取、collapse、viewport、篩選、搜尋)、MUST NOT 重建 Graph 視圖的 canvas;既有元素 MUST 就地換色。

#### Scenario: 使用者選擇持久化並優先於設定

- **WHEN** 設定文件 `theme` 為 `"light"`,使用者於導覽列選擇 `dark` 後重新整理頁面
- **THEN** 重新整理後應用以 dark 主題呈現(含載入中畫面)

#### Scenario: 無使用者選擇時採用設定值

- **WHEN** 瀏覽器無保存的主題選擇,設定文件 `theme` 為 `"light"`
- **THEN** 應用以 light 主題呈現,主題切換控制顯示目前為 `light`

#### Scenario: system 跟隨作業系統偏好

- **WHEN** 有效主題為 `system`,作業系統由 light 切換為 dark
- **THEN** 應用立即改以 dark 主題呈現,無需重新整理

#### Scenario: 主題套用至 overlay

- **WHEN** 使用者於 Graph 視圖開啟 node detail 面板與 pinned card 後切換主題
- **THEN** 導覽列、canvas、detail 面板與 pinned card 皆同時改為新主題

#### Scenario: 切換主題保留視圖狀態

- **WHEN** 使用者於 Graph 視圖選取一個節點、收合一個容器並輸入搜尋字串後切換主題
- **THEN** 選取、collapse 狀態、搜尋字串與 viewport 位置皆不變,且未發出任何資料請求

### Requirement: 檢視時間範圍(view time range)

導覽列 SHALL 提供一個**檢視時間範圍**控制,選項為相對區間 `1h` / `6h` / `24h` / `7d` 與一個自訂的絕對區間(起訖各為一個時刻)。預設 MUST 為 `24h`。使用者的選擇 MUST 保存於瀏覽器本機、跨重新整理與新分頁沿用;它 MUST NOT 被寫入 URL,亦 MUST NOT 被寫入 runtime config。相對區間 MUST 於每次被讀取時就地換算為當下的絕對起訖(`from` = 現在減去該長度,`to` = 現在),而非於選取當下凍結。

檢視時間範圍是 graph 查詢的時間視窗,也是 node detail 的 Dashboard 查詢的時間視窗:graph 查詢 MUST 以它組出 `start` / `end`(Unix 秒,見 `graph-data-source`)——上游 `GET /v1/graph` 缺任一者即以 400 拒絕,故該視窗不是選用的裝飾;Dashboard 查詢 MUST 以它組出 `from_time` / `to_time`(Unix 秒,見 `node-detail`)。change history 查詢(`endpoints.codeChanges` / `endpoints.configChanges`)MUST NOT 帶時間參數。

變更檢視時間範圍 MUST 以新視窗對 `endpoints.graph` 重新取數(舊視窗的結果已不代表所選區間),並 MUST 即時反映於後續的 Dashboard 查詢;它 MUST NOT 對 change history 端點發出請求。該次重新取數 MUST 走與「重新載入」相同的路徑(見「共用 graph 資料與載入生命週期」):既有圖於請求進行中持續可見,不重跑佈局,且 MUST NOT 重置任何視圖狀態(選取、collapse、viewport、篩選、搜尋)。該控制 MUST 可經鍵盤到達與啟動,並具有可存取名稱。

#### Scenario: 預設為 24h 且選擇跨重新整理沿用

- **WHEN** 使用者首次開啟應用
- **THEN** 檢視時間範圍控制顯示 `24h`
- **AND** 使用者改選 `6h` 並重新整理頁面後,控制仍顯示 `6h`

#### Scenario: 相對區間於讀取時換算為當下

- **WHEN** 檢視時間範圍為 `1h`,使用者選取某節點並觸發其 Dashboard 查詢
- **THEN** 該查詢的 `from_time` / `to_time` 為「查詢當下減一小時」至「查詢當下」的 Unix 秒,而非選取該區間當時所凍結的值

#### Scenario: 變更範圍以新視窗重新取數

- **WHEN** 使用者將檢視時間範圍自 `24h` 改為 `1h`
- **THEN** 應用對 `endpoints.graph` 發出一次新請求,其 `start` / `end` 為「現在減一小時」至「現在」的 Unix 秒
- **AND** 不對 `endpoints.codeChanges` / `endpoints.configChanges` 發出任何請求
- **AND** 請求進行中既有圖持續可見,完成後目前的選取、collapse、viewport、篩選與搜尋狀態皆不變

#### Scenario: 不寫入 URL 或 runtime config

- **WHEN** 使用者改選 `7d`
- **THEN** 瀏覽器網址列不出現任何時間範圍相關參數,且應用不寫入 runtime config

### Requirement: 共用 graph 資料與載入生命週期

graph 資料 SHALL 由 shell 於設定載入完成後取得一次(取數與正規化行為見 `graph-data-source`),並將同一份正規化結果提供給 Graph 與 Sankey 兩視圖。視圖切換 MUST NOT 觸發重新取數、MUST NOT 重新正規化;兩視圖 MUST 立即以 shell 持有的資料渲染。shell MUST 向視圖提供資料狀態:載入中、就緒、錯誤(含訊息)、最後一次成功載入的時間;各狀態在視圖內的呈現由各視圖規範。

資料重新載入(手動或自動)期間,MUST 持續顯示先前成功載入的資料,不得清空視圖;重新載入失敗時 MUST 保留先前資料並於狀態指示器顯示錯誤,MUST NOT 以錯誤畫面取代既有視圖。首次載入失敗時無先前資料,視圖依其錯誤狀態呈現。

#### Scenario: 視圖切換不重新取數

- **WHEN** graph 資料已載入,使用者於 Graph 與 Sankey 視圖間來回切換三次
- **THEN** 整個過程不發出任何 `endpoints.graph` 請求,兩視圖皆以同一份資料渲染,且不出現載入中狀態

#### Scenario: 重新載入期間保留舊資料

- **WHEN** graph 資料已載入,使用者觸發重新載入且新請求進行中
- **THEN** 視圖持續顯示既有資料,狀態指示器顯示載入中

#### Scenario: 重新載入失敗保留舊資料

- **WHEN** 重新載入的請求回應 HTTP 500
- **THEN** 視圖仍顯示先前成功載入的資料,狀態指示器呈現錯誤狀態並可讀到錯誤訊息,不顯示設定錯誤畫面

#### Scenario: 重新載入後兩視圖同步更新

- **WHEN** 使用者於 Sankey 視圖觸發重新載入且成功
- **THEN** Sankey 視圖以新資料重繪;切換至 Graph 視圖時亦為新資料,且不再發出請求

### Requirement: 重新載入動作與狀態指示器

導覽列的「重新載入資料」動作 SHALL 立即觸發一次 graph 資料重新取得;請求進行中時該動作 MUST 呈現進行中狀態並 MUST NOT 發出第二個並行請求。`demoMode` 為 `true` 時,此動作 MUST 以同一份 fixture 重新產生資料而不發出網路請求。

當設定的 `refreshIntervalSeconds` 大於 `0` 時,shell SHALL 每隔該秒數自動觸發一次重新載入;若前一次請求仍在進行中,該次 tick MUST 略過;手動重新載入 MUST 重新計時。`refreshIntervalSeconds` 為 `0` 時 MUST NOT 自動刷新。

狀態指示器 MUST 顯示:載入中時的載入指示;就緒時最後一次成功載入的時間(以使用者本地時間呈現);錯誤時的錯誤狀態,且錯誤訊息 MUST 可經由指示器讀取(例如展開或 tooltip);自動刷新啟用時 MUST 標示其間隔。

#### Scenario: 手動重新載入

- **WHEN** 使用者點擊「重新載入資料」
- **THEN** 應用發出恰好一次 graph 資料請求;成功後狀態指示器更新為新的最後載入時間

#### Scenario: 進行中不重複發送

- **WHEN** 重新載入請求進行中,使用者再次點擊「重新載入資料」
- **THEN** 不發出額外請求,動作維持進行中狀態直到現有請求完成

#### Scenario: 自動刷新

- **WHEN** `refreshIntervalSeconds` 為 `30`
- **THEN** 應用約每 30 秒發出一次 graph 資料請求,狀態指示器標示自動刷新為 30s;手動重新載入後下一次自動刷新自該時間點起算 30 秒

#### Scenario: 自動刷新關閉

- **WHEN** `refreshIntervalSeconds` 為 `0`
- **THEN** 應用僅於啟動與手動重新載入時取數,狀態指示器不標示自動刷新

#### Scenario: demo 模式重新載入

- **WHEN** `demoMode` 為 `true`,使用者點擊「重新載入資料」
- **THEN** 不發出任何網路請求,資料以 fixture 重新產生,狀態指示器更新最後載入時間

### Requirement: 視圖區填滿剩餘視窗高度並響應尺寸

導覽列之下的視圖區 MUST 填滿視窗扣除導覽列後的全部剩餘高度與全部寬度;頁面本身 MUST NOT 出現整頁捲軸。Graph 與 Sankey 視圖 MUST 依視圖區尺寸繪製;視窗尺寸改變時視圖區 MUST 隨之改變,且視圖 MUST 重新適配(Graph 視圖的 canvas 重新調整並 fit;Sankey 視圖以 `viewBox` 等比重新適配,**不重新佈局** —— 見 `storage-flow-sankey` 的「尺寸與容器 resize」),內容不得被裁切至視圖區之外。**唯一例外**:Sankey 使用者已建立的圖內縮放平移視角 MUST 被保留,即使該視角使部分內容落於可視範圍外 —— 視窗縮放 MUST NOT 重置使用者的圖內視角。**由 app 內部配置改變(而非視窗尺寸改變)所導致的視圖區尺寸變化 —— 如視圖自隱藏切回可見 —— MUST 只使 Graph 視圖重算 canvas 尺寸,MUST NOT 重新 fit:該視圖切走前的 zoom 與 pan MUST 被保留(見 `graph-view` 的「容器尺寸響應」需求)。**

#### Scenario: 視圖區高度等於視窗扣除導覽列

- **WHEN** 視窗高度為 900px,導覽列高度為 48px
- **THEN** 視圖區高度為 852px、寬度等於視窗寬度,且頁面無整頁捲軸

#### Scenario: 縮放視窗後視圖重新適配

- **WHEN** 使用者將視窗由 1600×900 縮至 1000×700
- **THEN** 視圖區隨之縮小,目前視圖以新尺寸重繪且全部內容仍在可視範圍內;若 Sankey 存在使用者自訂的圖內縮放平移視角,則維持該視角而不強制全圖可見

### Requirement: 跨視圖保留各視圖的暫時狀態

各視圖的暫時狀態 SHALL 在同一 session 內於視圖切換時保留:Graph 視圖的選取、collapse 集合、篩選(kind / edge type / ingress 可見性)、pod-parent mode、搜尋字串、legend 收合狀態;Sankey 視圖的 mode selector、cluster selector 與縮放平移視角(Sankey MUST NOT 持有持久的選取狀態,見 `storage-flow-sankey`;專注模式則於切走視圖時解除)。使用者離開再返回某視圖時,MUST 見到離開時的狀態。

上述狀態 MUST NOT 持久化至瀏覽器本機儲存,MUST NOT 寫入 URL(路由路徑 MUST 維持精確的 `/graph` / `/sankey`,無 query string、無 hash);完整重新整理後 MUST 全部回到初始值(其中 Graph 視圖的佈局演算法初始值來自設定的 `defaultLayout`)。資料重新載入 MUST NOT 主動清除這些狀態;資料改變後個別狀態如何對應(例如被選取的節點已不存在)由各視圖規範。

#### Scenario: Graph 視圖狀態跨切換保留

- **WHEN** 使用者於 Graph 視圖選取節點 `pod-a`、收合容器 `deploy-x`、切換至 `node` pod-parent mode、收合 legend,然後切至 Sankey 視圖再返回 Graph 視圖
- **THEN** `pod-a` 仍為選取、`deploy-x` 仍收合、pod-parent mode 仍為 `node`、legend 仍收合

#### Scenario: Sankey 視圖狀態跨切換保留

- **WHEN** 使用者於 Sankey 視圖切換模式並選取一個節點,切至 Graph 視圖再返回
- **THEN** Sankey 視圖的模式與選取不變

#### Scenario: 狀態不寫入 URL 與本機儲存

- **WHEN** 使用者於 Graph 視圖進行任意選取、收合、篩選與搜尋
- **THEN** 位址列始終為 `/graph`(無 query string、無 hash),且瀏覽器本機儲存中不存在任何視圖狀態

#### Scenario: 重新整理後回到初始狀態

- **WHEN** 使用者於 Graph 視圖建立選取與 collapse 狀態後完整重新整理
- **THEN** Graph 視圖以初始狀態呈現:無選取、預設 collapse、預設篩選、預設 pod-parent mode、空搜尋、legend 展開,佈局演算法為設定的 `defaultLayout`

### Requirement: Shell 不註冊全域鍵盤快捷鍵

shell MUST NOT 於 `document` / `window` 層級註冊任何鍵盤快捷鍵;導覽列的所有控制 MUST 僅以標準的焦點導覽(Tab / Shift+Tab)與啟動鍵(Enter / Space)操作。視圖內部元件的鍵盤行為由各視圖規範,且 shell MUST NOT 攔截或改寫傳往視圖與其輸入欄位的按鍵事件。

#### Scenario: 無焦點時按鍵無效果

- **WHEN** 焦點位於頁面本體(無任何控制取得焦點),使用者按下任意字母鍵或功能鍵
- **THEN** 應用不切換視圖、不切換主題、不重新載入資料,亦無其他 shell 層級反應

#### Scenario: 輸入欄位按鍵不被攔截

- **WHEN** 焦點位於 Graph 視圖的搜尋輸入欄,使用者輸入任意字元
- **THEN** 字元正常進入輸入欄,shell 不消耗該事件

### Requirement: 無障礙基礎

導覽列 MUST 為具有可存取名稱的 navigation landmark;視圖區 MUST 為 main landmark。目前視圖的連結 MUST 以標準方式標示為目前頁面。所有導覽列控制 MUST 可經鍵盤到達與啟動;以鍵盤取得焦點時 MUST 顯示清晰可見的焦點框,且在 dark 與 light 主題下皆與背景有足夠對比。僅含圖示的控制(主題切換、重新載入)MUST 具有可存取名稱;主題切換控制 MUST 揭露目前選項;狀態指示器與 demo 標記的內容 MUST 為可被輔助科技讀取的文字。

#### Scenario: Landmark 存在

- **WHEN** 輔助科技列舉頁面 landmark
- **THEN** 找到一個具名的 navigation landmark(導覽列)與一個 main landmark(視圖區)

#### Scenario: 鍵盤焦點可見

- **WHEN** 使用者以 Tab 鍵依序移動焦點至導覽列各控制
- **THEN** 每個取得焦點的控制皆顯示可見的焦點框,且在 dark 與 light 主題下皆清楚可辨

#### Scenario: 圖示控制具名稱

- **WHEN** 輔助科技讀取主題切換與重新載入控制
- **THEN** 兩者皆有描述其功能的可存取名稱,主題切換並揭露目前為 `dark` / `light` / `system` 之一
