## Purpose

自 `switch` 節點的 `data.labels.level` 讀取實體網路的層級(level),並在力導向(`fcose`)佈局下將 switch fabric 固定為逐層堆疊的橫列——高層級在上、同層級同列——同時以正交路由呈現 `node-to-switch` / `switch-to-switch` 邊,使 K8s node 的 uplink 與 switch fabric 在 Graph view 中讀作一個清楚分層的實體網路。

## ADDED Requirements

### Requirement: 自節點標籤讀取 switch level

系統 SHALL 自每個 `switch` 節點的 `data.labels.level` 值讀取其網路 **level**,以 base-10 整數解析。level 只有在解析結果為大於或等於零的整數時 SHALL 被接受;`labels.level` 缺席、空白、非數字或為負數的 `switch` 節點 SHALL 不獲指派任何 level。此讀取 SHALL 僅取決於所提供的 graph 元素,對相同輸入 MUST 產生相同結果(確定性),且不得產生任何副作用。系統 SHALL NOT 由圖結構推導 level(不得走訪 `node-to-switch` / `switch-to-switch` 邊)。

#### Scenario: 有效的 level 標籤被讀取

- **WHEN** 某 `switch` 節點的 `labels.level` 為字串 `"2"`
- **THEN** 該節點被指派 level 2

#### Scenario: 缺少 level 標籤時不指派 level

- **WHEN** 某 `switch` 節點沒有 `labels.level` 值
- **THEN** 該節點不獲指派 level,並自 level 對應表中排除

#### Scenario: 無效的 level 標籤不指派 level

- **WHEN** 某 `switch` 節點的 `labels.level` 無法解析為非負整數(空白、非數字或負數)
- **THEN** 該節點不獲指派 level,並自 level 對應表中排除

#### Scenario: 非 switch 節點被忽略

- **WHEN** 某 `kind` 不是 `switch` 的節點帶有 `labels.level` 值
- **THEN** 該節點被忽略,永不被指派 level

#### Scenario: 沒有 switch 時結果為空

- **WHEN** graph 不含任何 `switch` 節點
- **THEN** level 讀取回傳空的對應表

### Requirement: switch fabric 固定為逐層堆疊的橫列

系統 SHALL 依 level 為每個具 level 的 `switch` 節點指定一個固定的絕對位置,使 switch 形成一層一列的橫列:level 數字較高者位於較低者**之上**(例如最高 level 的 core switch 渲染於最頂端),同一 level 的 switch 則在同一列上水平散開。此固定 SHALL 僅透過力導向佈局原生支援的「固定節點位置」能力表達,不得引入新的佈局引擎或額外相依。

系統 SHALL NOT 在任一 pod-parent mode 下固定 K8s `node` 節點:與 fabric 相連的 node(`node-to-switch` 邊的 source)只由其 uplink 邊拉向 fabric,力導向佈局得自由擺放它們(以及包含它們的 cluster compound)而不與 fabric 重疊。(緣由:曾有版本將 controller mode 下與 fabric 相連的 node 固定在由 `min(switchLevel) − 1` 推導出的 fabric 下方一層;該固定已移除——整個 cluster compound 被拖到已固定的 fabric 上會造成 compound 重疊。)

當 switch 經由 `data.parent` 巢狀於單一虛擬 `network` compound(kind `network`,例如標籤為 `physical network`)之下、由其框住整個 fabric 時,固定位置約束 SHALL 仍只針對簡單的 `switch` 節點本身,且不論該 wrapper compound 是否存在 SHALL 套用完全相同的結果——wrapper 的外框僅跟隨其已固定的子節點;作為 compound,它與 cluster compound 保持距離,並可如任何其他容器一般收合(legend 行為見 graph-view)。

當資料含有至少一個**無 parent** 的 `switch`,且**沒有**任何 `network` kind 節點時,app SHALL 自行合成此 wrapper(於正規化之後施加的純 graph 資料步驟):注入單一 `network` 節點(id `network/fabric`,label `physical network`),並將每個無 parent 的 `switch` 重新掛載於其下。當已存在 `network` kind 節點(資料自行擁有分組),或每個 `switch` 皆已帶有 `parent`(後端指派的 parent 永不被覆寫)時,此合成 SHALL 完全退讓,使元素維持不變。此步驟 MUST 為純函式(不得變更輸入)。

約束 SHALL 只引用具 level 的 `switch` 節點;其他所有節點(pod、controller、service、pvc、cluster、K8s node、虛擬 `network` wrapper、無 level 的 switch)SHALL 維持由力導向佈局自由擺放。約束 SHALL 只在目前佈局為力導向(`fcose`)佈局時套用。當沒有任何 `switch` 節點帶有有效 level 時,系統 SHALL 不產生任何約束,佈局 SHALL 表現得與沒有此功能時完全相同。

#### Scenario: 為無 parent 的 switch 合成 wrapper

- **WHEN** 資料含有沒有 `data.parent` 的 `switch` 節點,且沒有 `network` kind 節點
- **THEN** 注入單一 `network/fabric` wrapper(label `physical network`),並將那些 switch 重新掛載於其下

#### Scenario: 資料提供的 network 分組優先

- **WHEN** 資料已含有 `network` kind 節點
- **THEN** 不合成 wrapper、不重新掛載任何 switch(元素原樣通過)

#### Scenario: 同一 level 的 switch 共用一列

- **WHEN** 在 `fcose` 佈局下,兩個以上的 `switch` 節點解析為同一 level
- **THEN** 它們被固定在相同的垂直位置(同一列)、相異的水平位置

#### Scenario: level 由高至低自上而下堆疊

- **WHEN** 在 `fcose` 佈局下,level `k` 與 level `k+1` 都含有 switch
- **THEN** level `k+1` 的列被固定於 level `k` 的列之上

#### Scenario: K8s node 永不被固定

- **WHEN** 在任一 pod-parent mode 下,某 K8s `node` 為 `node-to-switch` 邊的 source
- **THEN** 該節點不被固定;只有其 uplink 邊將其拉向 fabric

#### Scenario: 固定只引用具 level 的 switch

- **WHEN** 產生佈局約束
- **THEN** 約束只引用具 level 的 `switch` id;沒有任何 pod / controller / service / pvc / cluster / K8s node,也沒有任何無 level 的 switch 被固定

#### Scenario: 沒有 switch 具 level 時不產生約束

- **WHEN** 沒有任何 `switch` 節點帶有有效 level(含完全沒有 switch 的情況)
- **THEN** 不產生任何佈局約束

#### Scenario: 只在 fcose 佈局下固定

- **WHEN** 目前佈局為 `dagre`
- **THEN** 不套用 fabric 約束(`dagre` 已對整張圖分層)

### Requirement: switch 相關邊的正交路由

系統 SHALL 在**兩種** pod-parent mode 下皆以正交(直角)路由渲染 `node-to-switch` 與 `switch-to-switch` 邊(cytoscape.js 的 `taxi` curve style),使匯入同一 switch 的多條邊共用直角通道,而非彼此重疊的曲線。其他所有 edge type SHALL 維持既有的曲線路由(`bezier` curve style)。`node-to-switch` 與 `switch-to-switch` SHALL 共用**同一個 infra 顏色**——顏色權威由 graph-view 的 edge type 配色表擁有,`node-to-switch` MUST NOT 另設獨立的顏色(例如 indigo);路由 SHALL NOT 改變 graph-view 所指派的任何顏色。edge 路由 SHALL 為 stylesheet 層的責任,因此與目前使用的佈局演算法無關。

#### Scenario: switch 邊以正交方式路由

- **WHEN** 某邊的 type 為 `node-to-switch` 或 `switch-to-switch`
- **THEN** 以 `taxi`(正交)curve style 渲染

#### Scenario: 非 switch 邊維持曲線

- **WHEN** 某邊的 type 為 `node-to-switch` / `switch-to-switch` 以外的任何 type
- **THEN** 以既有的 `bezier` curve style 渲染

#### Scenario: node-to-switch 與 switch-to-switch 共用一個 infra 顏色

- **WHEN** 渲染 `node-to-switch` 與 `switch-to-switch` 邊
- **THEN** 兩者使用同一個 infra 顏色與實線樣式(node-to-switch 沒有獨立的 indigo),只在端點上不同;`taxi` 路由不改變該顏色

### Requirement: 沒有 switch 具 level 時零影響

系統 SHALL 保證:當 graph 中沒有任何 `switch` 節點帶有有效 level 時,其佈局結果與此 capability 不存在時完全相同——不產生任何約束,力導向佈局結果不變。(switch 相關邊的路由由上述正交路由需求規範,與 level 無關。)

#### Scenario: 無 switch 的 graph 不受影響

- **WHEN** graph 不含任何 `switch` 節點
- **THEN** 不產生佈局約束,既有佈局行為完整保留

#### Scenario: 無 level 的 switch 不被固定

- **WHEN** graph 含有 `switch` 節點,但沒有任何一個帶有有效 level
- **THEN** 不產生佈局約束,每個 switch 皆由力導向佈局自由擺放
