---
trigger: model_decision
description: 修改或查詢 google_apps_script/（Code.gs、Index.html、teacher_history.html）或前端拼字遊戲（index.html、src/*.js、css/styles.css）時讀取：全專案檔案與函式行號索引。
---
# 全專案架構與行號索引 (app2000vocab-repo)

## ⚡ 極致省 Token 守則（必讀）
1. **零探勘**：本檔已含全專案行號索引，**直接依下方行號用 `read_file`（StartLine/EndLine 範圍 ≤120 行）讀取目標函式**；除非行號漂移找不到，否則禁止跑 `Select-String`。
2. **禁讀巨檔/巨行**：
   - 禁讀 `data/meanings.json`（2MB）、`data/words2000.json`（65KB）。
   - `google_apps_script/Index.html`（與根目錄鏡像 `teacher_history.html`）的 **第 8080–8090 行**含 50KB 單行單字庫，讀取範圍絕對不可跨過該區。
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
- **CSS**：16–4535
- **HTML Body**（4537–6779）：`login-overlay`(4539) · `mainControlCard`(4595: `loginSection` 4610 / `querySection` 4613) · `teacherBackBar`(4648) · `teacherOverviewCard`(4660: `teacherOverviewMainView` 4695 / `teacherAnalyticsView` 4850 / `teacherRangePerformanceView` 4978 / `teacherTimeSettingsView` 5107) · 學生卡片：`studentSummaryCard`(5330) / `studentProgressCard`(5332) / `studentLearningRecordCard`(5362) / `export-records-section`(5483) / `kpiSection`(5545) / `studentDailyTaskCard`(5559) / `studentFreePracticeCard`(5707) / `rankingCard`(5819) / `goalsCard`(5919) / `forecastCard`(6014) / `frequencyCard`(6077) / `weaknessCard`(6174) / `wordFlowCard`(6286) / `heatmapCard`(6382) / `chartCard`(6456) / `resultCard`(6548) · Modals：`taskModal`(6579) / `passwordModal`(6738) / `errorLogModal`(6754)
- **JS 區段**（6780–20925）：
  - 6782 狀態變數 · 6832 CSV 防護 · 6844 初始化 · 6882 主題 · 6963 字體縮放 · 7003 Toast/Loading · 7031 登入 · 7045 登出/返回
  - 7108 資料抓取 (`checkAndGetData`) · 7206 教師班級總覽 · 8024 清理分頁 · 8051 密碼 Modal
  - **8067 2000 單字庫內嵌（⚠️ L8083-8086 含 50KB 巨行，勿讀）**
  - 8072 指定測驗出題 Modal · 8528 教師成果與錯題分析 · 8581 教師時間管制設定 · 9804 日期區間比較表 · 10589 匯出班級 CSV · 10622 錯誤日誌 Modal
  - 10790 學生視圖顯隱 · 10845 篩選控制 · 10882 KPI 動畫 · 10905 差分與解析 · 11057 篩選與渲染 · 11193 KPI 更新 · 11267 Chart.js 圖表 · 11446 雷達圖 · 11629 學生 CSV
  - 11647 熱力圖 · 11999 學習目標 · 12303 曲線預測 · 12704 練習頻率 · 13164 弱點診斷 · 13603 單字流轉 · 14010 工具函式 · 14079 圖表下載 · 14207 報告列印 · 14737 正確率格式化
  - 14769 單字測驗與自由練習按日期查詢 · 17569 底部紀錄匯出 (PDF/Excel：18315 Sheet1 聯絡簿 / 18462 Sheet2 總進度 / 18534 Sheet3 待攻克) · 19327 精通與訂正單字檢視器 · 19767 每日任務成果渲染 · 20302 LINE 親師快報 · 20389 任務報告列印/PDF · 20653 班內排行榜

---

## 三、學生拼字遊戲前端（GitHub Pages 根目錄）
### `index.html`（3,437 行）
- 1–312：HTML 介面与樣式（含登入、遊戲畫面、摘要）
- 313–3016：內嵌 `<script type="module">`
  - 321 `updateAccountDisplay` · 392 `applyAppTheme` · 456 `applyAppFontScale` · 623 `purgeAllStudentSessionAndLocalData` · 683 `openStreakFreezeModal`
  - 750–1140 登入驗證、初始化雲端資料與遊戲模組載入
  - 1151 `uploadLocalStorageData`（雲端同步 `saveRecord`）
  - 1413 `loadPickerData` / 1447 `renderPickerGrid` / 1570 `openTeacherModal` / 1591 `initPickerEvents`（教師出題 Modal）
  - 1793 `isTimeWithinDailyAllowed` / 1805 `checkCurfewStatus`（夜間宵禁）
  - 1857 `initDailyUsageTimer` / 1922 `updateDailyUsageTick` / 1996 `applyDailyUsageLockdown` / 2043 `liftDailyUsageLockdown` / 2103 `pollDailyUsageStatus`（每日使用時限鎖定）
  - 2146 `openTimeModal` / 2174 `loadTimeRestrictions` / 2368 `renderStudentRulesList` / 2444 `renderDateRulesList` / 2530 `initTimeManagementEvents` / 2856 `triggerExtendUsageTime` / 2897 `triggerToggleUnlock`（教師時間管理 Modal）
- 3021 `teacherTaskModal` HTML · 3155 `timeManagementModal` HTML

### `src/` 模組
- **`src/app.js`**（1,773 行，核心控制器）：35 `scheduleCloudTaskSync` · 45 `persistTaskProgress` · 94 `getSaturdayRemedyRecord` · 163 `getVacationInfo` · 185 `recordSundayRemainingMistakes` · 207 `markWordLearnedInFreePractice` · 269 `getVacationDayAssignedWords` · 296 `recordTaskMistake` · 324 `getMonToFriUnfinishedWords` · 431 `levelInfo` · 441 `refreshChrome` · 508 `renderCurrent` · 543 `isCurfewActive` · 580 `newRound` · 625 `check` · 640 `answer` · 728 `pickLevel` · 784 `startPlacement` · 814 `startChallenge` · 856 `isDesignatedTaskPendingToday` · 933 `checkAndStartDailyTask` · 1162 `showTaskIntroScreen` · 1337 `startTaskExecution` · 1358 `finishTaskMode`
- **`src/store.js`**（1,038 行，LocalStorage 與 SRS 狀態）：11 `normalizeDateStr` · 47 `getWeekRangeDates` · 64 `getBiweeklyCycleInfo` · 136 `load` · 218 `save` · 226 `grade` · 359 `historyData` · 575 `levelStats` · 625 `stats` · 678 `getDailyPractice` · 742 `summary` · 988 `getPrecomputedSummary`
- **`src/ui.js`**（4,961 行，DOM 渲染與匯出）：74 `setScreen` · 108 `renderRound` · 234 `renderListen` · 246 `renderPick` · 271 `renderTrap` · 327 `renderScramble` · 446 `showResult` · 545 `renderProgress` · 670 `getCombinedTaskHistory` · 1049 `resolveTaskWords` · 1271 `renderSingleTaskCardHtml` · 1783 `renderUntestedTaskCardHtml` · 1885 `buildTaskDetailsHtml` · 2093 `buildFreeDetailsHtml` · 2324 `resolveDailyPracticeRecord` · 2445 `getWeekPendingConquerWords` · 2636 `buildWeekPendingConquerHtml` · 2844 `renderSummary` · 3588 底部紀錄匯出模組（3685 `_buildExportPayload` / 4100 `_exportRecordToExcel` / 4443 `_exportRecordToPdf` / 4673 `initExportRecordsCard`） · 4909 `initProgressCard` · 4932 `initConquerCard`
- **小型模組**：`css/styles.css`(114KB) · `src/audio.js`(405L 發音) · `src/wordbank.js`(108L 題庫載入) · `src/levels.js`(101L 關卡與干擾項) · `src/data.js`(77L) · `src/diagnostics.js`(55L) · `src/srs.js`(39L) · `src/confetti.js`(8L) · `src/anticheat.js`(6L)
