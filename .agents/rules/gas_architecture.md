---
trigger: model_decision
description: 修改或查詢 google_apps_script/（Code.gs、Index.html）或 GAS 專案 1Y69Ajf… 時讀取：檔案架構、區段行號、doPost action、工作表欄位。
---
# GAS 專案架構記憶 (學生學習歷程查詢系統)

## ⚡ 省 Token 守則（必讀）
- **本檔已是架構索引，勿再重新探勘全檔**；直接依區段名稱定位。
- **禁止整檔讀取** `Index.html`（~1.09 MB）/ `Code.gs`（~255 KB）。先 `Select-String -Pattern '<函式名或區段註解>'` 取得行號，再用 `read_file` 讀 ±50~150 行。
- **避開單字庫巨行**：`Index.html` 中「`// 2000 單字庫資料 (內嵌加速)`」下方約 15 行處有一行約 50,000 字元的單行資料，讀取範圍不可包含該行。
- 本機 repo 即工作副本，**不要另外 clasp pull 到暫存資料夾**；需要對齊雲端時才在 repo 內 `clasp.cmd pull`。
- 驗證修改用 `Select-String` 抽查或 `git diff --stat`，不要回讀整段。

- **Script ID**：`1Y69AjfZvh__eyEr6fEjrl-DADDJ5KRn13yRehlWi2EGUZhO_qUQN6KcT`
- **編輯器**：https://script.google.com/u/0/home/projects/1Y69AjfZvh__eyEr6fEjrl-DADDJ5KRn13yRehlWi2EGUZhO_qUQN6KcT/edit
- **本機對應**：`app2000vocab-repo/google_apps_script/`（`Code.gs`、`Index.html`、`appsscript.json`），`.clasp.json` rootDir=`./google_apps_script`
- **同步**：PowerShell 需用 `clasp.cmd`（`clasp.ps1` 被執行原則擋下）。`clasp.cmd pull` / `clasp.cmd push`；雲端檔名為 `Code.js`（本機為 `Code.gs`）。
- **Runtime**：V8、時區 Asia/Taipei、Web App `executeAs: USER_DEPLOYING`、`access: ANYONE_ANONYMOUS`。

## 檔案組成（2026-10-22 快照）
| 檔案 | 規模 | 角色 |
|---|---|---|
| `Code.gs` | ~5,870 行 | 後端：Sheets 資料存取、驗證、API |
| `Index.html` | ~21,050 行（~1.09 MB） | 單檔前端：CSS(16–4535) + HTML body(4537–6779) + JS(6780–20925) |
| `appsscript.json` | 10 行 | Manifest |

## Code.gs 區段
| 行 | 區段 | 重點函式 |
|---|---|---|
| 1–170 | 檔頭 / 常數 | `SYS`（快取 TTL、登入鎖定 5 次/600s、`SYSTEM_SHEETS`、備份資料夾）、`WORD_LEVELS`（2055 字等級字串）、`getWordLevel`、`calculateSummaryFromAgentData` |
| 173 | 0. 密碼雜湊與資安 | `hashPassword`(SHA-256)、登入失敗鎖定、`getStudentClass`、`isAdminTeacher`、日期格式化、`getStudentSheet`、`ensureStudentSheetColumns`、`compressData`/`decompressData`、`logError` |
| 581 | 0.1 WAF | `inspectRequestForAttacks` |
| 655 | 1. 共用身分驗證 | `authenticateUser`、`clearOverviewCache`、`getTeacherTasksCached_`、`getTaskWordsDictCached_` |
| 813 | 2. 老師指定單字任務 | `getActiveTaskForClass`、`getWeekendRemediationTask`、`getTeacherTask`、`saveTeacherTask` |
| 1247 | 2.5 使用時間管制 (07:30~22:00) | `checkTimeRestrictionAllowance`、`getDailyUsageSettings`、`getTimeRestrictions`、`save/deleteTimeRestriction`、`saveGlobal/StudentTimeSetting`、`quickToggleTodayUnlock`、`teacherExtendUsage` 等 |
| 2270 | 3. Web API | `sanitizeStudentRecordsObj_`、**`doPost(e)`**（action 路由）、**`doGet(e)`**（回傳 `Index`）、`jsonResponse` |
| 2761 | 7. 清理分頁 | `cleanupUnusedSheets`、`syncAndBackfillStudentTaskHistory`、`syncAllTaskRecords` |
| 3068 | 4. 儲存歷程 | `handleSaveRecord`（寫入每日任務紀錄） |
| 3382 | 4.1 大數據分析 | `getDailyTaskAnalytics` |
| 3703 | 4-2 區間比較 | `getDateRangePerformanceAnalytics` |
| 4105 | 5. 查詢 | **`checkAndGetData`**、`parseScoreAndRate`、`getStudentTodayTaskResult`、`getStudentDailyTaskHistory`、`getTodayTaskMap` |
| 4439 | 6. 班級總覽 (Sheets API batchGet) | `getClassOverviewRaw`、`_getClassOverview`、`_getStudentData`、`_getLeaderboard`、`getStudentLeaderboard` |
| 4746 | 7. 密碼與目標 | `getStudentPasswords`、`changeStudentPassword`、`changeOwnPassword`、`getErrorLogs`、`clearErrorLogs`、`reportClientError`、`DEFAULT_GOALS`、`get/saveStudentGoals` |
| 4952 | 8. 試算表選單與自動化 | `auditComplianceData`、`onOpen`(選單)、`generateClassDashboardSheet`、`cleanupAndOptimizeSpreadsheet`、`migrateAllPasswordsToHash`、`setupDailyTriggers`/`removeAllTriggers`、`backupSpreadsheetToDrive`、`exportFullSystemJsonArchive` |

### doPost action 路由（外部 App 呼叫，JSON）
`login`, `saveRecord`, `getTeacherTask`, `saveTeacherTask`, `getDailyTaskAnalytics`, `getDateRangePerformanceAnalytics`, `getTimeRestrictions`, `saveGlobalTimeSetting`, `saveStudentTimeSetting`, `deleteStudentTimeSetting`, `saveTimeRestriction`, `deleteTimeRestriction`, `quickToggleTodayUnlock`, `getDailyUsageSettings`, `saveDailyMinutesSetting`, `extendStudentUsageTime`, `toggleStudentDailyUnlock`, `cleanupUnusedSheets`, `migrateToVocabBased`, `syncAllTaskRecords`, `auditComplianceCheck`

### Index.html 使用的 google.script.run
`checkAndGetData`, `saveTeacherTask`, `getDailyTaskAnalytics`, `getDateRangePerformanceAnalytics`, `getTimeRestrictions`, `getStudentLeaderboard`, `getStudentGoals`, `saveStudentGoals`, `getStudentPasswords`, `changeStudentPassword`, `getErrorLogs`, `clearErrorLogs`, `cleanupUnusedSheets`, `reportClientError`

## 試算表工作表
- `使用者清單`：A 帳號 | B 密碼(SHA-256) | C 角色 | D 班級 | E 姓名
- `指定單字任務`：A 班級 | B 任務名稱 | C 單字清單 | D 測驗模式 | E 題數 | F 啟用
- `每日任務紀錄`：A 日期 | B 班級 | C 學號 | D 姓名 | E 任務名稱 | F 成績 | G 正確率 | H 今日總作答 | I 今日總答對 | J 總正確率 | K 狀態 | L 更新時間
- `全班學習總覽`、`時間限制設定`、`錯誤日誌`、系統目標設定、**每位學生一張專屬歷程表**

## Index.html 結構
- **Head**：CDN `chart.js`、`xlsx@0.18.5`、`html2pdf.js 0.10.1`；巨大 `<style>`（16–4535）
- **Body 主要區塊**：`login-overlay` → `mainControlCard`(`loginSection`/`querySection`) → 教師：`teacherBackBar`、`teacherOverviewCard`（`teacherOverviewMainView` / `teacherAnalyticsView` / `teacherRangePerformanceView` / `teacherTimeSettingsView`）→ 學生：`studentSummaryCard`、`studentProgressCard`、`studentLearningRecordCard`、`export-records-section`、`kpiSection`、`studentDailyTaskCard`、`studentFreePracticeCard`、`rankingCard`、`goalsCard`、`forecastCard`、`frequencyCard`、`weaknessCard`、`wordFlowCard`、`heatmapCard`、`chartCard`、`resultCard` → Modals：`taskModal`、`passwordModal`、`errorLogModal`
- **JS 模組（約略起始行）**：狀態變數 6782 · 初始化 6844 · 主題/字體 6882 · 登入登出 7031 · 資料抓取 7108 · 教師班級總覽 7206 · 2000 單字庫內嵌 8067 · 指定測驗 Modal 8072 · 教師分析 8528 · 時間管制 8581 · 區間比較 9804 · 錯誤日誌 10622 · 篩選/渲染/KPI/Chart 10845–11446 · 熱力圖 11647 · 目標 11999 · 預測 12303 · 頻率 12704 · 弱點 13164 · 單字流轉 13603 · 工具函式 14010 · 圖表下載 14079 · 列印報告 14207 · 按日期查詢 14769 · 紀錄匯出 PDF/Excel 17569 · 精通單字檢視器 19327 · 每日任務成果 19767 · 親師快報 20302 · 任務報告列印 20389 · 排行榜 20653

## 修改慣例
- 先 `clasp.cmd pull` 對齊雲端，再改 `google_apps_script/` 內檔案，`clasp.cmd push` 後 git commit/push。
- 行號會隨修改漂移，以區段註解（`// ═══` 分隔線）定位。
- 回報時附上使用者手動貼上 GAS 的最簡步驟（需重新部署 Web App 版本才會生效）。
