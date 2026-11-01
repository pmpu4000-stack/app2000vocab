# 自動同步與深度省 Token 執行規則
- **開工**：`git pull -q --rebase origin main | Out-Null`（純問答免跑）。
- **零詢問**：禁問確認，直接改，回報嚴格限一行。
- **鏡像**：改 `google_apps_script/Index.html` 必自動執行 `Copy-Item -Force google_apps_script\Index.html teacher_history.html | Out-Null`。
- **收尾**：`git add . ; git commit -q -m "..." ; git push -q origin main | Out-Null ; clasp.cmd push -f | Out-Null`。
- **輸出全零化**：全面關閉終端輸出，避免指令日誌耗損 Token。
