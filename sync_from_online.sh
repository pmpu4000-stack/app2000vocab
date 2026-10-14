#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

echo "========================================================"
echo "  🔄 正在檢查並同步線上 (GitHub) 最新版本至本機..."
echo "========================================================"

# 檢查是否有未提交的修改
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "⚠️ 偵測到本機有尚未提交的修改："
  git status --short
  echo "--------------------------------------------------------"
  echo "💡 為確保不覆蓋或遺失本機修改，正暫存目前變更 (git stash)..."
  git stash push -m "Auto-stashed before sync at $(date '+%Y-%m-%d %H:%M:%S')"
  STASHED=1
fi

echo "==> 從遠端 (origin main) 擷取最新資料..."
git fetch origin main

echo "==> 套用線上最新版本..."
git pull --rebase origin main

# 如果剛剛有暫存，還原暫存
if [ "$STASHED" = "1" ]; then
  echo "==> 還原剛剛暫存的本機修改..."
  git stash pop || echo "⚠️ 暫存還原時發生衝突，請手動確認衝突標記。"
fi

# 同步 google_apps_script 檔案
if [ -f "code.gs" ]; then
  mkdir -p "google_apps_script"
  cp "code.gs" "google_apps_script/Code.gs"
fi
if [ -f "teacher_history.html" ]; then
  mkdir -p "google_apps_script"
  cp "teacher_history.html" "google_apps_script/Index.html"
fi

echo ""
echo "========================================================"
echo "  ✅ 本機資料已完全更新至線上最新版本！"
echo "========================================================"
echo "最新線上版本資訊："
git log -1 --format="commit: %h%n日期:   %cd%n說明:   %s" --date=format:"%Y-%m-%d %H:%M:%S"
echo "========================================================"
