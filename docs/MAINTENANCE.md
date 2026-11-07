# 專案維護與交接完全指南 (Maintenance & Handover Manual)

本指南旨在讓下一位接手維護的工程師或教師，能在 5 分鐘內快速理解專案架構、本地開發、自動化測試與一鍵部署流程。

---

## 1. 系統架構全貌 (Architecture Overview)

本專案為「國中 2000 單字學習與學生歷程管理系統」，由兩大核心部分組成：
1. **前端 (學生端 & 家長端)**：純原生 ES Modules (Vanilla JS)，託管於 GitHub Pages。無任何 Webpack/Vite 打包負擔，開箱即用。
2. **後端 (API & 教師端管理後台)**：Google Apps Script (GAS) Web App，以 Google Sheets 作為試算表資料庫。

```text
[學生 / 家長瀏覽器] (GitHub Pages: index.html)
        │
        ├── 離線 / 暫存 ──> LocalStorage / CacheStorage
        │
        └── 雲端同步 (POST / GET) ──> [Google Apps Script (Code.gs)]
                                              │
                                              ▼
                                     [Google Sheets 雲端試算表]
                                              ▲
                                              │ 讀寫 / 批次彙整
[教師管理後台] (GAS Web App: Index.html) ───────┘
```

---

## 2. 模組職責目錄 (Codebase Map)

### 學生端核心 (`src/`)
| 檔案 | 核心職責 | 重要維護注意事項 |
| :--- | :--- | :--- |
| `src/app.js` | 遊戲主控制器、測驗輪迴、題型調度 | 監聽答題、時間限制與指定任務狀態 |
| `src/wordbank.js` | 2,055 單字庫載入與索引化 | 內建 `_byLevel`、`_byWord`、`_byId` 高速 $O(1)$ 查找 Map |
| `src/store.js` | 單一事實來源 (Single Source of Truth) | 管理 Leitner 箱子、答題統計、Local 資料清理與快取 |
| `src/srs.js` | 間隔重複排程 (SRS Leitner) | 1/3/7 天加權計算與抽題輪盤演算法 |
| `src/auth.js` / `auth_sync.js` | 認證守衛、角色分流、離線佇列 | SHA-256 密碼防護、Token 驗證、避免明文寫入 |
| `src/remedy_service.js` | 週末錯題補救與寒暑假平日補強機制 | 週六週日錯題排程、自由練習消滅錯題聯動 |
| `src/ui.js` / `ui_summary.js` | UI 介面、熱力圖 (Heatmap)、歷史足跡 | 熱力圖已實作指標切換 $O(1)$ 高速渲染 |
| `src/audio.js` | 雙引擎發音 (MP3 音檔 + Web Speech TTS) | 具備音量平滑壓縮器與 Idle 週期快取清理 |
| `src/levels.js` | 5 大難度分級、晉級門檻 | 80% 晉級挑戰門檻、每級單字分佈定義 |

### 後端與教師端 (`google_apps_script/`)
| 檔案 | 核心職責 | 重要維護注意事項 |
| :--- | :--- | :--- |
| `Code.gs` | GAS 主進入點 (`doGet`, `doPost`) | API 端點、學生資料讀寫、WAF 防護牆 |
| `AuthService.js` | 教師/學生身份驗證、Token 簽章 | 暴力破解鎖定、密碼雜湊比對、班級權限驗證 |
| `SpreadsheetService.js` | 試算表底層讀寫、歷程總庫維護 | 批次讀寫 (BatchGet)、舊表回填至中央總庫 |
| `TaskService.js` | 每日任務指派與查詢 | 派題範圍校驗、學生個人自訂題庫指派 |
| `TimeRestriction.js` | 使用時段與練習時長限制 | 每日使用上限 (預設 25 分鐘)、特定時段鎖定 |
| `Index.html` | 教師後台 SPA 主畫面 | 鏡像對應根目錄 `teacher_history.html` |

---

## 3. 開發、測試與一鍵部署 (Dev, Test & Deploy)

本專案已完全實現**單一自動化指令鏈**，嚴禁手動分別複製上傳：

### 步驟 1：本機預覽
```bash
# 在專案根目錄啟動任何靜態伺服器
python -m http.server 8000
# 瀏覽器開啟 http://localhost:8000
```

### 步驟 2：執行自動化單元測試
```bash
npm test
# 或執行：node --test tests/core.test.mjs
```
測試涵蓋 levels 分級、store 日期正規化、srs 抽題、remedy 錯題消除、ui_summary 足跡、GAS 雲端資料過濾、XSS/SHA-256 安全守衛。

### 步驟 3：一鍵同步與全面部署
```bash
node deploy.js "你的更新說明"
```
**`deploy.js` 會自動依序執行以下 5 件事：**
1. 跑完 `tests/core.test.mjs` 確保 0 測試回歸。
2. 同步 `src/teacher_portal.js` 至 `google_apps_script/TeacherJs.html`。
3. 產生帶有最新時間戳記的 Cache Busting 版本號（`?v=YYYYMMDDHHMM`），自動更新 `index.html` 與 Service Worker 快取。
4. 自動覆蓋鏡像檔案：`google_apps_script/Index.html` 必自動覆蓋 `teacher_history.html`。
5. 透過 `clasp push` 與 `clasp deploy` 自動部署最新版 GAS Web App，最後自動 `git commit` 並 `git push` 到 GitHub。

---

## 4. 關鍵設計原則 (Golden Rules for Successors)

1. **單一資料流**：學生端進度以 `src/store.js` 為唯一權威；修改欄位需同步檢查 `Code.gs` 的 30 欄對應關係。
2. **資安規範**：
   - 任何使用者輸入字串渲染至 HTML 時，必經 `escapeHtml()`。
   - 密碼在瀏覽器即時雜湊成 SHA-256，離線快取佇列絕對不存明文。
   - 教師端 API 必驗證 `token` 與 `isTeacherAllowedForClass`，禁止跨班級越權存取。
3. **效能規範**：
   - 避免在大迴圈中使用 `Object.keys()`、`Array.find()` 或重複建立 `new Date()`。
   - 熱力圖等高頻 DOM 互動使用指標暫存與 Class 切換，嚴禁全量重繪。
4. **雙向鏡像檔案保護**：
   - 若編輯 `Index.html` 或 `teacher_history.html`，部署時 `deploy.js` 會以 `Index.html` 為準並覆蓋 `teacher_history.html`。請保持這項自動化規範。
