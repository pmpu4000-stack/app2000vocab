const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = __dirname;
const gasDir = path.join(rootDir, 'google_apps_script');
const DEPLOYMENT_ID = "AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9";

console.log("==========================================");
console.log("👀 GAS 即時監聽與自動部署服務已啟動");
console.log("監聽目標: teacher_history.html, google_apps_script/*");
console.log("當修改完檔案後，將自動推送更新並部署！");
console.log("（按 Ctrl + C 可結束監聽）");
console.log("==========================================");

let debounceTimer = null;
let isDeploying = false;

function deploy() {
  if (isDeploying) return;
  isDeploying = true;
  const now = new Date().toLocaleString('zh-TW', { hour12: false });
  console.log(`\n[${now}] 偵測到檔案變動，自動執行推送與部署...`);

  try {
    const srcTeacher = path.join(rootDir, 'teacher_history.html');
    const destIndex = path.join(gasDir, 'Index.html');
    if (fs.existsSync(srcTeacher)) {
      fs.copyFileSync(srcTeacher, destIndex);
      console.log("==> 已同步 teacher_history.html -> Index.html");
    }

    console.log("==> 執行 clasp push -f...");
    execSync('clasp push -f', { cwd: rootDir, stdio: 'inherit' });

    console.log(`==> 執行 clasp deploy (ID: ${DEPLOYMENT_ID})...`);
    try {
      execSync(`clasp deploy -i "${DEPLOYMENT_ID}" -d "Auto deploy ${now}"`, { cwd: rootDir, stdio: 'inherit' });
    } catch (_) {
      execSync(`clasp deploy -d "Auto deploy ${now}"`, { cwd: rootDir, stdio: 'inherit' });
    }

    console.log(`✅ [${new Date().toLocaleString('zh-TW', { hour12: false })}] 部署完成！網頁已即時更新。`);
  } catch (err) {
    console.error(`❌ 自動部署失敗:`, err.message);
  } finally {
    isDeploying = false;
  }
}

function triggerDeploy() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    deploy();
  }, 1200);
}

// 監聽 teacher_history.html
const teacherPath = path.join(rootDir, 'teacher_history.html');
if (fs.existsSync(teacherPath)) {
  fs.watch(teacherPath, (eventType) => {
    if (eventType === 'change') triggerDeploy();
  });
}

// 監聽 google_apps_script 目錄
if (fs.existsSync(gasDir)) {
  fs.watch(gasDir, (eventType, filename) => {
    if (filename && !filename.startsWith('.')) {
      triggerDeploy();
    }
  });
}
