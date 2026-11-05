# deploy.ps1 — 標準部署腳本，每次部署必跑
# 1. 重建 TeacherJs.html（src/teacher_portal.js → GAS 內嵌格式）
$src = Get-Content "src\teacher_portal.js" -Raw -Encoding UTF8
"<script>`n$src`n</script>" | Set-Content "google_apps_script\TeacherJs.html" -Encoding UTF8 -NoNewline

# 2. 同步鏡像
Copy-Item "index.html"                       "google_apps_script\Index.html"      -Force
Copy-Item "google_apps_script\Index.html"    "teacher_history.html"               -Force
Copy-Item "google_apps_script\Index.html"    "google_apps_script\teacher_history.html" -Force

# 3. GAS 推送
Push-Location "google_apps_script"
cmd /c "clasp push -f" | Out-Null
Pop-Location

# 4. Git
git add -A | Out-Null
git commit -q -m $args[0]
git push -q
