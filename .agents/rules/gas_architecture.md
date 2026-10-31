---
trigger: model_decision
description: 修改或查詢 google_apps_script/（Code.gs、Index.html、teacher_history.html）或前端拼字遊戲（index.html、src/*.js、css/styles.css）時讀取：全專案檔案、函式行號與 CSS 區段精準索引。
---
# 全專案架構與行號索引 (app2000vocab-repo)

## ⚡ 極致省 Token 守則（必讀）
1. **零探勘**：本檔已含全專案函式與 CSS 行號索引，**直接依下方行號用 `read_file`（StartLine/EndLine 範圍 ≤120 行）讀取目標函式**；除非行號漂移找不到，否則嚴禁跑 `Select-String` 或全目錄搜尋。
2. **禁讀巨檔**：
   - 禁讀 `data/meanings.json`（2MB）、`data/words2000.json`（65KB）、`data/wordbank2000.json`（57KB）。
   - `Code.gs` **第 27 行**（`WORD_LEVELS`）為 2055 字元單行，讀取時盡量避開。
3. **雙胞胎鏡像檔**：根目錄 `teacher_history.html` 與 `google_apps_script/Index.html` 完全相同。只改 `google_apps_script/Index.html`，收尾時 `Copy-Item google_apps_script\Index.html teacher_history.html`。
4. **單一工作目錄**：固定操作 `C:\Users\pmpu4\.gemini\antigravity\scratch\app2000vocab-repo`，忽視 `app2000vocab` 與 `bad-repo` 舊目錄。

---

## 一、GAS 後端（模組化拆分架構）
- **Script ID**：`1Y69AjfZvh__eyEr6fEjrl-DADDJ5KRn13yRehlWi2EGUZhO_qUQN6KcT`
- **Web App Deployment ID**：`AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9`

| 檔案 | 職責與內容 | 行數 |
|---|---|---|
| `Code.gs` | 系統常數、`WORD_LEVELS`、主路由 `doPost`/`doGet`、`include`、`jsonResponse` | ~1,113 行 |
| `AuthService.js` | 0. 密碼雜湊與資安防護、1. 身分驗證與 Token 快取、WAF 攻擊偵測 | ~666 行 |
| `TaskService.js` | 2. 老師指定單字任務核心函式、出題與週末補救任務 | ~452 行 |
| `TimeRestriction.js` | 2.5 學生使用時間管制 (07:30~22:00) 與教師解除限制設定 | ~1,045 行 |
| `AnalyticsService.js` | 4.1 每日指定測驗成果與錯題大數據分析、日期區間績效比較分析 | ~750 行 |
| `SpreadsheetService.js` | 4. 儲存歷程、5. 查詢邏輯、6. 班級總覽與排行榜、7. 密碼與目標、8. 試算表備份維護、9. 學生歷程總庫集中管理 | ~2,882 行 |

- **試算表分頁**：
  1. `使用者清單`：A帳號 | B密碼(SHA-256) | C角色 | D班級 | E姓名
  2. `指定單字任務`：A班級 | B任務名稱 | C單字清單 | D測驗模式 | E題數 | F啟用
  3. `每日任務紀錄`：A日期 | B班級 | C學號 | D姓名 | E任務名稱 | F成績 | G正確率 | H今日總作答 | I今日總答對 | J總正確率 | K狀態 | L更新時間
  4. `學生歷程總庫`：A學號 | B備份時間 | C完整JSON | D等級... 等 35 欄標準欄位
  5. `全班學習總覽`、`時間限制設定`、`錯誤日誌`、`裝置登入歷程`、各學生專屬歷程表

---

## 二、GAS 查詢系統前端（極致高內聚模組化架構）
- **HTML 骨架**：`google_apps_script/Index.html`（~2,290 行，純 DOM 與 Modals 骨架，鏡像 `teacher_history.html`）
  - 透過 `include` 組合所有樣式與模組
- **CSS 樣式模組（按頁面切分）**：
  1. `StyleBase.html`：基礎變數、深淺主題、按鈕、輸入框、全螢幕（~581 行，鏡像 `teacher_style_base.html`）
  2. `StyleTeacher.html`：教師總覽大卡片、班級表格、時間管制、出題 Modal（~183 行，鏡像 `teacher_style_teacher.html`）
  3. `StyleStudent.html`：學生歷程卡、KPI、熱力圖、目標里程碑、常錯小卡（~725 行，鏡像 `teacher_style_student.html`）
  4. `StylePrint.html`：A4 診斷報告列印預覽與 `@media print` 專用排版（~4,072 行，鏡像 `teacher_style_print.html`）
- **JS 客戶端邏輯模組（按角色功能切分）**：
  1. `ClientCoreJs.html`：基礎認證、共用 DOM 安全輔助、主題切換、Toast、資料拉取（~596 行，鏡像 `teacher_client_core.html`）
  2. `TeacherJs.html`：教師總覽大儀表板、出題 Modal、時間管制、大數據分析、密碼管理（~3,894 行，鏡像 `teacher_client_teacher.html`）
  3. `StudentAnalyticsJs.html`：學生歷程處理、KPI、Chart.js 圖表、熱力圖、目標里程碑、弱點常錯卡片（~3,427 行，鏡像 `teacher_client_student.html`）
  4. `StudentChipsJs.html`：單字晶片卡片、已掌握/修復單字清單（~1,705 行，鏡像 `teacher_chips.html`）
  5. `ExportPdfJs.html`：A4 PDF 列印報告預覽與下載生成（~5,469 行，鏡像 `teacher_export_pdf.html`）
  6. `ExportExcelJs.html`：Excel (.xlsx) 彩色樣式自定義匯出引擎（~652 行，鏡像 `teacher_export_excel.html`）
- **後端模組引導**：`Code.gs` 含 `include(filename)` 與 `doGet(e)` 透過 `createTemplateFromFile("Index").evaluate()` 解析樣版

### HTML Body（4537–6779）
`login-overlay`(4539) · `mainControlCard`(4595: `loginSection` 4610 / `querySection` 4613) · `teacherBackBar`(4648) · `teacherOverviewCard`(4660: `teacherOverviewMainView` 4695 / `teacherAnalyticsView` 4850 / `teacherRangePerformanceView` 4978 / `teacherTimeSettingsView` 5107) · 學生卡片：`studentSummaryCard`(5330) / `studentProgressCard`(5332) / `studentLearningRecordCard`(5362) / `export-records-section`(5483) / `kpiSection`(5545) / `studentDailyTaskCard`(5559) / `studentFreePracticeCard`(5707) / `rankingCard`(5819) / `goalsCard`(5919) / `forecastCard`(6014) / `frequencyCard`(6077) / `weaknessCard`(6174) / `wordFlowCard`(6286) / `heatmapCard`(6382) / `chartCard`(6456) / `resultCard`(6548) · Modals：`taskModal`(6579) / `passwordModal`(6738) / `errorLogModal`(6754)

### JS 核心函式精準行號（6780–20925）
- **基礎/驗證**：`safeCsvCell`(6850)、`applyPageThemeBackground`(6900)、`toggleTheme`(6951)、`adjustHistoryFont`(6998)、`showToast`(7021)、`login`(7049)、`logout`(7063)、`handleLogoutOrBack`(7115)、`fetchData`(7128)
- **教師總覽**：`initTeacherDashboard`(7224)、`populateTeacherClassSelector`(7270)、`refreshClassOverview`(7299)、`renderTeacherKpis`(7327)、`renderTeacherCharts`(7382)、`getFilteredAndSortedOverview`(7573)、`renderTodayTaskBadge`(7639)、`renderClassOverviewTable`(7730)、`viewStudentAsTeacher`(7961)、`backToClassOverview`(8024)、`triggerCleanupUnusedSheets`(8042)
- **指定測驗出題 Modal**：`openTaskModal`、`closeTaskModal`、`setWordPickerLevel`、`renderWordPickerGrid`、`toggleWordSelection`、`quickPickRandomWords`、`submitTaskData`（單字庫已外部化由 CDN 動態快取載入）
- **教師時間管制**：`switchTeacherSubView`(8550)、`loadTeacherTimeSettings`(8633)、`renderTeacherStudentRulesList`(8808)、`renderTeacherDateRulesList`(8866)、`saveTeacherGlobalTimeSetting`(8929)、`saveTeacherStudentTimeSetting`(8980)、`saveTeacherDateRestriction`(9068)、`duSaveStudentMinutes`(9191)、`duExtend`(9197)、`duUnlock`(9202)、`toggleTeacherTodayUnlock`(9211)
- **教師大數據與區間比較**：`loadDailyTaskAnalytics`(9310)、`renderErrorRanking`(9444)、`renderAnalyticsTable`(9535)、`exportAnalyticsCsv`(9760)、`loadDateRangePerformance`(9924)、`renderRangePerformance`(10015)、`renderRangeTableOnly`(10152)、`exportRangePerformanceCsv`(10382)
- **密碼與錯誤日誌 Modal**：`openPasswordModal`(10489)、`renderPasswordModal`(10504)、`saveSinglePassword`(10570)、`exportAllCsv`(10607)、`openErrorLogModal`(10642)、`renderErrorLogs`(10682)、`confirmClearErrorLogs`(10735)
- **學生圖表/數據處理**：`processHistoryWithDiffs`(10923)、`renderTableAndCards`(11113)、`updateKpis`(11211)、`updateCharts`(11285)、`updateRadarChart`(11464)、`exportToCsv`(11647)
- **高階分析**：`renderHeatmap`(11665)、`setupHeatmapTooltips`(11931)、`renderWeekdayBars`(11990)、`updateGoalsProgress`(12025)、`openGoalModal`(12207)、`renderForecast`(12321)、`renderFrequencyAnalysis`(12722)、`renderWeaknessAnalysis`(13182)、`renderWordFlowTracking`(13621)
- **列印與匯出**：`openPrintReportModal`(14227)、`renderPrintReportContent`(14336)、`resolveTaskWords`(14790)、`renderSingleTaskCardHtml`(15142)、`renderUntestedTaskCardHtml`(15627)、`buildTaskDetailsHtml`(15737)、`buildFreeDetailsHtml`(15949)、`renderStudentDailyTaskAndFreeSections`(16146)、`renderStudentSummary`(16700)、`_buildStudentExportPayload`(17832)、`_exportStudentRecordToExcel`(18332)、`_exportStudentRecordToPdf`(18641)、`initStudentExportRecordsCard`(18955)
- **單字檢視/成果/排行榜**：`initMasteredChipsComponent`(19519)、`renderMasteredChipsUI`(19572)、`initFixedChipsComponent`(19695)、`renderFixedChipsUI`(19714)、`renderStudentDailyTask`(19808)、`copyStudentDailyReport`(20334)、`exportStudentDailyReportPdf`(20421)、`updateLeaderboardUI`(20685)、`renderPodiumAndTable`(20782)

---

## 三、學生拼字遊戲前端（GitHub Pages 根目錄）
### `index.html`（3,437 行）
- 1–312：HTML 介面與樣式
- 313–3016：`<script type="module">`
  - 321 `updateAccountDisplay` · 392 `applyAppTheme` · 456 `applyAppFontScale` · 623 `purgeAllStudentSessionAndLocalData` · 683 `openStreakFreezeModal`
  - 750–1140 登入驗證、初始化雲端資料與遊戲模組載入
  - 1151 `uploadLocalStorageData`（雲端同步 `saveRecord`）
  - 1413 `loadPickerData` / 1447 `renderPickerGrid` / 1570 `openTeacherModal` / 1591 `initPickerEvents`（教師出題 Modal）
  - 1793 `isTimeWithinDailyAllowed` / 1805 `checkCurfewStatus`（夜間宵禁）
  - 1857 `initDailyUsageTimer` / 1922 `updateDailyUsageTick` / 1996 `applyDailyUsageLockdown` / 2043 `liftDailyUsageLockdown` / 2103 `pollDailyUsageStatus`（每日使用時限鎖定）
  - 2146 `openTimeModal` / 2174 `loadTimeRestrictions` / 2368 `renderStudentRulesList` / 2444 `renderDateRulesList` / 2530 `initTimeManagementEvents` / 2856 `triggerExtendUsageTime` / 2897 `triggerToggleUnlock`（教師時間管理 Modal）
- 3021 `teacherTaskModal` HTML · 3155 `timeManagementModal` HTML

### `css/styles.css`（2,752 行）
- 48 字體調整 · 101 category chips · 115 mode tabs · 127 practice card · 222 tiles · 249 actions · 263 progress · 300 summary panel · 358 熱力圖顏色階層 · 393 指定測驗邊框 · 456 指定測驗特殊狀態 · 506 today's session · 509 level bar · 525 每日結束隱藏區塊 · 572 quiz screen · 614 Date Navigator Bar

### `src/` 模組
- **`src/app.js`**（1,773 行）：35 `scheduleCloudTaskSync` · 45 `persistTaskProgress` · 94 `getSaturdayRemedyRecord` · 163 `getVacationInfo` · 185 `recordSundayRemainingMistakes` · 207 `markWordLearnedInFreePractice` · 269 `getVacationDayAssignedWords` · 296 `recordTaskMistake` · 324 `getMonToFriUnfinishedWords` · 431 `levelInfo` · 441 `refreshChrome` · 508 `renderCurrent` · 543 `isCurfewActive` · 580 `newRound` · 625 `check` · 640 `answer` · 728 `pickLevel` · 784 `startPlacement` · 814 `startChallenge` · 856 `isDesignatedTaskPendingToday` · 933 `checkAndStartDailyTask` · 1162 `showTaskIntroScreen` · 1337 `startTaskExecution` · 1358 `finishTaskMode`
- **`src/store.js`**（1,038 行）：11 `normalizeDateStr` · 47 `getWeekRangeDates` · 64 `getBiweeklyCycleInfo` · 136 `load` · 218 `save` · 226 `grade` · 359 `historyData` · 575 `levelStats` · 625 `stats` · 678 `getDailyPractice` · 742 `summary` · 988 `getPrecomputedSummary`
- **`src/ui.js`**（4,050 行）：核心主畫面、模式作答渲染、結算回饋；底部匯出已拆為 `src/ui_export.js`(1,579L)，常錯小卡已拆為 `src/ui_weak_words.js`(297L)
- **輔助模組**：`src/ui_export.js`(1,579L) · `src/ui_weak_words.js`(297L) · `src/audio.js`(405L) · `src/wordbank.js`(108L) · `src/levels.js`(101L) · `src/data.js`(77L) · `src/diagnostics.js`(55L) · `src/srs.js`(39L) · `src/confetti.js`(8L) · `src/anticheat.js`(6L)
