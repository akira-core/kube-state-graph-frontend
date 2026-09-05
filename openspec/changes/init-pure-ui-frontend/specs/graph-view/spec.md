## Purpose

Graph 視圖以 cytoscape.js canvas 呈現 kube-state-graph 後端回傳的 Kubernetes 資源拓樸:節點以 kind → icon 編碼、邊以 edge type 配色、status 外框、compound 容器與 collapse、fcose / dagre 佈局、legend 與過濾、hover tooltip、pinned card、選取與 focus fade、dark / light 主題適配,以及空 / 載入 / 錯誤狀態。本 capability 自 Grafana panel 的 `panel-rendering` 與 `node-icon-encoding` 移植,去除 Grafana theme 與 panel option 依賴,改由 runtime config(`defaultLayout`、`theme`)與 app 自有 view state 驅動。

## ADDED Requirements

### Requirement: Cytoscape 畫布渲染與佈局演算法

Graph 視圖 SHALL 透過 cytoscape.js 在指定 DOM 容器中渲染 nodes 與 edges。初始佈局演算法 MUST 取自 runtime config 的 `defaultLayout`(`fcose` | `dagre`,缺值時為 `fcose`)。Graph 視圖 MUST 提供一個 in-app 控制項(兩選項的 segmented control:`fcose` / `dagre`)供使用者於執行期切換佈局演算法;該切換為 ephemeral view state,不寫回 runtime config、不跨 reload 保存。當使用者切換佈局時,系統 MUST 於同一 cytoscape instance 重新佈局而不重建 instance。

#### Scenario: 預設 layout 顯示節點與邊

- **WHEN** Graph 視圖自 `endpoints.graph`(或 `demoMode` 下的 bundled fixture)取得 ≥1 個 node 與 ≥1 個 edge 的資料,且 runtime config 未設定 `defaultLayout`
- **THEN** cytoscape canvas 顯示對應數量的節點與邊,佈局為 fcose,且無 console 錯誤或警告

#### Scenario: runtime config 指定 dagre 為預設佈局

- **WHEN** runtime config 的 `defaultLayout` 為 `dagre`
- **THEN** Graph 視圖初次渲染即以 dagre 佈局,且 in-app 佈局控制項顯示 `dagre` 為當前選項

#### Scenario: Layout 切換不重建 instance

- **WHEN** 使用者於 in-app 佈局控制項將 layout 從 `fcose` 切換為 `dagre`
- **THEN** 同一 cytoscape instance 先停止進行中的動畫,再以 `dagre` 執行新佈局;節點透過動畫過渡到新位置;instance 引用不變

### Requirement: Edge 依 relationship type 配色

系統 SHALL 以單一 edge 樣式表(`EDGE_STYLE_BY_TYPE`)將每種 edge type(`EdgeType`)對應至獨特的顏色與線型,且該表 MUST 由 stylesheet 與 legend 共用。`EdgeType` 涵蓋後端發出的 8 種 edge type —— `pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr` / `switch-to-switch` / `node-to-switch` —— **全部皆為後端發出**。採用後端 D6 階層後,前端不再合成 `pod-runs-on-node`(由後端 `pod-to-node` 邊取代)與 `controller-owns-pod`(後端直接發出 controller 群組,前端不再自 pod 的 `data.owner` 合成此邊,見 `graph-data-source`)。`pod-to-node`(`pod → node`)MUST 以藍色 `#3b82f6` 實線繪製;`pvc-to-netapp-aggr`(`pvc → netapp-aggr`)MUST 以 storage 紫 `#8b5cf6` 實線繪製,且該色 MUST 與 `pod-mounts-pvc` 的 `#a855f7` **刻意區分**,使兩條 storage 邊可辨。`pod-calls-service` 與 `service-selects-pod` MUST 與 `pod-calls-pod` 共用**同一橘色 `#f97316`**(pod → service → pod 一跳本質上仍是 pod 對 pod 的關係,只是中間經過 Service),且這兩種 service 類型 MUST **自 edge legend 省略**(無自己的列、亦無額外合併列),改由單一 `pod-calls-pod` 列代表,該列渲染為 `pod ↔ pod/service`(雙向箭頭 glyph)以標示其涵蓋直接與經 Service 的 pod 對 pod 關係(見「Legend」需求)。所有邊皆為實線,方向由**箭頭**表達。`switch-to-switch` 與 `node-to-switch`(後端 v0.0.18 的 physical-network fabric)MUST **共用同一 infra 色與同一實線線型**,並採相同的正交(`taxi`)routing(見 `switch-tier-layout`),使兩者視覺上完全相同 —— `node-to-switch` 不再使用獨立的 indigo 或 bézier,僅以端點(`<node> → <switch>` vs `<switch> → <switch>`)區分,讓 K8s node 的 uplink 讀起來是 switch fabric 的一部分。系統 MUST 同時提供每種 edge type 的 source / target `NodeKind` 端點表(`EDGE_ENDPOINTS_BY_TYPE`),使 legend 能以 `<from> → <to>` 呈現 edge type;`pod-to-node` 的端點 MUST 為 `<pod> → <node>`、`pvc-to-netapp-aggr` 為 `<pvc> → <netapp-aggr>`、`switch-to-switch` 為 `<switch> → <switch>`、`node-to-switch` 為 `<node> → <switch>`。

#### Scenario: 已知 edge type 對應正確顏色

- **WHEN** 邊的資料帶有 `edgeType: 'pod-to-node'`(或任一其他已定義類型)
- **THEN** 該邊以對應的顏色與線型渲染(`pod-to-node` 為藍色 `#3b82f6` 實線),與 edge 樣式表的定義一致

#### Scenario: 兩條 storage 邊以不同紫色區分

- **WHEN** 圖中同時存在 `pod-mounts-pvc` 與 `pvc-to-netapp-aggr` 邊
- **THEN** `pod-mounts-pvc` 以 `#a855f7`、`pvc-to-netapp-aggr` 以 `#8b5cf6` 渲染 —— 刻意相異,使兩條 storage 邊可辨

#### Scenario: Edge 顏色不與 status 顏色衝突

- **WHEN** 檢視 `EDGE_STYLE_BY_TYPE` 中任一 edge type 的顏色
- **THEN** 該色 MUST NOT 等於 `STATUS_COLOR` 的任一值(綠 `#73BF69` / 黃 `#F2CC0C` / 紅 `#E02F44`)—— `pod-to-node` 的 `#3b82f6`、`pvc-to-netapp-aggr` 的 `#8b5cf6`、service 邊的橘 `#f97316` 皆滿足此條件

#### Scenario: node-to-switch 與 switch-to-switch 外觀相同

- **WHEN** 圖中同時存在 `node-to-switch` 與 `switch-to-switch` 邊
- **THEN** 兩者以相同 infra 色、相同實線線型、相同 `taxi` 正交 routing 渲染(僅端點不同);`node-to-switch` 不再以獨立 indigo 或 bézier 出現

#### Scenario: 未知 edge type 走 fallback

- **WHEN** 邊的 `edgeType` 不在對照表中
- **THEN** 該邊以灰色實線 fallback 渲染,不拋出任何例外

### Requirement: App 主題適配

Graph 視圖 SHALL 依 app 當前 theme(dark / light)動態產生 cytoscape stylesheet。初始 theme 由 runtime config 的 `theme`(`dark` | `light` | `system`,預設 `system`;`system` 跟隨 OS `prefers-color-scheme`)與 app-shell 的主題切換共同決定(見 `app-shell`)。當 theme 變更時,Graph 視圖 MUST 在不重建 cytoscape instance 的前提下即時更新樣式。

#### Scenario: Theme 切換不重建 instance

- **WHEN** 使用者於 app-shell 切換 dark ↔ light theme(或 `theme` 為 `system` 時 OS 偏好改變)
- **THEN** Graph 視圖以新 theme 的 token 重算 stylesheet 並套用至既有 instance;instance 引用不變;節點、邊、label 與背景色隨主題改變

### Requirement: 容器尺寸響應

Graph 視圖 SHALL 監聽 cytoscape 容器的尺寸變化,並以 debounce(預設 100ms)觸發 canvas resize,使 canvas 的繪圖區與新的容器尺寸一致。

**resize 與 fit 是兩件事,MUST 分開判定:**

- `cy.resize()` MUST 於**每一次**容器尺寸變化後執行 —— 這只是讓 canvas 認得新尺寸,不改變 viewport 的 pan / zoom。
- `cy.fit()`(含 padding)MUST **僅於瀏覽器視窗尺寸變化所導致的容器尺寸變化**時執行。由 app 內部配置改變所導致的容器尺寸變化(legend 收合 / 還原、視圖切換回可見、其他面板開闔)MUST NOT 觸發 fit。

理由:fit 會覆寫使用者當前的 pan / zoom。使用者為了細看某處而縮放後,收合 legend 只是想要更多畫面空間,不是要求重新取景;把兩者都當成 fit 的理由會沖掉使用者刻意建立的視角。視窗縮放則是外部環境改變,重新取景是合理預期。

視圖自隱藏切回可見時的尺寸重算(見 `app-shell`)MUST 依同一規則:執行 resize,MUST NOT fit —— 該視圖先前的 viewport MUST 被保留。

#### Scenario: 視窗縮放後 resize 並 fit

- **WHEN** 使用者縮放瀏覽器視窗,使 canvas 區域尺寸改變
- **THEN** 系統在 debounce 後執行 canvas resize 與 fit,所有節點仍在可視範圍內

#### Scenario: 收合 legend 只 resize 不 fit,保留使用者視角

- **WHEN** 使用者先縮放 / 平移至某個區域,再收合 legend 使 canvas 區域寬度變寬
- **THEN** 系統在 debounce 後執行 canvas resize,但 MUST NOT fit —— 當前的 zoom 與 pan 維持不變,使用者原本檢視的區域仍在原處(只是可視範圍變寬)

#### Scenario: 切回 Graph 視圖只 resize 不 fit

- **WHEN** 使用者自 Graph 視圖切至 Sankey 視圖再切回,期間視窗尺寸未變
- **THEN** 系統對 canvas 執行 resize,但 MUST NOT fit —— 切走前的 zoom 與 pan 被保留

### Requirement: 互動與選取狀態

Graph 視圖 SHALL 支援節點的 click-to-select,透過 cytoscape 內建的 `:selected` 樣式呈現選取狀態,並將所選節點的 id 對外公開為 Graph 視圖的選取狀態,供其他元件(node detail panel、pinned card、search、視圖互通)消費。

**選取(selection)與 detail panel 是否開啟(detail open)MUST 為兩個彼此獨立的狀態。** 選取驅動 cytoscape 單一選取高亮、selection-focus fade、右上角 pinned tooltip(位於搜尋列下方,見 `graph-search`);detail panel 是否開啟則為純 UI 狀態,關閉 detail panel MUST NOT 清除選取(detail panel 內容見 `node-detail`)。取消選取**恰有三條路徑**:點擊背景、點擊邊、或點擊不可選取的 `cluster` 背板(三者皆將選取設為空)。點擊**已選取**的節點 MUST 重新開啟其 detail panel,而非取消選取。除了 canvas tap 之外,`graph-search` 的 **locate** 亦建立選取,且對 detail-eligible 節點 MUST 開啟 detail panel(等同於在 canvas 左鍵點擊該節點,見 `graph-search`)。**在 canvas 上**的選取與取消選取 MUST 清除非空的搜尋字串(見 `graph-search`「Canvas interaction clears search」);locate 路徑 MUST NOT 經過該清除。

**`controller` / K8s `node` / `netapp-node` / `netapp-aggr`,以及裝飾性的 `namespace` / `application` 群組 MUST 可選取。裝飾性的 `cluster` 與 `storage-cluster` 群組 MUST NOT 可選取(`selectable: false`)。** 可選取的唯一目的是讓已啟用的 cytoscape expand-collapse 擴充套件的 **`+/-` collapse cue** 得以出現:該 cue 由選取驅動,只繪於**單一被選取**且為 `:parent`(或已收合)的節點上。因此使用者點擊任一可選取的 compound parent → 該 parent 顯示其 `+/-` cue → 點擊 cue 切換其收合 / 展開(沿用既有 expand-collapse 機制,不新增元件、不新增 collapse 機制)。

因 `cluster` 與 `storage-cluster` 群組不可選取,點擊它們的行為永遠等同於點擊背景(選取設為空、無選取環、不浮現 collapse cue)。**兩者**的收合 / 展開改由**雙擊(`dbltap`)**觸發:偵測到 `isCluster` **或 `isStorageCluster`** 節點上的 `dbltap` 時,Graph 視圖 MUST 直接呼叫 expand-collapse api(依 `isExpandable` / `isCollapsible` 選擇 expand 或 collapse)切換該節點的收合狀態。雙擊手勢 MUST 涵蓋每一個不可選取的裝飾性群組 —— 一個既無 collapse cue(因不可選取)又無雙擊手勢的容器,使用者將完全無法收合它,而「收合的裝飾性群組顯示資料夾 glyph」需求(見下)已為 `storage-cluster` 的收合狀態定義了外觀,該狀態 MUST 經使用者操作可達。此路徑觸發與 cue 相同的 `expandcollapse.aftercollapse` / `afterexpand` 事件,`collapsedIds` 經既有的 collapse 變更路徑更新,不引入新的 collapse 狀態機制。

`namespace` 裝飾性群組可選取(顯示單一選取環與既有的 selection-focus 視覺),但 MUST NOT 開啟 node detail panel:選取解析對 `isNamespace` 永遠回傳空。**`application` 群組是例外**:它為 detail-eligible —— 選取它會浮現 collapse cue **且**開啟 node detail panel 顯示該 ArgoCD application 的內容(選取解析以合成的 `kind: application` 加上 `queryTarget { kind: 'application', name: <app> }` 解析之,見 `node-detail`)。選取解析的範圍因此刻意比 Dashboard 按鈕的適用性判定寬:後者仍排除 `application` 群組(application 群組無 per-node dashboard,見 `node-detail`)。

#### Scenario: 點擊節點選取之並公開選取狀態

- **WHEN** 使用者點擊任一可選取節點
- **THEN** cytoscape 將其標記為 `:selected` 並套用對應樣式,且 Graph 視圖的選取狀態更新為該節點的 id

#### Scenario: 點擊已選取的節點重新開啟 panel 而非取消選取

- **WHEN** 某節點已被選取、其 detail panel 已以關閉鈕關閉,使用者再次點擊該節點
- **THEN** detail panel 重新開啟且選取不變(不會經過「取消選取再重新選取」,故高亮與 pinned tooltip 全程持續)

#### Scenario: cluster 群組不可選取,點擊行為等同背景點擊

- **WHEN** 使用者點擊裝飾性 `cluster` 群組節點
- **THEN** 該節點的 `selectable()` 為 `false`,選取設為空,不出現選取環,expand-collapse 的 collapse cue 亦不浮現

#### Scenario: 雙擊 cluster 群組切換收合 / 展開

- **WHEN** 使用者雙擊(`dbltap`)裝飾性 `cluster` 群組節點
- **THEN** 該節點的收合 / 展開狀態直接經 expand-collapse api 切換,`collapsedIds` 經既有 collapse 變更路徑對應更新,無論該節點當前是否被選取

#### Scenario: 雙擊 storage-cluster 群組切換收合 / 展開

- **WHEN** 使用者雙擊(`dbltap`)裝飾性 `storage-cluster` 群組節點
- **THEN** 該節點的收合 / 展開狀態以與 `cluster` 完全相同的路徑切換;收合後其框架中央顯示 `storageClusterColor` 的資料夾 glyph

#### Scenario: 雙擊可選取的容器不走此路徑

- **WHEN** 使用者雙擊一個可選取的容器(`namespace` / `application` / controller / K8s `node`)
- **THEN** 此雙擊路徑 MUST NOT 切換其收合狀態 —— 這些容器的收合手勢是選取後浮現的 `+/-` collapse cue

#### Scenario: namespace / application 群組可選取以浮現 collapse cue

- **WHEN** 使用者點擊裝飾性 `namespace` / `application` 群組節點
- **THEN** 其 `selectable()` 為 `true`,被標記為 `:selected`(顯示單一選取環),且 expand-collapse 在其上繪出 `+/-` collapse cue

#### Scenario: 選取 namespace 群組不開啟 detail panel

- **WHEN** 使用者選取裝飾性 `namespace` 群組節點
- **THEN** 選取解析回傳空,node detail panel MUST NOT 開啟(僅出現選取環與 collapse cue)

#### Scenario: 選取 application 群組開啟其 app detail

- **WHEN** 使用者選取 `application` 群組節點
- **THEN** 選取解析以合成的 `kind: application` 解析之,node detail panel 開啟並呈現該 application 的內容(見 `node-detail`),tooltip 釘於右上角 —— 同時 collapse cue 仍浮現

#### Scenario: 點擊 collapse cue 切換該 parent 的收合

- **WHEN** 可選取的 compound parent(`controller` / K8s `node` / `netapp-node` / `namespace` / `application`)被選取並顯示其 `+/-` cue,使用者點擊該 cue 範圍
- **THEN** 該 parent 的收合 / 展開狀態切換(經 expand-collapse api),`collapsedIds` 對應更新(沿用既有 cue 事件 → collapse 變更路徑)

### Requirement: 收合狀態改變後選取環與 fade class 重新套用

展開 / 收合一個容器會改變 canvas 上的元素集合(子節點進出可視、expand-collapse 合成或移除 meta-edge),但**不必然改變**輸入的 `elements` 參照。系統 MUST 將**收合狀態**視為選取鏡射與 fade 套用的明確輸入之一:收合集合改變後,選取環(單一選取的鏡射)與 focus / miss fade 的 style class MUST 被重新套用至當前的元素集合。

此重新套用 MUST NOT 依賴 `elements` 參照恰好一併改變。以 `elements` 的 identity 變化作為收合改變的代理訊號是**偶然成立**的:任何讓 `elements` 在收合切換時保持穩定的最佳化(memo 化、diff-and-patch 的參照重用)都會使選取環與 fade 靜默失效 —— 展開一個容器後,重新出現的子節點不帶 fade class(看起來像被點亮),而先前選取的節點若隨展開重新加入元素集合則不帶選取環。

#### Scenario: 展開容器後其子節點套用當前的 fade 狀態

- **WHEN** 某節點被選取(focus fade 生效),使用者展開一個先前收合、且不在該選取 focus neighborhood 內的容器
- **THEN** 新出現的子節點 MUST 立即帶有 fade class(與其他非點亮元素一致),MUST NOT 以未 fade 的狀態出現

#### Scenario: 收合狀態改變後選取環仍在被選取的節點上

- **WHEN** 某節點被選取,使用者收合再展開其祖先容器,使該節點離開又重新進入元素集合
- **THEN** 該節點 MUST 重新帶有單一選取環,且 node detail panel 的開闔狀態不變

#### Scenario: elements 參照不變時仍重新套用

- **WHEN** 收合狀態改變,但輸入的 `elements` 參照未改變
- **THEN** 選取環與 fade class MUST 仍被重新套用 —— 判定 MUST 以收合集合為輸入,不以 `elements` 的 identity 為代理

### Requirement: 收合的裝飾性群組顯示資料夾 icon

裝飾性 `cluster` / `storage-cluster` / `namespace` / `application` 群組於**收合**時(`.cy-expand-collapse-collapsed-node`)MUST 在其框架中央顯示一個**資料夾 glyph**,以該群組的 accent 色(`clusterColor` / `storageClusterColor` / `namespaceColor` / `applicationColor`)上色,`background-fit: contain`。**展開**時維持現狀 —— 帶 label 的容器,無置中 icon(`background-image: 'none'`)。此資料夾 icon 為補缺:帶有 `kind` 的 compound(`controller` / k8s `node` / `netapp-node`)於收合時已回退至其 kind icon(base `node` 規則),MUST NOT 受影響(資料夾選擇器僅匹配 `isCluster` / `isStorageCluster` / `isNamespace` / `isApplication`)。資料夾 glyph 為 `NodeKind` 之外的獨立 SVG(裝飾性 kind 不是 `NodeKind`,不進入 `ICON_SVG_BY_KIND`)。

#### Scenario: 收合的裝飾性群組顯示資料夾 icon

- **WHEN** `cluster` / `namespace` / `application` 裝飾性群組被收合
- **THEN** 其 `background-image` 為資料夾 glyph(以該群組 accent 色上色)而非 `'none'`

#### Scenario: 展開的裝飾性群組無置中 icon

- **WHEN** 該裝飾性群組為展開狀態(`:parent`,其下有可見子節點)
- **THEN** 其 `background-image` 為 `'none'`(帶 label 的容器,無置中資料夾 icon)

#### Scenario: 收合的帶 kind compound 保留其 kind icon

- **WHEN** `controller` / k8s `node` / `netapp-node` compound 被收合
- **THEN** 其置中 icon 仍為該 kind 的 icon,資料夾選擇器 MUST NOT 套用於它

### Requirement: Legend 面板可收合至側邊

Graph 視圖 SHALL 提供一顆 `<` 收合鈕(icon button),置於 legend 頂端「Layout」列(pod-parent mode 的 Node|Controller 切換列)右端的 action slot —— 而非獨立的 header 列,以省去額外的 rail 高度與分隔線。點擊後將**整個** legend `<aside>` 自版面移除,使 canvas 區域(`flex: 1`)取回釋出的寬度。收合狀態下 Graph 視圖 MUST 僅渲染一顆浮動的 `>` 還原鈕(icon button),絕對定位於 canvas 區域左上角、疊於畫布之上,點擊後還原 legend `<aside>`。該還原鈕的 `z-index` MUST 高於 cytoscape expand-collapse 的 overlay canvas(`.expand-collapse-canvas`,`z-index: 999`)—— 否則該 canvas 會吃掉點擊使還原鈕失效;同時 MUST 維持低於 app-shell 的頂部導覽與全域 overlay(modal、tooltip)層。此收合狀態為 Graph 視圖的 ephemeral view state(**不**寫入 runtime config、不跨 reload 保存)。

#### Scenario: 收合 legend 面板

- **WHEN** legend 面板顯示中,使用者點擊「Layout」列右端的 `<` 收合鈕
- **THEN** legend `<aside>` 自 DOM 移除(畫布取回其寬度),且改為僅渲染浮動的 `>` 還原鈕

#### Scenario: 還原 legend 面板

- **WHEN** legend 面板已收合,使用者點擊浮動的 `>` 還原鈕
- **THEN** legend `<aside>` 連同其全部區段重新渲染,浮動還原鈕消失,「Layout」列的 `<` 收合鈕回歸

### Requirement: Legend

Graph 視圖 SHALL 提供 legend,顯示**圖中實際存在**的 node icon 與 edge type。legend 的 icon 與顏色資料 MUST 與 cytoscape stylesheet 取自同一對照表(`ICON_SVG_BY_KIND` / `EDGE_STYLE_BY_TYPE`)。node legend 的 kind 集合 MUST 以 collapse-aware 規則導出(見「Collapse-aware 的 Node Kinds 圖例」需求)—— 只列**當前於 canvas 上以 glyph 繪出**的 kind(繪出的葉節點與收合的容器;展開的容器與被收合祖先隱藏的子節點不列)。edge legend MUST 只列**當前資料中存在**的 edge type,惟 `pod-calls-service` / `service-selects-pod` 永遠**省略**(其本質為 pod 對 pod,由 `pod-calls-pod` 的 `pod ↔ pod/service` 雙向列代表,見下)。兩者於集合為空時 MUST 不渲染任何內容。

**折疊列的錨點 MUST NOT 依賴錨點 type 自身存在於資料中。** 當一個折疊組的任一成員 type 存在於當前資料中時,該組的代表列 MUST 被渲染 —— 即使作為列 key 的錨點 type 本身不在資料裡。折疊組為:`pod-calls-pod`(代表 `pod-calls-pod` / `pod-calls-service` / `service-selects-pod`)與 `switch-to-switch`(代表 `switch-to-switch` / `node-to-switch`)。列的標籤與 glyph MUST 不因錨點缺席而改變(仍為 `pod ↔ pod/service` 與 `switch/node → switch`)。否則一張只有 pod→service 呼叫、沒有 pod→pod 直呼的圖,會在 canvas 上畫出橘色連線卻沒有任何圖例說明,也沒有還原用的切換鈕 —— 使用者一旦隱藏就再也開不回來。

**折疊列的顯示 / 隱藏切換 MUST 一次作用於該組的全部成員 type。** 折疊列沒有「只切換其中一種 type」的使用者路徑:切換 `pod ↔ pod/service` 列 MUST 同時將三種 type 自 `visibleEdgeTypes` 移除或還原,切換 `switch/node → switch` 列 MUST 同時作用於兩種 type。列的顯示狀態 MUST 反映該組成員的一致狀態。node legend MUST 以主題上色的 icon glyph 呈現每個 kind(取代先前的 shape glyph),並依前端自有的 kind → category 對照表(Workloads / Networking / Storage / Cluster / Other)**分組**,僅渲染至少含一個存在 kind 的 category;顏色 MUST NOT 用於編碼 category(顏色保留給 status)。kind 列的文字 label 預設為 kind 字串本身,但 MUST 支援顯示名稱覆寫:`network` MUST 顯示為 `physical network`。每個 edge legend 列 MUST 渲染為 `<from> [箭頭 glyph] <to>`:箭頭 glyph(帶該 edge 的顏色與線型)置於兩個 `NodeKind` label 之間取代動詞,端點 label 取自 `EDGE_ENDPOINTS_BY_TYPE`(`service` 縮寫為 `svc`),不得出現額外的 nesting 說明文字。例外:`pod-calls-pod` 列 MUST 渲染為 `pod ↔ pod/service`(兩端皆有箭頭的雙向 glyph),代表被省略的 service 邊對。

legend 的垂直區段順序 MUST 為:`Layout`(pod-parent mode 的 Node|Controller 切換,釘於頂端)→ `Node Kinds` → **`Ingress Gateway`** → `Edge Types` → `Status` → swatch 區段(`Clusters` → `Namespaces` → `Applications` → **`Nodes`|`Controllers`**)。亦即 swatch 區段位於 `Status` **之後**,且 **`Nodes`|`Controllers`(容器圖例)MUST 為最底部區段**(在 `Applications` 之後;`node` 模式下 `Namespaces` / `Applications` 不渲染,它仍緊接 `Clusters` 作為最底部)。

`Ingress Gateway`(ingress 顯示切換,見 `ingress-visibility-toggle`)為 **presence-gated**:只在圖中實際存在非空的 ingress-gateway 節點集合時渲染,否則 MUST NOT 渲染 —— 與本需求「集合為空時不渲染」的慣例一致。它緊接在 `Node Kinds` **之後**、`Edge Types` **之前**,因為它與 node legend 一樣是**節點可見性控制**(eye / eye-slash 語彙),而非關於 edge 或 status 的說明列;它 MUST NOT 併入 node legend 以 kind 為鍵的列。除了標題與 eye 切換外,該區段 MUST 帶一個虛線 edge glyph 樣本,說明 canvas 上虛線 ingress 的語意 —— edge legend 省略 service 類型列且其樣本永遠為實線,若無此樣本,canvas 上的虛線在 legend 中將無任何說明。

`Namespaces` 與 `Applications`(標題 `Applications`)為 **mode-gated**:只在 `controller` 模式渲染(`node` 模式剝除 namespace / application 群組,故兩區段 MUST 不渲染)。`Namespaces` 由後端的 `isNamespace` 群組節點餵入(以 `namespaceColor` 上色),`Applications` 由後端的 `isApplication` 群組節點餵入(以 `applicationColor` 上色,取自 application 調色盤)。`storageclass` kind 已自後端契約移除,故 node legend 的 `Storage` category 由 `pvc` / `netapp-aggr` / `netapp-node` 三個 glyph 組成(經既有的 kind → category 對照);已移除的 `Storage Classes` swatch 區段 MUST 維持移除,亦不得為 ONTAP 新增 swatch 區段 —— `storage-cluster` 只是 accent 群組框,不需 legend 列。每個區段標題 MUST 為 Title Case(`Node Kinds` / `Ingress Gateway` / `Edge Types` / `Status` / `Clusters` / `Namespaces` / `Applications` / `Nodes`|`Controllers`)。

#### Scenario: node legend 只列以 glyph 繪出的 kind,依 category 分組

- **WHEN** Graph 視圖收到的資料中 pod / service / pvc / node 皆為繪出的葉節點(無 nesting 容器、無收合),且無 workload 或 switch
- **THEN** node legend 只以 icon glyph 呈現 pod / service / pvc / node,並依 category 分組(pod→Workloads、service→Networking、pvc→Storage、node→Cluster),不存在的 kind(deployment / switch 等)不列,且不以顏色區分 category
- **AND**(見 collapse-aware 需求)若 `node` 改為裝載 pod 的展開容器,`node` 自 node legend 消失(改出現在 `Nodes` swatch 區段),收合後才以 glyph 回到 node legend

#### Scenario: edge legend 只列存在且未省略的 edge type

- **WHEN** 圖中有 `pod-mounts-pvc` 與 `pod-calls-pod` 邊,但無 `switch-to-switch`
- **THEN** edge legend 只以 `<from> → <to>`(箭頭 glyph 置中)呈現 `pod-mounts-pvc` / `pod-calls-pod`,`switch-to-switch` / `node-to-switch` 不列,且顏色與線型與 canvas 渲染一致

#### Scenario: 錨點 type 不在資料中時折疊列仍渲染

- **WHEN** 圖中有 `pod-calls-service` / `service-selects-pod` 邊,但完全沒有 `pod-calls-pod` 邊
- **THEN** edge legend MUST 仍渲染 `pod ↔ pod/service` 列(顏色、線型、雙向 glyph 與錨點存在時完全相同),且該列 MUST 提供顯示 / 隱藏切換鈕
- **AND** 同理,圖中只有 `node-to-switch` 而無 `switch-to-switch` 時,`switch/node → switch` 列 MUST 仍渲染並可切換

#### Scenario: 折疊列的切換一次作用於整組

- **WHEN** 使用者點擊 `pod ↔ pod/service` 列的隱藏切換鈕
- **THEN** `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` 三種 type MUST 同時自 `visibleEdgeTypes` 移除,canvas 上三者的邊一併隱藏;再次點擊時三者一併還原

#### Scenario: service 邊自 edge legend 省略(其本質為 pod 對 pod)

- **WHEN** 圖中有 `pod-calls-service` / `service-selects-pod` 邊
- **THEN** 兩種類型皆 MUST NOT 出現在 edge legend(無自己的列、亦無額外合併列);它們在 canvas 上以與 `pod-calls-pod` 相同的橘色繪製,並由 `pod-calls-pod` 列代表,該列渲染為 `pod ↔ pod/service`(雙向箭頭 glyph)

#### Scenario: Ingress Gateway 區段位於 Node Kinds 與 Edge Types 之間

- **WHEN** 圖中存在非空的 ingress-gateway 節點集合且 legend 渲染
- **THEN** 區段順序 MUST 為 `Node Kinds` → `Ingress Gateway` → `Edge Types`,標題為 Title Case 的 `Ingress Gateway`

#### Scenario: 圖中無 ingress 節點時該區段不渲染

- **WHEN** 圖中無任何節點屬於 ingress-gateway 集合
- **THEN** legend MUST NOT 渲染 `Ingress Gateway` 區段,其餘區段順序不受影響(`Node Kinds` 直接接 `Edge Types`)

#### Scenario: Applications swatch 區段列出後端的 application 群組(mode-gated)

- **WHEN** `controller` 模式下圖中有後端 `isApplication` 群組節點
- **THEN** `Applications` 區段為每個 application 名稱列一個 swatch,顏色取自 `applicationColor`(application 調色盤的 accent);切換至 `node` 模式後 application 群組被剝除,該區段不渲染(與 `Namespaces` 區段同樣 mode-gated)

#### Scenario: Controllers / Nodes swatch 為最底部 legend 區段

- **WHEN** `controller` 模式下 legend 渲染 `Clusters`、`Namespaces`、`Applications`、`Controllers`
- **THEN** 垂直順序 MUST 為 `Clusters` → `Namespaces` → `Applications` → `Controllers`(`Controllers` 最後)
- **WHEN** `node` 模式下 legend 渲染 `Clusters` 與 `Nodes`(無 Namespaces / Applications)
- **THEN** 垂直順序 MUST 為 `Clusters` → `Nodes`(`Nodes` 最後)

#### Scenario: NetApp kind 以 node legend glyph 呈現,無自己的 swatch 區段

- **WHEN** 圖中有 `netapp-aggr` / `netapp-node` 節點(此情境原描述的 storageclass 葉節點已自契約移除)
- **THEN** 各自以獨立 glyph 出現在 node legend 的 `Storage` category(與 `pvc` 並列);legend MUST NOT 渲染 `Storage Classes` swatch 區段,亦 MUST NOT 為 `storage-cluster` 新增 swatch 區段

#### Scenario: 集合為空時不渲染

- **WHEN** 圖中無任何節點(或無任何繪出的邊)
- **THEN** node legend(或 edge legend)不渲染任何內容,不出現空標題

### Requirement: Hover tooltip 顯示元素 metadata

Graph 視圖 SHALL 提供具**兩種模式**的 hover tooltip:

- **(1) 浮動 hover 模式(預設,無 detail 節點被選取時)。** 使用者 hover 任一節點或邊時,tooltip MUST 定位於被 hover 元素附近(`position: absolute`,取節點的 rendered 中心或邊上游標的 rendered 位置,加固定 offset),並在 cytoscape canvas wrapper 範圍內 clamp 與翻轉(offset 會使其超出右緣或下緣時,翻至元素左側並 clamp 於 wrapper 內,永不溢出 viewport)。寬約 280px,套用 `pointer-events: none`,永不阻擋對其下 graph 的互動。
- **(2) Pinned 模式(detail-eligible 節點被左鍵選取時)。** tooltip **釘於 canvas 右上角**(`top: 8` / `right: 8` / `left: auto`,`maxHeight: calc(50% - 16px)`,`overflowY: auto`,`pointer-events: auto` 使內容可捲動,`zIndex: 1000` 以高於 cytoscape expand-collapse 的透明輸入層 `z-index: 999`),顯示**所選節點**的完整 tooltip 內容(title + promoted attrs + raw labels)。該內容 MUST **與 hover 模式相同且來自同一來源**(同一個節點屬性建構邏輯與 label 列轉換,含 promoted 的 `kind` 列)。pinned 期間,**浮動 hover tooltip 對節點與邊皆完全抑制**。

所選節點的資料來自已 gated 的選取解析(可見 + 未被收合祖先隱藏 + detail-eligible),故裝飾性 **`cluster` / `namespace`** 群組(選取解析回傳空)**不**釘住,其 hover 行為不變;**`application` 群組為 detail-eligible**,被選取時**會**釘住(顯示其合成的 `kind: application` 與名稱)。pinned card **無關閉鈕**:取消選取(點擊背景或邊、切換節點、以 kind / edge 過濾掉、收合其祖先、或資料刷新移除它)自動清除 pin 並回到 hover 模式。樣式 MUST 使用 app 主題 token(半透明的次要背景色,opacity ≥ 0.85)。

**physical-storage 節點(`netapp-aggr` / `netapp-node`)MUST 走一般節點 tooltip 路徑** —— 它們自帶 `kind`、`labels.ontap_cluster`(aggregate 另有 `labels.node`)與 `health`,`netapp-aggr` 另帶 `usage`;tooltip(浮動或 pinned)直接顯示這些自有欄位,無合成路徑。已移除的 `storageclass` kind 連同其 `provisioner` / `parameters` tooltip 列一併消失。**`health` 與 `usage` MUST 為 promoted attribute 列**(與 `kind` / `namespace` / `ipAddress` 同源):`health` 逐字顯示其字串值,`usage` MUST 以人類可讀格式 `<used> / <capacity> (<pct>%)` 呈現(bytes 以十進位單位縮寫,百分比四捨五入為整數)。`usage` 缺值時整列省略,**MUST NOT** 顯示為 `0` 或 placeholder。帶 `storageclass`(claim 的 StorageClass 名稱)與 `usage` 的 PVC 節點 MUST 經同一機制各顯示一列。kind-less 的後端群組(`isNamespace` / `isApplication`)MUST 自其 flag 導出**合成 `kind` 列**(`isApplication` → `application`、`isNamespace` → `namespace`)—— 僅為呈現,MUST NOT 將 `kind` 寫入 `data`(群組維持 kind-less,對 kind 過濾與 icon legend 不可見)。`cluster` 群組於 hover 偵測上游即被略過、不顯示 tooltip,故不適用。

**tooltip 的名稱 title MUST 使用裸的 `data.label`(缺值時回退 `data.id`),MUST NOT 含 canvas compound 的 kind 前綴**(`Cluster:` / `Namespace:` / `Release Unit:` / `Node:`)。這些前綴僅由 stylesheet 渲染於 canvas label(見「裝飾性 compound 群組使用 per-kind 固定色彩與 kind 前綴標籤」與「physical-network 與 k8s node compound header 標籤對齊」);正規化為裝飾性群組寫入的 `data.label` 即裸名稱,故 hover 與 pinned 路徑直接自 `data.label` 取得裸名稱,無需剝除。

#### Scenario: hover 節點顯示其 metadata(無選取)

- **WHEN** 無 detail 節點被選取,使用者 hover 任一節點
- **THEN** tooltip 浮動並顯示節點的 `name`(`data.label ?? data.id`)、`kind`、`namespace`、`ipAddress`(`data.ipAddress` 以逗號串接,僅於存在且非空時)、`application`(ArgoCD application;任一帶 `data.application` 的葉節點皆顯示 —— pod / service / pvc 與聚合的 controller —— 惟裝飾性 `application` 群組節點 MUST NOT 顯示此列,以免與其合成 `kind` / `name` 重複),以及 allow-list 內有值的 labels(`app`、`version`、`app.kubernetes.io/name`、`app.kubernetes.io/instance`);缺值的欄位 MUST NOT 渲染其列(無空白 placeholder)

#### Scenario: hover NetApp 葉節點顯示其自有 metadata(無選取)

- **WHEN** 無選取,指標移至 `netapp-aggr` 葉節點(巢於某 `netapp-node` 下,自帶 `kind: netapp-aggr`、`labels.ontap_cluster`、`labels.node`、`health: "online"`、`usage: { usedBytes: 700000000000, capacityBytes: 1000000000000 }`;此情境原描述的 storageclass 葉節點已自契約移除)
- **THEN** tooltip 浮動並顯示其名稱(作為 title)、`kind: netapp-aggr`、`health: online`、格式化的 `usage`(例如 `700 GB / 1 TB (70%)`),以及 `ontap_cluster` / `node` 兩個 label 列
- **AND** MUST NOT 顯示任何 `provisioner` / `parameters` 列(該等欄位隨 storageclass 離開契約)

#### Scenario: hover kind-less 群組(namespace / application)顯示合成 kind

- **WHEN** 使用者 hover 後端的 `namespace` 或 `application` 群組節點(kind-less:無 `data.kind`,僅有 `isNamespace` / `isApplication` flag)
- **THEN** tooltip MUST 自該 flag 導出並顯示合成的 `kind` 列(`isApplication` → `application`、`isNamespace` → `namespace`),使 hover 不致只剩裸名稱;該列僅為呈現,MUST NOT 將 `kind` 寫入 `data`(群組維持 kind-less,對 kind 過濾與 icon legend 不可見)。`cluster` 群組於 hover 偵測上游即被略過、不顯示 tooltip,故不適用

#### Scenario: 裝飾性群組的 hover title 為裸名稱(無 kind 前綴)

- **WHEN** 使用者 hover `data.label` 為 `shop` 的 `namespace` 群組,或 `data.label` 為 `mongo` 的 `application` 群組(canvas 上分別渲染為 `Namespace: shop` / `Release Unit: mongo`)
- **THEN** tooltip title MUST 分別為 `shop` / `mongo`,MUST NOT 含 `Namespace:` / `Release Unit:` 前綴
- **AND** 合成 `kind` 列仍分別顯示 `namespace` / `application`

#### Scenario: pinned 的 application 群組 title 為裸名稱

- **WHEN** 使用者左鍵選取 `data.label` 為 `mongo` 的 `application` 群組(detail-eligible,故 tooltip 釘住)
- **THEN** pinned card 的 title MUST 為 `mongo`,MUST NOT 為 `Release Unit: mongo`

#### Scenario: hover 邊顯示其 metadata(無選取)

- **WHEN** 無 detail 節點被選取,使用者 hover 任一邊
- **THEN** tooltip 浮動並顯示 `edgeType` 與 `source → target`(經兩端點節點的 `label` 解析,而非裸 id)

#### Scenario: tooltip 定位於被 hover 元素附近(hover 模式)

- **WHEN** 無 detail 節點被選取,使用者 hover 一個節點
- **THEN** tooltip 以該節點的 rendered 位置加固定 offset 定位(動態 `left` / `top`),而非固定於角落
- **AND** 當 offset 會使其超出 canvas 右緣或下緣時,翻至節點左側並 clamp 於 wrapper 範圍內

#### Scenario: tooltip 不阻擋 graph 互動(hover 模式)

- **WHEN** 浮動 hover tooltip 顯示中,使用者點擊位於 tooltip DOM 區域下方的節點
- **THEN** 該節點被選取(觸發既有 `:selected` 樣式與選取狀態更新),hover tooltip 不攔截該點擊(`pointer-events: none` 生效)

#### Scenario: hover 結束後浮動 tooltip 淡出並離開 DOM

- **WHEN** 無選取,指標離開被 hover 的元素且未進入另一元素
- **THEN** tooltip 以 opacity transition 淡出(≥ 100ms、≤ 200ms),動畫結束後完全不渲染 DOM(不留下佔位的空框)

#### Scenario: 被移除的 hover 元素清除浮動 tooltip

- **WHEN** 某元素被 hover(無選取)且資料刷新將其自 cytoscape instance 移除
- **THEN** hover 狀態於 `remove` 事件時清除,tooltip 立即消失,永不渲染指向已不存在元素的內容

#### Scenario: hover 不重新渲染 canvas 元件

- **WHEN** 使用者連續 hover 多個元素
- **THEN** 訂閱 hover 狀態的 tooltip 元件重新渲染,而 canvas 元件與 cytoscape instance 引用不變(以 React DevTools profiler 驗證:canvas 元件的 render 次數不增加)

#### Scenario: 左鍵選取 detail 節點將 tooltip 釘於右上角

- **WHEN** 使用者左鍵選取 detail-eligible 節點(含 `netapp-aggr` 的葉節點、k8s node、`netapp-node` 或 controller)
- **THEN** tooltip 進入 pinned 模式:於 canvas 右上角(`top:8` / `right:8`,`pointer-events:auto`,`zIndex:1000`,可捲動,`maxHeight: calc(50% - 16px)`)釘住**該節點**的 title + promoted attrs(含 `kind` 列)+ raw labels(label 列轉換濾除已 promoted 的 `namespace`)
- **AND** pinned 內容與 hover 該節點所顯示者相同(同一來源)

#### Scenario: pinned 抑制浮動 hover

- **WHEN** detail 節點被選取(tooltip 已釘住),使用者 hover 另一節點或邊
- **THEN** 浮動 hover tooltip MUST NOT 出現(pinned 模式抑制 hover),右上角持續只顯示所選節點的 pinned card

#### Scenario: 游標不在任何元素上時 pinned tooltip 仍顯示

- **WHEN** detail 節點被選取,游標未 hover 任何元素(hover 狀態為空)
- **THEN** pinned card MUST 仍顯示(pinned 模式不依賴 hover 元素;它在 hover 為空的 early return 之前渲染)

#### Scenario: 取消選取清除 pin 並回到 hover

- **WHEN** tooltip 已釘住,使用者取消選取(點擊背景或邊、切換至另一節點、以 kind 或 edge 過濾掉該節點、收合其祖先、或資料刷新移除它)
- **THEN** 選取解析回傳空,pinned card 消失,tooltip 回到浮動 hover 模式

#### Scenario: 選取 NetApp 節點釘住其 health 與 usage

- **WHEN** 使用者左鍵選取 `netapp-aggr` 葉節點或 `netapp-node` compound(此情境原描述的 storageclass 葉節點已自契約移除)
- **THEN** tooltip 釘住並顯示其 `kind` + `health` +(`netapp-aggr` 上)格式化的 `usage`,以及其 `ontap_cluster` / `node` labels;底部 detail panel 因無 change-report 或 alerts 區段而僅渲染 header(見 `node-detail`)
- **AND** 選取帶 `storageclass` 與 `usage` 的 PVC 時,各釘住一列 `storageclass: <name>` 與格式化的 `usage`

### Requirement: Node Kind / Edge Type 過濾

Graph 視圖 SHALL 維護兩組 in-app view state —— `visibleKinds`(可見的 `NodeKind` 集合)與 `visibleEdgeTypes`(可見的 `EdgeType` 集合)—— 取代 panel options editor 的兩個 multi-select;兩者皆由 legend 的每列顯示 / 隱藏切換操作(node kind 見「Legend 每個 node kind 列的顯示 / 隱藏切換」需求;edge type 由 `Edge Types` 圖例每列的同款 eye / eye-slash 切換操作),為 ephemeral view state,不寫入 runtime config、不跨 reload 保存。預設值為對應表(`ICON_SVG_BY_KIND` / 當前模式繪出的 edge type 集合)的全部 keys,惟 `network` MUST 自 `visibleKinds` 的選項與預設(`ALL_KINDS`)排除:虛擬 fabric wrapper 不是可過濾的資源 kind,可見性判定 MUST 對 `network` kind 一律視為可見 —— cytoscape 的有效可見性為元素與其所有祖先的 AND,藏掉 wrapper 會連帶藏掉其下所有 switch;wrapper 仍會在其 switch 全被過濾後經 orphan 級聯收掉。被過濾的元素 MUST 以 `visibility: hidden` 隱藏(保留位置,不觸發 cytoscape 重新 layout),且過濾邏輯 MUST 集中於一個以 `(elements, visibleKinds, visibleEdgeTypes)` 為輸入的純函式,以利獨立驗證。

可見性判定在 kind-pass 與 edge-pass 之後 MUST 再執行 **orphan 級聯隱藏**,且該級聯 MUST **只作用於 compound 容器,絕不作用於 leaf 節點**:

- **Leaf 節點**(在 `elements` 中沒有任何以其為 `data.parent` 的節點)是否被 orphan 級聯移除,MUST 依其 edge 的**來源**判定,而非依當下有無可見 edge:
  - **在基準線圖中有至少一條 incident edge 的 leaf** MUST NOT 被 orphan 級聯移除 —— 即使它當下的 incident edge 一條都沒有被繪出。使用者隱藏的是 edge,不是節點;該資源在拓樸中確實有連線,只是連線暫時不可見。
  - **在基準線圖中沒有任何 incident edge 的 leaf**(資料本來就孤立)MUST 被 orphan 級聯移除,與過濾狀態無關。

  **基準線圖**定義為 normalize boundary 輸出的圖 —— 即後端交付、尚未套用任何視圖轉換或過濾的元素集合。它 MUST 早於 pod-parent mode 的拓樸轉換、kind / edge-type 過濾與 ingress pass。此定義是必要的:`node` 模式將 `pod-to-node` 改以巢狀表示並自 `elements` 移除該 edge,若以轉換後的元素集合為基準,這些 pod 會被誤判為「本來就孤立」而消失。判定 MUST 只看基準線中是否存在以該節點為 source 或 target 的 edge,不看該 edge 的 type 是否在當前模式可繪。

- **Compound 容器**(在 `elements` 中至少有一個以其為 `data.parent` 的節點)若既無可見子節點(`data.parent` 指向它且仍在可見節點集合中的節點),又無可見 incident drawn-edge,則 MUST 自可見節點集合移除,並一併移出以其為端點的邊 —— 空方框不留在畫布上。

此判定 MUST 以 fixed-point 迭代直到穩定:容器被移除後,若其父容器因此再無可見子節點且無可見邊,MUST 在後續迭代中遞迴隱藏(如 controller → K8s `node` → `cluster` 連鎖)。orphan 級聯**永遠開啟、無開關**,且作用於最終可見集合;對容器而言,不區分其子節點是「資料本來就沒有」或「因過濾才消失」。`cluster` 容器不因 kind 過濾隱藏,但 MUST 在其所有子節點皆不可見時被收掉。meta-edge(expand-collapse 合成)不在 `elements` 內,不參與 orphan 判定;被 collapse 視覺隱藏的子節點仍視為「可見子節點」(未自可見節點集合移除),故 collapsed 父容器 MUST NOT 被誤判為 orphan。

容器 / leaf 的判定 MUST 依據 `elements` 中的親子關係,而非該子節點當下是否可見 —— 一個子節點全被過濾掉的容器仍是容器(故會被級聯收掉),而不是變成 leaf(那會使它永遠留存)。

#### Scenario: 過濾節點 kind 後對應節點不可見且位置保留

- **WHEN** 使用者透過 legend 的 `pod` 列切換將 `pod` 自 `visibleKinds` 移除
- **THEN** 所有 `data.kind === 'pod'` 的節點以 `visibility: hidden` 隱藏;其餘節點位置不變(不觸發 layout 重排);cytoscape instance 引用不變

#### Scenario: 過濾邊 type 後對應邊不可見

- **WHEN** 使用者透過 legend 的 `pod ↔ pod/service` 列切換,將該折疊組(`pod-calls-pod` / `pod-calls-service` / `service-selects-pod`)自 `visibleEdgeTypes` 移除
- **THEN** 該組三種 type 的邊皆以 `visibility: hidden` 隱藏;**不屬於該組**的邊不受影響;未因此變孤立(仍有其他可見邊或可見子節點)的節點維持可見

#### Scenario: 邊在任一端點被隱藏時自動隱藏

- **WHEN** 邊的 source 或 target 節點因 `visibleKinds` 過濾而被隱藏
- **THEN** 該邊 MUST 也被隱藏(無懸空線),即使該邊的 `edgeType` 仍在 `visibleEdgeTypes` 中

#### Scenario: 因 UI 過濾而失去所有可見連線的 leaf 維持可見

- **WHEN** 某 leaf 節點在基準線圖中有 incident edge,使用者過濾 edge type 使其在可見邊集合中再無任何以其為端點的邊
- **THEN** 該節點 MUST 維持可見(不被 orphan 級聯移除);只有失去的邊被隱藏;不觸發 layout 重排

#### Scenario: node 模式下唯一 edge 為 pod-to-node 的 pod 維持可見

- **WHEN** `node` 模式將 `pod-to-node` 改以巢狀表示、不再繪出該 edge,使某 pod(如 DaemonSet / Job / CronJob 的 pod)再無任何可見 incident drawn-edge
- **THEN** 該 pod MUST 維持可見並顯示於其 K8s `node` 容器內 —— 它在基準線圖中有 `pod-to-node` edge,屬「edge 被 UI 藏起來」而非「本來就孤立」

#### Scenario: 變空的容器遞迴隱藏

- **WHEN** 某 K8s `node` 容器底下所有 pod 子節點皆因 kind 過濾(或 ingress pass)自可見節點集合移除,且該 `node` 無其他可見邊
- **THEN** 該 `node` 容器 MUST 在後續迭代中一併隱藏;若該動作使其所屬 `cluster` 容器再無任何可見子節點,則 `cluster` 容器亦 MUST 隱藏

#### Scenario: 有可見子節點的容器保留

- **WHEN** 某容器(K8s `node`、controller 或 `cluster`)自身無可見 incident edge,但其底下仍有至少一個可見子節點
- **THEN** 該容器 MUST 維持可見(不被當作 orphan 隱藏)

#### Scenario: controller 子 pod 全被過濾時 controller 一併隱藏

- **WHEN** `controller` 模式下某 controller 容器底下所有 pod 子節點皆因 kind / edge **過濾**(`visibility: hidden`,而非 collapse)自可見節點集合移除,且該 controller 無其他可見 incident edge
- **THEN** 該 controller 容器 MUST 被 orphan 級聯隱藏 —— **filter-hidden 子節點不計為「可見子節點」(與 collapse-hidden 不同)**;若其 `cluster` 因此再無可見子節點,`cluster` 亦遞迴隱藏

#### Scenario: 資料本來就孤立的節點維持隱藏

- **WHEN** 上游回傳一個既無任何邊、又無任何子節點的節點(即使使用者未做任何過濾)
- **THEN** 該節點 MUST 被 orphan 級聯隱藏 —— 它在基準線圖中就沒有 incident edge,不屬於「edge 被 UI 藏起來」的情形

#### Scenario: 兩種無邊 leaf 在同一畫面上有不同結果

- **WHEN** 圖中同時存在 leaf A(基準線有 incident edge)與 leaf B(基準線無任何 incident edge),使用者隱藏了 A 的全部 edge type
- **THEN** A MUST 可見(無連線)而 B MUST 隱藏 —— 兩者當下皆無可見 edge,結果卻不同,判定依據為基準線而非當下狀態

#### Scenario: 子節點全被過濾的空容器仍被收掉

- **WHEN** 某容器在 `elements` 中有子節點,但其全部子節點皆因過濾自可見節點集合移除,且該容器無可見 incident edge
- **THEN** 該容器 MUST 被 orphan 級聯隱藏(它仍是容器,不因子節點全部不可見而被當成 leaf 保留)

#### Scenario: 過濾不重跑 layout

- **WHEN** 使用者切換 `visibleKinds` 或 `visibleEdgeTypes`(含因此觸發的 orphan 級聯)
- **THEN** 系統以 cytoscape batch 套用 `style('visibility', ...)`;**不**重新執行 layout;節點位置保持原狀(座標不變)

#### Scenario: 全部 node kind 被過濾顯示 empty state

- **WHEN** 使用者將 `visibleKinds` 清為空集合
- **THEN** 所有節點隱藏,Graph 視圖覆蓋顯示 empty state 並顯示文字「All node types filtered」,canvas 本身保留(不重建 instance)

#### Scenario: 未知 kind 預設可見

- **WHEN** 上游回傳節點 `data.kind` 不在 `ICON_SVG_BY_KIND` keys 中(例:`ingress`),且使用者未對該 kind 做特別設定
- **THEN** 該節點 MUST 預設可見(可見性判定對 unknown kind 回傳可見),避免上游新增資源類型時資料無聲消失

#### Scenario: Legend 反映資料、不受 filter 影響

- **WHEN** 使用者過濾任何 kind / edgeType
- **THEN** node legend / edge legend 列出的集合 MUST 不受 filter 影響 —— edge legend 取自**資料中出現的** edge type、node legend 取自 collapse-aware 導出(吃 `elements` + `collapsedIds`,**不**吃 `visibleKinds`);被過濾的元素仍在 `elements` 內(僅 `visibility: hidden`)、collapse 狀態亦不變,故 legend 仍列出,使用者可知曉目前隱藏了哪些類型。(注:legend 隨 **collapse** 變動是另一回事,見「Collapse-aware 的 Node Kinds 圖例」需求)

#### Scenario: Tooltip 不會顯示被過濾元素

- **WHEN** 元素已被過濾隱藏(`visibility: hidden`)
- **THEN** cytoscape 不對該元素觸發 `mouseover`;hover tooltip 不會顯示該元素 metadata

#### Scenario: 初次載入無過濾狀態時走 defaults

- **WHEN** Graph 視圖初次載入,尚無任何 `visibleKinds` / `visibleEdgeTypes` 的使用者操作
- **THEN** 兩集合取預設值(全部可見),行為等同未過濾,不拋例外

#### Scenario: 可見性判定為純函式且可獨立驗證

- **WHEN** 以 `(elements, visibleKinds, visibleEdgeTypes)` 呼叫可見性判定
- **THEN** 以下案例皆得到正確的可見集合:全部可見、過濾單一 kind、過濾單一 edgeType、過濾節點同時造成邊端點失效、空 elements、unknown kind 預設可見、**基準線有邊但當下全被過濾的 leaf 維持可見**、**基準線無邊的 leaf 維持隱藏**、**上述兩者並存時各自得到不同結果**、**子節點全被過濾的容器被收掉**、遞迴容器級聯(controller→node→cluster 連鎖變空)、有可見子節點的容器保留、**子節點全不可見的容器不被誤判為 leaf**;判定不依賴 DOM 或 cytoscape instance

### Requirement: 空狀態與錯誤狀態渲染

當資料為空、載入中、或自 `endpoints.graph` 取數失敗時,Graph 視圖 MUST 顯示對應狀態 UI(empty / loading / error),不可顯示空白 canvas 或拋例外到 React 樹外。

#### Scenario: 資料為空時顯示 empty state

- **WHEN** Graph 視圖收到 `elements: []`
- **THEN** Graph 視圖顯示 empty state,文字提示無資料,canvas 區域留白

#### Scenario: API 錯誤時顯示 error 提示

- **WHEN** 自 `endpoints.graph` 取數失敗(網路錯誤、非 2xx、或回應不符 `WireGraph` 契約)
- **THEN** Graph 視圖顯示 app 主題風格的錯誤 banner,內含錯誤訊息與重試提示,不顯示破損的 cytoscape canvas

### Requirement: Status 外框

Graph 視圖 SHALL 依節點 `data.status` 渲染狀態外框,顏色取自單一資料源 `STATUS_COLOR`(`normal`→綠 `#73BF69`、`warning`→黃 `#F2CC0C`、`critical`→紅 `#E02F44`)。狀態外框 MUST 套用於**任何後端有回報 `data.status` 的 kind**(資料驅動,不硬編碼 `pod` / `node` / `pvc` 清單);status 缺值或非法值時正規化層 MUST NOT 寫入 `status` 欄 —— 該節點維持主題中性外框,detail panel 亦不顯示狀態 badge(惟父容器的 worstStatus 聚合計算中,無 status 的子節點仍以 `normal` 計)。Legend MUST 顯示三色 status 說明(`Status` 區段)。

#### Scenario: 依 status 顯示外框

- **WHEN** 任一節點(含 workload kind 如 `deployment`)帶有後端回報的 `data.status`
- **THEN** 該節點以對應 `STATUS_COLOR` 顏色渲染外框
- **WHEN** `status` 缺值或不在列舉中
- **THEN** 正規化層不寫入 `status` 欄,節點維持主題中性外框(無狀態外框),detail panel 不顯示狀態 badge

#### Scenario: 外框不影響選取與容器

- **WHEN** 節點被選取
- **THEN** 選取高亮(`node:selected`)覆蓋 status 外框
- **AND** 身為 compound parent 的 K8s `node` 或 controller 仍顯示 status 外框(選擇器排序覆蓋 `node:parent`)

### Requirement: 容器圖例隨 pod-parent 模式切換容器來源

容器圖例(以 cluster 色上色的 compound 容器清單,含「全部摺疊 / 展開」切換)列出的容器來源 MUST 隨 `podParentMode` 切換:`node` 模式列出 K8s `node` 容器(`cluster > node > pod` 的中間層);`controller` 模式改列 controller 容器(`cluster > controller > pod` 的中間層)。controller 容器來源 MUST 為**後端 `controller` 群組節點**(經 enrichment 標 `isController: true`、kind 衍生自子 pod 的 `owner.kind`),而非前端合成;controller 模式以 `d.isController === true` 認定容器。兩模式皆以容器所屬 cluster 的 accent 色上色(與 canvas 容器底色同源),且「全部摺疊」切換 MUST 作用於**當前模式**的容器集合(經單一容器導出邏輯,使切換鈕與 canvas 容器永遠指向同一組)。容器圖例 MUST 在當前模式無任何 compound 容器時不渲染。

#### Scenario: node 模式列 K8s node 容器

- **WHEN** `podParentMode === 'node'` 且圖中有裝載 pod 的 K8s node
- **THEN** 容器圖例列出這些 K8s node(以各自 cluster 色),「全部摺疊」作用於該 node 容器集合

#### Scenario: controller 模式列 controller 容器

- **WHEN** `podParentMode === 'controller'` 且圖中有裝載 pod 的後端 `controller` 群組(`isController: true`)
- **THEN** 容器圖例改列這些 controller(以各自 cluster 色);「全部摺疊」改作用於 controller 容器集合

#### Scenario: 當前模式無容器時不渲染

- **WHEN** 當前模式下圖中無任何 compound 容器(例:無 owner 的裸 pod 在 controller 模式)
- **THEN** 容器圖例不渲染,不出現空標題

### Requirement: 收合容器(controller / k8s node)以最差子節點 status 上框色

當**容器被收合**(controller 或 k8s `node`)時,其矩形外框 MUST 取**其收合所隱藏的最差 status** 的 `STATUS_COLOR`(`normal` 綠 `#73BF69` / `warning` 黃 / `critical` 紅)—— **含 `normal`**:內容全部健康的容器於收合時 MUST 繪出 `normal` 綠框(明確的好消息,而非中性無框的方塊)。資料來自 `data.worstStatus`,由正規化層聚合至該節點(見 `graph-data-source`:controller 的 worstStatus 為其子 pod(`pod.parent === controllerId`)中最差的 status,**永遠寫入**;k8s node 的 worstStatus 為其自身 status 與**其 pod** 的 status 中最差者 —— 在 `controller` 視圖 pod 不再巢於 node 下,故 node 的 pod 以**經 `pod-to-node` 邊可達的 pod**(D8)認定;在 `node` 視圖 pod 再度巢於 node 下,改以子節點認定。**只要有 status 資訊即寫入** —— 自身無 status 且無任何 pod(可達或巢狀)的 node 無此欄位,收合時維持中性外框,因為「無資訊」不得偽裝成 normal)。stylesheet MUST 以 `node[worstStatus="<status>"].cy-expand-collapse-collapsed-node` 選擇器實作,並宣告於資料驅動的 `node[status="<s>"]` 選擇器**之後**(**任何帶 `status` 的節點**繪出自身 status 外框,而非 pod/node/pvc allow-list;正規化層僅在後端實際提供 status 時寫入該欄,故 service / external / cluster / netapp-aggr / netapp-node 等無 status 者維持中性外框。NetApp 的 `health` 是獨立欄位,MUST NOT 對應至 status 外框色 —— 顏色保留給 K8s status 量表),使**收合的 k8s node** 的最差子節點 status 得以覆蓋其自身 status 外框。controller 無自身 status 外框,故此為其唯一上色。`node:selected` 以 outline / underlay 表達,不影響此外框色。**展開**的容器不匹配此選擇器(controller 維持中性 `:parent` 容器框,k8s node 維持自身 status 外框)。此處使用 **status** 而非 alert severity:`info` 只存在於 alert、不在 status 量表上,故收合外框永遠不會是 `info`(`SEVERITY_COLOR` 僅服務 detail panel 的 alert 表格)。

#### Scenario: 收合的 controller 顯示其最差子 pod status

- **WHEN** controller 底下有 `status: critical` 的 pod,使用者**收合**該 controller
- **THEN** 收合的 controller 矩形外框為 `STATUS_COLOR.critical`(紅)
- **WHEN** 同一 controller 被**展開**
- **THEN** 外框回到中性 `:parent` 容器色

#### Scenario: k8s node 的 worstStatus 經 pod-to-node 邊計算

- **WHEN** `controller` 視圖中某 k8s `node` 自身 `status: normal`,且一個 `status: critical` 的 pod 經 `pod-to-node` 邊指向它(該 pod 巢於其 controller 下,非 node 下)
- **THEN** 正規化層將 `data.worstStatus` 寫為 `critical`(取經 `pod-to-node` 邊可達 pod 中最差者);在 `node` 視圖 pod 再度巢於 node 下時,以子節點認定得到相同結果

#### Scenario: 收合的 k8s node 的最差子節點 status 覆蓋其自身 status 外框

- **WHEN** k8s `node` 自身 `status: normal`,底下有 `status: critical` 的 pod(經 `pod-to-node` 邊或巢狀認定),使用者**收合**該 node
- **THEN** 收合的 node 矩形外框為 `STATUS_COLOR.critical`(紅),覆蓋其自身的 normal 綠
- **WHEN** 同一 node 被**展開**
- **THEN** 外框回到其自身 status(`normal` 綠),且每個子 pod 顯示各自的 status 外框

#### Scenario: 全 normal 的容器收合時繪出 normal 綠框

- **WHEN** 容器(controller 或 k8s node)收合所隱藏的最差 status 為 `normal`(每個子節點皆 normal,缺 status 者以 normal 計)
- **THEN** 收合的容器矩形外框為 `STATUS_COLOR.normal`(綠)—— controller 永遠如此,k8s node 則在其自身或至少一個 pod 帶有 status 資訊時如此

#### Scenario: 無 status 資訊的 k8s node 收合時維持中性外框

- **WHEN** k8s `node` 自身無 `status`,且無任何 pod(可達或巢狀)
- **THEN** 該 node 無 `data.worstStatus`,收合時維持中性容器外框(「無資訊」不是「normal」)

### Requirement: Collapse-aware 的 Node Kinds 圖例(只列實際以 glyph 繪出者)

「Node Kinds」icon legend 的 kind 集合 MUST 由以 `(elements, collapsedIds)` 為輸入的純函式導出,只列**當前於 canvas 上以 glyph 繪出**的 kind,而非單純資料中出現的 kind。規則,對每個帶 `kind` 的非 cluster 節點:被收合祖先隱藏的節點**不**計;**展開**的容器(其 id 為某節點的 `parent` 且自身未收合)**不**計(改呈現於 Clusters / Nodes|Controllers swatch 區段);其餘(繪出的葉節點或**收合**的容器)計入其 kind。`cluster`(無 kind)永不計入。此規則取代先前的 presentKinds + showNodeKindIcon 組合,使 node 與 controller 容器一致。`netapp-aggr` 為 `netapp-node` 下的葉節點,永遠經其 glyph 計入(繪出的葉節點);`netapp-node` **是**真正的 compound 容器,適用與 `node` / `controller` 相同的規則 —— 展開時不計(canvas 上為框),收合時經其 glyph 計入。已移除的 `storageclass` kind 不再有對應規則。

#### Scenario: NetApp aggregate 永遠以葉節點 glyph 計入 Node Kinds

- **WHEN** 圖中有 `netapp-aggr` 葉節點(其父 `netapp-node` 展開)與 pvc 葉節點(此情境原描述的 storageclass 葉節點已自契約移除)
- **THEN** Node Kinds legend 的 `Storage` category 列出 `pvc` 與 `netapp-aggr` 兩個 glyph;展開的 `netapp-node` **不**計(canvas 上為框),收合後才以 `netapp-node` glyph 回到 Node Kinds legend

#### Scenario: 收合容器移除其子 kind 並加入容器 kind(node / controller 皆然)

- **WHEN** K8s `node`(或 controller)容器被收合,其下每個 pod 皆被聚合掉
- **THEN** `pod` 離開 Node Kinds legend,`node`(或對應的 controller kind)經其 glyph 進入;展開的容器完全不出現在 Node Kinds(只在其 swatch 區段)

#### Scenario: 收合虛擬 network compound 使 Node Kinds 以 network 取代 switch

- **WHEN** 包住 switch fabric 的虛擬 `network` compound(見 `switch-tier-layout`)被收合
- **THEN** 其下的 `switch` 因被收合祖先隱藏而離開 Node Kinds legend,收合的 `network` 經其 wifi glyph 進入(NETWORKING category 自 `switch` 變為 `network`,label 為 `physical network`);展開後恢復 `switch`

### Requirement: Legend 每個 node kind 列的顯示 / 隱藏切換

Graph 視圖 SHALL 在 Node Kinds legend 的**每一列**(icon + 名稱)提供一顆**顯示 / 隱藏切換鈕**(`eye` / `eye-slash`),切換該 kind 節點在 canvas 上的可見性。該切換 MUST 寫入 Graph 視圖的 `visibleKinds` view state —— legend 切換鈕是該狀態的唯一使用者介面,canvas 可見性與 legend 列的狀態 MUST 與其同步反映。當某 kind 被隱藏時,**任一以該 kind 為端點的邊** MUST 隨之隱藏(既有的可見性端點規則);因此而再無可見子節點且無可見邊的**容器** MUST 由 orphan 級聯隱藏,但因此而失去所有可見邊的 **leaf 節點 MUST 維持可見**(其在基準線圖中有 incident edge)。

**legend 清單。** legend 的 kind 清單 MUST 為「實際以 glyph 繪出的 kind」(既有的 collapse-aware 導出)與「當前(經 mode 轉換後的)elements 中存在、但被 `visibleKinds` 過濾掉的 kind」兩者的**聯集** —— 被隱藏的 kind MUST 保留其 legend 列(淡化樣式、`eye-slash`),否則無法自 legend 還原。切換鈕 MUST 只渲染於**可過濾的已知 kind**:`network` 虛擬 wrapper(永不被 kind 過濾)與未知 kind(預設可見)MUST NOT 帶切換鈕。

**與既有切換的互動:**

- **Collapse 切換**(clusters / nodes-or-controllers 的全部摺疊、單一容器摺疊):收合狀態(`collapsedIds`)與可見性(`visibleKinds`)為兩個獨立的層 —— 隱藏某 kind MUST NOT 改變任何容器的收合狀態,重新顯示 MUST 原樣恢復收合狀態。
- **Collapse 互換語意不變**:收合的容器在 legend 中以其容器 kind 的列代表(收合 `netapp-node` 得到 `netapp-node` 列,而非 `netapp-aggr` 列),切換鈕切換該列的 kind;隱藏容器 kind MUST 同時使其後代不可見(有效可見性 = 自身 AND 所有祖先)。
- **pod-parent mode 切換**:`visibleKinds` 為跨模式的全域集合,作用於 mode 轉換後的 elements;模式切換 MUST NOT 清除隱藏設定 —— 在另一模式無對應節點的設定無視覺效果但被保留,切回時再度生效。

寫回 `visibleKinds` 時 MUST 保持 canonical kind 順序(依完整 kind 宇宙的固定順序重建陣列)—— 隱藏 / 還原一輪不得重排該集合(使狀態確定、可比對)。

當每個可切換 kind 皆被隱藏時,canvas MUST 顯示既有的 `All node types filtered` empty state,且 legend MUST 仍列出每個(已隱藏的)kind 以供還原。**edge-type 過濾本身 MUST NOT 清空 canvas** —— 基準線圖中有 incident edge 的 leaf 不因 edge 被過濾而消失,隱藏全部 edge type 後這些節點仍在,只是不再有連線(基準線本就無邊的孤立節點則自始即為隱藏)。當可見節點集合確實為空、但仍有可切換 kind 為顯示狀態時(例如過濾與 ingress 隱藏共同作用),MUST NOT 歸咎於 node kind —— 改顯示通用的 `All elements filtered out`。

#### Scenario: 切換隱藏 kind 及其相關邊

- **WHEN** 圖中有 `service` 節點與 `service-selects-pod` 邊,使用者點擊 legend `service` 列的切換鈕
- **THEN** 每個 `service` 節點與每條以 `service` 節點為端點的邊(`pod-calls-service` / `service-selects-pod`)自 canvas 隱藏
- **AND** `service` 列留在 legend 中(淡化、`eye-slash`),再點一次即還原節點與邊

#### Scenario: legend 切換鈕與 visibleKinds 狀態同步

- **WHEN** 使用者點擊 legend `pvc` 列的切換鈕以隱藏 `pvc`
- **THEN** `visibleKinds` view state 不再含 `pvc`,canvas 隱藏 pvc 節點,且該列顯示隱藏狀態;反向操作使 `pvc` 回到 `visibleKinds`,canvas 與該列同步還原

#### Scenario: 隱藏不清除收合狀態

- **WHEN** K8s `node` 容器已收合,使用者隱藏再重新顯示 `node` kind
- **THEN** 該 node 容器重新出現且**維持收合**(切換動作未清除其收合狀態)

#### Scenario: controller 模式隱藏 pod 觸發 orphan 級聯

- **WHEN** controller 模式下使用者隱藏 `pod` kind,且某 controller 框自身無 incident drawn edge(其 pod 巢於其內,`pod-to-node` 自 pod 連至 K8s node 而非經 controller),故其全部子 pod 隱藏
- **THEN** 該 controller 框亦經 orphan 級聯隱藏,因其無可見子節點且無可見邊

#### Scenario: 模式切換保留隱藏設定

- **WHEN** controller 模式下 `deployment` 被隱藏,使用者切換至 node 模式再切回 controller 模式
- **THEN** 該設定在 node 模式期間無視覺效果(圖中無 controller 節點),回到 controller 模式時 `deployment` 仍為隱藏

#### Scenario: 不可過濾的列無切換鈕

- **WHEN** legend 列出 `network`(虛擬 fabric wrapper)或未知 kind(後端新增、不在已知 kind 集合內)
- **THEN** 該列照常顯示其 glyph 與名稱,但不渲染顯示 / 隱藏切換鈕

#### Scenario: 全部隱藏顯示 empty state 且可還原

- **WHEN** 使用者將 legend 列出的每個 kind 皆切換為隱藏
- **THEN** canvas 顯示 `All node types filtered` empty state,legend 仍列出每個 kind(淡化、`eye-slash`),點擊任一列即還原該 kind

#### Scenario: 隱藏全部 edge type 不清空 canvas

- **WHEN** 每個 kind 皆為顯示,但使用者於 legend 的 `Edge Types` 切換隱藏了每種 edge type
- **THEN** canvas MUST NOT 顯示任何 empty state —— 基準線圖中有 incident edge 的節點(及其容器)維持可見,僅所有連線消失

#### Scenario: 可見集合為空且非全部 kind 被隱藏時不歸咎於 node kind

- **WHEN** 仍有可切換 kind 為顯示狀態,但過濾與 ingress 隱藏共同作用使可見節點集合為空
- **THEN** canvas 顯示 `All elements filtered out`(而非 `All node types filtered`),legend 的 kind 列維持顯示狀態(`Hide` affordance)

#### Scenario: 隱藏 / 還原一輪不重排 visibleKinds

- **WHEN** 使用者隱藏再還原同一 kind
- **THEN** 寫回的 `visibleKinds` 與原陣列逐元素相等(canonical 順序,非附加於末尾)

### Requirement: 裝飾性 compound 群組使用 per-kind 固定色彩與 kind 前綴標籤

裝飾性 `cluster` / `namespace` / `application` 群組的 accent 色(`clusterColor` / `namespaceColor` / `applicationColor`)MUST 為**每種群組 kind 各一個固定色** —— 同 kind 的每個群組節點無論名稱皆共用一色,而非將名稱 hash 為 per-instance 顏色。三種 kind 的顏色 MUST 彼此相異,且 MUST 與既有 edge 顏色表(`EDGE_STYLE_BY_TYPE`)及 status 顏色(normal 綠、warning 黃、critical 紅)有足夠對比,使邊線橫越任一 compound 背板時仍清晰可辨。

裝飾性 `cluster` / `namespace` / `application` 群組的 **canvas label** MUST 以**首字大寫的 kind 詞加 `: `**(冒號加一個空格)為前綴,形式為 `${PREFIX}: ${name}` —— 名為 `prod` 的 `cluster` 群組 canvas label 為 `Cluster: prod`,名為 `checkout` 的 `namespace` 為 `Namespace: checkout`,名為 `mongo` 的 `application` 為 `Release Unit: mongo`。**`application` 群組的顯示前綴為「Release Unit」** —— 僅為顯示文字;內部 `type` / `kind` 字串、`isApplication` flag、`applicationColor` 與 CSS 選擇器(`node[?isApplication]`)皆維持 `application`。

此前綴 MUST 以 **stylesheet 中 render-only 的 function `label` mapper** 實作(選擇器 `node[?isCluster]` / `node[?isStorageCluster]` / `node[?isNamespace]` / `node[?isApplication]`),**MUST NOT** 由正規化層寫入 `data.label` —— `data.label` MUST 維持裸的上游名稱(與 `data.cluster` / `data.namespace` / `data.application` 一致)。如此 hover / pinned tooltip 的名稱 title、以及任何以 `data.label` 作為 identity 或顯示名稱的路徑都取得裸名稱,前綴**只**出現在 canvas compound 命名。本需求僅適用於裝飾性 compound 群組(`cluster` / `storage-cluster` / `namespace` / `application`),不影響任何葉節點(pod / service / pvc / node / netapp-aggr)或 `controller` / `netapp-node` compound 的 label 格式。整個 canvas label(前綴 + 名稱)維持既有的 `font-weight: 600` —— 單一 cytoscape label 不支援同一節點內混合字重,故前綴與名稱共用一種字重。

#### Scenario: 同 kind 的多個 cluster 群組共用一色

- **WHEN** 圖中有兩個以上名稱不同的 `cluster` 群組節點
- **THEN** 每個 `cluster` 群組節點的 `data.clusterColor` 皆為同一固定值,不受名稱差異影響

#### Scenario: 三種 kind 的固定色彼此相異且與 edge 色有對比

- **WHEN** Graph 視圖渲染 `cluster` / `namespace` / `application` 群組
- **THEN** 其三個固定色彼此相異,且無一與 `EDGE_STYLE_BY_TYPE` 中任一 edge 色或 status 色(綠 `#73BF69` / 黃 `#F2CC0C` / 紅 `#E02F44`)完全相同

#### Scenario: 裝飾性群組的 canvas label 帶 kind 前綴而 data.label 維持裸名稱

- **WHEN** 名為 `prod` 的 `cluster` 群組、名為 `checkout` 的 `namespace` 群組、名為 `mongo` 的 `application` 群組被正規化並渲染
- **THEN** 其 `data.label` 值分別為 `prod`、`checkout`、`mongo`(裸名稱)
- **AND** stylesheet 於 canvas 渲染的 label 分別為 `Cluster: prod`、`Namespace: checkout`、`Release Unit: mongo`

#### Scenario: 非裝飾性節點 label 不受影響

- **WHEN** `pod` / `service` / `pvc` / `node` / `netapp-aggr` 葉節點或 `controller` / `netapp-node` compound 節點被正規化
- **THEN** 其 `data.label` 維持原名稱,不套用任何 kind 前綴

### Requirement: physical-network 與 k8s node compound header 標籤對齊

physical-network fabric box(`kind: network`,包住 switches 的 compound)與 k8s `node` **compound** box(node-layout 模式下包住 pod、即為 `:parent` 者)的 header 標籤,MUST 在**大小寫與字級**上對齊三個裝飾性群組 header:physical-network 名稱 title-case(`physical network` → `Physical Network`),k8s node 加 `Node: ` 前綴(`worker-0` → `Node: worker-0`),字級各自提升(network 17、node 18)以匹配群組 header。

k8s node 的此對齊 MUST **僅在該 node 為 compound 時**套用:選擇器為 `node[kind='node']:parent`(node-layout 下包住 pod)加上 `node[kind='node'].cy-expand-collapse-collapsed-node`(收合後子節點移除、失去 `:parent`,以 class 維持 header 穩定)。**controller-layout 下 k8s node 為葉節點**(pod 掛在 controller 下,非掛在 node),不符任一選擇器,MUST 回退為 base `node` 一般標題(裸 `data.label`、base 字級、標籤置底)。葉節點永不為 compound,故永不帶 collapsed class,sibling 選擇器不會外洩至葉節點。

此對齊 MUST 以 **stylesheet 的 render-only function `label` mapper** 實作,**MUST NOT** 改寫 `data.label` —— 因 k8s `node` 的 `data.label` 為其 identity 值:`/dashboard` 查詢的 `name=` 參數與 detail panel 標題(見 `node-detail`)皆直接讀取之,若把前綴烤進 `data.label` 會送出錯誤的 `name=Node: worker-0` 並讓標題與 kind badge 重複。裝飾性群組的 kind 前綴同樣為 render-only(見「裝飾性 compound 群組使用 per-kind 固定色彩與 kind 前綴標籤」),三者契約一致:前綴只服務畫布 compound naming。switch 葉節點不在此範圍。

#### Scenario: physical-network fabric box header title-case 且字級放大

- **WHEN** Graph 視圖渲染 `kind: network` 的 physical-network fabric box(`data.label` 為 `physical network`)
- **THEN** 其 on-canvas 標籤渲染為 `Physical Network`(逐字 title-case)、`font-size` 17、`font-weight` 600
- **AND** 其 `data.label` 維持 `physical network` 不變

#### Scenario: compound k8s node box header 加 `Node: ` 前綴且字級放大,identity 不變

- **WHEN** Graph 視圖於 node-layout 渲染一個包住 pod 的 compound k8s node(`kind: node`、`:parent`、`data.label` 為 `worker-0`)
- **THEN** 其 on-canvas 標籤渲染為 `Node: worker-0`、`font-size` 18、`font-weight` 600
- **AND** 其 `data.label` 維持 `worker-0`,故 `/dashboard` 查詢的 `name=` 參數與 detail panel 標題皆為 `worker-0`(不含前綴)
- **AND** 該 compound 收合後(`.cy-expand-collapse-collapsed-node`)仍維持 `Node: worker-0` 對齊 header

#### Scenario: leaf k8s node 回退一般標題

- **WHEN** Graph 視圖於 controller-layout 渲染一個葉 k8s node(`kind: node`、非 `:parent`、`data.label` 為 `worker-9`)
- **THEN** 其標籤回退為 base `node` 一般標題:裸 `worker-9`、base 字級(11)、標籤置底,不加 `Node: ` 前綴、不放大

### Requirement: Compound 收合後的 meta-edge 以直線繪製

當 cytoscape expand-collapse 收合 compound parent 時,跨邊界的邊會被重指到收合容器並加上 `cy-expand-collapse-meta-edge` class。stylesheet MUST 對 `edge.cy-expand-collapse-meta-edge` 使用 `curve-style: 'straight'`(直線),並維持既有加寬 cue(`width: 2.5`)。Meta-edge MUST NOT 強制覆寫 `line-color` / 箭頭色 —— 色彩與線型仍 cascade 自 base `edge` rule(依原始 `data.edgeType`)。此規則僅影響收合後合成的 meta-edge;一般邊的 routing(fabric `taxi`、其餘 `bezier`)不變。

#### Scenario: 收合後 meta-edge 為直線且加寬

- **WHEN** 一個 compound parent 被收合,且至少一條跨邊界邊被 expand-collapse 重指為 `cy-expand-collapse-meta-edge`
- **THEN** 該 meta-edge 的 `curve-style` 為 `straight`、`width` 為 `2.5`
- **AND** 其 `line-color` / 箭頭色仍依原始 `edgeType` 自 base `edge` rule cascade(meta-edge 規則本身不釘死色彩)

#### Scenario: 非 meta 邊 routing 不受影響

- **WHEN** 圖中同時存在未收合的一般邊(含 fabric `taxi` 與非 fabric `bezier`)與收合產生的 meta-edge
- **THEN** 一般邊維持其既有 routing;`taxi` / `bezier` 選擇器行為不變

### Requirement: Hover tooltip 顯示 edge 的 RED 與 storage I/O metrics

當使用者 hover **帶 `data.metrics`** 的邊時,hover tooltip MUST 在既有 `edgeType` 列**之後**、`labels` 分隔線**之前**,依序附加該邊所屬 family 的 promoted attr 列(列 key 為固定的英文 UI 字串)。`metrics` 為兩個互斥 family 的 union(見 `graph-data-source`),tooltip MUST 以 **`'rate' in metrics`** 判別、只渲染該 family 的列 —— **MUST NOT** 假設任意 `metrics` 物件上存在 `rate`。

**RED family**(trace 導出的 call 邊),最多三列:

| row key         | source field          | display format                                              |
| --------------- | --------------------- | ----------------------------------------------------------- |
| `rate`          | `metrics.rate`        | `<value> req/s`                                             |
| `errorRate`     | `metrics.errorRate`   | `<value×100>%`                                              |
| `duration(p90)` | `metrics.p90ServerMs` | `<value> ms`(小於 `1000`);`>= 1000` 時轉為 `<value/1000> s` |

**I/O family**(僅 `pvc-to-netapp-aggr` 邊),最多八列,固定順序 —— 六個**量測**列在前、兩個**宣告上限**列在後:

| row key            | source field               | display format                                               |
| ------------------ | -------------------------- | ------------------------------------------------------------ |
| `read`             | `metrics.readOps`          | `<value> ops/s`                                              |
| `write`            | `metrics.writeOps`         | `<value> ops/s`                                              |
| `read latency`     | `metrics.readLatencyUs`    | `<value> µs`(小於 `1000`);`>= 1000` 時轉為 `<value/1000> ms` |
| `write latency`    | `metrics.writeLatencyUs`   | 同上                                                         |
| `read throughput`  | `metrics.readBytesPerSec`  | `<十進位 byte 單位>/s`(例如 `5.24 MB/s`)                     |
| `write throughput` | `metrics.writeBytesPerSec` | 同上                                                         |
| `max iops`         | `metrics.maxIops`          | `<value> ops/s`                                              |
| `max throughput`   | `metrics.maxBytesPerSec`   | `<十進位 byte 單位>/s`(例如 `250 MB/s`)                      |

兩個上限列置於量測列**之後**,因為它們是 volume 的 QoS policy group 的**設定值**而非觀測值:讀者的第一個問題是 volume 現在在做什麼,而非它被允許做什麼。每個上限列 MUST 使用與其對應量測列**完全相同**的 formatter(`max iops` 走 ops 階梯、`max throughput` 走十進位 byte 階梯),使 `read throughput: 5.24 MB/s` 與 `max throughput: 250 MB/s` 一眼可比 —— 這正是後端將 `max_bytes_per_sec` 轉為 bytes per second 的理由。

數值格式規則:

- `rate` / `errorRate` / `duration(p90)` / `read` / `write` / `read latency` / `write latency` / `max iops` 共用一組純函式:值 MUST 以不超過 **3 位有效數字**渲染並去除尾零(`5` 而非 `5.00`;`3.2` 而非 `3.20`)。
- **`read throughput` / `write throughput` / `max throughput` 為例外**(三個 bytes-per-second 列):其值為 bytes/s,裸的 3 位有效數字渲染在實際量級下會退化為不可讀的指數,故 MUST 使用**節點 `usage` 列已採用的十進位 byte 單位階梯**(`B` / `KB` / `MB` / `GB` / `TB` …)加 `/s` 後綴。共用一個階梯使 `700 GB` 的 aggregate 與 `5.24 MB/s` 的邊在同一尺度上閱讀。
- **非零值 MUST NOT 被格式化為 `0`**:捨入可以損失位數但 MUST NOT 損失量級。極小值(如 `3.86e-7` req/s、`6.7e-8` 的比率、或 `12 B/s`)MUST 保留其量級。
- `errorRate` 為 `[0,1]` 的比率,顯示前 MUST 乘以 100 並加 `%` 後綴;`0` MUST 渲染為 `0%`(意為「已量測、無失敗」)。

失敗強調規則:當 `errorRate` **已量測且非零**(`errorRate !== 0`)時,該列的**值** MUST 以 app 主題的 error 色渲染,key 維持次要色,使該列不破壞清單節奏。判定 MUST 基於**數值本身**而非格式化後的字串 —— `6.7e-8` 渲染為 `0.0000067%`,仍是真實的失敗比率。`errorRate: 0` MUST 維持中性色,缺 `errorRate` 時 MUST 不渲染該列(因此亦無顏色)。其他所有列(RED 的 `rate` / `duration(p90)` 與 I/O 的**全部**列,含兩個上限)MUST NOT 上色 —— I/O 量測沒有「失敗」的概念,高 throughput 或高 latency MUST NOT 被當作錯誤上色。接近或超過宣告上限亦 MUST NOT 觸發上色或警告:上限是設定而非閾值,QoS throttling 是正常運作而非故障。

省略規則:

- 邊**無** `data.metrics` 時,tooltip MUST 與現狀完全相同 —— 無 metrics 列、無標題、無 `N/A` 式 placeholder。
- family 內任一選填欄位缺值時,其列 MUST NOT 渲染(**尤其 MUST NOT 顯示 `0`**:缺值意為「無法量測」,與量測到零是不同狀態)。此規則適用於 RED 的 `errorRate` / `p90ServerMs` 與 I/O 的全部八個欄位。對兩個上限欄位,區別形式相同但讀法不同:缺值表示 volume 完全沒有宣告上限,MUST NOT 呈現為 `0` 或無限制 sentinel。
- metrics 值 MUST NOT 出現在 `labels` 區塊 —— 它們來自 `data.metrics`,而非後端的 labels map。

兩個 family 皆只影響浮動 hover 模式下的 **edge** tooltip。pinned 模式只適用於被選取的 **node**,故不受本需求影響;且邊在 canvas 上的顏色、寬度、線型與 label MUST NOT 因任一 family 的 metrics 而改變。

#### Scenario: hover 帶完整 RED 的邊顯示三列

- **WHEN** 使用者 hover `edgeType: 'pod-calls-service'` 且 `data.metrics = { rate: 5, errorRate: 0.2, p90ServerMs: 45 }` 的邊
- **THEN** tooltip 依序顯示 `edgeType: pod-calls-service`、`rate: 5 req/s`、`errorRate: 20%`、`duration(p90): 45 ms`
- **AND** 三個 RED 列位於 `edgeType` 之後、`labels` 分隔線之前

#### Scenario: 無 metrics 的邊維持現狀

- **WHEN** 使用者 hover `pod-mounts-pvc` 邊(無 `data.metrics`)
- **THEN** tooltip 只顯示 `source → target` title、`edgeType` 列與既有 labels —— 無任一 family 的 metrics 列,亦無 placeholder

#### Scenario: 省略的 errorRate 不渲染為 0%

- **WHEN** 使用者 hover `data.metrics = { rate: 3 }` 的邊(`errorRate` 與 `p90ServerMs` 皆不存在)
- **THEN** tooltip 只附加 `rate: 3 req/s` 列;不得出現 `errorRate` 或 `duration(p90)` 列

#### Scenario: 量測到零的失敗率顯示 0%

- **WHEN** 使用者 hover `data.metrics = { rate: 1, errorRate: 0 }` 的邊
- **THEN** tooltip 顯示 `errorRate: 0%`(明確區別於前一情境的「無列」)
- **AND** 該值以中性文字色渲染,永不以 error 色渲染

#### Scenario: 非零失敗率以 error 色標示

- **WHEN** 使用者 hover `data.metrics = { rate: 5, errorRate: 0.2 }` 的邊
- **THEN** `errorRate` 列的**值**以 app 主題的 error 色渲染,其 key 維持既有次要色
- **AND** 同一 tooltip 中的 `rate` 與 `duration(p90)` 列 MUST NOT 上色

#### Scenario: 極小值不被格式化為 0

- **WHEN** 使用者 hover `data.metrics = { rate: 3.86e-7, errorRate: 6.7e-8 }` 的邊
- **THEN** `rate` 列顯示 `3.86e-7 req/s`(指數形式),`errorRate` 列顯示 `0.0000067%`(完整小數)
- **AND** 兩者皆不得渲染為 `0 req/s` / `0%`
- **AND** 該 `errorRate` 仍以 error 色渲染(上色由數值 `6.7e-8 !== 0` 決定,而非格式化字串)

#### Scenario: 長 duration 以秒渲染

- **WHEN** 使用者 hover `data.metrics.p90ServerMs = 2500` 的邊
- **THEN** `duration(p90)` 列顯示 `2.5 s`(而非 `2500 ms`)

#### Scenario: metrics 不改變 canvas 視覺

- **WHEN** 圖中同時有帶 metrics(RED 或 I/O)與不帶 metrics 的邊
- **THEN** 兩者的線色、寬度、線型、箭頭與 canvas label 完全由既有的 edge-type / ingressPath / relation 規則決定,與 `metrics` 無關

#### Scenario: storage 邊顯示全部八個 I/O 列

- **WHEN** 使用者 hover `edgeType: 'pvc-to-netapp-aggr'` 且 `data.metrics = { readOps: 150, writeOps: 40, readLatencyUs: 830, writeLatencyUs: 1200, readBytesPerSec: 5242880, writeBytesPerSec: 1048576, maxIops: 5000, maxBytesPerSec: 262144000 }`(無 `rate`)的邊
- **THEN** tooltip 依序顯示 `read: 150 ops/s`、`write: 40 ops/s`、`read latency: 830 µs`、`write latency: 1.2 ms`、`read throughput: 5.24 MB/s`、`write throughput: 1.05 MB/s`、`max iops: 5000 ops/s`、`max throughput: 262 MB/s`,且無 `rate` / `errorRate` / `duration(p90)` 列

#### Scenario: 缺值的 I/O 欄位不渲染列

- **WHEN** storage 邊的 `data.metrics` 只有 `{ readOps: 150, readBytesPerSec: 5242880 }`
- **THEN** tooltip 只顯示 `read` 與 `read throughput` 列;`write` / `read latency` / `write latency` / `write throughput` / `max iops` / `max throughput` 皆不渲染(無 `0`、無 placeholder)

#### Scenario: 有量測但無宣告上限的 volume

- **WHEN** storage 邊帶六個量測欄位但無 `maxIops` 與 `maxBytesPerSec`
- **THEN** tooltip 顯示六個量測列且**無**上限列 —— 缺值永不渲染為 `0`、`unlimited` 或 `max …: —` placeholder

#### Scenario: 上限列與其量測列共用 formatter

- **WHEN** storage 邊帶 `readBytesPerSec: 5242880` 與 `maxBytesPerSec: 262144000`
- **THEN** 兩列渲染為 `5.24 MB/s` 與 `262 MB/s` —— 兩者同走十進位 byte 階梯,讀者無需心算換算單位即可比較

#### Scenario: throughput 走 byte 單位階梯而非裸的 3 位有效數字

- **WHEN** storage 邊的 `readBytesPerSec` 為 `5242880`、`writeBytesPerSec` 為 `12`
- **THEN** 兩列分別渲染為 `5.24 MB/s` 與 `12 B/s` —— 與節點 `usage` 列相同的十進位單位階梯;MUST NOT 渲染為 `5.24e6 B/s`,亦 MUST NOT 將小值捨入為 `0`

#### Scenario: 無任何 I/O 列取失敗色

- **WHEN** storage 邊帶全部八個 I/O 欄位,且其量測 throughput 高於宣告上限
- **THEN** 八個列的值皆以中性色渲染 —— error 色保留給已量測且非零的 `errorRate`,超過上限永不被當作故障上色

### Requirement: Node usage 視覺(資料驅動於 usage、與 kind 無關)

系統 SHALL 為**任何帶 `data.usageRatio` 的節點**在 canvas 上繪出 usage 視覺,使操作者無需開啟 tooltip 即可一眼看出接近容量上限的儲存。實務上該集合為 `pvc`(kubelet volume stats)與 `netapp-aggr`(Harvest aggregate space),但規則 MUST **只以 `usageRatio` 的存在**觸發,且 **MUST NOT** 硬編碼任何 kind 清單 —— 當後端未來為其他 kind 加入 `usage` 時自動套用,無需更動 stylesheet。

`usageRatio` 由正規化層攤平為節點 `data` 的頂層數值欄位(見 `graph-data-source`),因為 cytoscape 選擇器既不能讀巢狀 `data`,也不能在選擇器內做除法。

視覺編碼規則:

- usage MUST 繪於 **kind SVG 的圓柱輪廓內部**(由下而上,高度與 `usageRatio` 成比例),且 **MUST NOT** 以 cytoscape 的 `background-fill` 填滿 40px 節點框 —— 方框填色會溢出圓柱輪廓,高利用率時更會蓋住 `netapp-aggr` 的內部層線。
- 液體顏色 MUST 依三段閾值取 `STATUS_COLOR`,且 MUST 以 **fill-opacity 0.4** 繪製(先於線稿繪出,線稿維持不透明,使 aggregate 的層線仍可讀):
  - `usageRatio < 0.8` → `STATUS_COLOR.normal`(`#73BF69`)
  - `usageRatio >= 0.8` → `STATUS_COLOR.warning`(`#F2CC0C`)
  - `usageRatio >= 0.9` → `STATUS_COLOR.critical`(`#E02F44`)
- 節點的 kind icon MUST 維持原尺寸(`NODE_SIZE` / `background-fit: contain`),label MUST 維持 `data(label)` 而非改寫為百分比。
- 無 `usageRatio` 的節點(所有非儲存節點,以及 `usage` 不完整的儲存節點)MUST 維持既有背景與未填色 icon,不套用液體 —— **缺資料 MUST NOT 渲染為 0%**。
- k8s `status` 外框規則 MUST 不受影響:液體佔用內部顏色通道、status 佔用外框,兩者可同時出現在一個節點上。

此視覺**僅為呈現**:MUST NOT 影響選取、過濾、layout 或 tooltip 內容,MUST NOT 回寫任何 `data` 欄位。tooltip 中的文字 `usage` 列(見「Hover tooltip 顯示元素 metadata」)與此視覺是同一資料的兩種呈現,MUST 並存。

#### Scenario: 帶 usageRatio 的節點渲染圓柱液體

- **WHEN** `netapp-aggr` 節點帶 `usageRatio: 0.7`、`pvc` 節點帶 `usageRatio: 0.5`
- **THEN** 兩者的 kind SVG 內皆有由下而上的圓柱液體,高度分別約為圓柱高的 70% 與 50%;節點框本身 MUST NOT 套用 `background-fill: linear-gradient`;且兩者經**同一個** `usageRatio` 觸發規則,而非 per-kind 觸發

#### Scenario: 無 usageRatio 的節點無液體

- **WHEN** `pvc` 節點無 `usage`(或其 `usage` 只有 `capacityBytes`,故正規化層未寫入 `usageRatio`)
- **THEN** 該節點維持既有背景與未填色 icon,MUST NOT 渲染任何液體,MUST NOT 被渲染為 0% 滿

#### Scenario: usage 液體依 80/90 閾值套用 STATUS_COLOR

- **WHEN** 三個節點的 `usageRatio` 分別為 `0.7`、`0.8`、`0.9`
- **THEN** 其液體顏色分別為 `STATUS_COLOR.normal` / `warning` / `critical`(`#73BF69` / `#F2CC0C` / `#E02F44`),皆為 fill-opacity 0.4;`0.79` MUST 仍為綠

#### Scenario: usage 液體不遮蔽 kind 線稿與 status 外框

- **WHEN** 渲染帶 `usageRatio: 0.7`(含兩條內部層線)與 `status` 的 `netapp-aggr`
- **THEN** 其圓柱輪廓與內部層線維持可見(液體位於線稿之下且半透明),icon 尺寸不變,其 status 外框色仍依既有規則(液體只影響 SVG 內部,永不影響外框)

#### Scenario: usage 視覺不影響互動與 layout

- **WHEN** 使用者對帶 `usageRatio` 的節點進行選取、過濾或切換 pod-parent mode
- **THEN** 行為與同 kind 但無該欄位的節點完全相同(填色純為呈現,不參與可見性判定、layout 或選取解析)

### Requirement: `role` / `ready` / `volumename` / `svm` 的 promoted attribute 列

節點屬性建構邏輯 —— 同時餵入浮動 hover tooltip 與 pinned selection card 的單一來源 —— SHALL 額外產生以下列,各自僅在來源值為非空字串時產生,永不以空列或 placeholder 列出現:

| Row key      | Source                   | Emitted on                         |
| ------------ | ------------------------ | ---------------------------------- |
| `role`       | `data.labels.role`       | 任何帶該 label 的節點,無 kind 限制 |
| `ready`      | `data.readyStatus`       | 後端提供該欄位的 K8s node          |
| `volumename` | `data.labels.volumename` | 帶該 label 的 claim                |
| `svm`        | `data.labels.svm`        | 帶該 label 的 claim                |

列順序 SHALL 為:`kind`、`role`、`namespace`、`application`、`ipAddress`、`storageclass`、`volumename`、`svm`、`health`、`ready`、`usage`。`role` 緊接在 `kind` 之下,因為它限定**該節點是什麼**;兩個 storage label 列與 `storageclass`、`usage` 並列,因為它們會被一起閱讀。

`role` SHALL 對**任何**值 promote,不限於 ingress 對。它對兩種 ingress 形態至關重要 —— 兩者都是普通的 `type="service"` 節點,此 label 是唯一區分它們的資訊,而兩者在 ingress toggle 下行為不同 —— 但無法辨識的 role 亦須維持可讀,而非被過濾掉。

`volumename` 與 `svm` 是 NetApp join 所依賴的鍵:`volumename` 是 Harvest relabel 規則用來匹配 FlexVol 的值,`svm` 界定 QoS 讀取的範圍。當 claim 無法連到 aggregate 時,它們是操作者最先檢查的東西,故它們屬於 storage 列旁,而非埋在 raw label 清單中。帶 `volumename` 而**無** `svm` 的 claim 本身就是「無 Harvest label series 匹配到它」的訊號;缺失的列 MUST NOT 被補上。

每個被 promote 為列的 label key SHALL 自 tooltip 分隔線下方的 raw label 清單中抑制,由 promote 與抑制**共用的單一** promoted-key 清單驅動 —— 如此新增 promote 不會留下重複列。

#### Scenario: 兩種 ingress 形態一眼可辨

- **WHEN** 使用者 hover 帶 `labels.role = "ingress-lb"` 的 `service` 節點
- **THEN** tooltip 於 `kind` 正下方顯示 `role: ingress-lb` 列,且 labels 分隔線下方不出現重複的 `role` 列

#### Scenario: K8s node 的 Ready 條件顯示,缺值時不顯示

- **WHEN** 使用者 hover 帶 `readyStatus: "NotReady"` 的 K8s node
- **THEN** tooltip 顯示 `ready: NotReady`
- **AND** hover 無 `readyStatus` 的 K8s node 時不顯示 `ready` 列 —— 不是 `ready: Unknown`,也不是空列

#### Scenario: 解析到 PV 但未 join 到 aggregate 的 claim

- **WHEN** 使用者 hover 帶 `labels.volumename` 而無 `labels.svm` 的 `pvc`
- **THEN** tooltip 顯示 `volumename` 列且無 `svm` 列

### Requirement: 節點身分以 icon 編碼

系統 SHALL 以 per-kind **icon** 承載節點身分(`kind`),取代先前的 per-kind shape 編碼。所有葉節點 MUST 以統一的 `round-rectangle` 容器渲染,kind 由節點的 `background-image`(其 icon)區分。`ICON_SVG_BY_KIND` MUST 為 kind → icon 對照的單一來源,由 stylesheet 與 legend 共用(接手先前 shape 表所承擔的身分角色)。`NodeKind` 列舉 MUST 為 `pod` / `node` / `pvc` / `service` / `external`,加上 workload kind `deployment` / `statefulset` / `daemonset` / `job` / `cronjob`、physical-network kind `switch`(後端 v0.0.18)、**physical-storage kind `netapp-aggr`(ONTAP aggregate,葉節點)與 `netapp-node`(ONTAP controller,**真正的** compound 容器 —— 見下方 compound icon 需求)**,以及包住 switch fabric 的虛擬**容器** kind `network`(`network > switch` 群組;其 wifi glyph 只在收合時繪出,展開時與其他容器一樣無 icon;收合時它在 Node Kinds legend 中以 label `physical network` 取代 `switch` —— 見「Legend」與 `switch-tier-layout`)。`storageclass` MUST NOT 存在(後端已自契約移除;physical storage chain 取代之)。`others` MUST NOT 存在(後端已自契約移除;`external` 吸收了該 fallback)。ReplicaSet **不是** `NodeKind` —— 後端將 `Deployment → ReplicaSet → Pod` 折疊並將 pod 直接歸屬於其頂層 controller,故 ReplicaSet 永不出現在圖中、不需 icon。

`netapp-aggr` 與 `netapp-node` MUST 各有自己的 icon,且兩者 MUST 視覺可辨(aggregate 採 storage-pool 語彙,controller 採 chassis / controller 語彙),使共享 `Storage` category 的兩個 tier 在 legend 與 canvas 上不致混淆。

#### Scenario: 已知 kind 對應正確 icon

- **WHEN** 節點資料帶 `kind: 'deployment'`(或任一其他已定義 kind)
- **THEN** 該節點以統一的 `round-rectangle` 容器渲染,其置中 `background-image` 為 `ICON_SVG_BY_KIND['deployment']` 的 icon,且對照與 icon 對照表一致

#### Scenario: 葉節點形狀不再編碼 kind

- **WHEN** 兩個不同 kind 的葉節點(例如 `pod` 與 `service`)同時渲染
- **THEN** 兩者容器皆為 `round-rectangle`(形狀不再區分 kind),僅 icon 區分身分

#### Scenario: 兩個 NetApp kind 有可辨的 icon

- **WHEN** 單一圖中同時渲染 `kind: 'netapp-aggr'` 與 `kind: 'netapp-node'` 節點
- **THEN** `ICON_SVG_BY_KIND` 為兩者提供不同的 icon,且 `storageclass` 不再是 `ICON_SVG_BY_KIND` 的 key

### Requirement: icon 隨 app 主題單色上色

系統 SHALL 提供純的 icon 上色函式,將 line-art SVG 的 `currentColor` sentinel 替換為傳入的主題色 `hex`,再以 `encodeURIComponent` 編碼為 `data:image/svg+xml,...` 字串(**非 base64** —— cytoscape style 文件明示 SVG data-URI 用 encodeURIComponent、勿用 base64)。每個 icon SVG MUST 帶有 XML header(`<?xml version="1.0" encoding="UTF-8"?>`)與明確 `width` / `height`;缺 XML header 時 cytoscape 在 canvas 上 rasterise 為空白(同一 URI 作為 `<img>` 卻正常,故 legend 顯示而 canvas 空白)。上色 MUST 集中於以 app theme 為輸入的純 stylesheet 工廠:以 `function(ele)` mapper 依 `ele.data('kind')` 查 `ICON_SVG_BY_KIND` 並以主題色產生 `background-image` data-URI;`background-fit` MUST 為 `contain`、`background-clip` 為 `none`,icon 寬高 MUST 內縮(約 60%)使容器邊框 / 狀態色仍可見。產生的 data-URI MUST 以 `(kind, hex)` 為鍵 memoize(避免 per-node 唯一 URI 破壞 cytoscape 影像快取)。正規化層 MUST NOT 涉及 icon 或主題(維持純 anti-corruption)。

#### Scenario: 主題切換時 icon 重新上色且不重建 instance

- **WHEN** 使用者於 app-shell 切換 dark ↔ light theme
- **THEN** stylesheet 工廠以新主題色重算每個 kind 的 icon data-URI 並套用至既有 instance;instance 引用不變;icon 顏色隨主題改變

#### Scenario: icon 上色函式正確編碼

- **WHEN** 以含 `currentColor` 的 SVG 與某主題 hex(如 `#c3cbd9`)呼叫 icon 上色函式
- **THEN** 回傳字串中 `currentColor` 已被該 hex 取代,且所有 `#` 編碼為 `%23`,字串以 `data:image/svg+xml,` 起始(非 `;base64,`)

#### Scenario: 相同 (kind, hex) 回傳穩定 memoized 結果

- **WHEN** 同一 `(kind, hex)` 多次經由 stylesheet 取得 icon data-URI
- **THEN** 回傳同一字串(referential 穩定),不重複編碼

### Requirement: Compound 容器的 icon(展開時無、收合或葉節點時置中)

當 `node` / `controller` / `netapp-node` 節點為**展開**的 compound parent(有可見子節點,匹配 `:parent`)時,系統 MUST NOT 渲染資源 icon(`node:parent` 設 `background-image: 'none'`),且 MUST 只顯示 label 與容器框,使 icon 不會平鋪於子節點之後。同樣的節點在**收合**狀態(非 `:parent`)於中央顯示其 kind icon,由 base `node` 選擇器依 `data.kind` 解析。其中 `controller` 是後端於 D6 下直接發出的 compound 群組,但仍帶真正的 `kind`(enrichment 自子 pod 的 `owner.kind` 導出),故其行為與前端先前合成的 controller 完全相同:**收合時為 Workloads glyph、展開時為框。**

`netapp-node` 屬於同一類,是**後端契約直接命名**的真實節點 compound parent(storage chain `storage-cluster > netapp-node > netapp-aggr`):它帶真正的 `kind`、可選取、有 icon,同時框住其 `netapp-aggr` 子節點。因此它 MUST 完全遵循 `node` / `controller` 的展開 / 收合 icon 行為(展開時為框、收合時為其 kind icon)。`netapp-aggr` 是其下的葉節點,永遠以葉節點身分繪出其 icon。

`storageclass` 已自 `NodeKind` 移除,其展開 / 收合與葉節點 glyph 行為隨之消失;不再有對應規則。

任何**無 `kind`** 的裝飾性 compound 群組 MUST NOT 在任一狀態(展開或收合)渲染資源 icon。除既有的 `cluster` 容器(`isCluster`)外,這涵蓋後端於 D6 下發出的 `namespace`(`isNamespace`)、`application`(`isApplication`)與 `storage-cluster`(`isStorageCluster`)群組:它們皆為 kind-less、僅 accent 的群組框。對應的 stylesheet 選擇器(`node[?isCluster]` / `node[?isNamespace]` / `node[?isApplication]` / `node[?isStorageCluster]`)MUST 強制 `background-image: 'none'`,只呈現 label 與 accent 框(收合時的資料夾 glyph 見「收合的裝飾性群組顯示資料夾 icon」,它是 `NodeKind` 之外的補缺,不是資源 icon)。

#### Scenario: 展開的容器無 icon

- **WHEN** `node` / `controller` / `netapp-node` 容器持有可見子節點(展開,匹配 `:parent`)
- **THEN** 該容器的 `background-image` 為 `none`,中央留給子節點,只顯示 label 與容器框

#### Scenario: 收合的 node / controller 顯示置中的 kind icon

- **WHEN** `node`、`controller` 或 `netapp-node` 容器被收合(非 `:parent`)
- **THEN** 其中央顯示其 `kind` icon —— 收合的 K8s node 顯示 node icon、收合的 controller 顯示其 Workloads glyph、收合的 `netapp-node` 顯示其 controller icon

#### Scenario: storageclass 葉節點 glyph 不再存在

- **WHEN** 檢視 `ICON_SVG_BY_KIND` 與 stylesheet 的 kind 解析
- **THEN** 不存在 `storageclass` kind(已自契約與列舉移除),此情境原描述的舊葉節點 glyph 行為隨之消失;`netapp-aggr` 葉節點 icon 取代其位置

#### Scenario: kind-less 裝飾性群組無資源 icon

- **WHEN** 渲染 `isCluster` / `isNamespace` / `isApplication` / `isStorageCluster` compound 容器,無論展開或收合
- **THEN** 該容器不帶資源 icon(`background-image: 'none'`,收合時的資料夾 glyph 除外),僅作為其 accent 色的群組框

### Requirement: 未知 kind 走 fallback icon 且預設可見

當節點 `data.kind` 不在 `ICON_SVG_BY_KIND` keys 中時,系統 MUST 以通用 fallback icon 渲染,且該節點 MUST 預設可見(延續既有 unknown-kind 可見哲學),不拋出例外,使上游 / 後端新增資源類型時不會無聲消失。

#### Scenario: 未知 kind 顯示 fallback icon

- **WHEN** 上游回傳節點 `data.kind` 不在 `ICON_SVG_BY_KIND` 中(例:`ingress`)
- **THEN** 該節點以統一容器 + 通用 fallback icon 渲染,預設可見,console 不報錯

### Requirement: icon 上色為純函式且可 headless 驗證

icon 上色函式 MUST 為純函式(相同輸入永遠得到相同輸出、無副作用、不依賴 DOM 或 cytoscape instance),含 icon 的 stylesheet 工廠 MUST 以 `(theme, …)` 為輸入決定性地產生 stylesheet。兩者的驗證 MUST 為 headless,不斷言像素級渲染。

#### Scenario: 純函式與 stylesheet 可決定性驗證

- **WHEN** 於 headless 環境(無瀏覽器 canvas)以固定輸入呼叫 icon 上色函式與 stylesheet 工廠
- **THEN** icon 上色函式對 `currentColor` 替換、`#`→`%23` 編碼、非 base64、`(kind, hex)` memoize 穩定性皆得到預期結果;stylesheet 工廠對相同 theme 產生相同的節點樣式(含帶 icon 的 `background-image`),可逐字比對
