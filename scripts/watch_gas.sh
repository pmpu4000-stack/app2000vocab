#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "$DIR"

export PATH="$HOME/.local/node/bin:/Users/ericlin/.gemini/antigravity/bin:$PATH"

if [ ! -f "$HOME/.clasprc.json" ]; then
  echo "⚠️ 尚未偵測到 Google 帳號授權憑證。"
  echo "==> 請先完成一次登入授權..."
  clasp login
fi

node watch_gas.js
