# UI 審查與改進建議

- 審查日期：2026-09-18
- 基準：`main` @ `0637513`（`feat(sankey): add Weight switch for IOPS flow (#18)`）
- 範圍：`/graph`、`/sankey`、`/network/sankey` 三個頁面的 chrome（nav bar、控制列、左側欄、圖例）與圖表本體（cytoscape graph、Storage Sankey、Network Sankey）。
- 方法：
  - `npm run dev` 後用 Playwright 驅動系統 Chrome 截圖（重現方式見[附錄 B](#附錄-b重現截圖)）。
  - 視窗 1600×950 與 900×900；dark 與 light 兩種主題。
  - demo 模式（`dev/config.json`）與非 demo 模式（用 `page.route` 替換 `config.json`，做法同 `tests/network-trace.spec.ts` 的 `stubConfig`）。
  - Sankey 另外在 1:1 縮放下檢查卡片可讀性。
  - 每個「現況」都對照了原始碼；每個「需改 spec」都對照了 `openspec/specs/`。

文件中的「檔案:行號」以基準 commit 為準。

---

## 0. 應該保留的設計

以下建議都建立在現有設計原則之上，不推翻它們。

- **色相屬於資料。** `src/index.css` 開頭的註解寫明：node kind、edge type、status 已經用掉畫布上所有色相，chrome 保持無彩，只保留 focus ring 的藍色。維運主控台的讀者要在圖上找訊號，chrome 不該搶色。本文件沒有任何建議在 chrome 加品牌色。
- **機器產生的值用 mono。** `--ksg-ui-font-mono` 的註解說明用途：讓讀者一眼分辨「系統說的」和「UI 標的」。這是有意義的字型分工，保留。
- **Explicit Query。** draft 與 applied 分離、`Changes not applied` 提示、URL 即 applied scope。流程清楚，可分享、可重整。
- **無障礙基礎。** `:focus-visible` ring、`prefers-reduced-motion`、`Segmented` 底層是原生 radio、`Select` 保留原生 `<select>`。
- **空狀態文案。** 例如 `Nothing has been requested yet. Press Query to load the graph for the current filters and time range.`：說明發生什麼、下一步做什麼。

---

## 1. 總覽

優先級定義：

- **P0**：肉眼可見的缺陷，或畫面傳達錯誤資訊。應優先修。
- **P1**：可讀性與空間效率，影響日常使用。
- **P2**：設計品質與一致性。

規模：S = 半天內；M = 1–3 天；L = 超過 3 天。

| ID  | 項目                                         | 優先級 | 規模 | 需改 spec                                                 |
| --- | -------------------------------------------- | ------ | ---- | --------------------------------------------------------- |
| T1  | Segmented 標籤被截斷                         | P0     | S    | 否                                                        |
| T2  | write 圖例是虛線，write ribbon 是實線        | P0     | S    | 是：storage-flow-sankey                                   |
| T3  | Demo 模式下控制項與圖表矛盾                  | P0     | M    | 是：storage-flow-sankey、network-trace                    |
| T4  | Network Sankey 的 Fit 放不下整張圖           | P0     | M    | 是：sankey-canvas                                         |
| T5  | `fg.muted` 文字對比不足                      | P1     | S    | 否                                                        |
| T6  | Light 模式 status 顏色對比不足               | P1     | M    | 是：graph-view                                            |
| T7  | Graph 節點標籤：外框、最小字級、字型         | P1     | S    | 否                                                        |
| T8  | Sankey semantic zoom（依縮放顯示細節）       | P1     | L    | 是：sankey-canvas                                         |
| T9  | 圖例移出控制列，改為畫布上的浮動面板         | P1     | M    | 是：network-trace、storage-flow-sankey                    |
| T10 | Graph 缺少縮放控制列與 focus mode            | P1     | M    | 是：graph-view、app-shell                                 |
| T11 | Top pods 移到 view controls                  | P1     | S    | 是：storage-flow-sankey                                   |
| T12 | Track 改用 Segmented                         | P1     | S    | 否                                                        |
| T13 | Trace 圖例 swatch 無法對應到圖上的形狀       | P1     | S    | 否                                                        |
| T14 | Graph 左側欄重新排序                         | P2     | M    | 需確認 graph-view                                         |
| T15 | Graph overview 時 cluster 名稱保持可讀       | P2     | M    | 可能：graph-view（compound 標題字級有明文數值）           |
| T16 | 虛線框的意義在兩個 Sankey 不一致，且沒有圖例 | P2     | S    | 圖例不用；統一語意要改 storage-flow-sankey、sankey-canvas |
| T17 | Sankey 卡片以填色顯示容量使用率              | P2     | M    | 是：sankey-canvas、storage-flow-sankey                    |
| T18 | Query 按鈕靠近它的欄位                       | P2     | S    | 否                                                        |
| T19 | Query 後 scope 列收合成摘要                  | P2     | M    | 是：storage-flow-sankey、network-trace                    |
| T20 | 控制項標籤改用 sentence case                 | P2     | S    | 否                                                        |
| T21 | 字型改用 Atkinson Hyperlegible               | P2     | M    | 否                                                        |

建議的分批方式見[第 5 節](#5-建議的實作順序)。

---

## 2. P0：明確缺陷

### T1. Segmented 標籤被截斷

**現況**

- Storage Sankey 的 Weight 顯示成 `Throughpu`；Network Sankey 的 Order 中 `Barycenter` 的尾端被裁掉。
- 實測（1600×950，每個選項 `scrollWidth / clientWidth`，單位 px）：

  | 選項       | 修正前 | 修正後（`flex-none`） |
  | ---------- | ------ | --------------------- |
  | Throughput | 75/65  | 86/86                 |
  | Column     | 60/57  | 62/62                 |
  | Node       | 45/43  | 47/47                 |
  | Write      | 47/46  | 48/48                 |
  | Barycenter | 73/63  | （未量測）            |
  | Cluster    | 56/53  | （未量測）            |

  前四列量自 `/sankey`，後兩列量自 `/network/sankey`。除了 Throughput 與 Barycenter，Column、Node、Write、Cluster 也被切掉 1–3px，只是不明顯。

**原因**

- `src/shared/ui/Segmented.tsx:53`：每個選項的 `<label>` 是 `relative flex min-w-0 flex-1`；內層 `<span>` 有 `truncate`。
- 外層是 `inline-flex`，寬度由內容決定。`flex-1` 等於 `flex: 1 1 0%`，basis 為 0。Chrome 先把所有選項的 max-content 寬度加總當作容器寬度，再從 basis 0 平均分配。結果每個選項寬度相同，最長的標籤拿到的寬度小於它自己需要的寬度，就被 `truncate` 切掉。
- `flex-1` 本來是為了左側欄：`LayoutModeControl.tsx:20`（Group by）和 `GraphView.tsx:550`（Engine）在固定寬度的欄位裡需要等寬選項。這兩處都另外傳了 `className="min-w-0 flex-1"`。

**怎麼做**

1. `Segmented` 加一個 `fill` prop，預設 `false`：

   ```tsx
   export interface SegmentedProps<T extends string> {
     // …
     /** Stretch to the container and give every option the same width (rail use). */
     fill?: boolean;
   }

   // 每個選項
   <label className={clsx('relative flex', fill ? 'min-w-0 flex-1' : 'flex-none')}>
     …
     <span className={clsx('flex w-full … px-2 …', fill && 'truncate')}>
   ```

2. `LayoutModeControl.tsx:20` 與 `GraphView.tsx:550` 加上 `fill`。它們已有的 `className="min-w-0 flex-1"` 保留，那是讓整個群組撐滿側欄。
3. 其他呼叫處（`SankeyViewControls.tsx`、`TraceViewControls.tsx`）不動，自動變成依內容決定寬度。

**測試**

- jsdom 沒有版面計算，單元測試量不到寬度。
- 在 Playwright 加一個斷言：`/sankey` 與 `/network/sankey` 上每個 `[role=radiogroup] label > span` 都滿足 `scrollWidth <= clientWidth`。在 1600×950 與 900×900 都跑一次。

**驗收**

- `Throughput`、`Barycenter` 完整顯示。
- 左側欄的 `Node | Controller`、`fCoSE | Dagre` 仍是等寬（實測修正後兩者皆 72px）。

---

### T2. write 圖例是虛線，write ribbon 是實線

**現況**

- `src/features/storage-flow-sankey/SankeyViewControls.tsx:144`：`<Swatch color={tokens.sankey.write} dashed />`，圖例上的 write 是橘色虛線。
- 圖上的 write ribbon 是橘色實線（`tokens.sankey.write` = `#c2410c`）。
- 圖上真正畫成虛線的是**流量為 0 的 ribbon**：`SankeyChart.tsx:91`，`strokeDasharray={l.value === 0 ? '4 3' : undefined}`。

**為什麼要改**

- 讀者依圖例找「橘色虛線」，找到的是 0 流量的 ribbon，會以為那些才是 write。真正的 write ribbon（實線）反而對不上圖例。
- 圖例的唯一工作是讓讀者把記號對應回意義。記號對不上，圖例就在傳達錯誤資訊。

**怎麼做**

1. write swatch 改成實線：拿掉 `dashed`。
2. 圖上若有 0 流量的 ribbon，圖例多一列「0 流量（有量測，無流量）」，swatch 用中性色虛線（`tokens.fg.secondary`、`dashed`）。
   - 需要一個布林值告訴 `SankeyViewControls` 圖上有沒有 0 流量 link。這個值在 `useSankeyProjection` 或 layout 結果中都算得出來（任何 link 的 `value === 0`）。
   - 這和 `TraceLegend.tsx` 的做法一致：只列圖上真的存在的記號（見該檔的 doc comment）。
3. read swatch 保持實線，不變。

**需改 spec**

- `openspec/specs/storage-flow-sankey/spec.md:341`（mode selector requirement）目前寫的是 “a read swatch, a dashed write swatch”。改成 “a read swatch and a write swatch drawn as the ribbons are drawn”，並加上 0 流量那一列的 presence-gated 規則。
- `spec.md:384`（0 流量 link 要可區分）不用改。

**測試**

- `SankeyViewControls.test.tsx:80-89` 只檢查文字與存在與否。若有其他測試斷言 swatch 的 `stroke-dasharray`，一併更新。
- 新增：fixture 中有 0 流量 link 時出現 0 流量圖例列；沒有時不出現。

---

### T3. Demo 模式下控制項與圖表矛盾

**現況**

| 頁面              | 圖表畫的是                                         | 控制項顯示的是                                                           |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| `/graph`          | showcase fixture                                   | 整個 filter bar 隱藏（`GraphPage.tsx`，`!config.demoMode &&`）           |
| `/sankey`         | 整個 showcase storage fixture                      | Root value 空白（`Pick values`），下方寫 `At least one root is required` |
| `/network/sankey` | 從 `dci-uturn/core-1` 出發的 **destination** trace | Hostname 為 `Pick a switch`，Track 為 `source`                           |

- Sankey：`SankeyPage.tsx` 在 demo 模式用 `useSankeyQuery(DEMO_IDENTITY_OPTIONS)`。az / env 各只有一個選項，所以自動選上；roots 從空的 `EMPTY_STORAGE_GRAPH_ROOTS` 開始，於是 `SankeyScopeBar.tsx:264` 顯示 root 必填的提示。實際上 demo 不看 root，fixture 照畫。
- Network：`NetworkPage.tsx` 在 demo 模式把 view 的方向寫死為 `destination`，但 draft 仍是預設值（hostname 空、trackDir `source`）。
- 同一個 app，三個頁面三種行為。

**為什麼要改**

- 控制項是讀者理解「這張圖回答什麼問題」的依據。控制項說 `source`、圖卻是 destination，讀者會誤讀方向。
- `At least one root is required` 是錯誤訊息的語氣，出現在一張正常的圖上方，讓人以為畫面壞了。
- demo 模式是新使用者的第一印象，也是展示用途，最需要自洽。

**怎麼做（建議方案 A：顯示 fixture 的實際 scope，唯讀）**

1. 在 fixture 旁定義 demo scope 常數：

   ```ts
   // src/shared/fixtures/showcaseStorageGraph.ts
   export const DEMO_SANKEY_SCOPE: StorageGraphQuery = {
     az: 'local-a',
     env: 'demo',
     cluster: [],
     namespace: [],
     // Every card in the fixture carries labels.ontap_cluster = 'ontap-prod'.
     roots: { ...EMPTY_STORAGE_GRAPH_ROOTS, ontap_cluster: ['ontap-prod'] },
   };

   // src/shared/fixtures/showcaseTrace.ts
   export const DEMO_TRACE_SCOPE: TraceDraft = {
     hostname: 'dci-uturn/core-1',
     maxHops: '',
     topN: '',
     threshold: '',
     trackDir: 'destination',
   };
   ```

   `StorageGraphQuery` 定義在 `graph-data/storageGraphRequestUrl.ts:12`，`TraceDraft` 定義在 `network-trace/traceUrlScope.ts:10`。fixture 在 `shared/`，型別在 feature 內；若 lint 的 import 規則不允許 `shared` 依賴 feature，就把常數放在 `SankeyPage.tsx` / `NetworkPage.tsx`。

2. demo 模式用這些常數當初始 state：
   - Sankey：`useSankeyQuery` 接受可選的初始 query；`SankeyPage` 的 `rootKind` 在 demo 模式初始為 `ontap_cluster`。
   - Network：demo 模式的 draft 用 `DEMO_TRACE_SCOPE`，NetworkPage 寫死的 `trackDir = 'destination'` 改讀 draft，兩者不再各說各話。
3. scope bar 加 `readOnly` prop。demo 模式下 scope 欄位全部 `disabled`，原本放 Query 的位置改放一句說明：`Demo data: the scope is fixed to the bundled fixture.`
   - view controls（Mode、Weight、Layout、SVM、Group、Order、Min Δ）維持可操作，因為它們只改畫法，不需要後端。
4. Graph 維持隱藏 filter bar（`openspec/specs/graph-filters/spec.md:18` 明文要求）。nav bar 的 `Demo data` badge 已經說明狀態。

**方案 B（最小修改）**：只在 demo 模式隱藏 `At least one root is required`，並讓 Network draft 的 trackDir 與 hostname 等於 fixture 的值。成本低，但讀者仍看到可編輯、卻不生效的控制項。建議方案 A。

**需改 spec**

- `storage-flow-sankey/spec.md:49`：demo 模式選擇保存在 component state，這條相容。新增 scenario：demo 模式的 scope 欄位顯示 fixture 的 scope、唯讀、並附說明文字。
- `network-trace`：新增同樣的 scenario。
- `explicit-query/spec.md:59`：demo 模式不顯示 Query。相容。

**測試**

- `tests/demo.spec.ts` 裡在 demo 模式操作的是 view controls（Weight、Layout），不受影響。
- 新增 e2e：demo 模式下 `/network/sankey` 的 Track 顯示 `destination`、Hostname 顯示 `dci-uturn/core-1`；`/sankey` 沒有 `sankey-root-required`。

---

### T4. Network Sankey 的 Fit 放不下整張圖

**現況**

- `src/features/sankey-canvas/useZoomPan.ts:16`：`MIN_SCALE = 0.2`。
- `fitViewport`（同檔 `:63-69`）把 fit 算出的比例 clamp 在 `MIN_SCALE` 以上。`openingViewport` 也用它。
- Network fixture 的內容高度超過圖表區高度的 5 倍，Fit 停在 20%，圖的上下都超出畫面。使用者沒有任何方式看到全貌。
- 20% 時卡片標題實際只有 11.5 × 0.2 ≈ 2.3px，完全不可讀。

**為什麼要改**

- Fit 的語意是「讓我看到全部」。按了 Fit 卻看不到全部，控制項沒有做到它名稱承諾的事。
- trace 的價值在於看出流量從哪裡來、往哪裡去，必須能看到整體結構。

**怎麼做**

1. 讓縮放下限跟著內容走：

   ```ts
   /** The scale at which the whole content fits, unclamped. */
   function rawFitScale(content: Size, container: Size): number {
     return Math.min(container.w / content.w, container.h / content.h);
   }

   /** Never let a very tall chart make Fit a lie, but keep a sanity floor. */
   const ABS_MIN_SCALE = 0.02;

   function minScaleFor(content: Size, container: Size): number {
     return Math.max(ABS_MIN_SCALE, Math.min(MIN_SCALE, rawFitScale(content, container)));
   }
   ```

   - `fitViewport` 用 `minScaleFor(...)` 當下限，而不是固定的 `MIN_SCALE`。
   - `zoomAroundPoint` 已經接受 `minScale` 參數（`useZoomPan.ts:46-53`），`useZoomPan` 傳入 `minScaleFor(content, container)`。滾輪縮小可以縮到剛好看到全部，但不會更小。
   - 內容小於畫面時，`minScaleFor` 仍是 0.2，現有行為不變。

2. 加一個 minimap（建議與 T8 一起做）：
   - 放在圖表區右下角，疊在 `SankeyControlBar` 上方（右上角是卡片搜尋，左下角留給 T9 的圖例面板）。
   - 用同一份 layout 結果畫一個縮圖：卡片畫成實心矩形、ribbon 畫成 1px 線，不畫文字。layout 已經算好，成本很低。
   - 疊一個代表目前 viewport 的框。點擊或拖曳 minimap 可以平移。
   - 容器加上 `ZOOM_PAN_IGNORE_ATTR`（`useZoomPan.ts:34`），避免在 minimap 上滾輪時縮放主圖。
   - 內容整個放得進畫面時（scale ≥ 1 的 fit）不顯示 minimap。

**需改 spec**

- `sankey-canvas`：目前只寫 “bounded factor”。明確寫出「Fit 永遠顯示全部內容；縮放下限為 fit 比例與 0.2 取小」。若加 minimap，另立 requirement。

**測試**

- `useZoomPan.test.ts`：內容高度為容器 10 倍時，`fitViewport` 的 scale 小於 0.2 且整個內容在容器內；在 fit 比例時 `zoomOut` 不再縮小。
- e2e：`/network/sankey` 按 Fit 後，`sankey-svg` 內主要 `<g>` 的 bounding box 完全在圖表區內。

---

## 3. P1：可讀性與空間

### T5. `fg.muted` 文字對比不足

**現況**

| 前景                                    | 背景           | 對比     |
| --------------------------------------- | -------------- | -------- |
| dark `fg.muted` `rgba(204,204,220,.45)` | rail `#15171d` | 約 3.2:1 |
| dark `fg.secondary` `.65`               | rail `#15171d` | 約 5.4:1 |
| light `fg.muted` `rgba(36,41,46,.5)`    | `#ffffff`      | 約 3.0:1 |
| light `fg.secondary` `.75`              | `#ffffff`      | 約 6.5:1 |

- `fg.muted` 定義在 `src/shared/theme/tokens.ts:114`（dark）與 `:198`（light）。
- 使用處：左側欄所有 section 標題（`Section.tsx` 的 `eyebrowClass`、`subEyebrowClass`，9–10px）、Sankey 卡片右上角文字與 slot 標籤（`SankeyCard.tsx:128/158/172`，9.5px）、Sankey 欄位標題（`SankeyCanvas.tsx:92`）。`text-muted` class 在 `src` 中共出現 22 處。
- WCAG 2.2 AA 規定一般大小文字需 4.5:1。這些都是 9–11px 的小字。

**為什麼要改**

- 側欄標題和 slot 標籤（例如 Network 卡片上的 `et-0/0/1`、`xe-0/0/10`）是實際要讀的資訊，不是裝飾。對比不足時在投影、低亮度螢幕或視力較差的使用者面前幾乎看不見。

**怎麼做**

1. 調整 token（起始值，以第 3 步的測試為準）：

   | Token          | dark 現值 | dark 建議 | light 現值 | light 建議 |
   | -------------- | --------- | --------- | ---------- | ---------- |
   | `fg.secondary` | .65       | .74       | .75        | .80        |
   | `fg.muted`     | .45       | .62       | .50        | .68        |
   - muted 提高後會逼近 secondary，所以 secondary 也稍微提高，保留兩者之間的層級差。層級差不夠時，改用字重或字級表達，不要靠降低對比。

2. `--ksg-fg-muted` 等 CSS 變數由 `src/shared/theme/cssVars.ts` 從 tokens 產生，改 tokens 即可，不用改 `index.css`。
3. 加一個對比測試，防止之後退回：

   ```ts
   // src/shared/theme/contrast.test.ts
   type Rgba = [number, number, number, number];

   function parse(color: string): Rgba {
     if (color.startsWith('#')) {
       const h = color.slice(1);
       return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as Rgba;
     }
     const [r, g, b, a = '1'] = color.replace(/rgba?\(|\)/g, '').split(',');
     return [Number(r), Number(g), Number(b), Number(a)];
   }

   function composite(fg: Rgba, bg: Rgba): Rgba {
     const a = fg[3];
     return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)).concat(1) as Rgba;
   }

   function luminance([r, g, b]: Rgba): number {
     const lin = (c: number) => {
       const s = c / 255;
       return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
     };
     return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
   }

   function contrast(fg: string, bg: string): number {
     const bgRgba = parse(bg);
     const l1 = luminance(composite(parse(fg), bgRgba));
     const l2 = luminance(bgRgba);
     return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
   }

   // it.each over { DARK_TOKENS, LIGHT_TOKENS } × { primary, secondary, muted }
   //   × { bg.canvas, bg.surface, bg.elevated, rail/raised from index.css }
   //   expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5)
   ```

   rail / raised 的色值目前只寫在 `index.css`。若要納入測試，把它們搬到 tokens（或在測試中重複列出並加註解）。

**驗收**

- 對比測試全數通過。
- 截圖檢查：側欄標題、Sankey 欄位標題、slot 標籤在兩種主題下都清楚可讀，且 muted 仍明顯比 primary 淡。

---

### T6. Light 模式 status 顏色對比不足

**現況**

| 顏色                        | 背景      | 對比     | WCAG 1.4.11（非文字 3:1） |
| --------------------------- | --------- | -------- | ------------------------- |
| `status.warning` `#F2CC0C`  | `#ffffff` | 約 1.6:1 | 不通過                    |
| `status.normal` `#73BF69`   | `#ffffff` | 約 2.2:1 | 不通過                    |
| `status.critical` `#E02F44` | `#ffffff` | 約 4.5:1 | 通過                      |

- `src/shared/constants/colorByStatus.ts:7`：`STATUS_COLOR` 直接取自 `DARK_TOKENS.status`，註解寫明 light / dark 共用同一組 hex。
- `LIGHT_TOKENS.status` 只透過 CSS 變數 `--ksg-status-*` 被 chrome 使用（nav 的 `StatusLamp`、Demo badge、警告文字）。圖上的邊框與圖例圓點都讀 `STATUS_COLOR`，不跟主題走。目前兩組 hex 相同，所以結果一樣。
- light 模式截圖中，Sankey 卡片的黃色（warning）與綠色（normal）邊框、狀態圖例的圓點都很淡。
- 警告**文字**也用 warning 色：`FilterBar.tsx:108`（`filter source(s) unavailable`）、`SankeyScopeBar.tsx:258`（pod root 格式錯誤）、`TraceScopeBar.tsx:162`（scope 問題）、`TraceViewControls.tsx:153`（warnings pill 的警示狀態）都是 `text-[var(--ksg-status-warning)]`。這些是 11px 文字，需要 4.5:1，light 模式只有約 1.6:1。

**為什麼要改**

- status 邊框是這個產品最重要的訊號之一：它回答「哪裡有問題」。warning 在白底上只有 1.6:1，等於訊號消失。

**怎麼做**

1. light 模式改用較深的同色相：

   | Status   | light 建議        | 對白底   |
   | -------- | ----------------- | -------- |
   | warning  | `#B58A00`         | 約 3.2:1 |
   | normal   | `#3E8E38`         | 約 4.1:1 |
   | critical | `#E02F44`（不變） | 約 4.5:1 |

   dark 模式不變（在 `#181b1f` 上三者皆 ≥ 3:1）。

2. 把 status 顏色改成跟主題走：
   - `STATUS_COLOR` 保留，但只當作「合法 status 的集合」（`isNodeStatus` 用它）。
   - 所有上色的地方改讀 `useThemeTokens().status`（React）或把 tokens 傳進去（非 React）：
     - `graph-canvas/styles/getStylesheet.ts:9`（cytoscape 邊框）
     - `sankey-canvas/SankeyCard.tsx:3`
     - `sankey-canvas/StatusLegend.tsx:3`
     - `legend/components/StatusLegend/StatusLegend.tsx:3`
     - `node-detail/components/NodeDetailPanel/NodeDetailPanel.tsx:3`
     - `shared/icon/paintUsageLiquid.ts:1`（容量液面顏色）
3. 文字另用一組 token `statusText`，因為文字的門檻（4.5:1）比邊框（3:1）高：

   | Token                 | dark        | light     | light 對白底 |
   | --------------------- | ----------- | --------- | ------------ |
   | `statusText.warning`  | 同 `status` | `#8A6A00` | 約 5.1:1     |
   | `statusText.critical` | 同 `status` | `#C0243A` | 約 5.9:1     |

   `cssVars.ts` 會把它展開成 `--ksg-statusText-warning` 等變數。上面 4 處警告文字與 NavBar 的 `error`（`NavBar.tsx:191`）改用這組變數。

4. `paintUsageLiquid`（以及 `usageFillColor` / `usageFillPaint`）加一個參數接收主題的 status 顏色，不再讀固定的 `STATUS_COLOR`。快取不用改：`tintSvgToDataUri` 的快取鍵是 `${color}\n${rawSvg}`，填色已經寫進 `rawSvg`，不同主題的填色自然是不同的鍵。

**需改 spec**

- `openspec/specs/graph-view/spec.md:496` 明文寫出三個 hex（`#73BF69`、`#F2CC0C`、`#E02F44`）。改成「dark 與 light 各一組，皆符合 WCAG 1.4.11 對背景 3:1」，並列出兩組值。

**測試**

- `getStylesheet.test.ts` 的 snapshot 會變，確認差異只有 light 的 status 顏色。
- 把 T5 的對比測試擴充到 status 顏色（門檻 3:1，背景為 `bg.surface` 與 `bg.canvas`）。

---

### T7. Graph 節點標籤：外框、最小字級、字型

**現況**

- `src/features/graph-canvas/styles/getStylesheet.ts:192`：節點標籤 `font-size: 11`，沒有 `text-outline-*` 或 `text-background-*`，也沒有 `min-zoomed-font-size`。
- 放大後，邊線直接穿過標籤（例如 `mongodb`、`data-mongo-0`、`mongo-svc`），字和線混在一起。
- Fit 時整張圖縮很小，11px 標籤在螢幕上變成一排小點，不可讀，還增加雜訊。
- stylesheet 沒有設定 `font-family`。cytoscape 不繼承 CSS，預設用 `Helvetica Neue, Helvetica, sans-serif`，和 chrome 的 `system-ui` 不同。

**為什麼要改**

- 標籤是 graph 上唯一的文字資訊。被線切斷的標籤要花更多時間讀。
- 縮小時畫不可讀的字沒有好處：不傳達資訊，還讓圖更亂，也浪費繪製時間。

**怎麼做**

1. 在 `node` 規則加外框，顏色用畫布底色，讓字從線上「切」出來：

   ```ts
   'text-outline-color': tokens.bg.canvas,
   'text-outline-width': 2,
   'text-outline-opacity': 0.9,
   ```

   compound（`node:parent`、`node[?isCluster]`、storage-cluster）的標籤也加上同樣設定。

2. 加最小字級，縮小時自動隱藏標籤：

   ```ts
   'min-zoomed-font-size': 7,
   ```

   leaf 節點 11px 時，zoom 低於約 0.64 會隱藏標籤；cluster 標籤 18px，zoom 低於約 0.39 才隱藏。結果是縮小時只剩 cluster 名稱，形成自然的 overview（見 T15）。

3. 設定 `font-family`，和 chrome 一致。stylesheet 建立時讀 CSS 變數：

   ```ts
   const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--ksg-ui-font-sans').trim();
   // node / compound 規則：'font-family': fontFamily
   ```

   jsdom 下取不到值時給一個 fallback 字串，避免 snapshot 測試不穩。

**測試**

- `getStylesheet.test.ts` snapshot 更新。
- 截圖檢查：放大後標籤下方沒有邊線穿過；Fit 時只剩 cluster 名稱（namespace 等 compound 標籤是 13px，zoom 低於約 0.54 也會隱藏）。

---

### T8. Sankey semantic zoom（依縮放顯示細節）

**現況**

- 卡片文字在 SVG content 座標中是固定字級：標題 11.5、副標與屬性行 10、角落文字與 slot 標籤 9.5（`SankeyCard.tsx:117-173`）。整個 `<g>` 一起縮放。
- Storage Sankey 開場縮放 65%：標題約 7.5px、屬性行約 6.5px。
- Network Sankey 開場 20%：標題約 2.3px。T4 修好後 Fit 會更小，文字更不可能讀。
- 1:1 時文字清楚，但一次只看到一部分。

**為什麼要改**

- 目前「看得到全貌」和「讀得到文字」互斥。semantic zoom 讓每個縮放層級只畫當下讀得到的東西，縮小看結構、放大看細節。
- 繪製量也跟著下降：Network trace 的卡片有大量 slot 標籤，縮小時不畫可以減少 DOM 文字節點。

**怎麼做**

1. 定義三個細節層級（LOD），放在 `sankey-canvas`，兩個 Sankey 共用（`sankey-canvas/spec.md:49` 要求兩邊卡片畫法一致）：

   ```ts
   export type CardLod = 'full' | 'summary' | 'overview';

   export function lodFor(scale: number): CardLod {
     if (scale >= 0.8) return 'full';
     if (scale >= 0.4) return 'summary';
     return 'overview';
   }

   /** Quantized counter-scale for card titles: 1, 1.5 or 2. Quantized so a wheel tick
    *  only re-renders the cards when it crosses a step. */
   export function titleScaleFor(scale: number): number {
     const need = 11 / (11.5 * scale);
     return need <= 1 ? 1 : Math.min(2, Math.ceil(need * 2) / 2);
   }
   ```

   | LOD        | 縮放      | 畫什麼                                                                  |
   | ---------- | --------- | ----------------------------------------------------------------------- |
   | `full`     | ≥ 0.8     | 現在的完整卡片                                                          |
   | `summary`  | 0.4 – 0.8 | 標題（反向放大最多 2 倍）與副標；隱藏屬性行、slot 標籤、角落文字        |
   | `overview` | < 0.4     | 不畫文字，只畫卡片框、status 邊框、ribbon；hover tooltip 與搜尋照常可用 |

2. 傳遞方式：`useSankeyStage` 已持有 viewport scale。在 stage 算出 `lod` 與 `titleScale`，傳給 `SankeyChart` / `TraceChart`，再傳給每張 `SankeyCard`。
3. 反向放大的標題寬度會變大。用現有的 `clip()`（`network-trace/layout/text.ts`）把字數預算除以 `titleScale`，確保不超出卡片寬度。
4. ribbon 上的數值標籤（`5.24 MB/s`）套用同樣規則：`overview` 不畫。
5. 效能：`lod` 和 `titleScale` 都是階梯值，滾輪縮放時只有跨越門檻才改變。`SankeyCard` 用 `memo` 包起來，其他 wheel tick 不會重畫卡片。`memo` 要生效，傳入的 `onEnter` / `onLeave` / `onClick` 必須是穩定參照（`useCallback`）。

**需改 spec**

- `sankey-canvas`：卡片 requirement 目前規定固定字級。加上 LOD requirement 與三個層級的門檻。

**測試**

- 單元測試：`lodFor`、`titleScaleFor` 的邊界值。
- `SankeyCard` 測試：`lod='overview'` 時沒有 `<text>`；`lod='summary'` 時沒有 `sankey-card-line`、`sankey-slot-label`。
- e2e：Network 按 Fit 後沒有 slot 標籤；按 1:1 後有。

---

### T9. 圖例移出控制列，改為畫布上的浮動面板

**現況**

- 控制列佔用的高度（nav 固定 48px）：

  | 頁面              | nav + 控制列 | 佔 950px 視窗 |
  | ----------------- | ------------ | ------------- |
  | `/graph`          | 120px        | 13%           |
  | `/sankey`         | 204–211px    | 21–22%        |
  | `/network/sankey` | 232px        | 24%           |

- Network 的圖例是 6 列說明文字，例如 `traced Δ (width = rate increase, chevron = direction)`、`ownership only (shared port, amount stays on the port)`，在 1600px 寬仍折成兩行，約佔 55–60px。
- focus mode 會把整個控制列藏起來，圖例也跟著消失。讀者正想專心看圖時，反而看不到記號的意思。

**為什麼要改**

- 圖例是讀圖時要回頭對照的東西，應該在圖旁邊，而不是和「查詢條件」擠在一起。
- 控制列的職責是「問什麼」；圖例的職責是「怎麼讀答案」。放在一起讓控制列又高又雜。
- 在 focus mode 仍然需要圖例。

**怎麼做**

1. 在 `sankey-canvas` 新增 `ChartLegendPanel`，兩個 Sankey 共用：
   - 位置：圖表區左下角，`absolute bottom-2.5 left-2.5`，對稱右下角的 `SankeyControlBar`（`SankeyControlBar.tsx:30`）。
   - 外觀沿用 `SankeyControlBar` 的表面：`border border-hairline bg-overlay shadow-panel backdrop-blur-sm`，圓角用 `rounded-md`（面板比工具列高，不用 `rounded-full`）。
   - 收合時只有一個 `Legend` 按鈕；展開時列出圖例。展開狀態是 page-transient state（和 `Layout` 一樣，不寫 URL、不持久化），預設展開。
   - 容器加 `ZOOM_PAN_IGNORE_ATTR`，在面板上滾輪或拖曳不會移動圖。
2. 圖例文字縮短，完整說明放 `title`（hover / focus 時出現）：

   | 目前                                                             | 建議短標籤     |
   | ---------------------------------------------------------------- | -------------- |
   | traced Δ (width = rate increase, chevron = direction)            | Traced Δ       |
   | same-column interconnect (right-side arc, arrow shows direction) | Interconnect   |
   | backflow (against the majority direction)                        | Backflow       |
   | other in (left, height ∝ amount)                                 | Other in       |
   | other out (right)                                                | Other out      |
   | ownership only (shared port, amount stays on the port)           | Ownership only |

   展開的面板空間足夠時，可以在短標籤下面用 `text-muted` 小字放一行說明，不用 hover。

3. `TraceLegend` 與 Sankey 的 legend 內容元件保留（presence-gated 邏輯不變），只換外殼與位置。`data-testid` 保留。
4. focus mode 時面板照常顯示。

**需改 spec**

- `network-trace/spec.md:291-303`（Legend requirement）：目前明文要求圖例 “inside the page's control bar … and nowhere in the chart area”。改寫為浮動面板，並保留 presence-gated 規則。
- `storage-flow-sankey/spec.md:341`：圖例 “in the same group” 的描述一併改寫。
- `app-shell/spec.md:418`：page-transient state 列表加上圖例展開狀態。

**測試**

- `tests/network-trace.spec.ts`：目前在 `trace-controls` 裡找 `trace-legend`，改到圖表區。
- `tests/demo.spec.ts`：`bar.getByTestId('sankey-status-swatch-critical')` 改到圖表區。
- 新增：focus mode 下圖例仍可見。

**預期效果**

- Network 控制列減少約 55–60px；Sankey 的 view controls 列變短，1600px 下可能不必再折行。

---

### T10. Graph 缺少縮放控制列與 focus mode

**現況**

- 兩個 Sankey 右下角都有 `SankeyControlBar`：縮小、百分比、放大、Fit、1:1、Focus，並支援鍵盤 `+ - 0 1`（`network-trace/spec.md:330`）。
- Graph 沒有任何縮放按鈕，只能用滾輪與拖曳；沒有 Fit 按鈕；不支援 focus mode（`ShellFrame` 有 `focusMode`，`GraphPage` 沒用）。

**為什麼要改**

- 同一個 app 的三張圖，操作方式應該相同。使用者在 Sankey 學會的 Fit、Focus，在 Graph 找不到。
- 只用鍵盤、或滑鼠沒有滾輪的使用者，在 Graph 上沒有縮放的方法（觸控板的雙指縮放可用）。
- Graph 是三張圖中最需要全螢幕的一張（左側欄 240px + filter bar 72px）。

**怎麼做**

1. 把 `SankeyControlBar` 抽成 `shared/ui/ViewportControlBar`，props 只描述行為，不依賴 Sankey：

   ```ts
   interface ViewportControlBarProps {
     percent: number;
     onZoomIn: () => void;
     onZoomOut: () => void;
     onFit: () => void;
     onReset: () => void; // 1:1
     focusMode: boolean;
     onFocusModeChange: (next: boolean) => void;
   }
   ```

   `sankey-canvas` 的 barrel 改成轉出它，兩個 Sankey 不用改呼叫方式。

2. Graph 端接 cytoscape：
   - `percent`：`cy.zoom()`，監聽 `zoom` 事件更新。
   - 放大 / 縮小：以畫面中心為錨點 `cy.zoom({ level, renderedPosition })`，倍率與 Sankey 相同。
   - Fit：`cy.fit(undefined, FIT_PADDING)`，沿用 `useGraphResize.ts` 的 padding。
   - 1:1：`cy.zoom(1)` 並置中。
3. focus mode：`GraphPage` 讀 `useShellFrame().focusMode`，focus 時隱藏 `FilterBar` 與左側欄；`Esc` 離開（與 Sankey 相同）。
4. 鍵盤快捷鍵只綁在 graph 容器上，與 Sankey 一致。

**需改 spec**

- `graph-view`：新增控制列 requirement。
- `app-shell/spec.md:131`：nav bar 的 focus mode 例外目前只寫 Sankey 頁面，加入 Graph。

**測試**

- e2e：Graph 按 Fit 後整張圖在畫面內；Focus 後 nav、filter bar、側欄隱藏，`Esc` 恢復。

---

### T11. Top pods 移到 view controls

**現況**

- `SankeyScopeBar.tsx:205-224`：Top pods 放在 scope 列，位於 Query 之前。
- 但 Top pods 是**立即生效的 view 值**：不送後端、改了立刻重畫並以 replace 寫入 URL（README「URL parameters」一節）。
- 同類的 Mode、Weight 都在 Query 之後的 view controls；Network 的 `Min Δ`（同樣是 client-side 立即生效）也在 view controls。

**為什麼要改**

- 控制列的空間語法是：「Query 左邊 = 要按 Query 才生效；Query 右邊 = 立即生效」。Top pods 違反這個語法，使用者會以為改完要按 Query。
- 改完 Top pods，Query 按鈕不會變成 dirty，讀者更困惑：「我改了東西，為什麼沒有 Changes not applied？」

**怎麼做**

1. 把 Top pods 輸入框移到 `SankeyViewControls`，放在 cut 說明（`8 of 12 pods`）前面，兩者讀起來是一組：`Top pods [10]  8 of 12 pods`。
2. `data-testid="sankey-top-pods"`、aria-label、pod root 時的 disabled 與原因文字（`A pod root names the pods`）都保留。
3. 樣式改用 `ControlField`，與其他 view controls 對齊；順便消除 `SankeyScopeBar.tsx:206` 手寫的重複 label class。

**需改 spec**

- `storage-flow-sankey/spec.md:104` 與 `:115` 明文列出 scope 列包含 `Top pods`。改為 scope 列只有 `AZ`、`Env`、`Root kind`、`Root value`（以及可選的 Cluster、Namespace），Top pods 移到 view-controls group。
- `:174`（Top pods projection）只改「The scope bar SHALL carry」的位置描述，行為不變。

**測試**

- 搜尋所有用到 `sankey-top-pods` 的測試，更新容器斷言（例如從 scope bar 改到 `sankey-view-controls`）。

---

### T12. Track 改用 Segmented

**現況**

- `TraceScopeBar.tsx:131-142`：Track 是原生 `<select>`，`tone="md"`。
- `Select.tsx`：`md` = `h-8 text-sm`（14px）。同一列其他欄位是 12px（`text-xs`），`destination` 明顯比旁邊的字大。
- Track 只有兩個值：`source`、`destination`。

**為什麼要改**

- `Segmented.tsx` 的註解寫明它的用途：「兩到三個選項的選擇，下拉選單會把它藏在一次點擊之後」。Track 正是這種情況。
- 方向是 trace 最關鍵的參數之一（決定整張圖左右鏡像），應該一眼看到兩個選項。
- 同時解決字級不一致。

**怎麼做**

```tsx
<ControlField label="Track">
  <Segmented
    name="trace-track-dir"
    aria-label="Track direction"
    size="md"
    value={draft.trackDir}
    options={[
      { value: 'source', label: 'Source', title: 'Walk upstream; the start hop is rightmost' },
      { value: 'destination', label: 'Destination', title: 'Walk downstream; the start hop is leftmost' },
    ]}
    onChange={(trackDir) => onDraftChange({ trackDir })}
    data-testid="trace-track-dir"
  />
</ControlField>
```

- 值仍是 `source` / `destination`，URL 與 draft 不變。
- 需要 T1 先完成，否則 `Destination` 會被截斷。

**需改 spec**

- 不用。`network-trace/spec.md:9` 只規定 `Track (source | destination)`，沒有規定控制項類型。

**測試**

- `TraceScopeBar.test.tsx` 目前用 select 的方式操作 `trace-track-dir`，改成點選 radio。

---

### T13. Trace 圖例 swatch 無法對應到圖上的形狀

**現況**

- `TraceLegend.tsx`：`traced Δ` 用 `tokens.sankey.traceFlow`（`#22d3ee`），`same-column interconnect` 用 `traceFlowEnd`（`#06b6d4`）。兩者幾乎同色（`tokens.ts:179-180`），而且 `traceFlowEnd` 本來就是一般 traced ribbon 漸層的終點色。
- interconnect 在圖上的差異是**形狀**（右側的弧線），圖例卻畫成一條直線。
- `other in` / `other out` 在圖上是虛線**方塊**（高度代表流量），圖例畫成虛線。

**為什麼要改**

- 圖例的記號必須能在圖上找到。兩個幾乎同色的直線，讀者分不出哪條是 interconnect。

**怎麼做**

1. `Swatch`（`sankey-canvas/Swatch.tsx`）加 `shape` prop：`'line' | 'arc' | 'block'`，預設 `line`。
   - `arc`：小弧線加箭頭，例如 `M2 1 C 16 1, 16 9, 2 9`，對應圖上的右側弧線。
   - `block`：小的虛線矩形，對應 residual 方塊。
2. `TraceLegend` 中 interconnect 用 `arc`，other in / out 用 `block`。
3. 顏色不變。形狀本身就足以區分，也讓區分不依賴色相。

---

## 4. P2：設計品質與一致性

### T14. Graph 左側欄重新排序

**現況**

- `GraphView.tsx:532-590` 的順序：Layout → Node kinds（11 列，分 5 個子分類）→ Ingress gateway → Edge types → Status → Clusters → Namespaces → Applications → node containers。
- 三個群組預設收合。demo 模式在 1600×950 下，它們的標題位於 y≈850–925，展開後內容全在畫面之外。非 demo 模式多了 72px 的 filter bar，只看得到 Clusters 的標題，Namespaces、Applications 必須捲動才看得到。
- 這三個群組會隱藏或顯示整群節點，是最常用的「範圍」操作，卻排在最後。
- 側欄混合三種性質：版面設定、顯示開關、純圖例（Status 沒有開關）。

**為什麼要改**

- 使用者打開側欄最常做的事是「只看某個 cluster / namespace」。最常用的操作應該在最上面。

**怎麼做**

1. 分成三段，段與段之間用現有的 hairline：
   1. **版面**：Layout（Group by、Engine）。
   2. **顯示範圍**：Clusters、Namespaces、Applications、Ingress gateway。
   3. **種類與圖例**：Node kinds、Edge types、Status。
2. Node kinds 與 Edge types 加收合箭頭（`RailGroup` 已有 `action` slot），預設展開；收合狀態是 page-transient state（app-shell spec 已把 legend collapse 列為 page-transient）。
3. Clusters / Namespaces / Applications 在項目少（例如 ≤ 3）時預設展開。

**需改 spec**

- 需確認 `graph-view` 是否規定側欄順序；若有，一併修改。

---

### T15. Graph overview 時 cluster 名稱保持可讀

**現況**

- switch 依層級由上而下固定位置（`switch-topology/buildSwitchConstraints.ts`：`y = -level * TIER_GAP`），這是 switch-tier-layout spec 的設計。所以 graph 通常是高而窄的形狀。
- 在寬螢幕上 Fit 後，graph 只佔中間約三分之一寬度，所有文字（包括 cluster 名稱）都很小。

**為什麼不建議改 layout 方向**

- 由上而下的 switch 層級是 spec 刻意的設計，符合網路拓樸的慣例。不應為了填滿畫面而犧牲它。

**怎麼做**

- 採「overview first」：開場仍然 Fit，但讓 overview 本身可讀。
  1. T7 的 `min-zoomed-font-size` 在縮小時隱藏 leaf 標籤。
  2. 對 cluster 類的 compound（`node[?isCluster]`、storage-cluster）做反向放大：監聽 cytoscape 的 `zoom` 事件（以 `requestAnimationFrame` 節流），把這幾個 compound 的 `font-size` 設為 `clamp(18 / zoom, 18, 48)`。這類節點只有幾個，更新成本很低。
  3. 效果：縮小時畫面上只剩清楚的 cluster 名稱與結構，像一張地圖；放大後 leaf 標籤出現。
- 搭配 T10 的 Fit 按鈕，使用者隨時可以回到 overview。

**需改 spec**

- `graph-view/spec.md:680-702` 以數值規定部分 compound 標題的字級（例如 fabric box 17、node compound 18）。反向放大會讓實際字級隨縮放改變，需在 spec 中註明「這些是 zoom = 1 時的字級，縮小時可反向放大，上限 48」。

---

### T16. 虛線框的意義在兩個 Sankey 不一致，且沒有圖例

**現況**

- Storage Sankey：NetApp 卡片（netapp-node、netapp-aggr、netapp-svm）是虛線框，pvc、pod、application、namespace 是實線框（`layoutSankey.ts:341`）。spec 的理由是區分「非 Kubernetes 資源」且不只靠色相（`storage-flow-sankey/spec.md:473`）。
- Network Sankey：虛線代表「device」（`network-trace/layout/constants.ts:19` 的 `DEVICE_KINDS`：k8s node、pod、NetApp 三種；另外 anchor 與 pod / trace-stop leaf 也是虛線，見 `TraceCards.tsx:44-47`）。switch 是實線。
- 結果：**pod 在 Storage Sankey 是實線，在 Network Sankey 是虛線**。同一個記號在兩張圖意思不同，`sankey-canvas/spec.md:49` 卻要求兩邊卡片畫法一致。
- 兩個 Sankey 的圖例都沒有說明虛線框。虛線加上黃色 warning 邊框，讀起來像「未知」或「待定」。

**為什麼要改**

- 讀者在兩頁之間切換時，會把一頁學到的記號帶到另一頁。意思不同就會誤讀。
- 沒有圖例的記號，讀者只能猜。

**怎麼做**

1. 先補圖例（不需改 spec）：在 T9 的面板各加一列，文字依各自的實際意義：
   - Storage：虛線小矩形 + `Outside Kubernetes (NetApp)`。
   - Network：虛線小矩形 + `Device (node, pod, storage)` 或維護者認為更精確的說法。
2. 再決定是否統一語意（需改 spec，屬產品決策）。兩個方向：
   - 統一成「非 Kubernetes 資源」：Network 的 pod 與 k8s node 改為實線，只有 NetApp 與非 k8s 的 trace stop 用虛線。
   - 統一成「實體裝置」：Storage 的 pod 維持實線、NetApp 維持虛線；Network 的 pod 改為實線。
   - 兩者都會讓 pod 在兩頁一致。決定後修改 `storage-flow-sankey/spec.md:473`、`sankey-canvas/spec.md:49` 與 network-trace 的卡片 requirement。
3. 虛線本身保留：它讓分類不只依賴色相，理由成立。
4. 帶 status 的虛線框，把 dash pattern 從 `6 4` 改為 `8 3`，讓更多邊框長度帶有 status 顏色。

---

### T17. Sankey 卡片以填色顯示容量使用率

**現況**

- Sankey 卡片高度代表流量（Sankey 的節點高度），但文字只佔上方三行，其餘約七成面積是空白。light 模式下是一堆大白框，視覺重量高、資訊量低。
- 容量資料已經在：`layoutSankey.ts:248-252` 讀 `node.usage.usedBytes` / `capacityBytes`，組成 `usage 700 GB / 1 TB (70%)` 文字行。
- Graph 已有相同概念：`shared/icon/paintUsageLiquid.ts` 在 pvc、netapp-aggr 圖示裡畫由下往上的液面，≥ 80% 黃、≥ 90% 紅。

**為什麼做**

- 這是整份設計唯一建議「大膽」的地方。卡片的空白本來就存在，拿來顯示容量不需要任何新空間。
- 讀者可以同時看到兩件事：流量（卡片高度、ribbon 寬度）與容量壓力（填色高度與顏色）。「流量大又快滿」的卡片會自然跳出來。
- Graph 與 Sankey 用同一個視覺語言表達容量，兩頁之間切換時不用重新學。

**怎麼做**

1. `layoutSankey.ts` 的卡片 layout 加 `usageRatio?: number`（`used / capacity`，兩者都存在時才有）。Network 的 `NodeUsage`（`network-trace/layout/text.ts` 已使用 `formatUsage`）同樣處理，因為兩邊共用 `SankeyCard`。
2. `SankeyCard` 在卡片本體（標題分隔線 `y + 22` 以下）由下往上畫填色：

   ```tsx
   const clipId = useId();
   const bodyTop = y + 22;
   const bodyH = height - 22;
   const fillH = bodyH * clamp01(usageRatio);
   <clipPath id={clipId}>
     <rect x={x} y={y} width={width} height={height} rx={9} />
   </clipPath>
   <rect
     x={x}
     y={bodyTop + bodyH - fillH}
     width={width}
     height={fillH}
     fill={usageColor(usageRatio, tokens)}
     opacity={0.16}
     clipPath={`url(#${clipId})`}
     data-testid="sankey-card-usage"
   />
   ```

   - 填色畫在文字之前，文字在上。
   - 透明度要低（約 0.16），並用 T5 的方法驗證：填色區域上的屬性文字對比仍 ≥ 4.5:1。
   - 顏色門檻沿用 `usageFillColor`（`paintUsageLiquid.ts`：≥ 0.9 critical、≥ 0.8 warning），顏色讀主題 tokens（見 T6）。
   - 用 `useId` 產生 clipPath id，避免同頁兩張圖或多張卡片的 id 衝突。

3. 圖例（T9 面板）加一列：`Fill = capacity used (≥ 80% warning, ≥ 90% critical)`。
4. 只有具容量的 kind 才填色；其他卡片維持原樣。

**取捨**

- 一張卡片同時有兩種編碼（高度 = 流量、填色 = 容量），需要圖例說明。只對有容量的 kind 啟用，並維持低透明度，把干擾降到最低。

**需改 spec**

- `sankey-canvas/spec.md:15`（`SankeyCard` 的內容描述）與 `storage-flow-sankey` 的卡片內容 requirement：加入 usage 填色。

---

### T18. Query 按鈕靠近它的欄位

**現況**

- `src/shared/ui/QueryButton.tsx` 最外層是 `ml-auto flex … border-l pl-3`，把 Query 推到列的最右邊。
- 在 1600px 寬的 Graph filter bar，`Clear` 在 x≈905，`Query` 在 x≈1550，中間約 640px 空白。

**為什麼要改**

- 近接原則：動作應該靠近它作用的輸入。填完最後一個欄位後，視線和滑鼠都要橫越大半個畫面才找到 Query。
- `Changes not applied` 提示跟著 Query 在最右邊，也離使用者剛改的欄位很遠。

**怎麼做**

1. `QueryButton` 拿掉 `ml-auto`，保留 `border-l pl-3`。Query 緊接在最後一個 scope 欄位後面。
2. `TrailingControls`（`ControlField.tsx`）本身有 `ml-auto`，所以 Sankey 與 Network 的 view controls 仍然靠右，版面仍是「左邊問問題、右邊調畫法」。
3. `explicit-query/spec.md:13` 要求 dirty 提示 “on the Query control and in words near it”，文字仍在按鈕旁，相容。

**取捨**

- Query 的位置會隨欄位數量改變（例如 Cluster / Namespace 欄位出現時）。影響很小，因為欄位只在頁面載入時決定。

---

### T19. Query 後 scope 列收合成摘要

**現況**

- 查詢完成後，scope 欄位仍全部展開，繼續佔用高度。但查詢後使用者主要在看圖，很少馬上改 scope。

**怎麼做**

1. 條件：Query 成功、draft 沒有變動（not dirty）、沒有錯誤。
2. 收合後 scope 列變成一行摘要，例如 `AZ local-a / Env demo / Roots aggr:aggr1` 加上 `Edit scope` 按鈕與 Query（用於重新整理）。
3. `Edit scope` 展開並把焦點移到第一個欄位。
4. draft 變 dirty、Query 失敗或 disabled 時一律展開，確保錯誤與原因可見。
5. 展開 / 收合是 page-transient state。

**需改 spec**

- `storage-flow-sankey/spec.md:104`（scope 列版面）與 `network-trace` 的 scope bar：展開時的版面不變，另外加入收合狀態的 requirement。

**備註**

- 先做 T9 與 T11。兩者完成後若高度已可接受，T19 可以不做。

---

### T20. 控制項標籤改用 sentence case

**現況**

- 所有控制項標籤與側欄標題都是全大寫加字距：`AZ`、`ENV`、`ROOT KIND`、`RANGE`、`THEME`、`NODE KINDS`、`WORKLOADS`… 一個畫面超過 30 個。
- 來源：
  - `ControlField.tsx` 的 `controlLabelClass`（10px uppercase）
  - `Section.tsx` 的 `eyebrowClass`（10px）、`subEyebrowClass`（9px）
  - 手寫的重複 class：`SankeyScopeBar.tsx:206`、`TraceScopeBar.tsx` 的 `NumberField`（`:47`）與 Track label、`NavBar.tsx` 的 Range / Theme
- 這些字在 DOM 裡本來就是 sentence case（例如 `Root kind`），全大寫只是 CSS 的 `uppercase`。

**為什麼要改**

- 全大寫的字高度一致，沒有小寫字母的上伸部與下伸部，讀者無法靠單字輪廓辨識，只能逐字母讀；在 9–10px 更明顯。
- 30 多個全大寫標籤一起在搶注意力，而這個介面的主角是圖。
- 全大寫加字距的標籤是模板化介面最常見的特徵之一，讓產品看起來和其他後台沒有區別。

**怎麼做**

1. 控制項標籤：`text-[11px] font-medium text-secondary`，拿掉 `uppercase tracking-eyebrow`。
2. 側欄 section 標題：`text-[11px] font-semibold text-secondary`；子分類：`text-[11px] text-muted`。
3. 手寫的重複 class 全部改用 `controlLabelClass`，只留一個來源。
4. 全部改完後，`tailwind.config.ts` 的 `letterSpacing.eyebrow` 若已無人使用就移除。
5. NavBar 的 `Range`、`Theme` 標籤可以拿掉，改由 `aria-label`（已存在）提供名稱，節省 nav 空間。

**測試**

- CSS `uppercase` 不影響 accessible name，`getByRole(..., { name: 'AZ' })` 之類的測試不受影響。

---

### T21. 字型改用 Atkinson Hyperlegible

**現況**

- `--ksg-ui-font-sans` 是 system-ui 字型堆疊；`--ksg-ui-font-mono` 是 ui-monospace 堆疊（`index.css`）。
- 不同作業系統看到不同字型，Sankey 卡片的寬度與截斷在各平台不一致。
- 這個產品大量顯示容易混淆的識別字：`et-0/0/1`、`xe-0/0/10`、`ae0`、`ontap-prod-01`、`node-w-12`。l / I / 1、0 / O 在很多系統字型中難以區分。

**為什麼選 Atkinson Hyperlegible**

- Braille Institute 為低視力讀者設計，重點是讓容易混淆的字形彼此明顯不同。這正好對應這個產品的實際問題：小字級下讀主機名稱與介面名稱。
- 有 sans（Atkinson Hyperlegible Next）與 mono（Atkinson Hyperlegible Mono）兩個家族，可以維持現有「UI 標籤用 sans、機器值用 mono」的分工，而且兩者屬同一設計系統。
- 選它是因為題材需要，不是裝飾。
- 備選：IBM Plex Sans + IBM Plex Mono（同樣區分度高、覆蓋廣）。

**怎麼做**

1. 用 Fontsource 自行打包字型（安裝前先在 npm 確認套件名稱）：

   ```sh
   npm i @fontsource/atkinson-hyperlegible-next @fontsource/atkinson-hyperlegible-mono
   ```

   在 `src/main.tsx` 只 import 用到的字重（400、500、600）。

2. **不能用 Google Fonts CDN**：`docker/security-headers.conf` 的 CSP 是 `default-src 'self'`，外部字型會被擋。Vite 打包後的字型檔同源，符合 CSP。
3. 更新 `index.css`，保留原本的堆疊當 fallback（CJK 字元如 `機房 Spine` 會落到系統字型）：

   ```css
   --ksg-ui-font-sans:
     'Atkinson Hyperlegible Next', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
     sans-serif;
   --ksg-ui-font-mono:
     'Atkinson Hyperlegible Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono',
     monospace;
   ```

4. cytoscape：T7 已讓 stylesheet 讀 `--ksg-ui-font-sans`。字型載入完成前 cytoscape 可能用 fallback 量測標籤，所以在 `document.fonts.ready` 之後呼叫一次 `cy.style().update()`。
5. 重新檢查截斷：`network-trace/layout/text.ts` 的 `clip()` 以字元格數估算寬度。新的 mono 字寬若和現在不同，卡片文字可能超出或截得太早，需要調整字數預算。

**驗收**

- Windows、macOS、Linux 截圖中字型一致。
- 卡片文字沒有超出卡片。
- 首次載入沒有明顯的字型閃爍（`font-display: swap` 是 Fontsource 預設）。

---

## 5. 建議的實作順序

每批各自一個 PR。需要改 spec 的批次先走 openspec change（`/opsx:propose`），再實作。

| 批次 | 內容                      | 需 openspec change | 說明                                                   |
| ---- | ------------------------- | ------------------ | ------------------------------------------------------ |
| A    | T1、T5、T7、T12、T13、T20 | 否                 | 小而機械，風險低，立即改善可讀性。T12 依賴 T1。        |
| B    | T2、T3、T6、T16           | 是                 | 讓畫面傳達正確資訊：圖例、demo 模式、status 顏色。     |
| C    | T4、T8、T9、T10、T15      | 是                 | 圖表導覽：Fit、semantic zoom、圖例面板、Graph 控制列。 |
| D    | T11、T18、T19             | 是                 | 控制列版面。T19 視 C、D 其他項目完成後的高度再決定。   |
| E    | T14、T17、T21             | 部分               | 較大的設計變更，建議先做原型確認。                     |

每批完成後：

1. `make check`（lint、typecheck、fixture:check、test:ci）。
2. `npm run e2e`。
3. 用[附錄 B](#附錄-b重現截圖)的腳本在 1600×950 與 900×900、兩種主題下重新截圖，和本文件描述的現況比較。

---

## 附錄 A：已檢查但不建議修改的項目

- **Graph 搜尋按 Enter 後結果清單沒有關閉。** 這是 spec 規定的行為：沒有反白列時，Enter 的意義是「立即 fit 到所有命中結果」，清單保持開啟讓使用者繼續選（`openspec/specs/graph-search/spec.md:196`）。有反白列時 Enter 會定位並關閉清單。不修改。
- **Graph 的 layout 方向。** 高而窄的形狀來自 switch-tier-layout 的由上而下設計，見 T15。
- **虛線框本身。** 它讓分類不只依賴色相，保留；需要處理的是語意不一致與缺少圖例，見 T16。

## 附錄 B：重現截圖

1. 啟動 dev server：`npm run dev -- --host 127.0.0.1 --port 5199 --strictPort`。
2. 用 Playwright 開頁面截圖。非 demo 模式時，用 `page.route('**/config.json', …)` 回傳 `demoMode: false`，endpoints 指向 `/demo/*.json`，並替換 `**/prom/api/v1/label/*/values**`，寫法同 `tests/network-trace.spec.ts` 的 `stubConfig`。

```js
import { chromium } from '@playwright/test';

// No bundled browser installed? Use the system one: chromium.launch({ channel: 'chrome' })
const browser = await chromium.launch();
for (const colorScheme of ['dark', 'light']) {
  for (const [w, h] of [
    [1600, 950],
    [900, 900],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme });
    for (const path of ['/graph', '/sankey', '/network/sankey']) {
      await page.goto(`http://127.0.0.1:5199${path}`);
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `shots/${path.replaceAll('/', '_')}-${colorScheme}-${w}.png` });
    }
    await page.close();
  }
}
await browser.close();
```

3. Segmented 截斷的量測方式（T1）：

```js
await page.evaluate(() =>
  [...document.querySelectorAll('[role=radiogroup] label > span')].map(
    (s) => `${s.textContent}: ${s.scrollWidth}/${s.clientWidth}`
  )
);
```

## 附錄 C：對比計算方式

- 半透明前景先與背景做 alpha 合成，再依 WCAG 2.x 相對亮度公式計算對比。
- 本文件的數值為手算近似值，實作時以 T5 的對比測試結果為準。
