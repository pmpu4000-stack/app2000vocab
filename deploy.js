const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = __dirname;
const commitMsg = process.argv[2] || "deploy: auto update";

console.log("== [1/4] Syncing TeacherJs.html from src/teacher_portal.js ==");
const tpSrc = fs.readFileSync(path.join(root, 'src', 'teacher_portal.js'), 'utf8');
fs.writeFileSync(path.join(root, 'google_apps_script', 'TeacherJs.html'), '<script>\n' + tpSrc + '\n</script>', 'utf8');

console.log("== [2/4] Syncing index.html to GAS and mirrors ==");
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
fs.writeFileSync(path.join(root, 'google_apps_script', 'Index.html'), idx, 'utf8');
fs.writeFileSync(path.join(root, 'teacher_history.html'), idx, 'utf8');
fs.writeFileSync(path.join(root, 'google_apps_script', 'teacher_history.html'), idx, 'utf8');

console.log("== [3/4] Pushing to Google Apps Script (clasp) ==");
try {
  execSync('cmd /c "clasp push -f"', { cwd: path.join(root, 'google_apps_script'), stdio: 'inherit' });
} catch (e) {
  console.error("Clasp push error:", e.message);
}

console.log("== [4/4] Committing and pushing to Git ==");
try {
  execSync('git add -A', { cwd: root, stdio: 'inherit' });
  execSync(`git commit -q -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: root, stdio: 'inherit' });
  execSync('git push -q', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.error("Git error:", e.message);
}

console.log("== Deployment complete! ==");
