# 2000 單字學習系統 (app2000vocab) 專案狀態快照

## 1. 核心環境與目錄
* **主開發目錄**：`C:\Users\pmpu4\.gemini\antigravity\scratch\app2000vocab`
* **備份倉庫**：`C:\Users\pmpu4\.gemini\antigravity\scratch\app2000vocab-repo`
* **部署作業目錄**：`C:\Users\pmpu4\Desktop\0906`
* **GitHub 遠端**：`https://github.com/pmpu4000-stack/app2000vocab.git` (main 分支)
* **GAS 部署版本**：**Version 209** (Deployment ID: `AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9`)

## 2. 資料庫架構 (Google Sheet 30 欄架構)
* **學生工作表**：每位學生獨立分頁 (如 `d`)，具備完整 30 欄分離架構：
  - Col 1~21：基礎備份時間、JSON、等級、累積總受測/答對 (加總區域)
  - Col 22~26：【指定單字測驗專屬欄位】(任務名稱、成績、正確率、狀態、錯題單字)
  - Col 27~30：【自由練習專屬欄位】(自由受測字數、自由答對字數、正確率、自由練習錯題單字)
* **零幽靈數值保證**：指定測驗與自由練習數值各自獨立，查詢日期區塊之上則呈現全域累計加總。
* **曾對後錯標記**：當日曾答對但後續作答又答錯的單字，前端顯示橘色虛線 `(曾對後錯⚠️)`；訂正成功顯示 `(已訂正)`。

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
