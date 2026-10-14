# 國中 2000 單字學習與學生歷程管理系統 — 本機修改與備份指南

本資料夾已完整備份與同步此專案之所有核心檔案，包含：
1. **學生端練習網頁 (GitHub Pages)**
2. **教師後台管理系統與 API (Google Apps Script)**
3. **雲端試算表資料庫 (Google Sheets)** 連動邏輯

> [!IMPORTANT]
> ### 🛡️ 跨電腦修改最高鐵律：永遠先以「線上最新版本」為主！
> 若您在不同電腦（例如學校電腦、家中筆電、辦公室桌機）登入修改此專案，**在開始修改任何程式碼之前，請務必先同步線上最新資料**，防止在舊資料上編輯導致線上網頁被覆寫或資料亂掉！
> 
> **每次在任何電腦開工前的第 1 動：**
> 在終端機執行本資料夾的同步腳本：
> ```bash
> cd ~/Desktop/app2000vocab
> ./sync_from_online.sh
> ```
> 該腳本會自動執行 `git pull --rebase`，抓取線上最新提交，並自動同步 GAS 相關檔案。

---

## 📌 系統各元件與網址對照表

| 元件名稱 | 網址 / 連結 | 負責用途 | 對應本機檔案路徑 |
| :--- | :--- | :--- | :--- |
| **學生學習與測驗網頁** | [GitHub Pages 線上網站](https://pmpu4000-stack.github.io/app2000vocab/) | 學生登入、背單字、拼字測驗、歷程上傳 | `index.html`、`src/`、`css/`、`data/` |
| **教師歷程查詢系統** | [Google Apps Script Web App](https://script.google.com/macros/s/AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9/exec) | 老師查詢全班學習進度、指派單字、統計分析 | `google_apps_script/Index.html` (或 `teacher_history.html`) |
| **後端 API 與 GAS 專案** | [Apps Script 程式碼編輯器](https://script.google.com/u/0/home/projects/1Y69AjfZvh__eyEr6fEjrl-DADDJ5KRn13yRehlWi2EGUZhO_qUQN6KcT/edit) | 後端邏輯、試算表讀寫、驗證權限、防護牆 (WAF) | `google_apps_script/Code.gs` (或 `code.gs`) |
| **核心資料庫試算表** | [Google Sheets 雲端試算表](https://docs.google.com/spreadsheets/d/1qacVs_pguoYbekxtyBOtqUJYmyi1O7pOA7lJMRFFwpE/edit?gid=0#gid=0) | 儲存學生帳號密碼、各學生作答歷程、任務派發資料 | 雲端即時儲存（由 Code.gs 操作） |
| **GitHub 專案原始碼** | [GitHub Repository](https://github.com/pmpu4000-stack/app2000vocab) | 原始碼版本控管與 GitHub Pages 自動部署來源 | 整個專案資料夾 (含 `.git`) |

---

## 📂 資料夾結構說明

```text
app2000vocab/
├── index.html                 # 學生端單字學習與測驗主畫面
├── css/
│   └── styles.css             # 學生端樣式表與主題設定
├── src/                       # 學生端 JavaScript 模組
│   ├── app.js                 # 核心控制流程 (測驗/練習/闖關)
│   ├── store.js               # 狀態管理、localStorage 與雲端上傳
│   ├── ui.js                  # 介面繪製與互動
│   ├── audio.js               # 發音語音合成控制
│   ├── data.js                # 特色單字庫
│   ├── levels.js              # 等級分級規則與題目生成
│   ├── srs.js                 # 間隔重複演算法 (Leitner)
│   └── wordbank.js            # 載入 2000 單字庫
├── data/
│   ├── words2000.json         # 2000 單字核心字庫 (單字/陷阱字/難度等級)
│   └── meanings.json          # 繁體中文釋義、KK音標、生活情境例句
├── google_apps_script/        # 【Google Apps Script 後端與教師端專區】
│   ├── Code.gs                # GAS 後端 API 程式碼 (複製貼回 GAS 編輯器)
│   └── Index.html             # GAS 教師後台介面 (複製貼回 GAS 編輯器)
├── teacher_history.html       # 教師後台介面原始檔案 (同 Index.html)
├── code.gs                    # GAS 後端原始檔案 (同 Code.gs)
├── scripts/                   # 資料擴充與維護輔助腳本
├── 國中2000單字.md             # 教育部 2000 單字字表
├── 拼字訓練計畫.md             # 教學規劃與自然發音教學計畫
├── sync_from_online.sh        # 【重要】開工前一鍵自 GitHub 同步最新版本腳本
├── push_to_github.sh          # 一鍵提交並推送到 GitHub 工具腳本 (內建防覆寫檢查)
├── create_backup.sh           # 本機快速產生時間戳記備份包腳本
└── README_修改與上傳指南.md    # 本使用與修改指南
```

---

## 🛠️ 修改與上傳作業流程

### 情境一：修改「學生端測驗網頁」（上傳到 GitHub Pages）

1. **在本機修改程式碼**：
   - 介面與功能：修改 `index.html` 或 `src/` 模組。
   - 單字內容：修改 `data/words2000.json` 或 `data/meanings.json`。
   - 樣式外觀：修改 `css/styles.css`。
2. **本機預覽測試（選用）**：
   在終端機本資料夾下執行：
   ```bash
   python3 -m http.server 8000
   ```
   瀏覽器開啟 `http://localhost:8000/` 即可即時預覽。
3. **上傳更新至 GitHub Pages**：
   在終端機執行：
   ```bash
   git add .
   git commit -m "更新說明 (例如: 優化測驗介面)"
   git push origin main
   ```
   *(或直接執行 `./push_to_github.sh`)*
4. **驗證線上網站**：
   等待約 1~2 分鐘，重新整理 [GitHub Pages 網站](https://pmpu4000-stack.github.io/app2000vocab/) 即可看到更新。

---

### 情境二：修改「Google Apps Script 後端」或「教師查詢系統」

1. **在本機修改檔案**：
   - 若修改後端 API 邏輯、試算表欄位、WAF 防火牆、權限判斷：
     👉 修改 `google_apps_script/Code.gs`（同時會自動同步到 `code.gs`）。
   - 若修改教師查詢歷程圖表、儀表板、學生數據報表：
     👉 修改 `google_apps_script/Index.html`（同時會自動同步到 `teacher_history.html`）。
2. **更新至 Google Apps Script 雲端**：
   1. 開啟 [Apps Script 編輯器](https://script.google.com/u/0/home/projects/1Y69AjfZvh__eyEr6fEjrl-DADDJ5KRn13yRehlWi2EGUZhO_qUQN6KcT/edit)。
   2. 將本機 `Code.gs` 的內容全文複製，貼到 GAS 專案左側的 `Code.gs` 並儲存 (Ctrl+S / Cmd+S)。
   3. 將本機 `Index.html` 的內容全文複製，貼到 GAS 專案左側的 `Index.html` 並儲存。
3. **部署新版本 Web 應用程式**：
   1. 點擊右上角 **「部署 (Deploy)」** ➔ **「管理部署作業 (Manage deployments)」**。
   2. 點擊右上角的鉛筆圖示（編輯）。
   3. 在「版本 (Version)」下拉選單選擇 **「新版本 (New version)」**。
   4. 點擊 **「部署 (Deploy)」**。
   *(※ 重要：一定要選擇「新版本」，前端與使用者訪問才會生效！)*
4. **驗證 Web App**：
   開啟 [Web App 網址](https://script.google.com/macros/s/AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9/exec) 檢查。
5. **備份至 Git 倉庫**：
   同樣執行 `git add . && git commit -m "更新 GAS 程式碼" && git push` 將最新代碼保存於 GitHub。

---

## 💾 本機資料備份方式

1. **Git 完整歷史備份**：
   本資料夾內已包含完整的 `.git` 版本控制庫與所有 169+ 次提交紀錄。
2. **快速建立時間戳記壓縮備份**：
   在終端機中執行：
   ```bash
   ./create_backup.sh
   ```
   將會在 `backups/` 目錄下自動產生如 `backup_app2000vocab_20261014_xxxxxx.tar.gz` 之離線完整備份封裝。
