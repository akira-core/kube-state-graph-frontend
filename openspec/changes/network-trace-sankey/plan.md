# 整合 sankey-panel 的「網路交換器流量追查」到 kube-state-graph-frontend

## Context

`/home/kasm-user/sankey-panel` 是一套獨立的 React + TS 專案：以「守恆 Sankey」呈現網路交換器 interface counter 的流量增量（Δbps），從起點 switch 沿 in/out interface 追到來源或終點（client、k8s node / pod / namespace），並把沒追到的量畫成「其他輸入／其他輸出」殘差。本 repo（Storage 讀寫流 Sankey + k8s Graph）要把這個功能整合進來，成為一個新的 **Network** 分類，且 Network 分類也能切換 Graph / Sankey 兩種視角。

與使用者已確認的決策：

1. **功能移植，不整包複製**：把 trace-sankey 的 model / layout / svg 邏輯改寫成本 repo 的慣例（strict TS、theme tokens、Vitest），不加外部依賴；**不得改變既有 `storage-flow-sankey` 行為**（只允許 additive export）。
2. 導覽改成兩層：分類 **Storage | Network** × 視角 **Graph | Sankey**。路由：現有 `/graph`、`/sankey`（Storage）；新增 `/network/graph`、`/network/sankey`。Network 兩個視角共用同一份 loader / payload，切換視角不重打 API。
3. Network 的 Graph 視角重用 cytoscape `GraphView`。
4. 查詢參數在 Network 分類下完全換成 sankey-panel 的一組：`hostname`（必填；自由輸入＋上一次回應裡的 switch 當候選）、`max_hops`(7)、`top_n`(3)、`threshold`(10, %)、`track_dir`(source|destination)。時間區間沿用 NavBar 的 `useViewTimeRange`。顯示門檻 `min_bps` 放在 Sankey 視圖控制列並寫進 URL。
5. 新增 runtime config `endpoints.trace`；請求 `GET <trace>?hostname&from_ts(ms)&to_ts(ms)&max_hops&top_n&threshold&track_dir`，回應是 cytoscape-style wire JSON（sankey-panel README「輸入 JSON 規格」）。demoMode 用 sankey-panel `samples/*.json` 做 fixture。
6. Sankey 功能範圍：**全部**（hop 盒 + iface 槽位標籤、其他輸入/輸出殘差、追查起點錨卡、追查終止葉卡 + clients 表、owner 聚合卡與歸屬線、pod→application→namespace 推導卡、回流/同欄互連邊與排欄破環、k8s node 外框 Layout Flat|Node、min_bps 門檻併入殘差、hover 路徑高亮、tooltip、zoom/pan/fit/1:1/focus 快捷鍵、圖例）。

## 架構與資料流

```
URL /network/:view?hostname&max_hops&top_n&threshold&track_dir&min_bps&from&to
  → parseTraceScope (network-trace/traceUrlScope.ts)
  → NetworkPage (app-shell): useAppliedScope + useDraft + useSeedTimeOnMount
      draft(字串) --Query--> buildTraceQuery(draft) → commit → time.persist → loader.run
  → useGraphLoader({ demoPayload: SHOWCASE_TRACE })   ← 既有 hook，不改
      fetchJson(buildTraceRequestUrl(endpoints.trace, range, query))
      normalizeGraph(payload)  ← additive 擴充：deltaBps / investigation / clients / otherIn|OutBps
  → state.elements (cytoscape.ElementDefinition[]) — 兩個視角的唯一真相
      view=graph  → <GraphView>（既有；註冊 host kind、network-flow edge type）
      view=sankey → <TraceView>: deriveTrace(elements, {direction, minBps, layout})
                                → layoutTrace(model, {order}) → <TraceChart>
```

**資料路徑決策（D1）**：擴充 `normalizeGraph`，Sankey model 從 normalized elements 推導（與 `deriveSankey` 同一模式），不保留 raw payload、不做第二個 parser。理由：`normalize.ts` 已保留 `type→kind`（未知 kind 存活）、`labels`（`tier`/`source_iface`/`target_iface` 都在）、`parent`/`status`/`usage`/`health`/`hardware`/`perf`/`alerts`、`name` 缺就用 id；只缺 `metrics.delta_bps`、`investigation`、`clients`、`other_in_bps`/`other_out_bps` 四類欄位。

**`EdgeMetrics` 型別擴充方式**：`deriveSankey.ts:246-258`、`topPods.ts:36-60`、`showcaseGraph.test.ts` 等處用 `'rate' in metrics` 收窄後把剩餘當 `EdgeIoMetrics`，加第三個 union 成員會讓這些 storage 檔案 typecheck 失敗。所以改成：

```ts
interface EdgeFlowMetrics {
  deltaBps?: number;
} // bits/s, ≥ 0
type EdgeMetrics = EdgeRedMetrics | (EdgeIoMetrics & EdgeFlowMetrics);
```

`EdgeIoMetrics & EdgeFlowMetrics` 可指派給 `EdgeIoMetrics`，既有收窄不變。trace 端用 `typeof m.deltaBps === 'number'` 判別。`parseEdgeMetrics` 順序不變（RED 有 `rate` 仍優先），`delta_bps` 在 `parseIoMetrics` 內讀取。

**sankey-panel `validate.ts` 語意檢查的落點**：

- 結構類（root 不是物件、nodes/edges 缺、id 缺/重複、edge endpoint 不存在）→ `normalizeGraph` 既有 `errors`（partial-parse，與 sankey-panel「整份失敗」不同，寫進 spec）。
- `clients` 非陣列、`other_*_bps` 負數/非數、`investigation` 欄位不合法 → normalize 新 parser：丟該欄 **並** push error。
- 多於一個節點帶 `investigation`、起點不是 hop 型、flow 邊接到群組節點、葉卡不能再往下走、合成 id 撞名、沒有任何可畫節點 → `deriveTrace` 回 `{ ok:false, errors }`。
- `labels` 非字串值：`parseStringRecord` 靜默丟棄，接受差異。
- 頂層 `kind`/deprecated `investigation`/`apiVersion`/`clusters`：不讀。方向以請求的 `track_dir` 為準；起點 `investigation.direction` 不一致時發 warning。

## 移植審核：單一入口、樣式沿用本 repo

原則：**每個「能力」在 repo 裡只有一個實作**。sankey-panel 只貢獻「網路追查」的領域邏輯（model / 排欄 / 殘差 / 卡片內容）；所有呈現基礎設施與圖樣一律用本 repo 既有的。

| 能力                                                                              | 本 repo 既有                                                                                                    | 處置                                                                                                      | sankey-panel 對應（不帶過來）                                                                       |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 資料抓取 / 取消 / 自動刷新 / demo fixture                                         | `useGraphLoader`                                                                                                | 直接重用                                                                                                  | `app/src/useTraceDoc.js`、`api.js` 的 fetch                                                         |
| wire → elements 解析與驗證                                                        | `normalizeGraph`                                                                                                | additive 擴充 4 個欄位                                                                                    | `model/validate.ts`（結構檢查）、`index-raw.ts` 的 wire 讀取                                        |
| Query / Cancel、draft vs applied、URL scope                                       | `QueryButton`、`useAppliedScope`、`useDraft`、`useSeedTimeOnMount`、`buildSearchString`                         | 直接重用；只新增 `traceUrlScope.ts`（key 定義）                                                           | `TraceQueryBar.jsx` 表單、`api.js` 的 `searchFromParams`/`fieldsFromSearch`、`history.replaceState` |
| 時間區間                                                                          | NavBar `useViewTimeRange`、`ViewTimeRange`                                                                      | 直接重用；只在 `traceRequestUrl.ts` 換成毫秒                                                              | `datetime-local` 欄位、`defaultTimes`、`msToLocalInput`                                             |
| 下拉/自訂輸入、eyebrow 標籤、數字輸入樣式                                         | `ScopeSelect`、`Section.eyebrowClass`、`SankeyScopeBar` 的 input class                                          | 直接重用                                                                                                  | `.q-input`、`.field`、`app.css`                                                                     |
| 縮放 / 平移 / fit / 1:1 / 開場視角                                                | `useZoomPan`、`openingViewport`                                                                                 | **抽到共用模組**（見下），storage 與 network 都從那裡 import                                              | `zoom.ts`、`hooks/useZoom.ts`                                                                       |
| 縮放控制列 + focus 按鈕                                                           | `SankeyControlBar`                                                                                              | 同上                                                                                                      | `App.jsx` 的 `.zoom-ctl`                                                                            |
| 鍵盤快捷鍵 `+ - 0 1 F Esc`                                                        | `SankeyView.handleKeyDown`                                                                                      | 抽成共用 `useSankeyKeyboard`（或純函式），storage 改用                                                    | `App.jsx` 的 `onKey`                                                                                |
| 專注模式                                                                          | `ShellFrame.focusMode` + `AppLayout` 隱藏 NavBar                                                                | 直接重用                                                                                                  | `hooks/useFocus.ts`、`body.chart-focus` CSS                                                         |
| Tooltip 定位 / 外觀                                                               | `SankeyView` 的 `tip`/`tipPos` + overlay div                                                                    | 抽成共用 `useSankeyTooltip` + `SankeyTooltip`                                                             | `tooltip/TraceTooltip.tsx`、`data-tip` JSON 委派                                                    |
| SVG 主機（無 viewBox、transform group、欄標題、hover 變淡 `lit`）                 | `SankeyChart` 外層                                                                                              | 抽成共用 `SankeyCanvas`（`children` 為圖形內容）                                                          | `svg/TraceSvg.tsx` 的 `.zoom-layer`                                                                 |
| 卡片、外框圖樣（圓角、標題分隔線、字級、status 邊框、虛線設備框、namespace 色條） | `SankeyChart.nodeCard` / `wrapperBox`                                                                           | 抽成共用 `SankeyCard` / `SankeyWrapperBox`；network 卡片**只用這套外觀**，加上 iface 槽位文字與可選附加行 | `svg/cards.tsx` 的 `.leaf-stop`/`.n-title`/`.leaf-main` 樣式、`layout/colors.ts`、`styles/*.css`    |
| 帶（ribbon）路徑與粗細比例尺                                                      | `layoutSankey` 的 `ribbonPath`、`stackHeight`、`placeStack`、`MIN/MAX_THICKNESS`、`ROW_*`、`CARD_W`、`HEADER_H` | 抽到共用 `sankey-canvas/geometry.ts`；`layoutTrace` 用同一組常數與函式，卡片尺寸與 storage 一致           | `layout/constants.ts` 的 `NODE_W`/`THICK_*`、`layout/paths.ts` 的 `ribbon`                          |
| 狀態圖例圓點、read/write 線樣圖例                                                 | `SankeyView` 內聯                                                                                               | 抽成共用 `StatusLegend`（圓點）；network 圖例列用同一元件 + 同樣的 svg 線樣寫法                           | `App.jsx` 的 `.legend`                                                                              |
| 摘要表格                                                                          | `SankeySummary` 的折疊面板與 `dataTableClass`                                                                   | `TraceSummary` 用相同 `dataTableClass`、Caret 折疊寫法                                                    | `tables.ts`/`summary.ts` 的 HTML                                                                    |
| 數值格式                                                                          | `shared/format/measurements.ts`（`formatSignificant`、`formatBytes`、`formatUsage`）                            | 新增 `formatBitsPerSec`、`formatDeltaBps`（同一套有效位數規則）                                           | `model/format.ts`                                                                                   |
| 節點定位到 Graph                                                                  | `onLocateNode` → `navigate(..., { state: { locate } })`                                                         | 直接重用（目標改 `/network/graph`）                                                                       | `hooks/useNodeClick.ts`                                                                             |
| Graph 視角                                                                        | `GraphView` + cytoscape 樣式表                                                                                  | 直接重用；只註冊 `host` kind、`network-flow` edge                                                         | 無                                                                                                  |

**只有網路追查獨有的東西才移植**：hop 分類、邊聚合與門檻過濾、錨卡、葉卡（clients 表）、owner 聚合、pod→app→ns 推導、排欄破環、backward/lateral 帶的路徑（`lateralRibbon`/`backwardRibbon`/`ownLine`）、殘差計算與殘差槽位、k8s node 外框成員規則、hover 路徑、tooltip 文字內容、圖例列文字。

### 共用模組抽取：`src/features/sankey-canvas/`

從 `storage-flow-sankey` **搬出**（純機械搬移 + 重新 export，storage 端 import 改路徑，行為與測試不變）：

- `useZoomPan.ts`（含 `openingViewport`、`fitViewport`、`Viewport`、`Size`、`ZoomPanApi`）與其測試。
- `SankeyControlBar.tsx`。
- `geometry.ts`：`CARD_W`、`LEAF_W`、`HEADER_H`、`BODY_MIN`、`ROW_MIN_H`、`ROW_GAP`、`MIN_THICKNESS`、`MAX_THICKNESS`、`LABEL_MIN_THICKNESS`、`PAD_TOP`、`stackHeight`、`placeStack`、`ribbonPath`、`thicknessScale(maxValue)`（從 `layoutSankey.ts` 抽出；`layoutSankey` 改 import）。
- `SankeyCanvas.tsx`：`SankeyChart` 的外層 host div + svg + transform group + 欄標題 `<text>`；props `{ columns, viewport, hostRef, hostProps, dragging, onKeyDown, children, defs? }`。`SankeyChart` 改成組合 `SankeyCanvas` + 自己的帶/卡片。
- `SankeyCard.tsx`：`nodeCard` / `wrapperBox` 改成元件 `SankeyCard`（props：位置尺寸、label、subtitle、kind、status、dashed、locatable、faded、namespaceColor、`extraLines?: string[]`、`slotLabels?: { left: Array<{cy, text}>; right: … }`、事件）與 `SankeyWrapperBox`。既有 storage 呼叫傳原本的值，輸出 SVG 相同（既有 `SankeyView.test.tsx`/`SankeyChart` 測試守門）。
- `useSankeyTooltip.ts` + `SankeyTooltip.tsx`（`tip`/`tipPos`/`useLayoutEffect` 夾邊界 + overlay div）。
- `useSankeyKeyboard.ts`（`handleKeyDown` 邏輯：排除 input/select/textarea/radio）。
- `useContainerSize.ts`（`ResizeObserver` + 首次量測）與 `useOpeningViewport.ts`（一次性 fit）。
- `StatusLegend.tsx`。

`storage-flow-sankey/index.ts` 不需再 additive export 這些（改由 `sankey-canvas/index.ts` 提供）。此抽取作為獨立階段（Phase 2），完成後 storage sankey 全部測試綠、e2e `sankey-svm-grouping.spec.ts`/`storage-graph.spec.ts` 綠，才進入 network 的 chart 階段。

## 新增 feature：`src/features/network-trace/`

子目錄 `model/`、`layout/`、`chart/`、`testing/`。所有移植檔：英文註解、named export、無 `.js` 後綴、不寫 hex 色碼（用 tokens）。

### model/（來源 `packages/trace-sankey/src/model/*`）

| 目標                                                                                          | 來源                                       | 重點                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                                                                                    | `types.ts`                                 | 去掉 `Channel`/`RateUnit`/`StorageRoots`/wire 型別；保留可變 `TraceNode`/`TraceEdge`/`TraceWrapper`/`TraceModelOk`/`TraceModelError`；`nsEdges: Record<channel,…>` 收成單一 `nsEdge`；`nodeMap: ReadonlyMap`。`DeriveTraceOptions { direction; minBps?; layout? }`                                                                                                  |
| `classify.ts`                                                                                 | `classify.ts`                              | `HOP_KINDS`、`GROUP_KINDS`、`FLOW_EDGE_TYPES = ['network-flow']`（storage-flow 邊忽略、不 crash）、`AUTO_TIER`、`classOf`、`recKind(data)`（仿 `deriveSankey.ts:152` 的 isNamespace/isApplication/… 折疊）、`worstStatus`、`weightOf(metrics)` 只讀 `deltaBps`、`clientsOf`、`infoOf`、`isPlacementEdge` = `labels.tier==='pod-node' \|\| edgeType==='pod-to-node'` |
| `nodeIndex.ts`                                                                                | `index-raw.ts`                             | `indexNodes(elements): { get, ancestorOf(id, kind), appOf, nsOfPod }`                                                                                                                                                                                                                                                                                               |
| `investigation.ts`                                                                            | `investigation.ts` + `anchor.ts`           | `resolveInvestigation(index, elements)`（最多一個、必須 hop 型）、`addAnchor(ctx)`                                                                                                                                                                                                                                                                                  |
| `scan.ts`、`edges.ts`、`prune.ts`、`columns.ts`、`residuals.ts`、`wrappers.ts`、`assemble.ts` | 同名（`normalize.ts`→`assemble.ts`）       | 直接移植：`Record`→`Map`、移除 channels/`hiddenChannel`/`unit`/roots/`rootLeafPods`、warning 改英文、`SEP` 來自 `util.ts`。`columns.ts` 5a–5g 逐步照搬（tier 超級節點、多數決破環、SCC、最長路徑、backward/lateral/subOrder）。`residuals.ts` 平衡式、源頭豁免、`eps = max(in,out)*0.005+1`、門檻濾掉量併入殘差                                                     |
| `validate.ts`                                                                                 | `validate.ts`（語意部分）                  | `validateTraceSemantics(index, elements, direction): string[]`                                                                                                                                                                                                                                                                                                      |
| `deriveTrace.ts`                                                                              | `build.ts`                                 | `deriveTrace(elements, opts): TraceModel`、`resolveTraceDirection(trackDir, elements): { direction; warning? }`；不 mutate elements                                                                                                                                                                                                                                 |
| `hoverPath.ts`                                                                                | `hooks/useHighlight.ts` 的 `pathOf`        | 純函式 `hoverPath(model, id): { edgeIds; nodeIds }`（wrapper 取成員 pod 聯集）；改用 SankeyChart 的 `lit` opacity 模式取代 DOM class                                                                                                                                                                                                                                |
| `locatable.ts`                                                                                | `locatable.ts`                             | 規則不變                                                                                                                                                                                                                                                                                                                                                            |
| `aggregates.ts`、`summary.ts`                                                                 | `aggregates.ts`、`summary.ts`、`tables.ts` | 只回結構化 rows，給 `TraceSummary.tsx`                                                                                                                                                                                                                                                                                                                              |
| `util.ts`                                                                                     | `util.ts`                                  | `SEP`、`sum`、`mustGet(map, key, what)`（取代 `!` 斷言）                                                                                                                                                                                                                                                                                                            |

丟棄：`static.ts`（SSR）、`zoom.ts` / `hooks/useZoom.ts`（改用 `useZoomPan`）、`useStableDoc`/`useStableJson`/`useLatest`、`useFocus`（沿用 ShellFrame focusMode）、`tooltip/TraceTooltip.tsx`（沿用 SankeyView 的 tip 定位）、`styles/*.css`（改 tokens）、`roots` storage 選項、`channels` read/write 選項、`samples.storage.ts`、`react.ts`/`index.ts`。

### layout/（來源 `layout/*`）

- 幾何常數與 `stackHeight`/`placeStack`/`ribbonPath`/粗細比例尺一律來自 `sankey-canvas/geometry.ts`（與 storage 相同的卡寬、標題高、槽位行高、帶粗細範圍）。sankey-panel 的 `layout/constants.ts` 只保留網路獨有的 `RES_LEN`/`RES_GAP`（殘差色塊長度）、`CLIENT_ROW_H`/`CLIENT_PAD`/`CLIENT_GAP`（clients 表）、`OWN_T`（歸屬線粗細）→ 放進 `layout/constants.ts`；`layout/colors.ts` 不移植。
- `geometry.ts`：`Slot`/`NodeGeom`/`EdgeGeom`/`WrapperGeom`/`Geometry` 照搬（網路獨有：殘差槽、`role` lat-in/lat-out/back-in/back-out、`bulge`、`backY`）。
- `text.ts`：卡片文字行清單（`hopLines`/`leafLines`/`groupLines`/`ownerLines`、`clientCols/Rows`、`clip`）與由行數算出的卡高；文案英文；usage 用 `formatUsage`。與 `SankeyCard` 的 `extraLines` 對應：每行高度用共用 `ROW_MIN_H`/行距常數，不另定字級。
- `paths.ts`：只移植網路獨有的 `ownLine`、`lateralRibbon`、`backwardRibbon`；一般帶用共用 `ribbonPath`。
- `layoutTrace.ts`（`layout.ts` + `options.ts`）：`layoutTrace(model, { order?: 'flow'|'barycenter' }): Geometry`，`DEFAULT_ORDER='flow'`；保留 barycenter（30 行，且是 flow 的 tie-break 退化路徑）。殘差是真槽位、與帶共用比例尺。
- `tooltips.ts`（`tips.ts`）：`bandTooltipLines`、`nodeTooltipLines`、`residualTooltipLines`、`colCaption`；`BandMeta` 用 exhaustive `Record<keyof BandMeta,…>` 渲染取代 sankey-panel 的 lists.test 守門。輸出 `string[]`，餵給共用 `SankeyTooltip`。

### chart/（只含網路獨有圖形，外觀沿用本 repo）

- `TraceChart.tsx`：組合共用 `SankeyCanvas`（host、svg、transform、欄標題、鍵盤）；自己只渲染：帶（一般帶用共用 `ribbonPath` + `sankey.traceFlow` 漸層，與 storage 帶同樣的 `fillOpacity`/`lit` 變淡規則；lateral/backward 用專屬路徑）、帶上數字（同 storage 的 halo 文字樣式，`formatDeltaBps`）、卡片、殘差。z-order 同 sankey-panel：帶 → 數字 → 外框 → 卡片 → 殘差。
- `TraceCards.tsx`：**全部以共用 `SankeyCard` / `SankeyWrapperBox` 畫**，差異只在傳入的內容：
  - hop 盒：`label`=名稱、`subtitle`=`<kind> · <tier|ontap_cluster>`、`slotLabels`=左右 iface 文字（貼槽位 cy）、`dashed`=設備型（node/pod/netapp-*，同 storage 的 netapp 虛線慣例）、`status` 邊框；root/錨點用 `accent.primary` 邊框（不新增天藍/青色 token）。
  - 葉卡（追查終止 / port）：`SankeyCard` + `extraLines`（clients 表以等寬文字行呈現：`hostname  ip  owner` 表頭 + 每台一行，欄寬由 `clientCols` 計算）；右上角角色字（`trace stop` / `client` / `port`）用 `fg.muted` 小字。
  - pod 卡、namespace / application 群組卡、owner 卡：`SankeyCard`，`subtitle` 帶 pod 數 / 量 / 台數；namespace 色條沿用 storage 的 `namespaceColor` 機制（同一 palette、同一 `orderPodTier` 配色規則 → 從 `layoutSankey` 抽出的配色函式放進 `sankey-canvas/geometry.ts` 或 `namespacePalette.ts` 共用）。
  - 錨卡：`SankeyCard`，`label`=iface、`subtitle`=`<in|out> · +Δ`，邊框 `accent.primary` 虛線。
  - 殘差 `Residual`：貼盒子外側的虛線色塊 + 兩行文字（`other in`/`other out` + 量），顏色 `sankey.traceResidualIn/Out`，文字 halo 同 storage。
  - `data-testid="trace-node-<label>"`、`data-kind`、`data-status`、`data-locatable` 與 storage 命名對齊（前綴不同避免測試互撞）。
- `TraceDefs.tsx`：只定義 `ksg-trace-grad-flow`、`ksg-trace-grad-back` 兩個 linearGradient，寫法同 `SankeyChart` 的 read/write 漸層。
- 不移植：`svg/Band.tsx` 的 hover class 切換（改用 `lit`）、`cards.tsx` 的 `.leaf-stop`/`.n-title`/`.leaf-main`/`.p-label`/`.res-label` class 與 `gAttrs` 的 `data-tip` JSON、`Defs.tsx` 的 hover 漸層、`layout/colors.ts`、`styles/tokens.css`、`styles/trace-sankey.css`。

### view 層

- `TraceView.tsx`（與 `SankeyView.tsx` 同骨架，共用元件全部來自 `sankey-canvas`：`useContainerSize`、`useOpeningViewport`、`useZoomPan`、`useSankeyKeyboard`、`useSankeyTooltip` + `SankeyTooltip`、`SankeyControlBar`、`StatusLegend`；不重寫這些邏輯）。控制列 = `Layout` Segmented(Flat|Node)、`Min Δ` 數字輸入（raw 字串、200ms debounce → `onMinBpsChange`、blur 用 `cleanMinBps` 正規化，input class 同 `SankeyScopeBar` 的 Top pods 欄）、Clear、pill「hidden N ribbons / M hops (X)」、`Order` Segmented(Flow|Barycenter，page-transient)、圖例。空狀態 testid：`trace-empty-unconfigured|scope|awaiting|cancelled|model-error|filtered`，文案格式同 `SankeyView.emptyCopy`。warnings 抽屜列出 `model.warnings` + normalize errors。
- `TraceScopeBar.tsx`：`ScopeSelect label="Hostname" mode="single" allowCustom options={candidates}`；數字輸入 Max hops / Top N / Threshold %；`Select` Track(source|destination)；`QueryButton`（`disabledReason` = 第一個 problem）；problems 以 `data-testid="trace-scope-problem"` 顯示。
- `TraceLegend.tsx`：圖例**文字**移植自 `app/src/App.jsx:210-232`（英文），依圖上實際有無 lateral/backward/owns/status 決定列；外觀用 `SankeyView` 既有的 svg 線樣寫法與共用 `StatusLegend`，不帶 `.legend` CSS。
- `TraceSummary.tsx`：折疊面板（仿 `SankeySummary`），hop 守恆表 + namespace 小計。
- `traceUrlScope.ts`、`useHostnameCandidates.ts`（純函式 `switchHostnames(elements)` + memo hook）。
- `testing/samples.ts`：sankey-panel `samples/*.json`（除 storage.json）轉 TS 常量。
- `index.ts` barrel。

## URL scope（`/network/*`）

| key         | draft 欄位                | 預設               | 序列化              | 非法值                            |
| ----------- | ------------------------- | ------------------ | ------------------- | --------------------------------- |
| `hostname`  | `hostname: string`        | `''`（Query 必填） | 非空才寫            | —                                 |
| `max_hops`  | `maxHops: string`         | `'7'`              | 等於預設省略        | 非正整數 → problem                |
| `top_n`     | `topN: string`            | `'3'`              | 同上                | 同上                              |
| `threshold` | `threshold: string`       | `'10'`             | 同上                | 非 [0,100] → problem              |
| `track_dir` | `trackDir`                | `source`           | 等於 source 省略    | 其他值 → 預設 + problem           |
| `min_bps`   | scope 層 `minBps: number` | `0`                | 0 省略              | `cleanMinBps`（floor，>0 否則 0） |
| `from`/`to` | shell                     | —                  | `buildSearchString` | 既有規則                          |

```ts
export interface TraceDraft {
  hostname;
  maxHops;
  topN;
  threshold;
  trackDir;
}
export interface TraceUrlScope {
  query: TraceDraft;
  minBps: number;
  problems: string[];
}
export const TRACE_DEFAULTS = { max_hops: 7, top_n: 3, threshold: 10, track_dir: 'source' } as const;
export function parseTraceScope(params): TraceUrlScope; // 缺 → ''（=預設）；非法 raw 原樣留在 draft + problem
export function serializeTraceScope(scope): Array<[string, string]>;
export function buildTraceQuery(draft): { ok: true; query: TraceQuery } | { ok: false; problems: string[] }; // 移植 TraceQueryBar.buildParams（去掉時間）
export function cleanMinBps(raw): number;
```

draft 存 raw 字串（sankey-panel 慣例：空＝預設、填錯＝拒送並報錯、絕不默默改值）。`useDraft` 深比較字串即可。

## 修改既有檔案

| 檔案                                                                                                         | 變更                                                                                                                                                                                                                                          | 對既有功能安全性                             |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `src/shared/types/cytoscape.d.ts`                                                                            | `EdgeFlowMetrics`、`EdgeMetrics` 改交集；`NodeDataDefinition.investigation?/clients?/otherInBps?/otherOutBps?`                                                                                                                                | 全部 optional、union 仍二元                  |
| `src/shared/types/wire.ts`                                                                                   | `WireFlowMetrics { delta_bps }`、`WireInvestigation`、`WireClient`、node 新欄位、`name?`                                                                                                                                                      | type-only 放寬                               |
| `src/features/graph-data/normalize.ts`                                                                       | `parseIoMetrics` 讀 `delta_bps`（finite ≥0）；`parseNodes` 加 `parseInvestigation`/`parseClients`/`parseNonNegativeBps`，各附 error entry                                                                                                     | 以 key 存在為守門；既有 fixture 無這些 key   |
| `src/features/graph-data/traceRequestUrl.ts`（新）+ `index.ts`                                               | `TraceQuery`、`TRACE_DEFAULTS`、`buildTraceRequestUrl(endpoint, range, query, nowMs?)`：秒 ×1000、七參數一律顯式、hostname 空回 `undefined`、用 `withQuery`                                                                                   | 新檔                                         |
| `src/shared/constants/types.ts`                                                                              | `NodeKind` + `'host'`；`EdgeType` + `'network-flow'`                                                                                                                                                                                          | 編譯器強制下列 Record 補齊                   |
| `iconSvgByKind.ts`、`categoryByKind.ts`                                                                      | `host` 圖示 / `host: 'Other'`                                                                                                                                                                                                                 | key parity test                              |
| `colorByEdgeType.ts`                                                                                         | `EDGE_ENDPOINTS_BY_TYPE['network-flow']={from:'switch',to:'host'}`；`EDGE_IS_TRAFFIC_BY_TYPE['network-flow']=false`；`EDGE_STYLE_BY_TYPE['network-flow']={color: tokens.edge['network-flow'], solid, routing:'taxi'}`                         | `getStylesheet` snapshot 需重生（預期 diff） |
| `drawnEdgeTypesForMode.ts`                                                                                   | 兩種 mode 都加 `network-flow`                                                                                                                                                                                                                 |                                              |
| `src/shared/theme/tokens.ts`                                                                                 | `kind.host`、`edge['network-flow']`、`sankey.trace*`（見下）light/dark 兩份                                                                                                                                                                   | `tokens.test` 強制 parity                    |
| `hover-tooltip/.../HoverTooltip.tsx`                                                                         | `deltaBps` 有值時加一列 `Δ rate: +8 Gbps`                                                                                                                                                                                                     | additive                                     |
| `src/shared/nodeAttributes/buildNodeAttributes.ts`                                                           | `investigation`、`clients` 摘要列                                                                                                                                                                                                             | additive                                     |
| `src/shared/format/measurements.ts`                                                                          | `formatBitsPerSec`、`formatDeltaBps`（唯一決定「何時加 +」的地方）                                                                                                                                                                            | 新 export                                    |
| `src/features/storage-flow-sankey/{SankeyView,SankeyChart,layoutSankey,index}.ts(x)`                         | 改為 import `sankey-canvas` 的共用元件/常數/函式（純搬移，輸出 SVG 與行為不變）                                                                                                                                                               | 既有單元測試與 e2e 全綠為驗收條件            |
| `src/features/sankey-canvas/`（新，內容搬自 storage-flow-sankey）                                            | 見「共用模組抽取」                                                                                                                                                                                                                            | 搬移 + 測試同步搬移                          |
| `runtime-config/types.ts`、`validate.ts`                                                                     | `RuntimeEndpoints.trace?`；`KNOWN_ENDPOINT_KEYS` + parse loop 加 `'trace'`                                                                                                                                                                    | 選填                                         |
| `app-shell/AppShell.tsx`、`NavBar.tsx`、`NetworkPage.tsx`（新）                                              | 見下節                                                                                                                                                                                                                                        |                                              |
| `src/shared/fixtures/showcaseTrace.ts`（新）、`dev/buildFixture.mjs`（第三個目標）、`public/demo/trace.json` | fixture = `client.json` + 帶 namespace/application 群組 parent 的 k8s 分支 + 一組 `labels.tier` lateral 邊 + 一條 backward 邊 + `pod-node` 邊；起點 `investigation.direction:'in'`；switch id 盡量與 `SHOWCASE_GRAPH` 重疊讓 demo Locate 可用 |                                              |
| `README.md`、`deploy/README.md`、`deploy/configmap.yaml`                                                     | 見 Docs                                                                                                                                                                                                                                       |                                              |

Theme tokens（dark / light，只加語意上本 repo 沒有的）：`kind.host`、`edge['network-flow']`、`sankey.traceFlow`/`traceFlowEnd`（Δ 帶漸層）、`sankey.traceBackward`/`traceBackwardEnd`（回流帶）、`sankey.traceResidualIn`/`traceResidualOut`（其他輸入/輸出色塊）。其餘一律沿用：卡片底/邊 `sankey.nodeFill`/`nodeStroke`、status 邊框 `STATUS_COLOR`、root/錨卡 `accent.primary`、葉/群組/owner 卡與歸屬線 `border.medium`/`fg.muted`、文字 `fg.*`、光暈 `bg.canvas`、namespace 色條 `sankey.namespace1-5`。不引入 sankey-panel 的青/天藍/灰/琥珀/玫瑰整組色票。

## App shell / 路由 / NavBar

`AppShell.tsx`：

```tsx
<Route path="graph" element={<GraphPage />} />
<Route path="sankey" element={<SankeyPage />} />
<Route path="network" element={<NetworkRedirect />} />      // → /network/graph，保留 search，replace
<Route path="network/:view" element={<NetworkPage />} />
<Route path="*" element={<NotFoundPage />} />
```

`AppLayout`：`isNetworkGraph`/`isNetworkSankey`/`isNetwork`；`document.title` 加 `— Network Graph` / `— Network Sankey`；focusMode 重置條件改為 `!isSankey && !isNetworkSankey`；`notFound` 加 `!isNetwork`；`refreshIntervalSeconds` 條件加 `isNetwork`。`NotFoundPage` 抽成可 export，`NetworkPage` 在 `view` 不是 `graph|sankey` 時自行渲染它。

`NavBar.tsx`：`VIEWS` 換成 `CATEGORIES`（Storage→`/graph`、Network→`/network/graph`）與 `VIEWS_BY_CATEGORY`；用 `useLocation()` 判斷 category（`pathname.startsWith('/network')`）。分類連結用 bare path（重置）；Network 的視角連結帶 `{ pathname, search: location.search }` 讓 applied scope 跨視角保留。分類 segmented `aria-label="Category"`、視角 `aria-label="View"`；任一時刻只有一組 Graph/Sankey 連結，既有 `getByRole('link',{name:'Sankey'})` 測試不受影響。

`NetworkPage.tsx`（仿 `SankeyPage.tsx` + `GraphPage.tsx`）：

- `useParams().view`；`useAppliedScope(parseTraceScope, serialize)`、`useDraft(applied.query)`、`useSeedTimeOnMount`。
- 單一 `useGraphLoader({ demoMode, demoPayload: SHOWCASE_TRACE, refreshIntervalSeconds })`；demoMode 時 mount 即 `run(() => undefined)`（同 SankeyPage）。
- `built = useMemo(() => buildTraceQuery(draft))`；`onQuery`：不 ok → `setFormProblems`；ok → `commit({query: draft, minBps: applied.minBps, problems: []}, range)` → `time.persist` → `setArmed(true)` → `trace.run(() => buildTraceRequestUrl(endpoint, range, built.query))`。
- `onMinBps`：demo 用 local state；否則 `commit({...applied, minBps}, appliedRange)`（同 SankeyPage `onTopPods`）。
- `setStatus` effect（`reloadDisabled: !armed || (!demo && (endpoint===undefined || !built.ok))`）；unmount 時 `IDLE_PAGE_STATUS` + `setFocusMode(false)`。
- Locate：Sankey 卡片點擊 → `navigate({ pathname:'/network/graph', search }, { state:{ locate:id } })`；Graph 視角以 `GraphPage.tsx:40-51` 同樣的 effect 消費 `location.state.locate`。
- 渲染：`!focusMode && <TraceScopeBar …/>`；`<main>` 內 `view==='graph' ? <GraphView config elements errors error hasPayload cancelled status viewTimeRange={time.resolved} onAlertTimeClick={time.setAround} locateNodeId onLocateConsumed/> : <TraceView …/>`。
- URL 帶非法值：`applied.problems` 於 mount 顯示在 scope bar，Query disabled 直到 draft 改成合法；永不用非法值組請求。

## Docs（openspec）

- `openspec/changes/network-trace-sankey/`：`proposal.md`、`design.md`（D1 normalize additive 與 metrics 交集型別；D2 分類頁共用 loader；D3 raw 字串 draft、URL 非法值不默改；D4 方向以 `track_dir` 為準；D5 丟 channels/roots；D6 tokens 不用 hex、圖樣沿用本 repo；D7 golden snapshot；D8 呈現基礎設施單一入口 `sankey-canvas`，storage 與 network 共用）、`tasks.md`、`specs/network-trace/spec.md`（新）、`specs/app-shell/spec.md`、`specs/runtime-config/spec.md`、`specs/graph-data-source/spec.md`、`specs/dev-environment/spec.md` 的 delta。格式參考 `openspec/changes/archive/2026-09-13-sankey-large-cluster-controls`。
- `README.md`：demo fixtures（三份）、`endpoints.trace`（例 `/api/v1/trace`，走既有 `/api` proxy）、Network 分類架構說明、`/network/*` URL 參數表、troubleshooting。`deploy/README.md`、`deploy/configmap.yaml` 加 `trace`。`docker/nginx.conf` 不用改。

## 實作順序（每階段保持 typecheck / lint / test 綠）

0. **分支與計畫提交**：`git checkout -b feat/network-trace`；把本計畫完整複製到 `openspec/changes/network-trace-sankey/plan.md` 並單獨 commit（`docs(network-trace): add integration plan`），之後才開始實作。
1. **Spec 骨架**：openspec change 資料夾（`proposal.md`、`design.md`、`tasks.md`、specs delta）。
2. **抽出 `sankey-canvas` 共用模組**：從 `storage-flow-sankey` 搬 `useZoomPan`、`SankeyControlBar`、幾何常數/函式、`SankeyCanvas`、`SankeyCard`/`SankeyWrapperBox`、tooltip/keyboard/container-size/opening-viewport hooks、`StatusLegend`；storage 端改 import。驗收：storage 全部單元測試 + `sankey-svm-grouping`/`storage-graph` e2e 綠，`SankeyChart` 輸出 SVG 不變（可用既有 snapshot/測試）。
3. **共用基礎**：`types.ts` union、icon/category/colorByEdgeType/drawnEdgeTypes、tokens、`cytoscape.d.ts`、`wire.ts`、`measurements.ts` formatter、normalize 擴充 + 測試、HoverTooltip / buildNodeAttributes 列、重生 `getStylesheet` snapshot。
4. **設定與請求**：`endpoints.trace`、`traceRequestUrl.ts`、`traceUrlScope.ts` + 測試。
5. **Model 移植**：`model/*`、`testing/samples.ts`、`deriveTrace` 守恆測試、aggregates、hoverPath、invariants 測試（feature 目錄內無 hex、無 `className` 字串樣式、`'+'` 只來自 `formatDeltaBps`）。
6. **Layout 移植**：`layout/*`（用 `sankey-canvas/geometry.ts` 的常數）、`layoutTrace` 測試（移植 `flow-order.test.mjs`）、tooltips 測試、golden snapshot（model + geometry 取 3 位小數）。
7. **Chart 與 view**：`chart/*`（只用 `SankeyCanvas`/`SankeyCard` 組合）、`TraceView`、`TraceScopeBar`、`TraceLegend`、`TraceSummary`、`showcaseTrace.ts` + `buildFixture.mjs` + `public/demo/trace.json`、元件測試（移植 `cards.test.mjs`：每個 `<text y>` 落在卡框內）。
8. **Shell 整合**：`NavBar` 兩層、`AppShell` 路由、`NetworkPage`、locate/focus/status、`NavBar.test`/`AppShell.test`（`/network` 轉址保留 query；mount 0 請求；Query 恰一次含七參數；切視角 0 請求且 `hasPayload` 保留；`/network/foo` not-found）。
9. **E2E 與文件**：`tests/network-trace.spec.ts`、README/deploy 文件、configmap。

## 測試計畫摘要

- 移植：`flow-order`→`layoutTrace.test.ts`；`entry`→同檔（決定性）；`cards`→`TraceCards.test.tsx`（`renderToStaticMarkup`）；`format`→`measurements.test.ts` + `invariants.test.ts`；`lists`→`classify.test.ts` + 編譯期 exhaustive Record；`aggregates`→`aggregates.test.ts`；`golden.mjs`→`golden.test.ts`（每個 sample × `minBps 0/5e8` × `layout node` × `order barycenter`，deep-freeze 輸入）。丟棄 `channels`、`samples`、`deploy`、`colors` 測試。
- 新增：normalize 新欄位（含既有 storage fixture byte-identical 回歸）、`traceRequestUrl`（13 位毫秒、七參數、hostname 空 → undefined）、`traceUrlScope`、`deriveTrace`（每台守恆 `tracedIn+otherIn ≈ tracedOut+otherOut`、源頭豁免、兩個 investigation → error、群組端點 → error、葉續走 → error、storage-only payload 不 crash、方向不一致 warning、owner 計量規則）、`TraceView`（六種空狀態、debounce、pill、layout 切換、快捷鍵、hover 節點消失清 tip）、`TraceScopeBar`、`NavBar`、`AppShell`、`validate`（`endpoints.trace`）、`showcaseTrace.test.ts`。
- E2E `tests/network-trace.spec.ts`（仿 `explicit-query.spec.ts`）：stub `config.json` 帶 `endpoints.trace:'/demo/trace.json'`；`/network/sankey?hostname=sw-tor-1&from=now-1h&to=now` → `trace-empty-awaiting`、0 請求、Reload disabled；Query → 一次請求含 `hostname=sw-tor-1&max_hops=7&top_n=3&threshold=10&track_dir=source` 與 13 位 `from_ts/to_ts`；`trace-svg` 可見；切 Graph → `graph-canvas` 可見、請求數不變、URL 保留 `hostname`；回 Sankey 設 Min Δ → pill 出現、無請求；Cancel 保留舊圖。demo spec：`/network/sankey` 渲染 fixture、圖例列存在。

## 驗證方式

1. `npm run typecheck && npm run lint && npm run test` 全綠；既有 `storage-flow-sankey/*.test`、`SankeyView.test.tsx`、`normalize.test.ts` 除 import 路徑外不需修改即通過（`getStylesheet` snapshot 預期 diff）。
   1a. 單一入口稽核：`grep -rn "useZoomPan\|ribbonPath\|stackHeight\|placeStack\|handleKeyDown\|ResizeObserver" src/features` 只命中 `sankey-canvas/`（storage 與 network 都是 import）；`src/features/network-trace/` 內無 hex 色碼、無 CSS 檔、無 sankey-panel 的 class 名（`leaf-stop`/`n-title`/`zoom-layer`/`chart-focus`）。
2. `npm run fixture:build && npm run fixture:check`。
3. `npm run dev`（`dev/config.json` demoMode）→ `/network/sankey` 看到 fixture：hop 盒 iface 標籤、其他輸入/輸出色塊、錨卡、clients 表、owner 卡、pod→app→ns 卡、回流帶、Layout Node 外框；Min Δ 過濾後殘差變大、pill 顯示隱藏數；切 Graph 不重新載入、host 節點有圖示、network-flow 邊 tooltip 顯示 Δ；Storage 分類的 `/graph`、`/sankey` 行為不變。
4. `npm run e2e`（含新 `network-trace.spec.ts`）。
5. 對接真後端：config `endpoints.trace` 指向 `/api/v1/trace`，確認 Query 打出的 URL 七參數與毫秒時間正確。

## 風險與對策

- strict TS 轉換（`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`）：`Record`→`Map`、`mustGet` invariant、`{ ...(x !== undefined ? { x } : {}) }`；逐步移植並在每步跑守恆測試；保留可變 `BuildCtx` 設計不重構。
- `EdgeMetrics` 第三成員破壞 storage 收窄 → 用交集型別避免。
- exhaustive registry：編譯器強制；只有 `getStylesheet` snapshot 與 `categoryByKind` parity 測試會變。
- `switch-topology` 讀 `labels.level` 非 `labels.tier`，Graph 視角無 tier 約束（後續可映射）。
- 毫秒 vs 秒：只在 `traceRequestUrl.ts` 乘 1000；URL `from/to` 維持秒。
- 後端缺 `investigation`：model ok、無錨卡、方向純看 `track_dir`，view 顯示 warning。
- Bundle：純 TS 無新依賴；必要時 `React.lazy` 載入 `TraceView`。
- golden 數字格式與 sankey-panel 不同（本 repo 3 位有效數字），snapshot 以移植版本為準、實作後目視核對 fixture 一次。
