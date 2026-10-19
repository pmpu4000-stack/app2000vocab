#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "$DIR"

# 確保 node 與 clasp 在 PATH 中
export PATH="$HOME/.local/node/bin:/Users/ericlin/.gemini/antigravity/bin:$PATH"

echo "=========================================="
echo "🚀 Google Apps Script 自動推送與部署工具"
echo "=========================================="

# 1. 檢查並同步 teacher_history.html 到 google_apps_script/Index.html
if [ -f "teacher_history.html" ]; then
  echo "==> 同步最新 teacher_history.html 至 google_apps_script/Index.html..."
  cp teacher_history.html google_apps_script/Index.html
fi

# 2. 檢查 Google 授權憑證 (~/.clasprc.json)
if [ ! -f "$HOME/.clasprc.json" ]; then
  echo "⚠️ 尚未偵測到 Google 帳號授權憑證。"
  echo "==> 正在啟動 Google 帳號登入授權（請在跳出的瀏覽器視窗中登入並允許存取）..."
  echo "提示：請確保您的 Google 帳號已在 https://script.google.com/home/usersettings 開啟「Google Apps Script API」"
  clasp login
fi

# 3. 推送最新程式碼至 GAS 專案 (@HEAD)
echo "==> 正在推送最新程式碼至 Google Apps Script 專案..."
clasp push -f

# 4. 自動部署 Web App
DEPLOYMENT_ID="AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9"
NOW_TS=$(date '+%Y-%m-%d %H:%M:%S')

echo "==> 正在更新 Web App 部署 (Deployment ID: $DEPLOYMENT_ID)..."
if clasp deploy -i "$DEPLOYMENT_ID" -d "Auto deploy $NOW_TS" 2>/dev/null; then
  echo "✅ 既有部署更新成功！"
else
  echo "==> 建立新版本部署..."
  clasp deploy -d "Auto deploy $NOW_TS"
fi

echo "=========================================="
echo "🎉 部署完成！"
echo "🔗 線上網址: https://script.google.com/macros/s/$DEPLOYMENT_ID/exec"
echo "=========================================="
