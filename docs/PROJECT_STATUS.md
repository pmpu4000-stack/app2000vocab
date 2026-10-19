# 2000 單字學習系統 (app2000vocab) 專案狀態快照

## 1. 核心環境與目錄
* **主開發目錄**：`C:\Users\pmpu4\.gemini\antigravity\scratch\app2000vocab`
* **備份倉庫**：`C:\Users\pmpu4\.gemini\antigravity\scratch\app2000vocab-repo`
* **部署作業目錄**：`C:\Users\pmpu4\Desktop\0906`
* **GitHub 遠端**：`https://github.com/pmpu4000-stack/app2000vocab.git` (main 分支)
* **GAS 部署版本**：**Version 220** (Deployment ID: `AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9`)

## 2. 系統全面優化、全模組效能大健檢與演算法改寫 (v4.4 / Version 220)
* **全模組演算法大健檢與 $O(1)$ 高效能改寫（Version 220）**：
  - **`src/wordbank.js` 預建 $O(1)$ 索引表**：載入 2,055 個單字時單次預建 `_byLevel`（Level 1~5 分組陣列）、`_byWord`（`Map` 小寫單字映射）、`_byId`（`Map` ID 映射），使 `wordsAtLevel()` 與單字查找由每次線性掃描 2,055 筆降至 $O(1)$ 零延遲，並修正 `index.html` 與 `app.js` 模組快取版本號一致，避免重複解析兩份字庫。
  - **`src/srs.js` 零配置輪盤賭加權抽題（Roulette Wheel Selection）**：移除每題重新 `.filter()` 2,055 字與配置 ~2,000 個元素的 `bag` 陣列，改為直接讀取 `_byLevel` 並以累積權重單次抽樣，達成 $O(1)$ 記憶體零垃圾回收（Zero GC Allocation）。
  - **`src/store.js` 單次迴圈與預建日期索引**：將 `summary(words)` 原本對 2,055 字重複掃描 20+ 次（逾 41,000 次迭代）整合為**單一迴圈（Single-Pass）**一次算完精通、曾錯修復、5 大等級、分類與累積練習單字；`historyData()` 與 `summary()` 將 `student_task_history` 預建為 `Map(normDate -> record)` 並快取 `getDayStat`，消除 60+ 次線性 `.find()`。
  - **`src/ui.js` 消除 100+ 次重複 `localStorage` JSON 解析、DOM 快取與潛在 Bug 修復**：
    1. 為 `resolveDailyPracticeRecord` 與 `_getCachedRawStudentTaskHistory` 加入記憶體快取，並在 `renderSummary` 預建 `taskByDateMap` 與 `taskDayStatCache`，使展開學習足跡、切換日期與滑鼠滑過 28 天熱力圖皆為 $O(1)$ 瞬間反應。
    2. 快取頁首與進度條 17 個 DOM 節點（`#s-user`、`#s-score`、`#b-learn` 等），每題作答結束直接更新文字與寬度，不再重複執行 17 次 `querySelector`。
    3. 移除單字膠囊（`.word-pill-tag`）上數百個重複內嵌 `onclick` 字串，統一由外層 `el.summary.onclick` 事件委派（Event Delegation）處理發音，大幅減輕 HTML 字串與 DOM 解析負擔。
    4. 修復 `renderUntestedTaskCardHtml` 未解構參數（`selectedDate`、`taskName`、`assignedWords`、`hasLoggedInOrFree`）與誤呼叫 `resolveWord` 的潛在 ReferenceError Bug，並將 `isWeekend` 提升至模組頂層。
  - **`src/confetti.js` 釋放閒置全螢幕 Canvas 顯示記憶體**：因灑花特效已停用，移除無用的全螢幕 `<canvas>` 尺寸配置與 `resize` 監聽器，直接釋放 ~8 MB GPU 畫布緩衝區。
  - **`teacher_history.html` / `google_apps_script/Index.html` 熱力圖預建索引與快取**：在 `renderStudentSummary` 預建 `dthTaskMap`、`dthAllMap`、`respDataTaskMap` 並快取 `getTaskDayStatForHeat` / `getDayStatForHeat`，切換學生與滑動熱力圖零卡頓。
* **HTML/CSS 結構大瘦身（減少 119 KB / -43%）**：
  - 徹底清除 `index.html` 中重複嵌錄之 2,350 行 `<style id="embedded-vocab-tutor-theme">` 內嵌樣式，將所有最新 CSS 規則完整同步回 `css/styles.css`。
  - `index.html` 體積由 273.8 KB 銳減至 154.7 KB，大幅加速行動裝置載入速度與消除瀏覽器重複解析雙倍 CSS 之卡頓。
* **靜態核心資產 JSON 壓縮（減少 569 KB / -23%）**：
  - `data/meanings.json` 進行安全無損 Minify 壓縮（由 2,369 KB 降至 1,814 KB，淨減 554 KB）。
  - `data/words2000.json` 進行安全無損 Minify 壓縮（由 79.5 KB 降至 65.2 KB，淨減 14.3 KB）。
  - 全體資料庫驗證 100% 通過（2,055 個單字零遺漏），大幅減輕學生在校園 Wi-Fi 環境之頻寬負載與記憶體解析開銷。
* **總體瘦身成效**：專案靜態傳輸體積直接減少 **688 KB (逾 0.68 MB)**。
* **資安後門徹底拔除**：徹底清除 GAS 後端 `Code.gs` 中所有未經身分驗證之除錯與測試端點（`inspectSpreadsheetSchema`, `setupTestAccountDRecords`, `getTaskWordsDict` 等死碼全數移除）。
* **共用電腦防污染保證**：實作 `purgeAllStudentSessionAndLocalData()`，登出即刻清除記憶體與 LocalStorage，並在下一位學生登入寫入新紀錄前強制清空前手殘留，杜絕紀錄交叉污染。
* **無障礙 (WCAG 2.1 AA) 全鍵盤與螢幕報讀**：熱力圖各日期方格補齊 `role="button"`、`tabindex="0"`、`aria-label` 完整資訊，並支援 `Enter` / `Space` 鍵切換選取及鍵盤 `focus` / `blur` 報讀。
* **行動端（手機/平板）響應式觸控優化**：窄螢幕（$\le 540\text{px}$）自動轉為 7 欄週曆佈局（4 週 $\times$ 7 天），方格觸控目標放大至 36~40px，按鈕膠囊內距擴大防誤觸。

## 3. 資料庫架構 (Google Sheet 30 欄架構) 與熱力圖同步機制
* **學生工作表**：每位學生獨立分頁 (如 `d`)，具備完整 30 欄分離架構：
  - Col 1~21：基礎備份時間、JSON、等級、累積總受測/答對 (加總區域)
  - Col 22~26：【指定單字測驗專屬欄位】(任務名稱、成績、正確率、狀態、錯題單字)
  - Col 27~30：【自由練習專屬欄位】(自由受測字數、自由答對字數、正確率、自由練習錯題單字)
* **零幽靈數值保證**：指定測驗與自由練習數值各自獨立，查詢日期區塊之上則呈現全域累計加總。
* **熱力圖雙軌全面聯動與正確率三階純綠色階規範**：
  - 🟢 **指定測驗與自由練習熱力圖（全面統一純綠色階，依「正確率」劃分）**：
    - ⚪ **無紀錄 / 未指派 (.hc)**：清爽淺灰白 (`#F1F5F9`)，深色模式為深藍灰 (`#1E293B`)；右側顯示「⚪ 無練習紀錄 / 未指派測驗」。
    - 🟩 **正確率 $< 60\%$（低階 / h1）**：【使用者指定確認】
      - **深色模式**：深墨翠綠底 `#14532D`，邊框 `#16A34A`，選中高光外框 `#34D399`。
      - **淺色模式**：最淡嫩綠底 `#DCFCE7`，邊框 `#BBF7D0`。
      - 右側標籤方塊：`.tier-green-low`。
    - 🟩 **$60\% \le \text{正確率} < 70\%$（h2）**：
      - **深色模式**：墨綠底 `#156D38`，邊框 `#16853F`。
      - **淺色模式**：粉草綠底 `#BBF7D0`，邊框 `#86EFAC`。
      - 右側標籤方塊：`.tier-green-mid`。
    - 🟩 **$70\% \le \text{正確率} < 80\%$（h3）**：
      - **深色模式**：深翠綠底 `#15803D`，邊框 `#16A34A`。
      - **淺色模式**：明草綠底 `#86EFAC`，邊框 `#4ADE80`。
      - 右側標籤方塊：`.tier-green-mid`。
    - 🟩 **$80\% \le \text{正確率} < 90\%$（h4）**：
      - **深色模式**：亮翡翠綠底 `#169443`，邊框 `#22C55E`。
      - **淺色模式**：翡翠綠底 `#4ADE80`，邊框 `#22C55E`。
      - 右側標籤方塊：`.tier-green-high`。
    - 🟩 **$90\% \le \text{正確率} < 100\%$（h5）**：
      - **深色模式**：鮮明翡翠綠底 `#16A34A`，邊框 `#4ADE80`。
      - **淺色模式**：飽和翠綠底 `#22C55E`，邊框 `#16A34A`。
      - 右側標籤方塊：`.tier-green-high`。
    - 🟩 **滿分 $100\%$（最高精通 / h6）**：【使用者指定確認】
      - **深色模式**：明亮翠綠底 `#22C55E`，淺綠高光立體邊框 `1.5px solid #86EFAC`，方格自帶立體微光外暈 `box-shadow: 0 0 10px rgba(52,211,153,.75), 0 0 4px rgba(134,239,172,.9)`，點擊選中高光外框 `#34D399`。
      - **淺色模式**：深邃祖母綠底 `#15803D`，邊框 `1.5px solid #14532D`，微光外暈 `box-shadow: 0 0 8px rgba(22,163,74,.55), 0 2px 5px rgba(21,128,61,.4)`。
      - 右側標籤方塊：`.tier-green-perfect`（強化版榮耀綠光專屬微光框框，深色模式自帶 `box-shadow: 0 0 18px rgba(52,211,153,.7)` 與內圈柔光）。
  - 🎨 **指定測驗 3 大特殊狀態方格**（自由練習僅判斷有無紀錄，不出現特殊狀態）：
    - 🟡 **登入未受測**：亮金黃色方格 (`.h-status-yellow` `#FDE047` / 深色 `#CA8A04`)，右側框框為柔黃底金黃框與「🟡 登入未受測」。
    - 🔴 **缺席未受測**：純警戒紅方格 (`.h-status-red` `#EF4444` / 深色 `#DC2626`)，右側框框為粉紅底紅框與「🔴 缺席未受測」。
    - 🟣 **登入作答未完成**：莫蘭迪柔紫方格 (`.h-status-purple` `#C084FC` / 深色 `#7E22CE`)，右側框框為淡紫底亮紫框與「🟣 登入作答未完成」，徹底與綠色脫鉤、零混淆！
  - 💡 **圖例 (Legend)**：下方完整標註正確率六階深淺綠色（<60% · 60%~69% · 70%~79% · 80%~89% · 90%~99% · 100%；灰色：無紀錄）。
* **卡片優化與單字清單 2 欄並列（與自由練習成果完全對齊）**：
  - 計分網格寬度：「答對單字數 / 施測單字數」與「📊 正確率」採用 `repeat(2, 1fr)` 各佔 50% 平分螢幕寬度。
  - 指定單字成果與自由練習成果維持一致的 2 欄並列版面（`.word-split-grid.grid-2`）：
    - **已受測**：左欄為「✅ 答對的單字」、右欄為「❌ 答錯的單字」。
    - **未受測**：左欄為「📋 本次應測單字範圍 (X 字)」、右欄為「💡 補考與學習提醒」（含快速補考按鈕）。
  - 指定測驗與自由練習單字容器均設置固定高度 `height: 170px` (min/max 均為 170px) 與細軸滾動條：不論當日答對或答錯單字多寡，方塊高度皆恆定一致且左右平衡，最多完整顯示 4 行單字，超過 4 行（第 5 行起）上下平滑滑動瀏覽。
  - **成果方塊全情境恆定顯示與 340px 鎖定 (含窄螢幕自適應)**：
    - **不論有無紀錄皆完整顯示成果方塊**：指定測驗與自由練習無論當日有無紀錄，一律呈現完整的「標題列 + 成績雙格 (答對數/施測數、正確率) + 雙欄單字盒 (✅ 答對的單字、❌ 答錯的單字)」。無紀錄日不退化為突兀空盒，而是呈現清爽 0 字與清楚狀態說明；點擊任何熱力圖方塊時，標題日期（如 1012、1013）、成績與單字皆即時且同步切換。
    - **固定方塊高度**：桌面與平板視窗全面鎖定 `height: 340px; min-height: 340px; max-height: 340px;`，有紀錄或無紀錄高度完全相同，零跳動零位移；當螢幕變窄時（`<= 640px`）依響應式設定轉為 `height: auto` 與單欄直排，按設定自然調整。
    - **熱力圖無紀錄日期徽章高對比（絕不變淡）**：`.tier-gray` 徽章文字改為高對比亮白（深色 `#F8FAFC` / `#FFFFFF`，淺色 `#1E293B` / `#0F172A`），點選任何無紀錄日期時日期字體永遠清晰銳利，絕不暗淡灰化。
  - 「🎯 快速跳至有紀錄日期」原生下拉選單：徹底排查修復閃退消失 Bug（成因為鎖定狀態下 `ensureLockdownVisuals()` 每 1 秒輪詢誤調用 `window.refreshChrome()`，導致 `renderSummary()` 每秒重複抹除重建 DOM，使原生下拉選單瞬間被銷毀閃退；現已移除每秒輪詢調用並加入鎖定防護，選單完美穩定不縮回）。
  - 「⏰ 今日練習時間已結束」鎖定提示卡片：採用柔和徽章、自然微陰影與天藍膠囊標籤，介面易讀易懂且在淺色/深色模式下均溫和無突兀感。
  - **登入視窗方塊均勻間距與兩階段狀態方塊設計**：
    - **全方塊等距對齊**：學號輸入框、密碼輸入框、確認登入按鈕、登入狀態方塊、時段提醒框與學習歷程提醒框統一由 `.login-box-group` 容器以 `gap: 12px` 嚴格等距排列，徹底消除原本 12px/20px/14px/10px 混亂間距。
    - **登入狀態方塊保留位置與兩階段顯眼色彩**：
      - **第一階段（載入資料）**：顯眼橘黃色（淺色高對比金琥珀 `#FEF3C7` / `#92400E`、深色金黃光澤 `rgba(245,158,11,0.24)` / `#FDE047`）。
      - **第二階段（載入遊戲）**：精準套用 100% 答對率熱力圖專屬榮耀綠（淺色深翠綠 `#15803D` 白字綠微光、深色翡翠綠光澤 `rgba(34,197,94,0.45)` 白字高光微光框），兩階段轉場自然流暢且兩模式下均強烈醒目。

## 3. 雲端備份與自動化同步機制
* **Google Drive 專屬備份庫**：資料夾 `【AI對話與開發歷程備份庫】`
* **最新對話全紀錄**：`最新對話歷程備份_LATEST.md` (已由 GAS API 直連並定時上傳)
* **Windows 定時自動排程**：
  - `AutoBackupChat_0330`：每天 03:30 背景靜音自動上傳
  - `AutoBackupChat_1500`：每天 15:00 背景靜音自動上傳
  - `Startup/AutoDownloadChat.vbs`：開機登入自動下載最新對話備份
* **桌面控制面板**：`C:\Users\pmpu4\Desktop\0906\雙向同步GoogleDrive對話備份.bat`

## 4. 自主執行規範 (Autonomous Execution Guidelines)
* 秉持「直接執行、無須確認、完整修正、自動同步、簡明回報」原則。
* 心法口訣：規格內部定靶、檔案拆小補丁、機械交給腳本、複雜才動大腦、最小 AI Token 消耗。
