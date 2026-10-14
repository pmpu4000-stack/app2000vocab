#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

BACKUP_DIR="$DIR/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_NAME="backup_app2000vocab_${TIMESTAMP}.tar.gz"

echo "==> 正在建立本地備份封裝: $BACKUP_NAME"
tar --no-xattrs --exclude="./backups" --exclude="./.git" -czf "$BACKUP_DIR/$BACKUP_NAME" .

echo "==> 備份成功完成！"
echo "==> 檔案位置: $BACKUP_DIR/$BACKUP_NAME"
ls -lh "$BACKUP_DIR/$BACKUP_NAME"
