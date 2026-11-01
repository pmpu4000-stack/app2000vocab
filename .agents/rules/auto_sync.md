# 自動同步與極致省 Token 執行規則

- **開工同步**：收到修改任務時，與首個檢視指令合併執行 `git pull --rebase origin main | Out-Null`（純問答免跑）。
- **零詢問**：嚴禁呼叫 `ask_question` 或詢問確認；直接修改，改完回報嚴格限一行。
- **鏡像同步**：`google_apps_script/Index.html` 與根目錄 `teacher_history.html` 為雙胞胎鏡像，修改其一必用 `Copy-Item -Force` 覆蓋另一份。
- **收尾同步**：合併單一指令執行 `git add . ; git commit -m "..." ; git push origin main | Out-Null`；若涉及 GAS 則加跑 `clasp.cmd push -f | Out-Null`。
- **極度靜音**：指令輸出全面靜音，驗證僅用 `git diff --stat`。
