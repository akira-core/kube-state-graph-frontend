## Context

動機見 [proposal.md](./proposal.md) 的 Why;行為契約見 [specs/](./specs/)(13 個 capability,143 requirements)。本文只談**怎麼做**。

塑形此設計的既有條件:

- **來源實作存在且成熟**。`kube-state-graph-panel` 已有完整的 graph 視圖實作,其 `src/shared/**` 與各 feature 的純邏輯與 Grafana 無關,可直接移植。本 change 不是從零設計,而是**抽離宿主**。
- **後端契約不動**。`GET /v1/graph`(部署上通常為 `/v1/graph/service_graph`)回傳 cytoscape.js 形狀的 payload;`code_changes` / `config_changes` / `dashboard` 為其 sibling。三個 detail 端點中只有 `/dashboard` 吃 `from_time` / `to_time`。
- **cytoscape 是既定約束**。canvas 渲染、compound 巢狀、collapse、佈局演算法都綁在 cytoscape.js 與其 extension 上,並非可替換的選擇。
- **UI 表面小但高度自訂**。spec 已將搜尋列(兩段式 Esc、↑↓ 跳過 disabled 列、scroll-follow)、hover tooltip(跟隨游標、`right: 8` 對齊)、legend(每列 eye 切換、收合鈕 z-index 約束)指定到按鍵與像素層級;現成元件庫在這三塊幫不上忙。表格無排序、無分頁、無虛擬捲動。
- **部署為 k8s 中的靜態容器**。同一個 image 服務所有環境,差異只來自掛載進來的 `config.json`。

## Goals / Non-Goals

**Goals:**

- 行為對等:移植後的 Graph 視圖與 panel 在 spec 層級無功能落差。
- 單一設計 token 來源,同時餵三個渲染層:DOM(CSS 變數)、cytoscape stylesheet(JS 值)、Sankey SVG(JS 值)。
- 純邏輯零改寫移植:normalize、可見性、拓樸轉換、參數組裝等純函式從 panel 原樣帶入,連同其單元測試。
- 相依最小化:除 cytoscape 生態外,只引入真正省下顯著工作量的套件。
- 建置產物與環境解耦:`dist/` 不含任何環境資訊。

**Non-Goals:**

- 不建 monorepo、不把共用邏輯抽成 npm 套件(兩 repo 之後獨立演進,見 Risks)。
- 不做設計系統。Tailwind + token 足夠,不建元件庫文件站。
- 不做狀態管理架構。資料流簡單(一份 graph + 每視圖 view state),不引入 Redux / Zustand / Jotai。
- 不做 SSR / SSG。純 client-side SPA。
- 不最佳化首次載入。cytoscape 約 300KB 是既定成本,不做 code splitting(除非日後 extension 超過 3 個)。

## Decisions

### 1. 建置工具:Vite

**Decision:** Vite + React 18 + TypeScript。`npm run build` 先 typecheck 再 build(Docker build stage 因此也是型別閘門)。

**Why:** panel 的 webpack 設定來自 `@grafana/create-plugin` 的 `.config/`,失去宿主即失去其升級路徑,不值得沿用。Vite 的 dev server 啟動與 HMR 對這個規模的 app 是數量級差異;`server.proxy` 內建,直接滿足 dev proxy 需求(見決策 12)。

**Alternatives considered:** _webpack_ —— 沿用 panel 設定但需自行維護,無收益。_Next.js_ —— 帶來 SSR / 檔案路由 / server 概念,本 app 全部不需要,且與「靜態資產容器」的部署模型衝突。

### 2. UI 層:Tailwind CSS + Radix primitives(按需取用)

**Decision:** Tailwind CSS 負責樣式;只安裝實際需要的 Radix primitive —— `dropdown-menu`(多個 Dashboard 連結的選單)、`tooltip`(anchored tooltip,如 alert Count 欄)、`toggle-group`(分段控制:pod-parent mode、layout、Sankey mode)。**不整包引入 shadcn/ui**;需要時才複製單一元件檔進 repo。變體以 `clsx` + `cva` 收斂。

**Why:**

- 元件庫的價值在省下寫數十個元件,但本 app 只需約 8 個,其中最難的三個(搜尋 result list、canvas hover tooltip、legend)spec 已逐條指定行為,現成元件都要拆掉重接。付框架的稅卻拿不到框架的好處。
- Radix 補上 spec 明文要求的 a11y 缺口(focus trap、ARIA、鍵盤語意),而不吃整包元件庫的 bundle 與主題系統。
- Tailwind 零 runtime JS,且其 CSS 變數模型與決策 3 的 token 鏈天然契合。

**Alternatives considered:** _Mantine_ —— 開箱即用且 theme 是 JS 物件(對 cytoscape 友善),但 100+ 元件只用到 8 個,且搜尋列與 tooltip 仍要自寫,等於一半 UI 在框架外、多一套心智模型。_MUI_ —— 生態最穩,但 Material 視覺個性強,做中性運維表板需大量覆寫,且 emotion 的 per-render 樣式序列化成本在高頻 hover 更新時是負擔。_純 CSS Modules_ —— bundle 最小,但 dropdown 的焦點管理與鍵盤語意自寫是典型踩坑點,與 spec 的 a11y 要求相衝。

### 3. 設計 token:`tokens.ts` 為單一來源,產出 CSS 變數與 JS 值

**Decision:** `src/shared/theme/tokens.ts` 以 TypeScript 物件定義 light / dark 兩組 token(語意色 `status.critical` / `status.warning`、kind 色、edge type 色、Sankey 的 read / write 色、背景與前景階層)。由它:

1. 產出注入 `<style>` 的 CSS 變數(`:root` 與 `.dark`),供 Tailwind 與 DOM 使用;
2. 直接以 JS 值傳入 cytoscape stylesheet factory;
3. 直接以 JS 值供 Sankey SVG 的 `stroke` / `fill` 使用。

主題切換只切 `<html>` 的 `dark` class 並重算 cytoscape stylesheet,**不重建 cytoscape instance**。

**Why:** cytoscape stylesheet 吃的是 JS 字串值(`{ 'border-color': STATUS_COLOR.critical }`),不是 CSS class;Sankey 自繪 SVG 同理。若 token 只存在於 CSS,canvas 與 SVG 讀不到,會被迫用 `getComputedStyle` 反查(脆弱、有時序問題)或維護兩份色表(必然漂移)。以 TS 物件為源、CSS 變數為衍生物,三個渲染層保證同色。這也正是 panel 既有的形狀 —— 它的 `getStylesheet(theme: GrafanaTheme2, ...)` 就是吃 JS theme 物件,移植時只需把 `GrafanaTheme2` 換成自有的 token 型別。

**Alternatives considered:** _CSS 變數為單一來源,JS 端用 `getComputedStyle` 讀_ —— 需等樣式套用完成,在 cytoscape init 時序上易讀到空字串;且無法靜態檢查。_兩份色表各自維護_ —— 必然漂移,已被 panel 的 `ICON_SVG_BY_KIND` 單一來源慣例否定。

### 4. 路由:react-router

**Decision:** react-router 提供 `/graph`、`/sankey`、`/` 的 replace-redirect、not-found 與尾斜線容忍。導覽以其 `NavLink` 渲染真正的 `<a>` 並標示 `aria-current`。

**Why:** 兩條路由確實可以手寫約 40 行 History API 程式碼,但正確處理 back/forward、replace vs push、`<a>` 的修飾鍵行為(Cmd+click 開新分頁)與 a11y 語意,手寫版會逐步長成一個劣化的 router。相對 cytoscape 的 300KB,router 的體積可忽略,且日後新增視圖零成本。

**Alternatives considered:** _手寫 History API router_ —— 省一個相依但要自行處理上述細節。_TanStack Router_ —— 型別安全更強,但其價值在複雜巢狀路由與 search param 驗證,本 app 兩條扁平路由且 spec 明令 view state **不**入 URL,用不到。

### 5. 狀態管理:不引入函式庫

**Decision:** graph 資料與 runtime config 放在 shell 層的 React context;每個視圖的 ephemeral view state 以該視圖內的 `useState` / `useReducer` 持有。cytoscape 相關狀態依決策 9 由 instance 自己持有,React 端只保存需要驅動 DOM 的投影(選取 id、collapse 集合、過濾集合)。

**Why:** 資料流是「一份共享的唯讀 graph + 每視圖各自的 view state」,沒有跨元件的複雜寫入路徑,也沒有需要正規化的實體快取。引入 store 函式庫只是把 `useState` 換個寫法。

**Alternatives considered:** _Zustand / Jotai_ —— 對此規模是額外的間接層。_Redux Toolkit_ —— 明顯過度設計。

### 6. 資料取用:自寫 hook,不引入 data-fetching 函式庫

**Decision:** 一個 shell 層的 graph 載入 hook,自行實作 spec 要求的語意:單一 in-flight 請求(reload 與 auto-refresh tick 在請求進行中不重複發起)、stale-while-revalidate(刷新期間與刷新失敗後保留最後一份成功資料)、失敗只以狀態指示器呈現而不清空畫面、手動 reload 重置 interval。detail 端點的查詢沿用 panel 既有的 hook 形狀,把端點來源從 datasource 換成 runtime config。

**Why:** 只有一個輪詢資源與少數幾個 by-id 查詢。spec 對刷新語意的規定很精確,直接寫比設定一個函式庫的快取策略更短也更好驗證。panel 的 detail hooks 已實作過同樣的 in-flight 與 key 比對邏輯,可原樣移植。

**Alternatives considered:** _TanStack Query_ —— 若日後 detail 端點增多、需要跨元件共享快取與失效策略,值得回頭引入;現階段其快取模型帶來的設定負擔大於收益。

### 7. 視圖切換:首訪時延遲掛載,之後保持掛載

**Decision:** 兩個視圖各自在**首次進入時**掛載,之後切換視圖只切換可見性(以 `hidden` 屬性),**不卸載**。切回可見時,對該視圖發一次尺寸重算(cytoscape `resize()`,Sankey 重新量測容器)。

**Why:** spec 要求「跨視圖切換保留各視圖的暫時狀態」且「切換不得重新取數或重新正規化」。若卸載重掛,cytoscape instance 被銷毀 → 重建 → 重跑佈局,使用者會失去 viewport、zoom、collapse 與選取,且佈局重算是本 app 最貴的操作。保持掛載讓這些狀態自然存續。延遲首次掛載則避免使用者直接深連結到 `/sankey` 時仍付出 graph 佈局成本。

**Trade-off:** 隱藏的容器尺寸為 0,cytoscape 在該期間的量測無效,故切回時必須顯式 `resize()`;這是已知且可測的一步,已納入 spec 的尺寸響應需求。

**Alternatives considered:** _兩視圖都在啟動時掛載_ —— 深連結到 Sankey 時仍付 graph 佈局成本。_切換即卸載,狀態提升到 shell_ —— cytoscape 的 viewport / zoom / collapse 難以完整序列化再還原,且重跑佈局的視覺跳動無法接受。

### 8. Sankey:d3-sankey 算佈局,React 自繪 SVG

**Decision:** `d3-sankey` 只負責節點與連線的幾何計算;渲染由 React 產生 SVG(`<path>` / `<rect>` / `<text>`)。read / write 雙向連線、零權重的最小厚度虛線、hover 全路徑高亮(切 class)、tooltip、點擊跨視圖 locate,全部是自己的 JSX 與事件處理。顏色取自決策 3 的 token。

**Why:** spec 對這張圖的規定(同一對 source/target 畫兩條可區分連線、零權重仍需可見、hover 點亮上下游全路徑、顏色不得只靠色相區分)幾乎每一條都是圖表庫的邊緣案例。自繪 SVG 讓每條規則變成普通的 React 程式碼,且與 Tailwind + token 的架構一致 —— 不需要第二套主題系統。

**Alternatives considered:** _Apache ECharts_ —— sankey 為內建 series,設定即出圖,但 canvas 渲染使 CSS 變數主題化失效(需在 JS 端重建 option)、自訂高亮須走其 `dispatchAction`、雙向連線與零權重樣式受其 API 限制,且體積約 300KB+。_@nivo/sankey_ —— React 原生且可傳自訂節點元件,但自有 theme 系統會與 Tailwind + token 並行,且同一對 source/target 的兩條連線是其資料模型的邊緣案例。

### 9. Cytoscape × React 整合慣例(自 panel 移植,兩處修正)

**Decision:** 沿用 panel design.md 的整合慣例,核心為「**cytoscape instance 為單一真實狀態源,React 只負責 mount/unmount 與 imperative 同步**」:

1. **Lifecycle**:所有 lifecycle 封裝在一個 hook 內;init effect(依賴空陣列)建立 instance 並在 cleanup 呼叫 `removeAllListeners()` + `destroy()` 且把 ref 歸 null;update effects 各自監聽對應輸入,以 `cy.batch()` mutate 既有 instance。React StrictMode 的 double-mount 下必須 idempotent。
2. **Extension 註冊**:`cytoscape.use(...)` 只在 module top-level 執行一次;禁止在 component / hook 內呼叫。
3. **型別**:使用 cytoscape 原生型別;自訂 `data` 欄位以 declaration merging 集中擴充;不用 `any`。
4. **Stylesheet**:由 pure factory 產生 `Stylesheet[]` 陣列(輸入為決策 3 的 token 與各對應表),可序列化、可快照測試;禁止鏈式 `cy.style().selector(...)`。
5. **Layout**:`cy.stop()` 後再 `cy.layout(opts).run()`;選項以 `useMemo` 穩定。
6. **Events**:handler 在 init effect 註冊一次,不隨 props 變動 on/off;cytoscape → React 的狀態投影走 `useSyncExternalStore`。
7. **尺寸**:`ResizeObserver` + debounced `cy.resize()`。
8. **測試**:純邏輯以 `cytoscape({ headless: true, styleEnabled: true })` 驗證,不需 DOM。
9. **效能**:批次更新一律包 `cy.batch()`;三組輸入(elements / stylesheet / layout)在 React 端 memoize。
10. **API 邊界**:hook 對外只暴露 `containerRef` 與必要操作,不洩漏 cytoscape internals。

**兩處修正:**

- **元素更新的分界**。一般資料刷新走 **diff-and-patch**(比對既有與 incoming,只增刪差異),維持佈局連續性;但 **pod-parent mode 切換走整批重建**(移除全部元素後重新加入),因為該操作改變的是 compound parent 鏈本身,diff 的結果等同全量替換,重建反而更簡單且正確。此分界已寫入 `pod-parent-mode` spec。
- **主題來源**。原 `getStylesheet(theme: GrafanaTheme2, ...)` 改為吃決策 3 的 token 型別。

**Why:** 這些是社群多年踩坑的共識,避免「兩個 ref 不同步」「extension 重複註冊警告」「StrictMode 雙 mount 殘留 listener」三類 bug。panel 已在實戰中驗證過,無理由重新發明。

**Alternatives considered:** _`react-cytoscapejs`_ —— 多年未活躍維護,抽象層限制細粒度更新,型別不完整。_elements 當 props 全量替換_ —— 每次更新重跑佈局、節點跳動。_cytoscape instance 放 React state_ —— 觸發整棵樹 re-render,反模式。

### 10. 程式碼組織:feature-first + co-location

**Decision:** 依 feature 而非檔案類型分目錄;每個元件一個資料夾,含同名 `.tsx` / `.types.ts` / `.test.tsx` / `index.ts`;function component only;`src/**` 全面具名 export,禁止 default export;跨 feature 不得越界 import 對方內部檔案。以 ESLint 的 `import-x/no-default-export` 與 `import-x/no-restricted-paths` 強制。

**Why:** 沿用 panel 已驗證的結構,使移植是「搬資料夾」而非「重新歸檔」。禁止 default export 讓重新命名與自動 import 行為一致。邊界規則防止 feature 之間長出隱性耦合。

**註:** 這兩項是程式碼組織慣例而非可觀察行為,故不放進 spec(spec 是行為契約),改在此記錄並由 lint 強制。

### 11. 移植策略:純邏輯原樣搬,宿主耦合處改寫

**Decision:** 以「是否 import `@grafana/*`」切分:

| 類別                                                                                                                                                                                                              | 處理方式                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 純函式 + 其單元測試(normalize、可見性計算、pod-parent 拓樸轉換、ingress 集合辨識、switch level 讀取與佈局約束、node group 合成、Dashboard 參數組裝、Dashboard 連結解析、icon 對應表、各色彩與樣式對應表、fixture) | **原樣複製**,連同 `.test.ts`。不改邏輯,只改 import 路徑         |
| Stylesheet factory                                                                                                                                                                                                | 改寫簽名:theme 參數換成自有 token 型別                          |
| 端點解析                                                                                                                                                                                                          | 改寫:datasource 查詢換成讀 runtime config                       |
| React 元件                                                                                                                                                                                                        | 改寫:`@grafana/ui` 元件換成 Tailwind + Radix;其餘結構與邏輯保留 |
| Grafana 專屬(variable export、panel options editor、`PanelPlugin` 註冊、provisioning)                                                                                                                             | **不移植**                                                      |

移植後以既有單元測試作為第一道正確性驗證 —— 測試能跑通,代表純邏輯搬運無損。

**Why:** 這批純函式是 panel 最有價值也最容易在重寫時出錯的部分(絕不把 absent 當 0、controller 告警聚合、edge metrics 的兩個 union 分支、collapse 對帳的 desired ∩ present)。它們與 Grafana 無關,重寫只會引入回歸。

**Trade-off:** 複製而非共用套件,代表兩 repo 的這批邏輯會分岔。見 Risks。

### 12. Runtime config:啟動時 fetch,手寫 validator

**Decision:** 在渲染任何視圖前 fetch `<base>/config.json`,以手寫 validator 驗證(不做型別轉換:`"30"` 不會被當成 `30`,`1.5` 不是合法的 `refreshIntervalSeconds`),失敗則渲染全螢幕設定錯誤畫面並停在那裡 —— **絕不靜默退回 demo 模式**。config 路徑不可由頁面 URL 的 query / hash 覆寫。dev 模式下 `npm run dev` 服務版控的 `dev/config.json`(`demoMode: true`),可由被 gitignore 的 `dev/config.local.json` 覆寫;兩者都不進 `dist/`。真實後端以 Vite `server.proxy` 走 `/api/` 前綴。

**Why:** 手寫 validator 約 120 行,與既有的 normalize 邊界同一種寫法(手寫型別 + 邊界執行期驗證,不做 codegen),且 spec 對錯誤訊息的要求很具體(指出設定路徑與**第一個**問題),schema 函式庫的預設訊息本來就要覆寫。零相依。「不靜默退回 demo」是刻意的:一個打錯字的 ConfigMap 若讓 app 顯示假資料,會是最難察覺的生產事故。

**Alternatives considered:** _zod_ —— 訊息品質好但約 14KB 且仍需覆寫訊息。_valibot_ —— 體積小得多,若 config schema 日後顯著變複雜,是第一順位的回頭選項。_build 時注入環境變數_ —— 與「同一 image 服務所有環境」的部署模型直接衝突,已排除。

### 13. 新增檢視時間範圍(view time range)

**Decision:** 導覽列提供相對時間範圍選擇器(1h / 6h / 24h / 7d / 自訂絕對區間),預設 24h,與主題同樣持久化於瀏覽器儲存,**不寫入 URL**。唯一消費端是 `/dashboard` 查詢的 `from_time` / `to_time`;alert 的「Last occurred」點擊將其設為 `[t-300, t+300]`。

**Why:** panel 從 Grafana dashboard 繼承時間範圍,SPA 無此宿主。查證後確認影響面很窄 —— change history 端點不帶時間,graph 查詢也不帶,只有 `/dashboard` 吃這兩個參數。實作成本因此很低,但取回的是實際運維動作:從一則告警跳到**該時刻**的 dashboard。既然 proposal 要求 UI 功能完整移植,這條屬於對等範圍。

**影響:** `app-shell` spec 需新增一條需求;`node-detail` spec 現有的條件式敘述(「當 app 提供可變更的檢視時間範圍時」)自動成為生效分支,無需改寫。

**Alternatives considered:** _不新增_ —— `/dashboard` 不送時間,由目標 dashboard 用自己的預設視窗,「Last occurred」降級為純文字。省下一個控制項,但失去告警到 dashboard 的時間對齊。_寫入 URL 以便分享_ —— 與 spec 既定的「view state 不入 URL」不一致,且會讓分享連結的語意需要另外定義;日後若有分享需求可單獨提案。

### 14. 測試策略:三層,e2e 納入 CI

**Decision:**

- **單元(Vitest)**:純函式與 stylesheet factory;cytoscape 相關邏輯以 headless instance 驗證,不需 DOM。移植過來的測試原樣沿用。
- **元件(Vitest + Testing Library)**:互動與 a11y 語意(鍵盤操作、`aria-current`、focus 可見)。
- **e2e(Playwright)**:自啟 dev server,兩條必備 spec —— demo 模式冒煙測試,以及以 `/demo/graph.json` 走真實 fetch 路徑的往返測試。

CI 鏈:`typecheck → lint → fixture:check → unit → e2e → build`。

**Why:** panel 的 e2e 需要 Grafana 容器才不進 CI;SPA 沒有這個限制,Playwright 自啟 dev server 且 demo 模式無外部依賴,約 1–2 分鐘。「乾淨 checkout 能渲染完整圖」是本專案的核心承諾之一,只有 e2e 能守住;讓它只在本機跑等於不守。

**Alternatives considered:** _e2e 維持本機觸發_ —— CI 快 1–2 分鐘,但 demo 回歸不會被自動抓到,與該承諾的重要性不成比例。

### 15. Fixture 與 demo 模式

**Decision:** `SHOWCASE_GRAPH`(TypeScript,typed as `WireGraph`)維持單一假資料來源。`fixture:build` 產出 `public/demo/graph.json` —— 序列化為完整的 `GET /v1/graph` 回應體;`fixture:check` 擋漂移並在 CI 與 pre-push 執行。demo 模式直接 import TS fixture(不經網路);`public/demo/graph.json` 則有兩個用途:對後端實作者而言是範例 payload,對測試而言是讓 `demoMode: false` + `endpoints.graph: "/demo/graph.json"` 能在無後端下走完整的 fetch 路徑。

**Why:** 兩條路徑(直接 import 與真實 fetch)覆蓋不同的錯誤類別 —— 前者驗證渲染,後者驗證取數、驗證與錯誤處理。以同一份 fixture 餵養兩者,保證兩條路徑測的是同一張圖。

### 16. 容器與部署

**Decision:** 多階段 `Dockerfile`(build stage 執行 typecheck + build;runtime stage 只含 `dist/` 與靜態 web server),以數值 UID 的非 root 使用者執行,監聽 `8080`。config 以目錄形式掛載於 `/srv/config`(不用 `subPath`,使 ConfigMap 更新能反映到容器內)。快取標頭:`/assets/*` 長期不可變、`index.html` `no-cache`、`config.json` `no-store`。`GET /healthz` 供 liveness / readiness probe。history-API fallback 使 `/graph` 與 `/sankey` 的深連結在重新載入時可用。選用的同源反向代理(`/api/` → 後端)讓運維者能以 root-relative 端點 URL 避開 CORS。manifests 置於 `deploy/`,符合 Pod Security Standards 的 `restricted`。

**Why:** 「同一 image + 不同 ConfigMap」是此設計的核心部署前提(見決策 12)。`no-store` 於 config 確保設定變更在下次載入即生效,不需重建 image 或重啟 Pod。不用 `subPath` 是因為該掛載方式不會接收 ConfigMap 的後續更新。

## Risks / Trade-offs

- **兩 repo 的純邏輯分岔** → 移植是複製而非共用套件。後端契約變更(新 kind、新 edge type、新 metrics 欄位)需要在兩處各改一次,且可能不同步。**Mitigation:** 兩邊都以 `WireGraph` 型別與 fixture drift check 把契約變更變成 typecheck 失敗而非執行期空白畫面;若日後分岔成本顯著上升,再評估抽成套件或 monorepo(此為刻意延後的決定,不是疏漏)。

- **搜尋列、tooltip、legend 需自寫** → 這三塊佔前端工作量的顯著比例,且 spec 規定到按鍵層級,實作偏差不易在 code review 中看出。**Mitigation:** 每條鍵盤與定位規則都有對應 scenario,以元件測試逐條覆蓋;`right: 8`、40% 最大高度、z-index 相對關係等定位契約寫成可斷言的測試。

- **隱藏視圖的尺寸量測** → 決策 7 讓非作用中的視圖容器尺寸為 0,cytoscape 與 Sankey 在該期間的量測無效。**Mitigation:** 切回可見時顯式觸發尺寸重算,並以 e2e 覆蓋「切到 Sankey 再切回 Graph,圖面尺寸正確且 viewport 未重置」。

- **`ResizeObserver` 與 cytoscape `resize()` 的抖動** → debounce 太短會在拖曳視窗時反覆重算,太長則感覺遲鈍。**Mitigation:** 沿用 panel 已調校過的 debounce 值,並以 spec 的尺寸響應 scenario 驗證。

- **Sankey 自繪的工作量** → 約 300 行渲染碼,含路徑幾何、雙向連線佈局與 hover 路徑追蹤。**Mitigation:** 幾何交給 `d3-sankey`,自寫部分限於 SVG 產生與事件;hover 路徑追蹤是純函式(給定節點求上下游連線集合),可獨立單測。

- **cytoscape bundle 約 300KB** → 首次載入成本固定存在。**Mitigation:** 接受(見 Non-Goals);Sankey 選 d3-sankey 而非 ECharts 已避免再疊加 300KB。

- **`demoMode` 誤設於生產** → ConfigMap 打錯字可能讓生產環境顯示假資料。**Mitigation:** demo 模式必須在 UI 顯眼處標示;且設定錯誤絕不靜默退回 demo(決策 12)。

- **CORS** → 若運維者以絕對 URL 指向不同 origin 的後端,瀏覽器會擋。**Mitigation:** 容器提供選用的同源反向代理,並在文件中把 root-relative URL 列為建議做法。

## Migration Plan

此 repo 目前只有 LICENSE 與 openspec 目錄,**沒有既有使用者、沒有既有部署、沒有資料要遷移**。所謂 migration 是 panel 使用者的切換路徑,而非本 app 內部的版本升級。

**建置順序**(細節見 tasks.md):

1. 專案骨架與工具鏈 → 2. token 與主題層 → 3. runtime config 載入與錯誤畫面 → 4. 純邏輯移植(含其測試) → 5. app shell 與路由 → 6. Graph 視圖(canvas → legend → 互動 → 搜尋 → detail) → 7. Sankey 視圖 → 8. 容器與 k8s manifests → 9. e2e 與 CI。

每一階段結束時 demo 模式必須可渲染,使進度隨時可見。

**與 panel 的關係:** 兩者並存,不互相取代。panel 繼續服務嵌入 Grafana dashboard 的情境;本 app 服務需要多視圖與完整 UI 控制的情境。本 change 不變更、不棄用、不封存 panel repo。

**回退策略:** 部署層面,image 以 `sha-<short>` 標記,回退即是把 Deployment 指回前一個 tag;因為設定在 ConfigMap 而非 image 內,回退 image 不會連帶回退設定。開發層面,本 change 全部是新增檔案,無既有程式碼被修改。

## Open Questions

- **Sankey 在超大拓樸下的可讀性上限**。spec 已訂效能界線(500 條 `pvc-to-netapp-aggr` edge 內首次繪製 ≤ 1 秒),但「幾百條連線的 Sankey 是否還讀得懂」是視覺問題而非效能問題。可能需要 top-N 篩選或聚合。**可延後**:待真實資料規模已知後再決定,不影響現有 spec、架構或任務拆解。
- **是否需要匯出**(PNG / SVG / CSV)。運維情境常見「把圖貼進事件報告」。**可延後**:是獨立的附加功能,不影響現有設計。
- **`refreshIntervalSeconds` 的實務預設值**。spec 訂預設 0(關閉),由運維者決定。實際部署後或許會發現某個值應成為文件建議值。**可延後**:純文件層面。
