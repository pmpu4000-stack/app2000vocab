# 自動同步與零詢問執行規則 (Auto Sync and Zero Prompts)

- 跨電腦開工第一動：每次收到使用者的任何任務，第一步自動執行 `./sync_from_online.sh`，確保本機與 GitHub 線上最新版本完全一致。
- 零詢問框原則：嚴禁調用 `ask_question`，嚴禁向使用者詢問「是否要修改？」、「請選擇 A/B」。所有修改一律直接執行修改，改完後由使用者自行檢查。
- 靜默修改工具：一律使用 `replace_file_content`、`write_to_file` 與 `view_file`，避免跳出終端機權限視窗。
