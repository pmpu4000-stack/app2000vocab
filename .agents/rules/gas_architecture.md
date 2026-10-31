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

## 一、GAS 後端：`google_apps_script/Code.gs`（~5,867 行）
- **Script ID**：`1Y69AjfZvh__eyEr6fEjrl-DADDJ5KRn13yRehlWi2EGUZhO_qUQN6KcT`
- **Web App Deployment ID**：`AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9`

| 行號 | 區段 / 函式 |
|---|---|
| 12–40 | `SYS` 常數、`WORD_LEVELS`(L27)、`getWordLevel`(L29) |
| 41–172 | `calculateSummaryFromAgentData` |
| 176–237 | **0. 密碼雜湊與資安**：`hashPassword`(176)、`isHashedPassword`(185)、`checkLoginAttempts`(193)、`recordLoginFailure`(202)、`clearLoginFailures`(214)、`getStudentClass`(222)、`isAdminTeacher`(229) |
| 238–307 | 日期格式化：`formatStandardDateYMD`(238)、`formatStandardTimeHHmm`(265)、`formatStandardDateTime`(282) |
| 308–483 | 試算表與壓縮：`isSystemSheet`(308)、`getStudentSheet`(315)、`ensureStudentSheetColumns`(333)、`getHeaderIndexMap`(418)、`compressData`(454)、`decompressData`(459)、`sanitizeLogDetails`(473) |
| 484–654 | 錯誤與 **0.1 WAF**：`translateErrorForHuman`(484)、`logError`(542)、`inspectRequestForAttacks`(587) |
| 658–812 | **1. 身分驗證與快取**：`authenticateUser`(658)、`clearOverviewCache`(725)、`getTeacherTasksCached_`(732)、`invalidateTeacherTaskCache_`(767)、`getTaskWordsDictCached_`(776) |
| 816–1246 | **2. 指定單字任務**：`getActiveTaskForClass`(816)、`getWeekendRemediationTask`(957)、`getTeacherTask`(1122)、`saveTeacherTask`(1179) |
| 1253–2269 | **2.5 時間管制 (07:30~22:00)**：`ensureTimeSettingsSheet`(1253)、`checkTimeRestrictionAllowance`(1306)、`getTimeRestrictionRulesCached_`(1355)、`getDailyUsageSettings`(1457)、`getDailyUsageRulesCached_`(1520)、`saveDailyMinutesSetting`(1610)、`extendStudentUsageTime`(1655)、`toggleStudentDailyUnlock`(1717)、`teacherSaveDailyMinutes`(1776)、`teacherExtendUsage`(1793)、`teacherToggleDailyUnlock`(1810)、`getTimeRestrictions`(1827)、`saveGlobalTimeSetting`(1928)、`saveStudentTimeSetting`(1992)、`deleteStudentTimeSetting`(2063)、`saveTimeRestriction`(2094)、`deleteTimeRestriction`(2166)、`quickToggleTodayUnlock`(2200) |
| 2279–2760 | **3. Web API**：`sanitizeStudentRecordsObj_`(2279)、**`doPost(e)`**(2370–2744)、**`doGet(e)`**(2745)、`jsonResponse`(2753) |
| 2764–3067 | **清理與回填**：`cleanupUnusedSheets`(2764)、`syncAndBackfillStudentTaskHistory`(2839)、`syncAllTaskRecords`(3032) |
| 3071–3381 | **4. 儲存歷程**：`handleSaveRecord`(3071) |
| 3385–4104 | **4.1 / 4.2 分析**：`getDailyTaskAnalytics`(3385)、`getDateRangePerformanceAnalytics`(3706) |
| 4108–4438 | **5. 查詢邏輯**：`checkAndGetData`(4108)、`parseScoreAndRate`(4174)、`getStudentTodayTaskResult`(4220)、`getStudentDailyTaskHistory`(4276)、`getTodayTaskMap`(4355) |
| 4442–4745 | **6. 班級總覽與排行榜 (batchGet)**：`getClassOverviewRaw`(4442)、`_getClassOverview`(4545)、`_getStudentData`(4558)、`_getLeaderboard`(4662)、`getStudentLeaderboard`(4730) |
| 4749–4951 | **7. 密碼與目標**：`getStudentPasswords`(4749)、`changeStudentPassword`(4781)、`changeOwnPassword`(4812)、`getErrorLogs`(4840)、`clearErrorLogs`(4858)、`reportClientError`(4869)、`getStudentGoals`(4890)、`saveStudentGoals`(4911) |
| 4955–5867 | **8. 試算表選單與備份**：`auditComplianceData`(4955)、`onOpen`(5097)、`cleanDuplicateStudentRecords`(5146)、`migrateAllPasswordsToHash`(5202)、`generateClassDashboardSheet`(5231)、`cleanupAndOptimizeSpreadsheet`(5411)、`initStudentPasswordSheet`(5651)、`checkInactiveStudentsAlert`(5685)、`setupDailyTriggers`(5726)、`backupSpreadsheetToDrive`(5753)、`exportFullSystemJsonArchive`(5780) |

- **試算表分頁**：
  1. `使用者清單`：A帳號 | B密碼(SHA-256) | C角色 | D班級 | E姓名
  2. `指定單字任務`：A班級 | B任務名稱 | C單字清單 | D測驗模式 | E題數 | F啟用
  3. `每日任務紀錄`：A日期 | B班級 | C學號 | D姓名 | E任務名稱 | F成績 | G正確率 | H今日總作答 | I今日總答對 | J總正確率 | K狀態 | L更新時間
  4. `全班學習總覽`、`時間限制設定`、`錯誤日誌`、各學生專屬歷程表

---

## 二、GAS 查詢系統前端：`google_apps_script/Index.html`（~21,083 行，鏡像 `teacher_history.html`）
### CSS 樣式區塊行號（16–4535）
- 33 色彩變數(淺色) · 39 Progress Bar色彩 · 68 深色色彩變數 · 162 主控制卡片 · 225 輸入框 · 248 日曆圖示 · 334 快捷日期 · 338 KPI卡片 · 394 Toast · 410 差分標籤 · 434 教師班級表格 · 446 教師總覽樣式 · 474 空狀態 · 486 教師手機卡片 · 510 Spinner · 520 密碼Modal · 550 錯誤日誌Modal · 617 學習活動熱力圖(626統計/635框/654Tooltip/664星期分佈) · 670 學習目標與里程碑(733設定Modal) · 760 班內排名與榮譽榜(864橫幅/893頒獎台)

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
- **`src/ui.js`**（4,961 行）：74 `setScreen` · 108 `renderRound` · 234 `renderListen` · 246 `renderPick` · 271 `renderTrap` · 327 `renderScramble` · 446 `showResult` · 545 `renderProgress` · 670 `getCombinedTaskHistory` · 1049 `resolveTaskWords` · 1271 `renderSingleTaskCardHtml` · 1783 `renderUntestedTaskCardHtml` · 1885 `buildTaskDetailsHtml` · 2093 `buildFreeDetailsHtml` · 2324 `resolveDailyPracticeRecord` · 2445 `getWeekPendingConquerWords` · 2636 `buildWeekPendingConquerHtml` · 2844 `renderSummary` · 3588 底部紀錄匯出模組（3685 `_buildExportPayload` / 4100 `_exportRecordToExcel` / 4443 `_exportRecordToPdf` / 4673 `initExportRecordsCard`） · 4909 `initProgressCard` · 4932 `initConquerCard`
- **輔助模組**：`src/audio.js`(405L) · `src/wordbank.js`(108L) · `src/levels.js`(101L) · `src/data.js`(77L) · `src/diagnostics.js`(55L) · `src/srs.js`(39L) · `src/confetti.js`(8L) · `src/anticheat.js`(6L)
