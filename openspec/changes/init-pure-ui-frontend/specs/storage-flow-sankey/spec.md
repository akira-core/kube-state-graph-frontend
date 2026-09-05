## Purpose

`storage-flow-sankey` 定義 Sankey 儲存流量視圖的行為契約。此視圖的資料來自**它自己的後端端點** `GET /v1/storage-graph`(runtime config 的 `endpoints.storageGraph`),與 Graph 視圖的 `GET /v1/graph` 是兩條獨立的取數路徑;取數本身的規則由 `graph-data-source` 規範,本 capability 規範視圖行為:估計選擇器(`az` / `env` / root / `cluster` / `namespace`)、六層 tier 的呈現、以後端已加總的 `storage-flow` 權重繪製、讀 / 寫分流、缺值(absent ≠ 0)處理、排序、tooltip、hover 高亮、跨視圖 Locate、主題、尺寸、重新整理與效能界限。本 capability 不決定繪圖框架(於 design 定案),只規範可觀察行為。

**為何不再由 `/v1/graph` 推導。** 早期設計讓 Sankey 與 Graph 共用一份 `/v1/graph` 資料,由前端沿 `pod → pvc → netapp-aggr` 推鏈、自行加總 aggregate 入邊、自行把 RWX claim 的量測均分給掛載它的 pod。後端的 storage-graph 端點使這條路失效也不必要:它多出一個 `netapp-svm` tier(`/v1/graph` 沒有這個節點型別)、多出 Kubernetes node tier、提供由儲存端或工作負載端出發的 root 搜尋,並保證權重**逐 tier 守恆**——這些沒有一項能從 `/v1/graph` 的 body 推導出來,而前端自行加總只會產生一組與後端不一致、且無法對帳的數字。

## ADDED Requirements

### Requirement: 輸入為自有的 storage-graph 取數

Sankey 視圖 MUST 以 `endpoints.storageGraph` 的回應(經 `graph-data-source` 的同一個 normalize boundary 正規化後)為唯一輸入。它 MUST NOT 讀取 Graph 視圖的 `/v1/graph` 資料,MUST NOT 對 `endpoints.graph` 發出任何請求,亦 MUST NOT 由 `pvc-to-netapp-aggr` / `pod-mounts-pvc` / `pod-to-node` edge 推導任何節點或 link——這些 edge 不會出現在 storage-graph 的 body 中。

Sankey 的節點與 link 為自該回應推導的**唯讀衍生資料**,推導過程 MUST NOT 變更(mutate)該正規化結果的任何節點、edge 或欄位——推導前後 MUST 深度相等(deep-equal)。其資料來源處於 loading / error 狀態時,Sankey MUST 呈現該來源自身的 loading / error 狀態(而非 Graph 視圖的),且不繪製任何圖形。

`endpoints.storageGraph` 未設定時,視圖 MUST 顯示「未設定 storage graph 端點」的說明狀態(見 `runtime-config`),MUST NOT 顯示為錯誤,MUST NOT 退回以 `/v1/graph` 推導。

#### Scenario: Sankey 不讀 graph 端點

- **WHEN** 使用者於 Graph 視圖載入資料後切換至 Sankey 視圖,`az` / `env` 已選定
- **THEN** app 對 `endpoints.storageGraph` 發出恰好一次請求,對 `endpoints.graph` 發出零次請求,且 Sankey 繪出的元素全部來自 storage-graph 的回應

#### Scenario: 推導不改變來源資料

- **WHEN** 以 storage fixture 正規化後的結果執行 Sankey 推導(Read / Write / Both 三種模式各一次)
- **THEN** 推導後的正規化結果與推導前的深拷貝 deep-equal(無新增欄位、無改寫的 `metrics`、無被移除的 edge)

#### Scenario: 兩個來源的狀態互相獨立

- **WHEN** Graph 視圖的資料處於 error 狀態,而 storage-graph 請求成功
- **THEN** Sankey 正常繪製,不呈現任何錯誤;反之 storage-graph 失敗時 Graph 視圖不受影響

#### Scenario: 未設定端點

- **WHEN** runtime config 缺 `endpoints.storageGraph` 且 `demoMode` 為 `false`
- **THEN** 視圖顯示未設定說明,不發出任何請求,且 MUST NOT 以 Graph 視圖的資料繪製任何圖形

### Requirement: az / env 為必要的單值選擇器

視圖 SHALL 提供 `az` 與 `env` 兩個**單選**控制,其選項來自 `endpoints.labelValues`(與 Graph 視圖 filter bar 同一來源,見 `graph-data-source`)。兩者 MUST 恰好各送出一個值:後端對缺值以 400 `missing_az` / `missing_env`、對重複值以 400 `invalid_scope` 拒絕,故:

- 兩者**皆已選定**前,視圖 MUST NOT 發出任何 storage-graph 請求,並顯示提示說明需各選一個 `az` 與 `env`;此時兩個控制 MUST 可操作。
- `endpoints.labelValues` 與 `endpoints.storageGraph` 各自獨立選用,故選項可能**一個都列不出來**。此時兩個控制 MUST 仍然渲染且 MUST 仍可輸入(退化為自由文字輸入),MUST NOT 消失或成為空的下拉選單——後端要求這兩個值,一個列不出選項的下拉選單會讓「請各選一個 az 與 env」的提示指向一個選不了的控制,使該視圖永遠無法取數。
- 某維度的選項**恰好只有一個**時,視圖 SHALL 自動預選該值(此時該維度沒有可做的選擇,要求使用者手動點一次只是摩擦)。選項為零個或兩個以上時 MUST NOT 自動選取。
- app MUST NOT 從多個候選值中自行挑選其一,MUST NOT 送出空值。

兩者為 Sankey **自有**的控制,與 Graph 視圖 filter bar 的 `az` / `env`(可多選)**互相獨立**:變更其中一邊 MUST NOT 改變另一邊,亦 MUST NOT 觸發另一個視圖重新取數。

選定值 MUST 於模式切換、resize、主題切換與重新整理後保留;重新整理後若選定值已不在選項中,MUST 清除該選擇並回到「未選齊」狀態,MUST NOT 沉默改選另一個值。

#### Scenario: 未選齊不取數

- **WHEN** 使用者首次進入 Sankey 視圖,`az` 有三個候選值、`env` 有兩個
- **THEN** 兩者皆未預選,視圖顯示「請各選一個 az 與 env」提示,且對 `endpoints.storageGraph` 的請求數為 0

#### Scenario: 單一候選值自動預選

- **WHEN** `az` 的候選值只有 `local-a`、`env` 的候選值只有 `demo`
- **THEN** 兩者自動預選,視圖立即發出一次請求,查詢字串含 `az=local-a&env=demo`

#### Scenario: 與 Graph filter bar 獨立

- **WHEN** 使用者於 Graph 視圖的 filter bar 選取 `env: prod` 與 `env: dev`(兩個值),再切換至 Sankey 視圖
- **THEN** Sankey 的 `env` 不受影響(維持其自身選擇或未選狀態),且 MUST NOT 因 Graph 端為多值而顯示錯誤

#### Scenario: 選項消失後回到未選齊

- **WHEN** 已選 `az: zone-b`,重新整理後 label values 不再含 `zone-b`
- **THEN** `az` 的選擇被清除,視圖回到「請各選一個」提示並停止取數,而非改選其他 zone

### Requirement: Root 選擇器,可自儲存端或工作負載端出發

視圖 SHALL 提供 root 控制,讓操作者自流向的**任一端**出發搜尋。支援的 root 種類與後端一致:

| 種類          | 參數            | 語意                                                                                    |
| ------------- | --------------- | --------------------------------------------------------------------------------------- |
| ONTAP cluster | `ontap_cluster` | 該 ONTAP cluster 內的全部 controller / aggregate / SVM                                  |
| Node          | `node`          | 同時比對 **NetApp controller 名稱與 Kubernetes node 名稱**——命中任一側即成為該側的 root |
| Aggregate     | `aggr`          | 一個 ONTAP aggregate                                                                    |
| SVM           | `svm`           | 一個 SVM                                                                                |
| Pod           | `pod`           | 一個 pod,值的形式為 `<namespace>/<pod-name>`                                            |

每一種皆可重複、可混用。控制項 MUST 明示 `node` 同時比對兩種節點(操作者常不知道手上的名字是哪一種),並 MUST 明示混用兩側時後端取**交集**(路徑須同時碰到儲存端與工作負載端的 root),而非聯集。

`pod` 的值 MUST 於送出前驗證為恰有一個 `/` 且兩段皆非空;不合法時 MUST 就地提示且 MUST NOT 送出(後端會以 400 `invalid_scope` 拒絕整個請求,連帶讓其他合法 root 一起失效)。

全部 root 為空時等同「該估計的完整儲存流量」,MUST 為合法狀態而非錯誤。root 的變更 MUST 觸發一次重新取數。app MUST NOT 於客戶端再依 root 過濾後端回傳的元素——投影已由後端完成,客戶端再過濾會破壞權重守恆。

視圖 SHALL 另提供選用的 `cluster` 與 `namespace` 收斂控制(可多選,選項來自 `endpoints.labelValues`),非空時作為請求參數送出。它們 MUST NOT 於客戶端過濾——理由同上。

與 `az` / `env` 不同,這兩者是對一個**可列舉集合**的收斂:列不出任何選項且當前無選擇時 MUST NOT 渲染(沒有可收斂的對象,而請求本來就不需要它們)。

#### Scenario: 儲存端 root

- **WHEN** 使用者加入 root `aggr: aggr1`
- **THEN** 請求含 `aggr=aggr1`,回傳的 body 只含流經 `aggr1` 的路徑,視圖原樣繪製而不再自行篩選

#### Scenario: 工作負載端 root

- **WHEN** 使用者加入 root `pod: shop/orders-0`
- **THEN** 請求含 `pod=shop%2Forders-0`,視圖繪出該 pod 之下的完整儲存鏈

#### Scenario: 兩側混用取交集

- **WHEN** 使用者同時加入 `aggr: aggr1` 與 `pod: shop/orders-0`,而該 pod 另掛載一個位於 `aggr2` 的 claim
- **THEN** 兩個 root 一併送出;控制項說明文字指出兩側取交集,且視圖只繪出 `aggr1` 到該 pod 的路徑(後端已完成投影)

#### Scenario: 不合法的 pod root 不送出

- **WHEN** 使用者輸入 pod root `orders-0`(缺 namespace)
- **THEN** 控制項就地提示需為 `<namespace>/<pod>`,該值不進入請求,既有的其他 root 仍正常運作

#### Scenario: 無 root 為合法狀態

- **WHEN** 使用者清空所有 root
- **THEN** 請求只帶 `start` / `end` / `az` / `env`(與選用的 `cluster` / `namespace`),視圖繪出該估計的完整儲存流量,不顯示任何錯誤或提示

### Requirement: 流向鏈與 tier 結構

Sankey SHALL 由左至右呈現六個 tier,方向為 **storage → workload**:`netapp-node` → `netapp-aggr` → `netapp-svm` → `pvc` → `pod` → `node`(Kubernetes node)。

Link MUST 一對一對應 body 中的 `storage-flow` edge,其 tier 歸屬 MUST 讀自該 edge 的 `labels.tier`(`node-aggr` / `aggr-svm` / `svm-pvc` / `pvc-pod` / `pod-node`),MUST NOT 由端點的 kind 反推:

- **FlexGroup claim** 的路徑自 `svm-pvc` 起始(無 `node-aggr` / `aggr-svm`),其 SVM 在 aggregate tier 上沒有入邊——這是正常形狀,MUST NOT 視為缺漏、MUST NOT 合成替代節點。
- **未排程的 pod** 的路徑於 `pvc-pod` 結束(無 `pod-node`),該 pod 在 node tier 上沒有出邊。
- **無流量的 root**(後端materialise 但無任何已繪製 link 的節點)MUST 仍繪於其所屬 tier,作為孤立節點,並在其標籤或 tooltip 標示「無流量」;這是後端刻意的答案(一個沒有 claim 的降級 aggregate、一個沒掛 NetApp claim 的 pod),MUST NOT 被當成缺值而略去。
  - 這涵蓋**兩種**形狀:完全沒有 edge 的節點,以及有 edge 但每條 edge 皆無量測的節點(見「缺值處理」)。後者無法以「沒有 edge」判定。
  - 回應的 wire 格式**不帶 root 標記**,故 app MUST 以**發出該請求時的 root 選擇**判定 rootness,比對規則與後端一致:`node` 同時比對 `netapp-node` 與 Kubernetes `node` 的名稱、`ontap_cluster` 涵蓋其下全部 controller / aggregate / SVM、`pod` 比對 `<namespace>/<pod>`;`pvc` 不是 root 種類,故 claim 永不因此保留。
  - 此判定只用於**保留**投影中已存在的節點,MUST NOT 用於剔除任何節點——後者即是被禁止的客戶端 root 過濾,會破壞權重守恆。root 全空時無節點因此保留,回到「完全沒有 edge」這一種形狀。

edge 的 `source` / `target` MUST 以 id 解析為 body 中實際存在的節點,否則該 edge MUST 被忽略。`storage-cluster`、`cluster`、`namespace`、`application`、`controller`、`service`、`switch` 等群組或無關節點 MUST NOT 出現為 Sankey 的 tier 節點;它們只作為 `data.parent` 存在(供未來的分組檢視使用)。

#### Scenario: fixture 推導出六個 tier

- **WHEN** 以 storage fixture(`SHOWCASE_STORAGE_GRAPH`)推導 Sankey(Both 模式)
- **THEN** 六個 tier 分別為 `ontap-prod-01` / `ontap-prod-02`、`aggr1` / `aggr2`、`svm_shop` / `svm_dr`、`data-mongo-0` / `data-mongo-1`、`mongo-0` / `mongo-1`、`node-1` / `node-2`
- **AND** link 依 `labels.tier` 分為五組,且 `storage-cluster/ontap-prod`、`prod/app/mongodb`、`prod/ctrl/StatefulSet/mongodb` 皆不出現為 tier 節點

#### Scenario: FlexGroup 路徑自 SVM 起始

- **WHEN** body 中某條路徑的最上游 edge 的 `labels.tier` 為 `svm-pvc`,且沒有任何 `aggr-svm` edge 指向該 SVM
- **THEN** 該 SVM 繪於 SVM tier 且無入邊,其下游正常繪製,視圖不合成任何 aggregate 或 controller 節點

#### Scenario: 未排程的 pod 於 pod tier 結束

- **WHEN** 某 pod 有 `pvc-pod` 入邊但沒有 `pod-node` 出邊
- **THEN** 該 pod 繪於 pod tier 且無出邊,node tier 不因此出現任何佔位節點

#### Scenario: 無流量的 root 仍繪製

- **WHEN** 使用者以 `aggr: aggr9` 為 root,body 含 `aggr9` 節點與其 controller,但沒有任何 edge
- **THEN** 兩個節點繪於各自 tier,標示為無流量,視圖 MUST NOT 顯示「無資料」空狀態

### Requirement: 權重直接取自後端,不做客戶端聚合或均分

Link 的權重 MUST 直接讀自該 `storage-flow` edge 的 `data.metrics`,對應當前模式的方向欄位(`read_bytes_per_sec` / `write_bytes_per_sec`)。app MUST NOT:

- 自行加總下游 link 以推導上游權重(後端已保證逐 tier 守恆);
- 自行把 claim 的量測均分給多個 pod(後端已完成均分);
- 以 `read_ops` / `write_ops` / `read_latency_us` / `write_latency_us` / `max_iops` / `max_bytes_per_sec` 作為 link 粗細。

`labels.attribution` 為 `"split"` 的 `pvc-pod` link,其權重是 RWX claim 均分後的**歸屬值**而非量測值;該 link 的 tooltip MUST 標示為「均分估計」。缺該 label 的 link MUST NOT 標示為估計。

視圖 SHALL 提供 mode selector,選項為 **Read** / **Write** / **Both**,預設 **Both**。Read 或 Write 模式下每條 edge 至多一條 link;Both 模式下每條 edge MUST 繪製兩條可區分的 link(read 與 write 各一,顏色不同),且畫面 MUST 顯示 legend 說明兩種顏色。

#### Scenario: 權重原樣取用

- **WHEN** 於 Read 模式,`svm_shop → data-mongo-0` 的 edge 帶 `metrics.read_bytes_per_sec: 5242880`
- **THEN** 該 link 權重為 `5242880`,不受同一 edge 的 `write_bytes_per_sec`、`read_ops` 或 `max_bytes_per_sec` 影響

#### Scenario: 上游權重不由客戶端加總

- **WHEN** `ontap-prod-01 → aggr1` 的 edge 帶 `metrics.read_bytes_per_sec: 6000000`,而其下游兩條 `aggr-svm` link 的和為 `5999999`(後端捨入)
- **THEN** 上游 link 的權重仍為後端給的 `6000000`,app MUST NOT 以下游之和取代它,亦 MUST NOT 因兩者不等而顯示警示

#### Scenario: 均分歸屬標示為估計

- **WHEN** 某 `pvc-pod` link 帶 `labels.attribution: "split"` 與 `write_bytes_per_sec: 524288`
- **THEN** 其權重為 `524288`,tooltip 標示該值為均分估計;同一路徑上的 `svm-pvc` link(無該 label)不標示為估計

#### Scenario: 切換模式即時重算

- **WHEN** 使用者自 Both 切換為 Write
- **THEN** 每條 edge 只剩 write link,legend 不再顯示 read 項目,且 MUST NOT 重新取數

### Requirement: 缺值處理(absent ≠ 0)

推導 MUST 區分「量測不存在」與「量測為 0」:

- 某 edge 缺少當前方向的欄位(`read_bytes_per_sec` 或 `write_bytes_per_sec` 不存在)→ 該方向不繪製 link;Both 模式下只繪製存在的那個方向。
- 某 edge 兩個方向皆不存在(含整個 `metrics` 不存在)→ 該 edge 不產生任何 link。後端對「路徑上每個 claim 都沒有量測」的情況就是不給 `metrics` key,這是一條真實存在但無量測的路徑。
- 值為 `0` → MUST 繪製一條零權重 link,以最小可見粗細且與非零 link 視覺可區分的方式呈現(例如虛線或半透明),MUST NOT 視為缺值。
- 節點的所有 link 皆被排除、且該節點不是 root → 該節點不繪製。**root 節點永遠繪製**(見「流向鏈與 tier 結構」)。
- 上述判定 MUST 只依賴欄位存在與否與數值,MUST NOT 以 `0`、`null` 或任何預設值補入缺值。

#### Scenario: 只有 read 量測的 edge

- **WHEN** 某 `svm-pvc` edge 的 `metrics` 為 `{ read_bytes_per_sec: 262144 }`(無 `write_bytes_per_sec`)
- **THEN** Read 模式繪製權重 `262144` 的 link;Write 模式該對無 link;Both 模式只有 read link,且 tooltip 不顯示 write 值(不顯示為 `0`)

#### Scenario: 零值繪製為零權重 link

- **WHEN** 某 edge 的 `metrics` 為 `{ read_bytes_per_sec: 0, write_bytes_per_sec: 1048576 }` 且處於 Read 模式
- **THEN** 該對繪製一條零權重 link,tooltip 顯示 `0 B/s`,其視覺樣式與非零 link 可區分,且其 source / target 節點仍被繪製

#### Scenario: 無量測的完整路徑

- **WHEN** body 含一條五段齊全但每段皆無 `metrics` 的路徑
- **THEN** 該路徑不產生任何 link;其節點若非 root 則不繪製,若為 root(比對該請求的 root 選擇)則以無流量節點呈現

#### Scenario: 無量測路徑上的 root 仍繪製

- **WHEN** 使用者以 `aggr: aggr1` 為 root,body 回傳 `ontap-prod-01 → aggr1 → svm_shop` 三個節點與兩條皆無 `metrics` 的 edge
- **THEN** `aggr1` 以無流量節點繪於 aggregate tier,`ontap-prod-01` 與 `svm_shop` 不繪製(它們非 root 且無已繪製 link),視圖 MUST NOT 顯示狀態 3

### Requirement: 空狀態

視圖 MUST 依原因區分下列狀態,各以不同說明文字呈現,且 mode selector 與所有選擇器在任一狀態下 MUST 保持可操作:

1. **端點未設定** —— `endpoints.storageGraph` 缺席(見 `runtime-config`)。
2. **估計未選齊** —— `az` 或 `env` 尚未選定;說明需各選一個,且明示尚未發出任何請求。
3. **回應為空** —— 請求成功但 `elements` 無節點:說明所選估計與 root 在此時間範圍內沒有儲存流量,並提示可能原因(root 名稱打錯、該 estate 無 NetApp 支撐的 claim、時間範圍落在保留期外)。
4. **當前方向無量測** —— body 有 `storage-flow` edge,但當前模式的方向全無量測(例如 Read 模式下所有 edge 只有 `write_bytes_per_sec`):說明當前方向無量測並提示切換模式。

`demoMode` 為 `true` 時,狀態 3 的說明 MUST 額外指出目前顯示的是 demo fixture 資料。

#### Scenario: 未選齊與空回應可區分

- **WHEN** `az` / `env` 未選齊
- **THEN** 顯示狀態 2 的說明,且不顯示「沒有儲存流量」——這兩者代表完全不同的事,混用會讓一個未完成的選擇看起來像一個壞掉的管線

#### Scenario: root 打錯字

- **WHEN** 使用者以 `aggr: typo` 為 root,後端回 200 且 `elements` 為空
- **THEN** 顯示狀態 3,說明含「root 名稱可能不存在」的提示,且 root 控制項保持可編輯

#### Scenario: 當前方向無量測

- **WHEN** 所有帶量測的 edge 只有 `write_bytes_per_sec`,使用者選擇 Read 模式
- **THEN** 顯示狀態 4 並提示可切換至 Write / Both;切換至 Write 後圖形正常繪製

### Requirement: tier 內排序

每個 tier 內的節點 SHALL 由上而下依節點在**當前模式**下的總流量降序排列;總流量定義為該節點所有已繪製 link 權重的總和(Read / Write 模式為單一方向;Both 模式為 read + write),對同時有入邊與出邊的節點取入邊總和與出邊總和中的較大者。無流量的 root 節點總流量視為 `0`,MUST 排在該 tier 最下方。總流量相同時 MUST 依節點 `label` 字典序升序(以 `localeCompare` 比較)。排序結果 MUST 為確定性(同一輸入永遠得到同一順序)。

此加總只用於**排序**,MUST NOT 用來取代任何 link 的權重(權重一律取自後端,見「權重直接取自後端」)。pod tier 另受 namespace 分組約束(見「pod tier 的 namespace 分組色條與相鄰排列」):分組相鄰優先於跨群組的流量排序,群組內部仍依本規則排序。

#### Scenario: 依總流量降序

- **WHEN** 於 Both 模式以 fixture 推導(`aggr1` 總流量 `6291456`、`aggr2` 總流量 `311296`)
- **THEN** aggregate tier 中 `aggr1` 在 `aggr2` 之上;切換為 Write 模式後(`1048576` vs `49152`)順序不變

#### Scenario: 無流量 root 排在最下

- **WHEN** aggregate tier 含 `aggr1`(有流量)與 `aggr9`(root,無流量)
- **THEN** `aggr9` 排在 `aggr1` 之下

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

所有連線的厚度 MUST 出自**同一把**比例尺:比例尺為最大厚度除以當前模式下所有**已繪製**連線權重的最大值,連線厚度為 max(最小厚度, 權重 × 比例尺)。Both 模式下 read 與 write 兩族 MUST 共用這一把尺 —— 各自縮放會使兩者的粗細不可互相比較。切換 mode 或重新取數後 MUST 依新的最大值重算比例尺。

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

六個 tier MUST 各於其欄頂端標示一行標題,由左至右為 `NetApp node`、`NetApp aggregate`、`SVM`、`PVC`、`Pod`、`Node`。標題 MUST 以次要前景色與較寬字距呈現,且 MUST NOT 佔用節點的佈局空間(不推擠盒卡)。某 tier 在當前模式與當前估計 / root 選擇下沒有任何已繪製節點時,該欄標題 MUST NOT 繪製。

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

兩張表 MUST 隨 mode、估計 / root 選擇與 storage-graph 重新整理同步更新。表格過寬時 MUST 於其自身容器內橫向捲動,MUST NOT 使頁面出現橫向捲軸。空狀態(見「無 storage I/O metrics 時的空狀態」)顯示期間,兩張表 MUST NOT 繪製。

#### Scenario: 摘要表隨模式更新

- **WHEN** 使用者自 Both 切換為 Write
- **THEN** 節點摘要表的總流入 / 總流出改為只計 write 方向,namespace 小計亦隨之改變

#### Scenario: 缺值不補零

- **WHEN** `ontap-prod-01` 沒有 `usage`
- **THEN** 其列的 usage 欄為缺值佔位符,不顯示 `0` 或 `0 B`

### Requirement: 節點與 link 的標籤與 tooltip

每個節點 MUST 顯示其 `label`。hover 節點時 tooltip MUST 顯示:

- 節點 kind 與 `label`;`pod` / `pvc` 另顯示 `namespace`;`netapp-aggr` / `netapp-svm` / `netapp-node` 另顯示 `ontap_cluster`。
- 當前模式下的總流入與總流出 bytes/sec(Both 模式下 read / write 各自列出)。
- `pvc` / `netapp-aggr`:`usage` 存在時顯示 `used_bytes` / `capacity_bytes`;缺 `usage` 或任一欄位時不顯示該項,MUST NOT 補 `0`。
- `netapp-aggr` / `netapp-node`:`health` 存在則原樣顯示;缺值時不顯示,MUST NOT 補 `unknown` 或 `degraded`。
- `netapp-node`:`hardware` 存在時顯示其既有欄位(至少 `model`);`perf` 存在時顯示其既有欄位(`cpu_busy_pct` / `total_ops` / `total_latency_us` / `total_bytes_per_sec`)並標示為原始讀數。app MUST NOT 由 `perf` 推導健康判定、MUST NOT 依門檻上色或加警示圖示——門檻是機型與估計專屬的,判定經由 `alerts` 抵達。
- 任一節點的 `alerts` 存在且非空時,MUST 顯示其告警(名稱與 severity),並以狀態色標示該節點。
- 無流量的 root 節點:MUST 明示「此節點為所選 root,在此時間範圍內無流量」。

hover link 時 tooltip MUST 顯示 source `label`、target `label`、tier、方向(read / write)與權重值。`svm-pvc` link 另 MUST 在 `max_bytes_per_sec` / `max_iops` 存在時以資訊形式顯示(標示為 QoS ceiling),缺值時不顯示、MUST NOT 顯示 `0` 或「unlimited」;量測超過 ceiling 時 MUST NOT 上色、警示或改變 link 樣式。其他 tier 的 link MUST NOT 顯示 ceiling 或 latency 欄位(後端不會在該處提供)。`labels.attribution` 為 `"split"` 的 link MUST 標示「均分估計」。

#### Scenario: hover aggregate 節點

- **WHEN** 使用者於 Read 模式 hover `aggr1`
- **THEN** tooltip 顯示 `netapp-aggr` / `aggr1` / `ontap_cluster: ontap-prod`、流入 `5.24 MB/s`、流出 `5.24 MB/s`、usage `700 GB / 1 TB`、health `online`

#### Scenario: hover netapp-node 顯示硬體與效能讀數

- **WHEN** 使用者 hover `ontap-prod-02`,其 `hardware: { model: "AFF-A400" }`、`perf: { cpu_busy_pct: 41.2 }`、`health: "degraded"`
- **THEN** tooltip 顯示 model、標示為原始讀數的 `cpu_busy_pct`、health `degraded`,且不含 usage 項目;`cpu_busy_pct` 不觸發任何顏色或圖示變化

#### Scenario: ceiling 只在 svm-pvc link

- **WHEN** 使用者 hover `svm_shop → data-mongo-0` 的 read link,隨後 hover `ontap-prod-01 → aggr1` 的 read link
- **THEN** 前者顯示 read `5.24 MB/s`、`max_bytes_per_sec` `105 MB/s`、`max_iops` `5000`,無任何警示樣式;後者只顯示 tier 與權重,不含 ceiling 或 latency 項目

### Requirement: bytes/sec 數值格式化

所有 bytes/sec 值(權重、tooltip 總量、`max_bytes_per_sec`)MUST 以 SI 單位(1000 進位:`B/s`、`KB/s`、`MB/s`、`GB/s`、`TB/s`)格式化,規則為:

- 選擇使縮放後數值 ≥ 1 的最大單位,並以 **3 位有效數字**呈現(例:`5242880` → `5.24 MB/s`;`104857600` → `105 MB/s`;`262144` → `262 KB/s`;`49152` → `49.2 KB/s`)。
- 值為 `0` → `0 B/s`。
- 非零但小於 `1 B/s` 的值 MUST 以指數表示法呈現 3 位有效數字(例:`3.86e-7` → `3.86e-7 B/s`),MUST NOT 顯示為 `0 B/s` 或 `0.00 B/s`。
- 格式化 MUST NOT 使用固定小數位的截斷方式(如 `toFixed(2)`)處理任意量級的值。

`used_bytes` / `capacity_bytes` 與 `total_bytes_per_sec` MUST 以同一 SI 規則格式化(前者不含 `/s` 後綴)。

此階梯 MUST 與 Graph view 的 `usage` / throughput 列**共用同一個實作**(`shared/format/measurements`),不得在本 feature 內另建一份:同一個 tooltip 會同時渲染 link 的速率與節點的 `usage`,兩份階梯只要單位拼寫不同(`kB` 對 `KB`)就會在相鄰兩列同時出現。

#### Scenario: 一般量級

- **WHEN** 格式化 `5242880`、`104857600`、`49152`
- **THEN** 分別得到 `5.24 MB/s`、`105 MB/s`、`49.2 KB/s`

#### Scenario: 極小值與零

- **WHEN** 格式化 `3.86e-7` 與 `0`
- **THEN** 分別得到 `3.86e-7 B/s` 與 `0 B/s`;前者 MUST NOT 被截斷為零

#### Scenario: tooltip 夾在視窗內

- **WHEN** 使用者 hover 位於視圖區最右緣、最下緣的節點
- **THEN** tooltip 完整可見且不溢出視窗,頁面不出現捲軸

### Requirement: hover 高亮路徑

hover 某節點時,視圖 MUST 高亮所有經過該節點的路徑上的 link——即自該節點沿入邊方向可回溯到的所有 link(上游,朝儲存端)與沿出邊方向可到達的所有 link(下游,朝工作負載端)之聯集——並淡化(fade)其餘 link 與節點;Both 模式下 read / write 兩方向的 link 皆納入。不在任何經過該節點之路徑上的 link(例如同一 controller 下其他 aggregate 的出邊)MUST NOT 被高亮。滑鼠離開後 MUST 還原為全部正常顯示。hover 高亮 MUST 僅改變樣式,MUST NOT 觸發重新佈局。

#### Scenario: hover pvc 高亮上下游

- **WHEN** 使用者於 Both 模式 hover `data-mongo-0`
- **THEN** `ontap-prod-01→aggr1`、`aggr1→svm_shop`、`svm_shop→data-mongo-0`、`data-mongo-0→mongo-0`、`mongo-0→node-1` 的 read 與 write link 皆高亮;`aggr2` 一側的路徑被淡化

#### Scenario: 不高亮旁支

- **WHEN** 兩個 aggregate(`aggrA`、`aggrB`)同屬一個 controller,使用者 hover `aggrA`
- **THEN** `ontap-node→aggrA` 與 `aggrA` 的所有出邊高亮;`ontap-node→aggrB` 與 `aggrB` 的出邊被淡化

#### Scenario: 離開後還原

- **WHEN** 使用者將滑鼠移出任何節點
- **THEN** 所有 link 與節點還原為未淡化狀態,且佈局座標與 hover 前完全相同

### Requirement: 點選節點跨視圖 Locate

點選 Sankey 節點 MUST 導覽至 Graph 視圖並對同一 id 的節點執行 Locate(語意同 CONTEXT.md 的 **Locate**):展開其 collapsed 祖先容器鏈、選取該節點、將 viewport fit 至其 closed neighborhood、並清空搜尋輸入。Sankey 自身 MUST NOT 持有持久化的選取狀態——返回 Sankey 視圖時無任何節點處於選取態。

因為兩個視圖來自**兩個端點**,Sankey 中的節點不保證存在於 Graph 視圖當前的 body 中(不同的時間範圍解析、不同的篩選、`prune` 的投影,或該節點型別根本不由 `/v1/graph` 輸出)。視圖 MUST 依原因給出可辨識的提示,且在任一情況下 MUST NOT 靜默改寫使用者的篩選或 `prune` 設定:

- 節點在 Graph 視圖中為 **filter-hidden** → 提示該節點被過濾隱藏,不改變過濾器亦不選取。
- 節點**不存在於** Graph 視圖當前的資料中 → 提示該節點不在目前的 graph 查詢結果內,並指出可能原因(篩選或 `prune` 不同);MUST NOT 顯示為錯誤。
- `netapp-svm` 節點 **無對應的 graph 節點**(`/v1/graph` 不輸出該型別)→ 該 tier 的節點 MUST NOT 提供 Locate 互動(不呈現為可點選),而非點下去才報告失敗。

#### Scenario: 點選 aggregate 定位至 Graph 視圖

- **WHEN** 使用者於 Sankey 點選 `aggr1`,且該節點存在於 Graph 視圖當前資料中
- **THEN** app 路由切換至 Graph 視圖,`netapp/ontap-prod/aggr/aggr1` 成為選取節點、其 collapsed 祖先被展開、viewport fit 至其 closed neighborhood,搜尋輸入為空

#### Scenario: 目標為 filter-hidden

- **WHEN** Graph 視圖已隱藏 `pvc` kind,使用者於 Sankey 點選 `data-mongo-0`
- **THEN** app 切換至 Graph 視圖並顯示「該節點目前被過濾隱藏」的提示;kind 過濾器維持不變且無節點被選取

#### Scenario: 目標不在 graph 查詢結果內

- **WHEN** Graph 視圖以 `prune: true` 載入,某 pod 因此不在其 body 中,使用者於 Sankey 點選該 pod
- **THEN** app 切換至 Graph 視圖並提示該節點不在目前查詢結果內、可能因篩選或 Projection 設定;`prune` 與所有篩選維持不變

#### Scenario: SVM 節點不提供 Locate

- **WHEN** 使用者將游標移到任一 `netapp-svm` 節點上
- **THEN** 該節點不呈現為可點選(無指標游標、無點選效果),tooltip 正常顯示

#### Scenario: 返回 Sankey 無選取

- **WHEN** 使用者 Locate 後切換回 Sankey 視圖
- **THEN** Sankey 中無任何節點顯示選取樣式,mode selector 與所有選擇器保持離開前的值

### Requirement: 主題支援與可區分的 read / write 配色

Sankey 視圖 MUST 讀取 app shell 的主題 token,在 dark 與 light 兩主題下皆正確渲染(背景、節點、link、文字、tooltip、legend 均使用主題 token,不得硬編顏色);主題切換時 MUST 即時重繪且不遺失 mode / hover 狀態,MUST NOT 重新取數。read 與 write 的 link 顏色在兩主題下 MUST 皆可區分,且區分 MUST NOT 僅依賴色相:兩者 MUST 同時以明度差異或填充圖樣(pattern)區分,並由 legend 的文字標籤說明。

#### Scenario: 主題切換

- **WHEN** 使用者於 Sankey 視圖(Write 模式、hover 中)將主題自 dark 切為 light
- **THEN** 圖形以 light 主題 token 重繪,mode selector 仍為 Write,hover 高亮狀態維持,且未發出任何請求

#### Scenario: read / write 不僅靠色相

- **WHEN** 檢視 Both 模式的 legend 與 link
- **THEN** read 與 write 除色相外另有明度差異或填充圖樣差異,且 legend 以文字標示 read / write

#### Scenario: 新視覺元素隨主題重繪

- **WHEN** 使用者於 Sankey 視圖切換主題
- **THEN** 盒卡、欄位標題、緞帶漸層、數值標籤的描邊光暈、namespace 色條與縮放控制列皆改用新主題的 token,無硬編顏色殘留

### Requirement: 尺寸與容器 resize

Sankey 的 SVG MUST 填滿 app shell 提供的視圖區域(寬高皆隨容器),其 `viewBox` 為佈局算出的**內在座標**,並以 `preserveAspectRatio` 的 meet 語意等比置中適配。容器尺寸變化 MUST NOT 觸發重新佈局:節點與連線的內在座標 MUST 保持不變,只由 viewBox 重新適配;期間 MUST NOT 遺失 hover 高亮狀態、mode selector 值、`az` / `env` / root / `cluster` / `namespace` 的選擇與當前的縮放平移視角。內容不因尺寸變化而產生視圖區域外的水平捲動。

**全部**節點(含無流量 root 的孤立卡片)MUST 落在佈局算出的內在座標框內:無流量節點掛在同一 tier 的流量圖之下,佈局 MUST 把它們計入內在高度,否則 viewBox 適配不到它們——一個框外的節點與「後端沒回傳該節點」無法區分。

#### Scenario: 視窗縮放

- **WHEN** 使用者將視窗寬度自 1400px 調整為 900px
- **THEN** 圖形等比縮小並完整落於視圖區域內,佈局函式未被呼叫(節點內在座標與 hover 前完全相同),mode selector 與所有選擇器的值不變

#### Scenario: resize 期間的 hover

- **WHEN** 使用者 hover `aggr1` 期間容器尺寸改變
- **THEN** `aggr1` 的路徑高亮仍維持,tooltip 位置隨新的螢幕座標更新

### Requirement: 圖區的縮放與平移

圖區 MUST 支援獨立於瀏覽器頁面縮放的圖內縮放與平移,且 MUST 只改變**單一**包住全部圖形的 `<g>` 的 `transform`;漸層等 `<defs>` MUST 留在該 `<g>` 之外。縮放為真幾何縮放:字級與線寬 MUST 隨之等比改變,MUST NOT 做反向補償。

- **滾輪 / 觸控板雙指**:以**指標位置為錨點**縮放 —— 錨點下的圖上座標在縮放前後 MUST 不變;該事件 MUST 被 `preventDefault`,MUST NOT 捲動頁面。
- **按住拖曳**:平移。圖區游標在一般狀態 MUST 為 `grab`、拖曳中 MUST 為 `grabbing`。
- 縮放倍率 MUST 有上下限,到達界限時 MUST 停住,MUST NOT 反彈或翻轉。

初始視角 MUST 為「符合視窗但不放大超過 1:1」:圖形大於視圖區時縮到全圖可見,小於視圖區時維持原尺寸並置中。mode 切換、估計 / root 選擇變更、主題切換、容器 resize 與 storage-graph 重新整理 MUST 保留當前視角。視角 MUST NOT 寫入 URL(路由 MUST 維持精確的 `/sankey`),MUST NOT 持久化。

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

圖區容器 MUST 可取得焦點(`tabindex`)並具可存取名稱。下列按鍵 MUST 只在**圖區容器或其後代**具有焦點時作用:`+` / `-` 縮放一格、`0` 符合視窗、`1` 回到 1:1、`F` 進入專注模式、`Esc` 離開專注模式。這些監聽 MUST 註冊於圖區容器,MUST NOT 註冊於 `document` 或 `window`(見 `app-shell` 的「Shell 不註冊全域鍵盤快捷鍵」),且 MUST NOT 攔截送往 mode selector、估計 / root 選擇器或任何輸入元件的按鍵。

#### Scenario: 空狀態不顯示控制列

- **WHEN** Sankey 因 graph 無任何儲存量測而顯示空狀態
- **THEN** 縮放控制列不顯示;mode selector 與所有估計 / root 選擇器仍可操作

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

專注模式 MUST 收起 app shell 的頂部導覽列與 Sankey 自身的控制項(mode selector、估計 / root 選擇列、legend 與圖外摘要表),使圖區填滿整個視窗。`Esc` 或再次啟動控制列的專注按鈕 MUST 離開。進入與離開 MUST 保留縮放平移視角、mode、估計 / root 選擇與 hover 狀態。專注模式 MUST 為暫時的 view state:MUST NOT 寫入 URL、MUST NOT 持久化;切離 Sankey 視圖或完整重新整理後 MUST 回到未啟用。

#### Scenario: 進出專注模式保留視角

- **WHEN** 使用者放大至 180% 後按 `F`,再按 `Esc`
- **THEN** 進入時導覽列與控制項收起、圖填滿視窗;離開後兩者回復,縮放倍率仍為 180%

#### Scenario: 切走視圖即離開專注模式

- **WHEN** 使用者於專注模式按 `Esc` 離開後切換至 Graph 視圖再切回 Sankey
- **THEN** 專注模式為未啟用,導覽列可見,縮放平移視角仍為切走前的值

### Requirement: 重新整理時就地更新

當 storage-graph 資料因重新整理(手動或自動)而更新時,Sankey MUST 就地重新推導並更新圖形(新增 / 移除節點與 link、更新權重),MUST NOT 重置為初始狀態;mode selector 與所有選擇器的值 MUST 保留。已消失節點的 tooltip 與 hover 高亮 MUST 被清除;仍存在節點的 hover 高亮 MUST 依新拓樸重算。刷新期間與刷新失敗後,先前成功繪製的圖 MUST 維持可見(見 `graph-data-source` 的刷新語意)。

#### Scenario: 權重更新

- **WHEN** 於 Write 模式,重新整理後 `svm_shop → data-mongo-0` 的 `write_bytes_per_sec` 自 `1048576` 變為 `2097152`
- **THEN** 該 link 與其上游 `aggr1 → svm_shop`、`ontap-prod-01 → aggr1` 的權重依**新回應所給的值**更新(而非由客戶端加總推導),mode selector 仍為 Write

#### Scenario: 節點新增與消失

- **WHEN** 重新整理後新增一條完整路徑、同時 `data-mongo-1` 的路徑消失
- **THEN** 新路徑的節點出現於對應 tier,`data-mongo-1`、`mongo-1` 與只服務它的節點消失;若當時 hover 的是 `data-mongo-1` 則 tooltip 關閉且無殘留高亮

#### Scenario: 刷新失敗保留既有圖

- **WHEN** 自動刷新的 storage-graph 請求回應 HTTP 500
- **THEN** 既有圖形維持可見,狀態指示器呈現錯誤,MUST NOT 清空為空狀態

### Requirement: 與 Graph 視圖的控制完全獨立

Sankey 的資料 MUST 完全獨立於 Graph 視圖的 kind / edge-type 過濾器、ingress visibility toggle、搜尋查詢、pod-parent mode、collapse 狀態、`prune` 設定,以及 filter bar 的多值 `cluster` / `az` / `env` / `namespace` 選擇——上述任何變更 MUST NOT 改變 Sankey 的節點、link、權重,亦 MUST NOT 觸發 storage-graph 重新取數。

反向亦然:Sankey 的 `az` / `env` / root / `cluster` / `namespace` 變更 MUST NOT 改變 Graph 視圖的任何狀態或觸發其重新取數。

兩視圖唯一共享的輸入是**檢視時間範圍**(見 `app-shell`):其變更 MUST 使兩個來源在各自下次取數時使用新的 `start` / `end`。

#### Scenario: Graph 視圖控制不影響 Sankey

- **WHEN** 使用者於 Graph 視圖隱藏 `pvc` kind、輸入搜尋 `nats`、切換 pod-parent mode 為 `node`、將 Projection 切為 `Full inventory`,再切換至 Sankey 視圖
- **THEN** Sankey 的節點、link 與權重不變,且期間未對 `endpoints.storageGraph` 發出任何請求

#### Scenario: Sankey 控制不影響 Graph 視圖

- **WHEN** 使用者於 Sankey 加入 root `aggr: aggr1` 並改選 `env`
- **THEN** Graph 視圖的篩選、選取、collapse 與資料皆不變,且未對 `endpoints.graph` 發出請求

### Requirement: 效能界限

以下界限 MUST 在 e2e 測試套件所用的開發機 / CI 等級硬體上成立:

- 對一個含 3000 條 `storage-flow` edge(500 個 pvc、1000 個 pod、25 個 aggregate、10 個 SVM、5 個 controller、50 個 Kubernetes node,每條 edge 皆帶 `read_bytes_per_sec` 與 `write_bytes_per_sec`)的合成 body,自取得正規化結果至 Sankey 首次完成繪製(Both 模式)MUST 在 **1000 ms** 內。
- 切換 mode 後的重繪 MUST 在 500 ms 內。
- hover 與離開 MUST 只更新樣式,MUST NOT 觸發佈局重算(以佈局函式呼叫次數為 0 驗證),且樣式更新 MUST 在一個 animation frame 內完成。
- 縮放與平移 MUST 只更新單一 `<g>` 的 `transform`,MUST NOT 觸發佈局重算(同樣以佈局函式呼叫次數為 0 驗證),且每次更新 MUST 在一個 animation frame 內完成。

#### Scenario: 3000 條 storage-flow edge 首次繪製

- **WHEN** 以上述合成 body 開啟 Sankey 視圖
- **THEN** 自資料可用至圖形首次繪製完成的耗時 ≤ 1000 ms,且六個 tier 的節點數分別為 5 / 25 / 10 / 500 / 1000 / 50

#### Scenario: hover 不重算佈局

- **WHEN** 於上述合成 body 連續 hover 與離開 100 個不同節點
- **THEN** 佈局函式被呼叫的次數為 0,每次 hover 的樣式更新於一個 animation frame 內完成,且節點座標全程不變

#### Scenario: 縮放平移不重算佈局

- **WHEN** 於上述合成 graph 連續縮放與平移 100 次
- **THEN** 佈局函式被呼叫的次數為 0,每次更新於一個 animation frame 內完成,節點的內在座標全程不變
