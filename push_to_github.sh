#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

echo "========================================================"
echo "  🚀 準備推送修改至線上倉庫 (GitHub Pages)"
echo "========================================================"

# 確保同步 code.gs 與 google_apps_script (以較新檔案為準)
if [ -f "google_apps_script/Code.gs" ] && [ "google_apps_script/Code.gs" -nt "code.gs" ]; then
  cp "google_apps_script/Code.gs" "code.gs"
elif [ -f "code.gs" ]; then
  cp "code.gs" "google_apps_script/Code.gs"
fi

if [ -f "teacher_history.html" ] && [ "teacher_history.html" -nt "google_apps_script/Index.html" ]; then
  cp "teacher_history.html" "google_apps_script/Index.html"
elif [ -f "google_apps_script/Index.html" ]; then
  cp "google_apps_script/Index.html" "teacher_history.html"
fi

MSG="$1"
if [ -z "$MSG" ]; then
  echo "請輸入本次更新說明 (Commit Message):"
  read -r MSG
fi

if [ -z "$MSG" ]; then
  MSG="Update project files: $(date '+%Y-%m-%d %H:%M:%S')"
fi

echo "==> 加入所有變更至 Git..."
git add .

echo "==> 建立 Commit: $MSG"
git commit -m "$MSG" || echo "沒有檢測到未提交的檔案變動。"

echo "==> 🛡️ 關鍵防護：先同步線上遠端最新提交 (Pull --rebase)，防止覆寫他台電腦修改..."
git pull --rebase origin main

echo "==> 推送至 GitHub (main 分支)..."
git push origin main

# 若有設定 GAS 憑證，自動同步推送並部署 Google Apps Script
if [ -f "$HOME/.clasprc.json" ]; then
  echo ""
  echo "==> 🚀 自動推送與部署 Google Apps Script..."
  ./deploy_gas.sh || echo "⚠️ GAS 自動部署未完成，可稍後手動執行 ./deploy_gas.sh"
fi

echo ""
echo "========================================================"
echo "  🎉 推送成功！GitHub Pages 將在 1~2 分鐘內自動更新上線。"
echo "========================================================"
