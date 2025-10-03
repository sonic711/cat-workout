# 測試紀錄

## 總覽
- **測試框架**：Vitest 2.x，搭配 Vue Test Utils 與 jsdom。
- **執行指令**：`npm run test`（需先完成 `npm install` 以安裝新增的開發依賴）。
- **環境需求**：Node 20+，支援 ES Module；測試執行於 jsdom，並在 `tests/setup.ts` 中 stub `ResizeObserver` / `matchMedia`。

## 測試案例明細

### 1. `tests/unit/useResponsiveDialog.spec.ts`
針對 `useResponsiveDialog` composable，驗證對目標視窗寬度的響應式調整。

| 案例 | 情境 | 驗證重點 | 通過標準 |
| --- | --- | --- | --- |
| `returns desktop width by default when viewport is wide` | 模擬視窗寬度 1280px 並設定桌面寬度 800px | desktop 模式邏輯 | `dialogWidth === '800px'`、`dialogTop === '15vh'`、`isMobile === false` |
| `shrinks width and top when viewport is below the breakpoint` | 模擬視窗寬度 360px，設定 mobile padding 16 與 top 6vh | mobile 模式下的寬度／頂距計算 | `isMobile === true`、`dialogTop === '6vh'`、`dialogWidth === '344px'`（360 - 16 padding）|
| `updates dimensions when viewport resizes` | 先 1024px 再縮至 400px，並觸發 `resize` 事件 | 動態更新反應 | 初始 `dialogWidth === '700px'`；縮放後 `isMobile === true` 且 `dialogWidth === '376px'`（400 - 24 padding）|

所有斷言均使用 `expect`，需全部通過方可判定此套件通過。

### 2. `tests/unit/useHomeCalendar.spec.ts`
驗證 `useHomeCalendar` composable 的資料同步、滾動行為與 hydration 流程。

| 案例 | 情境 | 驗證重點 | 通過標準 |
| --- | --- | --- | --- |
| `returns all body parts for a given day and syncs selection state` | 模擬日曆摘要含三個部位 | bodyPartsForDay 與 selectedBodyParts 對同一天保持同步 | `bodyPartsForDay` 及 `selectedBodyParts` 同時回傳 `['胸', '背', '腿']` |
| `falls back to empty array when no summary exists` | 查詢未記錄日期 | 空資料行為 | 回傳 `[]` |
| `scrolls detail section immediately when clicking the currently selected date` | 現有選取日期，呼叫 `handleCalendarDateClick` | 滾動互動 | mocked `scrollIntoView` 被呼叫一次 |
| `hydrates from persistence and resets date` | fake timer 設定為 2024-01-05，執行 `ensureHydrated` | hydrate 流程及日期重設 | `hydrateFromPersistence` 被呼叫且 `selectedDate` 變為 fakeNow 的時間戳 |

所有測試必須通過才視為 composable 覆蓋成功。

## 通過標準
- `npm run test` 結果需為綠色（0 失敗）。
- 若有測試失敗，需先確保 `npm install` 完成並確認相關 stub（`tests/setup.ts`）未被移除。
- 測試執行時若需額外環境（如資料庫、後端），目前無需配置；本套測試僅依賴前端 composable。

