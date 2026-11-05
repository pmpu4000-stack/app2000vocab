# deploy.ps1 — 標準部署腳本
# 用法: .\deploy.ps1 "commit message"
# ─────────────────────────────────────────────────────
# 【根本問題】Windows Copy-Item 預設以系統 ANSI/cp950 讀寫，
#            導致 CJK 字符在 GAS/Index.html 中全部變成 ? (3f)。
#            解法：全程改用 node 讀寫，確保 UTF-8 編碼一致。
# ─────────────────────────────────────────────────────

param([string]$msg = "deploy: update")

$root = $PSScriptRoot

node -e "
const fs = require('fs');
const root = '$($root -replace '\\\\','\\\\\\\\')';

// 1. 重建 TeacherJs.html（src/teacher_portal.js → GAS 內嵌格式，UTF-8）
const tpSrc = fs.readFileSync(root + '/src/teacher_portal.js', 'utf8');
fs.writeFileSync(root + '/google_apps_script/TeacherJs.html', '<script>\n' + tpSrc + '\n</script>', 'utf8');

// 2. 以 UTF-8 同步鏡像（index.html → GAS/Index.html → 所有鏡像）
const idx = fs.readFileSync(root + '/index.html', 'utf8');
fs.writeFileSync(root + '/google_apps_script/Index.html', idx, 'utf8');
fs.writeFileSync(root + '/teacher_history.html', idx, 'utf8');
fs.writeFileSync(root + '/google_apps_script/teacher_history.html', idx, 'utf8');

console.log('Files synced (UTF-8).');
"

# 3. GAS 推送
Push-Location "$root\google_apps_script"
cmd /c "clasp push -f" | Out-Null
Pop-Location

# 4. Git
git -C $root add -A
git -C $root commit -q -m $msg
git -C $root push -q
