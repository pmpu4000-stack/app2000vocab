# deploy.ps1 — 標準部署腳本
# 用法: .\deploy.ps1 "commit message"
# ─────────────────────────────────────────────────────
# 【根本問題】Windows Copy-Item 預設以系統 ANSI/cp950 讀寫，
#            導致 CJK 字符在 GAS/Index.html 中全部變成 ? (3f)。
#            解法：全程改用 node 讀寫，確保 UTF-8 編碼一致。
# ─────────────────────────────────────────────────────

param([string]$msg = "deploy: update")
$root = $PSScriptRoot
node "$root\deploy.js" "$msg"
