# 自動同步與極致省 Token 執行規則

- **開工同步**：收到修改任務時，與首個檢視指令合併執行 `git pull --rebase origin main`（純問答免跑）。
- **零詢問**：嚴禁呼叫 `ask_question` 或詢問確認；直接修改，改完簡明回報（原因、修正內容、部署提示）。
- **鏡像同步**：`google_apps_script/Index.html` 與根目錄 `teacher_history.html` 為雙胞胎鏡像，修改其一必用 `Copy-Item` 同步另一份。
- **收尾同步**：合併單一指令執行 `git add . ; git commit -m "..." ; git push origin main`；若涉及 GAS 則加跑 `clasp.cmd push -f`。
