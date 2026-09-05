## 1. 專案骨架與工具鏈

- [x] 1.1 以 Vite + React 18 + TypeScript 初始化專案(`package.json`、`vite.config.ts`、`tsconfig.json` / `tsconfig.build.json`、`index.html`、`src/main.tsx`),加入 `.nvmrc`(Node 22);驗證:`npm install && npm run dev` 啟動且瀏覽器顯示佔位頁面
- [x] 1.2 設定 `npm run typecheck`(`tsc --noEmit`)與 `npm run build`(build 前先 typecheck);驗證:兩個指令皆退出碼 0,`dist/` 產出靜態資產
- [x] 1.3 加入 ESLint 設定(移植 panel 的規則集,移除 `@grafana/eslint-config`,保留 `import-x/no-default-export` 與 `import-x/no-restricted-paths` 的 feature 邊界規則);驗證:`npm run lint` 對空專案零警告通過
- [x] 1.4 加入 Prettier 設定與 `.prettierignore`(含 `public/demo/graph.json`);驗證:`npm run format` 冪等,重跑無差異
- [x] 1.5 設定 Vitest(`npm run test` / `npm run test:ci`)與 Testing Library;驗證:一個佔位測試通過且 `test:ci` 產出覆蓋率報告
- [x] 1.6 設定 Playwright(`playwright.config.ts`,`webServer` 自啟 dev server);驗證:`npm run e2e` 能啟動瀏覽器並跑通一個佔位 spec
- [x] 1.7 加入版控的 git hooks(`.githooks/`、`init-hooks`、`prepare`、lint-staged):pre-commit 跑 lint-staged,pre-push 跑 `typecheck` + `fixture:check`;驗證:`npm run init-hooks` 後製造一個 lint 錯誤,commit 被擋下
- [x] 1.8 加入 Makefile 捷徑(`make dev` / `test` / `lint` / `build`);驗證:每個目標執行對應的 npm script 成功
- [x] 1.9 安裝執行期相依:`cytoscape`、`cytoscape-fcose`、`cytoscape-dagre`、`cytoscape-expand-collapse`、`d3-sankey`、`react-router`、`tailwindcss`、`clsx`、`cva`、`@radix-ui/react-dropdown-menu`、`@radix-ui/react-tooltip`、`@radix-ui/react-toggle-group`;驗證:`npm ls` 無 peer dependency 警告,`npm run build` 成功
- [x] 1.10 設定 Tailwind(`tailwind.config.ts`、base CSS、class-based dark mode);驗證:一個帶 Tailwind class 的元素在 `npm run dev` 中正確套用樣式,切換 `<html>` 的 `dark` class 後顏色改變

## 2. 設計 token 與主題層

- [x] 2.1 建立 `src/shared/theme/tokens.ts`:以 TypeScript 物件定義 light / dark 兩組 token(背景與前景階層、語意 status 色、kind 色、edge type 色、Sankey read / write 色);移植 panel `shared/theme/themeColors.ts` 的色值,`GrafanaTheme2` 相依改為自有型別;驗證:單元測試斷言兩組 token 的鍵集合完全相同,且無缺漏鍵
- [x] 2.2 實作由 token 產出 CSS 變數並注入 `:root` 與 `.dark` 的機制;驗證:單元測試斷言產出的 CSS 變數名稱與 token 鍵一一對應
- [x] 2.3 實作主題解析與套用 hook(有效主題 = 本機保存的使用者選擇 → 設定檔 `theme` → `system`;`system` 跟隨作業系統偏好且即時反映);驗證:元件測試覆蓋三層優先序與 `system` 偏好變更即時套用
- [x] 2.4 移植 `shared/constants/**` 的所有色彩與對應表(`colorByEdgeType`、`colorByStatus`、`colorBySeverity`、`colorByResultType`、`iconSvgByKind`、`categoryByKind`、各 palette、`edgeRelation`、`drawnEdgeTypesForMode`、`ingressGateway`、`missingValuePlaceholder`、`applicationBearingKinds`、`types`),色值來源改指向 `tokens.ts`;驗證:移植過來的對應測試全數通過

## 3. Runtime config

- [x] 3.1 定義 runtime config 的 TypeScript 型別(`endpoints.graph` / `codeChanges` / `configChanges` / `dashboard`、`demoMode`、`refreshIntervalSeconds`、`defaultLayout`、`theme`);驗證:型別檔通過 `npm run typecheck`
- [x] 3.2 實作手寫 config validator:不做型別轉換、URL 僅接受絕對 `http(s)` 或單一前導斜線的 root-relative、拒絕 protocol-relative、`null` 視為型別錯誤、未知鍵忽略並警告、回報第一個問題;驗證:單元測試覆蓋每個欄位的合法值、非法值與預設值,以及 `runtime-config` spec 的全部 URL 形式案例
- [x] 3.3 實作啟動時載入 `<base>/config.json`(渲染任何視圖前完成,不可由頁面 URL 的 query / hash 覆寫路徑,任何非 2xx 皆為失敗);驗證:單元測試覆蓋成功、404、非法 JSON、驗證失敗四種路徑
- [x] 3.4 實作全螢幕設定錯誤畫面(標示設定路徑與第一個問題、提供 Retry、絕不靜默退回 demo 模式);驗證:元件測試斷言 404 與驗證失敗皆呈現錯誤畫面而非 demo 資料,且 Retry 會重新 fetch
- [x] 3.5 建立 `dev/config.json`(`demoMode: true`,納入版控)與 `dev/config.local.json` 覆寫機制(gitignore),並在 `vite.config.ts` 設定 `/api/` 前綴的 dev proxy(目標由 `KSG_DEV_PROXY_TARGET` 指定);驗證:`npm run dev` 於乾淨 checkout 進入 demo 模式;設定 `dev/config.local.json` 後改讀該檔;`dist/` 不含 `config.json`

## 4. 純邏輯移植 —— shared

- [x] 4.1 原樣移植 `shared/types/**`(`wire.ts`、`cytoscape.d.ts`、`cytoscape-extensions.d.ts`、`containerSpec.ts`)與 `shared/guards/isPlainObject.ts`;驗證:`npm run typecheck` 通過
- [x] 4.2 原樣移植 `shared/graph/**`(`childrenByParent`、`collapsedAncestors`、`collectIngressNodeIds`)、`shared/clone/clonePlain.ts`、`shared/format/measurements.ts` 及其測試;驗證:移植過來的單元測試全數通過
- [x] 4.3 原樣移植 `shared/nodeAttributes/buildNodeAttributes.ts` 與 `shared/icon/**`(`tintSvgToDataUri`、`paintUsageLiquid`)及其測試;驗證:移植過來的單元測試全數通過

## 5. 純邏輯移植 —— feature

- [x] 5.1 原樣移植 `features/graph-data/`(`normalize.ts`、`wrapNodeGroup.ts`、`wrapSwitchFabric.ts`)及其測試;驗證:normalize 的全部單元測試通過(含 alerts / controller 聚合 / edge metrics 兩分支 / NetApp 與 PVC 欄位 / `ready_status`)
- [x] 5.2 原樣移植 `features/element-filter/computeVisibility.ts`、`features/pod-parent-mode/applyPodParentMode.ts`、`features/switch-topology/**`(`readSwitchLevels`、`buildSwitchConstraints`)及其測試;驗證:移植過來的單元測試全數通過
- [x] 5.3 原樣移植 `features/graph-search/` 的純邏輯(`computeHits`、`resolveSearchHits`、`keyboardNav`、`types`)及其測試;驗證:移植過來的單元測試全數通過
- [x] 5.4 原樣移植 `features/node-detail/` 的純邏輯(`parseDashboardLinks`、`detailUrlKinds`、`detailPaths`)及其測試;驗證:移植過來的單元測試全數通過
- [x] 5.5 原樣移植 `features/graph-canvas/sync/**`(`diffElements`、`cloneElementDefs`、`reconcileCollapse`、`seedAddedNodePositions`、`extensionDataKeys`)與 `clusterCollapseToggle`、`selectSingle` 及其測試;驗證:移植過來的單元測試全數通過
- [x] 5.6 改寫 `assembleDashboardParams.ts`:`TimeRange` 相依換成自有的檢視時間範圍型別,其餘參數組裝邏輯不變;驗證:移植過來的測試改用新型別後全數通過,涵蓋各 kind 的適用性與不適用時回傳「無參數」
- [x] 5.7 改寫 `formatEdgeMetrics.ts` 與 `formatChangeTime.ts`:移除 `@grafana/data` 相依,時區改用瀏覽器本地時區;驗證:移植過來的測試通過,含極小值(如 `3.86e-7`)不被截為 0 的案例
- [x] 5.8 改寫端點解析:以 runtime config 的 `endpoints.*` 取代 datasource 查詢,端點未設定即為「不可用」;驗證:單元測試斷言未設定的端點不發出任何請求且對應 UI 不渲染

## 6. Fixture 與 demo 資料

- [x] 6.1 原樣移植 `shared/fixtures/showcaseGraph.ts`(typed as `WireGraph`)及其測試;驗證:`npm run typecheck` 通過,fixture 測試通過
- [x] 6.2 補充 fixture 涵蓋 Sankey 所需案例:至少一條同時帶 `read_bytes_per_sec` 與 `write_bytes_per_sec` 的 `pvc-to-netapp-aggr` edge,以及一條兩者皆無的 edge;驗證:單元測試斷言這兩類 edge 存在
- [x] 6.3 實作 `fixture:build`(序列化 `SHOWCASE_GRAPH` 為完整 `GET /v1/graph` 回應體,輸出 `public/demo/graph.json`)與 `fixture:check`(比對漂移);驗證:`npm run fixture:build` 後 `npm run fixture:check` 通過;手動改動 fixture 而不重建時 `fixture:check` 失敗

## 7. App shell 與資料生命週期

- [x] 7.1 實作 app 進入點與啟動序列(載入中畫面 → 設定錯誤畫面或 app;設定載入完成前不對任何後端端點發出請求);驗證:元件測試斷言設定尚未載入時無任何 fetch 發出
- [x] 7.2 以 react-router 實作路由:`/graph`、`/sankey`、`/` 以 history replace 導向 `/graph`、尾斜線容忍、未知路徑顯示找不到頁面畫面(shell 保留、含返回連結);驗證:元件測試覆蓋四種路徑,e2e 覆蓋 `/sankey` 直接重新載入可用
- [x] 7.3 實作頂部導覽列:兩個視圖連結(含 `aria-current`)、主題切換、重新載入動作、最後載入時間狀態指示器、demo 模式標記;驗證:元件測試斷言各控制具可存取名稱且可鍵盤操作,demo 模式下標記出現
- [x] 7.4 實作共用 graph 資料載入 hook:單一 in-flight 請求、stale-while-revalidate(刷新期間與失敗後保留最後一份成功資料)、失敗僅以狀態指示器呈現、手動 reload 重置 auto-refresh interval、`refreshIntervalSeconds > 0` 才啟用計時器、demo 模式不發網路請求;驗證:單元測試覆蓋這六項語意
- [x] 7.5 實作檢視時間範圍控制(`1h` / `6h` / `24h` / `7d` / 自訂絕對區間,預設 `24h`,保存於瀏覽器本機,不入 URL,相對區間於讀取時換算為當下);驗證:元件測試覆蓋預設值、持久化、讀取時換算,以及變更時不觸發 graph 取數
- [x] 7.6 實作視圖掛載策略:首次進入時掛載、之後切換僅切可見性、切回可見時觸發尺寸重算;驗證:元件測試斷言切換視圖不重新取數、不重新正規化,且各視圖的暫時狀態被保留
- [x] 7.7 實作視圖區填滿剩餘視窗高度與 a11y 基礎(nav / main landmark、focus-visible);驗證:元件測試斷言 landmark 存在,視窗縮放後視圖區高度隨之改變

## 8. Graph canvas 基礎

- [x] 8.1 移植並改寫 `registerExtensions.ts`(module top-level 註冊 fcose / dagre / expand-collapse,只註冊一次);驗證:單元測試斷言重複 import 不產生重複註冊警告
- [x] 8.2 移植 `useCytoscape` hook 與其 lifecycle 規約(init 與 update effect 拆分、cleanup 呼叫 `removeAllListeners()` + `destroy()` 並歸零 ref、StrictMode double-mount 下 idempotent);驗證:元件測試在 StrictMode 下走 mount → unmount → re-mount,斷言無 listener 殘留、無重複註冊警告
- [x] 8.3 改寫 `getStylesheet.ts`:theme 參數由 `GrafanaTheme2` 換成 `tokens.ts` 的 token 型別,產出 `Stylesheet[]` 的 pure factory;驗證:移植過來的快照測試改用新 token 後通過
- [x] 8.4 移植 `useGraphLayout` 與 `useLayoutRunToken`:`cy.stop()` 後再 `layout().run()`,選項以 `useMemo` 穩定,初始演算法取自 runtime config `defaultLayout`;驗證:單元測試斷言相同輸入不重跑 layout,輸入變更恰跑一次
- [x] 8.5 移植 `useGraphResize`(`ResizeObserver` + debounced `cy.resize()`);驗證:元件測試以 mock ResizeObserver 斷言尺寸變化觸發一次 `resize()`
- [x] 8.6 實作元素同步:一般資料刷新走 diff-and-patch,pod-parent mode 切換走整批重建;驗證:單元測試斷言 N → N+M 的刷新不對既有 N 個節點 remove / re-add,而 mode 切換則整批重建
- [x] 8.7 實作 canvas 元件與 in-app 佈局演算法切換控制(`fcose` / `dagre`,ephemeral view state);驗證:e2e 在 demo 模式渲染出完整圖,切換演算法後圖面重新佈局且不重建 instance
- [x] 8.8 實作載入 / 空 / 錯誤狀態渲染(含 partial-parse 警告橫幅置於左上角);驗證:元件測試覆蓋四種狀態,並斷言 partial-parse 時仍渲染元素且只顯示警告橫幅

## 9. Graph 視圖 —— legend 與過濾

- [x] 9.1 以 Tailwind + Radix 重寫 legend 各 section 元件(node kinds、edge types、status、cluster、namespace、application、container、swatch、icon glyph、edge glyph);驗證:元件測試斷言各 section 依 spec 的資料條件渲染或不渲染
- [x] 9.2 實作每列的顯示 / 隱藏切換(eye / eye-slash)與 `visibleKinds` / `visibleEdgeTypes` view state,並接上可見性計算(含 orphan cascade);驗證:元件測試覆蓋切換後 canvas 元素可見集合的變化,及可見性計算為純函式的決定性
- [x] 9.3 實作 collapse-aware 的 node-kinds legend(只列出實際被繪製的 kind);驗證:元件測試斷言容器收合後 legend 列表隨之改變
- [x] 9.4 實作 legend 收合至側邊:收合鈕置於 Layout 列右端的 action slot,收合後僅渲染浮動還原鈕,其 `z-index` 高於 expand-collapse 的 overlay canvas 但低於 app shell 的導覽與全域 overlay;驗證:e2e 斷言收合後 canvas 取回寬度,且還原鈕可點擊生效

## 10. Graph 視圖 —— 互動

- [x] 10.1 實作選取狀態與 focus fade(選取節點 + incident edges + 鄰居 + 後代 + 上述的祖先容器);驗證:元件測試斷言點亮集合正確,且點亮的 edge 不終止於被 fade 的節點
- [x] 10.2 實作 canvas 事件與 React 的狀態投影(handler 在 init effect 註冊一次,以 `useSyncExternalStore` 訂閱);驗證:元件測試斷言 props 變動不重新註冊 listener
- [x] 10.3 以 Tailwind 重寫 hover tooltip(跟隨游標、節點與 edge 兩種內容、edge 涵蓋 RED 與 storage I/O 兩族 metrics);驗證:元件測試覆蓋兩族 metrics 的呈現與缺欄位的降級(absent 不顯示為 0)
- [x] 10.4 實作 pinned card(與 hover tooltip 共用內容來源,停靠於搜尋列下方,兩者不重疊);驗證:元件測試斷言兩者同時存在時的相對位置與不重疊
- [x] 10.5 移植 `useExpandCollapse` 與 collapse 對帳(desired ∩ present),含 controller 模式進場時預設收合 controller;驗證:移植過來的測試通過,並斷言資料刷新後 collapse 集合被保留
- [x] 10.6 實作 status 外框與 node usage 視覺(含 compound parent 的選擇器排序覆蓋);驗證:元件測試斷言 K8s node 與 controller 作為 compound parent 時仍顯示 status 外框

## 11. Graph 視圖 —— 拓樸功能

- [x] 11.1 實作 pod-parent mode 分段控制(`Node` / `Controller`,置於 legend 最上方 Layout 列,預設 `controller`,ephemeral view state)並接上拓樸轉換;驗證:e2e 切換模式後 pod 的 compound parent 鏈改變,且 `pod-to-node` 的呈現方式隨之改變
- [x] 11.2 實作各模式的可繪 edge 集合與 edge type 配色;驗證:單元測試斷言兩模式的可繪集合正確,且不合成 `pod-runs-on-node` / `controller-owns-pod`
- [x] 11.3 實作 ingress 顯示切換與 dashed 樣式(`ingress-gateway` 集合辨識、`showIngress` ephemeral view state 預設 `true`、`ingress-lb` 不在集合內);驗證:移植過來的測試通過,e2e 斷言切換後 gateway 鏈隱藏而 `ingress-lb` 仍在
- [x] 11.4 接上 switch tier 佈局約束(自 `data.labels.level` 讀取層級,施加固定節點位置使 switch 依層堆疊);驗證:e2e 斷言 fixture 中的 switch 依 level 由上而下排列
- [x] 11.5 接上 node group compound 合成(`cluster > node group > node`);驗證:移植過來的測試通過,e2e 斷言 node group 容器存在且可收合

## 12. Graph 搜尋

- [x] 12.1 以 Tailwind + Radix 重寫搜尋列(常駐於 canvas 右上角、`right: 8`、不佔 layout 空間、疊於 pinned card 之上、與警告橫幅不重疊);驗證:元件測試斷言定位與層疊關係
- [x] 12.2 實作 result list(主行 label + kind badge、subline 顯示匹配欄位、50 列上限與「N more」、collapsed 容器標註、被過濾器隱藏的 hit 以 disabled + eye-slash 呈現且不可 locate、最大高度約 canvas 40% 並內部捲動);驗證:元件測試逐條覆蓋上述規則
- [x] 12.3 實作 miss fade(僅切 style class,不移除元素、不觸發佈局、不參與可見性計算;與 focus fade 互斥;零 hit 時全圖 fade);驗證:元件測試斷言互斥關係與零 hit 案例
- [x] 12.4 實作 locate(展開 collapsed 祖先鏈 → 選取並在符合資格時開啟 detail → fit 至 closed neighborhood → 清空 query → 關閉列表);驗證:e2e 斷言 locate 折疊中的節點後該節點可見、被選取,且搜尋框已清空
- [x] 12.5 實作輸入框內的鍵盤互動(↑↓ 跳過 disabled 列並 scroll-follow、Enter locate 或立即 fit、兩段式 Esc、事件不冒泡至 app shell);驗證:元件測試逐條覆蓋四種按鍵行為

## 13. Node detail

- [x] 13.1 以 Tailwind 重寫 node detail 面板外框與開闔行為(關閉不清除選取、再次點擊已選取節點可重開、裝飾性容器不開啟);驗證:元件測試覆蓋三種開闔情境
- [x] 13.2 實作 Alerts section 與 alert 表格(一列一 alert、Count 欄 hover 列出全部發生時間、Severity badge、缺漏儲存格顯示 muted 的「n/a」、無 alerts 時整段不渲染);驗證:元件測試逐條覆蓋
- [x] 13.3 實作「Last occurred」欄位:點擊將檢視時間範圍設為 `[t-300, t+300]`;驗證:元件測試斷言點擊後檢視時間範圍變更為該視窗
- [x] 13.4 實作 Application 與 Containers change-report sections(依 `data.application` / `data.containers` 閘控;連結以 `target="_blank" rel="noopener noreferrer"` 開啟,不使用 `window.open`);驗證:元件測試覆蓋閘控條件與連結屬性
- [x] 13.5 接上 change-history 取數(`endpoints.codeChanges` / `endpoints.configChanges`,未設定即整段不渲染且不發請求);驗證:元件測試斷言端點未設定時無請求發出且該 section 不存在
- [x] 13.6 實作 Dashboard 按鈕:適用性判定(排除 cluster / storage-cluster / namespace / application)、參數組裝(含 `from_time` / `to_time`)、200 加至少一個非空 url 才視為可用、單一連結為連結按鈕、多連結為 Radix dropdown menu;驗證:元件測試覆蓋適用性、單一 / 多連結兩種呈現,以及不適用節點不發出查詢

## 14. Sankey 視圖

- [x] 14.1 實作自正規化 graph 推導 Sankey 節點與連線的純函式(tier 鏈 `pod → pvc → netapp-aggr → netapp-node`;pod→pvc 取自 `pod-mounts-pvc`、pvc→aggr 取自 `pvc-to-netapp-aggr`、aggr→netapp-node 取自 compound `parent`;端點 kind 不符即忽略該 edge);驗證:單元測試以 fixture 斷言推導出的節點與連線集合
- [x] 14.2 實作權重傳播(pvc→aggr 為量測值、aggr→netapp-node 為其入邊同方向加總、pod→pvc 為量測值於掛載該 pvc 的 pod 間均分);驗證:單元測試覆蓋三種傳播與多 pod 均分
- [x] 14.3 實作缺值規則(該方向無量測即不畫該方向連線、兩方向皆無即整條排除、`0` 畫成最小厚度虛線且不視為缺值、全部連線被排除的節點不繪);驗證:單元測試逐條覆蓋,含 fixture 中無 storage edge 的 pvc 不出現
- [x] 14.4 實作 tier 內排序(依當前模式的總流量遞減,同值以 label 排序)與 bytes/sec 格式化(SI 1000 進位、3 位有效數字、非零小值以指數呈現不截為 0);驗證:單元測試覆蓋排序決定性與格式化的邊界值
- [x] 14.5 以 d3-sankey 計算佈局並以 React 產生 SVG 渲染(佈局於 14.10 改為自算純函式並移除該相依)(節點、雙向連線、標籤),顏色取自 `tokens.ts`,read / write 不只靠色相區分;驗證:元件測試斷言 Both 模式下同一對 source/target 產生兩條可區分連線,dark 與 light 皆正確渲染
- [x] 14.6 實作 Read / Write / Both 模式選擇器(預設 Both)與 hover 全路徑高亮(點亮經過該節點的上下游全部連線,離開即還原);驗證:元件測試覆蓋三種模式與 hover 高亮集合
- [x] 14.7 實作節點與連線的 tooltip(節點總進出流量、pvc / aggr 的 `usage`、aggr / netapp-node 的 `health`;連線的來源、目標、方向、值,pvc→aggr 另顯示 `maxBytesPerSec` / `maxIops` 且僅作資訊不著色不警示;pod→pvc 標示為均分並註明 pod 數);驗證:元件測試逐條覆蓋
- [x] 14.8 實作空狀態兩種變體(圖中無任何 bytes/sec 量測;以及有量測但當前方向無)與 cluster 選擇器(僅在 K8s cluster 數 ≥ 2 時出現,範圍涵蓋 pod 與 pvc tier);驗證:元件測試斷言兩種空狀態文案不同,且 fixture 選 `dr` cluster 時為空
- [x] 14.9 實作跨視圖 locate(點擊節點導向 Graph 視圖並定位該節點;目標被過濾器隱藏時顯示提示、不改過濾器、不選取)與尺寸響應、刷新就地更新;驗證:e2e 斷言點擊 Sankey 節點後停在 Graph 視圖且該節點被選取

- [x] 14.10 改寫 Sankey 佈局為自算純函式(欄 x 依 tier、欄內確定性排序、槽位疊含最小列高與固定間距、緞帶三次貝茲幾何與全圖共用的一把厚度比例尺),並自 `package.json` 移除 `d3-sankey` 相依;驗證:單元測試斷言四步佈局對同一輸入輸出完全相同,`npm ls d3-sankey` 查無此套件且 `npm run build` 成功
- [x] 14.11 實作盒卡節點渲染(標題列 / 分隔線 / 副標列;pod 顯示 `namespace`,pvc 與 netapp-aggr 於 `usage` 兩欄皆存在時顯示 used / capacity;netapp-aggr 與 netapp-node 虛線描邊、pod 與 pvc 實線描邊;netapp-node 為葉卡;卡內文字 `pointer-events: none`);驗證:元件測試覆蓋三種副標情形與缺 usage 不補零,並斷言卡內文字不攔截其下緞帶的 hover
- [x] 14.12 實作槽位排序與盒卡尺寸(入邊掛左緣、出邊掛右緣,同側依權重降序、同值依對側 `label`;槽高取緞帶厚度與最小列高的較大者;盒卡高度由兩疊與內文最小高度推出,兩疊各自垂直置中);驗證:單元測試斷言槽位順序與座標,含零權重槽位仍佔最小列高且相鄰緞帶不重疊
- [x] 14.13 實作漸層緞帶與帶上數值(全圖共用比例尺、切換 mode 或 cluster 後重算、三次貝茲填色區域、方向色族的線性漸層、描邊光暈的數值標籤、緞帶厚度小於字高即省略標籤);驗證:元件測試斷言 Both 模式下 read 與 write 共用同一把尺、切換模式後最大厚度改由新的最大權重取得、零權重連線不標數值
- [x] 14.14 實作欄位標題與 pod tier 的 namespace 分組(四欄標題、空 tier 不繪標題;同 namespace 相鄰、左緣色條、色盤依首次出現順序取色並循環、無 namespace 的 pod 不掛色條並排最後);驗證:元件測試斷言分組順序的確定性與色條配色,並斷言 namespace 未被畫成任何節點或連線
- [x] 14.15 實作圖外數字摘要兩張表(節點摘要含 tier、`label`、總流入、總流出、usage、health,缺值以佔位符呈現;namespace 小計依合計降序;空狀態期間不繪;過寬時於自身容器橫向捲動);驗證:元件測試覆蓋隨 mode 更新與缺值不補零,e2e 斷言頁面不出現橫向捲軸
- [x] 14.16 改為 `viewBox` meet-fit 適配並實作圖內縮放平移(單一 `<g transform>`、`<defs>` 留在該 `<g>` 之外、以指標為錨點的滾輪縮放且 `preventDefault`、拖曳平移與 grab / grabbing 游標、倍率上下限、平移中不開 tooltip、開場為「符合視窗但不放大超過 1:1」、mode 與 cluster 與主題切換及容器 resize 皆保留視角);驗證:單元測試斷言錨點下的圖上座標於縮放前後不變,元件測試斷言容器 resize 未呼叫佈局函式
- [x] 14.17 實作縮放控制列與圖區鍵盤操作(縮小 / 倍率讀數且啟動即回 1:1 / 放大 / 符合視窗 / 1:1 / 專注,皆具可存取名稱且可鍵盤操作;`+` `-` `0` `1` `F` `Esc` 只在圖區容器或其後代具有焦點時作用,監聽註冊於容器而非 `document`);驗證:元件測試斷言焦點在導覽列時按 `0` 不改變視角,且這些按鍵不攔截 mode / cluster selector
- [x] 14.18 實作專注模式(收起 app shell 導覽列與 Sankey 自身控制項、圖填滿視窗、`Esc` 或再次啟動控制列按鈕即離開、進出保留視角與 mode 與 cluster、不入 URL 不持久化、切離視圖即解除);驗證:e2e 斷言進入後導覽列不可見、離開後回復且縮放倍率不變
- [x] 14.19 tooltip 改為跟隨指標、夾在視圖區內、平移進行中不開啟;驗證:元件測試斷言 hover 最右下緣節點時 tooltip 不溢出視窗且頁面不出現捲軸,平移期間不出現 tooltip
- [x] 14.20 補主題與效能回歸(盒卡、欄位標題、緞帶漸層、數值光暈、色條、控制列與專注模式背景全部取自 token;縮放平移只更新 `transform`);驗證:元件測試於 dark 與 light 斷言無硬編顏色,效能測試以合成 graph 斷言 100 次縮放平移的佈局函式呼叫次數為 0 且每次更新於一個 animation frame 內完成

## 15. 容器與 Kubernetes 部署

- [x] 15.1 撰寫多階段 `Dockerfile`(build stage 執行 typecheck + build;runtime stage 只含 `dist/` 與靜態 web server,數值 UID 非 root,監聽 `8080`);驗證:`docker build` 成功,`docker run` 後 `curl localhost:8080` 回傳 `index.html`
- [x] 15.2 設定 web server:history-API fallback(未知路徑回 `index.html`)、`/assets/*` 長期不可變快取、`index.html` `no-cache`、`/srv/config/config.json` 以 `no-store` 提供於 `<base>/config.json`、`GET /healthz` 回 200;驗證:逐一 `curl` 檢查各路徑的狀態碼與 `Cache-Control` 標頭
- [x] 15.3 實作選用的同源反向代理(`/api/` → 後端,由 `KSG_API_PROXY_TARGET` 指定;未設定時 `/api/*` 回 404 而非 `index.html`);驗證:未設定時 `curl /api/x` 得 404;設定後請求被轉發
- [x] 15.4 撰寫 `deploy/` manifests(Deployment 含 liveness / readiness probe 與資源請求、Service、ConfigMap 範例攜帶完整 `config.json`;config 以目錄形式掛載於 `/srv/config`,不用 `subPath`;符合 Pod Security Standards 的 `restricted`);驗證:`kubectl apply -f deploy/` 後 Pod 進入 Ready,`kubectl port-forward` 可開啟頁面
- [x] 15.5 驗證「同一 image + 不同 ConfigMap」的部署前提:ConfigMap 設 `demoMode: true` 且無可達後端時 image 仍正常服務 demo;驗證:以該 ConfigMap 部署後頁面渲染完整圖並顯示 demo 標記

## 16. E2E 與 CI

- [x] 16.1 撰寫 demo 模式冒煙 e2e:載入 `/graph` 渲染完整圖、切換至 `/sankey` 再切回、legend 收合與還原;驗證:`npm run e2e` 通過
- [x] 16.2 撰寫 fetch 路徑往返 e2e:以 `demoMode: false` + `endpoints.graph: "/demo/graph.json"` 走完整取數、驗證與渲染路徑;驗證:`npm run e2e` 通過
- [x] 16.3 建立 CI workflow:Node 版本取自 `.nvmrc`,鏈為 `typecheck → lint → fixture:check → unit → e2e → build`;驗證:CI 於 PR 上綠燈,且刻意破壞任一環節會使對應步驟失敗
- [x] 16.4 建立 image 建置與推送 workflow(push 到 main 與 tag 時觸發,標記 `main` / `sha-<short>` / `X.Y.Z` / `latest`,僅使用平台提供的憑證);驗證:一次 main push 後 registry 出現對應標記的 image
- [x] 16.5 撰寫 README:Quick Start(`npm install` → `npm run dev`,無需 Docker)、連接真實後端、建置與部署、疑難排解(CORS、`public/demo/graph.json` 過期、端點未設定的設定錯誤);驗證:依 README 於乾淨 checkout 逐步操作可跑起 demo 與連接後端兩種模式

## 18. Spec 修訂回歸(orphan 級聯、legend、resize、collapse 手勢與訊號)

- [x] 18.1 可見性判定加入**基準線**輸入(normalize boundary 輸出中具 incident edge 的節點 id 集合),並改為:leaf 依基準線有無 edge 決定去留(有 → 恆保留,無 → 隱藏),容器維持「無可見子節點且無可見 incident edge 即移除」的 fixed-point 級聯;容器 / leaf 依 `elements` 的親子關係判定,不依子節點當下可見性;驗證:單元測試涵蓋基準線有邊但當下全被過濾的 leaf 保留、基準線無邊的 leaf 隱藏、兩者並存各得其果、子節點全被過濾的容器被收掉、容器不被誤判為 leaf
- [x] 18.2 呼叫端提供基準線給可見性判定(基準線取自正規化輸出,早於 pod-parent mode 轉換與各項過濾);驗證:元件測試斷言 `node` 模式下唯一 edge 為 `pod-to-node` 的 pod(DaemonSet / Job / CronJob)維持可見
- [x] 18.3 `EdgeLegend` 折疊列改為以組別存在性渲染:折疊組任一成員 type 存在於資料中即渲染代表列(標籤與 glyph 不因錨點 type 缺席而改變),並提供切換鈕;驗證:元件測試斷言只有 `pod-calls-service` / `service-selects-pod` 而無 `pod-calls-pod` 時仍渲染 `pod ↔ pod/service` 列且可切換,`node-to-switch` 而無 `switch-to-switch` 時同理
- [x] 18.4 容器尺寸響應拆分 resize 與 fit:每次尺寸變化皆 `resize()`,僅**視窗尺寸變化**所致者才 `fit()`;app 內部配置改變(legend 收合 / 還原、視圖切回可見)只 resize;驗證:元件測試斷言收合 legend 後 zoom / pan 不變,視窗縮放後才 fit
- [x] 18.5 `useNodeDashboardUrl` 改為原樣使用設定的端點 URL(移除 trim 與去尾斜線),符合 runtime-config 的「URL 值 MUST 原樣使用」;驗證:單元測試斷言帶尾斜線的端點原樣送出
- [x] 18.6 雙擊收合手勢擴及 `isStorageCluster`;驗證:單元測試斷言雙擊 storage-cluster 切換其收合狀態,雙擊可選取容器仍為 no-op
- [x] 18.7 選取鏡射與 fade 套用加入 collapse 集合為明確輸入(不以 `elements` identity 為代理);驗證:元件測試斷言 `elements` 參照不變而收合集合改變時,選取環與 fade class 仍被重新套用

## 19. Code review 回歸(查詢字串、Sankey cluster、viewport、locate、hover、base URL)

- [x] 19.1 `withQuery` 改為**取代**同名 key 而非附加(設定 URL 自帶的其他參數原樣保留,不重新編碼);驗證:單元測試斷言 `?start=100` 的端點加上本次視窗後只剩一個 `start`、`tenant=ops` 與 `%20` 編碼原樣留存
- [x] 19.2 Sankey 的 cluster 過濾前移至聚合之前(過濾 pvc→aggr 與 pod→pvc 邊,而非過濾成品圖):storage tier 不依 cluster 過濾,aggr→netapp-node 權重只以在範圍內的 pvc 邊加總,範圍內無邊的 aggr / netapp-node 不繪;驗證:單元測試以雙 cluster 共用一個 netapp-node 的合成圖斷言權重重算與幽靈節點消失
- [x] 19.3 移除 Graph 視圖切回可見時派送的合成 `window resize`(容器 ResizeObserver 已足以重新量測),並移除隨之無用的 `visible` prop;驗證:元件測試斷言 GraphView 重新可見時不派送 window resize 事件
- [x] 19.4 跨視圖 locate 於執行前清空搜尋輸入(視圖內 result list 的 locate 由 SearchBar 自行清空,不重複);驗證:元件測試斷言 `locateNodeId` 抵達後搜尋輸入為空
- [x] 19.5 Sankey 於重新整理移除被 hover 的節點時清除 hover 高亮與 tooltip(節點仍在則依新拓樸重算);驗證:元件測試斷言目標節點消失後 tooltip 關閉且無殘留淡化,仍存在者維持高亮
- [x] 19.6 `BrowserRouter` 以 `import.meta.env.BASE_URL` 作為 `basename`,與 runtime-config 讀取 `config.json` 的 base 一致;驗證:元件測試以 `BASE_URL=/ksg/` 斷言 `/ksg/sankey` 顯示 Sankey 且 `/ksg/` 導向 `/ksg/graph`
- [x] 19.7 修訂規格以吻合已實作的決定:app-shell 檢視時間範圍改為 graph 查詢的時間視窗、graph-data-source 新增「graph 請求的查詢字串」需求、新增 `graph-filters` capability 規格、runtime-config 端點表補 `labelValues` / `edgeTypes`、dev-environment 將 e2e 納入 CI gate;驗證:`openspec validate init-pure-ui-frontend --strict` 通過,且全庫無「graph 查詢不帶時間參數」的殘留敘述

## 20. 兩個端點的拆分(graph 與 storage-graph)

- [x] 20.1 `runtime-config`:型別與 validator 加入 `endpoints.storageGraph`(選用,URL 形式規則同其他端點),並確認 `labelValues` / `edgeTypes` 的驗證與錯誤訊息齊備;驗證:單元測試涵蓋缺席、空字串等同缺席、非 http(s) scheme、非字串,且 `storageGraph` 缺席時**不**構成設定錯誤
- [x] 20.2 wire 型別與 normalize:加入 `netapp-svm` node kind、`storage-flow` edge type(含 `labels.tier` 五值與選用的 `labels.attribution`)、`netapp-node` 的 `hardware` / `perf` 屬性;驗證:單元測試斷言五種 tier 皆正確映射、`attribution` 原樣保留、`hardware` / `perf` 逐欄降級且缺席不補值、`perf` 不影響 `health` 或狀態外框
- [x] 20.3 `buildStorageGraphRequestUrl` 與其重取鍵:`start` / `end`(送出當下解析)、單值 `az` / `env`、可重複的 `ontap_cluster` / `node` / `aggr` / `svm` / `pod`、選用的 `cluster` / `namespace`,不送 `edge_type` / `prune`;`pod` 值於送出前驗證 `<ns>/<name>`;驗證:單元測試涵蓋參數組合、URL 編碼、時鐘前進不改變重取鍵、az 或 env 缺一即不產生請求
- [x] 20.4 shell 加入**第二個** loader 實例服務 storage-graph:lazy(首次進入 Sankey 且 `az` / `env` 齊備才發第一次)、獨立的 in-flight / status / error / 最後成功時間;驗證:元件測試斷言停留 Graph 視圖期間 storage-graph 請求數為 0、首次進入後恰好一次、來回切換不再發、一方 500 不影響另一方
- [x] 20.5 重新載入動作與自動刷新改為只作用於**當前視圖**的來源,狀態指示器改為反映當前來源;`az` / `env` 未齊備或端點未設定時重新載入呈現為不可用;驗證:元件測試斷言於 Sankey 觸發重新載入只打 storage-graph、切換視圖後指示器立即改顯示新來源的時間與錯誤
- [x] 20.6 檢視時間範圍改為同時驅動兩個端點:變更時只重取**已載入**的來源;驗證:元件測試斷言未開啟過 Sankey 時變更時間範圍不產生 storage-graph 請求,兩者皆已載入時各重取一次且 `start` / `end` 相同
- [x] 20.7 Sankey 估計選擇器:`az` / `env` 單選、選項取自 `endpoints.labelValues`、候選值恰為一個時自動預選、未選齊時顯示提示且不取數、選項消失後清除選擇;驗證:元件測試涵蓋四種情形,並斷言與 Graph filter bar 的同名維度互不影響
- [x] 20.8 Sankey root 控制:五種 root 可重複可混用、`pod` 值就地驗證、控制項明示 `node` 同時比對兩種節點且兩側取交集、清空為合法狀態;驗證:元件測試斷言不合法的 pod root 不進入請求且其他 root 仍運作,root 變更觸發恰好一次重取
- [x] 20.9 Sankey 選用的 `cluster` / `namespace` 收斂控制(多選,作為請求參數送出,不於客戶端過濾);驗證:元件測試斷言選擇改變請求參數而非改變已回傳元素
- [x] 20.10 重寫 Sankey 推導:六層 tier、tier 歸屬讀自 `labels.tier`、FlexGroup 路徑自 `svm-pvc` 起始、未排程 pod 於 `pvc-pod` 結束、無流量 root 仍繪製為孤立節點;驗證:單元測試以 storage fixture 斷言六個 tier 的成員,並涵蓋三種殘缺路徑
- [x] 20.11 權重改為直接取自 `storage-flow` edge 的 `data.metrics`,**移除**客戶端的 aggregate 加總與 pod 均分邏輯及其測試;`labels.attribution="split"` 於 tooltip 標示為均分估計;驗證:單元測試斷言上游權重不由下游之和取代(含後端捨入造成的不等)、split link 標示為估計而 `svm-pvc` link 不標示
- [x] 20.12 移除客戶端 cluster selector 與其過濾邏輯(改由請求參數達成),連同其測試;驗證:`rg` 確認無殘留的客戶端 cluster 過濾程式碼,既有測試更新後全綠
- [x] 20.13 空狀態改為四態(端點未設定 / 估計未選齊 / 回應為空 / 當前方向無量測),各有可區分的文字,demo 模式下第三態額外標示 fixture 來源;驗證:元件測試逐態斷言文字與選擇器仍可操作
- [x] 20.14 tooltip 與排序更新:節點 tooltip 加入 `ontap_cluster`、`hardware`、`perf`(標示為原始讀數且不上色)、`alerts` 與無流量 root 說明;link tooltip 顯示 tier,ceiling / latency 只在 `svm-pvc`;排序把無流量 root 置於 tier 最下;驗證:單元與元件測試逐條斷言
- [x] 20.15 跨視圖 Locate 更新:目標為 filter-hidden、目標不存在於 graph 當前 body(篩選或 `prune` 不同)兩種提示可區分,`netapp-svm` 節點不提供 Locate 互動;驗證:元件測試斷言三種情形,且任一情形皆不改寫使用者的篩選或 `prune`
- [x] 20.16 新增 `SHOWCASE_STORAGE_GRAPH` fixture(五種 tier 齊全、含一條 `attribution="split"` 的 `pvc-pod`、一條 FlexGroup 路徑、`hardware` / `perf`),`fixture:build` 改為產出兩個 JSON,`fixture:check` 涵蓋兩者;驗證:單元測試斷言 storage fixture 的權重逐 tier 守恆,且其 pod / pvc / netapp 節點 id 皆存在於 graph fixture(SVM 除外)
- [x] 20.17 部署與文件:ConfigMap 範例與 `deploy/README.md` 加入 `endpoints.storageGraph`(及 `labelValues` / `edgeTypes`),快取標頭涵蓋 `/demo/storage-graph.json`,README 疑難排解加入「Sankey 顯示未設定端點」與「Sankey 要求各選一個 az / env」;驗證:依 README 於 kind 叢集套用後 Sankey 可繪出圖
- [x] 20.18 新增第三個 e2e spec:同時提供兩份 demo payload,斷言停留 Graph 期間 storage-graph 請求數為 0、進入 Sankey 並選定 `az` / `env` 後恰好一次、繪出的 tier 來自 storage fixture;驗證:`npm run e2e` 三個 spec 全通過

## 21. 程式碼審查後的修正

- [x] 21.1 bytes 階梯統一為 `KB`:刪除 `deriveSankey` 內與 `shared/format/measurements.formatBytes` 逐字相同的 `formatSiBytes`,`formatBytesPerSec` 改為委派;驗證:單元測試斷言 `262144` → `262 KB/s`,且同一 tooltip 內的速率與 `usage` 使用同一拼寫
- [x] 21.2 Sankey `az` / `env` 於 `endpoints.labelValues` 缺席時仍渲染並可輸入(退化為自由文字),`cluster` / `namespace` 則於無可列舉選項時不渲染;驗證:元件測試斷言零選項時 `AZ` / `Env` 為 input 且可輸入,shell 測試斷言只設定 `storageGraph` 時仍能送出帶 `az` / `env` 的請求且不打任何 label-values URL
- [x] 21.3 image 加入第二個代理 `KSG_METRICS_PROXY_TARGET` → `/metrics-api/`,ConfigMap 範例的 `endpoints.labelValues` 改為 `/metrics-api`;驗證:`deploy/README.md` 與 `deployment.yaml` 註解說明兩者為不同 upstream,未設定時 `/metrics-api/` 回 404
- [x] 21.4 無量測路徑上的 root 仍繪製:`deriveSankey` 接受該請求的 root 選擇,以後端相同的比對規則(`node` 比對兩側、`ontap_cluster` 涵蓋其下三種、`pod` 為 `<ns>/<pod>`、`pvc` 非 root 種類)保留節點;驗證:單元測試斷言全無 `metrics` 的路徑上只有被選為 root 的節點以 `noFlow` 保留,且 root 全空時無節點被保留
- [x] 21.5 無流量節點堆疊收斂於視圖內:流量圖為最高的堆疊預留高度,堆疊於空間不足時壓縮間距;驗證:元件測試以單一 tier 20 個無流量節點斷言每個節點的下緣不超過 SVG 高度

## 22. alert overlay 對接真實後端

`kube-state-graph` 的 alert overlay 送出 `{name, state, severity}`,不帶任何發生時間;normalize 的 `parseAlerts` 卻要求每筆 alert 具備有效發生時間,否則丟棄。結果是真實後端的告警**全數**在 anti-corruption boundary 消失——API body 帶著 `data.alerts`,UI 一筆都不顯示,而且回應是 200,沒有任何錯誤可循。

- [x] 22.1 wire 契約更正:`WireAlert` 的「PANEL-ONLY,後端不送 alerts」註記已不成立(backend `e6430ad` 起送出),改為記載兩種產生者對「時間」的不同認知,並宣告選用的 `state` 欄為**刻意不投影**(查詢帶固定 `alertstate="firing"` selector,呈現只會是常數);驗證:型別編譯通過,註解點名兩種產生者各自送出的欄位
- [x] 22.2 `NodeAlert.timeRecords` 改為選用,並於型別註解寫明「缺漏即無發生史」是完整狀態而非缺陷;驗證:`npm run typecheck` 通過,所有消費端經編譯器逐一暴露
- [x] 22.3 `parseAlerts` 不再因缺發生時間而丟棄 alert:`name` / `severity` 為唯二必填,無有效時間時**省略** `timeRecords`(不得寫成 `[]`);驗證:單元測試斷言 overlay 形狀的 alert 被保留且不帶 `timeRecords`(以 `toStrictEqual` 區分省略與空陣列)、`state` 不被投影、缺 `name` / `severity` 仍丟棄
- [x] 22.4 alert 表格降級:`timeRecords` 缺漏時 Count 與 Last occurred 各顯示 muted 的「n/a」,Last occurred 不再是按鈕(無時刻可回捲),不得以 `0` 與 epoch 起點日期代替;驗證:元件測試斷言該列仍渲染、兩格為 n/a、無 `alert-count` / `alert-time` testid、無 button,且同表格中帶時間的列不受影響
- [x] 22.5 `SHOWCASE_STORAGE_GRAPH` 的 `ontap-prod-02` 同時掛一筆帶 `time` 與一筆 overlay 形狀的 alert,使 demo 模式同時走過正常與降級兩條路徑;驗證:`npm run fixture:check` 通過,fixture 測試全綠

## 23. `severity` 亦為選用

跨 repo 規範走查發現同一類缺陷還差一欄:後端 `AlertDTO.Severity` 以 `omitempty` 序列化(其 `graph-api` 規範明寫「`severity` is omitted from an entry when empty」),而 `parseAlerts` 要求非空 `severity`,否則丟棄整筆。未宣告 severity label 的告警規則因此同樣靜默消失——與 §22 的 `timeRecords` 同一個失效形狀,只差一個欄位。

- [x] 23.1 `WireAlert.severity` 與 `NodeAlert.severity` 改為選用,型別註解寫明後端以 `omitempty` 序列化,且「缺漏」與「無法辨識的自訂 label」是兩回事;驗證:`npm run typecheck` 通過,所有消費端經編譯器暴露
- [x] 23.2 `parseAlerts` 僅以 `name` 為必填:`severity` 缺漏 / 空字串 / 非字串時**省略該欄**並保留該 alert,不得代入預設等級;驗證:單元測試以 `toStrictEqual` 斷言三種輸入皆產出無 `severity` 欄的 alert,並斷言 `{name:'Ungraded', state:'firing'}` 產出 `{name:'Ungraded'}`,缺 `name` 者仍丟棄
- [x] 23.3 alert 表格 Severity 欄於缺漏時顯示 muted 的「n/a」而非 badge(含 fallback 色),自訂 label 仍照常 badge;驗證:元件測試斷言無 `alert-severity` testid、自訂 label `P1` 仍 badge,且只帶 `name` 的 alert 呈現一列五個 n/a 且 Last occurred 非按鈕
- [x] 23.4 Sankey 節點 tooltip 的 alert 行於 `severity` 缺漏時只印名稱,不得印出 `undefined` 前綴;驗證:型別檢查通過,fixture 走過該分支
- [x] 23.5 `SHOWCASE_STORAGE_GRAPH` 的 `aggr1` 掛一筆無 `severity` 的 alert,使 fixture 涵蓋「有無評級 × 有無發生史」四種組合;驗證:`npm run fixture:check` 通過

## 17. 整體驗收

- [x] 17.1 全鏈驗證:乾淨 checkout 執行 `npm install && npm run typecheck && npm run lint && npm run fixture:check && npm run test:ci && npm run e2e && npm run build` 全數通過,且單元測試覆蓋率達 80%
- [x] 17.2 對照 `specs/` 逐一走查 13 個 capability 的 requirements,確認無遺漏或行為偏差;驗證:產出走查清單,每條 requirement 標註其對應的測試或可觀察行為
- [x] 17.3 兩端點拆分後重跑全鏈驗證(含新增的第三個 e2e spec),覆蓋率仍達 80%;驗證:乾淨 checkout 上整條 CI 鏈綠燈
- [x] 17.4 對照修訂後的 `specs/` 重走查 `runtime-config` / `graph-data-source` / `storage-flow-sankey` / `app-shell` / `dev-environment` / `container-deployment` 六支的異動需求;驗證:走查清單標註每條新需求對應的測試或可觀察行為
- [x] 17.5 alert overlay 修正後重跑全鏈驗證;驗證:`npm run typecheck && npm run lint && npm run fixture:check && npm run test:ci` 全綠,並以真實 kube-state-graph 後端確認節點 `data.alerts` 於面板實際成列
- [x] 17.6 `severity` 改為選用後重跑全鏈驗證(含 `npm run e2e`);驗證:整條 CI 鏈綠燈,覆蓋率仍達 80%,且 alert 列上唯一必填欄位為 `name` 這件事在 `graph-data-source` 與 `node-detail` 兩支規範中一致
