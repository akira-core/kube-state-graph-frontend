## Purpose

定義 Graph view 的 pod-parent mode:使用者在 `controller`(預設,原樣消費後端階層 `cluster > namespace > application > controller > pod`)與 `node`(基礎設施視圖 `cluster > node > pod`)兩種 compound 拓樸間切換的控制、純函式的拓樸轉換、各模式的可繪 edge 集合、模式切換後恰一次的重新佈局,以及 controller 模式預設全摺疊 controller 容器的行為。此模式為 ephemeral view state,不持久化。

## ADDED Requirements

### Requirement: Pod-parent 模式切換控制

Graph view SHALL 在 legend **最上方**(早於 cluster 圖例等所有其他 legend section)提供一個 **layout 分段控制**(segmented control,兩選項 `Node` / `Controller`,標籤 `Layout`),用以在 `node` 與 `controller`(預設)兩種 pod compound 拓樸間切換,並高亮反映目前模式。此分段控制 MUST 為模式切換的唯一入口:edge-type legend section MUST NOT 渲染任何模式切換按鈕,只負責列邊。模式狀態 MUST 為 Graph view 自有的 ephemeral view state(比照 collapse 狀態),預設 `controller`,MUST NOT 持久化於 runtime config;切換 MUST 即時生效。此處「layout」指 compound 群組拓樸,與 fcose / dagre 的佈局演算法選擇(app 設定)為**不同概念**。**階層由後端擁有**:`controller` 模式(預設)直接原樣消費後端 `GET /v1/graph` payload——pod 維持巢狀於其後端 `controller` 群組,完整 parent 鏈為 `cluster > namespace > application > controller > pod`,`pod-to-node` 以 drawn edge 表示;`node` 模式(基礎設施視圖)則由 pod-parent 拓樸轉換將每個 pod 重新掛載至其 K8s `node`、卸除 workload 群組層(`namespace` / `application` / `controller`),呈現扁平視圖 `cluster > node > pod`(`pod-to-node` 改以巢狀表示)。

#### Scenario: 分段控制切換模式

- **WHEN** 使用者點擊 legend 最上方 layout 分段控制的 `Controller` 段
- **THEN** Graph view 的 pod-parent mode 變為 `controller`,圖形即時重繪為後端階層 `cluster > namespace > application > controller > pod`
- **AND** 再點 `Node` 段則切回 `node`(`cluster > node > pod`,無 workload 群組層),皆立即生效、不涉及任何設定持久化

#### Scenario: 控制置於 legend 最上方、edge legend 不含切換鈕

- **WHEN** 渲染 legend
- **THEN** layout 分段控制出現在所有 legend section 之上;edge-type legend section 不渲染任何模式切換按鈕(僅列邊)

#### Scenario: 預設為 controller 模式

- **WHEN** Graph view 初次載入(使用者尚未切換)
- **THEN** pod-parent mode 為 `controller`,layout 分段控制預設高亮 `Controller`;pod 巢狀於其後端 `controller` 群組(`cluster > namespace > application > controller > pod`,階層由後端 payload 提供)、`pod-to-node` 為 drawn edge;且圖中所有 controller 容器於初次載入即預設全摺疊(pod 聚合)

### Requirement: 各模式的可繪 edge 集合與 legend / stylesheet 適配

系統 SHALL 以**單一主要 edge 樣式來源**涵蓋全部 8 種 edge type(`pod-to-node` / `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr` / `switch-to-switch` / `node-to-switch`),並 SHALL 以純函式依模式推導**可繪 edge 集合**:`controller` 模式為 `['pod-mounts-pvc', 'pod-calls-pod', 'pod-calls-service', 'service-selects-pod', 'pod-to-node', 'pvc-to-netapp-aggr', 'switch-to-switch', 'node-to-switch']`;`node` 模式為同一集合**減去 `pod-to-node`**(即 `['pod-mounts-pvc', 'pod-calls-pod', 'pod-calls-service', 'service-selects-pod', 'pvc-to-netapp-aggr', 'switch-to-switch', 'node-to-switch']`)——`node` 模式下 `pod-to-node` 以巢狀表示,並由 pod-parent 拓樸轉換整批移除。已自契約移除的 `pvc-to-storageclass` MUST NOT 出現於主要樣式來源、任一模式的可繪集合或完整 edge-type 集合中。系統 MUST NOT 合成 `pod-runs-on-node` / `controller-owns-pod` 之類的階層邊(階層由後端擁有,app 不合成)。`pvc-to-netapp-aggr` 於兩模式皆繪製;`service-selects-pod` 與 `pod-calls-service` 於兩模式皆繪製(service 不是 compound parent);實體網路 fabric edge `switch-to-switch` / `node-to-switch` 亦**於兩模式皆繪製**。stylesheet 的 edge 配色 MUST 取自主要樣式來源且與模式無關——它能為任何存在的 edge 上色;當前模式不含的 type 只是閒置,不影響輸出。完整 edge-type 集合與 edge-type 過濾的預設可見集合 MUST 等於全部 8 種 edge type,使兩模式的 edge(含 fabric)預設皆可見——否則切至 controller 模式時 `pod-to-node` 會被預設過濾掉,或 fabric edge 被排除於預設可見集合之外。edge-type legend section 列出的 edge MUST 為「當前模式的可繪集合 ∩ 圖中實際存在的 edge type」,以既有 `<from> → <to>` 形式呈現(箭頭字形置中),且 MUST NOT 附加額外的巢狀說明文字。

#### Scenario: node 模式的可繪 edge 集合

- **WHEN** pod-parent mode 為 `node`
- **THEN** 可繪 edge 集合含 `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pvc-to-netapp-aggr`,加上恆在的 `switch-to-switch` / `node-to-switch`;canvas 完全不繪製 `pod-to-node` edge(以巢狀表示,並由拓樸轉換移除)

#### Scenario: controller 模式的可繪 edge 集合

- **WHEN** pod-parent mode 為 `controller`
- **THEN** 可繪 edge 集合含 `pod-mounts-pvc` / `pod-calls-pod` / `pod-calls-service` / `service-selects-pod` / `pod-to-node` / `pvc-to-netapp-aggr`,加上恆在的 `switch-to-switch` / `node-to-switch`;`pod-to-node` edge 以主要樣式來源定義的顏色(`#3b82f6`)與線型繪製,`pvc-to-netapp-aggr` 以其自有顏色繪製,可與 `pod-mounts-pvc` 的紫色區分

#### Scenario: fabric edge 於兩模式皆存在

- **WHEN** 圖中含 `switch-to-switch` 或 `node-to-switch` edge
- **THEN** 兩種 pod-parent mode 皆繪製它(切換模式時不消失),且預設可見(edge-type 過濾的預設可見集合涵蓋它)

#### Scenario: 未知 edge type 仍走 fallback

- **WHEN** 任一模式下某 edge 的 `data.edgeType` 不在主要樣式來源內
- **THEN** 該 edge 以灰色實線 fallback 繪製且不拋錯(既有的向前相容行為)

### Requirement: 模式切換觸發重新佈局

模式切換改變 compound 結構(`data.parent` 與邊集合),系統 MUST 在套用後觸發**恰一次**重新佈局。觸發重新佈局的機制 MUST 由 collapse 變更與 pod-parent mode 變更共用(同一個「需要重跑 layout」的訊號),其中任一變動即重跑 layout;visibility-only 的變更仍 MUST NOT 觸發重新佈局。

#### Scenario: 切換模式重跑 layout

- **WHEN** 使用者切換 pod-parent mode
- **THEN** 系統中止進行中的 layout 後,以當前佈局演算法重跑 layout 恰一次;cytoscape.js instance 不重建(同一 instance);collapse 狀態以既有的對帳規則(desired ∩ present,即仍存在於圖中的容器維持其 collapse 狀態)保留

#### Scenario: 模式未變不重跑 layout

- **WHEN** 其他輸入變更,但 pod-parent mode 與 collapse 集合內容皆未變
- **THEN** 不發出重新佈局訊號,layout 不重跑

#### Scenario: 切換與還原皆實際改變 compound 巢狀

- **WHEN** 使用者切到 `controller` 模式,之後再切回 `node` 模式
- **THEN** pod 在 `controller` 模式 MUST 實際巢狀於其 owning controller 容器,切回 `node` 模式後 MUST 實際巢狀回其 K8s node 容器,雙向皆生效
- **AND** 因為 cytoscape.js 只在加入元素時可靠地建立 compound 巢狀(動態改寫 parent 或搬移元素,在 batch 與 expand-collapse 擴充並用下不可靠),canvas 偵測到 pod-parent mode 改變時 MUST 以整批重建(移除全部元素後重新加入新階層的元素)套用新階層,而非 diff-patch;模式切換同時發出重新佈局訊號,重建後重新佈局

### Requirement: pod-parent mode 的純函式可單元測試

pod-parent 拓樸轉換(輸入 elements 與 mode,回傳新 elements)與各模式的可繪 edge 集合推導 MUST 為純函式,且 MUST 具單元測試覆蓋。

#### Scenario: 純函式測試覆蓋

- **WHEN** CI 執行專案的單元測試
- **THEN** 拓樸轉換的測試涵蓋:controller 模式為 identity clone(pod 維持巢狀於後端 `controller` 群組、不合成任何 edge、`data.parent` 與邊集合不變、每個元素皆為新物件);node 模式將 pod 重新掛載至其 `labels.node`(指向既存的 `node` kind);node 模式卸除 `namespace` / `application` / `controller` 群組並將 `pvc` / `service` 重新掛載至 `cluster`;node 模式移除全部 `pod-to-node` edge;`labels.node` 缺失或無法解析時 pod 留在其 cluster 下的 fallback;`service-selects-pod` / `pod-calls-service` / `pvc-to-netapp-aggr` 於兩模式皆存活;**NetApp 儲存鏈於任一模式皆不被卸除亦不被重新掛載**;跨 cluster 的 `pod-calls-pod` 不受影響;兩模式皆回傳獨立新物件且不改動輸入
- **AND** 可繪 edge 集合推導的測試涵蓋兩模式的集合(`node` 模式排除 `pod-to-node`,兩模式皆不含 `pvc-to-storageclass`);全部通過

### Requirement: controller 模式維持後端階層、node 模式重新掛載 pod

系統 SHALL 提供純函式的 pod-parent 拓樸轉換(輸入 elements 與 mode,回傳新 elements),於 wire → 內部模型的正規化之後、元素進入 canvas 之前套用;正規化邊界本身 MUST 維持為純粹的 anti-corruption boundary,MUST NOT 接受 mode 參數。**階層由後端擁有**,故 `controller` 模式(預設)MUST 為 **identity clone**:MUST NOT 重新掛載任何 pod、MUST NOT 合成任何 edge——後端 payload 已將每個 pod 巢狀於其 `controller` 群組(完整 parent 鏈 `cluster > namespace > application > controller > pod`),且 `pod-to-node` 已是後端提供的 drawn edge。此模式僅逐元素複製以產生獨立新物件(`data` 至少淺複製),保留原本的 `data.parent` 與邊集合。`node` 模式 MUST 回傳乾淨的基礎設施視圖(`cluster > node > pod`):對每個 `pod`,將 `data.parent` 重設為其 `labels.node`(其 K8s node id),且僅當該 id 指向 elements 中**存在**的 `node` kind 元素時才重新掛載——`labels.node` 缺失或未指向任何此類 node 時,該 pod MUST 留在其 `cluster` 下(fallback)。此模式亦 MUST 卸除每個 `namespace` / `application` / `controller` 群組節點,並將其非 pod 成員(`pvc` / `service`)重新掛載至其 `cluster`,且 MUST 移除每一條 `pod-to-node` edge(該關係於 `node` 模式以巢狀表示)。

**NetApp 儲存鏈於 `node` 模式維持原狀。** `storage-cluster` **不是**被卸除的 workload 群組(被卸除的集合恰為 `namespace` / `application` / `controller`),而 `netapp-node` / `netapp-aggr` 是真實節點而非群組,故整個 `storage-cluster > netapp-node > netapp-aggr` 巢狀 MUST 於**兩模式皆原樣保留**,拓樸轉換 MUST NOT 重新掛載或攤平其中任何部分。`node` 模式下 PVC 因其 `namespace` 群組被卸除而重新掛載至 cluster,但其 `pvc-to-netapp-aggr` edge 仍指向未移動的 aggregate——**一條自 K8s cluster 容器跨入 storage-cluster 容器的 edge 即為預期結果**,不得為了收拾畫面而改動任一端點的 parent。

`service-selects-pod` / `pod-calls-service` / `pvc-to-netapp-aggr` edge MUST 於兩模式皆保留(`node` 模式在共通行為之上僅額外移除 `pod-to-node`)。`node` 模式移除 `pod-to-node` MUST NOT 使唯一連線為該 edge 的 pod(如 DaemonSet / Job / CronJob 的 pod)自畫布消失:`graph-view` 的 orphan 級聯以 **normalize boundary 輸出的基準線圖**判定 leaf 是否「本來就孤立」,而本轉換發生於該基準線之後,故這些 pod 屬「edge 被 UI 藏起來」而維持可見 —— 見 `graph-view` 的「Node Kind / Edge Type 過濾」需求。每一項節點 / edge 變更 MUST 以不可變方式產生新物件,MUST NOT 就地改動輸入。此外,兩模式下拓樸轉換回傳的**每一個**元素都 MUST 是全新的獨立物件(`data` 至少淺複製),而非僅變更過的元素——cytoscape.js 會直接引用交給它的 `data` 物件,且 expand-collapse 擴充會就地改寫 collapsed controller 相連 edge 的 `data.source` / `data.target`。若回傳值與正規化後的基底 elements 共享物件,該就地改寫會汙染正規化後的輸入,使用者切回另一模式時將出現錯誤的 edge,整個 workload 也會孤立或消失。

#### Scenario: controller 模式為 identity clone

- **WHEN** mode 為 `controller`
- **THEN** 拓樸轉換不重新掛載任何 pod、不合成任何 edge;pod 維持巢狀於其後端 `controller` 群組,`pod-to-node` 維持為 drawn edge;每個回傳元素皆為新物件(與輸入參照不同),其 `data.parent` 與邊集合內容與後端 payload 一致

#### Scenario: node 模式將 pod 重新掛載至 K8s node 並卸除 workload 群組

- **WHEN** mode 為 `node`
- **THEN** 每個 pod 的 `data.parent` 重設為其 `labels.node`(指向既存的 `node` kind);每個 `namespace` / `application` / `controller` 群組節點被卸除,其 `pvc` / `service` 成員重新掛載至其 `cluster`;每條 `pod-to-node` edge 被移除;結果為扁平的 `cluster > node > pod` 視圖,且每個回傳元素皆為新物件

#### Scenario: labels.node 缺失時 fallback 留在 cluster 下

- **WHEN** mode 為 `node`,且某 pod 的 `labels.node` 缺失,或其值未指向任何既存的 `node` kind 元素
- **THEN** 該 pod MUST 留在其 `cluster` 下(不會被掛載至不存在的 node id),其他 pod 不受影響

#### Scenario: service 與儲存 edge 於兩模式皆存活

- **WHEN** 圖中含 `service-selects-pod` / `pod-calls-service` / `pvc-to-netapp-aggr` edge(`pvc-to-storageclass` 已自契約移除,不在此列)
- **THEN** 兩模式皆保留它們為 drawn edge;`node` 模式僅額外移除 `pod-to-node`,絕不移除這些

#### Scenario: NetApp 儲存鏈於 node 模式既不卸除也不重新掛載

- **WHEN** mode 為 `node`,且圖中含 `storage-cluster > netapp-node > netapp-aggr` 巢狀與 `pvc-to-netapp-aggr` edge
- **THEN** `storage-cluster` 群組節點 MUST NOT 被卸除,`netapp-node` / `netapp-aggr` MUST 原樣保留其 `data.parent`,且 `pvc-to-netapp-aggr` edge 仍存在——其 PVC 端因 namespace 群組被卸除而重新掛載至 cluster,其 aggregate 端不動

#### Scenario: 輸入永不被就地改動

- **WHEN** 對同一份 elements 依序以 `controller` 與 `node` 模式各呼叫一次拓樸轉換
- **THEN** 輸入的 elements 陣列及其節點 / edge 物件皆未被修改(以新參照產生新物件),且兩次呼叫的結果互不汙染

### Requirement: controller 模式預設聚合(摺疊)controller 容器

為使 `controller` 模式預設呈現「pod 已聚合進其控制器」的精簡視圖,**於初次載入(controller 為預設模式)以及每次切入 `controller` 模式時**,系統 MUST 在該模式下首次出現 controller 容器的那一次渲染,將圖中**所有 controller 容器**(後端提供並於正規化時標記 `data.isController === true` 的 controller 群組節點)加入 collapse 集合,使其預設為 collapsed;此預設摺疊 MUST 以一次性守衛保護,使其在同一段 controller 模式期間至多觸發一次——之後 graph 資料自後端 refresh 時 MUST NOT 重新摺疊(使用者已展開的 controller 維持展開),離開 controller 模式時重置守衛,使再次進入時重新全摺疊。使用者可再自行展開個別 controller 以檢視其 pod。切回 `node` 模式時 controller 群組被拓樸轉換卸除,其 id 經既有的 collapse 對帳規則(desired ∩ present)自然自 collapse 集合淘汰;**再次**切入 `controller` 模式時 MUST 重新將所有 controller 容器摺疊(即每次進入皆全摺疊,不保留上次的展開狀態)。此預設聚合 MUST 僅作用於 controller 容器,不影響使用者對 `cluster` / K8s `node` 容器既有的 collapse 選擇。

#### Scenario: 初次載入或切入 controller 模式預設全摺疊

- **WHEN** Graph view 初次載入(controller 為預設模式),或使用者自 `node` 切到 `controller` 模式
- **THEN** 該模式下 controller 容器首次出現時即全部預設為 collapsed(pod 聚合於其中),canvas 顯示 controller 圖示而非展開的 pod

#### Scenario: controller 模式下資料 refresh 不重新摺疊

- **WHEN** 使用者在 controller 模式展開某 controller,之後 graph 資料自後端 refresh(該 controller 仍存在)
- **THEN** 該已展開的 controller MUST 維持展開(一次性守衛使預設摺疊在同一段 controller 模式期間不再重跑)

#### Scenario: 展開後再進入仍全摺疊

- **WHEN** 使用者在 controller 模式展開某 controller、切回 `node`、再切回 `controller`
- **THEN** 所有 controller 容器再次預設全摺疊(不保留上次的展開)

#### Scenario: 不影響 cluster / node 的 collapse 選擇

- **WHEN** 使用者已摺疊某 `cluster` 容器,然後切入 `controller` 模式
- **THEN** 該 `cluster` 維持其 collapse 狀態;controller 容器另外被全摺疊

#### Scenario: 單一 pod 的 controller 也預設摺疊

- **WHEN** 切入 `controller` 模式且某 controller 僅擁有一個 pod
- **THEN** 該單 pod controller 同樣被預設摺疊(預設聚合作用於**每個** controller 容器,不論子 pod 數量,無 `>1` 例外)

#### Scenario: 預設摺疊的 controller 不被 orphan 級聯隱藏

- **WHEN** 切入 `controller` 模式、所有 controller 預設摺疊,且某 controller 自身無 incident drawn edge(pod 巢狀於其中,`pod-to-node` 由 pod 指向 K8s node、不經 controller)
- **THEN** 該 controller MUST NOT 被 orphan 級聯隱藏——其子 pod 經可見性計算後仍在可見節點集合中(collapse 為 canvas 層的視覺操作,不自可見集合移除),故依 `graph-view` 的 orphan 規則「有可見子節點的容器保留」,collapsed controller 視為有可見子節點而留存
