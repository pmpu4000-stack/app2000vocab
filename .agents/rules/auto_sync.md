# 自動同步與部署執行規範

## 鏡像架構
| 唯一真相來源 | 鏡像目標 | 備註 |
|---|---|---|
| `index.html` | `google_apps_script/Index.html` | GAS 部署主檔 |
| `google_apps_script/Index.html` | `teacher_history.html` | 根目錄鏡像 |
| `google_apps_script/Index.html` | `google_apps_script/teacher_history.html` | GAS 鏡像 |
| `src/teacher_portal.js` | `google_apps_script/TeacherJs.html` | `<script>\n內容\n</script>` 包裹 |

## 【關鍵】編碼陷阱
- **嚴禁** 使用 `Copy-Item` 或 `Set-Content` 複製含 CJK 的 HTML/JS 檔案。
- Windows PowerShell `Copy-Item` 預設以 ANSI/cp950 讀寫，CJK 字符全部變成 `?`（0x3F），
  造成 GAS 上線版本顯示亂碼而 git diff 也無法輕易察覺。
- **唯一正確做法**：用 `node` 讀寫，自動保證 UTF-8：
  ```js
  fs.writeFileSync(dest, fs.readFileSync(src, 'utf8'), 'utf8');
  ```

## 標準部署流程
每次修改後執行（不可跳步）：
```powershell
.\deploy.ps1 "commit message"
```
`deploy.ps1` 自動完成：
1. node 重建 `TeacherJs.html`（UTF-8）
2. node 同步三個鏡像（UTF-8）
3. `clasp push -f`（從 google_apps_script/ 目錄執行）
4. `git add -A` → `git commit` → `git push`

## 收尾規範
- `git add` **不加** `-q`（該版 git 不支援此旗標）
- git commit/push 加 `-q`
- 所有 node/clasp 操作加 `| Out-Null`
