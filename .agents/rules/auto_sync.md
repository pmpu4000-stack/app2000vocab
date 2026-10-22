# 自動同步與零詢問執行規則 (Auto Sync and Zero Prompts)

- 開工第一動：在 repo 根目錄執行 `git pull --rebase`，確保與 GitHub 一致（repo 內沒有 `sync_from_online.sh`，勿嘗試執行）。
- 零詢問：不使用 `ask_question`、不詢問「是否要修改？」或列 A/B 選項；直接修改，改完簡明回報。
- 編輯工具：使用 `read_file`、`edit_file`、`write_file`；終端機只用於 git / clasp / Select-String。
- 收尾：`git add` → `git commit` → `git push`；若修改 `google_apps_script/`，另執行 `clasp.cmd push`。
