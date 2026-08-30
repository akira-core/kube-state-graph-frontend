## Purpose

由 app 端合成的 compound 容器,將一個 cluster 的 K8s `node` 元素框入單一群組(`cluster > node group > node`),使該 cluster 的機器讀作同一層,並可作為一個單位整體收合。它純屬渲染上的便利——不帶任何後端身分,也永不出現在 wire contract 中。

## ADDED Requirements

### Requirement: node group 合成

系統 SHALL 在每個 K8s `node` 元素與其目前的 parent 之間插入一個合成的 compound 容器,產生渲染階層 `cluster > node group > node`。分組以 node 的**目前 parent** 為鍵:所有共用同一 parent 的 `node` kind 元素落入同一群組,每個相異的 parent 各得一個自己的群組。沒有 parent 的 `node` 元素被分入一個頂層(無 parent)的群組,因此對於 node 位於任何 cluster 之外的 graph,此規則不需要特例。合成的容器 SHALL 帶有:由其所在 parent 推導的確定性 id、`nodes` label、`isNodeGroup` 標記,以及被分組的 node 原本的 parent;它 SHALL NOT 帶有 `kind`、`status`、`worstStatus` 或任何 alert。此合成步驟 SHALL 為純函式:永不變更其輸入,且回傳的每個元素皆為全新的物件。

#### Scenario: 同一 cluster 的 node 被框在一起

- **WHEN** 某 cluster 含有兩個以上的 `node` kind 元素
- **THEN** 在該 cluster 之下插入一個合成群組,兩個 node 皆重新掛載於其下,而該 cluster 的其他子元素(service、PVC、workload 群組、儲存鏈)維持原位

#### Scenario: 每個相異的 parent 各得一個群組

- **WHEN** 兩個 cluster 各自含有 `node` 元素
- **THEN** 每個 cluster 各得自己的群組;群組永不橫跨兩個 cluster

#### Scenario: 單一 node 仍被分組

- **WHEN** 某 cluster 恰好只含一個 `node` 元素
- **THEN** 該 node 仍被包入群組——結構不取決於 cluster 恰有幾台機器,因此 cluster 在第二個 node 出現時不會改變形狀

#### Scenario: 無 parent 的 node 得到頂層群組

- **WHEN** 某 `node` 元素沒有 parent
- **THEN** 它被重新掛載於一個本身也沒有 parent 的合成群組之下

#### Scenario: 輸入永不被變更

- **WHEN** 合成步驟執行
- **THEN** 輸入陣列中沒有任何元素物件被變更,呼叫端的陣列亦維持不變

### Requirement: 合成退讓

當沒有任何東西可分組——不存在 `node` kind 元素——以及當合成會與既有元素衝突時,系統 SHALL 原樣回傳元素集合:若任何元素已佔用此步驟會產生的 id,或已帶有 `isNodeGroup` 標記,此步驟 SHALL 完全退讓,而非產生不完整或相互衝突的階層。

#### Scenario: 不存在 node kind

- **WHEN** graph 不含任何 `node` kind 元素
- **THEN** 回傳的元素集合沒有新增群組,也沒有任何 parent 被改寫

#### Scenario: id 衝突使整個步驟退讓

- **WHEN** 某元素已佔用此步驟會合成的 id
- **THEN** 完全不插入任何群組,也不重新掛載任何 `node` 元素

### Requirement: 兩種 pod-parent mode 皆帶有群組

node group SHALL 在**兩種** pod-parent mode 下皆存在。在 `controller` mode 下 K8s node 為葉節點,渲染鏈為 `cluster > node group > node`;在 `node` mode 下 node 框住其 pod,鏈為 `cluster > node group > node > pod`。切換 mode SHALL NOT 丟失群組,且分組 SHALL 套用於 mode 轉換已產生的元素之上,使 mode 自身的重新掛載規則永不受其干擾。

#### Scenario: 群組在 mode 切換後仍存在

- **WHEN** 使用者在 `Controller` 與 `Node` 兩種 layout 之間切換
- **THEN** node group 方框在兩者中皆存在,K8s node 維持在其內

#### Scenario: node mode 讓 pod 留在其 node 之下

- **WHEN** `node` mode 已將 pod 重新掛載於其 K8s node 之下
- **THEN** 群組包住的是 node 而非 pod:鏈讀作 `cluster > node group > node > pod`,且沒有任何 pod 成為群組的直接子元素

### Requirement: node group 渲染

node group SHALL 渲染為與其他群組方框一致、帶標籤的 compound 底板:沒有資源 icon,以其所屬 cluster 的 accent 著色(使其讀作該 cluster 家族的一部分),並以 title-case 的 `Nodes` 標籤為標題,採用與其他群組標題相同的放大、semibold 樣式。收合時,它 SHALL 顯示其他無 kind 裝飾性群組所顯示的資料夾 glyph,以相同方式著色,而非一個空白的色塊。此標籤轉換 SHALL 僅限渲染層:元素自身的 `label` 維持裸字串 `nodes`,因此任何讀取身分的邏輯皆不受影響。

#### Scenario: 展開的群組是著色且帶標籤的方框

- **WHEN** node group 為展開狀態
- **THEN** 它渲染為無 icon 的圓角矩形底板,以其 cluster 的 accent 著色,標題為 `Nodes`

#### Scenario: 收合的群組顯示資料夾 glyph

- **WHEN** node group 為收合狀態
- **THEN** 它以其 cluster 的 accent 渲染資料夾 glyph——永不是空白色塊——且其邊框如其他所有收合的 compound 一樣加粗

### Requirement: node group 收合

node group SHALL 為可選取,使其被選取時繪出 expand-collapse 的 `+` / `−` cue,讓使用者一鍵收合該 cluster 的每一個 K8s node。它 SHALL 於載入時預設為**展開**,且其收合狀態 SHALL 流經其他所有 compound 共用的同一份 collapsed-id 狀態——因此它在 graph 資料自後端重新整理後被保留、在自 graph 中消失時被 reconcile、並在搜尋結果被 locate 到其內部時自動展開。

#### Scenario: cue 收合整個群組

- **WHEN** 使用者選取 node group 並點擊其 `−` cue
- **THEN** 該 cluster 的每個 K8s node 收入單一群組方框中,點擊 `+` 則將其還原

#### Scenario: 預設展開

- **WHEN** Graph view 載入,不論處於哪一種 pod-parent mode
- **THEN** node group 為展開狀態——不需任何互動即可看到機器

#### Scenario: locate 到已收合群組內的 hit 會展開該群組

- **WHEN** 某搜尋結果解析為巢狀於已收合 node group 內的元素
- **THEN** 該群組被展開使該 hit 得以被選取,與任何其他已收合的祖先完全相同

### Requirement: node group 由 app 端擁有,不是 wire 概念

node group SHALL NOT 出現在 wire contract、demo fixture,或 wire → 內部模型的正規化邊界中:它是自已正規化的元素合成而來。由於它沒有 kind,它 SHALL NOT 出現在 icon 的 `Node Kinds` legend 中,且 SHALL NOT 為它新增任何 legend swatch 區段——既有的容器 swatch 區段持續列出 K8s `node` 容器本身。它 SHALL NOT 可被 kind 過濾器切換,且當它所持有的每個 node 皆被過濾掉時,它 SHALL 經由既有的 orphan 級聯消失。

#### Scenario: 不存在於 wire contract

- **WHEN** 後端 graph payload 被解析
- **THEN** 解析出的元素中不存在任何 node group;它只由後續的 view 轉換加入

#### Scenario: 對 legend 無任何貢獻

- **WHEN** 推導 legend
- **THEN** node group 不新增任何 icon 列與 swatch 列;容器 swatch 區段仍列出 K8s `node` 容器

#### Scenario: 被過濾器清空時群組消失

- **WHEN** 使用者隱藏 `node` kind
- **THEN** 該群組沒有任何可見子元素與可見相連邊,因此 orphan 級聯也移除該群組方框——畫布上不留下空方框
